---
name: engineering-standards
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Genpact's mandatory engineering baseline for ALL generated or modified code. This is the
  single source of truth for cross-cutting code quality: exception handling, structured logging,
  comments & docstrings, code modularity/architecture, and secure-by-default coding. It is
  PRIMARILY a shared reference baseline loaded by other code-producing skills (code-generator,
  code-hardener, pr-reviewer, security-advisor, config-manager, devops-assist,
  documentation-generator) and may also be invoked directly. Trigger phrases: "apply engineering
  standards", "make this production-grade",
  "enforce best practices", "review against coding standards", or any request to harden,
  standardize, or quality-check code. Whenever code is written, generated, or changed, these
  rules are NON-NEGOTIABLE unless the user explicitly overrides a specific rule.
---

# Genpact Engineering Standards (Mandatory Baseline)

This skill defines the **non-negotiable code quality baseline** for every piece of code Genpact
agents generate or modify. Other skills reference this document. When a conflict arises, the
**stricter** rule wins. These rules are **language-agnostic**; concrete examples are given in
Python, but the principle applies to JS/TS, Java, Go, C#, etc.

> **Golden rule:** Never deliver code that hardcodes secrets, swallows errors silently, logs
> sensitive data, lacks logging on failure paths, or ships as one giant file/function. If you
> cannot meet a rule, state the gap explicitly in your summary — do not hide it.

---

## How to apply this skill

1. If invoked **directly** on existing code → audit the code against every section below, then
   apply fixes and produce a short compliance report (✅/❌ per category).
2. If referenced by **another skill** during generation → generate code that already complies
   with every section. Do not produce a draft that violates these rules "to fix later".
3. Always end with the **Compliance Checklist** (bottom of this file) filled in.

---

## 1. Exception Handling

**Rules**
- **No bare/blanket catches.** Never `except:` or `except Exception:` without re-raising or
  handling meaningfully. Catch the **narrowest** exception type that applies.
- **Never swallow silently.** Every caught exception is either handled (with a fallback) or
  logged-and-re-raised. No empty `except` blocks. No `catch {}`.
- **Fail safe, not silent.** On unexpected errors, fail closed (deny/abort) for security-relevant
  paths; degrade gracefully only where it is safe and intended.
- **Preserve context.** Re-raise with the original cause (`raise NewError(...) from exc`). Never
  discard stack traces.
- **No control flow via exceptions** for expected conditions (use return values / validation).
- **Clean up resources** with `with`/`try-finally`/`using`/`defer` — never leak files, sockets,
  connections, locks.
- **User-facing errors are sanitized.** Return generic messages to clients; log the detail
  internally. Never leak stack traces, SQL, or internal paths to the caller.

**Example (Python)**
```python
# ❌ BAD
try:
    data = fetch(url)
except:
    pass

# ✅ GOOD
try:
    data = fetch(url)
except requests.Timeout as exc:
    logger.warning("fetch timed out", extra={"url": url})
    raise UpstreamUnavailable("Upstream service timed out") from exc
except requests.RequestException as exc:
    logger.error("fetch failed", extra={"url": url, "error": str(exc)})
    raise
```

---

## 2. Logging

**Rules**
- **Structured logging** (JSON or key=value), not bare `print`/`console.log`. Use the platform
  logger (e.g. Genpact `utils/logger`, `logging`, `winston`, `slf4j`).
- **Correct levels:** `DEBUG` (dev detail), `INFO` (lifecycle/business events), `WARNING`
  (recoverable anomalies), `ERROR` (failed operation), `CRITICAL` (system-threatening).
- **Log every failure path** — every `except`/`catch` that matters emits at least one log line.
- **Correlation/context** — include request ID, user/session ID (non-PII), and operation name
  so logs are traceable across services.
- **NEVER log secrets or PII** — no passwords, tokens, API keys, full PAN/SSN, raw auth headers,
  full request bodies with credentials. Redact (`****`) or omit.
- **No log injection** — never interpolate untrusted input directly into a log message without
  sanitizing newlines/control chars.
- **No noisy logging in hot loops**; aggregate or sample.

**Example (Python)**
```python
# ❌ BAD
print("user " + email + " token " + token)

# ✅ GOOD
logger.info("authentication succeeded",
            extra={"user_sub": user_sub, "app": app_name})  # no token, no raw email if PII-sensitive
```

---

## 3. Comments & Docstrings

**Rules**
- **Docstring every public** module, class, function, and exported API — purpose, params,
  returns, raised errors. Use the language standard (PEP 257, JSDoc, Javadoc, GoDoc).
- **Explain WHY, not WHAT.** Don't narrate obvious code; document intent, trade-offs,
  invariants, and non-obvious decisions.
- **Document edge cases & assumptions** (units, ranges, nullability, thread-safety).
- **Mark tech debt** with `# TODO(owner): ...` / `# FIXME:` including a reason — never silent.
- **No dead code / commented-out blocks** in delivered output. Delete it (git keeps history).
- **Keep comments truthful** — update or remove stale comments when code changes.

**Example (Python)**
```python
def issue_gateway_key(user_sub: str, app: str, ttl: int = 3600) -> str:
    """Issue a short-lived, revocable gateway key for a user+app.

    Keys are intentionally short-lived (default 1h) so a leaked key has a
    small blast radius; renewal goes through /bootstrap. See PROGRESS.md.

    Args:
        user_sub: Okta subject (stable user id).
        app:      Registered app name (must exist in apps table).
        ttl:      Lifetime in seconds (capped server-side).

    Returns:
        The opaque gateway key string (``gk_...``).

    Raises:
        AppNotRegistered: if ``app`` is unknown.
    """
```

---

## 4. Code Modularity & Architecture

**Rules**
- **Single Responsibility** — each module/class/function does one thing.
- **Size limits (guidance):** functions ≤ ~50 lines, files ≤ ~400 lines, params ≤ 5
  (use a struct/object beyond that). Exceeding → split.
- **Layering / separation of concerns** — keep transport (handlers/routes) separate from
  business logic (services) separate from I/O (clients/repositories). No business logic in
  controllers; no SQL in handlers.
- **DRY** — extract shared logic; no copy-paste blocks. But avoid premature abstraction.
- **Dependency direction** — depend on abstractions, inject dependencies (clients, config) so
  code is testable; no hidden global state.
- **Pure where possible** — isolate side effects (network, disk, clock, randomness) so the core
  is unit-testable.
- **Clear module boundaries** — explicit public API per module; keep internals private.
- **Consistent project structure** — group by feature/layer, predictable file naming.

**Smell → action**
| Smell | Action |
|-------|--------|
| 300-line function | Split into named helpers by step |
| God file / "utils.py" dumping ground | Split by responsibility |
| Logic duplicated in 3 places | Extract a shared function |
| Handler talks to DB directly | Introduce a service/repository layer |
| Hardcoded client inside function | Inject via constructor/param |

---

## 5. Secure-by-Default Coding

**Rules**
- **No hardcoded secrets** — ever. Read from env vars / SSM / Secrets Manager. (Pairs with the
  `config-manager` skill.) Provide `.env.example` with placeholders only.
- **Validate & sanitize all external input** — request bodies, query params, headers, file
  contents, env values. Reject by default (allowlist > denylist).
- **Parameterized queries only** — never string-concatenate SQL/NoSQL/shell/LDAP. No
  `shell=True` with user input.
- **Least privilege** — minimal IAM/scopes/file permissions; never wildcard `*` in delivered IAM
  unless explicitly required and noted.
- **Safe deserialization** — `json` over `pickle`/`yaml.load`; `yaml.safe_load`; never eval
  untrusted data.
- **Crypto** — use vetted libraries; bcrypt/argon2 for passwords, `secrets` for tokens; never
  MD5/SHA1 for security, never roll your own crypto.
- **Dependencies** — pin versions; avoid known-vulnerable packages; prefer maintained libs.
- **Secure transport** — TLS for all external calls; verify certs (no `verify=False`).
- **Output encoding** — escape output to prevent XSS/log injection.

> This is **prevention** (write it right). The `vulnerability-fixer` skill handles
> report-driven remediation of code that already shipped.

---

## Language-specific defaults (quick reference)

| Concern | Python | JS/TS | Java |
|---------|--------|-------|------|
| Logger | `logging` / `utils.logger` | `winston`/`pino` | `slf4j` |
| Format/lint | `black` + `ruff`/`flake8` | `prettier` + `eslint` | `spotless`/`checkstyle` |
| Types | type hints + `mypy` | strict `tsconfig` | (compiler) |
| Secrets | `os.environ`/SSM | `process.env`/SSM | env/Vault |
| Tests | `pytest` | `jest`/`vitest` | `junit` |

---

## MANDATORY Compliance Checklist (output this filled-in)

Before delivering ANY code, confirm and report:

- [ ] **Exceptions:** narrow catches, no silent swallow, context preserved, resources cleaned up, client errors sanitized
- [ ] **Logging:** structured, correct levels, every failure path logged, correlation context present, NO secrets/PII logged
- [ ] **Docs:** public APIs have docstrings; comments explain *why*; tech debt marked with TODO(owner); no dead code
- [ ] **Modularity:** SRP respected, size limits met, layers separated, no duplication, dependencies injected
- [ ] **Security:** no hardcoded secrets, input validated, parameterized queries, least privilege, safe deserialization, pinned deps, TLS verified

If any box is unchecked, **state why** in the delivery summary — do not silently ship a violation.

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
