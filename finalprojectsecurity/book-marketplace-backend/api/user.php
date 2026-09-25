<?php
/**
 * /api/user.php
 * GET (list/show), POST (create), PUT (update), DELETE
 *
 * Password hashes are NEVER returned in API responses.
 * Public/Customer users only receive sanitized identifiers (user_id, username).
 */
require_once __DIR__ . '/../lib/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$currentUser = current_authenticated_user($pdo);

$crud = new Crud(
    pdo: $pdo,
    table: 'USER',
    primaryKey: 'user_id',
    insertable: ['username', 'email', 'password_hash', 'role', 'status', 'permission'],
    required: ['username', 'email'],
    enums: [
        'role'   => ['Customer', 'Staff', 'Admin'],
        'status' => ['Active', 'Suspended', 'Banned', 'Pending Verification'],
    ],
    updatable: ['username', 'email', 'password_hash', 'role', 'status', 'permission'],
    hidden: ['password_hash']
);

$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    switch ($method) {
        case 'GET':
            $isStaffOrAdmin = $currentUser && in_array($currentUser['role'], ['Admin', 'Staff'], true);

            if ($id !== null) {
                $user = $crud->show($id);
                if (!$user) {
                    Response::error("Record with user_id = {$id} not found.", 404);
                }
                // Only staff, admin, or the user themselves may view full profile details (email, status, permissions)
                if ($isStaffOrAdmin || ($currentUser && (int) $currentUser['user_id'] === $id)) {
                    Response::json($user);
                } else {
                    Response::json([
                        'user_id' => (int) $user['user_id'],
                        'username' => $user['username']
                    ]);
                }
            } else {
                if ($isStaffOrAdmin) {
                    Response::json($crud->index($_GET));
                } else {
                    // Safe public projection for marketplace seller tags
                    $stmt = $pdo->query('SELECT user_id, username FROM `USER` WHERE status != \'Banned\' ORDER BY user_id ASC');
                    Response::json($stmt->fetchAll());
                }
            }
            break;

        case 'POST':
            require_authenticated_user($pdo, ['Admin']);
            $body = read_json_body();
            $created = $crud->create($body);
            Response::json($created, 201);
            break;

        case 'PUT':
        case 'PATCH':
            $authUser = require_authenticated_user($pdo);
            if ($id === null) {
                Response::error("Query parameter 'user_id' (as ?id=) is required for updates.", 400);
            }
            $targetUser = $crud->show($id);
            if (!$targetUser) {
                Response::error("Record with user_id = {$id} not found.", 404);
            }

            $body = read_json_body();

            if ($authUser['role'] === 'Admin') {
                // Admin has full permissions
                $updated = $crud->update($id, $body);
                Response::json($updated);
            } elseif ($authUser['role'] === 'Staff') {
                // Staff can only update Customer statuses and permissions
                if (($targetUser['role'] ?? '') !== 'Customer') {
                    Response::error('Staff may only manage Customer accounts.', 403);
                }
                $allowedFields = ['status', 'permission'];
                $filtered = array_intersect_key($body, array_flip($allowedFields));
                if (empty($filtered)) {
                    Response::error('No authorized fields provided for update.', 422);
                }
                $updated = $crud->update($id, $filtered);
                Response::json($updated);
            } elseif ($authUser['user_id'] === $id) {
                // Customer updating own profile (cannot change role, status, or permissions)
                $allowedFields = ['username', 'email', 'password'];
                $filtered = array_intersect_key($body, array_flip($allowedFields));
                if (empty($filtered)) {
                    Response::error('No valid fields provided to update.', 422);
                }
                $updated = $crud->update($id, $filtered);
                Response::json($updated);
            } else {
                Response::error('You are not authorized to update this user.', 403);
            }
            break;

        case 'DELETE':
            require_authenticated_user($pdo, ['Admin']);
            if ($id === null) {
                Response::error("Query parameter 'user_id' (as ?id=) is required for deletes.", 400);
            }
            $ok = $crud->delete($id);
            if (!$ok) {
                Response::error("Record with user_id = {$id} not found.", 404);
            }
            Response::json(['message' => 'Deleted', 'user_id' => $id]);
            break;

        default:
            Response::error('Method not allowed.', 405);
    }
} catch (InvalidArgumentException $e) {
    Response::error($e->getMessage(), 422);
} catch (PDOException $e) {
    $code = (int) ($e->errorInfo[1] ?? 0);
    if ($code === 1062) {
        Response::error('A record with these unique values already exists.', 409, ['details' => $e->getMessage()]);
    } elseif (in_array($code, [1451, 1452], true)) {
        Response::error('This operation violates a foreign key relationship.', 409, ['details' => $e->getMessage()]);
    } else {
        Response::error('Database error.', 500, ['details' => $e->getMessage()]);
    }
}
