<?php
/**
 * /api/transactions.php
 * GET (list/show), POST (create), PUT (update), DELETE
 *
 * Scopes customer view to their own transactions.
 * Enforces buyer integrity on create and role permissions on update.
 */
require_once __DIR__ . '/../lib/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$currentUser = require_authenticated_user($pdo);

$crud = new Crud(
    pdo: $pdo,
    table: 'TRANSACTIONS',
    primaryKey: 'transaction_id',
    insertable: [
        'buyer_id', 'requested_inventory_id', 'offered_inventory_id',
        'managed_by_staff_id', 'transaction_type', 'amount_paid', 'status',
    ],
    required: ['buyer_id', 'requested_inventory_id', 'transaction_type'],
    enums: [
        'transaction_type' => ['Purchase', 'Trade'],
        'status'            => ['Pending', 'Accepted', 'Completed', 'Cancelled', 'Disputed'],
    ],
);

$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    switch ($method) {
        case 'GET':
            if ($id !== null) {
                $row = $crud->show($id);
                if (!$row) Response::error("Record with transaction_id = {$id} not found.", 404);
                // Customers can only view their own transactions
                if ($currentUser['role'] === 'Customer' && (int) $row['buyer_id'] !== (int) $currentUser['user_id']) {
                    Response::error('You are not authorized to view this transaction.', 403);
                }
                Response::json($row);
            } else {
                if ($currentUser['role'] === 'Customer') {
                    // Fetch transactions where the user is buyer or seller
                    $stmt = $pdo->prepare(
                        'SELECT t.* FROM `TRANSACTIONS` t
                         LEFT JOIN `USER_BOOKS` ub ON t.requested_inventory_id = ub.inventory_id
                         WHERE t.buyer_id = :uid OR ub.seller_id = :uid
                         ORDER BY t.transaction_id DESC'
                    );
                    $stmt->execute(['uid' => (int) $currentUser['user_id']]);
                    Response::json($stmt->fetchAll());
                } else {
                    Response::json($crud->index($_GET));
                }
            }
            break;

        case 'POST':
            $body = read_json_body();
            if ($currentUser['role'] === 'Customer') {
                $body['buyer_id'] = (int) $currentUser['user_id'];
                $body['status'] = 'Pending';
                unset($body['managed_by_staff_id']);
            }
            $created = $crud->create($body);
            Response::json($created, 201);
            break;

        case 'PUT':
        case 'PATCH':
            if ($id === null) {
                Response::error("Query parameter 'transaction_id' (as ?id=) is required for updates.", 400);
            }
            $tx = $crud->show($id);
            if (!$tx) {
                Response::error("Record with transaction_id = {$id} not found.", 404);
            }

            $body = read_json_body();

            if ($currentUser['role'] === 'Customer') {
                // Customers may only cancel their own pending transactions
                if ((int) $tx['buyer_id'] !== (int) $currentUser['user_id']) {
                    Response::error('You are not authorized to update this transaction.', 403);
                }
                if ($tx['status'] !== 'Pending') {
                    Response::error('Only pending transactions can be cancelled by the buyer.', 400);
                }
                $allowed = ['status' => 'Cancelled'];
                $updated = $crud->update($id, $allowed);
                Response::json($updated);
            } else {
                // Staff or Admin
                if ($currentUser['role'] === 'Staff' && !isset($body['managed_by_staff_id'])) {
                    $body['managed_by_staff_id'] = (int) $currentUser['user_id'];
                }
                $updated = $crud->update($id, $body);
                Response::json($updated);
            }
            break;

        case 'DELETE':
            require_authenticated_user($pdo, ['Admin']);
            if ($id === null) {
                Response::error("Query parameter 'transaction_id' (as ?id=) is required for deletes.", 400);
            }
            $ok = $crud->delete($id);
            if (!$ok) Response::error("Record with transaction_id = {$id} not found.", 404);
            Response::json(['message' => 'Deleted', 'transaction_id' => $id]);
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
