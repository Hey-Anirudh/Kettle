---
name: config-manager
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill to generate and standardize environment-aware application configuration across
  dev/uat/prod (and poc/local) environments following 12-factor principles. It produces
  per-environment config files (.properties / .env / YAML / JSON), a committed .env.example with
  placeholders only, a typed config loader/validator, and a secrets strategy using AWS SSM
  Parameter Store / Secrets Manager (never hardcoded). Trigger phrases: "set up config for
  dev/uat/prod", "generate environment config", "manage secrets", "create .env template",
  "make config 12-factor", "add config validation", "separate config per environment". Always
  use when a project needs environment separation, secret externalization, or config validation.
  Applies the bundled Genpact engineering standards (secure-by-default).
---

# Environment Config Manager

Generate **environment-segregated, secret-safe, validated** configuration for any application.
This skill enforces the pattern already used in Genpact's stack (e.g. `props/*.dev|poc|uat|prod.properties`,
a central `config.py`, and `OKTA_CONFIGS`-style typed parsing) and makes it consistent and secure.

> **MANDATORY:** Read and comply with the bundled engineering standards (`references/engineering-standards.md`) (Section 5,
> Secure-by-Default). No secret value is ever written into a committed file.

---

## Core principles (12-factor config)

1. **Config lives in the environment**, not in code. Code reads config; it never embeds it.
2. **One artifact per environment** — `dev`, `uat`, `prod` (plus `poc`/`local` as needed). Same
   keys in every environment; only values differ.
3. **Secrets are externalized** — never in git. Real secrets live in SSM / Secrets Manager /
   vault. Repo contains only **placeholders** and **pointers** (parameter names/ARNs).
4. **Fail fast on startup** — validate all required config at boot; refuse to start if a required
   value is missing or malformed. Never discover a missing config at request time.
5. **Typed access** — parse/validate into typed values once; no scattered `os.environ.get` calls
   with stringly-typed defaults across the codebase.

---

## Step 0: Confirm the target (infer first, ask once if unclear)

Detect what you can from the repo (existing config files, cloud SDKs, CI) before asking. If these
three are already clear from the project or the request, state your assumption and proceed —
otherwise confirm all three in **one** batched question:

> "Before I set up config, quick confirmation:
> 1. **Environments** — which set? (e.g. dev/uat/prod, plus poc/local?)
> 2. **Secrets backend** — AWS SSM/Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault, or CI secrets?
> 3. **Config format** — `.properties`, `.env`, YAML, or JSON? (I'll match what the repo already uses)"

Default to the project's existing convention when one exists; only the genuinely unknown gaps
need a question.

---

## Step 1: Inventory configuration

Scan the project (or design doc) and list every configuration value. Classify each:

| Class | Examples | Where it lives |
|-------|----------|----------------|
| **Non-secret, env-varying** | region, table names, base URLs, log level, timeouts, model id | per-env config file (committed) |
| **Secret** | API keys, DB passwords, client secrets, signing keys | SSM/Secrets Manager (NOT committed); pointer only in config |
| **Constant** | app name, fixed enums | code or a shared base config |

Produce a **config matrix**: rows = keys, columns = dev / uat / prod (+ poc/local), plus
`required?`, `type`, `secret?`, `source`.

---

## Step 2: Choose the format (match the project)

- **Properties** (`.properties`) — matches existing Genpact infra (`coreinfra.<env>.properties`).
- **Dotenv** (`.env` + `.env.example`) — services/containers.
- **YAML/JSON** — richer/nested config (e.g. `config/<env>.yaml`).

Keep **identical keys** across all environment files. Differences are values only.

---

## Step 3: Generate per-environment files

Create one file per environment with the **same key set**:

```
config/
├── app.dev.properties
├── app.uat.properties
├── app.prod.properties
└── app.poc.properties      # if applicable
```

**Secrets are NEVER inlined.** Use a pointer convention, e.g.:

```properties
# app.prod.properties — committed (no secret values)
APP_ENV=prod
AWS_REGION=ap-south-1
LOG_LEVEL=INFO
SESSIONS_TABLE=auth-gateway-prod-sessions
# secret: resolved at runtime from SSM (NOT stored here)
OKTA_CLIENT_SECRET=ssm:/genpact/auth-gateway/prod/okta-client-secret
DB_PASSWORD=secretsmanager:genpact/auth-gateway/prod/db#password
```

Also generate a committed **`.env.example`** (placeholders only):
```dotenv
APP_ENV=local
AWS_REGION=ap-south-1
LOG_LEVEL=DEBUG
OKTA_CLIENT_ID=
OKTA_CLIENT_SECRET=        # set locally; never commit a real value
```
Ensure `.env` (real values) is in `.gitignore`; only `.env.example` is committed.

---

## Step 4: Generate a typed config loader + validator

Produce a single config module that:
- selects the environment from `APP_ENV` (default to the safest, e.g. `local`/`dev`),
- loads the matching file + process env (env overrides file),
- **resolves secret pointers** from SSM/Secrets Manager at startup,
- **validates required keys and types**, and **fails fast** with a clear message,
- exposes **typed, read-only** accessors (no scattered raw env reads).

**Example (Python)**
```python
"""Central, validated, environment-aware configuration loader.

Loads config/<APP_ENV>.properties, overlays process env, resolves secret
pointers (ssm:/... , secretsmanager:...) at startup, validates required
keys, and exposes typed accessors. Fails fast on missing/invalid config.
"""
import os, logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class ConfigError(RuntimeError):
    """Raised when required configuration is missing or invalid."""

@dataclass(frozen=True)
class Config:
    app_env: str
    aws_region: str
    log_level: str
    sessions_table: str
    okta_client_secret: str   # resolved from SSM at load time

REQUIRED = ("APP_ENV", "AWS_REGION", "SESSIONS_TABLE", "OKTA_CLIENT_SECRET")

def _resolve_secret(value: str) -> str:
    """Resolve ssm:/... or secretsmanager:... pointers; pass through plain values."""
    if value.startswith("ssm:"):
        return _ssm_get(value[len("ssm:"):])          # boto3 ssm get_parameter(WithDecryption=True)
    if value.startswith("secretsmanager:"):
        return _sm_get(value[len("secretsmanager:"):]) # boto3 secretsmanager get_secret_value
    return value

def load() -> Config:
    env = os.environ.get("APP_ENV", "local")
    raw = {**_read_file(f"config/app.{env}.properties"), **os.environ}  # env overrides file
    missing = [k for k in REQUIRED if not raw.get(k)]
    if missing:
        raise ConfigError(f"Missing required config: {', '.join(missing)} (env={env})")
    try:
        return Config(
            app_env=env,
            aws_region=raw["AWS_REGION"],
            log_level=raw.get("LOG_LEVEL", "INFO"),
            sessions_table=raw["SESSIONS_TABLE"],
            okta_client_secret=_resolve_secret(raw["OKTA_CLIENT_SECRET"]),
        )
    except (KeyError, ValueError) as exc:
        raise ConfigError(f"Invalid configuration (env={env}): {exc}") from exc

config = load()   # import-time, fail-fast
```

Adapt idioms per language (Node: `convict`/`zod` + `dotenv`; Java: Spring profiles
`application-<env>.yml` + `@ConfigurationProperties`; Go: `viper` + struct validation).

---

## Step 5: Secrets strategy (document it)

Deliver a short **secrets map** describing, per environment, where each secret lives:

| Secret | dev | uat | prod |
|--------|-----|-----|------|
| OKTA_CLIENT_SECRET | SSM `/genpact/app/dev/...` | SSM `/genpact/app/uat/...` | SSM `/genpact/app/prod/...` |

Rules:
- Least-privilege IAM: each environment's role reads **only its own** parameter path.
- Rotate-friendly: code resolves secrets at startup (and supports re-resolve on rotation).
- Never log resolved secret values (engineering-standards §2).

---

## Step 6: Deliver

Provide:
1. The per-environment config files (same keys, env-specific values, secret **pointers** only).
2. `.env.example` (placeholders) + a `.gitignore` entry for `.env`.
3. The typed config loader/validator module.
4. The secrets map table.
5. A short README section: how to add a key, how to set a secret in SSM, how to run per env.

---

## Quality checklist (output filled-in)

- [ ] Same key set across dev/uat/prod (+ poc/local); only values differ
- [ ] **No real secret value in any committed file** — pointers/placeholders only
- [ ] `.env` git-ignored; `.env.example` committed
- [ ] Required keys validated at startup; app **fails fast** on missing/invalid config
- [ ] Typed, centralized accessors (no scattered raw env reads)
- [ ] Secrets resolved from SSM/Secrets Manager with least-privilege IAM
- [ ] No secret value ever logged
- [ ] Complies with engineering-standards (secure-by-default)

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
