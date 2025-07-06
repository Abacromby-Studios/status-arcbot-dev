<?php
require_once 'config.php';

header('Content-Type: application/json');

// Secure the monitoring endpoint
if (php_sapi_name() !== 'cli') {
    if (!isset($_SERVER['HTTP_X_MONITOR_KEY']) || $_SERVER['HTTP_X_MONITOR_KEY'] !== MONITOR_KEY) {
        http_response_code(403);
        die(json_encode(['error' => 'Access denied']));
    }
}

function checkBotStatus() {
    global $services;
    $bot = $services['bot'];
    
    try {
        $context = stream_context_create([
            'http' => [
                'timeout' => 5,
                'ignore_errors' => true // To get response even with error codes
            ]
        ]);
        
        $start = microtime(true);
        $response = file_get_contents($bot['endpoint'], false, $context);
        $status_code = extractStatusCode($http_response_header);
        
        // Only 200 is considered operational
        if ($status_code === 200) {
            return [
                'status' => 'operational',
                'response_time' => calculateResponseTime($start),
                'details' => 'Bot is operational and responding normally'
            ];
        }
        
        // Special handling for 502
        if ($status_code === 502) {
            return [
                'status' => 'outage',
                'response_time' => 0,
                'details' => 'Critical: Bot is returning 502 Bad Gateway'
            ];
        }
        
        // Other error codes
        return [
            'status' => $status_code >= 500 ? 'outage' : 'degraded',
            'response_time' => 0,
            'details' => 'Service issue detected (HTTP ' . $status_code . ')'
        ];
    } catch (Exception $e) {
        return [
            'status' => 'outage',
            'response_time' => 0,
            'details' => 'Connection failed: ' . $e->getMessage()
        ];
    }
}

function checkDatabaseStatus() {
    global $services;
    $db = $services['database'];
    
    try {
        $start = microtime(true);
        $socket = @fsockopen($db['host'], $db['port'], $errno, $errstr, $db['timeout']);
        
        if ($socket) {
            fclose($socket);
            return [
                'status' => 'operational',
                'response_time' => calculateResponseTime($start),
                'details' => 'Database accepting connections'
            ];
        }
        
        return [
            'status' => 'outage',
            'response_time' => 0,
            'details' => "Connection failed: Error $errno - $errstr"
        ];
    } catch (Exception $e) {
        return [
            'status' => 'outage',
            'response_time' => 0,
            'details' => 'Connection error: ' . $e->getMessage()
        ];
    }
}

function extractStatusCode($headers) {
    if (!empty($headers[0])) {
        preg_match('/HTTP\/[0-9.]+\s([0-9]+)/', $headers[0], $matches);
        return isset($matches[1]) ? (int)$matches[1] : 0;
    }
    return 0;
}

function calculateResponseTime($start) {
    return round((microtime(true) - $start) * 1000, 2); // Return in milliseconds
}

function logStatus($service, $data) {
    $log_file = __DIR__ . '/logs/' . $service . '_' . date('Y-m-d') . '.log';
    $log_data = [
        'timestamp' => time(),
        'status' => $data['status'],
        'response_time' => $data['response_time'] ?? 0,
        'details' => $data['details'] ?? '',
        'type' => 'monitor_check'
    ];
    
    file_put_contents($log_file, json_encode($log_data) . PHP_EOL, FILE_APPEND);
}

function getHistoricalUptime($service, $days = 30) {
    $uptime_data = [];
    $now = time();
    
    for ($i = 0; $i < $days; $i++) {
        $date = date('Y-m-d', $now - ($i * 86400));
        $log_file = __DIR__ . '/logs/' . $service . '_' . $date . '.log';
        
        if (!file_exists($log_file)) continue;
        
        $logs = file($log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $day_status = ['operational' => 0, 'total' => 0];
        
        foreach ($logs as $log) {
            $data = json_decode($log, true);
            if ($data['type'] === 'monitor_check') {
                $day_status['total']++;
                if ($data['status'] === 'operational') {
                    $day_status['operational']++;
                }
            }
        }
        
        $uptime_data[$date] = $day_status['total'] > 0 
            ? round(($day_status['operational'] / $day_status['total']) * 100, 2)
            : 100;
    }
    
    return $uptime_data;
}

// Main execution
$current_status = [
    'bot' => checkBotStatus(),
    'database' => checkDatabaseStatus(),
    'timestamp' => time()
];

// Log results
logStatus('bot', $current_status['bot']);
logStatus('database', $current_status['database']);

// Prepare full response
$response = [
    'status' => $current_status,
    'uptime' => [
        'bot' => getHistoricalUptime('bot'),
        'database' => getHistoricalUptime('database')
    ],
    'generated_at' => time()
];

// Cache response
file_put_contents(__DIR__ . '/cache/status.json', json_encode($response));

echo json_encode($response);
?>
