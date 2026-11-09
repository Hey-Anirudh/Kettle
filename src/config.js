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

// Where Google Sign-in is handled. Defaults to the bundled backend because
// the Google OAuth client secret lives in the bundled .env, not on the
// Render service (which deploys from the same repo without secrets). To
// move sign-in onto Render: add the Render callback URL to Google Cloud
// Console's authorized redirect URIs, set VITE_AUTH_BASE=https://kettle-backend.onrender.com
// and add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env secrets in the Render
// dashboard.
export const AUTH_API = import.meta.env.VITE_AUTH_BASE || LOCAL_API;

export const WS_BASE = API_BASE.replace(/^http/, 'ws'); // https -> wss automatically (jam sync is shared)
