require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Webhook } = require('discord-webhook-node');
const databaseMonitor = require('./db');
const config = require('../config/production.json');
const services = require('../config/services.json');

// Initialize webhooks
const publicWebhook = new Webhook(config.webhooks.public);
const internalWebhook = new Webhook(config.webhooks.internal);

// Paths
const STATUS_FILE = path.join(__dirname, 'status.json');
const INCIDENTS_FILE = path.join(__dirname, 'incidents.json');
const UPTIME_HISTORY_FILE = path.join(__dirname, 'uptime-history.json');

// Load or initialize data
let statusData = loadData(STATUS_FILE, getDefaultStatus());
let incidentsData = loadData(INCIDENTS_FILE, []);

// Initialize uptime history
let uptimeHistory = loadData(UPTIME_HISTORY_FILE, {
    bot: initUptimeHistory(),
    website: initUptimeHistory(),
    database: initUptimeHistory()
});

function loadData(filePath, defaultValue) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return defaultValue;
    }
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getDefaultStatus() {
    return {
        bot: initServiceStatus("bot"),
        website: initServiceStatus("website"),
        database: initServiceStatus("database"),
        lastUpdated: new Date().toISOString(),
        uptimeStats: {
            bot: initUptimeStats(),
            website: initUptimeStats(),
            database: initUptimeStats()
        },
        minuteHistory: {
            bot: [],
            website: [],
            database: []
        }
    };
}

function initServiceStatus(service) {
    return {
        status: "operational",
        lastUpdated: new Date().toISOString(),
        responseTime: 0,
        details: "Service is operational",
        stats: null
    };
}

function initUptimeStats() {
    return {
        "24h": 100,
        "7d": 100,
        "30d": 100,
        allTime: 100,
        lastUpdated: new Date().toISOString()
    };
}

function initUptimeHistory() {
    return {
        minuteHistory: [],
        currentMinuteStart: new Date(),
        currentMinuteStatus: true
    };
}

async function checkHttpService(service) {
    const config = services.services[service];
    const startTime = Date.now();
    
    try {
        const response = await axios.get(config.endpoint, {
            timeout: config.timeout,
            validateStatus: () => true
        });
        
        const isOperational = response.status === config.expectedStatus;
        return {
            status: isOperational ? "operational" : "outage",
            responseTime: Date.now() - startTime,
            details: isOperational 
                ? "Service responding normally" 
                : `Unexpected HTTP status: ${response.status}`,
            stats: {
                statusCode: response.status,
                headers: response.headers
            }
        };
    } catch (error) {
        return {
            status: "outage",
            responseTime: 0,
            details: `Connection failed: ${error.message}`,
            stats: null
        };
    }
}

async function performChecks() {
    const results = {
        bot: await checkHttpService("bot"),
        website: await checkHttpService("website"),
        database: await databaseMonitor.checkStatus()
    };
    
    // Update status data
    const now = new Date();
    let hasChanges = false;
    
    for (const [service, result] of Object.entries(results)) {
        if (statusData[service].status !== result.status) {
            hasChanges = true;
            await handleStatusChange(service, result.status, result.details);
        }
        
        // Update service status
        statusData[service] = {
            status: result.status,
            lastUpdated: now.toISOString(),
            responseTime: result.responseTime,
            details: result.details,
            stats: result.stats
        };
        
        // Update uptime stats
        updateUptimeStats(service, result.status === "operational");
    }
    
    statusData.lastUpdated = now.toISOString();
    saveData(STATUS_FILE, statusData);
    
    return { statusData, incidentsData, hasChanges };
}

function updateUptimeStats(service, isOperational) {
    const now = new Date();
    const history = uptimeHistory[service];
    
    // Check if we're in a new minute
    if (now.getMinutes() !== history.currentMinuteStart.getMinutes()) {
        // Push the previous minute's status
        history.minuteHistory.push(history.currentMinuteStatus);
        
        // Keep only the last 30 days of data (43,200 minutes)
        if (history.minuteHistory.length > 43200) {
            history.minuteHistory.shift();
        }
        
        // Reset for new minute
        history.currentMinuteStart = now;
        history.currentMinuteStatus = isOperational;
    } else {
        // Update current minute's status (if it's false, keep it false)
        history.currentMinuteStatus = history.currentMinuteStatus && isOperational;
    }
    
    // Calculate uptime percentages
    const allMinutes = [...history.minuteHistory, history.currentMinuteStatus];
    const operationalMinutes = allMinutes.filter(status => status).length;
    const totalMinutes = allMinutes.length;
    
    // Last 24 hours (1440 minutes)
    const last24h = allMinutes.slice(-1440);
    const operational24h = last24h.filter(status => status).length;
    
    // Last 7 days (10080 minutes)
    const last7d = allMinutes.slice(-10080);
    const operational7d = last7d.filter(status => status).length;
    
    // Last 30 days (43200 minutes)
    const last30d = allMinutes.slice(-43200);
    const operational30d = last30d.filter(status => status).length;
    
    // Update stats
    statusData.uptimeStats[service] = {
        "24h": totalMinutes > 0 ? (operational24h / 1440 * 100) : 100,
        "7d": totalMinutes > 0 ? (operational7d / 10080 * 100) : 100,
        "30d": totalMinutes > 0 ? (operational30d / 43200 * 100) : 100,
        "allTime": totalMinutes > 0 ? (operationalMinutes / totalMinutes * 100) : 100,
        "lastUpdated": now.toISOString()
    };
    
    // Save history
    saveData(UPTIME_HISTORY_FILE, uptimeHistory);
}

async function handleStatusChange(service, newStatus, details) {
    const serviceConfig = services.services[service];
    const now = new Date();
    
    // Prepare notification
    const embed = createStatusEmbed(serviceConfig.name, newStatus, details);
    
    // Send public notification if not operational
    if (newStatus !== "operational") {
        const content = newStatus === "outage" ? "<@&1255517318398873743>" : "";
        await publicWebhook.send({ content, embeds: [embed] });
    }
    
    // Always send internal notification
    embed.title = `[INTERNAL] ${embed.title}`;
    embed.fields.push({
        name: "Timestamp",
        value: `<t:${Math.floor(now.getTime() / 1000)}:F>`,
        inline: false
    });
    
    await internalWebhook.send({ embeds: [embed] });
    
    // Record incident
    if (newStatus !== "operational") {
        incidentsData.unshift({
            id: generateId(),
            service,
            status: newStatus,
            startTime: now.toISOString(),
            endTime: null,
            details,
            publicMessage: getPublicMessage(serviceConfig.name, newStatus),
            internalNotes: "",
            resolved: false
        });
    } else {
        // Mark the last incident as resolved
        const ongoingIncident = incidentsData.find(i => 
            i.service === service && !i.resolved
        );
        
        if (ongoingIncident) {
            ongoingIncident.endTime = now.toISOString();
            ongoingIncident.resolved = true;
            ongoingIncident.resolutionTime = now.toISOString();
        }
    }
    
    saveData(INCIDENTS_FILE, incidentsData);
}

function createStatusEmbed(serviceName, status, details) {
    const statusConfig = services.statuses[status];
    
    return {
        title: `${statusConfig.emoji} ARC Service Status`,
        description: getPublicMessage(serviceName, status),
        color: parseInt(statusConfig.color.replace("#", ""), 16),
        timestamp: new Date().toISOString(),
        fields: [
            {
                name: "Service",
                value: serviceName,
                inline: true
            },
            {
                name: "Status",
                value: statusConfig.description,
                inline: true
            },
            {
                name: "Details",
                value: details || "No additional details provided",
                inline: false
            }
        ],
        footer: {
            text: "Status monitoring system"
        }
    };
}

function getPublicMessage(serviceName, status) {
    const messages = {
        operational: `**Service Restored:** ${serviceName} is now back online and operating normally. Thank you for your patience.`,
        degraded: `**Degraded Performance:** ${serviceName} is experiencing performance issues. Our team is investigating.`,
        outage: `**Service Outage:** ${serviceName} is currently unavailable due to an unexpected issue. We're working to restore service as quickly as possible.`,
        maintenance: `**Maintenance Notice:** ${serviceName} is undergoing scheduled maintenance and may be temporarily unavailable.`
    };
    
    return messages[status] || `${serviceName} status has changed to ${status}.`;
}

function generateId() {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Start monitoring
setInterval(async () => {
    try {
        await performChecks();
    } catch (error) {
        console.error("Monitoring error:", error);
    }
}, config.monitoring.interval);

// Initial check
performChecks();

module.exports = {
    getStatus: () => statusData,
    getIncidents: () => incidentsData,
    updateStatus: async (service, status, details) => {
        await handleStatusChange(service, status, details);
        return performChecks();
    }
};
