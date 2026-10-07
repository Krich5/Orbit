<?php 
/**
 * Webex User Proxy
 *
 * Server-side relay for Webex user API calls that are blocked by CORS
 * when called directly from the browser.
 *
 * Actions:
 *   ccRoles    — PATCH Contact Center roles (Standard / Premium / Supervisor)
 *   adminRoles — PATCH Control Hub admin roles
 *   scimUsers  — GET all users with roles via SCIM
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

// atlas-a.wbx2.com requires browser-like headers to pass the Cisco WAF
$headers = [
    'Authorization: Bearer ' . $token,
    'Content-Type: application/json',
    'Accept: application/json',
    'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language: en-US,en;q=0.9',
];

$atlasOrg = resolveAtlasOrgId($orgId);

// ── Contact Center: Standard / Premium / Supervisor ──────────────────────────
if ($action === 'ccRoles') {
    $users = $input['users'] ?? null;
    if (!$users) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing users payload']);
        exit;
    }
    $url = 'https://atlas-a.wbx2.com/admin/api/v1/organization/' . $atlasOrg . '/users/contactCenterRoles';
    relay($url, 'PATCH', $headers, json_encode(['users' => $users]));
    exit;
}

// ── Control Hub: Full Admin role ─────────────────────────────────────────────
if ($action === 'adminRoles') {
    $users = $input['users'] ?? null;
    if (!$users) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing users payload']);
        exit;
    }
    $url = 'https://atlas-a.wbx2.com/admin/api/v1/organization/' . $atlasOrg . '/users/roles';
    relay($url, 'PATCH', $headers, json_encode(['users' => $users]));
    exit;
}

// ── SCIM: fetch all users with roles (paginated, 100 per page) ───────────────
if ($action === 'scimUsers') {
    $pageSize   = 100;
    $startIndex = 1;
    $allUsers   = [];

    do {
        $url      = 'https://identity-b-us.webex.com/identity/scim/' . rawurlencode($atlasOrg)
                  . '/v2/Users?count=' . $pageSize . '&startIndex=' . $startIndex
                  . '&attributes=userName,roles';
        $response = scimFetch($url, $headers);

        if ($response === null) {
            http_response_code(502);
            echo json_encode(['error' => 'Upstream SCIM request failed']);
            exit;
        }

        $page = json_decode($response, true);

        if (isset($page['status']) && (int)$page['status'] >= 400) {
            http_response_code((int)$page['status']);
            echo $response;
            exit;
        }

        $resources  = $page['Resources'] ?? [];
        $allUsers   = array_merge($allUsers, $resources);
        $total      = (int)($page['totalResults'] ?? 0);
        $startIndex += $pageSize;
    } while (count($allUsers) < $total && count($resources) === $pageSize);

    http_response_code(200);
    echo json_encode([
        'totalResults' => count($allUsers),
        'Resources'    => $allUsers,
    ]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unsupported action']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * atlas-a accepts the UUID form. If the client sends the base64 Webex org ID
 * (e.g. Y2lzY29zcGFyazovL3VzL09SR0...) decode it to extract the UUID.
 */
function resolveAtlasOrgId(string $orgId): string {
    if (preg_match('/^[0-9a-f\-]{36}$/i', $orgId)) {
        return $orgId; // already UUID
    }
    $decoded = base64_decode(strtr($orgId, '-_', '+/'), true);
    if ($decoded !== false) {
        if (preg_match('/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i', $decoded, $matches)) {
            return $matches[1];
        }
    }
    return rawurlencode($orgId); // unknown format, encode and hope
}

function scimFetch(string $url, array $headers): ?string {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response  = curl_exec($ch);
    $curlError = curl_error($ch);
    curl_close($ch);
    return $curlError ? null : $response;
}

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
