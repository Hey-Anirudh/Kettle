import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE, MEDIA_API, WS_BASE, IS_NATIVE } from '../config';

const MusicContext = createContext();

export const useMusic = () => useContext(MusicContext);

export const MusicProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [queue, setQueue] = useState([]);
  const [volume, setVolumeState] = useState(0.5);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('none'); // none, one, all
  const [user, setUser] = useState(null);
  const [likedSongs, setLikedSongs] = useState(new Set());
  const [showQueue, setShowQueue] = useState(false);
  const [recentTracks, setRecentTracks] = useState([]);
  
  // Room (Jam) State
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomParticipants, setRoomParticipants] = useState([]);
  const [roomSettings, setRoomSettings] = useState({
    allow_skips: true,
    allow_add_to_queue: true,
    private_room: false
  });
  const [roomStatus, setRoomStatus] = useState('idle'); // idle | connecting | connected | error
  const wsRef = useRef(null);
  const isSyncingRef = useRef(false);
  const lastSyncAtRef = useRef(0); // ignore stale/duplicate sync messages
  
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new Audio(); // allocate once, not per render
  // Native builds: YouTube iframe player (the official, sanctioned embed)
  const ytMountRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const handleEndedRef = useRef(null);
  const queueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const progressRef = useRef(progress);
  const recentIdsRef = useRef(new Set()); // Track recently played to avoid loops
  const restoredTrackRef = useRef(false); // Restore runs once per session, not per user-object change
  const restoredSessionRef = useRef(null); // Restore profile state once per real session
  const upNextRef = useRef(null); // { forId, pick, pool } precomputed next track

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  // "Continue Listening" is DB-backed: /users/listen-history is the only
  // source of truth. No localStorage copy — the backend is the record.
  useEffect(() => {
    if (!user) return;
    // Live plays since app start outrank the DB snapshot — merge, don't clobber
    const token = localStorage.getItem('token');
    if (!token) return;
    let cancelled = false;
    fetch(`${API_BASE}/users/listen-history?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data || !Array.isArray(data.tracks)) return;
        setRecentTracks(prev => {
          if (prev.length === 0) return data.tracks;
          const seen = new Set(prev.map(t => t.id));
          return [...prev, ...data.tracks.filter(t => !seen.has(t.id))].slice(0, 20);
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const broadcastRoomState = useCallback((type, data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type, ...data })); } catch {}
    }
  }, []);

  useEffect(() => {
    if (IS_NATIVE) {
      try { ytPlayerRef.current?.setVolume(Math.round(volume * 100)); } catch {}
      return;
    }
    const audio = audioRef.current;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    const updateProgress = () => setProgress(audio.currentTime);
    // Number.isFinite guards against Infinity (streams without duration
    // metadata would render "Infinity:NaN" and break click-to-seek)
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleEnded = () => {
      if (repeatRef.current === 'one') {
        if (IS_NATIVE) {
          const p = ytPlayerRef.current;
          try { p?.seekTo(0, true); p?.playVideo(); } catch {}
          return;
        }
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        handleNextTrack();
      }
    };
    handleEndedRef.current = handleEnded;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  // Native: lazily inject the IFrame API script; create the player on first use
  const ensureYouTubePlayer = useCallback(() => new Promise((resolve, reject) => {
    if (ytPlayerRef.current) { resolve(ytPlayerRef.current); return; }
    if (!ytMountRef.current) { reject(new Error('YouTube mount missing')); return; }
    const create = () => {
      try {
        const target = document.createElement('div');
        ytMountRef.current.appendChild(target);
        ytPlayerRef.current = new window.YT.Player(target, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1,
            controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
          },
          events: {
            onReady: (e) => {
              try {
                const d = e.target.getDuration();
                if (Number.isFinite(d) && d > 0) setDuration(d);
              } catch {}
              resolve(ytPlayerRef.current);
            },
            onStateChange: (e) => {
              const S = window.YT && window.YT.PlayerState;
              if (S && e.data === S.PLAYING) setIsPlaying(true);
              else if (S && e.data === S.PAUSED) setIsPlaying(false);
              else if (S && e.data === S.ENDED) handleEndedRef.current?.();
            },
            onError: () => { setIsScraping(false); setIsPlaying(false); },
          },
        });
      } catch (err) { reject(err); }
    };
    if (window.YT && window.YT.Player) { create(); return; }
    window.onYouTubeIframeAPIReady = create;
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => reject(new Error('iframe_api failed to load'));
      document.head.appendChild(s);
    }
  }), []);

  // Native: poll progress/duration (the iframe exposes no timeupdate events)
  useEffect(() => {
    if (!IS_NATIVE) return;
    const id = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || typeof p.getCurrentTime !== 'function') return;
      try {
        const t = p.getCurrentTime();
        const d = p.getDuration();
        if (Number.isFinite(t)) setProgress(t);
        if (Number.isFinite(d) && d > 0) setDuration(d);
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Restore profile state (volume/shuffle/repeat/queue) exactly once per
  // session — NEVER re-apply user-object refreshes (profile saves, friend
  // refreshes) over top of the user's live choices.
  useEffect(() => {
    if (!user) return;
    if (restoredSessionRef.current === user.username) return;
    if (!(user.playback_state || user.current_queue)) return;
    restoredSessionRef.current = user.username;

    const state = user.playback_state || {};
    if (state.volume !== undefined) {
      setVolumeState(state.volume);
      audioRef.current.volume = state.volume;
    }
    if (state.shuffle !== undefined) setShuffle(state.shuffle);
    if (state.repeat !== undefined) setRepeat(state.repeat);

    if (user.current_queue && user.current_queue.length > 0) {
      setQueue(user.current_queue);
    }

    // Restore track if possible (once per token)
    if (state.track_id && !currentTrack && !restoredTrackRef.current) {
      restoredTrackRef.current = true;
      const track = user.current_queue?.find(t => t.id === state.track_id);
      if (track && IS_NATIVE) {
        // Native: display-only restore — the iframe loads when the user presses play
        setCurrentTrack(track);
        setProgress(state.progress || 0);
      } else if (track) {
        setCurrentTrack(track);
        // Set progress but don't auto-play to avoid browser blocks
        const audio = audioRef.current;
        const resumeAt = state.progress || 0;
        audio.src = `${MEDIA_API}/stream/${track.id}?title=${encodeURIComponent(track.title || '')}`;
        setProgress(resumeAt);
        const seekWhenReady = () => {
          try { audio.currentTime = resumeAt; } catch { /* stream rejected seek */ }
          audio.removeEventListener('loadedmetadata', seekWhenReady);
        };
        audio.addEventListener('loadedmetadata', seekWhenReady);
      }
    }
  }, [user]);

  // PERSISTENCE: Sync state to backend
  const syncTimerRef = useRef(null);
  const getPlaybackTime = useCallback(() => {
    if (IS_NATIVE) {
      try { return ytPlayerRef.current?.getCurrentTime?.() ?? progressRef.current; } catch { return progressRef.current; }
    }
    return audioRef.current.currentTime;
  }, []);

  const syncState = useCallback(async () => {
    if (!user) return;
    try {
      const state = {
        track_id: currentTrackRef.current?.id,
        progress: getPlaybackTime(),
        volume: audioRef.current.volume,
        shuffle: shuffleRef.current,
        repeat: repeatRef.current,
        isPlaying: isPlaying,
        last_updated: new Date().toISOString()
      };
      
      await fetch(`${API_BASE}/users/sync-state`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          current_queue: queueRef.current,
          playback_state: state
        })
      });
    } catch (e) {
      console.error("Sync failed:", e);
    }
  }, [user, isPlaying, getPlaybackTime]);

  useEffect(() => {
    if (!user) return;
    
    // Debounced sync every 5 seconds or on significant changes
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(syncState, 5000);
    
    return () => clearTimeout(syncTimerRef.current);
  }, [queue, currentTrack, volume, shuffle, repeat, isPlaying, syncState]);

  // Compute the next recommended track WHILE the current one plays and warm its
  // stream URL on the backend, so Skip / natural track-end starts instantly.
  const prepareNext = useCallback(async (track) => {
    if (!track) return;
    try {
      const res = await fetch(
        `${MEDIA_API}/recommendations?title=${encodeURIComponent(track.title)}&channel=${encodeURIComponent(track.channel || '')}&current_id=${track.id}`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        const fresh = data.results.filter(t => !recentIdsRef.current.has(t.id));
        const pool = fresh.length > 0 ? fresh : data.results;
        const pick = pool[Math.floor(Math.random() * Math.min(5, pool.length))];
        upNextRef.current = { forId: track.id, pick, pool };
        // Warm the backend's stream-URL cache for the pick
        fetch(`${MEDIA_API}/prefetch/${pick.id}`).catch(() => {});
      }
    } catch (e) {
      // Best-effort: handleNextTrack re-fetches on demand if this failed
    }
  }, []);

  const playTrack = useCallback(async (track, queueList = null, startTime = 0, fromRemote = false) => {
    // Guard: empty playlist / empty search results pass undefined here
    if (!track || !track.id) return;
    if (currentTrackRef.current?.id === track.id && !queueList && startTime === 0) {
      togglePlay();
      return;
    }

    if (queueList) {
      setQueue(queueList);
      // Warm the NEXT queued track so the queue advances instantly
      const idx = queueList.findIndex(t => t.id === track.id);
      const nextUp = idx >= 0 ? (queueList[idx + 1] || (repeatRef.current === 'all' ? queueList[0] : null)) : null;
      if (nextUp && nextUp.id !== track.id) fetch(`${MEDIA_API}/prefetch/${nextUp.id}`).catch(() => {});
    }

    // Add to recent list
    setRecentTracks(prev => {
      const filtered = prev.filter(t => t.id !== track.id);
      return [track, ...filtered].slice(0, 20);
    });
    // Remember played ids so recommendations never repeat tracks (max 200 tracked)
    recentIdsRef.current.add(track.id);
    if (recentIdsRef.current.size > 200) recentIdsRef.current.clear();

    setCurrentTrack(track);
    setIsScraping(true);

    // Record the play server-side (Continue Listening + taste engine).
    // Fire-and-forget: history must never delay or break playback.
    const histToken = localStorage.getItem('token');
    if (histToken) {
      fetch(`${API_BASE}/users/listen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${histToken}` },
        body: JSON.stringify({
          id: track.id, title: track.title, channel: track.channel,
          thumbnail: track.thumbnail, duration: track.duration
        })
      }).catch(() => {});
    }

    const onPlayStart = () => {
      setIsScraping(false);
      setIsPlaying(true);
      prepareNext(track); // fire-and-forget: precompute the next track
    };

    if (IS_NATIVE) {
      // Mobile: play through the official YouTube iframe — no local backend needed.
      // Jam sync still works: the same SYNC_PLAY message carries the video id.
      try {
        const player = await ensureYouTubePlayer();
        const resumeAt = startTime || 0;
        if (resumeAt > 0) {
          player.loadVideoById({ videoId: track.id, startSeconds: resumeAt });
        } else {
          player.loadVideoById(track.id);
        }
        setProgress(resumeAt);
        onPlayStart();
        if (!fromRemote && !isSyncingRef.current) {
          broadcastRoomState('SYNC_PLAY', { track, progress: resumeAt, sentAt: Date.now() });
        }
      } catch (e) {
        console.error('YouTube player failed to start', e);
        setIsScraping(false);
      }
      return;
    }

    const streamUrl = `${MEDIA_API}/stream-live/${track.id}`;
    const audio = audioRef.current;

    audio.src = streamUrl;
    if (startTime > 0) {
      // Seek before loadedmetadata is dropped by the browser — wait first.
      const seekOnce = () => {
        try { audio.currentTime = startTime; } catch { /* pre-metadata */ }
        audio.removeEventListener('loadedmetadata', seekOnce);
      };
      audio.addEventListener('loadedmetadata', seekOnce);
    }

    try {
      await audio.play();
      onPlayStart();
      // fromRemote: this play was CAUSED by the room — never echo it back
      // (the timed isSyncingRef window was too short for slow stream starts)
      if (!fromRemote && !isSyncingRef.current) broadcastRoomState('SYNC_PLAY', { track, progress: audio.currentTime, sentAt: Date.now() });
    } catch (err) {
      console.warn("Live stream failed, trying fallback...", err);
      audio.src = `${MEDIA_API}/stream/${track.id}?title=${encodeURIComponent(track.title)}`;
      if (startTime > 0) audio.currentTime = startTime; // re-apply seek lost by the src switch
      try {
        await audio.play();
        onPlayStart();
        // Fallback success must notify the room too, or members silently desync
        if (!fromRemote && !isSyncingRef.current) broadcastRoomState('SYNC_PLAY', { track, progress: audio.currentTime, sentAt: Date.now() });
      } catch (e) {
        console.error("Playback failed completely", e);
        setIsScraping(false);
      }
    }
  }, [broadcastRoomState, prepareNext]);

  const togglePlay = useCallback(() => {
    if (IS_NATIVE) {
      const p = ytPlayerRef.current;
      if (!p || typeof p.getPlayerState !== 'function') return;
      const playing = p.getPlayerState() === 1; // 1 = playing
      try {
        if (playing) {
          p.pauseVideo();
          setIsPlaying(false);
          if (!isSyncingRef.current) broadcastRoomState('SYNC_PAUSE', { sentAt: Date.now() });
        } else {
          p.playVideo();
          setIsPlaying(true);
          if (!isSyncingRef.current) {
            broadcastRoomState('SYNC_PLAY', {
              track: currentTrackRef.current,
              progress: p.getCurrentTime?.() || 0,
              sentAt: Date.now(),
            });
          }
        }
      } catch {}
      return;
    }
    const audio = audioRef.current;
    if (!audio.src) return;
    if (audio.paused) {
      audio.play().catch(() => {}); // guard: may reject if src is blocked
      if (!isSyncingRef.current) broadcastRoomState('SYNC_PLAY', { track: currentTrackRef.current, progress: audio.currentTime, sentAt: Date.now() });
    } else {
      audio.pause();
      if (!isSyncingRef.current) broadcastRoomState('SYNC_PAUSE', { sentAt: Date.now() });
    }
  }, [broadcastRoomState]);

  const handleNextTrack = useCallback(async () => {
    const q = queueRef.current;
    const ct = currentTrackRef.current;
    if (!ct) return;

    // Repeat one is handled in the 'ended' event listener

    // Shuffle: jump to a random track from the queue
    if (shuffleRef.current && q.length > 1) {
      let idx = Math.floor(Math.random() * q.length);
      let guard = 0;
      while (q[idx].id === ct.id && guard++ < 10) idx = Math.floor(Math.random() * q.length);
      if (q[idx].id !== ct.id) {
        playTrack(q[idx], q);
        return;
      }
    }

    // If repeat all, go back to start of queue
    if (repeatRef.current === 'all' && q.length > 0) {
      const currentIndex = q.findIndex(t => t.id === ct.id);
      const nextIndex = (currentIndex + 1) % q.length;
      playTrack(q[nextIndex], q);
      return;
    }

    // Pre-computed recommendation from when this track started = instant skip
    const pre = upNextRef.current;
    if (pre && pre.forId === ct.id && pre.pool && pre.pool.length > 0) {
      upNextRef.current = null;
      const fresh = pre.pool.filter(t => !recentIdsRef.current.has(t.id));
      const pool = fresh.length > 0 ? fresh : pre.pool;
      const stillFresh = pool.some(t => t.id === pre.pick?.id);
      const pick = stillFresh ? pre.pick : pool[Math.floor(Math.random() * Math.min(5, pool.length))];
      playTrack(pick, q.length > 0 ? null : pool);
      return;
    }

    // Fallback: fetch recommendations now based on current song's vibe
    try {
      const res = await fetch(
        `${MEDIA_API}/recommendations?title=${encodeURIComponent(ct.title)}&channel=${encodeURIComponent(ct.channel)}&current_id=${ct.id}`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        // Filter out recently played tracks
        const freshResults = data.results.filter(t => !recentIdsRef.current.has(t.id));
        const finalPool = freshResults.length > 0 ? freshResults : data.results;

        // Pick one for variety — only adopt the rec pool as the queue when
        // the user has nothing queued, never silently replace their queue
        const pick = finalPool[Math.floor(Math.random() * Math.min(5, finalPool.length))];
        playTrack(pick, q.length > 0 ? null : finalPool);
        return;
      }
      // No recommendations returned: advance the queue if there is one
      const qi = q.findIndex(t => t.id === ct.id);
      if (qi >= 0 && qi < q.length - 1) playTrack(q[qi + 1], q);
    } catch (err) {
      console.error("Failed to fetch recommendations", err);
      // Fallback: play next in queue if recommendations fail
      const currentIndex = q.findIndex(t => t.id === ct.id);
      if (currentIndex >= 0 && currentIndex < q.length - 1) {
        playTrack(q[currentIndex + 1], q);
      }
    }
  }, [playTrack]);

  const prevTrack = useCallback(() => {
    const playbackTime = getPlaybackTime();
    const restart = () => {
      if (IS_NATIVE) { try { ytPlayerRef.current?.seekTo(0, true); } catch {} }
      else { audioRef.current.currentTime = 0; }
      setProgress(0);
    };
    // If more than 3 seconds in, restart current track
    if (playbackTime > 3) { restart(); return; }
    const q = queueRef.current;
    const ct = currentTrackRef.current;
    if (q.length > 0 && ct) {
      const currentIndex = q.findIndex(t => t.id === ct.id);
      if (currentIndex > 0) {
        playTrack(q[currentIndex - 1], q);
      } else {
        restart();
      }
    } else {
      restart();
    }
  }, [playTrack, getPlaybackTime]);

  const seek = useCallback((time) => {
    if (IS_NATIVE) {
      try { ytPlayerRef.current?.seekTo(time, true); } catch {}
      setProgress(time);
      if (!isSyncingRef.current) broadcastRoomState('SYNC_SEEK', { progress: time, sentAt: Date.now() });
      return;
    }
    audioRef.current.currentTime = time;
    setProgress(time);
    if (!isSyncingRef.current) broadcastRoomState('SYNC_SEEK', { progress: time, sentAt: Date.now() });
  }, [broadcastRoomState]);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (IS_NATIVE) {
      try { ytPlayerRef.current?.setVolume(Math.round(clamped * 100)); } catch {}
      setVolumeState(clamped);
      return;
    }
    audioRef.current.volume = clamped;
    setVolumeState(clamped);
  }, []);

  const [playlists, setPlaylists] = useState([]);

  const fetchPlaylists = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/playlists`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setPlaylists(data);
    } catch (err) { console.error("Fetch playlists failed", err); }
  }, []);

  const createPlaylist = useCallback(async (name, description = "") => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/playlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      await fetchPlaylists();
      return data;
    } catch (err) { console.error("Create playlist failed", err); }
  }, [fetchPlaylists]);

  const [isRoomHost, setIsRoomHost] = useState(false);
  const isRoomHostRef = useRef(false);
  useEffect(() => { isRoomHostRef.current = isRoomHost; }, [isRoomHost]);

  const joinRoom = useCallback(async (roomCode) => {
    if (wsRef.current) wsRef.current.close();
    setRoomStatus('connecting');

    let isHost = false;
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const roomRes = await fetch(`${API_BASE}/rooms/${roomCode}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const roomData = await roomRes.json();
        // Check whether I am the host of this room — drive UX affordances
        isHost = user && roomData.host_id === user.id;
        setIsRoomHost(isHost);
      } catch (e) { console.error("Failed to fetch room info", e); }
    }

    if (!token) return; // Jam needs a session — the Join button guards this too
    const ws = new WebSocket(`${WS_BASE}/ws/room/${roomCode}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      switch(msg.type) {
        case 'PARTICIPANT_LIST':
          setRoomParticipants(msg.participants);
          break;
        case 'USER_JOIN':
          setRoomParticipants(prev => [...new Set([...prev, msg.username])]);
          // If I am host AND the room is actually playing, hand the new joiner the state
          const roomLive = IS_NATIVE
            ? ytPlayerRef.current?.getPlayerState?.() === 1
            : !audioRef.current.paused;
          if (isHost && currentTrackRef.current && roomLive) {
            broadcastRoomState('SYNC_PLAY', {
              track: currentTrackRef.current,
              progress: getPlaybackTime(),
              sentAt: Date.now(),
            });
          }
          break;
        case 'USER_LEAVE':
          setRoomParticipants(prev => prev.filter(u => u !== msg.username));
          break;
        case 'SYNC_PLAY': {
          if (!msg.track || !msg.track.id) break;
          const sentAt = msg.sentAt || Date.now();
          if (sentAt < lastSyncAtRef.current - 50) break; // stale/out-of-order
          lastSyncAtRef.current = sentAt;
          const transit = Math.max(0, Math.min(2.5, (Date.now() - sentAt) / 1000));
          const targetTime = (msg.progress || 0) + transit;
          const isDifferentTrack = currentTrackRef.current?.id !== msg.track.id;
          const DRIFT = IS_NATIVE ? 0.6 : 0.35;
          const HARD = 3.5;

          isSyncingRef.current = true;
          if (IS_NATIVE) {
            const p = ytPlayerRef.current;
            if (isDifferentTrack) {
              playTrack(msg.track, null, targetTime, true);
            } else if (p) {
              try {
                const cur = p.getCurrentTime?.() || 0;
                const drift = Math.abs(cur - targetTime);
                if (drift > HARD || drift > DRIFT) p.seekTo(targetTime, true);
                p.playVideo?.();
                setIsPlaying(true);
              } catch {}
            }
          } else {
            const audio = audioRef.current;
            if (isDifferentTrack) {
              playTrack(msg.track, null, targetTime, true);
            } else {
              const drift = Math.abs((audio.currentTime || 0) - targetTime);
              if (drift > HARD || drift > DRIFT) {
                try { audio.currentTime = targetTime; } catch {}
              }
              if (audio.paused) audio.play().catch(() => {});
            }
          }
          setTimeout(() => { isSyncingRef.current = false; }, 120);
          break;
        }
        case 'SYNC_PAUSE': {
          const sentAt = msg.sentAt || Date.now();
          if (sentAt < lastSyncAtRef.current - 50) break;
          lastSyncAtRef.current = sentAt;
          isSyncingRef.current = true;
          if (IS_NATIVE) {
            try { ytPlayerRef.current?.pauseVideo(); setIsPlaying(false); } catch {}
          } else {
            audioRef.current.pause();
          }
          setTimeout(() => { isSyncingRef.current = false; }, 120);
          break;
        }
        case 'SYNC_SEEK': {
          const sentAt = msg.sentAt || Date.now();
          if (sentAt < lastSyncAtRef.current - 50) break;
          lastSyncAtRef.current = sentAt;
          const transit = Math.max(0, Math.min(2.5, (Date.now() - sentAt) / 1000));
          const target = (msg.progress || 0) + transit;
          isSyncingRef.current = true;
          if (IS_NATIVE) {
            try { ytPlayerRef.current?.seekTo(target, true); setProgress(target); } catch {}
          } else {
            try { audioRef.current.currentTime = target; setProgress(target); } catch {}
          }
          setTimeout(() => { isSyncingRef.current = false; }, 120);
          break;
        }

        case 'SYNC_SETTINGS':
          setRoomSettings(msg.settings);
          break;
      }
    };

    // If the server drops the connection, clear ghost room state
    ws.onopen = () => setRoomStatus('connected');
    ws.onerror = () => setRoomStatus('error');
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setCurrentRoom(null);
        setRoomParticipants([]);
        setIsRoomHost(false);
        setRoomStatus('idle');
      }
    };

    setCurrentRoom(roomCode);
  }, [playTrack, user, isRoomHost, broadcastRoomState, getPlaybackTime]);

  const updateRoomSettings = useCallback((newSettings) => {
    const updated = { ...roomSettings, ...newSettings };
    setRoomSettings(updated);
    if (isRoomHost) broadcastRoomState('SYNC_SETTINGS', { settings: updated });
  }, [roomSettings, isRoomHost, broadcastRoomState]);

  const leaveRoom = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    setCurrentRoom(null);
    setRoomParticipants([]);
    setIsRoomHost(false);
    setRoomStatus('idle');
  }, []);

  // Host heartbeat: keep every member tightly in sync while the room is live
  useEffect(() => {
    if (!currentRoom) return undefined;
    const id = setInterval(() => {
      if (!isRoomHostRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const track = currentTrackRef.current;
      if (!track || !track.id) return;
      const playing = IS_NATIVE
        ? ytPlayerRef.current?.getPlayerState?.() === 1
        : !audioRef.current.paused;
      if (!playing) return;
      broadcastRoomState('SYNC_PLAY', {
        track,
        progress: getPlaybackTime(),
        sentAt: Date.now(),
      });
    }, 2000);
    return () => clearInterval(id);
  }, [currentRoom, broadcastRoomState, getPlaybackTime]);

  const addToPlaylist = useCallback(async (playlistId, track) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await fetch(`${API_BASE}/playlists/${playlistId}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          video_id: track.id,
          title: track.title,
          channel: track.channel || 'Unknown',
          thumbnail: track.thumbnail || '',
          duration: track.duration || '0:00'
        })
      });
    } catch (err) { console.error("Add to playlist failed", err); }
  }, []);

  const toggleLike = useCallback(async (track) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const res = await fetch(`${API_BASE}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          video_id: track.id,
          title: track.title,
          channel: track.channel || 'Unknown',
          thumbnail: track.thumbnail || '',
          duration: track.duration || '0:00'
        })
      });
      const data = await res.json();
      setLikedSongs(prev => {
        const next = new Set(prev);
        if (data.liked) {
          next.add(track.id);
        } else {
          next.delete(track.id);
        }
        return next;
      });
    } catch (err) {
      console.error("Like toggle failed", err);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SELECT' || t.closest('[role="button"]')) return;
      }
      
      switch(e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) handleNextTrack();
          else seek(Math.min(progressRef.current + 5, duration > 0 ? duration : progressRef.current + 5));
          break;
        case 'ArrowLeft':
          if (e.shiftKey) prevTrack();
          else seek(Math.max(progressRef.current - 5, 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(volume - 0.05);
          break;
        case 'KeyM':
          setVolume(volume > 0 ? 0 : 0.5);
          break;
        case 'KeyS':
          setShuffle(s => !s);
          break;
        case 'KeyR':
          setRepeat(r => r === 'none' ? 'all' : r === 'all' ? 'one' : 'none');
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleNextTrack, prevTrack, seek, setVolume, duration, volume]);

  // MediaSession API for system media controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.channel,
        artwork: [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
      });
      // Idempotent handlers: an explicit OS "play" must never pause and
      // vice versa (togglePlay breaks when events arrive out of order)
      navigator.mediaSession.setActionHandler('play', () => {
        if (IS_NATIVE) {
          try { ytPlayerRef.current?.playVideo(); } catch {}
          setIsPlaying(true);
          if (!isSyncingRef.current && currentTrackRef.current) {
            broadcastRoomState('SYNC_PLAY', { track: currentTrackRef.current, progress: ytPlayerRef.current?.getCurrentTime?.() || 0, sentAt: Date.now() });
          }
          return;
        }
        const a = audioRef.current;
        if (a && a.paused) {
          a.play().catch(() => {});
          if (!isSyncingRef.current && currentTrackRef.current) {
            broadcastRoomState('SYNC_PLAY', { track: currentTrackRef.current, progress: a.currentTime, sentAt: Date.now() });
          }
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (IS_NATIVE) {
          try { ytPlayerRef.current?.pauseVideo(); } catch {}
          setIsPlaying(false);
          if (!isSyncingRef.current && currentTrackRef.current) {
            broadcastRoomState('SYNC_PAUSE', { sentAt: Date.now() });
          }
          return;
        }
        audioRef.current?.pause();
        if (!isSyncingRef.current && currentTrackRef.current) {
          broadcastRoomState('SYNC_PAUSE', { sentAt: Date.now() });
        }
      });
      navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);
      navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
    }
  }, [currentTrack, handleNextTrack, prevTrack, broadcastRoomState]);

  const value = {
    currentTrack, playTrack, isPlaying, togglePlay, 
    isScraping, progress, duration, seek, volume, setVolume,
    shuffle, setShuffle, repeat, setRepeat, 
    user, setUser, nextTrack: handleNextTrack, prevTrack,
    queue, setQueue, showQueue, setShowQueue,
    likedSongs, setLikedSongs, toggleLike,
    playlists, fetchPlaylists, createPlaylist, addToPlaylist,
    recentTracks, setRecentTracks,
    currentRoom, joinRoom, leaveRoom,
    roomParticipants, isRoomHost, roomSettings, updateRoomSettings,
    roomStatus,
    audioRef
  };

  // Native hosts mount the YouTube iframe here; desktop renders nothing.
  return (
    <MusicContext.Provider value={value}>
      {IS_NATIVE && <div ref={ytMountRef} className="yt-player-mount" aria-hidden="true" />}
      {children}
    </MusicContext.Provider>
  );
};
