<?php
// Tea Rex Woodworks — quote form handler.
// Runs on Bluehost (PHP). Mails the form to the shop address defined in contact-config.php,
// which is NOT committed to the repo. See contact-config.sample.php.

declare(strict_types=1);

$config = __DIR__ . '/contact-config.php';
if (!is_file($config)) {
    http_response_code(500);
    exit('Form is not configured on this server.');
}
require $config; // defines CONTACT_TO, CONTACT_FROM, CONTACT_SUBJECT, optional SMTP_*

/**
 * Minimal SMTP client: STARTTLS + AUTH LOGIN, enough for Gmail with an app password.
 * Returns '' on success, otherwise a short reason for the log.
 */
function smtp_send(string $to, string $subject, string $body, array $headers): string
{
    $host = SMTP_HOST; $port = SMTP_PORT; $user = SMTP_USER; $pass = SMTP_PASS;
    $sock = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $errstr, 15);
    if (!$sock) return 'connect failed: ' . $errstr;
    stream_set_timeout($sock, 15);

    $read = function () use ($sock): array {
        $code = 0; $text = '';
        while (($line = fgets($sock, 1024)) !== false) {
            $text .= $line;
            $code = (int) substr($line, 0, 3);
            if (strlen($line) < 4 || $line[3] !== '-') break;
        }
        return [$code, trim($text)];
    };
    $say = function (string $cmd) use ($sock, $read): array {
        fwrite($sock, $cmd . "\r\n");
        return $read();
    };
    $expect = function (array $r, int $want, string $step): ?string {
        return $r[0] === $want ? null : $step . ' -> ' . $r[1];
    };

    if ($e = $expect($read(), 220, 'banner')) return $e;
    if ($e = $expect($say('EHLO tearexwoodworks.com'), 250, 'EHLO')) return $e;
    if ($e = $expect($say('STARTTLS'), 220, 'STARTTLS')) return $e;
    if (!@stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) return 'TLS handshake failed';
    if ($e = $expect($say('EHLO tearexwoodworks.com'), 250, 'EHLO/tls')) return $e;
    if ($e = $expect($say('AUTH LOGIN'), 334, 'AUTH')) return $e;
    if ($e = $expect($say(base64_encode($user)), 334, 'AUTH user')) return $e;
    if ($e = $expect($say(base64_encode($pass)), 235, 'AUTH pass')) return $e;
    if ($e = $expect($say('MAIL FROM:<' . $user . '>'), 250, 'MAIL FROM')) return $e;
    if ($e = $expect($say('RCPT TO:<' . $to . '>'), 250, 'RCPT TO')) return $e;
    if ($e = $expect($say('DATA'), 354, 'DATA')) return $e;

    $msg = 'To: <' . $to . ">\r\n"
         . 'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n"
         . 'Date: ' . date(DATE_RFC2822) . "\r\n"
         . implode("\r\n", $headers) . "\r\n\r\n"
         . preg_replace('/^\./m', '..', str_replace("\n", "\r\n", $body));
    if ($e = $expect($say($msg . "\r\n."), 250, 'message')) return $e;
    $say('QUIT');
    fclose($sock);
    return '';
}

$back = '/#contact';

// One line per attempt in contact-log.txt (blocked from the web by .htaccess).
// Never logs the message body, only what happened.
function logline(string $outcome, string $who = ''): void
{
    $line = date('Y-m-d H:i:s') . "\t" . ($_SERVER['REMOTE_ADDR'] ?? '-') . "\t" . $outcome . "\t" . $who . "\n";
    @file_put_contents(__DIR__ . '/contact-log.txt', $line, FILE_APPEND | LOCK_EX);
}

function done(string $status, string $outcome, string $who = '', string $why = ''): void
{
    logline($outcome, $who);
    header('Location: /?sent=' . $status . ($why !== '' ? '&why=' . $why : '') . '#quote-form', true, 303);
    exit;
}

// Diagnostic: /contact.php?ping=1 in a browser proves the handler is live and the log is writable.
if (isset($_GET['ping'])) {
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store');
    $logfile = __DIR__ . '/contact-log.txt';
    $writable = @file_put_contents($logfile, date('Y-m-d H:i:s') . "\t" . ($_SERVER['REMOTE_ADDR'] ?? '-') . "\tping\n", FILE_APPEND | LOCK_EX);
    echo "contact.php is live (v3, logging build)\n";
    echo 'PHP ' . PHP_VERSION . "\n";
    echo 'log file: ' . ($writable !== false ? 'writable, line appended' : 'NOT writable') . "\n";
    echo 'mail() available: ' . (function_exists('mail') ? 'yes' : 'no') . "\n";
    echo 'sends to a mailbox at: ' . substr(CONTACT_TO, strpos(CONTACT_TO, '@')) . "\n";
    echo 'from: ' . CONTACT_FROM . "\n";
    echo 'transport: ' . ((defined('SMTP_HOST') && SMTP_HOST !== '' && defined('SMTP_PASS') && SMTP_PASS !== '') ? 'Gmail SMTP' : 'PHP mail()') . "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Location: ' . $back, true, 303);
    exit;
}

// Honeypot: real people never see this field. Bots fill it. Pretend success.
if (!empty($_POST['_honey'])) {
    done('1', 'dropped: honeypot filled');
}

// Timing: the page stamps the form when it loads. Under 3 seconds is not a person.
$stamp = (int) ($_POST['_t'] ?? 0);
if ($stamp > 0 && (time() - intdiv($stamp, 1000)) < 3) {
    done('1', 'dropped: submitted under 3s');
}

function field(string $key, int $max): string
{
    $v = trim((string) ($_POST[$key] ?? ''));
    $v = str_replace(["\r", "\n"], ' ', $v); // header-injection guard for single-line fields
    return mb_substr($v, 0, $max);
}

$name    = field('name', 120);
$email   = field('email', 200);
$phone   = field('phone', 60);
$kind    = field('kind', 60);
$details = mb_substr(trim((string) ($_POST['details'] ?? '')), 0, 4000);

$why = '';
if ($name === '') {
    $why = 'name';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $why = 'email';
} elseif (mb_strlen($details) < 8) {
    $why = 'details';
}
if ($why !== '') {
    done('0', 'rejected: ' . $why, $name . ' <' . $email . '>', $why);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$when = date('D j M Y, g:i a T');

$body = implode("\n", [
    'New quote request from tearexwoodworks.com',
    '',
    'Name:     ' . $name,
    'Email:    ' . $email,
    'Phone:    ' . ($phone !== '' ? $phone : '(not given)'),
    'Piece:    ' . $kind,
    '',
    'Details:',
    $details,
    '',
    '--',
    'Sent ' . $when . ' from ' . $ip,
    'Reply to this email to answer them directly.',
]);

$useSmtp = defined('SMTP_HOST') && SMTP_HOST !== '' && defined('SMTP_PASS') && SMTP_PASS !== '';
$fromAddr = $useSmtp ? SMTP_USER : CONTACT_FROM;

$headers = [
    'From: Tea Rex Woodworks website <' . $fromAddr . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . PHP_VERSION,
];

// Unique subject per request so Gmail doesn't fold them into one thread.
$subject = CONTACT_SUBJECT . ' from ' . $name . ' (' . date('j M, g:ia') . ')';
if ($useSmtp) {
    $err = smtp_send(CONTACT_TO, $subject, $body, $headers);
    done($err === '' ? '1' : '0', $err === '' ? 'smtp sent' : 'smtp FAILED: ' . $err, $name . ' <' . $email . '>');
}
$ok = @mail(CONTACT_TO, $subject, $body, implode("\r\n", $headers), '-f' . CONTACT_FROM);
done($ok ? '1' : '0', $ok ? 'mail() accepted' : 'mail() FAILED', $name . ' <' . $email . '>');
