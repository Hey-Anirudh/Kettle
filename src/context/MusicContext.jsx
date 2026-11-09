import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE, WS_BASE } from '../config';

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
  const [recentTracks, setRecentTracks] = useState(() => {
    // Survive restarts so "Continue Listening" always has data
    try { return JSON.parse(localStorage.getItem('kettle_recent')) || []; }
    catch { return []; }
  });
  
  // Room (Jam) State
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomParticipants, setRoomParticipants] = useState([]);
  const [roomSettings, setRoomSettings] = useState({
    allow_skips: true,
    allow_add_to_queue: true,
    private_room: false
  });
  const wsRef = useRef(null);
  const isSyncingRef = useRef(false);
  
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new Audio(); // allocate once, not per render
  const queueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const recentIdsRef = useRef(new Set()); // Track recently played to avoid loops
  const restoredTrackRef = useRef(false); // Restore runs once per session, not per user-object change
  const upNextRef = useRef(null); // { forId, pick, pool } precomputed next track

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  // Persist play history for the Continue Listening list (localStorage copy;
  // the backend /users/listen copy is fetched on launch for cross-session use)
  useEffect(() => {
    try { localStorage.setItem('kettle_recent', JSON.stringify(recentTracks.slice(0, 20))); }
    catch { /* quota/corruption must never break playback */ }
  }, [recentTracks]);

  const broadcastRoomState = useCallback((type, data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  useEffect(() => {
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
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        handleNextTrack();
      }
    };
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

  // PERSISTENCE: Restore state on login
  useEffect(() => {
    if (user && user.playback_state) {
      const state = user.playback_state;
      if (state.volume !== undefined) {
        setVolumeState(state.volume);
        audioRef.current.volume = state.volume;
      }
      if (state.shuffle !== undefined) setShuffle(state.shuffle);
      if (state.repeat !== undefined) setRepeat(state.repeat);
      
      if (user.current_queue && user.current_queue.length > 0) {
        setQueue(user.current_queue);
      }
      
      // Restore track if possible (once per token — a user-object identity
      // change like a profile save must not reload the old track)
      if (state.track_id && !currentTrack && !restoredTrackRef.current) {
        restoredTrackRef.current = true;
        // We'd need to fetch the track details or have them in the state
        // For now, let's assume the queue contains it
        const track = user.current_queue?.find(t => t.id === state.track_id);
        if (track) {
          setCurrentTrack(track);
          // Set progress but don't auto-play to avoid browser blocks
          const audio = audioRef.current;
          const resumeAt = state.progress || 0;
          audio.src = `${API_BASE}/stream/${track.id}?title=${encodeURIComponent(track.title || '')}`;
          setProgress(resumeAt);
          // Seeking before metadata is loaded is dropped by the browser —
          // wait for loadedmetadata, but only once
          const seekWhenReady = () => {
            try { audio.currentTime = resumeAt; } catch { /* stream rejected seek */ }
            audio.removeEventListener('loadedmetadata', seekWhenReady);
          };
          audio.addEventListener('loadedmetadata', seekWhenReady);
        }
      }
    }
  }, [user]);

  // PERSISTENCE: Sync state to backend
  const syncTimerRef = useRef(null);
  const syncState = useCallback(async () => {
    if (!user) return;
    try {
      const state = {
        track_id: currentTrackRef.current?.id,
        progress: audioRef.current.currentTime,
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
  }, [user, isPlaying]);

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
        `${API_BASE}/recommendations?title=${encodeURIComponent(track.title)}&channel=${encodeURIComponent(track.channel || '')}&current_id=${track.id}`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        const fresh = data.results.filter(t => !recentIdsRef.current.has(t.id));
        const pool = fresh.length > 0 ? fresh : data.results;
        const pick = pool[Math.floor(Math.random() * Math.min(5, pool.length))];
        upNextRef.current = { forId: track.id, pick, pool };
        // Warm the backend's stream-URL cache for the pick
        fetch(`${API_BASE}/prefetch/${pick.id}`).catch(() => {});
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
      if (nextUp && nextUp.id !== track.id) fetch(`${API_BASE}/prefetch/${nextUp.id}`).catch(() => {});
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

    const streamUrl = `${API_BASE}/stream-live/${track.id}`;
    const audio = audioRef.current;

    const onPlayStart = () => {
      setIsScraping(false);
      setIsPlaying(true);
      prepareNext(track); // fire-and-forget: precompute the next track
    };

    audio.src = streamUrl;
    if (startTime > 0) audio.currentTime = startTime;

    try {
      await audio.play();
      onPlayStart();
      // fromRemote: this play was CAUSED by the room — never echo it back
      // (the timed isSyncingRef window was too short for slow stream starts)
      if (!fromRemote && !isSyncingRef.current) broadcastRoomState('SYNC_PLAY', { track, progress: audio.currentTime, sentAt: Date.now() });
    } catch (err) {
      console.warn("Live stream failed, trying fallback...", err);
      audio.src = `${API_BASE}/stream/${track.id}?title=${encodeURIComponent(track.title)}`;
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
      playTrack(pick, pool);
      return;
    }

    // Fallback: fetch recommendations now based on current song's vibe
    try {
      const res = await fetch(
        `${API_BASE}/recommendations?title=${encodeURIComponent(ct.title)}&channel=${encodeURIComponent(ct.channel)}&current_id=${ct.id}`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        // Filter out recently played tracks
        const freshResults = data.results.filter(t => !recentIdsRef.current.has(t.id));
        const finalPool = freshResults.length > 0 ? freshResults : data.results;

        // Pick one for variety
        const pick = finalPool[Math.floor(Math.random() * Math.min(5, finalPool.length))];
        playTrack(pick, finalPool);
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
    const audio = audioRef.current;
    // If more than 3 seconds in, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const q = queueRef.current;
    const ct = currentTrackRef.current;
    if (q.length > 0 && ct) {
      const currentIndex = q.findIndex(t => t.id === ct.id);
      if (currentIndex > 0) {
        playTrack(q[currentIndex - 1], q);
      } else {
        audio.currentTime = 0;
      }
    } else {
      audio.currentTime = 0;
    }
  }, [playTrack]);

  const seek = useCallback((time) => {
    audioRef.current.currentTime = time;
    setProgress(time);
    if (!isSyncingRef.current) broadcastRoomState('SYNC_SEEK', { progress: time, sentAt: Date.now() });
  }, [broadcastRoomState]);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
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

  const joinRoom = useCallback(async (roomCode) => {
    if (wsRef.current) wsRef.current.close();
    
    let isHost = false;
    try {
      const roomRes = await fetch(`${API_BASE}/rooms/${roomCode}`);
      const roomData = await roomRes.json();
      isHost = user && roomData.host_id === user.id;
      setIsRoomHost(isHost);
    } catch (e) { console.error("Failed to fetch room info", e); }

    const username = user?.username || "Guest";
    const ws = new WebSocket(`${WS_BASE}/ws/room/${roomCode}?username=${encodeURIComponent(username)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      switch(msg.type) {
        case 'PARTICIPANT_LIST':
          setRoomParticipants(msg.participants);
          break;
        case 'USER_JOIN':
          setRoomParticipants(prev => [...new Set([...prev, msg.username])]);
          // If I am host, send my current state to the new joiner
          if (isHost && currentTrackRef.current) {
            broadcastRoomState('SYNC_PLAY', { 
              track: currentTrackRef.current, 
              progress: audioRef.current.currentTime 
            });
          }
          break;
        case 'USER_LEAVE':
          setRoomParticipants(prev => prev.filter(u => u !== msg.username));
          break;
        case 'SYNC_PLAY':
          if (!msg.track || !msg.track.id) break; // malformed peer message
          const now = Date.now();
          const latency = msg.sentAt ? (now - msg.sentAt) / 1000 : 0;
          const targetTime = msg.progress + latency;
          
          isSyncingRef.current = true;
          
          // Only sync if track is different OR time drift is > 2 seconds
          const isDifferentTrack = currentTrackRef.current?.id !== msg.track.id;
          const drift = Math.abs(audioRef.current.currentTime - targetTime);
          
          if (isDifferentTrack) {
            playTrack(msg.track, null, targetTime, true); // fromRemote: no echo
          } else if (drift > 2) {
            audioRef.current.currentTime = targetTime;
          }
          
          if (audioRef.current.paused) audioRef.current.play().catch(() => {});
          setTimeout(() => { isSyncingRef.current = false; }, 200);
          break;
        case 'SYNC_PAUSE':
          isSyncingRef.current = true;
          audioRef.current.pause();
          setTimeout(() => { isSyncingRef.current = false; }, 200);
          break;
        case 'SYNC_SEEK':
          const seekNow = Date.now();
          const seekLatency = msg.sentAt ? (seekNow - msg.sentAt) / 1000 : 0;
          const seekTarget = msg.progress + seekLatency;
          
          isSyncingRef.current = true;
          const seekDrift = Math.abs(audioRef.current.currentTime - seekTarget);
          
          if (seekDrift > 1.5) {
            audioRef.current.currentTime = seekTarget;
          }
          setTimeout(() => { isSyncingRef.current = false; }, 200);
          break;
        case 'SYNC_SETTINGS':
          setRoomSettings(msg.settings);
          break;
      }
    };

    // If the server drops the connection, clear ghost room state
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setCurrentRoom(null);
        setRoomParticipants([]);
        setIsRoomHost(false);
      }
    };

    setCurrentRoom(roomCode);
  }, [playTrack, user, isRoomHost, broadcastRoomState]);

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
  }, []);

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
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) handleNextTrack();
          else seek(Math.min(progress + 5, duration));
          break;
        case 'ArrowLeft':
          if (e.shiftKey) prevTrack();
          else seek(Math.max(progress - 5, 0));
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
  }, [togglePlay, handleNextTrack, prevTrack, seek, setVolume, progress, duration, volume]);

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
        const a = audioRef.current;
        if (a && a.paused) {
          a.play().catch(() => {});
          if (!isSyncingRef.current && currentTrackRef.current) {
            broadcastRoomState('SYNC_PLAY', { track: currentTrackRef.current, progress: a.currentTime, sentAt: Date.now() });
          }
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
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
    audioRef
  };

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
};
