// Single source of truth for backend URLs.
// Used by both App.jsx and MusicContext.jsx so they can never drift apart.
//
// The app talks to two backends on desktop:
//   API_BASE  — shared cloud backend (accounts, likes, playlists, tastes,
//               JAM rooms). This is what makes Jam Sessions work between
//               different people on different machines.
//   LOCAL_API — the app's bundled on-device backend. YouTube extraction is
//               bot-checked on cloud/datacenter IPs, so search + streaming
//               must come from the LOCAL bundled backend (127.0.0.1:8000).
//
// Native mobile builds (Capacitor iOS/Android) have NO on-device Python
// backend. Search + recommendations are served by the same shared cloud;
// audio/video plays through the official YouTube iframe embed and never
// touches a backend at all. See IS_NATIVE / MEDIA_API below.
//
// VITE_* are baked in at build time (see .env.production / .env.development).

import { Capacitor } from '@capacitor/core';

// Test-only escape hatch: CI/browser tests may set window.__KT_FORCE_NATIVE__
// before the bundle loads to exercise the mobile code paths on a desktop browser.
const FORCE_NATIVE = typeof window !== 'undefined' && window.__KT_FORCE_NATIVE__ === true;

export const IS_NATIVE = FORCE_NATIVE || (typeof window !== 'undefined' && Capacitor.isNativePlatform());

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
export const LOCAL_API = import.meta.env.VITE_LOCAL_API || 'http://127.0.0.1:8000';

// MEDIA_API serves search/recommendations/trending/etc. Native resolves to
// the shared cloud (verified reachable + fast), desktop stays on-device.
export const MEDIA_API = IS_NATIVE ? API_BASE : LOCAL_API;

export const WS_BASE = API_BASE.replace(/^http/, 'ws'); // https -> wss automatically (jam sync is shared)
