/**
 * @file routes/playlists.js
 * @description API routes for managing user playlists, adding/removing songs, and recommendations.
 */

const express = require('express');
const { getPool } = require('../db');
const router = express.Router();

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    next();
}

// GET /api/playlists - Get user's playlists
router.get('/', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const [playlists] = await pool.query(`
            SELECT p.*, COUNT(ps.song_id) as song_count
            FROM playlists p
            LEFT JOIN playlist_songs ps ON p.playlist_id = ps.playlist_id
            WHERE p.user_id = ?
            GROUP BY p.playlist_id
            ORDER BY p.created_date DESC`, [req.session.userId]);
        res.json(playlists);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// POST /api/playlists - Create playlist
router.post('/', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const { playlist_name } = req.body;
        if (!playlist_name) return res.status(400).json({ error: 'Playlist name is required' });

        const [result] = await pool.query(
            'INSERT INTO playlists (playlist_name, user_id) VALUES (?, ?)',
            [playlist_name, req.session.userId]
        );
        res.json({ success: true, playlist_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

// GET /api/playlists/:id/songs - Get songs in a playlist
router.get('/:id/songs', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const [songs] = await pool.query(`
            SELECT s.song_id, s.title AS song_title, s.duration, s.play_count,
                   s.image_url, s.jamendo_id,
                   a.artist_name, g.genre_name, ps.added_date,
                   CASE WHEN l.song_id IS NOT NULL THEN 1 ELSE 0 END AS is_liked
            FROM playlist_songs ps
            JOIN songs s ON ps.song_id = s.song_id
            LEFT JOIN artists a ON s.artist_id = a.artist_id
            LEFT JOIN genres g ON s.genre_id = g.genre_id
            LEFT JOIN likes l ON s.song_id = l.song_id AND l.user_id = ?
            WHERE ps.playlist_id = ?
            ORDER BY ps.added_date DESC`, [req.session.userId, req.params.id]);
        res.json(songs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch playlist songs' });
    }
});

// POST /api/playlists/:id/songs - Add song to playlist
router.post('/:id/songs', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const { song_id } = req.body;
        
        // Check playlist belongs to user
        const [pl] = await pool.query('SELECT * FROM playlists WHERE playlist_id = ? AND user_id = ?', 
            [req.params.id, req.session.userId]);
        if (pl.length === 0) return res.status(403).json({ error: 'Not your playlist' });

        await pool.query('INSERT IGNORE INTO playlist_songs (playlist_id, song_id) VALUES (?, ?)',
            [req.params.id, song_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add song' });
    }
});

// DELETE /api/playlists/:id/songs/:songId - Remove song from playlist
router.delete('/:id/songs/:songId', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        await pool.query('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
            [req.params.id, req.params.songId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove song' });
    }
});

// DELETE /api/playlists/:id - Delete playlist
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        await pool.query('DELETE FROM playlists WHERE playlist_id = ? AND user_id = ?',
            [req.params.id, req.session.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

// POST /api/playlists/:id/songs/batch - Add multiple songs to playlist
router.post('/:id/songs/batch', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const { song_ids } = req.body;
        if (!Array.isArray(song_ids) || song_ids.length === 0) return res.status(400).json({ error: 'song_ids must be a non-empty array' });
        
        // Check playlist belongs to user
        const [pl] = await pool.query('SELECT * FROM playlists WHERE playlist_id = ? AND user_id = ?', 
            [req.params.id, req.session.userId]);
        if (pl.length === 0) return res.status(403).json({ error: 'Not your playlist' });

        const values = song_ids.map(id => [req.params.id, id]);
        await pool.query('INSERT IGNORE INTO playlist_songs (playlist_id, song_id) VALUES ?', [values]);
        res.json({ success: true, added: song_ids.length });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add batch songs' });
    }
});

// DELETE /api/playlists/:id/songs/batch - Remove multiple songs from playlist
router.delete('/:id/songs/batch', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const { song_ids } = req.body;
        if (!Array.isArray(song_ids) || song_ids.length === 0) return res.status(400).json({ error: 'song_ids must be a non-empty array' });

        await pool.query('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id IN (?)',
            [req.params.id, song_ids]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove batch songs' });
    }
});

// GET /api/playlists/:id/recommendations - Get song recommendations based on playlist content
router.get('/:id/recommendations', requireAuth, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        
        // Find genres and artists present in the playlist
        const [features] = await pool.query(`
            SELECT DISTINCT s.genre_id, s.artist_id 
            FROM playlist_songs ps 
            JOIN songs s ON ps.song_id = s.song_id 
            WHERE ps.playlist_id = ?`, [req.params.id]);
            
        if (features.length === 0) {
            // Return random popular songs if playlist is empty
            const [random] = await pool.query(`
                SELECT s.song_id, s.title AS song_title, s.duration, s.play_count, s.image_url, s.jamendo_id, a.artist_name, g.genre_name 
                FROM songs s 
                LEFT JOIN artists a ON s.artist_id = a.artist_id 
                LEFT JOIN genres g ON s.genre_id = g.genre_id 
                WHERE (a.is_hidden = FALSE OR a.is_hidden IS NULL)
                ORDER BY s.play_count DESC LIMIT 5`);
            return res.json(random);
        }

        const genreIds = [...new Set(features.map(f => f.genre_id).filter(Boolean))];
        const artistIds = [...new Set(features.map(f => f.artist_id).filter(Boolean))];

        let query = `
            SELECT s.song_id, s.title AS song_title, s.duration, s.play_count, s.image_url, s.jamendo_id, a.artist_name, g.genre_name
            FROM songs s
            LEFT JOIN artists a ON s.artist_id = a.artist_id
            LEFT JOIN genres g ON s.genre_id = g.genre_id
            WHERE s.song_id NOT IN (SELECT song_id FROM playlist_songs WHERE playlist_id = ?)
            AND (a.is_hidden = FALSE OR a.is_hidden IS NULL)
        `;
        const params = [req.params.id];
        
        let conditions = [];
        if (genreIds.length > 0) {
            conditions.push(`s.genre_id IN (${genreIds.map(()=>'?').join(',')})`);
            params.push(...genreIds);
        }
        if (artistIds.length > 0) {
            conditions.push(`s.artist_id IN (${artistIds.map(()=>'?').join(',')})`);
            params.push(...artistIds);
        }
        
        if (conditions.length > 0) {
            query += ` AND (${conditions.join(' OR ')})`;
        }
        
        query += ` ORDER BY s.play_count DESC LIMIT 5`;

        const [recs] = await pool.query(query, params);
        res.json(recs);
    } catch (err) {
        console.error('Recommendations error:', err);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

module.exports = router;
