const { MongoClient } = require('mongodb');
const config = require('../config/production.json');
const services = require('../config/services.json');

class DatabaseMonitor {
    constructor() {
        this.connectionString = `mongodb://${services.database.host}:${services.database.port}`;
        this.client = new MongoClient(this.connectionString, {
            connectTimeoutMS: services.database.timeout,
            serverSelectionTimeoutMS: services.database.timeout,
            socketTimeoutMS: services.database.timeout
        });
    }

    async checkStatus() {
        let startTime = Date.now();
        try {
            await this.client.connect();
            const adminDb = this.client.db().admin();
            const result = await adminDb.command(services.database.checkQuery);
            
            return {
                status: "operational",
                responseTime: Date.now() - startTime,
                details: "Database responding normally",
                stats: {
                    version: result.version,
                    uptime: result.uptime,
                    ok: result.ok
                }
            };
        } catch (error) {
            return {
                status: "outage",
                responseTime: 0,
                details: `Database connection failed: ${error.message}`,
                stats: null
            };
        } finally {
            await this.client.close();
        }
    }
}

module.exports = new DatabaseMonitor();
