---
name: code-hardener
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill to take working-but-rough code and bring it up to production grade WITHOUT
  changing its behavior. It systematically adds proper exception handling, structured logging,
  docstrings/comments, and refactors for modularity (splitting god-functions/files, separating
  layers, removing duplication). Trigger phrases: "make this production-grade", "harden this
  code", "add proper error handling and logging", "clean up this module", "add docstrings and
  refactor", "this works but it's messy", "improve code quality". Use when code already runs but
  lacks robustness, observability, documentation, or structure. NOT for fixing reported security
  vulnerabilities (use vulnerability-fixer) or for generating new projects (use code-generator).
  Applies the bundled Genpact engineering standards.
---

# Code Quality Hardener

Transform functional code into **robust, observable, documented, modular** code — while
**preserving behavior**. This is the "make it shippable" pass.

> **MANDATORY:** Read and comply with the bundled engineering standards (`references/engineering-standards.md`). This skill is the
> *application* of those standards to existing code.

> **Behavior-preservation rule:** Hardening must not change observable behavior. If a change
> alters behavior (e.g. you must fix a latent bug to handle an error correctly), call it out
> explicitly and get confirmation — do not silently change semantics.

---

## Step 1: Establish a safety net

Before touching anything:
1. Confirm there are **tests** or a way to verify behavior. If none exist, generate a minimal
   characterization test (or coordinate with `test-automation-generator`) so you can prove
   behavior is unchanged.
2. Note the current entry points and the public API (what callers depend on).
3. Work in **small, reviewable increments** — one concern at a time, re-verify after each.

---

## Step 2: Harden exception handling

Scan for and fix (per engineering-standards §1):
- Bare `except:` / `except Exception:` → narrow to specific types.
- Empty/silent catches → handle with fallback **or** log-and-re-raise (`raise ... from exc`).
- Missing resource cleanup → wrap in `with` / `try-finally` / `using` / `defer`.
- Leaky errors to callers → sanitize client-facing messages; log detail internally.
- Control flow via exceptions for expected cases → replace with validation/return values.

For each fix, preserve the original success path exactly.

---

## Step 3: Add structured logging

Per engineering-standards §2:
- Replace `print`/`console.log` with the project/platform logger.
- Add logs on **every failure path** and key lifecycle/business events.
- Use correct levels (DEBUG/INFO/WARNING/ERROR/CRITICAL).
- Add correlation context (request/session/op id) where a request scope exists.
- **Remove any logging of secrets/PII**; redact tokens, passwords, raw auth headers.
- Avoid log spam in hot loops.

---

## Step 4: Add comments & docstrings

Per engineering-standards §3:
- Add docstrings to every public module/class/function (purpose, params, returns, raises).
- Add **why** comments for non-obvious logic, invariants, and trade-offs.
- Convert magic numbers/strings into named constants with a comment.
- Mark known tech debt as `# TODO(owner): reason`.
- Delete dead/commented-out code (git keeps history).

---

## Step 5: Refactor for modularity

Per engineering-standards §4 — apply behavior-preserving refactors:

| Smell detected | Refactor |
|----------------|----------|
| Function > ~50 lines doing many steps | Extract named helper functions per step |
| File > ~400 lines / "god file" | Split by responsibility into cohesive modules |
| Duplicated logic in N places | Extract one shared function |
| Handler/controller contains business logic + I/O | Introduce service + client/repository layers |
| Hardcoded client/config inside a function | Inject as a parameter/constructor dependency |
| Deep nesting / arrow code | Guard clauses, early returns |
| 6+ positional params | Group into a typed object/struct |

Use only **safe, mechanical refactors** (extract method, rename, move, introduce parameter).
Re-verify after each.

---

## Step 6: Standardize formatting & types

- Apply the language formatter/linter (black+ruff, prettier+eslint, spotless, gofmt).
- Add/strengthen type hints/annotations where the language supports them.
- Make naming consistent with project conventions.

---

## Step 7: Verify & deliver

1. **Run the tests / verification** from Step 1 — behavior must be identical.
2. Produce a **before/after change report**:
   - what was hardened, grouped by category (exceptions / logging / docs / modularity / format),
   - any place where behavior *would* change (flagged, not applied without confirmation),
   - remaining tech-debt TODOs.
3. Deliver the updated files (and a diff summary).

---

## Quality checklist (output filled-in)

- [ ] Behavior preserved (verified by tests / characterization)
- [ ] No bare/silent exception handling remains; resources cleaned up
- [ ] Every failure path logs; structured logger used; **no secrets/PII logged**
- [ ] Public APIs documented; why-comments added; dead code removed; TODOs owned
- [ ] God-functions/files split; layers separated; duplication removed; deps injected
- [ ] Formatter/linter applied; types added where supported
- [ ] Before/after report delivered; behavior-changing items flagged separately
- [ ] Complies with engineering-standards

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
