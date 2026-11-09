---
name: pr-reviewer
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill to review a code change (git diff, pull request, staged changes, or a patch)
  against Genpact engineering standards BEFORE it is merged. It produces a structured review:
  blocking issues, warnings, and nits — covering correctness, security, exception handling,
  logging, tests, docs, modularity, and breaking changes. Trigger phrases: "review this PR",
  "review my changes", "review this diff", "code review before merge", "is this ready to merge",
  "check my git diff". Use for incremental changes/diffs (NOT a whole-codebase audit — use
  code-analyzer for that, which takes a .zip). Applies the bundled Genpact engineering standards and acts
  as a merge gate.
---

# Pull Request / Diff Reviewer

Act as a senior reviewer and **merge gate** for an incremental change. Focus only on **what
changed** (the diff) plus its immediate blast radius — not the whole repository.

> **MANDATORY:** Read and comply with the bundled engineering standards (`references/engineering-standards.md`). Review findings map
> to its five categories.

> **Scope:** This reviews diffs/PRs. For a full-codebase audit producing a formal report, use
> **code-analyzer**. For applying fixes from a security report, use **vulnerability-fixer**.

---

## Step 1: Obtain the change

Accept any of:
- `git diff` / `git diff --staged` output,
- a PR URL or branch comparison (`git diff main...feature`),
- a `.patch`/`.diff` file,
- a list of changed files.

If a repo is available, gather context:
```bash
git diff --stat main...HEAD          # files & size of change
git diff main...HEAD                 # the actual change
git log --oneline main...HEAD        # commits in the PR
```
Read the **full content** of changed files (not just hunks) when needed to judge correctness.

---

## Step 2: Build a change summary

State, in 2–4 lines: what the change does, why, and its risk level (low/med/high) based on
surface area (auth, payments, data migration, public API = higher risk).

---

## Step 3: Review across these dimensions

Go through each. For every finding, record: **file:line**, **severity**, **what**, **why it
matters**, **suggested fix** (with a code snippet when useful).

**A. Correctness & logic**
- Does it do what the PR claims? Off-by-one, null/empty handling, boundary conditions, race
  conditions, incorrect assumptions, wrong operator/branch.

**B. Security** (engineering-standards §5)
- New hardcoded secrets? Unvalidated input? String-built SQL/shell? `verify=False`? Unsafe
  deserialization? Over-broad IAM/permissions? Leaked error detail?

**C. Exception handling** (§1)
- New bare/silent catches? Unhandled error paths? Resources not cleaned up? Swallowed failures?

**D. Logging & observability** (§2)
- Failure paths logged? Correct levels? Any secret/PII now being logged? `print`/`console.log`
  left in?

**E. Tests**
- Are there tests for the new/changed behavior? Do they cover edge & negative cases? If tests
  are missing for non-trivial logic → **blocking**.

**F. Documentation** (§3)
- Public API changes documented? Docstrings updated? README/changelog updated if needed?
  Stale comments left behind?

**G. Modularity & design** (§4)
- New god-functions/files? Duplication introduced? Business logic leaking into handlers?
  Tight coupling / hidden global state? Reasonable abstractions?

**H. Breaking changes & compatibility**
- Public API/contract changes? DB schema/migration safety (backward compatible? reversible?)?
  Config keys added (are dev/uat/prod all updated — see config-manager)? Dependency bumps with
  breaking changes?

---

## Step 4: Classify findings

| Severity | Meaning | Merge impact |
|----------|---------|--------------|
| 🔴 **Blocking** | Bug, security flaw, missing tests on real logic, breaking change without handling, silent failure | Must fix before merge |
| 🟡 **Warning** | Quality/maintainability issue, weak error handling, missing docs | Should fix; merge only with rationale |
| 🔵 **Nit** | Style, naming, minor cleanup | Optional |
| 🟢 **Praise** | Call out genuinely good practices | — |

---

## Step 5: Produce the review

Output in this format:

```
## PR Review — <title/branch>   |   Risk: <low/med/high>   |   Verdict: <APPROVE / REQUEST CHANGES>

### Summary
<2–4 lines: what changed, why, risk>

### 🔴 Blocking (N)
- file.py:42 — <issue>. Why: <impact>. Fix:
  ```<lang>
  <suggested fix>
  ```

### 🟡 Warnings (N)
- ...

### 🔵 Nits (N)
- ...

### 🟢 Good
- ...

### Checklist
- [ ] Correctness  - [ ] Security  - [ ] Exceptions  - [ ] Logging
- [ ] Tests        - [ ] Docs      - [ ] Modularity  - [ ] No unmanaged breaking changes
```

**Verdict rule:** `REQUEST CHANGES` if any 🔴 exists; otherwise `APPROVE` (note 🟡 to address).

---

## Behavior rules
- Be specific and actionable — every finding has a file:line and a concrete fix.
- Review the **whole PR** (all commits), not just the latest commit.
- Don't rubber-stamp: if it's not mergeable, say so clearly with reasons.
- Don't bikeshed: keep nits separate from blocking issues so signal isn't lost.
- Comply with engineering-standards.

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
