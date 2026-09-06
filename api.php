<?php
// Local-only JSON gateway. Reuse Electron's validation and SQLite transactions.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function failRequest($status, $message) {
    http_response_code($status);
    echo json_encode(['ok'=>false, 'error'=>$message]);
    exit;
}
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1','::ffff:127.0.0.1'], true)) failRequest(403, 'Database access is restricted to this computer.');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') failRequest(405, 'Use a JSON POST request.');
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') failRequest(415, 'JSON is required.');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    if ($origin !== $scheme.'://'.($_SERVER['HTTP_HOST'] ?? '')) failRequest(403, 'Same-origin requests only.');
}
$host = parse_url('http://'.($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
if (!in_array($host, ['localhost','127.0.0.1','[::1]'], true)) failRequest(403, 'Open TaxGuard using localhost.');
$body = file_get_contents('php://input', false, null, 0, 10*1024*1024+1);
if (strlen($body)>10*1024*1024) failRequest(413, 'Request exceeds 10 MB.');
$payload = json_decode($body, true);
if (!is_array($payload) || !in_array($payload['action'] ?? '', ['load','save','forms','login','users:list','users:save','users:delete'], true)) failRequest(400, 'Invalid database operation.');
$node = getenv('TAXGUARD_NODE_PATH') ?: 'C:\\Program Files\\nodejs\\node.exe';
if (!is_file($node)) failRequest(503, 'Node.js is required. Install Node.js 22.13 or later, or configure TAXGUARD_NODE_PATH.');
$process = proc_open([$node, '--disable-warning=ExperimentalWarning', __DIR__.'/desktop/api.cjs'], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes, __DIR__, null, ['bypass_shell'=>true]);
if (!is_resource($process)) failRequest(503, 'Could not start the database service.');
fwrite($pipes[0], $body); fclose($pipes[0]);
$output = stream_get_contents($pipes[1]); fclose($pipes[1]);
$error = stream_get_contents($pipes[2]); fclose($pipes[2]);
$exit = proc_close($process);
if ($exit !== 0 || !is_array(json_decode($output, true))) { error_log('TaxGuard: '.$error); failRequest(503, 'Database service unavailable.'); }
echo $output;
