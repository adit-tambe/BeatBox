/**
 * @file public/js/player.js
 * @description Frontend audio player logic. Manages the HTML5 Audio context, play/pause state, volume, progress bar, and queue management.
 */

// player.js — Audio Player Module
const Player = (() => {
    const audio = document.getElementById('audioPlayer');
    const playBtn = document.getElementById('playerPlayBtn');
    const prevBtn = document.getElementById('playerPrevBtn');
    const nextBtn = document.getElementById('playerNextBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const currentTimeEl = document.getElementById('playerCurrentTime');
    const durationEl = document.getElementById('playerDuration');
    const coverEl = document.getElementById('playerCover');
    const titleEl = document.getElementById('playerTitle');
    const artistEl = document.getElementById('playerArtist');
    const volumeBtn = document.getElementById('playerVolumeBtn');
    const volumeBar = document.getElementById('volumeBar');
    const volumeFill = document.getElementById('volumeFill');

    let contextTracks = [];
    let contextIndex = -1;
    let userQueue = [];

    function fmt(s) {
        if (isNaN(s) || !isFinite(s)) return '0:00';
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    }

    function updateProgress() {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = Math.min(pct, 100) + '%';
        currentTimeEl.textContent = fmt(audio.currentTime);
        durationEl.textContent = fmt(audio.duration);
    }

    function setTrackInfo(info) {
        if (info.image) {
            coverEl.src = info.image;
            coverEl.style.display = '';
        } else {
            coverEl.style.display = 'none';
        }
        titleEl.textContent = info.title || 'Unknown';
        artistEl.textContent = info.artist || 'Unknown Artist';
    }

    async function playTrack(track) {
        if (!track || !track.jamendo_id) {
            showToast('Cannot play — no audio source', 'error');
            return;
        }
        playBtn.textContent = '⏳';
        try {
            const res = await fetch(`/api/jamendo/play/${track.jamendo_id}`);
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            if (!data.audio_url) { showToast('Audio unavailable', 'error'); playBtn.textContent = '▶'; return; }

            audio.src = data.audio_url;
            setTrackInfo({
                image: data.image || track.image_url,
                title: track.song_title || track.title,
                artist: track.artist_name || track.artist
            });
            await audio.play();
            playBtn.textContent = '⏸';

            // highlight playing row
            document.querySelectorAll('.track-row.playing').forEach(r => r.classList.remove('playing'));
            const row = document.querySelector(`[data-song-id="${track.song_id}"]`);
            if (row) row.classList.add('playing');

            if (track.song_id) fetch(`/api/songs/${track.song_id}/listen`, { method: 'POST' }).catch(() => {});
        } catch {
            showToast('Playback failed', 'error');
            playBtn.textContent = '▶';
        }
    }

    function togglePlay() {
        if (audio.paused && audio.src) { audio.play(); playBtn.textContent = '⏸'; }
        else if (!audio.paused) { audio.pause(); playBtn.textContent = '▶'; }
    }

    function setVolume(pct) {
        const v = Math.max(0, Math.min(1, pct / 100));
        audio.volume = v;
        volumeFill.style.width = (v * 100) + '%';
        volumeBtn.textContent = v === 0 ? '🔇' : v < .5 ? '🔉' : '🔊';
    }

    function setQueue(tracks, startIndex) { contextTracks = tracks; contextIndex = startIndex; }

    function playNext() {
        if (userQueue.length > 0) {
            const nextTrack = userQueue.shift();
            if (typeof window.renderQueue === 'function') window.renderQueue();
            playTrack(nextTrack);
            return;
        }
        if (!contextTracks.length) return;
        contextIndex = (contextIndex + 1) % contextTracks.length;
        playTrack(contextTracks[contextIndex]);
    }

    function playPrev() {
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        if (!contextTracks.length) return;
        contextIndex = contextIndex <= 0 ? contextTracks.length - 1 : contextIndex - 1;
        playTrack(contextTracks[contextIndex]);
    }

    function addToQueue(globalIndex) {
        if (typeof allSongs !== 'undefined' && allSongs[globalIndex]) {
            userQueue.push(allSongs[globalIndex]);
            if (typeof window.renderQueue === 'function') window.renderQueue();
            showToast('Added to Queue');
        }
    }

    function playFromQueue(idx) {
        if (idx >= 0 && idx < userQueue.length) {
            const track = userQueue.splice(idx, 1)[0];
            if (typeof window.renderQueue === 'function') window.renderQueue();
            playTrack(track);
        }
    }

    function removeFromQueue(idx) {
        if (idx >= 0 && idx < userQueue.length) {
            userQueue.splice(idx, 1);
            if (typeof window.renderQueue === 'function') window.renderQueue();
        }
    }

    // Events
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', () => durationEl.textContent = fmt(audio.duration));
    audio.addEventListener('ended', playNext);
    audio.addEventListener('play', () => playBtn.textContent = '⏸');
    audio.addEventListener('pause', () => playBtn.textContent = '▶');

    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrev);
    nextBtn.addEventListener('click', playNext);

    progressBar.addEventListener('click', (e) => {
        if (!audio.duration) return;
        audio.currentTime = ((e.clientX - progressBar.getBoundingClientRect().left) / progressBar.offsetWidth) * audio.duration;
    });

    volumeBar.addEventListener('click', (e) => {
        setVolume(((e.clientX - volumeBar.getBoundingClientRect().left) / volumeBar.offsetWidth) * 100);
    });

    volumeBtn.addEventListener('click', () => {
        if (audio.volume > 0) { audio.dataset.lastVol = audio.volume; setVolume(0); }
        else setVolume((parseFloat(audio.dataset.lastVol) || .7) * 100);
    });

    setVolume(70);

    return { 
        playTrack, 
        setQueue, 
        togglePlay, 
        setTrackInfo,
        get queue() { return userQueue; },
        set queue(v) { userQueue = v; },
        addToQueue,
        playFromQueue,
        removeFromQueue
    };
})();
