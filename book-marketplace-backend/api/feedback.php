<?php
/**
 * /api/feedback.php — website feedback from signed-in users.
 *
 *   GET     Lists the signed-in user's own previous feedback (newest first).
 *   POST    Saves new feedback as a REPORTS row of category 'General_Feedback'.
 *           Body (JSON): topic, rating (1-5), comment, recommend (Yes|Maybe|No),
 *                        contact_ok (bool), transaction_id (optional, must be yours)
 *           The older transaction pop-up sends only transaction_id, rating, comment
 *           and still works.
 */
require_once __DIR__ . '/../lib/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$authUser = require_authenticated_user($pdo);
$me = (int) $authUser['user_id'];

const FEEDBACK_TOPICS = [
    'Overall_Experience', 'Browsing_Search', 'Listing_A_Book', 'Transactions',
    'Refunds_Support', 'Website_Design', 'Bug_Report', 'Suggestion', 'Other',
];
const FEEDBACK_RECOMMEND = ['Yes', 'Maybe', 'No'];

/** Trim, drop control characters, and cap the length. */
function feedback_clean(string $value, int $max): string
{
    $value = preg_replace('/[^\P{C}\n\t]/u', '', trim($value)) ?? '';
    return function_exists('mb_substr') ? mb_substr($value, 0, $max) : substr($value, 0, $max);
}

try {
    if ($method === 'GET') {
        $stmt = $pdo->prepare(
            "SELECT report_id, form_data, status, submitted_at
               FROM REPORTS
              WHERE submitted_by_id = :me AND report_category = 'General_Feedback'
              ORDER BY report_id DESC
              LIMIT 20"
        );
        $stmt->execute([':me' => $me]);
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $data = json_decode((string) $row['form_data'], true);
            $data = is_array($data) ? $data : [];
            $rows[] = [
                'report_id'    => (int) $row['report_id'],
                'topic'        => $data['topic'] ?? 'Overall_Experience',
                'rating'       => isset($data['rating']) ? (int) $data['rating'] : null,
                'comment'      => $data['comment'] ?? ($data['details'] ?? ''),
                'status'       => $row['status'],
                'submitted_at' => $row['submitted_at'],
            ];
        }
        Response::json($rows);
        exit;
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
        exit;
    }

    $body = request_body();
    $formData = ['type' => 'website_feedback'];

    // Rating (1-5)
    $hasRating = isset($body['rating']) && $body['rating'] !== '';
    if ($hasRating) {
        $rating = (int) $body['rating'];
        if ($rating < 1 || $rating > 5) {
            Response::error('Rating must be between 1 and 5 stars.', 422);
            exit;
        }
        $formData['rating'] = $rating;
    }

    // Comment
    $comment = feedback_clean((string) ($body['comment'] ?? ''), 1000);
    if ($comment !== '') {
        $formData['comment'] = $comment;
    }
    if (!$hasRating && $comment === '') {
        Response::error('Please give a star rating or write a comment.', 422);
        exit;
    }
    if (isset($body['topic']) && $comment !== '' && text_length($comment) < 10) {
        Response::error('Please write at least 10 characters so we can understand your feedback.', 422);
        exit;
    }

    // Topic
    $topic = (string) ($body['topic'] ?? 'Overall_Experience');
    if (!in_array($topic, FEEDBACK_TOPICS, true)) {
        Response::error('Please choose a valid feedback topic.', 422);
        exit;
    }
    $formData['topic'] = $topic;

    // Would you recommend us?
    if (isset($body['recommend']) && $body['recommend'] !== '') {
        if (!in_array($body['recommend'], FEEDBACK_RECOMMEND, true)) {
            Response::error('Invalid recommendation choice.', 422);
            exit;
        }
        $formData['recommend'] = $body['recommend'];
    }

    $formData['contact_ok'] = !empty($body['contact_ok']);

    // Optional transaction: must belong to the person sending the feedback.
    $relatedType = 'None';
    if (isset($body['transaction_id']) && $body['transaction_id'] !== '' && $body['transaction_id'] !== null) {
        $txId = (int) $body['transaction_id'];
        $own = $pdo->prepare(
            'SELECT 1 FROM TRANSACTIONS t
               LEFT JOIN USER_BOOKS rb ON rb.inventory_id = t.requested_inventory_id
              WHERE t.transaction_id = :tx AND (t.buyer_id = :me OR rb.seller_id = :me2)
              LIMIT 1'
        );
        try {
            $own->execute([':tx' => $txId, ':me' => $me, ':me2' => $me]);
            $isMine = (bool) $own->fetchColumn();
        } catch (PDOException $e) {
            // Fall back to buyer-only check if the seller column is named differently.
            $own = $pdo->prepare('SELECT 1 FROM TRANSACTIONS WHERE transaction_id = :tx AND buyer_id = :me LIMIT 1');
            $own->execute([':tx' => $txId, ':me' => $me]);
            $isMine = (bool) $own->fetchColumn();
        }
        if (!$isMine) {
            Response::error('That transaction is not one of yours.', 403);
            exit;
        }
        $relatedType = 'Transaction';
        $formData['transaction_id'] = $txId;
    }

    $crud = new Crud(
        pdo: $pdo,
        table: 'REPORTS',
        primaryKey: 'report_id',
        insertable: ['submitted_by_id', 'report_category', 'related_entity_type', 'form_data', 'status'],
        required: ['submitted_by_id', 'report_category'],
        enums: [
            'report_category'     => ['Verification_Form', 'Seller_Application', 'User_Violation', 'Listing_Dispute', 'General_Feedback'],
            'related_entity_type' => ['User', 'Book_Listing', 'Transaction', 'None'],
            'status'              => ['Pending', 'Under_Review', 'Approved', 'Rejected', 'Resolved', 'Dismissed'],
        ],
    );

    $created = $crud->create([
        'submitted_by_id'     => $me,
        'report_category'     => 'General_Feedback',
        'related_entity_type' => $relatedType,
        'form_data'           => json_encode($formData, JSON_UNESCAPED_UNICODE),
        'status'              => 'Pending',
    ]);

    Response::json($created, 201);
} catch (InvalidArgumentException $e) {
    Response::error($e->getMessage(), 422);
} catch (PDOException $e) {
    database_error_response($e);
}
