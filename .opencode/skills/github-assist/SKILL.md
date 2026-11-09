---
name: github-assist
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  GitHub expert for the full senior/enterprise git lifecycle. Use for: SSH setup and HTTPS
  fallback (port 22 blocked / corporate proxy), gh CLI auth, branching strategy (GitFlow /
  GitHub Flow / trunk-based), creating feature/fix/hotfix/release branches, commit messages,
  raising and fixing issues, raising/writing/merging PRs, resolving conflicts, cherry-picking,
  rebasing, git bisect, GitHub Wiki, and security scanning (Fortify, CodeQL, GitHub Advanced
  Security, Dependabot, secret scanning). Trigger phrases: "set up GitHub SSH", "port 22 blocked",
  "create a hotfix", "raise a PR", "resolve this conflict", "cherry-pick this commit", "write a
  commit message", "branching strategy", "squash or merge", "Fortify scan", "CodeQL", "Dependabot
  alert", "git bisect", "signed commit". Also the versioning guide for other skills: code-generator,
  documentation-generator, devops-assist, and pr-reviewer (code/doc/data versioning via git).
---

# GitHub Expert Skill

> **Principle:** Understand first. Never run a destructive git command (force-push, reset --hard,
> branch -D, rebase on a shared branch) without confirming with the user. Show what you are about
> to do before doing it. Work one step at a time.

---

## Step 0: Understand the Intent (Always Run First)

Before taking any action, ask **one batched question** to understand the user's situation. Cover
everything needed in a single message — never a multi-turn interrogation.

### When to ask vs. when to infer

**Infer silently** if the user's message clearly states the goal (e.g., "set up SSH for GitHub",
"create a hotfix branch for ticket GP-42", "cherry-pick abc1234 into release/2.1"). Just confirm
briefly and proceed.

**Ask one batched intake question** when the intent is broad (e.g., "help me with GitHub" or
"set up our branching strategy"). Ask at most 3 things at once:

> "Happy to help! To give you the right setup/guidance, a few quick questions:
> 1. What are you trying to do? (e.g., first-time SSH setup, create a branch, raise a PR, resolve a conflict, run a security scan)
> 2. Is this a corporate / Genpact machine? (affects proxy/SSL/port settings)
> 3. Which OS are you on — Mac, Windows, or Linux?"

Once you have the answers, proceed directly. Do not ask follow-up questions unless genuinely blocked.

---

## Module 1: Environment Setup

### 1.1 SSH Configuration (preferred method)

SSH is the recommended transport. Walk the user through this setup:

```bash
# Step 1: Check for an existing SSH key
ls -la ~/.ssh/id_ed25519 ~/.ssh/id_rsa 2>/dev/null

# Step 2: Generate a new Ed25519 key if none exists
ssh-keygen -t ed25519 -C "your.email@genpact.com" -f ~/.ssh/id_ed25519
# When prompted for passphrase: choose a strong one (or press Enter for none on a locked device)

# Step 3: Start ssh-agent and add the key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Step 4: Copy the public key to clipboard
# macOS:
cat ~/.ssh/id_ed25519.pub | pbcopy
# Linux:
cat ~/.ssh/id_ed25519.pub | xclip -selection clipboard
# Windows (Git Bash):
cat ~/.ssh/id_ed25519.pub | clip

# Step 5: Add the key to GitHub
# GitHub → Settings → SSH and GPG keys → New SSH key → paste → Save

# Step 6: Test the connection
ssh -T git@github.com
# Expected: "Hi <username>! You've successfully authenticated..."
```

**Persist the agent across sessions (macOS):**

Add to `~/.ssh/config`:
```
Host github.com
  AddKeysToAgent yes
  UseKeychain yes          # macOS only
  IdentityFile ~/.ssh/id_ed25519
```

---

### 1.2 HTTPS Fallback (Port 22 Blocked — Corporate Networks)

On Genpact or other corporate networks, port 22 is often blocked by the firewall/Zscaler.
GitHub supports SSH over HTTPS port (443) as a fallback.

**Test if port 22 is blocked:**
```bash
ssh -T -p 22 git@github.com
# If this hangs or times out → port 22 is blocked
```

**Fix: Route SSH through port 443 via `~/.ssh/config`:**
```
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519
  AddKeysToAgent yes
```

**Test the 443 fallback:**
```bash
ssh -T git@github.com
# Should return: "Hi <username>! You've successfully authenticated..."
```

**If HTTPS proxy is also required (Zscaler / corporate proxy):**
```
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519
  ProxyCommand nc -X connect -x <proxy-host>:<proxy-port> %h %p
```

Replace `<proxy-host>` and `<proxy-port>` with your corporate proxy values (ask IT if unknown).

---

### 1.3 Switch an Existing Repo from HTTPS to SSH

```bash
# Check current remote URL
git remote -v

# Switch to SSH
git remote set-url origin git@github.com:<org>/<repo>.git

# Verify
git remote -v
```

---

### 1.4 gh CLI Setup

`gh` is the official GitHub CLI. Install it and authenticate:

```bash
# macOS
brew install gh

# Windows (winget)
winget install --id GitHub.cli

# Linux (Debian/Ubuntu)
sudo apt install gh

# Authenticate
gh auth login
# Choose: GitHub.com → SSH → select your key → authenticate via browser
```

**Verify:**
```bash
gh auth status
gh repo view   # shows current repo info
```

**Use `gh` throughout this skill** for all GitHub API operations (issues, PRs, releases, wikis)
when a repo is configured — it is faster than manual browser navigation.

---

### 1.5 Corporate SSL / Genpact Zscaler

If `git clone` or `gh` commands fail with SSL errors:
```bash
# Tell git to use the Genpact CA bundle
git config --global http.sslCAInfo ~/.orbit/certs/full-ca-bundle.pem

# Or temporarily disable (NOT recommended for production use — diagnostic only):
# git config --global http.sslVerify false
```

---

## Module 2: Repository Intelligence

Before giving any branching or workflow advice, **sense the repository's existing conventions**.

```bash
# Understand the existing branch structure
git branch -a --sort=-committerdate | head -30

# Understand commit conventions in use
git log --oneline -20

# Check for branch protection rules (if gh is configured)
gh api repos/{owner}/{repo}/branches --jq '.[].name'
gh api repos/{owner}/{repo}/branches/main/protection 2>/dev/null

# Check for existing PR/issue templates
ls .github/PULL_REQUEST_TEMPLATE* .github/ISSUE_TEMPLATE* 2>/dev/null

# Check for existing CI/CD workflows
ls .github/workflows/ 2>/dev/null

# Check for .gitignore and .gitattributes
cat .gitignore 2>/dev/null | head -20
```

**Adapt your guidance to what you find.** If the repo uses GitFlow, recommend GitFlow conventions.
If it uses trunk-based development, recommend that. Never impose a new branching model without
flagging it and asking for confirmation.

See `references/branching-patterns.md` for full guidance on each branching model.

---

## Module 3: Branching Strategy

### 3.1 Detect and Recommend

Examine the existing branches and commit history. Match to one of three models:

| Model | Signal | When to use |
|---|---|---|
| **GitHub Flow** | Only `main` + short-lived feature branches | Small teams, continuous deployment, SaaS |
| **GitFlow** | `main`, `develop`, `release/*`, `hotfix/*` | Scheduled releases, enterprise software |
| **Trunk-Based** | Only `main`, very short-lived branches (< 1 day) | High-frequency delivery, feature flags |

Present your detection result:
> "This repo appears to use **GitFlow** — I can see `develop`, `release/2.1`, and `hotfix/*` branches.
> I'll follow that convention. Shall I proceed?"

---

### 3.2 Branch Naming Conventions

Always follow what the repo already uses. If starting fresh, use:

```
feature/<ticket-id>-short-description      # New functionality
fix/<ticket-id>-short-description          # Bug fix (non-urgent)
hotfix/<ticket-id>-short-description       # Urgent production fix
release/<version>                          # Release preparation branch
chore/<description>                        # Maintenance (deps, config, tooling)
docs/<description>                         # Documentation only
refactor/<description>                     # Code restructure (no behavior change)
test/<description>                         # Tests only
spike/<description>                        # Exploratory / proof-of-concept (never merge to main)
```

**Create a branch:**
```bash
# From the correct base branch — always confirm base before creating
git checkout main && git pull origin main
git checkout -b feature/GP-123-add-okta-sso
```

---

### 3.3 Hotfix Workflow (GitFlow)

A hotfix is an **urgent production fix** that bypasses the normal `develop` → `release` cycle.

```bash
# 1. Branch off the production branch (main or master — wherever your deployed code lives)
git checkout main
git pull origin main
git checkout -b hotfix/GP-456-fix-null-user-session

# 2. Apply the minimal fix — do NOT bundle unrelated changes
# Edit files...
git add <files>
git commit -m "fix(auth): handle null user session on token refresh (#456)"

# 3. Test locally (run unit tests at minimum)

# 4. Raise a PR targeting main
gh pr create \
  --base main \
  --title "fix(auth): handle null user session on token refresh" \
  --body "$(cat <<'EOF'
## What
Null pointer on token refresh when user session expires mid-request.

## Why
Production incident — users getting logged out on active sessions. See GP-456.

## Fix
Added null guard in `okta-tokens.ts:refreshToken()` before accessing `session.user`.

## How to Test
1. Let a session expire (or mock expiry)
2. Trigger a token refresh call
3. Verify no 500 error — user gets re-authenticated transparently

## Risk
Low — single-line null guard, no logic change.

## Checklist
- [x] Fix is minimal — no unrelated changes
- [x] Unit test added for null session case
- [x] Tested in local Electron dev build
EOF
)"

# 5. After merging to main → IMMEDIATELY back-merge to develop (GitFlow)
git checkout develop
git pull origin develop
git merge --no-ff main -m "chore: back-merge hotfix/GP-456 to develop"
git push origin develop
```

> **Rule:** A hotfix that lands in `main` but not `develop` creates a regression on the next release.
> Always back-merge. Set a GitHub Action to remind the team if a hotfix lands in `main` without
> a corresponding `develop` update.

---

### 3.4 Release Branch Workflow

```bash
# 1. Cut a release branch from develop when the sprint is feature-complete
git checkout develop && git pull origin develop
git checkout -b release/2.3.0

# 2. Only bug fixes go into a release branch — no new features
# Version bumps, changelog, final QA fixes only

# 3. Merge release → main (production)
gh pr create --base main --title "release: v2.3.0" --body "Release 2.3.0 — see CHANGELOG.md"

# 4. Tag the release on main after merge
git checkout main && git pull origin main
git tag -a v2.3.0 -m "Release v2.3.0"
git push origin v2.3.0

# 5. Back-merge release → develop
git checkout develop
git merge --no-ff main -m "chore: back-merge release/2.3.0 to develop"
git push origin develop

# 6. Create a GitHub Release
gh release create v2.3.0 \
  --title "v2.3.0 — Release Name" \
  --notes-file CHANGELOG.md
```

---

## Module 4: Commit Hygiene

### 4.1 Conventional Commits (Mandatory)

Every commit must follow the [Conventional Commits](https://www.conventionalcommits.org/) spec:

```
<type>(<scope>): <subject>   ← subject ≤ 72 chars, imperative mood

[optional body — wrap at 72 chars]
[why this change was needed, what alternatives were considered]

[optional footer]
Closes #<issue>
Co-authored-by: Name <email>
```

**Types:**
| Type | Use |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructure — no behavior change |
| `test` | Adding or fixing tests |
| `chore` | Maintenance (deps, build, tooling, config) |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `revert` | Revert a prior commit |

**Scope** = the module/area changed (e.g., `auth`, `api`, `ui`, `db`, `infra`).

**Good examples:**
```
feat(auth): add Okta PKCE login flow for UAT environment

Implements the three-environment Okta PKCE flow (prod/uat/dev).
Deep-link callback schemes registered in electron-builder.yml.
No client secret stored in frontend — PKCE only.

Closes #89
```

```
fix(session): scope queued follow-up messages by session ID

Messages from session A were leaking into session B when both
were open simultaneously. Added session-scoped message queue key.

Closes #102
```

**Bad examples (never do these):**
```
✗ fixed stuff
✗ WIP
✗ update
✗ changes
✗ commit
```

---

### 4.2 AI-Readable Commit Messages

When generating code, documents, or infrastructure, always write commit messages that an AI
reviewer (or a human reviewing with AI assistance) can use to reconstruct intent:

**Include in the commit body:**
- **What** changed (2–3 lines) — file or component level
- **Why** it changed — business/technical reason
- **Linked artifacts** — issue number, PR, SDD section, RA requirement ID (e.g., `FR-023`)
- **Risk level** — `Risk: Low / Medium / High` and why

**Template for AI-assisted projects:**
```
<type>(<scope>): <subject>

## What
- <file-or-module>: <specific change>
- <file-or-module>: <specific change>

## Why
<business or technical reason — link to requirement or issue>

## Risk
<Low/Medium/High> — <one-line justification>

Refs: #<issue>, FR-<id>, SDD §<section>
Co-authored-by: Orbit AI <orbit@genpact.com>
```

---

### 4.3 Signed Commits (Enterprise)

For regulated projects or repos requiring commit signing:

```bash
# Generate a GPG key
gpg --full-generate-key
# Choose: RSA, 4096 bits, 0 expiry, your Genpact email

# Get the key ID
gpg --list-secret-keys --keyid-format=long
# Copy the key ID after "sec rsa4096/"

# Tell git to use it
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true

# Add the public key to GitHub
gpg --armor --export <KEY_ID> | pbcopy
# GitHub → Settings → SSH and GPG keys → New GPG key → paste

# Verify a signed commit
git log --show-signature -1
```

---

## Module 5: Issue Management

### 5.1 Create an Issue

```bash
# Interactive (opens editor)
gh issue create

# With full details inline
gh issue create \
  --title "fix(api): null pointer on /refresh endpoint" \
  --body "## Description
Null pointer exception thrown when user session has expired and /refresh is called.

## Steps to Reproduce
1. Let session expire (or mock expiry)
2. Call GET /api/refresh
3. Server returns 500

## Expected
Returns 401 Unauthorized so client can re-authenticate.

## Environment
- Version: v2.2.1
- Env: prod

## Acceptance Criteria
- [ ] /refresh returns 401 when session is null
- [ ] Unit test covers null session case" \
  --label "bug,high-priority" \
  --assignee "@me"
```

### 5.2 Close an Issue via Commit

Git/GitHub auto-closes issues when these keywords appear in a commit message or PR body:

```
Closes #<id>       Fixes #<id>       Resolves #<id>
```

### 5.3 Link Issues to PRs

```bash
# List open issues
gh issue list

# View a specific issue
gh issue view 42

# Link issue to current PR (in PR body or via label)
gh pr edit --add-label "closes-#42"
```

---

## Module 6: Pull Request Workflow

### 6.1 PR Creation — The Right Way

A well-written PR description is the single most important input for both AI reviewers and human
approvers. It should answer: **What? Why? How to test? Risk?**

```bash
gh pr create \
  --base develop \
  --title "feat(auth): add SharePoint PKCE OAuth for M365 integration" \
  --body "$(cat <<'EOF'
## Summary
Implements SharePoint OAuth 2.0 PKCE flow for the M365 integration tile.
Users can now connect their SharePoint account from the Workspace Integrations view.

## What Changed
- `workspace-integrations-view.tsx` — added SharePoint tile with OAuth trigger
- `sharepoint-oauth.ts` — new PKCE flow implementation (no client secret)
- `mcp-auth-modal.tsx` — added SharePoint as a new provider type
- `electron/main.mjs` — registered `orbit://sharepoint/callback` deep-link handler

## Why
Requirement FR-034 from the M365 integration RA (see #88).
Enterprise users need SharePoint access for document search without leaving Orbit.

## How to Test
1. Run `pnpm dev` (Electron dev app)
2. Go to Settings → Integrations → SharePoint
3. Click Connect — browser should open to Microsoft login
4. Authenticate → deep-link callback returns token to app
5. Verify SharePoint files appear in Enterprise Search

## Screenshots
<!-- Add a before/after screenshot if UI changed -->

## Risk
**Medium** — new OAuth flow added. Existing GitHub and Okta flows are unaffected.
No secrets stored in frontend (PKCE only). Callback URI registered in Okta/Azure app config.

## Checklist
- [x] Tests added for PKCE token exchange
- [x] Tested in Electron dev build (not browser — deep-links are Electron-only)
- [x] No secrets hardcoded
- [x] `CHANGES-FROM-OPENWORK.md` updated
- [ ] QA sign-off pending

## Related
Closes #88
SDD §7.3 (SharePoint Integration Sequence)
RA FR-034

Co-authored-by: Orbit AI <orbit@genpact.com>
EOF
)"
```

---

### 6.2 Draft PRs

Use draft PRs for work in progress — signals "not ready for review" while keeping the branch
visible and CI running:

```bash
gh pr create --draft --base develop --title "WIP: feat(auth): SharePoint PKCE OAuth"

# Mark ready when done
gh pr ready
```

---

### 6.3 PR Review Request

```bash
# Request specific reviewers
gh pr edit --add-reviewer username1,username2

# Request a team
gh pr edit --add-reviewer org/team-name

# Check review status
gh pr view --json reviews
```

---

### 6.4 Merge Strategy

| Strategy | Command | Use when |
|---|---|---|
| **Merge commit** | `gh pr merge --merge` | GitFlow — preserves full history of a feature |
| **Squash** | `gh pr merge --squash` | Many noisy WIP commits → clean single commit on main |
| **Rebase** | `gh pr merge --rebase` | Linear history is required; all commits are clean |

**Genpact default:** Use **squash merge** for feature branches (keeps `main`/`develop` clean).
Use **merge commit** for `release/*` and `hotfix/*` back-merges (preserves the branch history).

```bash
# Squash merge with a clean commit message
gh pr merge 42 --squash --subject "feat(auth): add SharePoint PKCE OAuth (#42)" \
  --body "Closes #88. See PR for full description."

# Delete the branch after merge (always clean up)
git push origin --delete feature/GP-88-sharepoint-oauth
git branch -d feature/GP-88-sharepoint-oauth
```

---

### 6.5 Branch Protection Rules (Recommend to Admin)

Recommend these rules for any enterprise repo:

```
main / master:
  ✓ Require PR before merging
  ✓ Require 1 approving review (2 for release/hotfix)
  ✓ Dismiss stale approvals when new commits are pushed
  ✓ Require status checks (CI must pass)
  ✓ Require branches to be up to date before merging
  ✓ Require signed commits (regulated projects)
  ✗ Allow force-push → disabled
  ✗ Allow deletion → disabled
```

Set these via:
```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field required_status_checks='{"strict":true,"contexts":["ci/build","ci/test"]}' \
  --field enforce_admins=true \
  --field restrictions=null
```

---

## Module 7: Conflict Resolution

### 7.1 Identify and Resolve Merge Conflicts

```bash
# See what's conflicting
git status
git diff --name-only --diff-filter=U

# For each conflicting file, open and resolve manually
# Conflict markers look like:
# <<<<<<< HEAD
# your changes
# =======
# incoming changes
# >>>>>>> feature/GP-123

# After resolving, stage the file
git add <resolved-file>

# Complete the merge
git merge --continue
# Or abort and start over
git merge --abort
```

**Resolution strategy:**
1. List all conflicting files first — show the user the full scope.
2. Tackle one file at a time — never batch all conflicts.
3. For each: show both versions side by side, explain what each does, propose a resolution.
4. Get confirmation before staging.

---

### 7.2 Rebase a Feature Branch onto Latest Main

```bash
# Update local main
git checkout main && git pull origin main

# Rebase your feature branch
git checkout feature/GP-123-my-feature
git rebase main

# If conflicts arise during rebase — resolve them, then:
git add <resolved-file>
git rebase --continue

# If you want to abort the rebase
git rebase --abort

# After a successful rebase, force-push (your branch only — never force-push shared branches)
git push --force-with-lease origin feature/GP-123-my-feature
```

> `--force-with-lease` is safer than `--force` — it refuses to push if someone else pushed
> to the same branch since your last fetch, preventing accidental overwrite.

---

### 7.3 Cherry-Pick Specific Commits

Use cherry-pick to bring a specific commit from one branch to another without merging the whole branch:

```bash
# Find the commit hash
git log --oneline feature/GP-123

# Cherry-pick onto your current branch
git cherry-pick <commit-hash>

# Cherry-pick a range (from..to, exclusive of the from commit)
git cherry-pick abc1234..def5678

# If cherry-pick causes a conflict:
git add <resolved-files>
git cherry-pick --continue

# To abort:
git cherry-pick --abort
```

**Common use case:** A hotfix was merged to `main` — cherry-pick it to `develop` if a full
back-merge would bring in unwanted changes.

```bash
# Get the hotfix commit hash from main
git log main --oneline | head -5

# Cherry-pick just the hotfix commit to develop
git checkout develop
git cherry-pick <hotfix-commit-hash>
git push origin develop
```

---

### 7.4 Find Who Broke Something (git bisect)

```bash
# Start bisect — tell git a "bad" and "good" commit
git bisect start
git bisect bad HEAD                      # current state is broken
git bisect good v2.2.0                  # this tag was working

# Git will check out a midpoint commit
# Test it → tell git the result
git bisect good   # or
git bisect bad

# Repeat until git pinpoints the first bad commit
# Exit when done
git bisect reset
```

---

## Module 8: Security Scanning

### 8.1 GitHub Advanced Security (GHAS)

GitHub Advanced Security provides three layers of automated security scanning. Enable for any
Genpact enterprise repository.

```bash
# Check GHAS status for the repo
gh api repos/{owner}/{repo}/vulnerability-alerts

# Enable Dependabot alerts
gh api repos/{owner}/{repo}/vulnerability-alerts --method PUT

# Enable Dependabot security updates
gh api repos/{owner}/{repo}/automated-security-fixes --method PUT
```

---

### 8.2 CodeQL — Semantic Code Analysis

CodeQL finds security vulnerabilities by treating code as data. Set it up via GitHub Actions:

Create `.github/workflows/codeql.yml`:
```yaml
name: CodeQL Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 6 * * 1'   # Every Monday at 06:00 UTC

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      actions: read
      contents: read

    strategy:
      matrix:
        language: [javascript, python]   # Add java, csharp, go as needed

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          queries: security-and-quality

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

**View CodeQL findings:**
```bash
gh api repos/{owner}/{repo}/code-scanning/alerts \
  --jq '.[] | {number: .number, rule: .rule.id, severity: .rule.severity, file: .most_recent_instance.location.path}'
```

---

### 8.3 Fortify Integration

Fortify SAST (Static Application Security Testing) is Genpact's enterprise security scanning
standard. Integrate it into the CI pipeline:

**Option A — Fortify ScanCentral (recommended for enterprise):**
```yaml
# .github/workflows/fortify.yml
name: Fortify SAST Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  fortify-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download Fortify CLI
        run: |
          wget -q https://github.com/fortify/fcli/releases/latest/download/fcli-linux.tgz
          tar -xzf fcli-linux.tgz
          chmod +x fcli

      - name: Run Fortify Scan
        env:
          SSC_URL: ${{ secrets.FORTIFY_SSC_URL }}
          SSC_TOKEN: ${{ secrets.FORTIFY_SSC_TOKEN }}
        run: |
          ./fcli ssc login --url "$SSC_URL" --ci-token "$SSC_TOKEN"
          ./fcli sc-sast scan start \
            --application "genpact-<project>" \
            --version "${{ github.ref_name }}" \
            --package-file package.zip

      - name: Check Scan Results
        run: |
          ./fcli ssc issue count \
            --application "genpact-<project>" \
            --version "${{ github.ref_name }}" \
            --filter "severity:Critical,High"
          # Fail the build if Critical/High issues are found
```

**Option B — Fortify on Demand (FoD):**
```yaml
      - name: Fortify on Demand SAST Scan
        uses: fortify/github-action@v1
        with:
          sast-scan: true
        env:
          FOD_URL: ${{ secrets.FOD_URL }}
          FOD_TENANT: ${{ secrets.FOD_TENANT }}
          FOD_USER: ${{ secrets.FOD_USER }}
          FOD_PASSWORD: ${{ secrets.FOD_PASSWORD }}
```

**Viewing Fortify findings and feeding them to `vulnerability-fixer`:**
```bash
# Export findings as JSON
./fcli ssc issue list \
  --application "genpact-<project>" \
  --version main \
  --format json > fortify-findings.json

# Pass fortify-findings.json to the vulnerability-fixer skill
# It will generate targeted code fixes + a validation report
```

---

### 8.4 Dependabot — Dependency Vulnerability Alerts

Create `.github/dependabot.yml` to auto-raise PRs for vulnerable dependencies:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
      day: monday
      time: "06:00"
    open-pull-requests-limit: 10
    labels:
      - dependencies
      - security
    commit-message:
      prefix: "chore(deps)"

  - package-ecosystem: pip
    directory: "/"
    schedule:
      interval: weekly
    labels:
      - dependencies
      - security
    commit-message:
      prefix: "chore(deps)"

  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: monthly
    commit-message:
      prefix: "chore(ci)"
```

**Review Dependabot PRs:**
```bash
# List open Dependabot PRs
gh pr list --label dependencies

# Check the security advisory for a specific alert
gh api repos/{owner}/{repo}/dependabot/alerts \
  --jq '.[] | select(.state == "open") | {package: .dependency.package.name, severity: .security_advisory.severity, summary: .security_advisory.summary}'
```

---

### 8.5 Secret Scanning

GitHub will automatically block pushes that contain detected secrets (tokens, API keys, connection
strings). Enable push protection:

```bash
# Enable secret scanning push protection
gh api repos/{owner}/{repo}/secret-scanning --method PATCH \
  --field secret_scanning='{"status":"enabled"}' \
  --field secret_scanning_push_protection='{"status":"enabled"}'
```

**If a secret is detected in history, rotate it immediately, then remove from history:**
```bash
# Use git-filter-repo (preferred over BFG for modern repos)
pip install git-filter-repo
git filter-repo --path-glob '*.env' --invert-paths
git filter-repo --replace-text <(echo 'LEAKED_TOKEN==>REDACTED')
```

> **Warning:** This rewrites history. Coordinate with the team before force-pushing.
> All contributors must re-clone after the rewrite.

---

## Module 9: GitHub Wiki

### 9.1 Enable and Clone the Wiki

```bash
# Enable wiki via GitHub API
gh api repos/{owner}/{repo} --method PATCH --field has_wiki=true

# Clone the wiki (it's a separate git repo)
git clone https://github.com/<org>/<repo>.wiki.git
cd <repo>.wiki
```

### 9.2 Wiki Structure for Enterprise Projects

```
Home.md                        ← Landing page, links to all sections
Architecture.md                ← System overview diagram + key decisions
Getting-Started.md             ← Setup guide for new developers
API-Reference.md               ← Endpoint catalogue (or link to OpenAPI)
Branching-and-Release.md       ← This project's branching conventions
Security.md                    ← Security requirements, Fortify/CodeQL findings tracker
Runbooks/
  Runbooks.md                  ← Index of operational runbooks
  Runbook-Deploy.md
  Runbook-Rollback.md
  Runbook-Incident.md
ADRs/
  ADR-001-Tech-Stack.md        ← Architecture Decision Records
  ADR-002-Auth-Strategy.md
Changelogs/
  CHANGELOG-v2.3.md
```

### 9.3 Commit Documentation to Wiki

```bash
# Edit a wiki page
cd <repo>.wiki
# Edit the .md file

# Commit with a meaningful message
git add Architecture.md
git commit -m "docs(wiki): update architecture diagram for SharePoint integration"
git push origin master   # Wiki repos use master, not main
```

### 9.4 Link Wiki Pages from Code and PRs

- In PR descriptions: `See [Architecture Wiki](../../wiki/Architecture) for context`
- In commit messages: `docs(wiki): Refs: wiki/ADR-003`
- In READMEs: always link to the wiki home page

---

## Module 10: Versioning Other Assets

This skill also guides how other skills version their outputs using Git.

### 10.1 Versioning Generated Code (from `code-generator`)

After `code-generator` produces a project:

```bash
# 1. Initialize git repo (if not already)
git init
echo ".env" >> .gitignore
echo "__pycache__/" >> .gitignore
echo "node_modules/" >> .gitignore

# 2. First commit
git add .
git commit -m "feat(<project>): initial scaffold from SDD v1.0

Generated from: <ProjectName>_SDD.docx
Stack: <tech-stack>
Agent: Orbit code-generator skill

Co-authored-by: Orbit AI <orbit@genpact.com>"

# 3. Push to remote
git remote add origin git@github.com:<org>/<project>.git
git push -u origin main
```

### 10.2 Versioning Generated Documents (from `requirements-analyzer`, `solution-design-generator`)

Don't commit .docx files directly — they are binary and produce unreadable diffs. Instead:

```bash
# Option A: Store in a dedicated docs branch
git checkout -b docs/artifacts
git add <ProjectName>_SDD.docx <ProjectName>_RA.docx
git commit -m "docs: add SDD v1.0 and RA v1.0 for <ProjectName>"
git push origin docs/artifacts

# Option B: Use GitHub Releases as a document store
gh release create docs-v1.0 \
  --title "Design Documents v1.0" \
  --notes "SDD v1.0 and RA v1.0 for <ProjectName>" \
  <ProjectName>_SDD.docx \
  <ProjectName>_Requirements_Analysis_v1.0.docx
```

### 10.3 Versioning Test Cases (from `test-case-generator`)

```bash
git add tests/test-cases/<ProjectName>_TestCases_v1.0.xlsx
git commit -m "test(docs): add QA test cases v1.0 for <sprint>

Requirements coverage: FR-001 to FR-042
Test case count: 156 (112 functional, 44 negative/edge)
RTM: tests/test-cases/<ProjectName>_RTM.xlsx"
```

### 10.4 Versioning Infrastructure (from `devops-assist`)

IaC files (Terraform, CloudFormation, SAM templates) must be versioned in the same repo as the
application code they deploy:

```
<repo>/
├── infra/
│   ├── terraform/      ← or cloudformation/ or sam/
│   ├── .terraform.lock.hcl
│   └── README.md       ← how to apply, state backend, environments
└── .github/
    └── workflows/
        └── deploy.yml  ← CI pipeline that applies IaC on merge
```

---

## Module 11: PR Description Quality for AI Reviewers

When the `pr-reviewer` skill reviews a PR, it reads the PR description as context. A rich
description enables auto-approval of low-risk changes and gives approvers a clear picture
for high-risk ones.

### Signals that enable AI auto-approval
- All checklist items checked
- Risk level stated as "Low"
- Tests added and confirmed passing
- Scope is small (1–3 files changed)
- Linked to a specific requirement or issue
- No breaking changes section

### Signals that require human review
- Risk level is "Medium" or "High"
- Breaking changes section present
- Auth, payments, data migration, public API changes
- More than 10 files changed
- No tests added for non-trivial logic

### AI-readable PR template

Create `.github/PULL_REQUEST_TEMPLATE.md` in the repo:

```markdown
## Summary
<!-- One paragraph: what this does and why -->

## What Changed
<!-- Bullet list of files changed and what was changed in each -->
-

## Why
<!-- Business or technical reason. Link to issue/requirement -->
Closes #

## How to Test
<!-- Step-by-step instructions for the reviewer to verify the change -->
1.
2.
3.

## Risk
<!-- Low / Medium / High — justify in one sentence -->

## Breaking Changes
<!-- If none, delete this section -->

## Checklist
- [ ] Tests added for new/changed logic
- [ ] No hardcoded secrets
- [ ] Documentation updated (README, wiki, inline comments)
- [ ] `CHANGES-FROM-OPENWORK.md` updated (Orbit repos only)
- [ ] Passes CI (lint, test, security scan)

## Related
<!-- SDD section, RA requirement ID, ADR, wiki link -->
```

---

## Module 12: Git Hygiene and Housekeeping

```bash
# See what you're about to commit (always do this before committing)
git status
git diff --staged

# Undo the last commit (keep changes staged)
git reset --soft HEAD~1

# Undo a commit that was already pushed (create a revert commit — safe)
git revert <commit-hash>
git push

# Clean up merged local branches
git branch --merged main | grep -v "main\|develop\|master" | xargs git branch -d

# See the full history with graph
git log --oneline --graph --all | head -30

# Find which commit introduced a file/string
git log -S "the string you're looking for" --all

# Stash work in progress before switching branches
git stash push -m "WIP: auth refactor"
git stash list
git stash pop stash@{0}
```

---

## Integration Map — How This Skill Connects to Others

| Trigger | Action |
|---|---|
| After `code-generator` produces a project | Use Module 10.1 to initialize git and make the first structured commit |
| After `solution-design-generator` or `requirements-analyzer` produces a document | Use Module 10.2 to version it in a GitHub Release |
| Before raising a PR | Run `pr-reviewer` skill on the diff, then use Module 6.1 for the PR description |
| Fortify scan produces a report | Pass `fortify-findings.json` to `vulnerability-fixer` skill |
| CodeQL alert in GitHub | Use `vulnerability-fixer` with the alert detail |
| New project scaffolded | Use Module 8.4 to add Dependabot config |
| CI pipeline needed | Hand off to `devops-assist` for the Actions workflow |
| Documentation generated | Use Module 10.2–10.3 to commit to wiki or release |
| `documentation-generator` produces API docs | Push to `gh-pages` branch for GitHub Pages hosting |

---

## Quick Reference Card

```
Setup SSH:        ssh-keygen -t ed25519 → add to GitHub → ssh -T git@github.com
Port 22 blocked:  ssh.github.com:443 in ~/.ssh/config
gh auth:          gh auth login
Branch naming:    feature/ fix/ hotfix/ release/ chore/ docs/ refactor/ spike/
Hotfix:           branch from main → fix → PR to main → tag → back-merge to develop
Commit format:    type(scope): subject ≤72 chars | body: what/why/risk | Closes #N
PR merge:         squash for features, merge commit for release/hotfix back-merges
Cherry-pick:      git cherry-pick <hash> (use --force-with-lease on the push)
Conflict:         one file at a time, confirm each resolution before staging
Security:         CodeQL via Actions | Fortify ScanCentral | Dependabot | Secret scanning
Undo pushed:      git revert <hash> (never force-push to shared branches)
Clean branches:   git branch --merged main | grep -v main | xargs git branch -d
```

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
