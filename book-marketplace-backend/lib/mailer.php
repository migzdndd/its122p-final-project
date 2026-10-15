<?php
declare(strict_types=1);

/**
 * Transactional email service using Resend HTTP API.
 * Uses cURL to avoid SMTP port blocking on serverless/cloud platforms.
 * Falls back to local dev logging when RESEND_API_KEY is not configured.
 */

function resolve_app_url(): string
{
    $envUrl = getenv('APP_URL');
    if ($envUrl !== false && trim($envUrl) !== '') {
        return rtrim(trim($envUrl), '/');
    }

    $vercelProd = getenv('VERCEL_PROJECT_PRODUCTION_URL') ?: getenv('VERCEL_URL');
    if ($vercelProd !== false && trim($vercelProd) !== '') {
        $cleanVercel = trim($vercelProd);
        return str_starts_with($cleanVercel, 'http') ? rtrim($cleanVercel, '/') : 'https://' . rtrim($cleanVercel, '/');
    }

    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '' && preg_match('#^https?://[^/]+$#i', $origin)) {
        return rtrim($origin, '/');
    }

    $referrer = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
    if ($referrer !== '' && preg_match('#^(https?://[^/]+)#i', $referrer, $matches)) {
        return rtrim($matches[1], '/');
    }

    $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
             (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8000';
    return "{$proto}://{$host}";
}

function send_resend_email(string $to, string $subject, string $html, string $text): array
{
    $apiKey = trim((string) (getenv('RESEND_API_KEY') ?: ''));
    $from = trim((string) (getenv('MAIL_FROM') ?: 'Librowse Book Exchange <onboarding@resend.dev>'));

    // Dev mode fallback: log message and preview link when API key is unset
    if ($apiKey === '') {
        $logEntry = sprintf(
            "[%s] [DEV MAILER] To: %s | Subject: %s\nText: %s\n---\n",
            gmdate('Y-m-d H:i:s'),
            $to,
            $subject,
            $text
        );
        error_log('[librowse-mailer] ' . $subject . ' -> ' . $to);
        $logFile = sys_get_temp_dir() . '/librowse_mail.log';
        @file_put_contents($logFile, $logEntry, FILE_APPEND);

        return [
            'success' => true,
            'dev_mode' => true,
            'recipient' => $to,
            'log_path' => $logFile,
        ];
    }

    $ch = curl_init('https://api.resend.com/emails');
    $payload = json_encode([
        'from' => $from,
        'to' => [$to],
        'subject' => $subject,
        'html' => $html,
        'text' => $text,
    ], JSON_UNESCAPED_SLASHES);

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            'User-Agent: Librowse-Book-Exchange/1.0',
        ],
        CURLOPT_TIMEOUT => 10,
    ]);

    $raw = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr !== '') {
        error_log('[librowse-mailer] cURL failed: ' . $curlErr);
        return ['success' => false, 'error' => 'Network error connecting to email gateway: ' . $curlErr];
    }

    $decoded = json_decode((string) $raw, true);
    if ($httpCode < 200 || $httpCode >= 300) {
        $msg = $decoded['message'] ?? 'Resend API returned status ' . $httpCode;
        error_log('[librowse-mailer] Resend error (' . $httpCode . '): ' . $msg);
        return ['success' => false, 'error' => $msg, 'http_code' => $httpCode];
    }

    return ['success' => true, 'id' => $decoded['id'] ?? null];
}

function send_verification_email(string $toEmail, string $username, string $rawToken, ?string $appUrl = null): array
{
    $baseUrl = $appUrl ?: resolve_app_url();
    $link = $baseUrl . '/verify-email.html?token=' . rawurlencode($rawToken);

    $safeUser = htmlspecialchars($username, ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');

    $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Librowse account</title>
</head>
<body style="margin:0;padding:24px;background-color:#f4eadd;font-family:'Nunito Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#4e3b30;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;margin:0 auto;background:#fffaf3;border:1px solid #eadbc8;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(78,59,48,0.08);">
    <tr>
      <td style="padding:28px 32px;background:#4e3b30;color:#fffaf3;">
        <h1 style="margin:0;font-size:22px;font-family:Georgia,serif;letter-spacing:0.3px;">Librowse Book Exchange</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#d9c3a8;">Verify your email address</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#4e3b30;">Welcome, {$safeUser}!</h2>
        <p style="margin:0 0 20px;line-height:1.6;font-size:15px;color:#6b5040;">
          Thank you for joining Librowse Book Exchange. Please confirm your email address by clicking the button below so you can sign in and start listing and trading books.
        </p>
        <div style="text-align:center;margin:30px 0;">
          <a href="{$safeLink}" style="display:inline-block;padding:13px 28px;background:#9a7458;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;box-shadow:0 2px 6px rgba(78,59,48,0.2);">Verify My Email</a>
        </div>
        <p style="margin:24px 0 8px;font-size:13px;line-height:1.5;color:#8a715f;">
          If the button does not work, copy and paste this link into your browser:
        </p>
        <p style="margin:0 0 20px;word-break:break-all;font-size:12px;color:#9a7458;">
          <a href="{$safeLink}" style="color:#9a7458;">{$safeLink}</a>
        </p>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#8a715f;border-top:1px solid #eadbc8;padding-top:16px;">
          This verification link will expire in 48 hours. If you did not create an account on Librowse, you can safely ignore this message.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;

    $text = "Welcome to Librowse Book Exchange, {$username}!\n\n"
          . "Please verify your email address by visiting this link:\n"
          . "{$link}\n\n"
          . "This link expires in 48 hours. If you did not create an account, you can ignore this email.";

    $res = send_resend_email($toEmail, 'Verify your email - Librowse Book Exchange', $html, $text);
    if (!empty($res['dev_mode']) || empty($res['success'])) {
        $res['dev_preview_link'] = $link;
    }
    return $res;
}

function send_password_reset_email(string $toEmail, string $username, string $rawToken, ?string $appUrl = null): array
{
    $baseUrl = $appUrl ?: resolve_app_url();
    $link = $baseUrl . '/reset-password.html?token=' . rawurlencode($rawToken);

    $safeUser = htmlspecialchars($username, ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');

    $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Librowse password</title>
</head>
<body style="margin:0;padding:24px;background-color:#f4eadd;font-family:'Nunito Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#4e3b30;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;margin:0 auto;background:#fffaf3;border:1px solid #eadbc8;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(78,59,48,0.08);">
    <tr>
      <td style="padding:28px 32px;background:#4e3b30;color:#fffaf3;">
        <h1 style="margin:0;font-size:22px;font-family:Georgia,serif;letter-spacing:0.3px;">Librowse Book Exchange</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#d9c3a8;">Password Reset Request</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#4e3b30;">Hello, {$safeUser}</h2>
        <p style="margin:0 0 20px;line-height:1.6;font-size:15px;color:#6b5040;">
          We received a request to reset your password for your Librowse account. Click the button below to choose a new password.
        </p>
        <div style="text-align:center;margin:30px 0;">
          <a href="{$safeLink}" style="display:inline-block;padding:13px 28px;background:#9a7458;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;box-shadow:0 2px 6px rgba(78,59,48,0.2);">Reset My Password</a>
        </div>
        <p style="margin:24px 0 8px;font-size:13px;line-height:1.5;color:#8a715f;">
          If the button does not work, copy and paste this link into your browser:
        </p>
        <p style="margin:0 0 20px;word-break:break-all;font-size:12px;color:#9a7458;">
          <a href="{$safeLink}" style="color:#9a7458;">{$safeLink}</a>
        </p>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#8a715f;border-top:1px solid #eadbc8;padding-top:16px;">
          For security, this link expires in 60 minutes. If you did not request a password reset, you can safely ignore this email and your password will stay unchanged.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;

    $text = "Hello {$username},\n\n"
          . "We received a request to reset your Librowse password.\n"
          . "Use this link to set a new password (expires in 60 minutes):\n"
          . "{$link}\n\n"
          . "If you did not request this, you can ignore this email.";

    $res = send_resend_email($toEmail, 'Reset your password - Librowse Book Exchange', $html, $text);
    if (!empty($res['dev_mode']) || empty($res['success'])) {
        $res['dev_preview_link'] = $link;
    }
    return $res;
}
