document.addEventListener('DOMContentLoaded', function() {
    // Initialize elements
    const chartEl = document.getElementById('uptime-chart');
    const lastUpdatedEl = document.getElementById('last-updated');
    const refreshBtn = document.getElementById('refresh-status');
    
    // Initialize chart
    let statusChart = null;
    
    // Fetch status data
    fetchStatusData();
    
    // Set up auto-refresh
    const refreshInterval = setInterval(fetchStatusData, <?php echo MONITOR_INTERVAL * 1000; ?>);
    
    // Manual refresh button
    refreshBtn.addEventListener('click', function() {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
        fetchStatusData();
    });
    
    function fetchStatusData() {
        fetch('/cache/status.json?t=' + Date.now())
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                updateStatusDisplay(data);
                updateChart(data);
                lastUpdatedEl.textContent = new Date(data.generated_at * 1000).toLocaleString();
            })
            .catch(error => {
                console.error('Error fetching status:', error);
                lastUpdatedEl.textContent = 'Error updating status';
            })
            .finally(() => {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';
            });
    }
    
    function updateStatusDisplay(data) {
        // Update bot status
        updateServiceCard('bot', data.status.bot);
        
        // Update database status
        updateServiceCard('database', data.status.database);
        
        // Update uptime stats
        updateUptimeStats(data.uptime);
    }
    
    function updateServiceCard(service, data) {
        const card = document.querySelector(`.status-card[data-service="${service}"]`);
        if (!card) return;
        
        // Update status indicator
        const indicator = card.querySelector('.status-indicator');
        if (indicator) {
            indicator.className = `status-indicator ${data.status}`;
            
            // Special pulse animation for outages
            if (data.status === 'outage') {
                indicator.style.animation = 'pulse 1s infinite';
            } else {
                indicator.style.animation = '';
            }
        }
        
        // Update response time
        const responseTime = card.querySelector('.response-time');
        if (responseTime) {
            if (data.response_time > 0) {
                responseTime.textContent = `${data.response_time}ms`;
                responseTime.style.display = 'inline-block';
            } else {
                responseTime.style.display = 'none';
            }
        }
        
        // Update status description
        const description = card.querySelector('.status-description');
        if (description) {
            description.textContent = getStatusText(data.status);
            description.style.color = getStatusColor(data.status);
        }
        
        // Update details
        const details = card.querySelector('.incident-item > p:first-child');
        if (details) {
            details.textContent = data.details || 'No additional details available';
            
            // Highlight 502 errors
            if (service === 'bot' && data.details.includes('502')) {
                details.innerHTML = `<strong>Service Outage:</strong> Bot is returning 502 Bad Gateway`;
                card.classList.add('critical-outage');
            } else {
                card.classList.remove('critical-outage');
            }
        }
    }
    
    function getStatusText(status) {
        const statusMap = {
            'operational': 'Operational',
            'degraded': 'Degraded Performance',
            'outage': 'Service Outage',
            'maintenance': 'Maintenance',
            'unknown': 'Status Unknown'
        };
        return statusMap[status] || status;
    }
    
    function getStatusColor(status) {
        const colorMap = {
            'operational': '#2ecc71',
            'degraded': '#f39c12',
            'outage': '#e74c3c',
            'maintenance': '#3498db',
            'unknown': '#9b59b6'
        };
        return colorMap[status] || '#ffffff';
    }
    
    function updateUptimeStats(uptimeData) {
        for (const [service, data] of Object.entries(uptimeData)) {
            const statEl = document.querySelector(`.uptime-stat[data-service="${service}"] .uptime-value`);
            if (statEl) {
                const uptime = calculateAverageUptime(data);
                statEl.textContent = `${uptime}%`;
                statEl.style.color = getUptimeColor(uptime);
            }
        }
    }
    
    function calculateAverageUptime(dailyData) {
        const values = Object.values(dailyData);
        if (values.length === 0) return 'N/A';
        
        const sum = values.reduce((a, b) => a + b, 0);
        return (sum / values.length).toFixed(2);
    }
    
    function getUptimeColor(percentage) {
        if (percentage === 'N/A') return '#9b59b6';
        const value = parseFloat(percentage);
        if (value >= 99.9) return '#2ecc71';
        if (value >= 99) return '#f39c12';
        return '#e74c3c';
    }
    
    function updateChart(data) {
        // Prepare chart data
        const labels = [];
        const botData = [];
        const dbData = [];
        
        // Get last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            labels.push(label);
            botData.push(data.uptime.bot[dateStr] || 100);
            dbData.push(data.uptime.database[dateStr] || 100);
        }
        
        // Initialize or update chart
        if (!statusChart) {
            statusChart = new Chart(chartEl, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Bot Availability',
                            data: botData,
                            borderColor: '#bf291f',
                            backgroundColor: 'rgba(191, 41, 31, 0.1)',
                            tension: 0.2,
                            fill: true,
                            pointRadius: 3,
                            pointHoverRadius: 5
                        },
                        {
                            label: 'Database Availability',
                            data: dbData,
                            borderColor: '#3498db',
                            backgroundColor: 'rgba(52, 152, 219, 0.1)',
                            tension: 0.2,
                            fill: true,
                            pointRadius: 3,
                            pointHoverRadius: 5
                        }
                    ]
                },
                options: getChartOptions()
            });
        } else {
            statusChart.data.labels = labels;
            statusChart.data.datasets[0].data = botData;
            statusChart.data.datasets[1].data = dbData;
            statusChart.update();
        }
    }
    
    function getChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 95,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.raw + '%';
                        }
                    }
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            family: '"Epilogue", sans-serif'
                        }
                    }
                }
            },
            elements: {
                line: {
                    borderWidth: 2
                }
            }
        };
    }
});
