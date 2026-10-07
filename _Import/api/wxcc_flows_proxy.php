<?php
/**
 * WxCC Flow Store Proxy
 *
 * Server-side relay for WxCC Flow Store API calls that are blocked by CORS
 * when called directly from the browser.
 *
 * GET  ?url=<encoded_target_url>              — proxy a GET (e.g. list flows)
 * POST ?url=<encoded_target_url>              — proxy a POST as multipart/form-data
 *                                               (used for flows:import — body must be JSON)
 * POST ?url=<encoded_target_url>&format=json  — proxy a POST with raw JSON body
 *                                               (used for flows:publish and other JSON endpoints)
 *
 * Forwards the Authorization header from the browser request.
 */

require_once '/var/projects/bitbucket.io/cxasteam.bitbucket.io/oauth/check_access.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$targetUrl = $_GET['url'] ?? '';

if (!$targetUrl) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

// Only allow proxying to the Cisco WxCC API
if (!str_starts_with($targetUrl, 'https://api.wxcc-us1.cisco.com/')) {
    http_response_code(403);
    echo json_encode(['error' => 'URL not allowed']);
    exit;
}

$authorization = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? (getallheaders()['Authorization'] ?? getallheaders()['authorization'] ?? '');

if (!$authorization) {
    http_response_code(401);
    echo json_encode(['error' => 'Missing Authorization header']);
    exit;
}

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);

if ($method === 'POST') {
    $jsonBody = file_get_contents('php://input');
    if (!$jsonBody || !trim($jsonBody)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing request body']);
        exit;
    }

    $format = $_GET['format'] ?? 'multipart';

    if ($format === 'json') {
        // Plain JSON POST — used for flows:publish and similar endpoints
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: ' . $authorization,
            'Content-Type: application/json',
            'Accept: application/json',
        ]);
    } else {
        // Multipart file upload — used for flows:import
        // (Cisco import requires multipart — direct browser requests get 403 CORS)
        $tmpFile = tempnam(sys_get_temp_dir(), 'wxcc_flow_');
        file_put_contents($tmpFile, $jsonBody);

        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'file' => new CURLFile($tmpFile, 'application/octet-stream', 'flow_template.json')
        ]);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: ' . $authorization,
            'Accept: application/json',
        ]);
    }
} else {
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: ' . $authorization,
        'Accept: application/json',
    ]);
}

$response   = curl_exec($ch);
$httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if (isset($tmpFile) && file_exists($tmpFile)) {
    unlink($tmpFile);
}

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream request failed: ' . $curlError]);
    exit;
}

http_response_code($httpStatus);
echo $response;
