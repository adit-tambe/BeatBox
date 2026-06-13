/**
 * @file routes/admin.js
 * @description Provides backend API routes for the Admin Panel.
 * Includes user management, role assignments, and CRUD operations for songs and artists.
 * All routes here are protected by the `requireAdmin` middleware.
 */

const express = require('express');
const { getPool, pools } = require('../db');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many admin API requests, please try again later' }
});
router.use(adminLimiter);

// Admin middleware
function requireAdmin(req, res, next) {
    if (!req.session.userId || !['owner', 'admin'].includes(req.session.role)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

/**
 * GET /api/admin/stats
 * Provides basic system statistics (total users, songs, playlists, listens).
 */
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const [users] = await pool.query('SELECT COUNT(*) as count FROM users');
        const [songs] = await pool.query('SELECT COUNT(*) as count FROM songs');
        const [artists] = await pool.query('SELECT COUNT(*) as count FROM artists');
        const [playlists] = await pool.query('SELECT COUNT(*) as count FROM playlists');
        const [listens] = await pool.query('SELECT COUNT(*) as count FROM listens');
        
        res.json({
            users: users[0].count,
            songs: songs[0].count,
            artists: artists[0].count,
            playlists: playlists[0].count,
            listens: listens[0].count
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/admin/songs - Get all songs for admin
router.get('/songs', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const [songs] = await pool.query(`
            SELECT s.*, a.artist_name, al.title AS album_title, g.genre_name
            FROM songs s
            LEFT JOIN artists a ON s.artist_id = a.artist_id
            LEFT JOIN albums al ON s.album_id = al.album_id
            LEFT JOIN genres g ON s.genre_id = g.genre_id
            ORDER BY s.song_id`);
        res.json(songs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

// ==========================================
// SONG & ARTIST MANAGEMENT
// ==========================================

/**
 * POST /api/admin/songs
 * Adds a new song to the database manually.
 */
router.post('/songs', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const { title, duration, release_date, album_id, genre_id, artist_id } = req.body;
        const [result] = await pool.query(
            'INSERT INTO songs (title, duration, release_date, album_id, genre_id, artist_id) VALUES (?, ?, ?, ?, ?, ?)',
            [title, duration || 0, release_date || null, album_id || null, genre_id || null, artist_id || null]
        );
        res.json({ success: true, song_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add song' });
    }
});

/**
 * DELETE /api/admin/songs/:id
 * Deletes a song from the database.
 */
router.delete('/songs/:id', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        await pool.query('DELETE FROM songs WHERE song_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete song' });
    }
});

// POST /api/admin/artists - Add new artist
router.post('/artists', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const { artist_name, country, debut_year } = req.body;
        const [result] = await pool.query(
            'INSERT INTO artists (artist_name, country, debut_year) VALUES (?, ?, ?)',
            [artist_name, country || null, debut_year || null]
        );
        res.json({ success: true, artist_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add artist' });
    }
});

// ==========================================
// DATABASE ROLE DIAGNOSTICS
// ==========================================

/**
 * GET /api/admin/db-roles
 * Inspects actual MySQL user privileges.
 * This is used for the DBA demo to show what the backend connection pools can do.
 */
router.get('/db-roles', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const roles = [];

        // Try to get grants for each user
        const dbUsers = ['beatbox_owner', 'beatbox_admin', 'beatbox_user'];
        const allowedUsers = new Set(dbUsers);
        for (const u of dbUsers) {
            try {
                if (!allowedUsers.has(u)) continue;
                const escapedUser = u.replace(/[^a-zA-Z0-9_]/g, '');
                const [grants] = await pool.query(`SHOW GRANTS FOR '${escapedUser}'@'localhost'`);
                roles.push({ user: u, grants: grants.map(g => Object.values(g)[0]) });
            } catch (e) {
                roles.push({ user: u, grants: ['User not created yet'] });
            }
        }

        res.json(roles);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

/**
 * POST /api/admin/test-role
 * Tests the specific permissions of a given MySQL user role.
 * Attempts to perform dummy operations and reports whether MySQL allowed it or blocked it.
 */
router.post('/test-role', requireAdmin, async (req, res) => {
    try {
        const { role, operation } = req.body;
        const allowedRoles = ['owner', 'admin', 'user'];
        const allowedOps = ['read', 'write', 'create_table', 'create_user'];

        if (!allowedRoles.includes(role) || !allowedOps.includes(operation)) {
            return res.status(400).json({ error: 'Invalid role or operation' });
        }

        const pool = pools[role];
        
        if (!pool) {
            return res.json({ success: false, message: `${role} user not configured. Run database/users.sql first.` });
        }

        let result = '';
        try {
            if (operation === 'read') {
                const [rows] = await pool.query('SELECT COUNT(*) as count FROM songs');
                result = `✅ READ successful: ${rows[0].count} songs found`;
            } else if (operation === 'write') {
                await pool.query("INSERT INTO genres (genre_name) VALUES ('test_genre_temp')");
                await pool.query("DELETE FROM genres WHERE genre_name = 'test_genre_temp'");
                result = '✅ WRITE successful: Insert & Delete completed';
            } else if (operation === 'create_table') {
                await pool.query('CREATE TABLE test_temp_table (id INT)');
                await pool.query('DROP TABLE test_temp_table');
                result = '✅ CREATE TABLE successful';
            } else if (operation === 'create_user') {
                // This should fail for viewer and editor
                await pool.query("CREATE USER 'test_temp_user'@'localhost' IDENTIFIED BY 'test'");
                await pool.query("DROP USER 'test_temp_user'@'localhost'");
                result = '✅ CREATE USER successful';
            }
        } catch (e) {
            result = `❌ DENIED: ${e.message}`;
        }

        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: 'Failed to test role' });
    }
});

// ==========================================
// USER & ROLE MANAGEMENT
// ==========================================

/**
 * GET /api/admin/users
 * Retrieves a list of all users and their basic info.
 */
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const [users] = await pool.query(
            'SELECT user_id, name, email, subscription_type, join_date, role FROM users ORDER BY user_id'
        );
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/admin/users/:id/role
 * Updates a user's role (owner, admin, user).
 * Security note: Only an 'owner' can promote someone to 'owner' or demote an 'owner'.
 */
router.post('/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.id);
        const { role } = req.body;
        
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        if (req.session.role !== 'owner') {
            return res.status(403).json({ error: 'Only the owner can change roles.' });
        }

        const pool = getPool(req.session.role || 'user');
        // Prevent modifying the owner
        const [targetUser] = await pool.query('SELECT role FROM users WHERE user_id = ?', [targetUserId]);
        
        if (targetUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (targetUser[0].role === 'owner') {
            return res.status(403).json({ error: 'Cannot modify the owner' });
        }

        await pool.query('UPDATE users SET role = ? WHERE user_id = ?', [role, targetUserId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// GET /api/admin/artists-list - List all artists with hidden status
router.get('/artists-list', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const [artists] = await pool.query(
            'SELECT artist_id, artist_name, country, debut_year, is_hidden FROM artists ORDER BY artist_name'
        );
        res.json(artists);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch artists list' });
    }
});

// POST /api/admin/artists/:id/toggle-hide - Toggle artist visibility
router.post('/artists/:id/toggle-hide', requireAdmin, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const [existing] = await pool.query('SELECT is_hidden FROM artists WHERE artist_id = ?', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Artist not found' });
        
        const newValue = existing[0].is_hidden ? 0 : 1;
        await pool.query('UPDATE artists SET is_hidden = ? WHERE artist_id = ?', [newValue, req.params.id]);
        res.json({ success: true, is_hidden: !!newValue });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle artist' });
    }
});

module.exports = router;
