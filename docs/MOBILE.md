# Kettle mobile — how it works

One codebase, three ship targets. Everything talks to the same shared cloud
(`https://kettle-backend.onrender.com`). KT friend codes are global — an account created on
desktop works identically on Android and iOS, and friends/Jam rooms span mixed platforms.

## Targets

| Platform | Delivery | Engine | Entry points |
|---|---|---|---|
| Windows (desktop) | Electron installer | On-device Python backend on `127.0.0.1:8000` (YouTube extraction is blocked from cloud IPs) | `main.cjs` + `src/` |
| Android | Sideloaded APK (debug-signed) / signed AAB for Play Store | YouTube iframe embed; data/auth all cloud | `android/` (Capacitor 8) |
| iOS | Xcode project for cloud build (see `docs/CLOUD-BUILD-iOS.md`) | Same as Android | `ios/` (Capacitor 8, SwiftPM) |

## Layout

- `src/config.js` — backend URLs + `IS_NATIVE` detection (`window.__KT_FORCE_NATIVE__` override for tests).
- `src/context/MusicContext.jsx` — one `playTrack()` for all platforms. Desktop plays via `<audio>`
  (local extraction); native plays via the official YouTube iframe injected by `ensureYouTubePlayer()`.
- `src/App.css` — desktop shell (grid: sidebar + main + right panel) vs native shell
  (`@media (max-width: 768px)`: bottom thumb nav, friends as full-screen overlay, right panel hidden).
- `android/`, `ios/` — native projects, regenerated from `dist/` via `npx cap sync`.
- `redew_mobile/` — legacy Flutter prototype, not built or shipped; ignore.

## Builds

```
npm ci
npx vite build                 # dist/
npx cap sync                   # copies dist into android/ios
cd android && ./gradlew assembleDebug   # android/app/build/outputs/apk/debug/app-debug.apk
cd ios/App && open App.xcodeproj        # macOS only
```

## What's deliberately different on phones vs desktop

- **Media engine**: local backend.exe cannot run on phones; YouTube's embed player is the only
  officially supported in-app playback surface. Jam sync (`SYNC_PLAY`/`SYNC_PAUSE`/`SYNC_SEEK`)
  carries track metadata over the shared cloud WebSocket and is platform-agnostic — a desktop host
  and an iPhone guest stay in the same room, same track, same position.
- **Search/recommendations**: served by the cloud (the desktop uses the on-device extractor;
  the cloud extraction path works fine from residential/mobile-ish IPs and is perfectly healthy
  for search).
- **Live 24/7 radios**: not included anywhere (they 404 on extraction); filtered in `search`
  and `get_related_videos` (`live_status == 'is_live'`).

## Release checklist (current)

v1.2.3 carries: Android APK sideload (`Kettle-1.2.3-Android.apk`, com.kettle.music v3), iOS Xcode
project ready for Codemagic/TestFlight, desktop installer (unchanged). The GitHub release for
v1.2.3 hosts the installer + APK.

Desktop-only note for contributors: `node_modules` is huge; never commit `android/app/build`,
`.gradle`, or `local.properties` (gitignored).
