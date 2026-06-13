/**
 * @file public/js/dashboard.js
 * @description Frontend logic for the main Discover panel. Handles fetching songs, pagination, playback queueing, and UI rendering.
 */

// dashboard.js — Discover page logic
let currentUser = null;
let allSongs = [];       // full result set from API
let currentSongs = [];   // current page slice
let isLoggingOut = false;

// ── Pagination ──
const PAGE_SIZE = 30;
let currentPage = 1;
let totalPages = 1;

// ── Helpers ──
function fmt(sec) { return `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`; }
function fmtPlays(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n; }
function showToast(msg, type='success') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3100);
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ── Internal nav guard ──
let isInternalNav = false;
document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && a.href && a.hostname === window.location.hostname) {
        isInternalNav = true;
        setTimeout(() => { isInternalNav = false; }, 100);
    }
});
window.addEventListener('beforeunload', e => {
    if (!isLoggingOut && !isInternalNav) { e.preventDefault(); e.returnValue = ''; }
});

// ── Auth check ──
window.addEventListener('pageshow', (e) => {
    if (e.persisted && !localStorage.getItem('beatbox_user')) {
        window.location.href = 'index.html';
    }
});

async function checkAuth() {
    try {
        const data = await fetch('/api/auth/me').then(r => r.json());
        if (!data.loggedIn) { window.location.href = 'index.html'; return; }
        currentUser = data.user;
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
        const roleStr = currentUser.role || 'user';
        document.getElementById('userRole').textContent = roleStr.charAt(0).toUpperCase() + roleStr.slice(1);
        if (roleStr === 'admin' || roleStr === 'owner') {
            const s = document.getElementById('adminNavSection');
            if (s) s.style.display = '';
        }
    } catch {
        window.location.href = 'index.html';
    }
}

// ── Load filters ──
async function loadFilters() {
    try {
        const genres = await fetch('/api/songs/genres').then(r => r.json());
        const gs = document.getElementById('genreFilter');
        genres.forEach(g => {
            const o = document.createElement('option');
            o.value = g.genre_id; o.textContent = g.genre_name;
            gs.appendChild(o);
        });
    } catch {}
}

// ── Render current page of songs ──
function renderPage() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    currentSongs = allSongs.slice(start, end);
    const tbody = document.getElementById('trackBody');

    if (!currentSongs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">🎵</div><p>No songs found</p></td></tr>';
        renderPagination();
        return;
    }

    tbody.innerHTML = currentSongs.map((s, i) => {
        const globalIdx = start + i;
        const cover = s.image_url
            ? `<img class="track-cover" src="${s.image_url}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'track-cover-placeholder\\'>🎵</div>'">`
            : `<div class="track-cover-placeholder">🎵</div>`;
        return `
        <tr class="track-row" data-song-id="${s.song_id}">
            <td>
                <span class="track-num">${globalIdx + 1}</span>
                <span class="track-play-icon" onclick="playSong(${globalIdx})">▶</span>
            </td>
            <td>
                <div class="track-info">
                    ${cover}
                    <div class="track-text">
                        <div class="track-title">${s.song_title || s.title}</div>
                    </div>
                </div>
            </td>
            <td class="col-artist">${s.artist_name || '—'}</td>
            <td class="col-album">${s.album_title || '—'}</td>
            <td class="col-genre">${s.genre_name || '—'}</td>
            <td class="col-duration" style="text-align:right">${fmt(s.duration)}</td>
            <td>
                <div class="track-actions">
                    <button class="icon-btn" onclick="likeSong(${s.song_id})" title="${s.is_liked ? 'Unlike' : 'Like'}" style="${s.is_liked ? 'color:#ff3b3b;' : ''}">${s.is_liked ? '❤️' : '♥'}</button>
                    <button class="icon-btn" onclick="openAddToPlaylist(${s.song_id})" title="Add to Playlist">+</button>
                    <button class="icon-btn" onclick="Player.addToQueue(${globalIdx})" title="Add to Queue">➕</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPagination();
    document.querySelector('.main').scrollTop = 0;
}

// ── Render pagination controls ──
function renderPagination() {
    let pag = document.getElementById('paginationControls');
    if (!pag) {
        pag = document.createElement('div');
        pag.id = 'paginationControls';
        pag.className = 'pagination';
        document.getElementById('trackListWrap').appendChild(pag);
    }

    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>`;

    const pages = new Set();
    pages.add(1);
    pages.add(totalPages);
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) pages.add(p);
    const sorted = [...pages].sort((a,b) => a - b);

    let lastP = 0;
    for (const p of sorted) {
        if (p - lastP > 1) html += `<span class="page-info">…</span>`;
        html += `<button class="${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
        lastP = p;
    }

    html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>`;
    pag.innerHTML = html;
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderPage();
}

// ── Load songs ──
async function loadSongs() {
    currentPage = 1;
    const search = document.getElementById('searchInput').value;
    const genre = document.getElementById('genreFilter').value;
    const sort = document.getElementById('sortFilter').value;
    let url = `/api/songs?sort=${sort}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (genre) url += `&genre=${genre}`;

    try {
        const songs = await fetch(url).then(r => r.json());
        allSongs = songs;
        totalPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE));
        document.getElementById('pageSubtitle').textContent = `${songs.length} tracks`;

        if (!songs.length) {
            document.getElementById('trackBody').innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">🎵</div><p>No songs found</p></td></tr>';
            renderPagination();
            return;
        }
        renderPage();
    } catch {
        document.getElementById('trackBody').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load songs.</td></tr>';
    }
}

// ── Init ──
let discoverInitialized = false;
window.initDiscoverView = async () => {
    if (!discoverInitialized) {
        await checkAuth();
        await loadFilters();

        document.getElementById('searchInput').addEventListener('input', debounce(loadSongs, 350));
        document.getElementById('genreFilter').addEventListener('change', loadSongs);
        document.getElementById('sortFilter').addEventListener('change', loadSongs);

        document.getElementById('logoutLink').addEventListener('click', async (e) => {
            e.preventDefault();
            isLoggingOut = true;
            await fetch('/api/auth/logout', { method: 'POST' });
            localStorage.removeItem('beatbox_user');
            window.location.href = 'index.html';
        });
        discoverInitialized = true;
    }
    await loadSongs();
};

window.loadLikedSongs = async () => {
    if (!discoverInitialized) {
        await window.initDiscoverView();
    }
    document.getElementById('pageTitle').textContent = 'Liked Songs';
    document.getElementById('pageSubtitle').textContent = 'Your favorites';
    document.getElementById('filterRow').style.display = 'none';

    try {
        const songs = await fetch('/api/songs/liked').then(r => r.json());
        allSongs = songs;
        totalPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE));
        currentPage = 1;
        document.getElementById('pageSubtitle').textContent = `${songs.length} liked songs`;
        if (!songs.length) {
            document.getElementById('trackBody').innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">❤️</div><p>No liked songs yet</p></td></tr>';
            renderPagination();
            return;
        }
        renderPage();
    } catch { document.getElementById('trackBody').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load.</td></tr>'; }
};
function playSong(globalIndex) {
    const s = allSongs[globalIndex];
    if (!s) return;
    Player.setQueue(allSongs, globalIndex);
    Player.playTrack(s);
}

async function likeSong(id) {
    try {
        const data = await fetch(`/api/songs/${id}/like`, { method: 'POST' }).then(r => r.json());
        showToast(data.liked ? 'Liked ❤️' : 'Removed from likes');
        
        // Update heart icon visually
        const rows = document.querySelectorAll(`tr[data-song-id="${id}"] .icon-btn:first-child`);
        rows.forEach(btn => {
            if (data.liked) {
                btn.style.color = '#ff3b3b';
                btn.innerHTML = '❤️';
            } else {
                btn.style.color = '';
                btn.innerHTML = '♥';
            }
        });
        
    } catch { showToast('Login required', 'error'); }
}

async function openAddToPlaylist(songId) {
    document.getElementById('addToPlaylistModal').classList.add('open');
    const container = document.getElementById('playlistListModal');
    try {
        const playlists = await fetch('/api/playlists').then(r => r.json());
        if (!playlists.length) { container.innerHTML = '<p style="color:var(--text-muted)">No playlists. Create one first.</p>'; return; }
        container.innerHTML = playlists.map(p => `
            <div class="modal-option" onclick="addToPlaylist(${p.playlist_id}, ${songId})">
                📋 ${p.playlist_name} <span style="color:var(--text-muted);font-size:.78rem">(${p.song_count} songs)</span>
            </div>`).join('');
    } catch { container.innerHTML = '<p>Failed to load playlists</p>'; }
}

async function addToPlaylist(playlistId, songId) {
    try {
        await fetch(`/api/playlists/${playlistId}/songs`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ song_id: songId })
        });
        showToast('Added to playlist ✓');
        closeModal('addToPlaylistModal');
    } catch { showToast('Failed', 'error'); }
}
