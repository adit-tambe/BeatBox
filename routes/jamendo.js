/**
 * @file routes/jamendo.js
 * @description External API integration with Jamendo to fetch and seed real royalty-free music into the database.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../db');
const router = express.Router();

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID || '';
const JAMENDO_API = 'https://api.jamendo.com/v3.0';

const jamendoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // Reduced from 300 to prevent API spam while allowing normal usage
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' }
});

async function fetchJamendo(endpoint, params = {}) {
    if (!JAMENDO_CLIENT_ID) {
        throw new Error('JAMENDO_CLIENT_ID not configured');
    }
    const url = new URL(`${JAMENDO_API}${endpoint}`);
    url.searchParams.set('client_id', JAMENDO_CLIENT_ID);
    url.searchParams.set('format', 'json');
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
        }
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`Jamendo API error: ${res.status}`);
    }
    return res.json();
}

async function seedFromJamendo(pool) {
    if (!JAMENDO_CLIENT_ID) {
        console.log('   JAMENDO_CLIENT_ID not set — skipping Jamendo seed');
        return;
    }
    try {
        const [existing] = await pool.query('SELECT COUNT(*) as c FROM songs WHERE jamendo_id IS NOT NULL');
        if (existing[0].c > 0) {
            console.log(`   ${existing[0].c} Jamendo songs already seeded`);
            return;
        }
        console.log('   Seeding Jamendo tracks into the database (fetching multiple pages)...');
        let allTracks = [];
        for (let i = 0; i < 5; i++) {
            try {
                const data = await fetchJamendo('/tracks', { limit: 200, offset: i * 200, order: 'popularity_week', include: 'musicinfo' });
                if (data.results && data.results.length > 0) {
                    allTracks.push(...data.results);
                } else {
                    break;
                }
            } catch(e) { console.error('Error fetching Jamendo page', i); break; }
        }
        const tracks = allTracks;
        if (tracks.length === 0) {
            console.log('   No Jamendo tracks returned. Check your client ID.');
            return;
        }
        let inserted = 0;
        for (const track of tracks) {
            try {
                const genreName = track.artist_name === 'Various Artists' ? 'Other' : (track.musicinfo?.tags?.genres?.[0] || 'Other');

                await pool.query('INSERT IGNORE INTO genres (genre_name) VALUES (?)', [genreName]);
                const [genreRows] = await pool.query('SELECT genre_id FROM genres WHERE genre_name = ?', [genreName]);
                const genreId = genreRows[0]?.genre_id || null;

                const artistName = track.artist_name || 'Unknown Artist';
                await pool.query('INSERT IGNORE INTO artists (artist_name) VALUES (?)', [artistName]);
                const [artistRows] = await pool.query('SELECT artist_id FROM artists WHERE artist_name = ?', [artistName]);
                const artistId = artistRows[0]?.artist_id || null;

                const albumName = track.album_name || 'Unknown Album';
                await pool.query('INSERT IGNORE INTO albums (title, artist_id) VALUES (?, ?)', [albumName, artistId]);
                const [albumRows] = await pool.query('SELECT album_id FROM albums WHERE title = ? AND artist_id = ?', [albumName, artistId]);
                const albumId = albumRows[0]?.album_id || null;

                const imageUrl = track.image || '';
                const trackId = parseInt(track.id, 10);
                const duration = parseInt(track.duration, 10) || 0;

                await pool.query(
                    `INSERT IGNORE INTO songs (title, duration, release_date, album_id, genre_id, artist_id, image_url, jamendo_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [track.name, duration, track.releasedate || null, albumId, genreId, artistId, imageUrl, trackId]
                );
                inserted++;
            } catch (err) {
                console.error('   Error inserting track:', track.name, err.message.substring(0, 60));
            }
        }
        console.log(`   Inserted ${inserted} Jamendo tracks`);
    } catch (err) {
        console.error('   Jamendo seed error:', err.message);
    }
}

async function getTrackAudioUrl(trackId) {
    const data = await fetchJamendo('/tracks', { id: trackId });
    const tracks = data.results || [];
    if (tracks.length === 0) return null;
    return {
        audio: tracks[0].audio || null,
        audiodownload: tracks[0].audiodownload || null,
        image: tracks[0].image || null
    };
}

router.get('/search', jamendoLimiter, async (req, res) => {
    try {
        const { q, limit, offset } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query required' });
        }
        const data = await fetchJamendo('/tracks', {
            search: q,
            limit: parseInt(limit, 10) || 20,
            offset: parseInt(offset, 10) || 0
        });
        res.json(data);
    } catch (err) {
        console.error('Jamendo search error:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

router.get('/tracks', jamendoLimiter, async (req, res) => {
    try {
        const { limit, offset, order } = req.query;
        const data = await fetchJamendo('/tracks', {
            limit: parseInt(limit, 10) || 50,
            offset: parseInt(offset, 10) || 0,
            order: order || 'popularity_week',
            include: 'musicinfo'
        });
        res.json(data);
    } catch (err) {
        console.error('Jamendo tracks error:', err.message);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

router.get('/tracks/:id', jamendoLimiter, async (req, res) => {
    try {
        const data = await fetchJamendo('/tracks', { id: req.params.id });
        res.json(data);
    } catch (err) {
        console.error('Jamendo track error:', err.message);
        res.status(500).json({ error: 'Failed to fetch track' });
    }
});

router.get('/play/:id', jamendoLimiter, async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        const trackId = parseInt(req.params.id, 10);
        if (isNaN(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }
        const urls = await getTrackAudioUrl(trackId);
        if (!urls || !urls.audio) {
            return res.status(404).json({ error: 'Track not found or audio unavailable' });
        }
        // Removed direct play_count update to prevent double counting (handled by /listen endpoint trigger)
        const [rows] = await pool.query(
            'SELECT song_id, title, image_url FROM songs WHERE jamendo_id = ?', [trackId]
        );
        res.json({
            audio_url: urls.audio,
            download_url: urls.audiodownload,
            image: urls.image,
            song: rows[0] || null
        });
    } catch (err) {
        console.error('Play error:', err.message);
        res.status(500).json({ error: 'Failed to get audio URL' });
    }
});

router.get('/artists', jamendoLimiter, async (req, res) => {
    try {
        const data = await fetchJamendo('/artists', {
            limit: parseInt(req.query.limit, 10) || 50,
            offset: parseInt(req.query.offset, 10) || 0
        });
        res.json(data);
    } catch (err) {
        console.error('Jamendo artists error:', err.message);
        res.status(500).json({ error: 'Failed to fetch artists' });
    }
});

router.get('/albums', jamendoLimiter, async (req, res) => {
    try {
        const data = await fetchJamendo('/albums', {
            limit: parseInt(req.query.limit, 10) || 50,
            offset: parseInt(req.query.offset, 10) || 0
        });
        res.json(data);
    } catch (err) {
        console.error('Jamendo albums error:', err.message);
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});

router.post('/seed', async (req, res) => {
    try {
        const pool = getPool(req.session.role || 'user');
        await seedFromJamendo(pool);
        res.json({ success: true, message: 'Jamendo data seeded successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Seed failed: ' + err.message });
    }
});

module.exports = { router, seedFromJamendo };
