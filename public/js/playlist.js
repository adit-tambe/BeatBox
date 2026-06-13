/**
 * @file public/js/playlist.js
 * @description Frontend logic for the Playlists panel. Handles playlist creation, song batch selection, removal, and filtering.
 */

// playlist.js — Playlists page logic
let currentPlaylistId = null;
let playlistSongs = [];
let filteredPlaylistSongs = [];
let isSelectMode = false;
let selectedSongs = new Set();
let plGenresLoaded = false;

function fmt(sec) { return `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`; }
function showToast(msg, type='success') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3100);
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// checkAuth handled by dashboard.js
async function loadPlaylists() {
    try {
        const playlists = await fetch('/api/playlists').then(r => r.json());
        const grid = document.getElementById('playlistGrid');
        const createCard = `<div class="card card-create" onclick="openCreateModal()"><div class="plus">+</div><span style="font-size:.85rem;font-weight:500">New Playlist</span></div>`;
        if (!playlists.length) { grid.innerHTML = createCard; return; }
        grid.innerHTML = createCard + playlists.map(p => `
            <div class="card" onclick="openPlaylist(${p.playlist_id}, '${p.playlist_name.replace(/'/g,"\\'")}')">
                <div class="card-cover-placeholder">📋</div>
                <div class="card-title">${p.playlist_name}</div>
                <div class="card-desc">${p.song_count} songs</div>
                <button class="btn btn-danger btn-xs" onclick="event.stopPropagation(); deletePlaylist(${p.playlist_id})" style="margin-top:10px">Delete</button>
            </div>`).join('');
    } catch {}
}

function openCreateModal() {
    document.getElementById('createPlaylistModal').classList.add('open');
    document.getElementById('playlistName').focus();
}

async function openPlaylist(id, name) {
    currentPlaylistId = id;
    document.getElementById('playlistsView').style.display = 'none';
    const detail = document.getElementById('playlistDetailView');
    detail.style.display = 'block';
    detail.classList.add('open');
    document.getElementById('detailPlaylistName').textContent = name;
    document.getElementById('searchResults').style.display = 'none';
    
    // reset selection
    isSelectMode = false;
    selectedSongs.clear();
    updateBatchUI();
    
    await loadPlaylistSongs(id);
    await loadRecommendations(id);
}

function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    selectedSongs.clear();
    updateBatchUI();
    renderPlaylistSongs();
}

function toggleSongSelection(songId, event) {
    if (event) event.stopPropagation();
    if (selectedSongs.has(songId)) selectedSongs.delete(songId);
    else selectedSongs.add(songId);
    updateBatchUI();
    renderPlaylistSongs();
}

function updateBatchUI() {
    const bar = document.getElementById('plBatchBar');
    const selectBtn = document.getElementById('plSelectBtn');
    
    if (isSelectMode) {
        selectBtn.style.background = 'var(--primary)';
        selectBtn.style.color = 'white';
        selectBtn.textContent = 'Cancel Selection';
    } else {
        selectBtn.style.background = 'var(--bg-input)';
        selectBtn.style.color = 'var(--text)';
        selectBtn.textContent = '☑️ Select Songs';
    }
    
    if (selectedSongs.size > 0 && isSelectMode) {
        bar.classList.add('active');
        document.getElementById('plBatchCount').textContent = `${selectedSongs.size} selected`;
    } else {
        bar.classList.remove('active');
    }
    
    // Check clipboard
    try {
        const clip = JSON.parse(localStorage.getItem('beatbox_clipboard') || '[]');
        document.getElementById('plPasteBtn').style.display = clip.length > 0 ? '' : 'none';
    } catch {}
}

async function loadPlaylistSongs(id) {
    try {
        const songs = await fetch(`/api/playlists/${id}/songs`).then(r => r.json());
        playlistSongs = songs;
        document.getElementById('detailSongCount').textContent = `${songs.length} songs`;
        if (!plGenresLoaded) {
            fetch('/api/songs/genres').then(r => r.json()).then(genres => {
                const gs = document.getElementById('plGenreFilter');
                if (gs.options.length <= 1) {
                    genres.forEach(g => {
                        const o = document.createElement('option');
                        o.value = g.genre_id; o.textContent = g.genre_name;
                        gs.appendChild(o);
                    });
                }
                plGenresLoaded = true;
            });
        }
        applyPlaylistFilters();
    } catch {}
}

function applyPlaylistFilters() {
    const q = document.getElementById('plFilterInput').value.toLowerCase();
    const g = document.getElementById('plGenreFilter').value;
    const sort = document.getElementById('plSortFilter').value;
    
    filteredPlaylistSongs = playlistSongs.filter(s => {
        if (q && !s.song_title.toLowerCase().includes(q) && !(s.artist_name || '').toLowerCase().includes(q)) return false;
        if (g && String(s.genre_id) !== String(g)) return false;
        return true;
    });
    
    filteredPlaylistSongs.sort((a, b) => {
        if (sort === 'newest') return new Date(b.added_date) - new Date(a.added_date);
        if (sort === 'oldest') return new Date(a.added_date) - new Date(b.added_date);
        if (sort === 'title') return a.song_title.localeCompare(b.song_title);
        if (sort === 'popular') return b.play_count - a.play_count;
        return 0;
    });
    
    renderPlaylistSongs();
}

function renderPlaylistSongs() {
    const tbody = document.getElementById('playlistSongsBody');
    document.querySelector('#playlistDetailView thead th.col-checkbox').style.display = isSelectMode ? '' : 'none';
    
    if (!filteredPlaylistSongs.length) {
        tbody.innerHTML = `<tr><td colspan="${isSelectMode ? 7 : 6}" class="empty-state"><div class="empty-icon">🎵</div><p>No songs yet. Search and add above!</p></td></tr>`;
        return;
    }
    
    tbody.innerHTML = filteredPlaylistSongs.map((s, i) => {
        const cover = s.image_url
            ? `<img class="track-cover" src="${s.image_url}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'track-cover-placeholder\\'>🎵</div>'">`
            : `<div class="track-cover-placeholder">🎵</div>`;
            
        const checkbox = isSelectMode 
            ? `<td><input type="checkbox" ${selectedSongs.has(s.song_id) ? 'checked' : ''} onclick="toggleSongSelection(${s.song_id}, event)"></td>`
            : '';
            
        return `
        <tr class="track-row ${selectedSongs.has(s.song_id) ? 'selected' : ''}" data-song-id="${s.song_id}" onclick="${isSelectMode ? `toggleSongSelection(${s.song_id})` : ''}">
            ${checkbox}
            <td><span class="track-num">${i+1}</span><span class="track-play-icon" onclick="playFromPlaylist(${i}, event)">▶</span></td>
            <td><div class="track-info">${cover}<div class="track-text"><div class="track-title">${s.song_title}</div></div></div></td>
            <td class="col-artist">${s.artist_name || '—'}</td>
            <td class="col-genre">${s.genre_name || '—'}</td>
            <td class="col-duration" style="text-align:right">${fmt(s.duration)}</td>
            <td><div class="track-actions" style="opacity:1"><button class="icon-btn" onclick="removeSong(${s.song_id}, event)" title="Remove" style="color:#ef4444">✕</button></div></td>
        </tr>`;
    }).join('');
}

async function loadRecommendations(id) {
    try {
        const recs = await fetch(`/api/playlists/${id}/recommendations`).then(r => r.json());
        const tbody = document.getElementById('plRecommendationsBody');
        if (!recs || !recs.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;">No recommendations found</td></tr>';
            return;
        }
        tbody.innerHTML = recs.map(s => `
            <tr class="track-row">
                <td><img class="track-cover" src="${s.image_url || ''}" onerror="this.style.display='none'"></td>
                <td class="track-title">${s.song_title}</td>
                <td class="col-artist">${s.artist_name || '—'}</td>
                <td class="col-genre">${s.genre_name || '—'}</td>
                <td><button class="btn btn-secondary btn-xs" onclick="addSongToPlaylist(${s.song_id})">+ Add</button></td>
            </tr>`).join('');
    } catch {
        document.getElementById('plRecommendationsBody').innerHTML = '<tr><td colspan="5">Failed to load</td></tr>';
    }
}

function playFromPlaylist(index, e) {
    if (e) e.stopPropagation();
    if (isSelectMode) return;
    const s = filteredPlaylistSongs[index];
    if (!s) return;
    Player.setQueue(filteredPlaylistSongs, index);
    Player.playTrack(s);
}

function shufflePlay() {
    if (!filteredPlaylistSongs.length) return;
    const shuffled = [...filteredPlaylistSongs].sort(() => Math.random() - 0.5);
    Player.setQueue(shuffled, 0);
    Player.playTrack(shuffled[0]);
}

// Batch Actions
function batchCopy() {
    if (selectedSongs.size === 0) return;
    localStorage.setItem('beatbox_clipboard', JSON.stringify([...selectedSongs]));
    showToast(`${selectedSongs.size} songs copied`);
    toggleSelectMode(); // disable selection
}

function batchQueue() {
    if (selectedSongs.size === 0) return;
    const ids = [...selectedSongs];
    const songsToQueue = playlistSongs.filter(s => ids.includes(s.song_id));
    songsToQueue.forEach(s => Player.queue.push(s));
    if (typeof renderQueue === 'function') renderQueue();
    showToast(`${songsToQueue.length} songs added to queue`);
    toggleSelectMode();
}

async function batchRemove() {
    if (selectedSongs.size === 0) return;
    if (!confirm(`Remove ${selectedSongs.size} songs from playlist?`)) return;
    try {
        const res = await fetch(`/api/playlists/${currentPlaylistId}/songs/batch`, {
            method: 'DELETE', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ song_ids: [...selectedSongs] })
        });
        if (!res.ok) throw new Error('Failed');
        showToast(`Songs removed`);
        toggleSelectMode();
        await loadPlaylistSongs(currentPlaylistId);
        await loadRecommendations(currentPlaylistId);
    } catch { showToast('Failed', 'error'); }
}

async function pasteSongs() {
    try {
        const clip = JSON.parse(localStorage.getItem('beatbox_clipboard') || '[]');
        if (!clip.length) return;
        
        const res = await fetch(`/api/playlists/${currentPlaylistId}/songs/batch`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ song_ids: clip })
        });
        if (!res.ok) throw new Error('Failed');
        showToast(`${clip.length} songs pasted`);
        await loadPlaylistSongs(currentPlaylistId);
    } catch { showToast('Failed', 'error'); }
}

async function searchSongsToAdd() {
    const q = document.getElementById('addSongSearch').value.trim();
    if (!q) return;
    try {
        const songs = await fetch(`/api/songs?search=${encodeURIComponent(q)}`).then(r => r.json());
        const container = document.getElementById('searchResults');
        const tbody = document.getElementById('searchResultsBody');
        container.style.display = 'block';
        if (!songs.length) { tbody.innerHTML = '<tr><td colspan="3">No songs found</td></tr>'; return; }
        tbody.innerHTML = songs.slice(0,10).map(s => `
            <tr class="track-row">
                <td class="track-title">${s.song_title}</td>
                <td class="col-artist">${s.artist_name || '—'}</td>
                <td><button class="btn btn-secondary btn-xs" onclick="addSongToPlaylist(${s.song_id})">+ Add</button></td>
            </tr>`).join('');
    } catch {}
}

async function addSongToPlaylist(songId) {
    try {
        const res = await fetch(`/api/playlists/${currentPlaylistId}/songs`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ song_id: songId })
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Song added ✓');
        await loadPlaylistSongs(currentPlaylistId);
        await loadRecommendations(currentPlaylistId);
    } catch { showToast('Failed to add song', 'error'); }
}

async function removeSong(songId, event) {
    if (event) event.stopPropagation();
    if (!confirm('Remove this song from playlist?')) return;
    try {
        const res = await fetch(`/api/playlists/${currentPlaylistId}/songs/batch`, {
            method: 'DELETE', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ song_ids: [songId] })
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Song removed');
        await loadPlaylistSongs(currentPlaylistId);
        await loadRecommendations(currentPlaylistId);
    } catch { showToast('Failed to remove song', 'error'); }
}

async function deletePlaylist(id) {
    if (!confirm('Delete this playlist?')) return;
    try {
        await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
        showToast('Playlist deleted');
        await loadPlaylists();
    } catch { showToast('Failed', 'error'); }
}

// ── Init ──
let plInitialized = false;
window.initPlaylistsView = async () => {
    if (!plInitialized) {
        await checkAuth();
        
        document.getElementById('backToPlaylists').addEventListener('click', () => {
            document.getElementById('playlistDetailView').style.display = 'none';
            document.getElementById('playlistDetailView').classList.remove('open');
            document.getElementById('playlistsView').style.display = 'block';
            loadPlaylists();
        });

        document.getElementById('createPlaylistForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('playlistName').value.trim();
            if (!name) return;
            try {
                await fetch('/api/playlists', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ playlist_name: name })
                });
                showToast('Playlist created 🎵');
                closeModal('createPlaylistModal');
                document.getElementById('playlistName').value = '';
                await loadPlaylists();
            } catch { showToast('Failed', 'error'); }
        });

        document.getElementById('searchSongBtn').addEventListener('click', searchSongsToAdd);
        document.getElementById('addSongSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchSongsToAdd(); });
        
        // Playlist UI controls
        document.getElementById('plShuffleBtn').addEventListener('click', shufflePlay);
        document.getElementById('plSelectBtn').addEventListener('click', toggleSelectMode);
        document.getElementById('plPasteBtn').addEventListener('click', pasteSongs);
        document.getElementById('plBatchCopy').addEventListener('click', batchCopy);
        document.getElementById('plBatchQueue').addEventListener('click', batchQueue);
        document.getElementById('plBatchRemove').addEventListener('click', batchRemove);
        
        document.getElementById('plFilterInput').addEventListener('input', applyPlaylistFilters);
        document.getElementById('plGenreFilter').addEventListener('change', applyPlaylistFilters);
        document.getElementById('plSortFilter').addEventListener('change', applyPlaylistFilters);

        plInitialized = true;
    }
    
    if (document.getElementById('playlistsView').style.display !== 'none') {
        await loadPlaylists();
    }
};
