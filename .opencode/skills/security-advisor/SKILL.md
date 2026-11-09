---
name: security-advisor
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill for SHIFT-LEFT secure coding guidance WHILE writing or designing code — to
  prevent vulnerabilities before they exist, rather than fixing them after. It provides
  OWASP Top 10 / CWE-aware secure patterns, threat-modeling prompts, and secure-by-default code
  for the feature being built (auth, input handling, data access, file upload, crypto, secrets,
  API design, etc.). Trigger phrases: "how do I build this securely", "secure way to implement
  <X>", "is this approach safe", "secure coding for <feature>", "threat model this", "avoid
  vulnerabilities in <X>". Use during design/build. NOT for remediating a security report on
  existing code (use vulnerability-fixer) and NOT for auditing a finished codebase (use
  code-analyzer). Applies the bundled Genpact engineering standards (§5).
---

# Secure Coding Advisor (Shift-Left)

Help developers build features **secure-by-default from the first line**. This is **prevention**;
it complements `vulnerability-fixer` (remediation) and `code-analyzer` (audit).

> **MANDATORY:** Read and comply with the bundled engineering standards (`references/engineering-standards.md`), especially §5
> (Secure-by-Default). This skill goes deeper into threat-specific patterns.

---

## Step 1: Understand the feature & its trust boundaries

Ask/identify briefly:
- What is being built? (endpoint, data access, file handling, auth, integration…)
- What **untrusted input** crosses a boundary? (user, network, file, third-party API)
- What **sensitive assets** are involved? (PII, credentials, money, tokens, internal systems)
- Who are the actors and what could they abuse?

Produce a 3–5 line **mini threat model**: inputs → trust boundary → assets → top risks.

---

## Step 2: Map to OWASP/CWE risk categories

Identify which of these the feature touches, and apply the matching secure pattern below:

| Risk (OWASP/CWE) | Triggered when the feature… |
|------------------|------------------------------|
| Injection (SQLi/cmd/LDAP) | builds queries/commands from input |
| Broken Access Control | checks "who can do what" |
| Identity/Auth failures | logs in, issues tokens/sessions |
| Cryptographic failures | stores passwords, encrypts, signs |
| SSRF | fetches a URL the user influences |
| Insecure Deserialization | parses serialized/untrusted data |
| Sensitive Data Exposure | handles PII/secrets, logs, errors |
| Security Misconfiguration | sets CORS, headers, defaults, perms |
| Vulnerable Dependencies | adds libraries |
| Insufficient Logging/Monitoring | security-relevant events |

---

## Step 3: Apply secure-by-default patterns

Provide concrete, copy-ready guidance for the relevant categories. Key patterns:

**Input handling**
- Validate with an **allowlist** (type, length, range, format). Reject by default.
- Canonicalize before validating (paths, URLs, unicode). Prevent path traversal (`../`).

**Injection**
- Parameterized queries / prepared statements only. ORM with bound params.
- No shell with user input; pass argument arrays, `shell=False`. Avoid `eval`/`exec`.

**AuthN / AuthZ**
- Verify **every** request server-side; never trust client-side checks or hidden fields.
- Enforce object-level authorization (does *this* user own *this* resource?).
- Short-lived, revocable tokens; rotate; validate `iss`/`aud`/`exp`/signature fully.

**Crypto & secrets**
- bcrypt/argon2 for passwords; `secrets`/CSPRNG for tokens; AES-GCM via vetted libs.
- No homegrown crypto; no MD5/SHA1 for security. Secrets from SSM/Secrets Manager (see
  `config-manager`), never in code or logs.

**SSRF / outbound**
- Allowlist destination hosts; block internal/metadata IPs (169.254.169.254, RFC1918);
  disable redirects to untrusted hosts; verify TLS.

**Deserialization & file upload**
- `json` over `pickle`; `yaml.safe_load`. Validate file type/size/content; store outside
  webroot; randomized names; never execute uploads.

**Web/API config**
- Strict CORS (explicit origins), security headers (HSTS, X-Content-Type-Options, CSP),
  least-privilege IAM, disable verbose errors in prod.

**Logging (security events)**
- Log authn/authz decisions, key issuance/revocation, admin actions — **without** secrets/PII.

---

## Step 4: Deliver secure guidance/code

Provide:
1. The **mini threat model** (Step 1).
2. The **secure implementation** (code snippet or pattern) for the feature, secure-by-default.
3. **Anti-patterns to avoid** for this feature, with the safe alternative (❌ → ✅).
4. A short **secure checklist** specific to this feature.
5. Any dependencies needed and why (pinned, maintained).

**Example (❌ → ✅, SSRF-safe fetch)**
```python
# ❌ BAD — fetches any URL the user supplies
r = requests.get(user_url)

# ✅ GOOD — allowlist host, block internal ranges, no redirects, TLS verified
host = urlparse(user_url).hostname
if host not in ALLOWED_HOSTS or _is_internal_ip(host):
    raise PermissionError("Destination not allowed")
r = requests.get(user_url, allow_redirects=False, timeout=5)  # verify=True by default
```

---

## Behavior rules
- Prefer **prevention** over patching; recommend the secure design, not just a fix.
- Be specific to the feature and language; give working snippets, not vague advice.
- Always show the anti-pattern alongside the safe pattern so the lesson sticks.
- If the requested approach is fundamentally unsafe, say so and propose a safe alternative.
- Comply with engineering-standards §5.

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
