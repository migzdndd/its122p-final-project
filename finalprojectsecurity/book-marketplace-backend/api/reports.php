<?php
/**
 * /api/reports.php
 * GET (list/show), POST (create), PUT (update), DELETE
 *
 * Scopes customer view to their own submitted reports.
 * Enforces submission identity and restricts review/resolution to Staff/Admin.
 */
require_once __DIR__ . '/../lib/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$currentUser = require_authenticated_user($pdo);

$crud = new Crud(
    pdo: $pdo,
    table: 'REPORTS',
    primaryKey: 'report_id',
    insertable: [
        'submitted_by_id', 'reviewed_by_id', 'report_category', 'related_entity_type',
        'form_data', 'status', 'resolution_notes', 'resolved_at',
    ],
    required: ['submitted_by_id', 'report_category', 'related_entity_type'],
    enums: [
        'report_category' => [
            'Verification_Form', 'Seller_Application', 'User_Violation',
            'Listing_Dispute', 'General_Feedback',
        ],
        'related_entity_type' => ['User', 'Book_Listing', 'Transaction', 'None'],
        'status' => ['Pending', 'Under_Review', 'Approved', 'Rejected', 'Resolved', 'Dismissed'],
    ],
);

$id = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    switch ($method) {
        case 'GET':
            if ($id !== null) {
                $row = $crud->show($id);
                if (!$row) Response::error("Record with report_id = {$id} not found.", 404);
                if ($currentUser['role'] === 'Customer' && (int) $row['submitted_by_id'] !== (int) $currentUser['user_id']) {
                    Response::error('You are not authorized to view this report.', 403);
                }
                Response::json($row);
            } else {
                if ($currentUser['role'] === 'Customer') {
                    $stmt = $pdo->prepare('SELECT * FROM `REPORTS` WHERE submitted_by_id = :sid ORDER BY report_id DESC');
                    $stmt->execute(['sid' => (int) $currentUser['user_id']]);
                    Response::json($stmt->fetchAll());
                } else {
                    Response::json($crud->index($_GET));
                }
            }
            break;

        case 'POST':
            $body = read_json_body();
            if ($currentUser['role'] === 'Customer') {
                $body['submitted_by_id'] = (int) $currentUser['user_id'];
                $body['status'] = 'Pending';
                unset($body['reviewed_by_id'], $body['resolution_notes'], $body['resolved_at']);
            }
            $created = $crud->create($body);
            Response::json($created, 201);
            break;

        case 'PUT':
        case 'PATCH':
            require_authenticated_user($pdo, ['Staff', 'Admin']);
            if ($id === null) {
                Response::error("Query parameter 'report_id' (as ?id=) is required for updates.", 400);
            }
            $body = read_json_body();
            if (!isset($body['reviewed_by_id'])) {
                $body['reviewed_by_id'] = (int) $currentUser['user_id'];
            }
            if (isset($body['status']) && in_array($body['status'], ['Approved', 'Rejected', 'Resolved', 'Dismissed'], true) && !isset($body['resolved_at'])) {
                $body['resolved_at'] = date('Y-m-d H:i:s');
            }
            $updated = $crud->update($id, $body);
            if ($updated === null) Response::error("Record with report_id = {$id} not found.", 404);
            Response::json($updated);
            break;

        case 'DELETE':
            require_authenticated_user($pdo, ['Admin']);
            if ($id === null) {
                Response::error("Query parameter 'report_id' (as ?id=) is required for deletes.", 400);
            }
            $ok = $crud->delete($id);
            if (!$ok) Response::error("Record with report_id = {$id} not found.", 404);
            Response::json(['message' => 'Deleted', 'report_id' => $id]);
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
