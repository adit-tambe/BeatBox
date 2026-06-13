// admin.js — Admin panel logic

function showToast(msg, type='success') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3100);
}

// Nav guard is handled by dashboard.js
function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
}

let adminRole = 'user';

async function checkAdminAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.loggedIn || !['owner', 'admin'].includes(data.user.role)) { 
            isInternalNav = true;
            window.location.href = data.loggedIn ? 'app.html#discover' : 'index.html'; 
            return false; 
        }
        adminRole = data.user.role;
        document.getElementById('userName').textContent = data.user.name;
        document.getElementById('userAvatar').textContent = data.user.name.charAt(0).toUpperCase();
        return true;
    } catch { 
        isInternalNav = true;
        window.location.href = 'index.html'; 
        return false;
    }
}

async function loadStats() {
    try {
        const s = await fetch('/api/admin/stats').then(r => r.json());
        document.getElementById('statUsers').textContent = s.users;
        document.getElementById('statSongs').textContent = s.songs;
        document.getElementById('statArtists').textContent = s.artists;
        document.getElementById('statPlaylists').textContent = s.playlists;
        document.getElementById('statListens').textContent = s.listens;
    } catch {
        document.getElementById('statUsers').textContent = 'Error';
        document.getElementById('statSongs').textContent = 'Error';
        document.getElementById('statArtists').textContent = 'Error';
        document.getElementById('statPlaylists').textContent = 'Error';
        document.getElementById('statListens').textContent = 'Error';
    }
}

async function loadAdminSongs() {
    try {
        const songs = await fetch('/api/admin/songs').then(r => r.json());
        document.getElementById('adminSongsBody').innerHTML = songs.map(s => `
            <tr class="track-row">
                <td style="color:var(--text-muted);font-size:.8rem">${s.song_id}</td>
                <td class="track-title" style="font-weight:600">${s.title}</td>
                <td class="col-artist">${s.artist_name || '—'}</td>
                <td class="col-album">${s.album_title || '—'}</td>
                <td class="col-genre">${s.genre_name || '—'}</td>
                <td style="color:var(--text-muted)">${s.play_count}</td>
                <td><button class="btn btn-danger btn-xs" onclick="deleteSong(${s.song_id})">Delete</button></td>
            </tr>`).join('');
    } catch {
        document.getElementById('adminSongsBody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--error)">Failed to load songs. Unauthorized?</td></tr>';
    }
}

async function loadArtists() {
    try {
        const artists = await fetch('/api/admin/artists-list').then(r => r.json());
        document.getElementById('adminArtistsBody').innerHTML = artists.map(a => `
            <tr class="track-row">
                <td style="color:var(--text-muted);font-size:.8rem">${a.artist_id}</td>
                <td class="track-title" style="font-weight:600">${a.artist_name}</td>
                <td>${a.country || '—'}</td>
                <td><span class="pill btn-xs" style="background:${a.is_hidden ? 'var(--error)' : 'var(--primary)'};color:white">${a.is_hidden ? 'Hidden' : 'Visible'}</span></td>
                <td><button class="btn btn-secondary btn-xs" onclick="toggleArtistVisibility(${a.artist_id})">${a.is_hidden ? 'Show' : 'Hide'}</button></td>
            </tr>`).join('');
    } catch {
        document.getElementById('adminArtistsBody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--error)">Failed to load artists.</td></tr>';
    }
}

async function toggleArtistVisibility(id) {
    try {
        await fetch(`/api/admin/artists/${id}/toggle-hide`, { method: 'POST' });
        showToast('Artist visibility updated');
        await loadArtists();
    } catch { showToast('Failed', 'error'); }
}

async function loadUsers() {
    try {
        const users = await fetch('/api/admin/users').then(r => r.json());
        document.getElementById('adminUsersBody').innerHTML = users.map(u => `
            <tr class="track-row">
                <td style="color:var(--text-muted);font-size:.8rem">${u.user_id}</td>
                <td style="font-weight:600">${u.name}</td>
                <td class="col-artist">${u.email}</td>
                <td><span class="pill btn-xs" style="padding:2px 10px">${u.subscription_type}</span></td>
                <td style="color:var(--text-muted);font-size:.82rem">${new Date(u.join_date).toLocaleDateString()}</td>
                <td>
                    <select class="role-select" onchange="changeUserRole(${u.user_id}, this.value)" ${adminRole !== 'owner' || u.role === 'owner' ? 'disabled' : ''}>
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="owner" ${u.role === 'owner' ? 'selected' : ''} disabled>Owner</option>
                    </select>
                </td>
            </tr>`).join('');
    } catch {
        document.getElementById('adminUsersBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--error)">Failed to load users.</td></tr>';
    }
}

async function changeUserRole(userId, newRole) {
    try {
        const res = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Role updated successfully');
        } else {
            showToast(data.error || 'Failed to update role', 'error');
            await loadUsers(); // reload to reset dropdown
        }
    } catch (e) {
        showToast('Error updating role', 'error');
        await loadUsers();
    }
}

async function loadRoles() {
    try {
        const roles = await fetch('/api/admin/db-roles').then(r => r.json());
        document.getElementById('rolesContainer').innerHTML = roles.map(r => `
            <div class="role-card">
                <h4>${r.user}</h4>
                <div class="grants">${r.grants.join('<br>')}</div>
                <div class="role-btns">
                    <button class="btn btn-secondary btn-xs" onclick="testRole('${r.user.replace('beatbox_','')}','read',this)">Test Read</button>
                    <button class="btn btn-secondary btn-xs" onclick="testRole('${r.user.replace('beatbox_','')}','write',this)">Test Write</button>
                </div>
                <div class="test-result" style="display:none"></div>
            </div>`).join('');
    } catch {
        document.getElementById('rolesContainer').innerHTML = '<div style="text-align:center;color:var(--error)">Failed to load DB roles.</div>';
    }
}

async function testRole(role, op, btn) {
    const result = btn.closest('.role-card').querySelector('.test-result');
    result.style.display = 'block';
    result.textContent = 'Testing…';
    try {
        const data = await fetch('/api/admin/test-role', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ role, operation: op })
        }).then(r => r.json());
        result.textContent = data.result || data.message || 'Done';
    } catch { result.textContent = 'Test failed'; }
}

async function addSong() {
    const title = document.getElementById('newSongTitle').value.trim();
    const duration = parseInt(document.getElementById('newSongDuration').value) || 0;
    if (!title) return showToast('Title required', 'error');
    try {
        await fetch('/api/admin/songs', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ title, duration })
        });
        showToast('Song added');
        document.getElementById('newSongTitle').value = '';
        document.getElementById('newSongDuration').value = '';
        await loadAdminSongs();
    } catch { showToast('Failed', 'error'); }
}

async function deleteSong(id) {
    if (!confirm('Delete this song?')) return;
    try {
        await fetch(`/api/admin/songs/${id}`, { method: 'DELETE' });
        showToast('Deleted');
        await loadAdminSongs();
    } catch { showToast('Failed', 'error'); }
}

// ── Init ──
let adminInitialized = false;
window.initAdminView = async () => {
    if (!adminInitialized) {
        const authed = await checkAdminAuth();
        if (!authed) return;
        adminInitialized = true;
    }
    await Promise.all([loadStats(), loadAdminSongs(), loadUsers(), loadRoles(), loadArtists()]);
};
