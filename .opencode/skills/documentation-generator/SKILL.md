---
name: documentation-generator
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill to generate developer documentation FROM a codebase — README, API reference
  (OpenAPI/Swagger for HTTP APIs), inline docstrings/JSDoc/Javadoc, architecture overview,
  setup/run guides, and operational runbooks. Trigger phrases: "write a README", "document this
  code", "generate API docs", "add docstrings", "create a runbook", "document the architecture",
  "write setup instructions". Use when documentation is missing, stale, or incomplete. Produces
  Markdown and/or OpenAPI specs. Applies the bundled Genpact engineering standards (§3 Comments &
  Docstrings).
---

# Documentation Generator

Generate accurate, maintainable developer documentation **derived from the actual code** — never
invented. If the code doesn't support a claim, don't document it.

> **MANDATORY:** Comply with the bundled engineering standards (`references/engineering-standards.md`) §3. Documentation must be
> truthful and kept in sync with code; flag stale docs you find.

> **Accuracy rule:** Read the real code/config. Do not fabricate endpoints, env vars, commands,
> or behavior. Where information is genuinely unavailable, add a clearly marked `TODO` rather
> than guessing.

---

## Step 0: Understand the intent (ask once, then proceed)

Before generating anything, confirm scope in **one batched question** — never a multi-turn
interrogation. If the user's request already answers these, infer silently and skip the question.

> "Quick check before I write the docs:
> 1. **Audience** — internal developers, external API consumers, an open-source community, or a client handover? (sets tone & depth)
> 2. **Most important artifact** — README, API reference, architecture overview, setup guide, or runbook? (I'll start there)
> 3. **Format** — Markdown in-repo, GitHub Wiki, or a published site (gh-pages)?"

Generate **progressively**: produce the highest-priority artifact first, confirm it's on the
right track, then continue. Never dump every doc type at once.

---

## Step 1: Understand the project

Detect and read:
- Entry points, public API surface, routes/handlers.
- Config & env vars (pair with `config-manager` output if present).
- Dependencies, build/run scripts, test commands.
- Existing docs (to update rather than duplicate; flag anything stale/contradictory).

---

## Step 2: Choose what to generate

Pick based on the request and project type:

| Artifact | When | Format |
|----------|------|--------|
| **README** | Always useful | Markdown |
| **API reference** | HTTP/RPC service | OpenAPI 3 (YAML) + rendered notes |
| **Docstrings/JSDoc** | Public functions/classes undocumented | in-code |
| **Architecture overview** | Non-trivial system | Markdown + diagram (mermaid) |
| **Setup / run guide** | Anyone must run it locally | Markdown |
| **Runbook** | Deployed/operated service | Markdown (ops-focused) |

---

## Step 3: README structure

Generate a README with these sections (omit those that don't apply):
1. **Title + one-line description** — what it is, who it's for.
2. **Features / capabilities** — concise bullets.
3. **Architecture** — short overview + mermaid diagram if non-trivial.
4. **Prerequisites** — language version, tools, accounts.
5. **Setup** — clone, install, **env config** (link to `.env.example`), secrets note (no real
   secrets in docs).
6. **Run** — local run, tests, lint — exact commands, copy-ready.
7. **Configuration** — table of env vars: name, purpose, default, required?, secret?
8. **API** — endpoints summary or link to OpenAPI.
9. **Deployment** — how it ships (link to CI/IaC).
10. **Troubleshooting** — common errors → fixes.
11. **Contributing / license** — as applicable.

---

## Step 4: API reference (for services)

- Generate an **OpenAPI 3** spec from the routes: paths, methods, params, request/response
  schemas, auth, status codes, error shapes.
- Derive schemas from actual models/handlers; mark uncertain types with `TODO`.
- Include realistic request/response **examples**.
- **Never** put real tokens/secrets in examples — use placeholders.

---

## Step 5: In-code docstrings

Per engineering-standards §3, add docstrings to public modules/classes/functions:
- Purpose, parameters, returns, raised errors; "why" for non-obvious logic.
- Use the language standard (PEP 257 / JSDoc / Javadoc / GoDoc).
- Don't restate the obvious; document intent, invariants, edge cases.

---

## Step 6: Architecture & runbook (when applicable)

**Architecture overview**: components, data flow, external dependencies, key decisions, a
mermaid diagram. Keep it current with code.

**Runbook** (operated services): how to deploy/rollback, health checks, key logs & metrics &
where to find them, common incidents → response, on-call escalation, config/secret locations
(pointers, not values).

---

## Step 7: Deliver

- Write docs to conventional locations (`README.md`, `docs/`, `openapi.yaml`, inline).
- Provide a short summary of what was created/updated and any `TODO`s where info was missing.
- List any **stale/incorrect existing docs** you found so they can be removed.

---

## Quality checklist (output filled-in)

- [ ] Everything documented is **verified against the code** (no fabrication)
- [ ] Commands are copy-ready and correct; env vars table accurate
- [ ] **No real secrets** in any doc or example (placeholders only)
- [ ] Public APIs have docstrings; API spec matches actual routes
- [ ] Diagrams (if any) reflect real architecture
- [ ] Stale/contradictory existing docs flagged
- [ ] Unknowns marked as TODO, not guessed
- [ ] Complies with engineering-standards §3

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
