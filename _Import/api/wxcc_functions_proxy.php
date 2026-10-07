<?php
/**
 * WxCC Functions Proxy
 *
 * Server-side relay for WxCC Function Store API calls that are blocked by CORS
 * when called directly from the browser.
 *
 * Actions:
 *   list   — fetch all functions for an org
 *   detail — fetch a single function + its options (tRPC batch)
 *   save   — update a function (tRPC batch)
 */

require_once '/var/projects/bitbucket.io/cxasteam.bitbucket.io/oauth/check_access.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$action = $input['action'] ?? '';
$orgId  = $input['orgId']  ?? '';
$bearer = $input['bearer'] ?? '';

if (!$action || !$orgId || !$bearer) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing action, orgId, or bearer']);
    exit;
}

// Strip "Bearer " prefix if present
$token = preg_replace('/^Bearer\s+/i', '', trim($bearer));

$headers = [
    'Authorization: Bearer ' . $token,
    'Content-Type: application/json',
    'Accept: application/json',
];

// ── WxCC Function Store: list ────────────────────────────────────────────────
if ($action === 'list') {
    $url = 'https://fn-store.produs1.ciscoccservice.com/fn-store/v1/' . rawurlencode($orgId) . '/functions?size=100&page=0&sortBy=name&status=Draft,Published';
    relay($url, 'GET', $headers);
    exit;
}

// ── WxCC Function Store: detail ──────────────────────────────────────────────
if ($action === 'detail') {
    $id = $input['id'] ?? '';
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing function id']);
        exit;
    }
    $trpcInput = rawurlencode(json_encode((object)[
        '0' => ['id' => $id, 'orgId' => $orgId],
        '1' => ['orgId' => $orgId],
    ]));
    $url = 'https://fc-bff.produs1.ciscoccservice.com/fc-bff/trpc/function.get,function.options?batch=1&input=' . $trpcInput;
    relay($url, 'GET', $headers);
    exit;
}

// ── WxCC Function Store: save ────────────────────────────────────────────────
if ($action === 'save') {
    $payload = $input['payload'] ?? null;
    if (!$payload) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing save payload']);
        exit;
    }
    $url = 'https://fc-bff.produs1.ciscoccservice.com/fc-bff/trpc/function.update?batch=1';
    relay($url, 'POST', $headers, json_encode((object)$payload));
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unsupported action']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function relay(string $url, string $method, array $headers, ?string $body = null): void {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response   = curl_exec($ch);
    $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError  = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        http_response_code(502);
        echo json_encode(['error' => 'Upstream request failed: ' . $curlError]);
        return;
    }

    http_response_code($httpStatus);
    echo $response;
}
