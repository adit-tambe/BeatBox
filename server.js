const express = require('express');
const session = require('express-session');
/**
 * @file server.js
 * @description Main entry point for the BeatBox backend application.
 * This file sets up the Express server, configures middleware (session, security, parsing),
 * serves static files, and mounts the API routes.
 */

const express = require('express'); // Import the Express framework
const session = require('express-session'); // Middleware to manage user login sessions
const path = require('path'); // Utility for working with file and directory paths
const cors = require('cors'); // Middleware to enable Cross-Origin Resource Sharing
const fs = require('fs'); // Node.js File System module for reading database files
const helmet = require('helmet'); // Security middleware to add HTTP headers
const rateLimit = require('express-rate-limit'); // Middleware to prevent brute-force/DoS attacks
const validator = require('validator'); // Tool for sanitizing/validating inputs
const crypto = require('crypto'); // Built-in node module for secure random ID generation
const { getPool, initRolePools, getRootPool } = require('./db'); // Database connection logic
const { router: jamendoRouter, seedFromJamendo } = require('./routes/jamendo'); // Jamendo integration

// Initialize the Express application
const app = express();
const PORT = 3000;

// ==========================================
// SECURITY & MIDDLEWARE CONFIGURATION
// ==========================================

// Helmet sets various HTTP headers to help protect the app from web vulnerabilities.
// We disable CSP here for simplicity, but it's recommended to enable it in production.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS allows your frontend (e.g., on a different port) to talk to this API
app.use(cors());

// Body parsing allows us to read JSON and URL-encoded form data from requests
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Global rate limiter to prevent users from flooding the server
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});
app.use(globalLimiter);

// Session management for keeping track of logged-in users
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'), // Random string used to sign the session cookie
    resave: false, // Don't save session if data hasn't changed
    saveUninitialized: false, // Only save session if we actually store data
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // Cookie lasts for 24 hours
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        sameSite: 'lax', // Protects against CSRF attacks
        secure: false // Set to true if using HTTPS in production
    }
}));

// Input sanitization helper to clean user-provided strings
function sanitize(str) {
    if (typeof str !== 'string') return str;
    return validator.stripLow(str).trim();
}

// ==========================================
// AUTHENTICATION MIDDLEWARES
// ==========================================

// Middleware: Checks if the user is logged in
function requireAuth(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (!req.session.userId) {
        if (req.accepts('html')) {
            return res.redirect('/');
        }
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

// Middleware: Checks if the logged-in user has admin privileges
function requireAdmin(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (!req.session.userId) {
        if (req.accepts('html')) {
            return res.redirect('/');
        }
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.session.isAdmin) {
        if (req.accepts('html')) {
            return res.redirect('/dashboard.html');
        }
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Protect static HTML pages by mapping file paths to auth middleware
const protectedPages = {
    '/app.html': requireAuth
};

// Apply protection before serving static files
app.use((req, res, next) => {
    const guard = protectedPages[req.path];
    if (guard) return guard(req, res, next);
    next();
});

// Serve static frontend files (CSS, JS, Images) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ROUTE MOUNTING
// ==========================================

// Mount API routers to keep the codebase organized
app.use('/api/auth', require('./routes/auth'));
app.use('/api/songs', require('./routes/songs'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/jamendo', jamendoRouter);

// ==========================================
// DATABASE SETUP & SERVER START
// ==========================================

// Auto-setup database, schema, and sample data on startup
async function setupDatabase() {
    let rootPool;
    try {
        rootPool = getRootPool();
        await rootPool.query('CREATE DATABASE IF NOT EXISTS beatbox');
        console.log('✅ Database "beatbox" ready');

        // Read and run schema
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            let schema = fs.readFileSync(schemaPath, 'utf8');
            // Remove DELIMITER commands (not supported in node mysql)
            // We'll handle procedures and triggers separately
            const basicSchema = schema.split('DELIMITER')[0];
            
            const pool = getPool('admin');
            const statements = basicSchema.split(';').filter(s => s.trim().length > 0);
            for (const stmt of statements) {
                try {
                    await pool.query(stmt);
                } catch(e) {
                    if (!e.message.includes('already exists') && !e.message.includes('Duplicate')) {
                        // Ignore "already exists" errors
                    }
                }
            }
            console.log('✅ Schema tables created');

            // Create view
            try {
                await pool.query(`CREATE OR REPLACE VIEW song_details AS
                    SELECT s.song_id, s.title AS song_title, s.duration, s.release_date, s.play_count,
                    a.artist_name, a.artist_id, al.title AS album_title, al.album_id,
                    g.genre_name, g.genre_id
                    FROM songs s LEFT JOIN artists a ON s.artist_id = a.artist_id
                    LEFT JOIN albums al ON s.album_id = al.album_id
                    LEFT JOIN genres g ON s.genre_id = g.genre_id`);
                console.log('✅ View created');
            } catch(e) {}

            // Migrate existing schema — add new columns if missing (safe for upgrades)
            try { await pool.query('ALTER TABLE songs ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL'); } catch(e) {}
            try { await pool.query('ALTER TABLE songs ADD COLUMN IF NOT EXISTS jamendo_id INT DEFAULT NULL'); } catch(e) {}

            // Create trigger
            try {
                await pool.query(`DROP TRIGGER IF EXISTS after_listen_insert`);
                await pool.query(`CREATE TRIGGER after_listen_insert AFTER INSERT ON listens FOR EACH ROW UPDATE songs SET play_count = play_count + 1 WHERE song_id = NEW.song_id`);
                console.log('✅ Trigger created');
            } catch(e) {}

            // Check if data exists
            const [songCount] = await pool.query('SELECT COUNT(*) as c FROM songs');
            if (songCount[0].c === 0) {
                const seedPath = path.join(__dirname, 'database', 'seed.sql');
                if (fs.existsSync(seedPath)) {
                    let seed = fs.readFileSync(seedPath, 'utf8');
                    const seedStatements = seed.split(';').filter(s => s.trim().length > 0 && !s.trim().startsWith('--') && !s.trim().startsWith('USE'));
                    for (const stmt of seedStatements) {
                        try {
                            if (stmt.trim().length > 5) await pool.query(stmt);
                        } catch(e) {
                            if (!e.message.includes('Duplicate')) {
                                console.log('Seed warning:', e.message.substring(0, 80));
                            }
                        }
                    }
                    console.log('✅ Seed data loaded');
                }
            } else {
                console.log(`📀 ${songCount[0].c} songs already in database`);
            }
        }

        // Create DB users for role demo
        const usersPath = path.join(__dirname, 'database', 'users.sql');
        if (fs.existsSync(usersPath)) {
            const userStatements = fs.readFileSync(usersPath, 'utf8')
                .split(';')
                .filter(s => s.trim().length > 0 && !s.trim().startsWith('--'));
            for (const stmt of userStatements) {
                try {
                    if (stmt.trim().length > 5) await rootPool.query(stmt);
                } catch(e) {
                    // Users might already exist
                }
            }
            console.log('✅ DB users/roles created');
        }

        initRolePools();

        // Auto-seed Jamendo tracks if empty
        const seedPool = getPool('admin');
        await seedFromJamendo(seedPool);

    } catch (err) {
        console.error('❌ Database setup failed:', err.message);
        console.log('\n💡 Your MySQL root password is probably set.');
        console.log('   Create a file "db.config.json" with: {"password": "YOUR_PASSWORD"}');
        console.log('   Or run: node server.js --db-pass=YOUR_PASSWORD\n');
    } finally {
        if (rootPool) try { await rootPool.end(); } catch(e) {}
    }
}

setupDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🎵 BeatBox server running at http://localhost:${PORT}`);
        console.log(`   Login:     http://localhost:${PORT}/`);
        console.log(`   App:     http://localhost:${PORT}/app.html`);
        if (!process.env.GEMINI_API_KEY) {
            console.log(`\n⚡ BeatBot is running in rule-based mode.`);
            console.log(`   Add a Gemini API key for AI-powered responses:`);
            console.log(`   Create/edit .env file with: GEMINI_API_KEY=your-key-here`);
            console.log(`   (already added to .gitignore — never committed)\n`);
        }
    });
});
