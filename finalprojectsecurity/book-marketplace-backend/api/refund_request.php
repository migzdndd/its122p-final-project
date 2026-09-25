<?php
/**
 * /api/refund_request.php
 * GET (list/show), POST (create), PUT (update), DELETE
 *
 * Scopes customer view to their own refund requests.
 * Enforces customer ownership on creation and Staff/Admin control on approval.
 */
require_once __DIR__ . '/../lib/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$currentUser = require_authenticated_user($pdo);

$crud = new Crud(
    pdo: $pdo,
    table: 'REFUND_REQUEST',
    primaryKey: 'refund_id',
    insertable: ['transaction_id', 'customer_id', 'processed_by_staff_id', 'reason', 'status'],
    required: ['transaction_id', 'customer_id', 'reason'],
    enums: [
        'status' => ['Pending', 'Approved', 'Rejected'],
    ],
);

$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    switch ($method) {
        case 'GET':
            if ($id !== null) {
                $row = $crud->show($id);
                if (!$row) Response::error("Record with refund_id = {$id} not found.", 404);
                if ($currentUser['role'] === 'Customer' && (int) $row['customer_id'] !== (int) $currentUser['user_id']) {
                    Response::error('You are not authorized to view this refund request.', 403);
                }
                Response::json($row);
            } else {
                if ($currentUser['role'] === 'Customer') {
                    $stmt = $pdo->prepare('SELECT * FROM `REFUND_REQUEST` WHERE customer_id = :cid ORDER BY refund_id DESC');
                    $stmt->execute(['cid' => (int) $currentUser['user_id']]);
                    Response::json($stmt->fetchAll());
                } else {
                    Response::json($crud->index($_GET));
                }
            }
            break;

        case 'POST':
            $body = read_json_body();
            if ($currentUser['role'] === 'Customer') {
                $body['customer_id'] = (int) $currentUser['user_id'];
                $body['status'] = 'Pending';
                unset($body['processed_by_staff_id']);
            }
            $created = $crud->create($body);
            Response::json($created, 201);
            break;

        case 'PUT':
        case 'PATCH':
            require_authenticated_user($pdo, ['Staff', 'Admin']);
            if ($id === null) {
                Response::error("Query parameter 'refund_id' (as ?id=) is required for updates.", 400);
            }
            $body = read_json_body();
            if (!isset($body['processed_by_staff_id'])) {
                $body['processed_by_staff_id'] = (int) $currentUser['user_id'];
            }
            $updated = $crud->update($id, $body);
            if ($updated === null) Response::error("Record with refund_id = {$id} not found.", 404);
            Response::json($updated);
            break;

        case 'DELETE':
            require_authenticated_user($pdo, ['Admin']);
            if ($id === null) {
                Response::error("Query parameter 'refund_id' (as ?id=) is required for deletes.", 400);
            }
            $ok = $crud->delete($id);
            if (!$ok) Response::error("Record with refund_id = {$id} not found.", 404);
            Response::json(['message' => 'Deleted', 'refund_id' => $id]);
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
