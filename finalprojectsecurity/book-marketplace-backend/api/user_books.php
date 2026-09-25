<?php
/**
 * /api/user_books.php
 * GET (list/show), POST (create), PUT (update), DELETE
 *
 * Public GET allows visitors to browse listings.
 * Mutations enforce ownership checks to prevent IDOR / spoofing.
 */
require_once __DIR__ . '/../lib/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$currentUser = current_authenticated_user($pdo);

$crud = new Crud(
    pdo: $pdo,
    table: 'USER_BOOKS',
    primaryKey: 'inventory_id',
    insertable: ['book_id', 'seller_id', 'listing_type', 'price', 'condition', 'status'],
    required: ['book_id', 'seller_id', 'listing_type', 'condition'],
    enums: [
        'listing_type' => ['For_trade', 'For_sale', 'Both'],
        'condition'    => ['New', 'Good', 'Acceptable'],
        'status'       => ['Available', 'In_transaction', 'Sold', 'Traded', 'Removed'],
    ],
);

$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    switch ($method) {
        case 'GET':
            if ($id !== null) {
                $row = $crud->show($id);
                if (!$row) Response::error("Record with inventory_id = {$id} not found.", 404);
                Response::json($row);
            } else {
                Response::json($crud->index($_GET));
            }
            break;

        case 'POST':
            $user = require_authenticated_user($pdo, ['Customer', 'Admin']);
            $body = read_json_body();
            // Enforce seller ownership for customers
            if ($user['role'] === 'Customer') {
                $body['seller_id'] = (int) $user['user_id'];
                $body['status'] = 'Available';
            }
            $created = $crud->create($body);
            Response::json($created, 201);
            break;

        case 'PUT':
        case 'PATCH':
            $user = require_authenticated_user($pdo);
            if ($id === null) {
                Response::error("Query parameter 'inventory_id' (as ?id=) is required for updates.", 400);
            }
            $listing = $crud->show($id);
            if (!$listing) {
                Response::error("Record with inventory_id = {$id} not found.", 404);
            }

            // Customer can only update their own listings
            if ($user['role'] === 'Customer' && (int) $listing['seller_id'] !== (int) $user['user_id']) {
                Response::error('You are not authorized to modify another user\'s listing.', 403);
            }

            $body = read_json_body();
            // Customers cannot transfer ownership
            if ($user['role'] === 'Customer') {
                unset($body['seller_id']);
            }

            $updated = $crud->update($id, $body);
            Response::json($updated);
            break;

        case 'DELETE':
            $user = require_authenticated_user($pdo);
            if ($id === null) {
                Response::error("Query parameter 'inventory_id' (as ?id=) is required for deletes.", 400);
            }
            $listing = $crud->show($id);
            if (!$listing) {
                Response::error("Record with inventory_id = {$id} not found.", 404);
            }

            if ($user['role'] === 'Customer' && (int) $listing['seller_id'] !== (int) $user['user_id']) {
                Response::error('You are not authorized to delete another user\'s listing.', 403);
            }

            $ok = $crud->delete($id);
            Response::json(['message' => 'Deleted', 'inventory_id' => $id]);
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
