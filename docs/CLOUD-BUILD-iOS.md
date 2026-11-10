# Kettle on iOS — cloud build guide (Windows cannot compile iOS locally)

Gradle-built APK is already shipping for Android. iOS needs Xcode, which only runs on macOS.
This repo contains a complete, ready-to-build Xcode project at `ios/App` (Capacitor 8, SwiftPM).
You only need to sign it with an Apple Developer Program membership ($99/yr).

## Fastest path: Codemagic cloud build (recommended)

1. **Apple Developer Program**: enrol at developer.apple.com (individual is fine).
   In App Store Connect → My Apps → + → New App: name `Kettle`, bundle id `com.kettle.music` (use explicit, must match `ios/App/App.xcodeproj`), SKU `kettle-1`.
2. **App Store Connect API key**: Users and Access → Keys → +. Role `App Manager`.
   Download the `.p8`, note `Key ID` and `Issuer ID`. Keep the `.p8` safe — it is shown once.
3. **Codemagic** (codemagic.io): sign up (free tier: 500 build minutes/month). `Add application` → pick this GitHub repo.
   - Add an **App Store Connect API key** credential (upload the `.p8`, paste Key ID + Issuer ID), name it anything, e.g. `Kettle ASC key`.
   - The repo already ships `codemagic.yaml` with the `ios-testflight` workflow (mac_mini_m2). Codemagic will detect it automatically.
4. **Run the `ios-testflight` workflow.** First run will fail on signing identity the first time;
   fix by attaching the ASC key + selecting the team, then re-run. On success the build appears in
   TestFlight within minutes — install it on any iPhone with the TestFlight app.
5. When ready for the App Store: same workflow, then `Submit for review` from App Store Connect.

## Alternative: your own or a borrowed Mac

```
git clone https://github.com/Hey-Anirudh/Redew.git && cd Redew/Redew
npm ci && npx cap sync ios
cd ios/App && open App.xcodeproj
# Signing & Capabilities: select your team, bundle id com.kettle.music
# Product → Archive → Distribute → App Store Connect / TestFlight
```

Xcode 16+ recommended (Capacitor 8 needs it for Swift 6 toolchain compatibility).

## What the iOS app is

- The same React frontend as desktop/Android (this is the point — one codebase).
- Talks to the same shared cloud (`https://kettle-backend.onrender.com`) for accounts, KT codes,
  friends, playlists, Jam rooms, and Jam WebSocket sync. KT codes are portable across desktop,
  Android and iOS — add a friend on one, they're your friend on all.
- Plays audio/video through the official YouTube iframe player (the cloud backend is bot-checked
  by YouTube from datacenter IPs, so direct stream relay — the desktop's on-device approach — is
  impossible on iOS; the embed is the officially supported playback surface).
- Jam Sessions work across all three platforms with the same room codes.

## Known limits (be honest in the App Store description)

- Background/lock-screen audio: not supported (YouTube embed requires the app to be in the foreground).
- Live 24/7 radio streams: filtered out of search on all platforms (they can't be relayed).
- SmartScreen-equivalent warnings apply to Android APK sideloading; iOS via TestFlight avoids them.

## Icons/assets

Already branded: `AppIcon-512@2x.png` (1024px, dark) and a dark splash are in
`ios/App/App/Assets.xcassets/`. Launch screens use `LaunchScreen.storyboard`.
