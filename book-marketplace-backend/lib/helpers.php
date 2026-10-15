<?php
/**
 * Small shared helpers used by the API endpoints.
 */

/** The decoded JSON request body (read once, cached). Rejects non-objects. */
function request_body(): array
{
    static $body = null;
    if ($body !== null) return $body;
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return $body = [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        Response::error('Request body must be a JSON object.', 400);
    }
    return $body = $decoded;
}

/** Set APP_DEBUG=1 in the environment to include database error details in replies. */
function api_debug(): bool
{
    return getenv('APP_DEBUG') === '1';
}

/** Turns a database exception into a safe JSON error (details only in debug mode). */
function database_error_response(PDOException $e): void
{
    $code = (int) ($e->errorInfo[1] ?? 0);
    $extra = api_debug() ? ['details' => $e->getMessage()] : [];
    error_log('[librowse] ' . $e->getMessage());
    if ($code === 1062) {
        Response::error('A record with these values already exists.', 409, $extra);
    }
    if (in_array($code, [1451, 1452], true)) {
        Response::error('This change refers to a record that does not exist or is still in use.', 409, $extra);
    }
    Response::error('Something went wrong while saving. Please try again.', 500, $extra);
}

function is_staff_or_admin(array $user): bool
{
    return in_array($user['role'], ['Staff', 'Admin'], true);
}

/** Current time in the same format MySQL DATETIME uses. */
function now_sql(): string
{
    return gmdate('Y-m-d H:i:s');
}

/** Character count that works even if the mbstring extension is missing. */
function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

/** Ensure the shared activity-log table exists, then write a new row. */
function ensure_activity_logs_table(PDO $pdo): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    try {
        $pdo->query("SELECT 1 FROM `ACTIVITY_LOGS` LIMIT 0");
    } catch (PDOException $e) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `ACTIVITY_LOGS` (
                `activity_id` INT UNSIGNED AUTO_INCREMENT NOT NULL,
                `actor_user_id` INT UNSIGNED DEFAULT NULL,
                `visitor_key` VARCHAR(128) DEFAULT NULL,
                `activity_type` VARCHAR(60) NOT NULL,
                `activity_action` VARCHAR(160) NOT NULL,
                `outcome` ENUM('Success','Failed','Neutral') NOT NULL DEFAULT 'Neutral',
                `reason` TEXT DEFAULT NULL,
                `page_path` VARCHAR(255) DEFAULT NULL,
                `target_type` VARCHAR(60) DEFAULT NULL,
                `target_id` VARCHAR(64) DEFAULT NULL,
                `details` JSON DEFAULT NULL,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`activity_id`),
                INDEX `idx_activity_actor` (`actor_user_id`),
                INDEX `idx_activity_type` (`activity_type`),
                INDEX `idx_activity_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        } catch (PDOException $e2) {
            error_log('[librowse] ' . $e2->getMessage());
        }
    }
}

function record_activity_log(PDO $pdo, array $data): void
{
    $action = (string) ($data['activity_action'] ?? 'Unknown');
    // Password reset operations are confidential and must not be logged.
    if (in_array($action, ['ResetPassword', 'RequestPasswordReset'], true)
        || stripos($action, 'passwordreset') !== false
        || stripos($action, 'resetpassword') !== false) {
        return;
    }

    try {
        ensure_activity_logs_table($pdo);

        $details = $data['details'] ?? null;
        if (is_array($details) || is_object($details)) {
            $details = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } elseif ($details !== null && $details !== '') {
            $details = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } else {
            $details = null;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO `ACTIVITY_LOGS`
                (`actor_user_id`, `visitor_key`, `activity_type`, `activity_action`, `outcome`, `reason`, `page_path`, `target_type`, `target_id`, `details`)
             VALUES
                (:actor_user_id, :visitor_key, :activity_type, :activity_action, :outcome, :reason, :page_path, :target_type, :target_id, :details)'
        );
        $stmt->execute([
            'actor_user_id'   => isset($data['actor_user_id']) && $data['actor_user_id'] !== '' ? (int) $data['actor_user_id'] : null,
            'visitor_key'     => $data['visitor_key'] ?? null,
            'activity_type'   => (string) ($data['activity_type'] ?? 'Activity'),
            'activity_action' => (string) ($data['activity_action'] ?? 'Unknown'),
            'outcome'         => in_array(($data['outcome'] ?? 'Neutral'), ['Success', 'Failed', 'Neutral'], true) ? $data['outcome'] : 'Neutral',
            'reason'          => $data['reason'] ?? null,
            'page_path'       => $data['page_path'] ?? null,
            'target_type'     => $data['target_type'] ?? null,
            'target_id'       => isset($data['target_id']) ? (string) $data['target_id'] : null,
            'details'         => $details,
        ]);
    } catch (PDOException $e) {
        error_log('[librowse] ' . $e->getMessage());
    }
}
