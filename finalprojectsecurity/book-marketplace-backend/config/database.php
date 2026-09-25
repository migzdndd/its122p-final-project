<?php
/**
 * Database connection (PDO / MySQL).
 *
 * Reads credentials from environment variables or a local .env file.
 */

function load_local_env(string $path): void
{
    if (!file_exists($path) || !is_readable($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) return;
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (strpos($line, '=') !== false) {
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val, " \t\n\r\0\x0B\"'");
            if (!array_key_exists($key, $_ENV) && !array_key_exists($key, $_SERVER) && getenv($key) === false) {
                putenv("{$key}={$val}");
                $_ENV[$key] = $val;
                $_SERVER[$key] = $val;
            }
        }
    }
}

// Prevent PHP notices/warnings/deprecations from corrupting JSON headers & output
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED & ~E_NOTICE & ~E_WARNING);

load_local_env(__DIR__ . '/../.env');
load_local_env(__DIR__ . '/../.env.local');
load_local_env(dirname(__DIR__, 2) . '/.env');
load_local_env(dirname(__DIR__, 2) . '/.env.local');

function get_env_or(string $key, string $default): string
{
    $val = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
    return ($val === false || $val === null || $val === '') ? $default : (string) $val;
}

$dbHost = get_env_or('DB_HOST', '127.0.0.1');
$dbPort = get_env_or('DB_PORT', '3306');
$dbName = get_env_or('DB_NAME', 'book_marketplace');
$dbUser = get_env_or('DB_USER', 'root');
$dbPass = get_env_or('DB_PASS', '');

$dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";

$pdoOptions = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_TIMEOUT            => 10,
];

// Resolve PDO MySQL SSL attribute constants safely across PHP 7.x, 8.0-8.4, and 8.5+
$sslCaKey = null;
$sslVerifyKey = null;

if (class_exists('Pdo\\Mysql')) {
    if (defined('Pdo\\Mysql::ATTR_SSL_CA')) {
        $sslCaKey = \Pdo\Mysql::ATTR_SSL_CA;
    }
    if (defined('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')) {
        $sslVerifyKey = \Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT;
    }
}

if ($sslCaKey === null && defined('PDO::MYSQL_ATTR_SSL_CA')) {
    $sslCaKey = \PDO::MYSQL_ATTR_SSL_CA;
}
if ($sslVerifyKey === null && defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
    $sslVerifyKey = \PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT;
}

$dbSsl = strtolower(get_env_or('DB_SSL', ''));
$isCloudHost = strpos($dbHost, 'tidbcloud.com') !== false ||
               strpos($dbHost, 'aivencloud.com') !== false ||
               strpos($dbHost, 'railway') !== false;

if ($dbSsl === 'true' || $dbSsl === '1' || $dbSsl === 'required' || $isCloudHost) {
    // Locate a valid CA certificate bundle
    $caPath = get_env_or('DB_SSL_CA', '');
    if ($caPath === '' || !file_exists($caPath)) {
        $candidatePaths = [
            __DIR__ . '/isrgrootx1.pem',                         // Bundled Let's Encrypt Root (TiDB Cloud)
            '/etc/pki/tls/certs/ca-bundle.crt',                  // Amazon Linux (Vercel) / RHEL
            '/etc/ssl/certs/ca-certificates.crt',              // Debian / Ubuntu
            '/etc/ssl/cert.pem',                               // Alpine / macOS
            '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',// RHEL 7+
        ];
        if (function_exists('openssl_get_cert_locations')) {
            $locs = openssl_get_cert_locations();
            if (!empty($locs['default_cert_file'])) {
                array_unshift($candidatePaths, $locs['default_cert_file']);
            }
        }
        foreach ($candidatePaths as $candidate) {
            if (file_exists($candidate) && is_readable($candidate)) {
                $caPath = $candidate;
                break;
            }
        }
    }

    if ($caPath !== '' && $sslCaKey !== null) {
        $pdoOptions[$sslCaKey] = $caPath;
    }
    if ($sslVerifyKey !== null) {
        $pdoOptions[$sslVerifyKey] = false;
    }
}

try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, $pdoOptions);
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error'   => 'Database connection failed',
        'details' => $e->getMessage(),
    ]);
    exit;
}

