<?php
require_once 'config.php';
require_once 'includes/header.php';

function getStatusData() {
    $cache_file = __DIR__ . '/cache/status.json';
    
    if (file_exists($cache_file)) {
        $cache_time = filemtime($cache_file);
        if (time() - $cache_time < CACHE_TIME) {
            return json_decode(file_get_contents($cache_file), true);
        }
    }
    
    // Fallback data when cache is unavailable
    return [
        'status' => [
            'bot' => [
                'status' => 'unknown',
                'details' => 'Status data not currently available',
                'response_time' => 0
            ],
            'database' => [
                'status' => 'unknown',
                'details' => 'Status data not currently available',
                'response_time' => 0
            ]
        ],
        'uptime' => [
            'bot' => [],
            'database' => []
        ],
        'generated_at' => time()
    ];
}

$status_data = getStatusData();
$bot_status = $status_data['status']['bot'];
$db_status = $status_data['status']['database'];
?>

<div class="status-container">
    <div class="status-header">
        <h2>Production Systems Status</h2>
        <div class="last-updated">
            Last updated: <span id="last-updated"><?php echo date("F j, Y, g:i a", $status_data['generated_at']); ?></span>
            <button id="refresh-status" title="Refresh status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6"></path>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
            </button>
        </div>
    </div>

    <div class="status-grid">
        <!-- Bot Status Card -->
        <div class="status-card" data-service="bot">
            <h3 class="status-title">
                <span class="status-indicator <?php echo $bot_status['status']; ?>"></span>
                Arc CAD Bot
                <?php if (isset($bot_status['response_time']) && $bot_status['response_time'] > 0): ?>
                <span class="response-time"><?php echo $bot_status['response_time']; ?>ms</span>
                <?php endif; ?>
            </h3>
            <p class="status-description"><?php echo $status_codes[$bot_status['status']]['text']; ?></p>
            <div class="incident-list">
                <div class="incident-item">
                    <p><?php echo htmlspecialchars($bot_status['details']); ?></p>
                    <?php if (strpos($bot_status['details'], '502') !== false): ?>
                    <p class="incident-actions">
                        <a href="<?php echo SUPPORT_SERVER; ?>" class="support-link">Get support</a>
                    </p>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Database Status Card -->
        <div class="status-card" data-service="database">
            <h3 class="status-title">
                <span class="status-indicator <?php echo $db_status['status']; ?>"></span>
                MongoDB Database
                <?php if (isset($db_status['response_time']) && $db_status['response_time'] > 0): ?>
                <span class="response-time"><?php echo $db_status['response_time']; ?>ms</span>
                <?php endif; ?>
            </h3>
            <p class="status-description"><?php echo $status_codes[$db_status['status']]['text']; ?></p>
            <div class="incident-list">
                <div class="incident-item">
                    <p><?php echo htmlspecialchars($db_status['details']); ?></p>
                    <p class="incident-time">
                        Host: <?php echo $services['database']['host']; ?>:<?php echo $services['database']['port']; ?>
                    </p>
                    <?php if ($db_status['status'] === 'outage'): ?>
                    <p class="incident-actions">
                        <a href="<?php echo SUPPORT_SERVER; ?>" class="support-link">Get support</a>
                    </p>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <div class="uptime-stats">
        <div class="uptime-stat" data-service="bot">
            <h3>Bot Uptime</h3>
            <div class="uptime-value">
                <?php echo calculateUptimePercentage($status_data['uptime']['bot']); ?>%
            </div>
            <p>Past 30 days</p>
        </div>
        
        <div class="uptime-stat" data-service="database">
            <h3>Database Uptime</h3>
            <div class="uptime-value">
                <?php echo calculateUptimePercentage($status_data['uptime']['database']); ?>%
            </div>
            <p>Past 30 days</p>
        </div>
    </div>

    <div class="history-chart">
        <h3>Historical Availability</h3>
        <div id="uptime-chart" style="height: 300px;"></div>
    </div>
</div>

<?php
function calculateUptimePercentage($daily_uptime) {
    if (empty($daily_uptime)) return 'N/A';
    
    $total = array_sum($daily_uptime);
    $count = count($daily_uptime);
    
    return $count > 0 ? round($total / $count, 2) : 100;
}
?>

<?php require_once 'includes/footer.php'; ?>
