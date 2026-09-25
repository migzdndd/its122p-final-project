<?php
/**
 * Database connection (PDO / MySQL).
 *
 * Reads credentials from environment variables or a local .env file.
 */

function load_local_env(string $path): void
{
    if (!file_exists($path) || !is_readable($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) return;
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (strpos($line, '=') !== false) {
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val, " \t\n\r\0\x0B\"'");
            if (!array_key_exists($key, $_ENV) && !array_key_exists($key, $_SERVER) && getenv($key) === false) {
                putenv("{$key}={$val}");
                $_ENV[$key] = $val;
                $_SERVER[$key] = $val;
            }
        }
    }
}

load_local_env(__DIR__ . '/../.env');
load_local_env(dirname(__DIR__, 2) . '/.env');

function get_env_or(string $key, string $default): string
{
    $val = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
    return ($val === false || $val === null || $val === '') ? $default : (string) $val;
}

$dbHost = get_env_or('DB_HOST', '127.0.0.1');
$dbPort = get_env_or('DB_PORT', '3306');
$dbName = get_env_or('DB_NAME', 'book_marketplace');
$dbUser = get_env_or('DB_USER', 'root');
$dbPass = get_env_or('DB_PASS', '');

$dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";

try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 5,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error'   => 'Database connection failed',
        'details' => $e->getMessage(),
    ]);
    exit;
}

