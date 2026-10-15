<?php
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$scheme = (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
$baseUrl = $scheme . '://' . $host;

$urls = [
    ['loc' => '/', 'priority' => '1.0', 'changefreq' => 'weekly'],
    ['loc' => '/browse.html', 'priority' => '0.9', 'changefreq' => 'daily'],
    ['loc' => '/support.html', 'priority' => '0.7', 'changefreq' => 'weekly'],
    ['loc' => '/list-book.html', 'priority' => '0.7', 'changefreq' => 'weekly'],
    ['loc' => '/login.html', 'priority' => '0.5', 'changefreq' => 'monthly'],
    ['loc' => '/register.html', 'priority' => '0.5', 'changefreq' => 'monthly'],
    ['loc' => '/customer-dashboard.html', 'priority' => '0.4', 'changefreq' => 'monthly'],
    ['loc' => '/transactions.html', 'priority' => '0.4', 'changefreq' => 'monthly'],
    ['loc' => '/refund.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/report.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/staff.html', 'priority' => '0.3', 'changefreq' => 'monthly'],
    ['loc' => '/admin.html', 'priority' => '0.3', 'changefreq' => 'monthly'],
];

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $url) {
    $absolute = rtrim($baseUrl, '/') . $url['loc'];
    echo "  <url>\n";
    echo '    <loc>' . htmlspecialchars($absolute, ENT_XML1 | ENT_COMPAT, 'UTF-8') . "</loc>\n";
    echo '    <changefreq>' . $url['changefreq'] . "</changefreq>\n";
    echo '    <priority>' . $url['priority'] . "</priority>\n";
    echo "  </url>\n";
}
echo '</urlset>' . "\n";
