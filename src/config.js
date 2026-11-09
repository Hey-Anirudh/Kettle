// Single source of truth for backend URLs.
// Used by both App.jsx and MusicContext.jsx so they can never drift apart.
//
// The app talks to TWO backends on purpose:
//   API_BASE  — shared cloud backend (accounts, likes, playlists, tastes,
//               JAM rooms). This is what makes Jam Sessions work between
//               different people on different machines.
//   LOCAL_API — the app's bundled on-device backend. YouTube extraction is
//               bot-checked on cloud/datacenter IPs, so search + streaming
//               must come from the LOCAL bundled backend (127.0.0.1:8000).
//
// VITE_* are baked in at build time (see .env.production / .env.development).

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
export const LOCAL_API = import.meta.env.VITE_LOCAL_API || 'http://127.0.0.1:8000';

// Where Google Sign-in is handled. DEFAULTS TO THE SHARED CLOUD, on purpose:
// session tokens are meaningless outside the issuing backend, and every
// cloud feature (jams, friends, likes, playlist sync) 401s for a session
// issued by the bundled backend. A local-exe sign-in would be a siloed
// session — the exact "not db connected" failure mode this app must avoid.
//
// TO MOVE SIGN-IN ENTIRELY ONTO RENDER (one-time setup, 5 minutes):
//   1. Google Cloud Console → APIs & Services → Credentials → your OAuth
//      client → add authorized redirect URI:
//        https://kettle-backend.onrender.com/auth/google/callback
//   2. Render dashboard → Kettle-backend → Environment → add:
//        GOOGLE_CLIENT_ID=<client id>
//        GOOGLE_CLIENT_SECRET=<client secret>
//      then Redeploy.
//   3. google sign-in is live. No rebuild needed — VITE_AUTH_BASE already
//      points here.
//
// Offline development: unset VITE_AUTH_BASE in your own .env.development and
// set VITE_AUTH_BASE=http://127.0.0.1:8000 to use the bundled backend
// (its .env carries the OAuth credentials).
export const AUTH_API = import.meta.env.VITE_AUTH_BASE || API_BASE;

export const WS_BASE = API_BASE.replace(/^http/, 'ws'); // https -> wss automatically (jam sync is shared)
