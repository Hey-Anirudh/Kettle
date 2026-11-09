# Branching Patterns Reference

## GitHub Flow (Simple — Continuous Deployment)

**Best for:** SaaS products, teams deploying multiple times per day, small teams.

```
main ─────────────────────────────────────────────── (always deployable)
       │                                    ↑
       └── feature/GP-10-add-login ─────────┘ (squash merge)
```

**Rules:**
- `main` is always deployable
- Feature branches are short-lived (< 1 week)
- Deploy from `main` directly (or from a tag on main)
- No `develop` branch — merge directly to `main` via PR

**When a GitHub Flow repo has a hotfix:**
```bash
# Same as a feature — branch from main, fix, PR back to main immediately
git checkout main && git pull
git checkout -b fix/GP-77-null-session
# fix...
gh pr create --base main
```

---

## GitFlow (Scheduled Releases — Enterprise Standard)

**Best for:** Enterprise projects with fixed release cycles, QA sign-off gates, multiple parallel
versions in production.

```
main ────────────────────────────────────────── (production tags here)
  │                                    ↑
  │              release/2.3.0 ────────┤  (back-merge to develop too)
  │                  ↑                 │
develop ─────────────┤─────────────────┼──────── (integration branch)
  │                  │                 │
  ├── feature/GP-10 ─┘                 │
  ├── feature/GP-11 ─────────────────→ ┘
  │
  hotfix/GP-456 ────────────────────→ main (then back-merge to develop)
```

**Branch Roles:**
| Branch | Role | Who merges in | Merges to |
|---|---|---|---|
| `main` | Production code | `release/*`, `hotfix/*` | — |
| `develop` | Integration | `feature/*`, `release/*`, `hotfix/*` | — |
| `feature/*` | New features | Developer PRs | `develop` |
| `release/*` | Release prep | Bug fixes only | `main` + `develop` |
| `hotfix/*` | Urgent prod fixes | Developer PRs | `main` + `develop` |

**Critical rule:** Every merge to `main` must be immediately back-merged to `develop`.
Failure to do this creates a "vanishing fix" regression on the next release.

**Merge strategies:**
- `feature/*` → `develop`: **squash merge** (clean history)
- `release/*` → `main`: **merge commit** (preserve release boundary)
- `hotfix/*` → `main`: **merge commit** (preserve audit trail)
- Back-merges (main → develop): **merge commit** (no-ff)

---

## Trunk-Based Development (High Frequency — Feature Flags)

**Best for:** High-performing engineering teams, daily/hourly deployments, teams using feature flags.

```
main ───────────────────────────────────────── (CI/CD deploys on every commit)
  │          ↑          ↑
  └── feat/a ┘  fix/b ──┘  (branches live < 1 day, or commit directly to main)
```

**Rules:**
- Branches live less than 1 day (ideally hours)
- Feature flags control visibility of incomplete work
- No long-lived `develop` branch
- CI runs on every push — must be fast (< 5 min)
- Every commit must leave `main` deployable

**Not suitable for:**
- Teams without a fast CI pipeline
- Projects with a QA sign-off gate before release
- Projects where multiple versions are in production simultaneously

---

## Detecting the Current Model

Run this in any repo to detect the branching model in use:

```bash
git branch -a --sort=-committerdate | head -20
```

**Signals:**
- See `develop` branch → GitFlow
- Only `main` + short feature branches, very recent commits → GitHub Flow or Trunk-Based
- Many long-lived feature branches → GitHub Flow
- Feature branches merged same day they were opened → Trunk-Based

Also check:
```bash
git log --oneline --graph --all | head -40
```
- Many merge commits on `develop` → GitFlow
- Mostly squash merges directly to `main` → GitHub Flow
- Linear history, no merge commits → Trunk-Based with rebasing

---

## Branch Lifetime Expectations

| Branch Type | Max Lifetime | Action if Exceeded |
|---|---|---|
| `feature/*` | 1 sprint (2 weeks) | Break into smaller PRs |
| `fix/*` | 3 days | Escalate — what's blocking? |
| `hotfix/*` | 4 hours | Must ship same day |
| `release/*` | 1 week | QA phase only — no new features |
| `spike/*` | 1 sprint | Either merge learnings or delete |

---

## Stale Branch Policy

Branches older than 30 days with no commits are stale. Identify and clean them:

```bash
# List branches with their last commit date
git for-each-ref --sort=-committerdate refs/remotes \
  --format='%(committerdate:short) %(refname:short)' | head -30

# Delete a stale remote branch (confirm with the owner first)
git push origin --delete feature/GP-old-branch

# Delete merged local branches
git branch --merged main | grep -v "main\|develop\|master" | xargs git branch -d
```
