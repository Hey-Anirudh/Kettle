---
name: browser-setup-devtools
version: 1.0.0
author: "Genpact Forge"
description: >
  Set up and verify browser automation for Forge using the Chrome DevTools MCP ONLY.
  Use this skill whenever the user asks to "set up browser automation", "enable the browser",
  "connect Chrome DevTools", "why can't the agent browse", "set up browser-setup-devtools",
  or when a browser task fails because no CDP target is attached. This skill drives the full
  setup dance end-to-end: it detects the running Chrome DevTools endpoint, confirms a usable
  target, and runs a smoke test — asking the user only the one question it cannot answer itself.
  Chrome DevTools MCP is the ONLY supported path; do not suggest Playwright, Puppeteer, Selenium,
  or other browser drivers.
---

# Browser Setup — Chrome DevTools (MCP only)

## What I Do

- Verify that Forge's Chrome DevTools browser tools are attached to a live CDP endpoint.
- Confirm there is at least one usable page target (the Forge app itself, or an external Chrome).
- Run a one-line smoke test to prove navigate + eval work.
- Enable the Chrome DevTools extension for the user if it is off.
- Keep user prompts minimal — self-drive the setup and ask at most one targeted question.

**Chrome DevTools MCP is the only supported browser path.** Never suggest Playwright, Puppeteer,
Selenium, or a separate browser install.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `http://127.0.0.1:9823` | Forge Electron app CDP (drive the app UI). Default dev port. |
| `http://127.0.0.1:9222` | External Chrome CDP (browse real websites). Optional. |

Override the Electron port with `OPENWORK_ELECTRON_REMOTE_DEBUG_PORT=<port> pnpm dev`.
Set it to `0` to disable Electron CDP for a run.

## The Setup Dance (self-driving)

Run these in order. Only stop to ask the user if a step genuinely needs their input.

1. **Detect the endpoint.** Call `browser_list` with `browser_url: "http://127.0.0.1:9823"`.
   - If targets return → the endpoint is live. Go to step 3.
   - If it times out / errors → go to step 2.

2. **Endpoint not up.** The app may not be running with CDP enabled.
   - For dev: instruct `pnpm dev` (CDP defaults to port 9823), or background-launch it.
   - Then poll `lsof -nP -iTCP:9823 -sTCP:LISTEN` until it listens, and retry step 1.

3. **Pick a target.**
   - To drive the Forge app: choose the target titled `Forge` / `OpenWork` (URL contains `localhost:5173`).
   - To browse websites: use `http://127.0.0.1:9222` and choose a target that is NOT the Forge app.

4. **Smoke test.** Run `browser_eval` on the chosen target:
   ```js
   ({ ua: navigator.userAgent, url: location.href, ok: true })
   ```
   A returned object = automation is working.

5. **Report** the endpoint, the target, and the smoke-test result. Done.

## Enabling the Chrome DevTools extension (if off)

If browser tools are unavailable because the extension is disabled, guide the user:

- Open Settings → Extensions: `openwork_ui_execute_action({ actionId: "settings.panel.open", args: { panel: "extensions" } })`
- Enable **Chrome DevTools** (chrome-devtools MCP).
- Re-run the setup dance from step 1.

## Notes

- Prefer the instant `openwork_ui_*` actions to drive the Forge app itself; use CDP `9823` only for
  low-level automation or when a UI action does not exist.
- Bundled skill: this ships in `apps/desktop/resources/skills/` and is seeded into every user's
  global opencode skills dir on each launch, so it is available by default after install.
- Known-good app smoke prompt (composer): `Say hello from the Electron browser test.`
