<?php
/**
 * Database connection (PDO / MySQL).
 *
 * Reads credentials from environment variables or .env / .env.local file.
 * Copy .env.example to .env (or set real env vars on your server) before running.
 *
 *   DB_HOST=127.0.0.1
 *   DB_PORT=3306
 *   DB_NAME=book_marketplace
 *   DB_USER=root
 *   DB_PASS=
 *   DB_SSL=true   ← set to "true" on TiDB Cloud / any TLS-required host
 */

// Helper to load .env / .env.local if present
function load_env_file_if_exists(string $path): void
{
    if (!file_exists($path) || !is_readable($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) return;
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (strpos($line, '=') !== false) {
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v, " \t\n\r\0\x0B\"'");
            if (getenv($k) === false) {
                putenv("{$k}={$v}");
                $_ENV[$k] = $v;
                $_SERVER[$k] = $v;
            }
        }
    }
}

// Check for local env files in backend root or project root
load_env_file_if_exists(__DIR__ . '/../.env');
load_env_file_if_exists(__DIR__ . '/../.env.local');
load_env_file_if_exists(dirname(__DIR__, 2) . '/.env');
load_env_file_if_exists(dirname(__DIR__, 2) . '/.env.local');

// Never let PHP warnings/notices print into the JSON response
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);

/* PHP 8.4+ uses Pdo\\Mysql::ATTR_*, older PHP uses PDO::MYSQL_ATTR_* */
function mysql_attr(string $name): ?int
{
    if (defined("Pdo\\Mysql::ATTR_{$name}")) return constant("Pdo\\Mysql::ATTR_{$name}");
    if (defined("PDO::MYSQL_ATTR_{$name}"))  return constant("PDO::MYSQL_ATTR_{$name}");
    return null;
}

function get_env_or(string $key, string $default): string
{
    $value = getenv($key);
    return ($value === false || $value === '') ? $default : $value;
}

$dbHost = get_env_or('DB_HOST', '127.0.0.1');
$dbPort = get_env_or('DB_PORT', '3306');
$dbName = get_env_or('DB_NAME', 'book_marketplace');
$dbUser = get_env_or('DB_USER', 'root');
$dbPass = get_env_or('DB_PASS', '');
$dbSsl  = strtolower(get_env_or('DB_SSL', 'false')) === 'true' || str_contains($dbHost, 'tidbcloud.com');

// DSN — TLS is forced via MYSQL_ATTR_SSL_CA below.
$dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";

$pdoOptions = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_TIMEOUT            => 15,
];

if ($dbSsl) {
    // Use the TiDB CA cert bundled in this repo first, then fall back to
    // common system CA bundle paths across Linux distros used by Vercel.
    $caBundles = [
        __DIR__ . '/isrgrootx1.pem',               // TiDB Cloud CA — bundled in repo
        '/etc/ssl/certs/ca-certificates.crt',       // Debian / Ubuntu
        '/etc/pki/tls/certs/ca-bundle.crt',         // Amazon Linux / CentOS / RHEL
        '/etc/ssl/ca-bundle.pem',                   // OpenSUSE
        '/dev/null',                                 // last resort: initiates TLS, skips CA check
    ];
    $caFound = false;
    $caAttr = mysql_attr('SSL_CA');
    foreach ($caBundles as $bundle) {
        if (file_exists($bundle)) {
            if ($caAttr !== null) $pdoOptions[$caAttr] = $bundle;
            $caFound = ($bundle !== '/dev/null');
            break;
        }
    }
    $verifyAttr = mysql_attr('SSL_VERIFY_SERVER_CERT');
    if ($verifyAttr !== null) $pdoOptions[$verifyAttr] = $caFound;
}

$pdo = null;

try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, $pdoOptions);
} catch (PDOException $e) {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOriginPattern = '#^https?://(?:localhost|127\.0\.0\.1|[^/]+\.vercel\.app)(?::\d+)?$#i';
    if ($origin !== '' && preg_match($allowedOriginPattern, $origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, Cache-Control');
    http_response_code(500);
    header('Content-Type: application/json');
    $payload = ['error' => 'Database connection failed'];
    if (filter_var($_ENV['APP_DEBUG'] ?? getenv('APP_DEBUG') ?? false, FILTER_VALIDATE_BOOLEAN)) {
        $payload['details'] = $e->getMessage();
    }
    echo json_encode($payload);
    exit;
}
