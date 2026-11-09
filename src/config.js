// Single source of truth for backend URLs.
// Used by both App.jsx and MusicContext.jsx so they can never drift apart.
//
// Dev (vite dev server): talks to the local backend on 127.0.0.1:8000.
// Production (vite build / the packaged Electron app): talks to the shared
// cloud backend on Render — required for real Jam Sessions across devices.
// VITE_API_BASE is baked in at build time (see .env.production / .env.development).
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
export const WS_BASE = API_BASE.replace(/^http/, 'ws'); // https -> wss automatically
