/**
 * @file routes/songs.js
 * @description API routes for fetching, filtering, and sorting songs, genres, and artists.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../db');
const router = express.Router();

// Rate limiter for public song listing endpoints
const songsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' }
});

// GET /api/songs - Get all songs with filters
router.get('/', songsLimiter, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const { artist, genre, album, search, sort } = req.query;
        const userId = req.session.userId || null;
        
        let query = `SELECT s.song_id, s.title AS song_title, s.duration, s.release_date, s.play_count,
                      s.image_url, s.jamendo_id,
                      a.artist_name, a.artist_id, al.title AS album_title, al.album_id,
                      g.genre_name, g.genre_id,
                      IF(l.user_id IS NOT NULL, 1, 0) AS is_liked
                      FROM songs s
                      LEFT JOIN artists a ON s.artist_id = a.artist_id
                      LEFT JOIN albums al ON s.album_id = al.album_id
                      LEFT JOIN genres g ON s.genre_id = g.genre_id
                      LEFT JOIN likes l ON s.song_id = l.song_id AND l.user_id = ?
                      WHERE (a.is_hidden = FALSE OR a.is_hidden IS NULL)`;
        const params = [userId];

        if (artist) { query += ' AND s.artist_id = ?'; params.push(artist); }
        if (genre) { query += ' AND s.genre_id = ?'; params.push(genre); }
        if (album) { query += ' AND s.album_id = ?'; params.push(album); }
        if (search) { query += ' AND (s.title LIKE ? OR a.artist_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

        if (sort === 'popular') query += ' ORDER BY s.play_count DESC';
        else if (sort === 'newest') query += ' ORDER BY s.release_date DESC';
        else if (sort === 'title') query += ' ORDER BY s.title ASC';
        else query += ' ORDER BY s.play_count DESC';

        const [songs] = await pool.query(query, params);
        res.json(songs);
    } catch (err) {
        console.error('Songs fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

// GET /api/songs/artists - Get all artists
router.get('/artists', songsLimiter, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const [artists] = await pool.query('SELECT * FROM artists ORDER BY artist_name');
        res.json(artists);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch artists' });
    }
});

// GET /api/songs/genres - Get all genres
router.get('/genres', songsLimiter, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const [genres] = await pool.query('SELECT * FROM genres ORDER BY genre_name');
        res.json(genres);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch genres' });
    }
});

// GET /api/songs/albums - Get all albums
router.get('/albums', songsLimiter, async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const [albums] = await pool.query(`SELECT al.*, a.artist_name FROM albums al 
            LEFT JOIN artists a ON al.artist_id = a.artist_id ORDER BY al.title`);
        res.json(albums);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});

// POST /api/songs/:id/like - Toggle like
router.post('/:id/like', async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const songId = req.params.id;
        const [existing] = await pool.query('SELECT * FROM likes WHERE user_id = ? AND song_id = ?', [userId, songId]);
        
        if (existing.length > 0) {
            await pool.query('DELETE FROM likes WHERE user_id = ? AND song_id = ?', [userId, songId]);
            res.json({ liked: false });
        } else {
            await pool.query('INSERT INTO likes (user_id, song_id) VALUES (?, ?)', [userId, songId]);
            res.json({ liked: true });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

// POST /api/songs/:id/listen - Record a listen
router.post('/:id/listen', async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const songId = req.params.id;
        await pool.query('INSERT INTO listens (user_id, song_id) VALUES (?, ?)', [userId, songId]);
        await pool.query('INSERT INTO play_history (user_id, song_id) VALUES (?, ?)', [userId, songId]);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record listen' });
    }
});

// GET /api/songs/liked - Get user's liked songs
router.get('/liked', async (req, res) => {
    try {
        const pool = getPool(req.session.role || \'user\');
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const [songs] = await pool.query(`
            SELECT s.song_id, s.title AS song_title, s.duration, s.play_count,
                   s.image_url, s.jamendo_id,
                   a.artist_name, g.genre_name,
                   1 AS is_liked
            FROM likes l
            JOIN songs s ON l.song_id = s.song_id
            LEFT JOIN artists a ON s.artist_id = a.artist_id
            LEFT JOIN genres g ON s.genre_id = g.genre_id
            WHERE l.user_id = ?
            ORDER BY l.liked_date DESC`, [userId]);
        res.json(songs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch liked songs' });
    }
});

module.exports = router;
