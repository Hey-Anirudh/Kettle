---
name: debug-assist
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  A reusable, stack-agnostic debugging methodology for finding the EXACT root cause of a bug and
  applying the smallest correct fix at the right layer (frontend / backend / data / build/tooling /
  desktop or mobile runtime). Works for any language or platform; Electron/desktop is just one
  example. Usable directly by any agent. Trigger phrases: "debug this", "app is blank/crashing",
  "find the root cause", "why is this failing", "console error", "stack trace", "it works locally
  but not in <env>", "fix this bug properly", "pinpoint the error". Enforces evidence-first
  diagnosis (reproduce → isolate → confirm root cause → minimal fix → re-validate), layer-aware
  triage, and cost-efficient model use (cheap models for log/trace reading, escalate only for
  multi-file reasoning). Always produces a validated change — never a guess. Complements
  engineering-standards (fix quality) and pr-reviewer (merge gate).
---

# Systematic Debugging — Find the Exact Cause, Fix It Once

This skill codifies how to debug like a senior engineer: **evidence before edits**. You never guess,
never shotgun-patch, and never declare "fixed" without re-validating against the original symptom.

The golden rule:

> **Reproduce → Isolate → Confirm root cause → Minimal fix → Re-validate → Prevent recurrence.**

If you cannot name the exact line and reason a bug occurs, you have not finished step 3 — do not edit.

---

## 0. Cost-Efficient Model Use (read first)

Debugging is mostly *reading* (logs, stack traces, diffs, grep output) and a little *reasoning*.

| Phase | Activity | Model tier |
|------|----------|-----------|
| Reproduce / collect | Run app, read console/logs, grep, git diff/blame | **Fast/cheap** |
| Isolate | Narrow to a file/function, binary-search the change set | **Fast/cheap** |
| Confirm root cause | Trace data flow across 1 file | **Fast/cheap** |
| Confirm root cause | Reason across many files / async / state / types | **Balanced** |
| Design fix | Architecture-level or multi-layer fix decision | **Balanced → Powerful** only if needed |

Default to the cheapest model. Escalate **only** when a hypothesis needs cross-file/async/type
reasoning, and say so: *"Escalating to a stronger model — this root cause spans several files."*
Never start a debug session on a powerful model "just in case".

---

## 0.5 Understand the bug first (gather once, don't interrogate)

Before reproducing, make sure you have the three things you need. If the conversation already
supplies them (a pasted stack trace usually does), infer silently and proceed. If any are missing,
ask for all of them in **one** batched message — never one question at a time:

> "To debug this efficiently, three quick things:
> 1. **Symptom** — what exactly goes wrong? (error text, blank screen, wrong value, crash)
> 2. **Reproduction** — what steps trigger it, and does it happen every time or intermittently?
> 3. **Environment** — where? (language/runtime, OS, dev vs production build, browser/desktop/server)"

Do not start guessing fixes before you have a symptom you can observe. If the user already pasted
an error or screenshot, that is your symptom — go straight to Reproduce.

---

## 1. Reproduce — Make the Bug Happen on Demand

You cannot fix what you cannot observe.

1. **Get the exact symptom.** Blank screen? Stack trace? Wrong value? Intermittent?
2. **Run the real target.** Reproduce on the build the user actually runs (the production-like
   build), not a partial/dev mode that can hide integration, packaging, or environment issues.
   - Use whatever run command the project defines (e.g. `npm run dev` / `pnpm dev` / `make run`).
   - For UI bugs, open the running app and inspect the browser/devtools console directly.
3. **Capture first-hand evidence:**
   - Screenshot the failing screen (blank vs. rendered — file size is a quick signal: ~7KB blank vs 100KB+ rendered).
   - Read the console/logs first-hand — every red line. A user's screenshot of the error is gold.
   - `grep -iE "error|uncaught|is not defined|failed" <logfile>`, filtering out known framework noise.
4. **Record the precise error string and location** — e.g. `ReferenceError: BarChart2 is not defined at workspace-analytics-card.tsx:72`. That single line usually IS the lead.

Do not proceed until you can trigger the symptom reliably.

---

## 2. Isolate — Shrink the Search Space

Turn "the app is broken" into "this line in this file".

- **Read the stack trace top-down.** The first app-frame (not node_modules/framework) is your entry point.
- **Trust the component name.** "An error occurred in the `<X>` component" → open X, read the render body.
- **Binary-search recent changes** when the trace is unclear:
  - `git log --oneline -15`, `git diff <lastgood>..HEAD --stat`.
  - `git blame <file> -L <start>,<end>` on the offending line to find the introducing commit.
  - Was it introduced by a recent change, or pre-existing and newly reached? (Changes who you fix.)
- **Differentiate "my change broke it" vs "pre-existing bug exposed".** Reverting your own change is
  only correct if your change is the cause. A blank screen from a missing import in *someone else's*
  commit is fixed by adding the import — not by reverting your unrelated work.

---

## 3. Confirm Root Cause — Prove It, Don't Assume It

State the cause as a falsifiable sentence:

> "`BarChart2` is referenced in JSX at line 72 but is not in any import statement, so at render
> the identifier is undefined and React throws, unmounting the whole tree (no error boundary)."

Then **verify the proof**:
- For "not defined" → `grep` the imports; confirm the symbol is genuinely absent.
- For wrong value → log/inspect the value at the boundary where it diverges from expected.
- For type errors → run `pnpm typecheck` and read the exact `TS####` and the types involved.
- For "works in web, not desktop" → suspect preload/IPC, CSP, `file://` paths, or `window.__*` globals
  that only exist in Electron.

**Scan for the whole class of the bug, not just one instance.** If one file forgot an import, grep
every sibling for the same symbol/pattern and verify each imports it. Fix the class, not the symptom.

---

## 4. Layer-Aware Triage — Fix at the Right Place

Decide which layer owns the fix before editing:

| Symptom signal | Likely layer | Typical fix locus |
|---|---|---|
| Undefined identifier/`ReferenceError`, UI component crash, event-handler/render loop, null in view | **Frontend / UI** | the component/view, its imports, props, or state |
| Type mismatch, missing field on a contract/interface, schema/DTO drift | **Types / contracts** | the type/interface definition + the call site |
| 4xx/5xx, bad payload, auth/token exchange, timeout, wrong response mapping | **Backend / service** | the API route/handler, service layer, auth flow |
| Wrong/missing rows, constraint violation, slow query, migration mismatch | **Data / persistence** | the query, ORM model, migration, or DB constraint |
| Native/runtime-only failure: IPC/preload missing, CSP block, deep-link, file path, platform global | **Desktop/mobile runtime** (e.g. Electron, React Native) | the main/native process, preload/bridge, IPC handlers |
| Compiler/bundler error, missing dependency, env var, failing build script | **Build / tooling** | compiler config, manifest (`package.json`/`pom.xml`/…), bundler config, CI |

Choose the **smallest diff that fixes the true cause** at that layer. Prefer adding the missing
import over refactoring; prefer fixing the type at its definition over casting at the call site.
Never silence a symptom (e.g. optional-chaining away a crash) if it hides a real defect.

---

## 5. Minimal Fix + Re-Validate — Close the Loop

1. **Apply the smallest correct change.** Match the file's existing conventions (e.g. if the file
   uses plain string classNames, don't introduce `cn`; if it uses an import block, extend it).
2. **Re-validate against the ORIGINAL symptom**, not a proxy:
   - `pnpm typecheck` for type fixes (and confirm you didn't add new errors; note pre-existing ones).
   - Restart the app, reload the failing screen, and re-capture the screenshot/console.
   - Assert the failing thing now works: render present (button count > 0), error string gone from log,
     correct value shown.
3. **Confirm no regressions** in adjacent surfaces you touched (the header still renders, navigation works).
4. Only now say "fixed" — and state the evidence (before/after counts, error gone).

If validation still shows the symptom, you mis-diagnosed: return to step 2. Do not stack more guesses.

---

## 6. Prevent Recurrence

Leave the codebase safer than you found it:
- If a missing-import class bug, confirm the whole class is clean (grep all siblings).
- Note whether an **error boundary** would have downgraded a full blank-screen to a contained card —
  recommend it if a single component crash took down the whole app.
- Capture the root cause + fix + validation in the commit body (cause → fix → how validated).
- If the bug was reachable only in the desktop build, note the web-build blind spot for future testing.

---

## Diagnose → Confirm → Fix Protocol (authority)

This skill operates in **diagnose → confirm → fix** mode:

1. Present the **root cause** (exact file:line + falsifiable explanation), the **layer**, and the
   **proposed minimal fix** — concisely.
2. Wait for the user's go-ahead on non-trivial or multi-file/architectural fixes.
3. For obvious one-line, zero-risk fixes (e.g. a provably missing import that blocks the whole app),
   you may apply immediately, then report — but always re-validate.
4. Always end with **evidence**: what you ran, before/after, and confirmation the symptom is gone.

## Anti-Patterns (never do these)

- ❌ Editing before reproducing or before naming the exact cause.
- ❌ Reverting unrelated work to "see if it helps".
- ❌ Declaring "fixed" from a successful *build* alone — a build passing ≠ the bug gone.
- ❌ Testing only the web build for a desktop app and missing Electron-only failures.
- ❌ Patching one instance when the same bug class exists in sibling files.
- ❌ Starting on the most expensive model out of caution.

---

## About This Skill

- **Skill version:** 1.0.0
- **Author:** Virender Kumar <virender.kumar3@genpact.com>
- **Maintained by:** Genpact Orbit Team

### Disclaimer
This skill uses AI to generate content and/or code. All outputs are **drafts** and must be
reviewed and validated by a qualified human before production use or external delivery. Do not
provide client-confidential, personal, or otherwise regulated data unless your engagement's
data-handling and privacy policy explicitly permits it. Genpact accepts no liability for
unreviewed AI-generated output.

### Support, Issues & Upgrades
- **Report a problem or unexpected output** — contact Virender Kumar
  <virender.kumar3@genpact.com> or raise an issue in the Orbit skills repository. Include the skill
  name and version shown above, plus what you expected vs. what happened.
- **Request an enhancement or new capability** — same contact; describe the use case and the
  outcome you need.
- **Check for upgrades** — newer versions are published to the Orbit skills repository / dist
  package. Replace your local copy of the skill folder to upgrade.
