// chatbot.js — BeatBot chatbot UI
(() => {
    const toggle = document.getElementById('chatToggle');
    const panel = document.getElementById('chatWindow');
    const msgs = document.getElementById('chatMessages');
    const input = document.getElementById('chatInput');
    const send = document.getElementById('chatSend');

    if (!toggle || !panel) return;

    toggle.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) input.focus();
    });

    function addBubble(text, who) {
        const d = document.createElement('div');
        d.className = `chat-bubble ${who}`;
        d.innerHTML = text;
        msgs.appendChild(d);
        msgs.scrollTop = msgs.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;
        addBubble(msg, 'user');
        input.value = '';

        try {
            const data = await fetch('/api/ai/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            }).then(r => r.json());

            // Parse simple markdown
            let html = (data.response || 'Hmm, I\'m not sure.')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');

            if (data.songs && data.songs.length) {
                html += '<div style="margin-top:8px">';
                data.songs.forEach(s => {
                    const label = s.song_title ? `${s.song_title} — ${s.artist_name || ''}` : `${s.title} — ${s.artist || ''}`;
                    html += `<span style="display:inline-block;background:var(--bg-input);border:1px solid var(--border);border-radius:20px;padding:4px 12px;margin:3px 3px 3px 0;font-size:.78rem">${label}</span>`;
                });
                html += '</div>';
            }
            if (data.redirect) {
                const routeMap = { 
                    '/': { path: 'index.html', label: 'Login' }, 
                    '/register.html': { path: 'index.html#register', label: 'Register' }, 
                    '/dashboard.html': { path: '#discover', label: 'Discover' }, 
                    '/playlist.html': { path: '#playlists', label: 'Playlists' }, 
                    '/admin.html': { path: '#admin', label: 'Admin' },
                    '#liked': { path: '#liked', label: 'Liked Songs' }
                };
                const route = routeMap[data.redirect] || { path: data.redirect, label: 'Page' };
                html += `<div style="margin-top:8px"><button class="btn btn-secondary btn-xs" onclick="window.location.href='${route.path}'">➡️ Go to ${route.label}</button></div>`;
            }
            addBubble(html, 'bot');
        } catch {
            addBubble('Sorry, something went wrong. Try again!', 'bot');
        }
    }

    send.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
})();
