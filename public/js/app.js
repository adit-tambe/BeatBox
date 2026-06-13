// app.js — Frontend SPA Router & Global Logic

// Handle routing based on hash
function handleRoute() {
    let hash = window.location.hash || '#discover';
    
    // Hide all views
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
    
    // Reset page titles
    document.getElementById('pageTitle').textContent = 'Discover Music';
    document.getElementById('pageSubtitle').textContent = 'Browse our library of tracks';
    document.getElementById('filterRow').style.display = 'flex';
    
    if (hash === '#playlists') {
        document.getElementById('view-playlists').classList.add('active');
        const nav = document.getElementById('navPlaylists');
        if(nav) nav.classList.add('active');
        if (typeof window.initPlaylistsView === 'function') window.initPlaylistsView();
    } else if (hash === '#admin') {
        document.getElementById('view-admin').classList.add('active');
        const nav = document.getElementById('navAdmin');
        if(nav) nav.classList.add('active');
        if (typeof window.initAdminView === 'function') window.initAdminView();
    } else if (hash === '#liked') {
        document.getElementById('view-discover').classList.add('active');
        const nav = document.getElementById('navLiked');
        if(nav) nav.classList.add('active');
        if (typeof window.loadLikedSongs === 'function') window.loadLikedSongs();
    } else { // #discover
        document.getElementById('view-discover').classList.add('active');
        const nav = document.getElementById('navDiscover');
        if(nav) nav.classList.add('active');
        if (typeof window.initDiscoverView === 'function') window.initDiscoverView();
    }
}

// Queue toggler
document.getElementById('queueToggleBtn').addEventListener('click', () => {
    document.getElementById('queuePanel').classList.toggle('open');
    renderQueue();
});

function renderQueue() {
    const list = document.getElementById('queueList');
    if (!Player.queue || Player.queue.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin-top:20px;">Queue is empty</div>';
        return;
    }
    
    list.innerHTML = Player.queue.map((s, i) => `
        <div class="queue-item" draggable="true" ondragstart="dragQueue(event, ${i})" ondragover="allowDrop(event)" ondrop="dropQueue(event, ${i})">
            <div style="font-size:1.2rem;color:var(--text-muted);cursor:grab">≡</div>
            <div class="track-text">
                <div style="font-weight:500">${s.song_title || s.title}</div>
                <div style="color:var(--text-muted);font-size:0.75rem">${s.artist_name || 'Unknown'}</div>
            </div>
            <div class="queue-controls">
                <button class="queue-btn" onclick="Player.playFromQueue(${i})" title="Play">▶</button>
                <button class="queue-btn" onclick="Player.removeFromQueue(${i})" title="Remove">&times;</button>
            </div>
        </div>
    `).join('');
}

let draggedQueueIdx = -1;
window.dragQueue = function(e, idx) { draggedQueueIdx = idx; };
window.allowDrop = function(e) { e.preventDefault(); };
window.dropQueue = function(e, dropIdx) {
    e.preventDefault();
    if (draggedQueueIdx === -1 || draggedQueueIdx === dropIdx) return;
    const item = Player.queue.splice(draggedQueueIdx, 1)[0];
    Player.queue.splice(dropIdx, 0, item);
    renderQueue();
};

window.addEventListener('hashchange', handleRoute);

// Wait for all other DOMContentLoaded to finish, then route
setTimeout(() => {
    handleRoute();
}, 100);
