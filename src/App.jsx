import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
  Search, Home, Library, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Repeat, Repeat1, Shuffle, Music2, User, Heart,
  PlusSquare, ListMusic, Maximize2, ChevronDown, X, Clock, Disc3, Users, Share2, UserPlus,
  ChevronLeft, ChevronRight, Camera, LifeBuoy,
  Snowflake, Zap, Headphones, HeartCrack, PartyPopper, Moon, Flame,
  MonitorPlay, Check, RefreshCw
} from 'lucide-react';
import axios from 'axios';
import logoMark from './assets/logo-mark.png';
import { useMusic } from './context/MusicContext';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE, MEDIA_API, IS_NATIVE } from './config';
import './App.css';

const ONBOARDING_GENRES = [
  "Bollywood", "Punjabi", "Haryanvi", "Pop", "Hip-Hop", "Lo-Fi", "Indie", "Rock",
  "Classical", "Devotional", "EDM", "R&B", "Jazz", "Metal", "K-Pop", "Retro"
];

const ONBOARDING_ARTISTS = [
  { name: "Arijit Singh", img: "https://i.scdn.co/image/ab6761610000e5eb10bd2334f90f2367d328ca57" },
  { name: "Sidhu Moose Wala", img: "https://i.scdn.co/image/ab6761610000e5eb981b248b866672eeed4cb06c" },
  { name: "The Weeknd", img: "https://i.scdn.co/image/ab6761610000e5eb4718e2d1245382117ca68d34" },
  { name: "Taylor Swift", img: "https://i.scdn.co/image/ab6761610000e5eb98f39578648a8c99fca0fb8c" },
  { name: "Diljit Dosanjh", img: "https://i.scdn.co/image/ab6761610000e5eb51680de6f3d5ca46032b453e" },
  { name: "A.R. Rahman", img: "https://i.scdn.co/image/ab6761610000e5ebb19af0ea736c6228d6ba53d0" },
  { name: "Badshah", img: "https://i.scdn.co/image/ab6761610000e5ebb699042b5a67c7e5a073f136" },
  { name: "Shreya Ghoshal", img: "https://i.scdn.co/image/ab6761610000e5eb1ec999a41b528096230f878f" },
  { name: "Post Malone", img: "https://i.scdn.co/image/ab6761610000e5eb9435a7570ae5ca3362398896" },
  { name: "Justin Bieber", img: "https://i.scdn.co/image/ab6761610000e5eb8ae7f23317af295f1c045db3" },
  { name: "Drake", img: "https://i.scdn.co/image/ab6761610000e5eb4293385d324db8558179afd9" },
  { name: "Lana Del Rey", img: "https://i.scdn.co/image/ab6761610000e5eb2d08316130d210515f4834f8" }
];

// Extracted outside App to prevent recreation on every render
const EqBars = memo(() => (
  <div className="eq-bars">
    <span /><span /><span /><span />
  </div>
));

const TrackRow = memo(({ track, index, list, isActive, isPlaying, isLiked, onPlay, onLike, playlists, onAddToPlaylist }) => {
  const [showPlMenu, setShowPlMenu] = useState(false);

  return (
    <div
      className={`track-row ${isActive ? 'active' : ''}`}
      onClick={() => onPlay(track, list)}
    >
      <div className="track-num">
        {isActive && isPlaying ? <EqBars /> : <span>{index + 1}</span>}
      </div>
      <div className="track-thumb">
        <img src={track.thumbnail} alt="" loading="lazy" />
        <div className="track-thumb-overlay">
          {isActive && isPlaying ? <Pause size={16} /> : <Play size={16} fill="white" />}
        </div>
      </div>
      <div className="track-meta">
        <p className="track-title">{track.title}</p>
        <p className="track-artist">{track.channel}</p>
      </div>
      <div className="track-row-actions">
        <Heart
          size={16}
          className={`track-like ${isLiked ? 'liked' : ''}`}
          fill={isLiked ? '#e60000' : 'none'}
          onClick={(e) => { e.stopPropagation(); onLike(track); }}
        />
        <div className="pl-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
          <PlusSquare size={16} className="track-plus" onClick={() => setShowPlMenu(!showPlMenu)} />
          {showPlMenu && (
            <div className="pl-dropdown">
              <p className="pl-dropdown-label">Add to Playlist</p>
              {playlists.map(p => (
                <div key={p.id} className="pl-dropdown-item" onClick={() => { onAddToPlaylist(p.id, track); setShowPlMenu(false); }}>
                  {p.name}
                </div>
              ))}
              {playlists.length === 0 && <p className="pl-dropdown-empty">No playlists</p>}
            </div>
          )}
        </div>
        <span className="track-dur">{track.duration}</span>
      </div>
    </div>
  );
});

// ============================================================================
// TASTE ENGINE — turns an account's REAL signals (plays, likes, searches)
// into home-page shelves. Every user gets different shelves because these
// inputs differ per account; brand-new accounts get time-of-day moods.
// ============================================================================
const GENRE_LEXICON = [
  ['Lo-Fi',        ['lofi', 'lo fi', 'chillhop', 'study beat', 'lofi hip hop']],
  ['Hip-Hop',      ['hip hop', 'hip-hop', 'rap ', ' rap', 'trap', 'drill', 'freestyle']],
  ['Pop',          ['pop ', ' pop', 'billboard', 'top 40', 'earworm']],
  ['Punjabi',      ['punjabi', 'bhangra', 'sidhu moosewala', 'ap dhillon', 'karan aujla', 'diljit']],
  ['Bollywood',    ['bollywood', 'hindi', 'arijit singh', 'atif aslam', 'arijit', 'filmi']],
  ['R&B',          ['r&b', 'rnb', 'r and b', 'soul ', ' neo soul']],
  ['EDM',          ['edm', 'house', 'techno', 'festival', 'marshmello', 'david guetta', 'avicii', 'slap house']],
  ['Rock',         ['rock', 'metal', 'indie band', 'guitar solo', 'alternative']],
  ['Latin',        ['reggaeton', 'latin', 'despacito', 'bad bunny', 'urbano']],
  ['Classical',    ['classical', 'piano', 'orchestra', 'cello', 'symphony']],
  ['Workout',      ['workout', 'gym', 'fitness', 'training', 'beast mode']],
  ['Sad',          ['sad song', 'heartbreak', 'breakup', 'cry', 'lonely']],
  ['Country',      ['country', 'folk', 'acoustic guitar']],
  ['K-Pop',        ['kpop', 'k-pop', 'bts', 'blackpink', 'stray kids']],
];

// Words that carry no taste signal when they appear in search queries
const NOISE_WORDS = new Set([
  'the', 'and', 'song', 'songs', 'music', 'mix', 'of', 'a', 'an', 'to', 'my',
  'for', 'top', 'best', 'hit', 'hits', 'new', 'latest', 'video', 'videos',
  'audio', 'lyrics', 'lyric', 'official', 'free', 'download', '2024', '2025',
  '2026', 'full', 'album', 'playlist', 'listen', 'online', 'hd'
]);

function scoreGenres(texts) {
  const blob = texts.join(' ').toLowerCase();
  if (!blob.trim()) return [];
  return GENRE_LEXICON
    .map(([genre, tokens]) => {
      let score = 0;
      for (const t of tokens) {
        let i = blob.indexOf(t);
        while (i !== -1) { score += 1; i = blob.indexOf(t, i + t.length); }
      }
      return { genre, score };
    })
    .filter(g => g.score > 0)
    .sort((a, b) => b.score - a.score);
}

function topSearchQueries(queries) {
  const counts = new Map();
  for (const raw of queries || []) {
    const q = (raw || '').trim().toLowerCase();
    if (q.length < 3 || q.length > 60) continue;
    const words = q.split(/\s+/).filter(w => w && !NOISE_WORDS.has(w) && !/^\d+$/.test(w));
    if (!words.length) continue;
    const key = words.join(' ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([q]) => q);
}

function buildTasteShelves({ listenHistory, searchHistory, likedSongsList }) {
  const shelves = [];
  const played = listenHistory || [];
  const liked = likedSongsList || [];
  const queries = searchHistory || [];

  const playedText = played.map(t => `${t.title || ''} ${t.channel || ''}`);
  const likedText = liked.map(t => `${t.title || ''} ${t.channel || ''}`);
  const allText = [...playedText, ...likedText, ...queries];

  // 1) Radio-matched to the anchor track (newest like, else newest play)
  const anchor = liked[0] || played[0];
  if (anchor && anchor.id && anchor.title) {
    shelves.push({
      key: 'more-like',
      title: `More like \u201c${anchor.title.slice(0, 34)}\u201d`,
      sub: 'Radio-matched to what you play',
      recommend: { title: anchor.title, channel: anchor.channel || '', current_id: anchor.id }
    });
  }

  // 2) The user's dominant genre, as a radio row
  const genres = scoreGenres(allText);
  if (genres[0]) {
    shelves.push({
      key: `genre-${genres[0].genre}`,
      title: `Your ${genres[0].genre} radio`,
      sub: genres[0].score > 2 ? `You keep coming back to ${genres[0].genre}` : 'Based on your listening',
      query: `${genres[0].genre} radio mix hits`
    });
  }

  // 3) Straight from the user's own search history
  const tops = topSearchQueries(queries);
  if (tops[0]) {
    shelves.push({
      key: 'your-search',
      title: `Because you searched \u201c${tops[0].slice(0, 30)}\u201d`,
      sub: 'Fresh picks from your history',
      query: tops[0]
    });
  }

  // 4) Second-strongest signals, if there is room
  if (shelves.length < 3 && genres[1]) {
    shelves.push({
      key: `genre2-${genres[1].genre}`,
      title: `${genres[1].genre} for you`,
      sub: 'Another side of your taste',
      query: `${genres[1].genre} hits mix`
    });
  }
  if (shelves.length < 3 && tops[1]) {
    shelves.push({
      key: 'your-search-2',
      title: `Also searched \u201c${tops[1].slice(0, 30)}\u201d`,
      sub: 'From your search history',
      query: tops[1]
    });
  }

  // 5) Cold start — no signals yet: set the vibe by time of day instead
  if (!shelves.length) {
    const h = new Date().getHours();
    const mood = h >= 6 && h < 12
      ? ['Morning coffee', 'soft acoustic morning mix']
      : h >= 12 && h < 18
        ? ['Afternoon energy', 'upbeat pop hits mix']
        : h >= 18 && h < 22
          ? ['Evening wind-down', 'chill evening r&b mix']
          : ['Late night drive', 'night drive synthwave mix'];
    shelves.push({ key: 'mood', title: mood[0], sub: 'Picked for this moment', query: mood[1] });
    shelves.push({ key: 'trending', title: 'Trending right now', sub: 'What everyone is playing', query: 'latest trending music hits' });
  }

  return shelves.slice(0, 3);
}

// Time-of-day vibe for the hero — computed per render (cheap) so it
// never shows yesterday's morning vibe after midnight
const vibeForNow = () => {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return {
    key: 'morning', greeting: 'Good Morning', mood: 'Focus & Coffee',
    headline: 'Ease into the day.',
    line: 'Bright, fresh acoustics and lo-fi to start your day right.',
    grad: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    blob1: '#ffffff', blob2: '#ffd3a5', dark: false,
    playQuery: 'bright morning acoustic mix'
  };
  if (h >= 12 && h < 18) return {
    key: 'afternoon', greeting: 'Good Afternoon', mood: 'Energy Boost',
    headline: 'Keep the energy up.',
    line: 'Keep the momentum going with upbeat hits and viral tracks.',
    grad: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    blob1: '#fff3b0', blob2: '#ff9a6c', dark: false,
    playQuery: 'upbeat feel good hits mix'
  };
  if (h >= 18 && h < 22) return {
    key: 'evening', greeting: 'Good Evening', mood: 'Unwind & Relax',
    headline: 'Slow it down.',
    line: 'Deep sunset aesthetics with smooth R&B and chill pop.',
    grad: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    blob1: '#a18cd1', blob2: '#fbc2eb', dark: true,
    playQuery: 'chill evening r&b mix'
  };
  return {
    key: 'night', greeting: 'Late Night', mood: 'After Dark',
    headline: 'After-hours frequency.',
    line: 'Dark, neon-lit aesthetics highlighting synthwave and deep house.',
    grad: 'linear-gradient(135deg, #09203f 0%, #537895 100%)',
    blob1: '#537895', blob2: '#3d1e6d', dark: true,
    playQuery: 'late night drive synthwave mix'
  };
};

// One-tap mood chips: each plays a real search-backed mix.
// Icons are lucide SVG components (no emojis anywhere in the app).
const MOOD_CHIPS = [
  { icon: Snowflake, label: 'Chill', query: 'chill lofi relaxing mix' },
  { icon: Zap, label: 'Energy', query: 'workout motivation hype mix' },
  { icon: Headphones, label: 'Focus', query: 'deep focus instrumental study mix' },
  { icon: HeartCrack, label: 'Heartbreak', query: 'sad heartbreak songs mix' },
  { icon: PartyPopper, label: 'Party', query: 'party dance hits mix' },
  { icon: Moon, label: 'Late Night', query: 'late night drive synthwave mix' }
];

// Horizontal shelf card: click = play the whole shelf as a queue
const MediaCard = memo(({ track, list, onPlay }) => (
  <div className="music-card" style={{ minWidth: 180, width: 180 }} onClick={() => onPlay(track, list)}>
    <div className="card-img-wrap">
      <img src={track.thumbnail} alt="" loading="lazy" />
      <button className="card-play-btn" aria-label="Play"><Play size={22} fill="black" /></button>
    </div>
    <p className="card-title">{track.title}</p>
    <p className="card-sub">{track.channel}</p>
  </div>
));

function App() {
  const {
    currentTrack, playTrack, isPlaying, togglePlay,
    isScraping, progress, duration, seek, volume, setVolume,
    user, setUser, nextTrack, prevTrack,
    shuffle, setShuffle, repeat, setRepeat,
    queue, setQueue, showQueue, setShowQueue,
    likedSongs, setLikedSongs, toggleLike,
    playlists, fetchPlaylists, createPlaylist, addToPlaylist,
    recentTracks, setRecentTracks,
    currentRoom, joinRoom, leaveRoom, roomParticipants, isRoomHost,
    roomSettings, updateRoomSettings, roomStatus,
    audioRef
  } = useMusic();

  // Time-of-day vibe — recomputed per render, never stale
  const VIBE = vibeForNow();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [homeResults, setHomeResults] = useState([]);
  const [currentPage, setCurrentPage] = useState('home');
  const [isLoading, setIsLoading] = useState(false);
  const [isHomeLoading, setIsHomeLoading] = useState(false);
  const [isFullPlayer, setIsFullPlayer] = useState(false);
  // Startup animation: show until the guest session resolves (min 1.9s, hard cap 6s)
  const [splashMinDone, setSplashMinDone] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  // First-launch gate. No account is required — the silent name-based
  // session keeps the app fully usable. Every choice is a real cloud
  // account (sync, friends, Jam) owned by this device.
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('kettle_name') || '');
  const [nameDraft, setNameDraft] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  // Per-user taste data: real plays + searches -> personalized home shelves
  const [listenHistory, setListenHistory] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [personalShelves, setPersonalShelves] = useState([]);
  const [isTasteLoading, setIsTasteLoading] = useState(false);
  const [tasteLoaded, setTasteLoaded] = useState(false); // history fetch attempted
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [likedSongsList, setLikedSongsList] = useState([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState([]);
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);

  // Room State
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  // Native: whole-screen Friends overlay — the friend UI stays mounted in the
  // aside (no state/focus churn) and CSS promotes it to a page on phones
  const [mobileFriendsOpen, setMobileFriendsOpen] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState(null); // 'available', 'downloaded'
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef(null);
  const dragEndedAtRef = useRef(0);
  const [fpCopied, setFpCopied] = useState(false);
  const [fpIdle, setFpIdle] = useState(false);
  
  // Friends System — DB-connected. The bundle used to keep this in
  // localStorage with fake isOnline. Now friend records, friend codes,
  // suggestions and incoming requests all hit /friends/*.
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [ownFriendCode, setOwnFriendCode] = useState('');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [newFriendCodeDraft, setNewFriendCodeDraft] = useState('');
  const [copiedFriendCode, setCopiedFriendCode] = useState(false);

// Deterministic color + initials per username — avoids external HTTP
// dependency (i.pravatar.cc) for avatars
const avatarColor = (name) => {
  let h = 2166136261 >>> 0;
  const s = String(name || '??');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const hues = [0, 25, 50, 100, 150, 200, 250, 290, 330];
  const pick = hues[h % hues.length];
  return `linear-gradient(135deg, hsl(${pick} 70% 40%), hsl(${(pick + 30) % 360} 80% 30%))`;
};

const InitialsAvatar = memo(({ username, photo, size = 32 }) => (
  photo
    ? <img src={photo} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} alt="" />
    : <div style={{
        width: size, height: size, borderRadius: '50%',
        background: avatarColor(username),
        color: '#fff', fontSize: Math.max(11, Math.floor(size * 0.4)),
        fontWeight: 800, display: 'flex', alignItems: 'center',
        justifyContent: 'center', letterSpacing: '0.5px'
      }}>{(username || '?')[0].toUpperCase()}</div>
));

  const relativeTime = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d) return 'a while ago';
    const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) {
      const h = Math.floor(diffMin / 60);
      return `${h}h ago`;
    }
    const days = Math.floor(diffMin / 1440);
    return days <= 1 ? 'yesterday' : `${days}d ago`;
  };

  // Refresh friends + requests + suggestions on every session / mutation.
  // Called whenever the user object or pending-request count changes.
  const refreshFriends = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const [friendsRes, reqRes] = await Promise.all([
        axios.get(`${API_BASE}/friends`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/friend-requests`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setFriends(Array.isArray(friendsRes.data) ? friendsRes.data : []);
      setFriendRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
    } catch (e) {
      console.warn('friends refresh failed', e);
    }
  }, []);



  const submitFriendRequest = async (e) => {
    e?.preventDefault?.();
    if (!newFriendCodeDraft) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const payload = /^kt/i.test(newFriendCodeDraft)
      ? { friend_code: newFriendCodeDraft.toUpperCase() }
      : { username: newFriendCodeDraft.toLowerCase() };
    try {
      const res = await axios.post(`${API_BASE}/friends/request`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setNewFriendCodeDraft('');
      setIsAddingFriend(false);
      await refreshFriends();
      if (res.data?.status === 'already_friends') {
        alert('You’re already friends with this person.');
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Could not send friend request';
      alert(detail);
    }
  };


  const respondToFriendRequest = async (friendshipId, action) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await axios.post(`${API_BASE}/friends/respond/${friendshipId}`, { action }, { headers: { Authorization: `Bearer ${token}` } });
      await refreshFriends();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not update friend request');
    }
  };

  const removeFriend = async (friendshipId) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await axios.delete(`${API_BASE}/friends/${friendshipId}`, { headers: { Authorization: `Bearer ${token}` } });
      await refreshFriends();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not remove friend');
    }
  };

  const copyFriendCode = async () => {
    if (!ownFriendCode) return;
    try {
      await navigator.clipboard.writeText(ownFriendCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = ownFriendCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedFriendCode(true);
    setTimeout(() => setCopiedFriendCode(false), 1800);
  };

  const fileInputRef = useRef(null);
  const progressBarRef = useRef(null);
  const volumeBarRef = useRef(null);

  const handleCreateRoom = async () => {
    const token = localStorage.getItem('token');
    if (!token || !newRoomName) return;
    try {
      const res = await axios.post(`${API_BASE}/rooms?name=${encodeURIComponent(newRoomName)}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await joinRoom(res.data.room_code);
      setIsCreatingRoom(false);
      setNewRoomName("");
      setCurrentPage('jam');
    } catch (e) { console.error(e); }
  };

  const searchTimerRef = useRef(null);
  const searchReqIdRef = useRef(0);       // latest-search wins over stale responses

  // --- Page back / forward history (topbar chevrons) -------------------
  const backStackRef = useRef([]);
  const fwdStackRef = useRef([]);
  const navLockRef = useRef(false);        // true while a back/forward jump applies
  const prevPageRef = useRef('home');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Friends: refresh from the backend every time the session user resolves.
  useEffect(() => {
    if (!user || !user.username) return;
    // Wipe the stale localStorage friends pile from earlier builds — it is
    // owned by the backend now.
    try { localStorage.removeItem('kettle_friends'); } catch {}
    refreshFriends();
    setOwnFriendCode(user.friend_code || '');
  }, [user, refreshFriends]);

  useEffect(() => {
    if (currentPage === prevPageRef.current) return;
    if (navLockRef.current) {
      navLockRef.current = false;
    } else {
      backStackRef.current.push(prevPageRef.current);
      fwdStackRef.current = [];
    }
    prevPageRef.current = currentPage;
    setCanGoBack(backStackRef.current.length > 0);
    setCanGoForward(fwdStackRef.current.length > 0);
  }, [currentPage]);

  const goBack = () => {
    if (!backStackRef.current.length) return;
    fwdStackRef.current.push(currentPage);
    navLockRef.current = true;
    setCurrentPage(backStackRef.current.pop());
    setCanGoBack(backStackRef.current.length > 0);
    setCanGoForward(true);
  };
  const goForward = () => {
    if (!fwdStackRef.current.length) return;
    backStackRef.current.push(currentPage);
    navLockRef.current = true;
    setCurrentPage(fwdStackRef.current.pop());
    setCanGoForward(fwdStackRef.current.length > 0);
    setCanGoBack(true);
  };

  // --- Startup animation timing ---------------------------------------
  useEffect(() => { const t = setTimeout(() => setSplashMinDone(true), 1900); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (splashMinDone && user) { const t = setTimeout(() => setSplashDone(true), 450); return () => clearTimeout(t); }
  }, [splashMinDone, user]);
  // First launch: nobody has a name yet — hand off from splash to the name gate
  useEffect(() => {
    if (splashMinDone && !displayName) {
      const t = setTimeout(() => { setSplashDone(true); setShowNamePrompt(true); }, 450);
      return () => clearTimeout(t);
    }
  }, [splashMinDone, displayName]);
  // Friends pending-state helper: re-pull the session from the shared cloud.
  // Once the next backend deploy ships friend codes, this resolves the
  // pending card without an app update.
  const refreshSessionFromCloud = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const { data } = await axios.get(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      setUser(data);
    } catch {
      alert('Friend sync is not live on the shared server yet — it ships with the next backend deploy.');
    }
  };

  useEffect(() => { const t = setTimeout(() => setSplashDone(true), 6000); return () => clearTimeout(t); }, []);

  const submitName = (e) => {
    e.preventDefault();
    const n = nameDraft.trim().slice(0, 24);
    if (!n) return;
    try { localStorage.setItem('kettle_auth_mode', 'guest'); } catch {}
    localStorage.setItem('kettle_name', n);
    setDisplayName(n);
    setShowNamePrompt(false); // kicks off the silent guest session below
  };

  // Clear the local session and return to the login gate. Used by the
  // Account panel's "Sign out" action.
  const signOut = () => {
    try {
      ['token', 'kettle_guest', 'kettle_name', 'kettle_auth_mode', 'kettle_recent', 'kettle_friends']
        .forEach(k => localStorage.removeItem(k));
    } catch {}
    // Stop audio, drop the Jam room, wipe friend data from the screen —
    // a signed-out session must look completely clean.
    try { audioRef.current?.pause(); } catch {}
    leaveRoom();
    // Wipe every session-scoped taste cache so a different account on this
    // device never inherits the previous one's shelves
    setUser(null);
    setDisplayName('');
    setListenHistory([]);
    setSearchHistory([]);
    setTasteLoaded(false);
    setRecentTracks([]);
    setQueue([]);
    setLikedSongs(new Set());
    setFriends([]);
    setFriendRequests([]);
    setOwnFriendCode('');
    setHomeResults([]);
    setShowNamePrompt(true);
  };

  // --- Silent guest session (NO login UI, ever) ------------------------
  // First launch asks for a name (the gate above), then creates a local
  // account whose username is derived FROM that name — no guest_xxx.
  // Everything after that is automatic: the app is simply usable without
  // logging in. Runs only once a display name exists.
  useEffect(() => {
    // Normalize stale mode from before Google auth was removed — otherwise
    // this account would silently never sign in again
    try { if (localStorage.getItem('kettle_auth_mode') === 'google') localStorage.setItem('kettle_auth_mode', 'guest'); } catch {}
    if (!displayName) return; // waiting on the first-launch name gate
    let cancelled = false;

    const ensureGuestSession = async (attempt = 0) => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const me = await axios.get(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!cancelled) setUser(me.data);
          return;
        } catch { localStorage.removeItem('token'); } // stale/rotated token
      }

      // Reuse stored guest credentials — /register can only succeed once
      let creds = null;
      try { creds = JSON.parse(localStorage.getItem('kettle_guest')); } catch {}
      if (!creds || !creds.username) {
        const id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
        // Username derived from the name the user chose — human-readable,
        // unique (suffix), and never the old guest_xxxxxxxxxxxx
        const slug = displayName.toLowerCase()
          .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16) || 'listener';
        creds = {
          username: `${slug}_${id}`,
          email: `${slug}_${id}@kettle.app`,
          password: `k_${Math.random().toString(36).slice(2, 14)}_9`
        };
        localStorage.setItem('kettle_guest', JSON.stringify(creds));
      }

      let access = null;
      try {
        const res = await axios.post(`${API_BASE}/login`, creds);
        access = res.data.access_token;
      } catch {
        try { await axios.post(`${API_BASE}/register`, creds); } catch {}
        try {
          const res = await axios.post(`${API_BASE}/login`, creds);
          access = res.data.access_token;
        } catch {}
      }

      if (cancelled) return;
      if (!access) {
        // Backend not up yet — the splash covers the wait; retry a few times
        if (attempt < 12) setTimeout(() => { if (!cancelled) ensureGuestSession(attempt + 1); }, 1500);
        return;
      }

      localStorage.setItem('token', access);
      try {
        const me = await axios.get(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${access}` }
        });
        if (cancelled) return;
        setUser(me.data);
        // Guests skip the onboarding modal — the homepage handles vibe selection
        if (!me.data.onboarding_completed) {
          axios.post(`${API_BASE}/users/onboarding`, { genres: [], artists: [] },
            { headers: { Authorization: `Bearer ${access}` } }).catch(() => {});
        }
      } catch {}
    };

    ensureGuestSession();
    return () => { cancelled = true; };
  }, [setUser, displayName]);

  // Electron Update Listeners (removed on cleanup — StrictMode mounts twice)
  useEffect(() => {
    if (!window.ipcRenderer) return;
    const onAvailable = () => setUpdateStatus('available');
    const onDownloaded = () => setUpdateStatus('downloaded');
    window.ipcRenderer.on('update_available', onAvailable);
    window.ipcRenderer.on('update_downloaded', onDownloaded);
    return () => {
      window.ipcRenderer.removeListener('update_available', onAvailable);
      window.ipcRenderer.removeListener('update_downloaded', onDownloaded);
    };
  }, []);

  // Clear any pending search timer on unmount
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  // VIDEO MODE — the <audio> element NEVER stops. A muted <video> element
  // plays the relayed video stream phase-locked to the audio: a playbackRate
  // servo nudges the video faster or slower until drift is below the
  // 25 ms perception threshold, then it rides exactly alongside. Seeks and
  // track changes hard-snap the video; small drift never causes visible
  // stutter or skipping.
  useEffect(() => {
    if (!showVideo) return undefined;
    const video = videoRef.current;
    const audio = audioRef?.current;
    if (!video || !audio) return undefined;

    video.muted = true;
    video.playbackRate = 1;

    const DEAD_ZONE = 0.012; // 12 ms — far below AV-sync perception
    const HARD_SNAP = 0.8;   // user seeked / real network hiccup

    const tick = () => {
      const a = audio.currentTime;
      const v = video.currentTime;
      if (!Number.isFinite(a) || Number.isNaN(v)) return;
      const drift = v - a;
      if (Math.abs(drift) > HARD_SNAP) {
        try { video.currentTime = a; } catch { /* pre-metadata */ }
        video.playbackRate = 1;
        return;
      }
      if (Math.abs(drift) <= DEAD_ZONE) {
        // Locked — ride the clock exactly
        if (video.playbackRate !== 1) video.playbackRate = 1;
        return;
      }
      // P-control: proportional nudge, clamped to a natural band
      video.playbackRate = Math.max(0.75, Math.min(1.25, 1 - drift * 0.8));
    };

    const mirror = () => {
      if (!audio.paused && video.paused) {
        // Restart — re-lock position first so a resume never shows old offset
        try { video.currentTime = audio.currentTime; } catch { /* pre-metadata */ }
        video.playbackRate = 1;
        video.play().catch(() => {});
      } else if (audio.paused && !video.paused) {
        video.pause();
      }
    };

    const onMetadata = () => {
      try { video.currentTime = audio.currentTime; } catch { /* noop */ }
      video.playbackRate = 1;
      mirror();
    };

    const onSeek = () => {
      try { video.currentTime = audio.currentTime; } catch { /* pre-metadata */ }
      video.playbackRate = 1;
    };

    const interval = setInterval(tick, 150); // 6-7 Hz servo
    video.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('seeked', onSeek);
    audio.addEventListener('play', mirror);
    audio.addEventListener('pause', mirror);
    // Kick off immediately at audio position
    if (video.readyState >= 1) onMetadata();

    return () => {
      clearInterval(interval);
      video.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('timeupdate', tick);
      audio.removeEventListener('seeked', onSeek);
      audio.removeEventListener('play', mirror);
      audio.removeEventListener('pause', mirror);
      try { video.pause(); video.playbackRate = 1; } catch { /* unmount races */ }
    };
  }, [showVideo, currentTrack?.id, audioRef, isFullPlayer]);

  const restartApp = () => {
    if (window.ipcRenderer) window.ipcRenderer.send('restart_app');
  };

  // Fetch home results & featured playlists
  useEffect(() => {
    const fetchHomeData = async () => {
      setIsHomeLoading(true);

      // Both requests fire at once — home renders as soon as the slower one lands
      const searchTask = axios.get(`${MEDIA_API}/search?q=latest+trending+music+hits`)
        .then(res => { setHomeResults(res.data.results); })
        .catch(e => console.error("Trending search failed", e));

      const featTask = axios.get(`${API_BASE}/featured-playlists`)
        .then(res => { setFeaturedPlaylists(res.data); })
        .catch(e => console.error("Featured playlists failed", e));

      await Promise.all([searchTask, featTask]);
      setIsHomeLoading(false);
    };
    fetchHomeData();
  }, []);

  // Load this account's REAL history (plays + searches) — the raw taste
  // signals that make the home page different for every single user.
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    let cancelled = false;
    const h = { Authorization: `Bearer ${token}` };
    (async () => {
      try {
        const [lh, sh] = await Promise.all([
          axios.get(`${API_BASE}/users/listen-history?limit=30`, { headers: h }),
          axios.get(`${API_BASE}/users/search-history?limit=30`, { headers: h })
        ]);
        if (!cancelled) {
          setListenHistory(lh.data.tracks || []);
          setSearchHistory(sh.data.queries || []);
        }
      } catch (e) { console.error('history load failed', e); }
      finally { if (!cancelled) setTasteLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Build + fetch the personalized shelves once the taste signals are in
  useEffect(() => {
    if (!user || !tasteLoaded) return;
    const specs = buildTasteShelves({ listenHistory, searchHistory, likedSongsList });
    if (!specs.length) { setPersonalShelves([]); setIsTasteLoading(false); return; }
    let cancelled = false;
    setIsTasteLoading(true);
    Promise.all(specs.map(async spec => {
      try {
        if (spec.recommend) {
          // Backend radio-mix: true vibe matching off one track
          const r = await axios.get(`${MEDIA_API}/recommendations`, { params: spec.recommend });
          return { ...spec, tracks: (r.data.results || []).slice(0, 12) };
        }
        const r = await axios.get(`${MEDIA_API}/search?q=${encodeURIComponent(spec.query)}`);
        return { ...spec, tracks: (r.data.results || []).slice(0, 12) };
      } catch { return { ...spec, tracks: [] }; }
    })).then(shelves => {
      if (cancelled) return;
      setPersonalShelves(shelves.filter(s => s.tracks.length > 0));
      setIsTasteLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, tasteLoaded, listenHistory, searchHistory, likedSongsList]);

  const handleOnboardingComplete = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API_BASE}/users/onboarding`, {
        genres: selectedGenres,
        artists: selectedArtists
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowOnboarding(false);
    } catch (e) { console.error(e); }
  };

  const handleSaveProfile = async (photoUrl = null) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.put(`${API_BASE}/users/profile`, {
        username: editUsername || user.username,
        email: editEmail || user.email,
        profile_photo: photoUrl || user.profile_photo,
        bio: editBio || '',
      }, { headers: { Authorization: `Bearer ${token}` } });

      setUser(prev => ({ ...prev, ...res.data }));
      setIsEditingProfile(false);
      if (editUsername && editUsername !== user.username) {
        // JWT is issued for the old username — silently re-auth so the
        // session keeps working (there is no login screen to fall back on)
        try {
          let creds = JSON.parse(localStorage.getItem('kettle_guest') || 'null');
          if (creds) {
            const r = await axios.post(`${API_BASE}/login`, {
              ...creds, username: editUsername, email: editEmail || user.email
            });
            localStorage.setItem('token', r.data.access_token);
            localStorage.setItem('kettle_guest', JSON.stringify({
              ...creds, username: editUsername, email: editEmail || user.email
            }));
          }
        } catch { /* keep old token — next launch re-registers a guest */ }
      }
    } catch (e) {
      alert(e.response?.data?.detail || "Update failed");
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const token = localStorage.getItem('token');

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Local backend proxy, authenticated like every other account call
      const res = await axios.post(`${API_BASE}/upload-to-catbox`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
      });
      const photoUrl = res.data.url;
      await handleSaveProfile(photoUrl);
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const startEditing = () => {
    setEditUsername(user.username);
    setEditEmail(user.email || "");
    setEditBio(user.bio || "");
    setIsEditingProfile(true);
  };

  // Debounced search
  const onSearch = useCallback((e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setCurrentPage('search');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.length > 2) {
      setIsLoading(true);
      const reqId = ++searchReqIdRef.current; // identify THIS request
      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await axios.get(`${MEDIA_API}/search?q=${encodeURIComponent(val)}`);
          // Only the newest request may write results/loading state
          if (reqId !== searchReqIdRef.current) return;
          setResults(res.data.results);
          setCurrentPage('search');
          // Record search history
          const token = localStorage.getItem('token');
          if (token) axios.post(`${API_BASE}/users/search-history?q=${encodeURIComponent(val)}`, {}, { headers: { Authorization: `Bearer ${token}` } });
        } catch (err) { console.error(err); }
        finally { if (reqId === searchReqIdRef.current) setIsLoading(false); }
      }, 400);
    } else {
      searchReqIdRef.current++; // invalidate in-flight requests
      setResults([]);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchPlaylists();
  }, [user, fetchPlaylists]);

  // Fetch liked songs
  const fetchLikedSongs = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/liked-songs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const songs = res.data.songs || [];
      // Only update state when content actually changed — identity churn
      // retriggers the taste-shelf builder for no reason every library open
      setLikedSongsList(prev => {
        if (prev.length === songs.length && prev.every((s, i) => s.id === songs[i].id)) return prev;
        return songs;
      });
      setLikedSongs(prev => {
        const next = new Set(songs.map(s => s.id));
        if (prev.size === next.size && [...next].every(k => prev.has(k))) return prev;
        return next;
      });
    } catch (err) { console.error(err); }
  }, [setLikedSongs]);

  const handlePlaylistClick = async (p) => {
    if (p.songs) {
      setCurrentPlaylist(p);
      setCurrentPage('playlist');
      return;
    }
    // If it's a featured/remote playlist
    try {
      if (p.query) {
        setIsLoading(true);
        const res = await axios.get(`${MEDIA_API}/search?q=${encodeURIComponent(p.query)}`);
        setCurrentPlaylist({ ...p, songs: res.data.results });
      } else {
        const res = await axios.get(`${API_BASE}/playlists/${p.id}`);
        setCurrentPlaylist(res.data);
      }
      setCurrentPage('playlist');
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName) return;
    await createPlaylist(newPlaylistName);
    setIsCreatingPlaylist(false);
    setNewPlaylistName("");
  };

  // Likes feed both the taste engine and the home "Your Favorites" list,
  // so they load as soon as the session exists (library page re-refreshes).
  useEffect(() => {
    if (user) fetchLikedSongs();
  }, [user, fetchLikedSongs]);

  useEffect(() => {
    if (currentPage === 'library') fetchLikedSongs();
  }, [currentPage, fetchLikedSongs]);

  // Continue Listening: this session's plays first, then the server-side
  // history (deduped by id) so the list survives restarts.
  const continueList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of [...recentTracks, ...listenHistory]) {
      if (!t || !t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }, [recentTracks, listenHistory]);

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const getClientX = (e) => (e.touches && e.touches[0] ? e.touches[0].clientX : e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : e.clientX);

  const handleProgressClick = (e) => {
    // Skip the redundant seek immediately after a drag-end (already applied on mouseup/touchend)
    if (isDragging || (dragEndedAtRef.current && Date.now() - dragEndedAtRef.current < 250)) return;
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const clientX = getClientX(e);
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(p * (duration || 0));
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    updateDrag(e);
  };

  const updateDrag = (e) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const clientX = getClientX(e);
    if (clientX == null) return;
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setDragProgress(p * (duration || 0));
  };

  useEffect(() => {
    if (isDragging) {
      const handleMove = (e) => updateDrag(e);
      const handleEnd = (e) => {
        updateDrag(e);
        dragEndedAtRef.current = Date.now();
        setIsDragging(false);
        const bar = progressBarRef.current;
        const clientX = getClientX(e);
        if (bar && clientX != null) {
          const rect = bar.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          seek(p * (duration || 0));
        }
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
        window.removeEventListener('touchcancel', handleEnd);
      };
    }
  }, [isDragging, duration, seek]);

  const displayProgress = isDragging ? dragProgress : progress;
  const progressPercent = duration > 0 ? (displayProgress / duration) * 100 : 0;

  // VIDEO MODE — hold the screen hostage to the video: after 2.6 s without
  // any pointer or key activity, every UI element fades away (like YouTube
  // / Apple TV immersive mode). ANY activity brings the controls back.
  useEffect(() => {
    if (!(showVideo && isFullPlayer)) {
      setFpIdle(false);
      return undefined;
    }
    let timer = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFpIdle(true), 2600);
    };
    const wake = () => { setFpIdle(false); arm(); };
    setFpIdle(false);
    arm();
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('wheel', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('wheel', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, [showVideo, isFullPlayer]);

  // Native: tapping "Video" promotes the YouTube iframe (mounted by
  // MusicContext) to fullscreen — it IS the native video layer.
  // Native: promote the YouTube iframe to full-bleed when the user opens
  // video mode in the fullscreen player. The iframe IS the video layer.
  useEffect(() => {
    if (!IS_NATIVE) return undefined;
    const on = !!(showVideo && isFullPlayer);
    document.body.classList.toggle('yt-video-mode', on);
    return () => { document.body.classList.remove('yt-video-mode'); };
  }, [showVideo, isFullPlayer]);

  // Escape closes the full-screen player (YouTube Music / Apple Music behavior)
  useEffect(() => {
    if (!isFullPlayer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setIsFullPlayer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullPlayer]);

  const handleVolumeClick = (e) => {
    const bar = volumeBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(p);
  };

  const shareCurrent = async () => {
    if (!currentTrack) return;
    const url = currentTrack.link || `https://www.youtube.com/watch?v=${currentTrack.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* clipboard unavailable */ }
    }
    setFpCopied(true);
    setTimeout(() => setFpCopied(false), 1800);
  };


  // Skeleton loader
  const SkeletonCard = () => (
    <div className="skeleton-card">
      <div className="skeleton-img shimmer" />
      <div className="skeleton-text shimmer" />
      <div className="skeleton-text short shimmer" />
    </div>
  );

  return (
    <div className={`app ${isFullPlayer ? 'player-expanded' : ''} ${IS_NATIVE && mobileFriendsOpen ? 'mobile-friends-open' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-box">
          <div className="logo" onClick={() => setCurrentPage('home')}>
            <img src={logoMark} alt="Kettle" className="logo-icon" />
            <span>Kettle</span>
          </div>
          <nav className="nav">
            <div className={`nav-item ${currentPage === 'home' ? 'active' : ''}`} onClick={() => setCurrentPage('home')}>
              <Home size={22} /><span>Home</span>
            </div>
            <div className={`nav-item ${currentPage === 'search' ? 'active' : ''}`} onClick={() => setCurrentPage('search')}>
              <Search size={22} /><span>Search</span>
            </div>
          </nav>
        </div>

        <div className="library-section">
          <div className="library-header">
            <span><Users size={17} /> Jam Session</span>
            {!currentRoom && <button className="header-action" onClick={() => setIsCreatingRoom(true)} aria-label="Create jam room"><PlusSquare size={17} /></button>}
          </div>
          <div className="jam-section-body">
            {currentRoom ? (
              <div className="active-jam-card" onClick={() => setCurrentPage('jam')}>
                <div className="jam-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={14} color="var(--primary-accent)" />
                    <p className="jam-name">{currentRoom}</p>
                  </div>
                  <span>{roomParticipants.length} listening \u2022 {isRoomHost ? 'Host' : 'Member'}</span>
                </div>
                <ChevronDown size={18} style={{ transform: 'rotate(-90deg)', color: 'var(--text-dim)' }} />
              </div>
            ) : (
              <div className="jam-join-box">
                <input
                  type="text"
                  placeholder={user ? "Enter code..." : "Loading account..."}
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && user && joinCode && joinRoom(joinCode)}
                  disabled={!user}
                  maxLength={10}
                />
                <button className="join-btn-mini" disabled={!user || !joinCode} onClick={() => user && joinCode && joinRoom(joinCode)}>Join</button>
              </div>
            )}
          </div>
        </div>

        <div className="library-section friends-section">
          <div className="library-header">
            <span><User size={17} /> Friends{friends.length > 0 && <span className="friends-count">{friends.length}</span>}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button className="header-action" onClick={() => setIsAddingFriend(!isAddingFriend)} aria-label="Add a friend"><UserPlus size={17} /></button>
              {IS_NATIVE && <button className="header-action mobile-friends-close" onClick={() => setMobileFriendsOpen(false)} aria-label="Close friends"><X size={17} /></button>}
            </div>
          </div>
          <div className="jam-section-body friends-body">
            {ownFriendCode && (
              <button className="friend-code-card" onClick={copyFriendCode} title="Copy your friend code">
                <div className="friend-code-card-label">Your friend code</div>
                <div className="friend-code-value">{ownFriendCode}</div>
                <div className="friend-code-hint">{copiedFriendCode ? 'Copied!' : 'Tap to copy'}</div>
              </button>
            )}

            {isAddingFriend && (
              <form className="jam-join-box friends-join-box" onSubmit={submitFriendRequest}>
                <input
                  type="text"
                  placeholder="KT-XXXXXX or username"
                  value={newFriendCodeDraft}
                  onChange={e => {
                    const val = e.target.value;
                    // Friend-code mode: anything starting (case-insensitively) with "kt"
                    // keeps code charset; everything else is a username lookup
                    if (/^kt/i.test(val)) {
                      setNewFriendCodeDraft(val.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10));
                    } else {
                      setNewFriendCodeDraft(val.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32));
                    }
                  }}
                  autoFocus
                />
                <button type="submit" className="join-btn-mini" disabled={!newFriendCodeDraft}>Send</button>
              </form>
            )}

            {friendRequests.length > 0 && (
              <div className="friend-requests-block">
                <div className="friend-requests-label">{friendRequests.length} pending</div>
                {friendRequests.map(req => (
                  <div key={req.friendship_id} className="friend-row friend-request-row">
                    <InitialsAvatar username={req.username} photo={req.profile_photo} size={32} online={req.is_online} />
                    <div className="friend-meta">
                      <div className="friend-name">{req.username}</div>
                      {req.message && <div className="friend-msg">"{req.message}"</div>}
                    </div>
                    <div className="friend-actions">
                      <button onClick={() => respondToFriendRequest(req.friendship_id, 'accept')} aria-label="Accept"><Check size={14} /></button>
                      <button onClick={() => respondToFriendRequest(req.friendship_id, 'decline')} aria-label="Decline"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="friends-list">
              {friends.map(friend => (
                <div key={friend.friendship_id} className="friend-row">
                  <InitialsAvatar username={friend.username} photo={friend.profile_photo} size={32} online={friend.is_online} />
                  <div className="friend-meta">
                    <div className="friend-name">{friend.username}</div>
                    <div className="friend-status">{friend.is_online ? 'Online now' : 'last seen ' + relativeTime(friend.last_seen)}</div>
                  </div>
                  <button className="friend-remove-btn" onClick={() => removeFriend(friend.friendship_id)} aria-label="Remove friend">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {friends.length === 0 && friendRequests.length === 0 && !ownFriendCode && (
                <div className="friend-code-pending">
                  <p>Friend sync ships with the next cloud update. Check again after it deploys.</p>
                  <button className="friend-code-check-btn" onClick={refreshSessionFromCloud}>
                    <RefreshCw size={16} /> Check again
                  </button>
                </div>
              )}
              {friends.length === 0 && friendRequests.length === 0 && ownFriendCode && (
                <div className="friends-empty">
                  No friends yet. Share your code <strong style={{ color: 'var(--text)' }}>{ownFriendCode}</strong> — or paste <strong style={{ color: 'var(--text)' }}>somebody's</strong> code above to add them.
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="library-section section--grow">
          <div className="library-header">
            <span><Library size={17} /> Your Library</span>
            <button className="header-action" onClick={() => setIsCreatingPlaylist(true)} aria-label="Create playlist"><PlusSquare size={17} /></button>
          </div>

          <div className="library-scroll">
            <div className="pl-item" onClick={() => setCurrentPage('library')}>
              <div className="pl-item-img" style={{ background: 'linear-gradient(135deg, #450af5, #c4efd9)' }}>
                <Heart size={20} fill="white" color="white" />
              </div>
              <div className="pl-item-info">
                <p>Liked Songs</p>
                <span>Playlist \u2022 {likedSongs.size} songs</span>
              </div>
            </div>

            {playlists.map(p => (
              <div key={p.id} className="pl-item" onClick={() => handlePlaylistClick(p)}>
                <div className="pl-item-img">
                  <ListMusic size={20} />
                </div>
                <div className="pl-item-info">
                  <p>{p.name}</p>
                  <span>Playlist \u2022 {displayName || user?.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <div className="nav-controls">
            <button className="nav-btn" onClick={goBack} disabled={!canGoBack} aria-label="Go back"><ChevronLeft size={18} /></button>
            <button className="nav-btn" onClick={goForward} disabled={!canGoForward} aria-label="Go forward"><ChevronRight size={18} /></button>
          </div>

          <div className="search-wrap">
            <Search size={18} className="search-icon" />
            <input
              placeholder="What do you want to listen to?"
              value={searchQuery}
              onChange={onSearch}
              id="search-input"
            />
          </div>
          <div className="topbar-right">
            {user ? (
              <div className="user-account-trigger" onClick={() => setShowAccountPanel(true)}>
                {user.profile_photo ? (
                  <img src={user.profile_photo} className="user-icon-circle" style={{ objectFit: 'cover' }} alt="" />
                ) : (
                  <User size={18} className="user-icon-circle" />
                )}
                <span className="username-text">{displayName || user.username}</span>
              </div>
            ) : (
              // Session still warming up under the splash — no login, ever
              <div className="user-account-trigger ghost" aria-hidden="true" />
            )}
          </div>
        </header>

        <section className="content">
          <AnimatePresence mode="wait">
            {currentPage === 'home' && (
              <motion.div key="home" className="home-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {/* 1. VIBE HERO — time-of-day gradient + mood chips: sets the tone */}
                <div className={`vibe-hero ${VIBE.dark ? 'dark' : ''}`} style={{ background: VIBE.grad }}>
                  <div className="vibe-blobs" aria-hidden="true">
                    <span style={{ background: VIBE.blob1 }} />
                    <span style={{ background: VIBE.blob2 }} />
                  </div>
                  <div className="vibe-hero-content">
                    <p className="vibe-kicker">
                      {VIBE.greeting}{displayName ? `, ${displayName}` : ''}
                      <span className="vibe-dot">\u2022</span>{VIBE.mood}
                    </p>
                    <h1 className="vibe-title">{VIBE.headline}</h1>
                    <p className="vibe-line">{VIBE.line}</p>
                    <div className="mood-chips">
                      {MOOD_CHIPS.map(m => (
                        <button key={m.label} className="mood-chip" onClick={() => handlePlaylistClick({ name: `${m.label} Mix`, query: m.query, type: 'mood' })}>
                          <m.icon size={16} strokeWidth={2.2} className="mood-glyph" />{m.label}
                        </button>
                      ))}
                    </div>
                    <div className="vibe-actions">
                      <button className="hero-play-btn" onClick={() => handlePlaylistClick({ name: VIBE.mood, query: VIBE.playQuery, type: 'mood' })}>
                        <Play size={18} fill="currentColor" /> Play the Vibe
                      </button>
                      {continueList.length > 0 && (
                        <button className="hero-ghost-btn" onClick={() => playTrack(continueList[0], continueList)}>
                          <Play size={15} fill="currentColor" /> Resume
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. CONTINUE LISTENING — the user's real play history as a list */}
                {continueList.length > 0 && (
                  <div className="home-section">
                    <div className="section-header">
                      <h2><Clock size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary-accent)' }} /> Continue Listening</h2>
                      {continueList.length > 8 && (
                        <span className="show-all" onClick={() => setShowAllRecent(v => !v)}>
                          {showAllRecent ? 'Show less' : `Show all ${continueList.length}`}
                        </span>
                      )}
                    </div>
                    <div className="track-list">
                      {(showAllRecent ? continueList : continueList.slice(0, 8)).map((track, i) => (
                        <TrackRow key={`${track.id}-${i}`} track={track} index={i} list={continueList}
                          isActive={currentTrack?.id === track.id} isPlaying={isPlaying}
                          isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike}
                          playlists={playlists} onAddToPlaylist={addToPlaylist} />
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. MADE FOR YOU — different shelves for every single user,
                    built from that account's own plays, likes and searches */}
                <div className="home-section">
                  <div className="section-header">
                    <h2><Disc3 size={22} className="section-disc" /> Made for {displayName || user?.username || 'You'}</h2>
                    <span className="show-all" style={{ cursor: 'default' }}>Personalized from your listening</span>
                  </div>
                  {isTasteLoading && personalShelves.length === 0 ? (
                    <div className="h-scroll">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="music-card skeleton-card">
                          <div className="card-img-wrap shimmer" />
                          <div className="skeleton-text shimmer" />
                          <div className="skeleton-text short shimmer" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    personalShelves.map(shelf => (
                      <div key={shelf.key} className="shelf">
                        <div className="shelf-head">
                          <div>
                            <h3>{shelf.title}</h3>
                            <p>{shelf.sub}</p>
                          </div>
                        </div>
                        <div className="h-scroll">
                          {shelf.tracks.map(t => (
                            <MediaCard key={t.id} track={t} list={shelf.tracks} onPlay={playTrack} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 4. TRENDING — live YouTube results, the universal baseline */}
                <div className="home-section">
                  <div className="section-header">
                    <h2><Flame size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary-accent)' }} fill="currentColor" /> Trending Now</h2>
                  </div>
                  {isHomeLoading ? (
                    <div className="h-scroll">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className="music-card skeleton-card">
                          <div className="card-img-wrap shimmer" />
                          <div className="skeleton-text shimmer" />
                          <div className="skeleton-text short shimmer" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-scroll">
                      {homeResults.slice(0, 12).map(t => (
                        <MediaCard key={t.id} track={t} list={homeResults} onPlay={playTrack} />
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. FEATURED PLAYLISTS — curated moods & artist radios */}
                {featuredPlaylists.length > 0 && (
                  <div className="home-section">
                    <div className="section-header">
                      <h2>Made for the Mood</h2>
                    </div>
                    <div className="h-scroll">
                      {featuredPlaylists.slice(0, 12).map(p => (
                        <div key={p.id} className="music-card" style={{ minWidth: 180, width: 180 }} onClick={() => handlePlaylistClick(p)}>
                          <div className="card-img-wrap">
                            <img src={p.image} alt="" loading="lazy" />
                            <button className="card-play-btn"><Play size={22} fill="black" /></button>
                          </div>
                          <p className="card-title">{p.name}</p>
                          <p className="card-sub">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. YOUR FAVORITES — liked songs as a quick list */}
                {likedSongsList.length > 0 && (
                  <div className="home-section">
                    <div className="section-header">
                      <h2><Heart size={22} fill="#e60000" color="#e60000" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} /> Your Favorites</h2>
                      <span className="show-all" onClick={() => setCurrentPage('library')}>Show all</span>
                    </div>
                    <div className="track-list">
                      {likedSongsList.slice(0, 5).map((track, i) => (
                        <TrackRow key={`${track.id}-${i}`} track={track} index={i} list={likedSongsList}
                          isActive={currentTrack?.id === track.id} isPlaying={isPlaying}
                          isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike}
                          playlists={playlists} onAddToPlaylist={addToPlaylist} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="home-spacer" style={{ height: '40px' }} />
              </motion.div>
            )}

            {currentPage === 'search' && (
              <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <h2 className="section-heading">
                  {searchQuery ? `Results for "${searchQuery}"` : 'Search'}
                </h2>
                {isLoading ? (
                  <div className="track-list">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="skeleton-row shimmer" />
                    ))}
                  </div>
                ) : results.length > 0 ? (
                  <div className="track-list">
                    <div className="track-list-header">
                      <span className="th-num">#</span>
                      <span className="th-title">Title</span>
                      <span className="th-dur"><Clock size={14} /></span>
                    </div>
                    {results.map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} list={[track]} isActive={currentTrack?.id === track.id} isPlaying={isPlaying} isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike} playlists={playlists} onAddToPlaylist={addToPlaylist} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Search size={48} strokeWidth={1} />
                    <h3>Search for music</h3>
                    <p>Find your favorite songs, artists, and albums.</p>
                  </div>
                )}
              </motion.div>
            )}

            {currentPage === 'jam' && (
              <motion.div key="jam" className="jam-room-page" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {!currentRoom ? (
                  <div className="empty-state">
                    <Users size={64} color="var(--primary-accent)" />
                    <h2>Not in a Jam</h2>
                    <p>Join or create a session to listen together.</p>
                    <form className="jam-join-box" style={{ marginTop: '18px', maxWidth: '320px', marginInline: 'auto' }} onSubmit={(e) => { e.preventDefault(); if (user && joinCode) joinRoom(joinCode.toUpperCase()); }}>
                      <input
                        type="text"
                        placeholder={user ? "Enter room code..." : "Loading account..."}
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        disabled={!user}
                        maxLength={10}
                        aria-label="Room code"
                      />
                      <button className="join-btn-mini" type="submit" disabled={!user || !joinCode}>Join</button>
                    </form>
                    <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => setIsCreatingRoom(true)}>Create Session</button>
                  </div>
                ) : (
                  <div className="jam-grid">
                    <div className="jam-main-view">
                      <div className="jam-header-row">
                        <div className="jam-title-block">
                          <span className="live-tag">LIVE SESSION</span>
                          <h1>{currentRoom}</h1>
                          {roomStatus !== 'connected' && (
                            <span className="jam-status-pill jam-status-pill--warn" role="status" aria-live="polite">
                              {roomStatus === 'connecting' ? 'Connecting to the room\u2026' : 'Connection lost \u2014 leave and rejoin'}
                            </span>
                          )}
                        </div>
                        <div className="jam-actions">
                          <button className="share-btn" onClick={() => { navigator.clipboard.writeText(currentRoom); alert("Code copied!"); }}>
                            <Share2 size={18} /> <span>{currentRoom}</span>
                          </button>
                          <button className="leave-btn-red" onClick={leaveRoom}>Leave Session</button>
                        </div>
                      </div>

                      {currentTrack ? (
                        <div className="jam-now-playing">
                          <div className="jam-art-wrap">
                            <img src={currentTrack.thumbnail} className="jam-big-art" alt="" />
                            {isPlaying && <div className="art-pulse" />}
                          </div>
                          <div className="jam-track-info">
                            <h2>{currentTrack.title}</h2>
                            <p>{currentTrack.channel}</p>
                            <div className="jam-visualizer">
                              {[...Array(12)].map((_, i) => <div key={i} className="v-bar" style={{ animationDelay: `${i * 0.1}s` }} />)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="jam-nothing-playing">
                          <p>Nothing playing yet...</p>
                        </div>
                      )}
                    </div>

                    <div className="jam-sidebar-view">
                      <div className="jam-panel-section">
                        <h3>Participants ({roomParticipants.length})</h3>
                        <div className="participant-list">
                          {(roomParticipants || []).map((p) => (
                            <div key={p} className="participant-item">
                              <div className="p-avatar">
                                {p ? String(p).charAt(0).toUpperCase() : '?'}
                                {p === (user?.username || "Guest") && <div className="me-badge" />}
                              </div>
                              <div className="p-info">
                                <p>{p || "Unknown"}</p>
                                <span>{p === (user?.username || "Guest") ? (isRoomHost ? 'Room Host' : 'Listening') : 'Listening'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {isRoomHost && (
                        <div className="jam-panel-section" style={{ marginTop: '32px' }}>
                          <h3>Room Settings</h3>
                          <div className="settings-stack">
                            <div className="setting-toggle">
                              <span>Allow Skips</span>
                              <div className={`toggle-pill ${roomSettings.allow_skips ? 'active' : ''}`} onClick={() => updateRoomSettings({ allow_skips: !roomSettings.allow_skips })} />
                            </div>
                            <div className="setting-toggle">
                              <span>Collaborative Queue</span>
                              <div className={`toggle-pill ${roomSettings.allow_add_to_queue ? 'active' : ''}`} onClick={() => updateRoomSettings({ allow_add_to_queue: !roomSettings.allow_add_to_queue })} />
                            </div>
                            <div className="setting-toggle">
                              <span>Private Session</span>
                              <div className={`toggle-pill ${roomSettings.private_room ? 'active' : ''}`} onClick={() => updateRoomSettings({ private_room: !roomSettings.private_room })} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {currentPage === 'playlist' && currentPlaylist && (
              <motion.div key="playlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <div className="playlist-header">
                  <div className="pl-art">
                    {currentPlaylist.image ? <img src={currentPlaylist.image} alt="" /> : <ListMusic size={64} color="var(--primary)" />}
                  </div>
                  <div className="pl-info">
                    <p className="pl-tag">{currentPlaylist.type === 'mood' ? 'Mood Playlist' : currentPlaylist.type === 'artist' ? 'Artist Radio' : 'Playlist'}</p>
                    <h1 className="pl-name-big">{currentPlaylist.name}</h1>
                    <p className="pl-desc">{currentPlaylist.description}</p>
                    <div className="pl-actions">
                      <button className="pl-play-main" disabled={!currentPlaylist.songs?.length} onClick={() => playTrack(currentPlaylist.songs[0], currentPlaylist.songs)}>
                        <Play size={24} fill="black" /> Play
                      </button>
                    </div>
                  </div>
                </div>
                <div className="track-list">
                  <div className="track-list-header">
                    <span className="th-num">#</span>
                    <span className="th-title">Title</span>
                    <span className="th-dur"><Clock size={14} /></span>
                  </div>
                  {currentPlaylist.songs?.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} list={currentPlaylist.songs} isActive={currentTrack?.id === track.id} isPlaying={isPlaying} isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike} playlists={playlists} onAddToPlaylist={addToPlaylist} />
                  ))}
                </div>
              </motion.div>
            )}

            {currentPage === 'library' && (
              <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <h2 className="section-heading">
                  <Heart size={28} fill="#e60000" color="#e60000" /> Liked Songs
                </h2>
                {likedSongsList.length > 0 ? (
                  <div className="track-list">
                    {likedSongsList.map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} list={likedSongsList} isActive={currentTrack?.id === track.id} isPlaying={isPlaying} isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike} playlists={playlists} onAddToPlaylist={addToPlaylist} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Heart size={48} strokeWidth={1} />
                    <h3>Songs you like appear here</h3>
                    <p>Save songs by tapping the heart icon.</p>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </section>
      </main>

      {/* Right Panel */}
      <aside className="right-panel">
        <div className="now-playing-box">
          <div className="now-playing-header">
            <h3>Now Playing</h3>
            <X size={18} className="ctrl-icon" onClick={() => setIsFullPlayer(false)} />
          </div>

          {currentTrack ? (
            <>
              <div className="now-playing-art">
                {showVideo && !isFullPlayer && !IS_NATIVE ? (
                  <video
                    ref={el => { videoRef.current = el; if (el) el.muted = true; }}
                    src={`${MEDIA_API}/stream-video/${currentTrack.id}`}
                    poster={currentTrack.thumbnail}
                    muted
                    playsInline
                    preload="metadata"
                    onError={() => setShowVideo(false)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)', background: '#000' }}
                  />
                ) : (
                  <img src={currentTrack.thumbnail} alt="" />
                )}
              </div>
              <div className="now-playing-info">
                <h2>{currentTrack.title.split('|')[0].trim()}</h2>
                <p>{currentTrack.channel}</p>
              </div>

              <button
                className="btn-secondary"
                style={{ width: '100%', marginTop: '12px', background: 'var(--elevated)', border: '1px solid var(--border)', padding: '8px', borderRadius: '20px', color: 'var(--text)', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => setShowVideo(v => !v)}
              >
                {showVideo ? 'Switch to Audio Image' : 'Switch to Video'}
              </button>

              <div className="about-artist">
                <h4>About the artist</h4>
                <p>
                  {currentTrack.channel} is one of the most trending creators on the platform.
                  Currently vibing with thousands of listeners worldwide.
                </p>
              </div>

              <div className="next-in-queue" style={{ marginTop: '24px' }}>
                <div className="section-header">
                  <h4 style={{ fontSize: '14px', fontWeight: '800' }}>Next in queue</h4>
                  <span className="show-all" onClick={() => setShowQueue(true)}>Open queue</span>
                </div>
                {(() => {
                  // Show the track AFTER the current one — not blindly queue[1],
                  // which is often the currently-playing track itself
                  const ci = queue.findIndex(t => t?.id === currentTrack?.id);
                  const nextUp = ci >= 0 ? queue[ci + 1] : queue.find(t => t?.id !== currentTrack?.id);
                  if (!nextUp) return <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>Queue is empty</p>;
                  return (
                    <div className="pl-item" style={{ background: 'var(--elevated)', marginTop: '8px' }}>
                      <img src={nextUp.thumbnail} style={{ width: '48px', height: '48px', borderRadius: '4px' }} alt="" />
                      <div className="pl-item-info">
                        <p style={{ fontSize: '13px' }}>{nextUp.title.slice(0, 30)}...</p>
                        <span style={{ fontSize: '11px' }}>{nextUp.channel}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="friend-activity" style={{ marginTop: '32px' }}>
                <div className="section-header">
                  <h4 style={{ fontSize: '14px', fontWeight: '800' }}>Friend Activity</h4>
                  <User size={16} className="ctrl-icon" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                  {[
                    { name: 'Anirudh', track: 'Blinding Lights', time: '2m', img: 'https://i.pravatar.cc/150?u=ani' },
                    { name: 'Rahul', track: 'Kesariya', time: '10m', img: 'https://i.pravatar.cc/150?u=rahul' },
                    { name: 'Sneha', track: 'Starboy', time: '1h', img: 'https://i.pravatar.cc/150?u=sneha' }
                  ].map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <img src={f.img} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="" />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: '700' }}>{f.name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.track} \u2014 {f.time}</p>
                      </div>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1db954' }} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Disc3 size={48} />
              <p>Select a song to start listening</p>
            </div>
          )}
        </div>
      </aside>

      <AnimatePresence>
        {showAccountPanel && user && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAccountPanel(false)}>
            <motion.div
              className="account-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="account-panel-header">
                <h2>Account Management</h2>
                <X size={24} className="ctrl-icon" onClick={() => setShowAccountPanel(false)} />
              </div>

              <div className="account-profile-hero">
                <div
                  className={`profile-avatar-large ${isUploading ? 'uploading' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {user.profile_photo ? (
                    <img src={user.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    (displayName || user.username)[0].toUpperCase()
                  )}
                  <div className="avatar-edit-overlay">
                    {isUploading ? <Disc3 className="spin" size={24} /> : <Camera size={20} />}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                </div>
                <div className="profile-info-large">
                  {isEditingProfile ? (
                    <div className="profile-edit-fields">
                      <input
                        type="text"
                        value={editUsername}
                        onChange={e => setEditUsername(e.target.value)}
                        placeholder="Username"
                        className="edit-input"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        placeholder="Email"
                        className="edit-input"
                      />
                      <textarea
                        value={editBio}
                        onChange={e => setEditBio(e.target.value.slice(0, 160))}
                        placeholder="Bio — one line about you (optional)"
                        className="edit-input"
                        rows={2}
                      />
                      <div className="profile-edit-actions">
                        <button className="btn-save" onClick={handleSaveProfile}>Save</button>
                        <button className="btn-cancel-small" onClick={() => setIsEditingProfile(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1>{displayName || user.username}</h1>
                      <p>{user.username !== displayName ? `@${user.username} \u00b7 ` : ''}{user.email || user.friend_code || '\u2014'}</p>
                      {user.friend_code && (
                        <button className="friend-code-pill" onClick={copyFriendCode} title="Copy your friend code">
                          <span className="friend-code-pill-label">Your code</span>
                          <span className="friend-code-pill-value">{user.friend_code}</span>
                          <span className="friend-code-pill-copy">{copiedFriendCode ? 'Copied!' : 'Copy'}</span>
                        </button>
                      )}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 10 }}>
                        <span className="profile-badge">Free Member</span>
                        <span className="profile-badge" style={{ opacity: 0.7 }}>
                          {(user.friend_count || 0) === 1 ? '1 friend' : `${user.friend_count || 0} friends`}
                        </span>
                        <button className="edit-profile-btn" onClick={startEditing}>Edit Profile</button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="account-sections">
                {/* Your Plan */}
                <div className="account-section">
                  <div className="section-title">
                    <Disc3 size={18} /> <h3>Your Plan</h3>
                  </div>
                  <div className="membership-card spotify-style">
                    <div className="membership-info">
                      <p className="plan-name">Kettle Free</p>
                      <p className="plan-status">Ad-supported listening</p>
                    </div>
                    <button className="btn-join-premium">Join Premium</button>
                  </div>
                </div>

                {/* Account Management */}
                <div className="account-section">
                  <div className="section-title">
                    <User size={18} /> <h3>Account</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item" onClick={() => alert("Redirecting to subscription management...")}>
                      <div className="setting-label">
                        <span>Manage your subscription</span>
                        <p>Change your plan or billing cycle</p>
                      </div>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                    <div className="setting-item">
                      <div className="setting-label">
                        <span>Edit personal info</span>
                        <p>Update your email or username</p>
                      </div>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                    <div className="setting-item">
                      <div className="setting-label">
                        <span>Recover playlists</span>
                        <p>Get back playlists you've deleted</p>
                      </div>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                    <div className="setting-item">
                      <span>Address</span>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                  </div>
                </div>

                {/* Payment */}
                <div className="account-section">
                  <div className="section-title">
                    <ListMusic size={18} /> <h3>Payment</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Payment history</span></div>
                    <div className="setting-item"><span>Saved payment cards</span></div>
                    <div className="setting-item"><span>Redeem</span></div>
                  </div>
                </div>

                {/* Security & Privacy */}
                <div className="account-section">
                  <div className="section-title">
                    <Music2 size={18} /> <h3>Security and privacy</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Manage apps</span></div>
                    <div className="setting-item"><span>Notification settings</span></div>
                    <div className="setting-item"><span>Account privacy</span></div>
                    <div className="setting-item danger" onClick={() => alert("Are you sure you want to close your account?")}>
                      <span>Close account</span>
                    </div>
                  </div>
                </div>

                {/* Advertising */}
                <div className="account-section">
                  <div className="section-title">
                    <Maximize2 size={18} /> <h3>Advertising</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Ad preferences</span></div>
                  </div>
                </div>

                {/* Help */}
                <div className="account-section">
                  <div className="section-title">
                    <LifeBuoy size={18} /> <h3>Help</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Kettle support</span></div>
                  </div>
                </div>
              </div>

              <div className="account-footer">
                <button className="account-footer-btn primary" onClick={signOut}>Switch name</button>
                <p className="version-tag">Kettle v1.2.3</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingPlaylist && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <h3>Create New Playlist</h3>
              <input
                type="text"
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                autoFocus
              />
              <div className="modal-btns">
                <button className="btn-secondary" onClick={() => setIsCreatingPlaylist(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreatePlaylist}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingRoom && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <h3>Create Jam Room</h3>
              <input
                type="text"
                placeholder="Room Name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                autoFocus
              />
              <div className="modal-btns">
                <button className="btn-secondary" onClick={() => setIsCreatingRoom(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateRoom}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div className="modal-overlay onboarding-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content onboarding-content" initial={{ y: 50 }} animate={{ y: 0 }} exit={{ y: 50 }}>
              <div className="onboarding-header">
                <h1>{onboardingStep === 1 ? "What music do you love?" : "Choose your favorite artists"}</h1>
                <p>{onboardingStep === 1 ? "Select at least 3 genres to personalize your feed" : "Follow artists you enjoy"}</p>
              </div>

              {onboardingStep === 1 ? (
                <div className="genre-grid">
                  {ONBOARDING_GENRES.map(genre => (
                    <div
                      key={genre}
                      className={`genre-pill ${selectedGenres.includes(genre) ? 'selected' : ''}`}
                      onClick={() => setSelectedGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre])}
                    >
                      {genre}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="artist-selection-grid">
                  {ONBOARDING_ARTISTS.map(artist => (
                    <div
                      key={artist.name}
                      className={`artist-select-card ${selectedArtists.includes(artist.name) ? 'selected' : ''}`}
                      onClick={() => setSelectedArtists(prev => prev.includes(artist.name) ? prev.filter(a => a !== artist.name) : [...prev, artist.name])}
                    >
                      <img src={artist.img} alt="" />
                      <span>{artist.name}</span>
                      {selectedArtists.includes(artist.name) && <div className="select-check"><Disc3 size={14} /></div>}
                    </div>
                  ))}
                </div>
              )}

              <div className="onboarding-footer">
                {onboardingStep === 2 && (
                  <button className="btn-secondary" onClick={() => setOnboardingStep(1)}>Back</button>
                )}
                <div className="step-dots">
                  <div className={`dot ${onboardingStep === 1 ? 'active' : ''}`} />
                  <div className={`dot ${onboardingStep === 2 ? 'active' : ''}`} />
                </div>
                {onboardingStep === 1 ? (
                  <button className="btn-primary" disabled={selectedGenres.length < 3} onClick={() => setOnboardingStep(2)}>Next</button>
                ) : (
                  <button className="btn-primary" onClick={handleOnboardingComplete}>Finish Selection</button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue Panel */}
      <AnimatePresence>
        {showQueue && (
          <motion.aside
            className="queue-panel"
            initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          >
            <div className="queue-header">
              <h3>Queue</h3>
              <X size={20} className="queue-close" onClick={() => setShowQueue(false)} />
            </div>
            {currentTrack && (
              <div className="queue-now">
                <p className="queue-label">Now Playing</p>
                <div className="queue-item active">
                  <img src={currentTrack.thumbnail} alt="" />
                  <div>
                    <p className="q-title">{currentTrack.title}</p>
                    <p className="q-artist">{currentTrack.channel}</p>
                  </div>
                </div>
              </div>
            )}
            <p className="queue-label">Next Up</p>
            <div className="queue-list">
              {queue.filter(t => t.id !== currentTrack?.id).slice(0, 20).map((track, i) => (
                <div key={`${track?.id || 'q'}-${i}`} className="queue-item" onClick={() => playTrack(track, queue)}>
                  <img src={track.thumbnail} alt="" />
                  <div>
                    <p className="q-title">{track.title}</p>
                    <p className="q-artist">{track.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Player Bar */}
      <footer className="player-bar">
        <div className="pb-left">
          {currentTrack && (
            <>
              <img src={currentTrack.thumbnail} alt="" className="pb-art" onClick={() => setIsFullPlayer(true)} />
              <div className="pb-info">
                <p className="pb-title">{currentTrack.title.split('|')[0].trim()}</p>
                <p className="pb-artist">{currentTrack.channel}</p>
              </div>
              <Heart
                size={18}
                className={`pb-like ${likedSongs.has(currentTrack.id) ? 'liked' : ''}`}
                fill={likedSongs.has(currentTrack.id) ? '#1db954' : 'none'}
                color={likedSongs.has(currentTrack.id) ? '#1db954' : 'currentColor'}
                onClick={() => toggleLike(currentTrack)}
              />
            </>
          )}
        </div>

        <div className="pb-center">
          <div className="pb-controls">
            <Shuffle size={16} className={`ctrl-icon ${shuffle ? 'active' : ''}`} onClick={() => setShuffle(!shuffle)} />
            <SkipBack size={20} fill="currentColor" className="ctrl-icon" onClick={prevTrack} />
            <button className="play-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} fill="black" color="black" /> : <Play size={20} fill="black" color="black" />}
            </button>
            <SkipForward size={20} fill="currentColor" className="ctrl-icon" onClick={nextTrack} />
            {repeat === 'one' ? <Repeat1 size={16} className="ctrl-icon active" onClick={() => setRepeat('none')} /> :
              <Repeat size={16} className={`ctrl-icon ${repeat !== 'none' ? 'active' : ''}`} onClick={() => setRepeat(repeat === 'none' ? 'all' : 'one')} />}
          </div>
          <div className="pb-progress-wrap">
            <span className="pb-time">{formatTime(progress)}</span>
            <div className="progress-bar" ref={progressBarRef} onMouseDown={handleDragStart} onClick={handleProgressClick}>
              <div className="progress-fill" style={{ width: `${progressPercent}%` }}>
                <div className="progress-knob" />
              </div>
            </div>
            <span className="pb-time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="pb-right">
          <ListMusic size={18} className="ctrl-icon" onClick={() => setShowQueue(!showQueue)} />
          <div className="vol-wrap">
            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <input
              type="range" min="0" max="1" step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="vol-slider"
              style={{
                backgroundImage: `linear-gradient(90deg, #e60000 ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%)`
              }}
            />
          </div>
          <Maximize2 size={18} className="ctrl-icon" onClick={() => setIsFullPlayer(true)} />
        </div>
      </footer>

      {/* NATIVE BOTTOM NAV — phones get app-style thumb navigation */}
      {IS_NATIVE && (
        <nav className="mobile-nav" aria-label="Main navigation">
          <button className={`mobile-nav-item ${!mobileFriendsOpen && currentPage === 'home' ? 'active' : ''}`} onClick={() => { setMobileFriendsOpen(false); setCurrentPage('home'); }} aria-label="Home"><Home size={21} /><span>Home</span></button>
          <button className={`mobile-nav-item ${!mobileFriendsOpen && currentPage === 'search' ? 'active' : ''}`} onClick={() => { setMobileFriendsOpen(false); setCurrentPage('search'); }} aria-label="Search"><Search size={21} /><span>Search</span></button>
          <button className={`mobile-nav-item ${!mobileFriendsOpen && currentPage === 'jam' ? 'active' : ''}`} onClick={() => { setMobileFriendsOpen(false); setCurrentPage('jam'); }} aria-label="Jam Session"><Users size={21} /><span>Jam</span></button>
          <button className={`mobile-nav-item ${!mobileFriendsOpen && currentPage === 'library' ? 'active' : ''}`} onClick={() => { setMobileFriendsOpen(false); setCurrentPage('library'); }} aria-label="Library"><Library size={21} /><span>Library</span></button>
          <button className={`mobile-nav-item ${mobileFriendsOpen ? 'active' : ''}`} onClick={() => setMobileFriendsOpen(v => !v)} aria-label="Friends"><User size={21} /><span>Friends</span></button>
        </nav>
      )}

      {/* FULL-SCREEN PLAYER — immersive: full-bleed video when video mode is on,
           otherwise a cinematic blurred-art stage. Nothing else renders behind it. */}
      <AnimatePresence>
        {isFullPlayer && currentTrack && (
          <motion.div
            className={`fullscreen-player ${showVideo ? 'is-video' : 'is-art'} ${fpIdle ? 'fp-idle' : ''}`}
            role="dialog"
            aria-label="Now playing"
            initial={{ opacity: 0, y: 56 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 56 }}
            transition={{ type: 'spring', damping: 32, stiffness: 280 }}
          >
            {/* Background layer */}
            {showVideo && !IS_NATIVE ? (
              <video
                ref={el => { videoRef.current = el; if (el) el.muted = true; }}
                className="fp-video"
                src={`${MEDIA_API}/stream-video/${currentTrack.id}`}
                poster={currentTrack.thumbnail}
                muted
                playsInline
                preload="metadata"
                onError={() => setShowVideo(false)}
              />
            ) : !(IS_NATIVE && showVideo) ? (
              <div className="fp-backdrop" style={{ backgroundImage: `url(${currentTrack.thumbnail})` }} />
            ) : null}
            <div className="fp-vignette" aria-hidden="true" />

            {/* Top bar */}
            <header className="fp-topbar">
              <button className="fp-icon-btn" onClick={() => setIsFullPlayer(false)} aria-label="Close player"><ChevronDown size={22} /></button>
              <p className="fp-kicker">{showVideo ? 'Now Playing — Video' : 'Now Playing'}</p>
              <div className="fp-top-actions">
                <button className="fp-icon-btn" onClick={shareCurrent} aria-label={fpCopied ? 'Link copied' : 'Copy track link'}>
                  {fpCopied ? <Check size={18} /> : <Share2 size={18} />}
                </button>
                <button className="fp-icon-btn" onClick={() => setShowQueue(q => !q)} aria-label="Toggle up next"><ListMusic size={18} /></button>
              </div>
            </header>

            {/* Stage */}
            <div className="fp-stage">
              <div className="fp-main">
                {!showVideo && (
                  <div className="fp-art-wrap">
                    <img src={currentTrack.thumbnail} className="fp-art" alt="" draggable={false} />
                  </div>
                )}
                <div className="fp-info">
                  <p className="fp-track-kicker">{showVideo ? 'Playing Video' : 'Track'}</p>
                  <h1 className="fp-title">{(currentTrack.title || '').split('|')[0].trim()}</h1>
                  <p className="fp-artist">{currentTrack.channel}</p>

                  <div
                    className="fp-seek"
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.floor(duration || 0)}
                    aria-valuenow={Math.floor(progress || 0)}
                    tabIndex={0}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX;
                      const p = Math.max(0, Math.min(rect.width, x - rect.left)) / rect.width;
                      seek(p * (duration || 0));
                    }}
                    onTouchStart={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.touches?.[0]?.clientX ?? e.clientX;
                      const p = Math.max(0, Math.min(rect.width, x - rect.left)) / rect.width;
                      seek(p * (duration || 0));
                    }}
                  >
                    <div className="fp-seek-fill" style={{ width: `${progressPercent}%` }}>
                      <div className="fp-seek-knob" />
                    </div>
                  </div>
                  <div className="fp-times">
                    <span>{formatTime(displayProgress)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <div className="fp-transport">
                    <Shuffle size={20} className={`fp-ghost ${shuffle ? 'active' : ''}`} onClick={() => setShuffle(s => !s)} role="button" aria-label="Shuffle" />
                    <SkipBack size={26} fill="white" className="fp-skip" onClick={prevTrack} aria-label="Previous" />
                    <button className="fp-play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                      {isPlaying ? <Pause size={30} fill="#060606" color="#060606" /> : <Play size={30} fill="#060606" color="#060606" style={{ marginLeft: 3 }} />}
                    </button>
                    <SkipForward size={26} fill="white" className="fp-skip" onClick={nextTrack} aria-label="Next" />
                    {repeat === 'one'
                      ? <Repeat1 size={20} className="fp-ghost active" onClick={() => setRepeat('none')} role="button" aria-label="Repeat one" />
                      : <Repeat size={20} className={`fp-ghost ${repeat !== 'none' ? 'active' : ''}`} onClick={() => setRepeat(repeat === 'none' ? 'all' : 'one')} role="button" aria-label="Repeat" />}
                  </div>

                  <div className="fp-secondary">
                    <button className="fp-pill" onClick={() => setShowVideo(v => !v)}>
                      <MonitorPlay size={16} /> {showVideo ? 'Video on' : 'Switch to video'}
                    </button>
                    <button
                      className="fp-pill fp-pill-icon"
                      onClick={() => toggleLike(currentTrack)}
                      aria-pressed={likedSongs.has(currentTrack.id)}
                      aria-label="Like track"
                    >
                      <Heart
                        size={17}
                        fill={likedSongs.has(currentTrack.id) ? 'currentColor' : 'none'}
                        color={likedSongs.has(currentTrack.id) ? 'var(--primary-accent)' : 'currentColor'}
                      />
                    </button>
                    <label className="fp-volume" aria-label="Volume">
                      <Volume2 size={17} />
                      <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} aria-label="Volume" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STARTUP ANIMATION — minimalist: logo, wordmark, thin progress */}
      <AnimatePresence>
        {!splashDone && (
          <motion.div
            className="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
          >
            <div className="splash-center">
              <motion.div
                className="splash-logo-wrap"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <img src={logoMark} alt="" className="splash-logo" />
              </motion.div>
              <motion.h1
                className="splash-word"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >KETTLE</motion.h1>
              <motion.p
                className="splash-tag"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
              >Music. Redefined.</motion.p>
            </div>
            <div className="splash-progress" aria-hidden="true">
              <motion.div
                className="splash-progress-fill"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 5.6, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOGIN GATE — pick a name */}
      <AnimatePresence>
        {showNamePrompt && (
          <motion.div
            className="name-gate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="name-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src={logoMark} alt="" className="name-logo" />
              <h2>Welcome to Kettle</h2>
              <p>Pick a name — your account syncs your library, friends and Jam sessions on every device.</p>

              <form onSubmit={submitName}>
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  placeholder="Your name"
                  maxLength={24}
                  aria-label="Your name"
                />
                <button type="submit" disabled={!nameDraft.trim()}>
                  Start listening
                </button>
              </form>
              <p className="fineprint">No account required. Your name is all this app needs — you get a unique code and your taste syncs like magic.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Notification */}
      <AnimatePresence>
        {updateStatus && (
          <motion.div 
            className="update-notif"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            style={{
              position: 'fixed', bottom: '110px', right: '30px',
              background: '#181818', border: '1px solid var(--primary-accent)',
              padding: '16px', borderRadius: '16px', zIndex: 1000,
              display: 'flex', alignItems: 'center', gap: '16px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}
          >
            <Disc3 className="spin" size={24} color="var(--primary-accent)" />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: '700', fontSize: '14px', margin: 0 }}>
                {updateStatus === 'available' ? 'Update Downloading...' : 'Update Ready!'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>
                New features are waiting for you.
              </p>
            </div>
            {updateStatus === 'downloaded' && (
              <button 
                className="btn-primary" 
                style={{ padding: '8px 16px', fontSize: '12px' }}
                onClick={restartApp}
              >
                Restart Now
              </button>
            )}
            <X size={18} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setUpdateStatus(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
