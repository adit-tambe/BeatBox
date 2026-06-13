/**
 * @file db.js
 * @description Database connection management.
 * This file handles connecting to the MySQL database. It reads credentials from
 * .env or db.config.json, and creates separate connection pools for different
 * database users (owner, admin, user) to enforce principle of least privilege.
 */

const mysql = require('mysql2/promise'); // Promise-based MySQL client
const path = require('path');
const fs = require('fs');

// Load .env file (secrets, never committed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    try {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.substring(0, eqIdx).trim();
            let val = trimmed.substring(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = val;
            }
        }
    } catch(e) {}
}

// Default password
let DB_PASSWORD = '';

// ==========================================
// CONFIGURATION LOADING
// ==========================================

// Attempt to load from db.config.json (legacy fallback)
const configPath = path.join(__dirname, 'db.config.json');
if (fs.existsSync(configPath)) {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        DB_PASSWORD = config.password || '';
    } catch(e) {}
}

// Allow overriding via command line argument (e.g. node server.js --db-pass=root)
const passArg = process.argv.find(a => a.startsWith('--db-pass='));
if (passArg) DB_PASSWORD = passArg.split('=')[1];

// Allow overriding via environment variable
if (process.env.DB_PASSWORD) DB_PASSWORD = process.env.DB_PASSWORD;

// ==========================================
// CONNECTION POOLS
// ==========================================

// Global object to store our active connection pools
const pools = {
    // The admin pool connects as the root user. It is used for initial setup
    // and queries that require full access if other pools fail.
    admin: mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: DB_PASSWORD,
        database: 'beatbox',
        waitForConnections: true,
        connectionLimit: 10,
        multipleStatements: true // Required for running complex schema files
    }),
    owner: null,
    user: null
};

/**
 * Creates a root connection pool with NO specific database selected.
 * This is used exclusively during initial server startup to create the `beatbox`
 * database if it doesn't already exist.
 */
function getRootPool() {
    return mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: DB_PASSWORD,
        multipleStatements: true,
        connectionLimit: 2
    });
}

/**
 * Initializes the connection pools for the specific database roles.
 * This enforces database-level security by using MySQL users that have
 * restricted privileges (e.g. beatbox_user cannot drop tables).
 */
function initRolePools() {
    try {
        pools.owner = mysql.createPool({
            host: 'localhost', user: 'beatbox_owner', password: 'owner123',
            database: 'beatbox', waitForConnections: true, connectionLimit: 5
        });
    } catch(e) { console.log('Owner pool not available'); }
    try {
        pools.admin = mysql.createPool({
            host: 'localhost', user: 'beatbox_admin', password: 'admin123',
            database: 'beatbox', waitForConnections: true, connectionLimit: 10
        });
    } catch(e) { console.log('Admin pool not available'); }
    try {
        pools.user = mysql.createPool({
            host: 'localhost', user: 'beatbox_user', password: 'user123',
            database: 'beatbox', waitForConnections: true, connectionLimit: 15
        });
    } catch(e) { console.log('User pool not available'); }
}

/**
 * Helper function to get the appropriate database connection pool.
 * @param {string} role - The role of the user making the request ('owner', 'admin', 'user')
 * @returns {mysql.Pool} The connection pool for that role
 */
function getPool(role = 'admin') {
    return pools[role] || pools.admin;
}

module.exports = { getPool, initRolePools, pools, getRootPool, DB_PASSWORD };
