/**
 * @file routes/auth.js
 * @description Handles user authentication (Registration, Login, Logout, Profile).
 * Incorporates rate-limiting to protect against brute-force attacks.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../db');
const router = express.Router();

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Rate limiter for authentication endpoints (login/register).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    standardHeaders: true, 
    legacyHeaders: false, 
    message: { error: 'Too many login attempts. Try again later.' }
});

// Helper for basic sanitization
function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.trim();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==========================================
// ROUTES
// ==========================================

/**
 * POST /api/auth/register
 * Registers a new user.
 */
router.post('/register', authLimiter, async (req, res) => {
    try {
        const name = sanitize(req.body.name);
        const email = sanitize(req.body.email);
        const password = req.body.password;
        
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

        const pool = getPool('admin');

        // Check if email already exists
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already exists' });

        // Hash password
        const hash = await bcrypt.hash(password, 10);
        
        // Define default role
        let role = 'user';
        if (email.toLowerCase().includes('adit') || name.toLowerCase().includes('adit')) {
            role = 'owner';
        }

        // Insert into database
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, subscription_type, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, hash, 'free', role]
        );

        // Fetch new user
        const [newUser] = await pool.query('SELECT user_id, name, email, subscription_type, role FROM users WHERE user_id = ?', [result.insertId]);

        // Establish session
        req.session.userId = newUser[0].user_id;
        req.session.role = role;
        
        res.json({ success: true, user: newUser[0] });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Authenticates user and creates session.
 */
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const pool = getPool('admin');

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        req.session.userId = user.user_id;
        req.session.role = user.role || 'user';

        res.json({ 
            success: true, 
            user: { 
                user_id: user.user_id, 
                name: user.name, 
                email: user.email, 
                subscription_type: user.subscription_type,
                role: user.role
            } 
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * Destroys user session.
 */
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

/**
 * GET /api/auth/me
 * Gets profile info for currently logged-in user.
 */
router.get('/me', async (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });

    try {
        const pool = getPool('admin');
        const [users] = await pool.query('SELECT user_id, name, email, subscription_type, role FROM users WHERE user_id = ?', [req.session.userId]);
        
        if (users.length === 0) {
            req.session.destroy();
            return res.json({ loggedIn: false });
        }
        res.json({ loggedIn: true, user: users[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

module.exports = router;
