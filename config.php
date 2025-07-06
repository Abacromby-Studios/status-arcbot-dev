<?php
// Arc CAD Production Monitoring Configuration

// Basic Configuration
define('SITE_NAME', 'Arc CAD Status Page');
define('SITE_URL', 'https://arcbot.dev/dev-status');
define('SUPPORT_SERVER', 'https://discord.gg/bUfZyhznkJ');

// Monitoring Configuration
define('MONITOR_INTERVAL', 60); // Seconds between checks
define('CACHE_TIME', 300); // 5 minutes cache
define('LOG_RETENTION', 90); // Days to keep logs
define('MONITOR_KEY', 'ArC-C4D-St4tUs-M0n1t0r-K3y-2024!'); // For authenticating monitor requests

// Services to Monitor
$services = [
    'bot' => [
        'name' => 'Arc CAD Bot',
        'type' => 'http',
        'endpoint' => 'http://bk80kgwwgwsswoskok44cc0g.135.148.159.33.sslip.io/',
        'expected_status' => 200, // expecting 200 for healthy status
        'port' => 80
    ],
    'database' => [
        'name' => 'Database',
        'type' => 'mongodb',
        'host' => '135.148.159.33',
        'port' => 27017,
        'timeout' => 5 // Connection timeout in seconds
    ]
];

// Status codes mapping
$status_codes = [
    'operational' => ['color' => '#2ecc71', 'text' => 'Operational'],
    'degraded' => ['color' => '#f39c12', 'text' => 'Degraded Performance'],
    'outage' => ['color' => '#e74c3c', 'text' => 'Service Outage'],
    'maintenance' => ['color' => '#3498db', 'text' => 'Maintenance'],
    'unknown' => ['color' => '#9b59b6', 'text' => 'Status Unknown']
];

// Create directories if needed
if (!file_exists(__DIR__ . '/cache')) {
    mkdir(__DIR__ . '/cache', 0755, true);
}
if (!file_exists(__DIR__ . '/logs')) {
    mkdir(__DIR__ . '/logs', 0755, true);
}
?>
