---
name: devops-assist
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill to generate CI/CD pipelines, containerization, Infrastructure-as-Code, and
  pre-commit automation for a project. Produces GitHub Actions (or GitLab CI/Jenkins) workflows
  that lint+test+scan+build+deploy, secure multi-stage Dockerfiles, IaC (AWS SAM / CloudFormation
  / Terraform), and pre-commit hooks — all environment-aware (dev/uat/prod) and secret-safe.
  Trigger phrases: "set up CI/CD", "create a GitHub Actions workflow", "write a Dockerfile",
  "containerize this", "generate Terraform/SAM/CloudFormation", "add a deployment pipeline",
  "add pre-commit hooks", "automate build and deploy". Applies the bundled Genpact engineering standards
  and integrates with config-manager (per-env config) and the test/security skills (pipeline gates).
---

# CI/CD & IaC Generator

Generate **secure, environment-aware** delivery automation: pipelines, containers, and
infrastructure-as-code. Match the project's existing tooling and conventions
(e.g. Genpact uses AWS SAM/CloudFormation + `buildspec.yaml` + per-env `props/*.properties`).

> **MANDATORY:** Comply with the bundled engineering standards (`references/engineering-standards.md`), especially §5 (no hardcoded
> secrets, least privilege). Pipelines pull secrets from the platform secret store / OIDC, never
> from committed files.

---

## Step 0: Understand the intent (ask once, then proceed)

Detect what you can from the repo first (Step 1), then confirm the gaps in **one batched
question** — never a multi-turn interrogation. Skip anything the request or repo already answers.

> "Before I generate the pipeline/IaC, a few quick things:
> 1. **Target cloud & deploy target** — AWS (Lambda+SAM / ECS / EKS), Azure, GCP, Kubernetes, or static site?
> 2. **Secrets store** — AWS SSM/Secrets Manager, Azure Key Vault, GitHub OIDC, or HashiCorp Vault?
> 3. **Compliance gates** — does the pipeline need to enforce a security scan (Fortify/CodeQL), SBOM, or sign-off before deploy?"

For the GitHub Actions side of any answer (CodeQL, Fortify, Dependabot, secret scanning,
branch-protection-gated deploys), coordinate with the `github-assist` skill, which owns those
workflow templates.

Generate **progressively**: scaffold the CI verify stage first, confirm it passes, then add
build/containerize/deploy stages — never emit the full multi-environment pipeline in one dump.

---

## Step 1: Detect the project & target platform

Identify:
- Language/runtime & build tool; test & lint commands; existing Dockerfile/IaC/`buildspec.yaml`.
- CI platform (GitHub Actions / GitLab CI / Jenkins / AWS CodeBuild) — **match what exists**.
- Deploy target (AWS Lambda+API GW via SAM, ECS/Fargate, Kubernetes, static site…).
- Environments (dev/uat/prod/poc) and how config differs (pair with `config-manager`).

---

## Step 2: CI pipeline (build + verify gates)

Generate a pipeline that runs on PR and on main, with these **ordered gates** (fail fast):

1. **Checkout + setup** (cache deps).
2. **Lint/format check** (ruff/black, eslint/prettier, etc.).
3. **Unit tests + coverage** (threshold enforced) — uses `test-automation-generator` output.
4. **Security scans:**
   - SAST (e.g. Semgrep/Bandit),
   - dependency/SCA + secret scan (e.g. Trivy/`pip-audit`, gitleaks),
   - IaC scan (e.g. `cfn-lint`/checkov) if IaC present.
5. **Build** (package/zip/image).
6. **(main only) Deploy** to the target env via OIDC role (no long-lived keys).

**Rules**
- **No hardcoded secrets** — use CI secrets store / OIDC federation; reference by name.
- **Pin action/tool versions**; least-privilege CI permissions (`permissions:` block).
- Make scans **blocking** for high/critical findings.
- Keep jobs cacheable and parallel where safe.

**Example (GitHub Actions skeleton)**
```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
permissions:
  contents: read
  id-token: write          # OIDC for AWS deploy; no static keys
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - run: ruff check . && black --check .
      - run: pytest -q --cov=src --cov-report=term-missing
      - uses: aquasecurity/trivy-action@0.28.0
        with: { scan-type: fs, severity: CRITICAL,HIGH, exit-code: "1" }
```

---

## Step 3: Containerization (if applicable)

Generate a **secure multi-stage Dockerfile**:
- Minimal, pinned base image (e.g. `python:3.12-slim`); separate build/runtime stages.
- **Run as non-root**; read-only filesystem where possible.
- No secrets baked into layers; use build args/runtime env only for non-secrets.
- `.dockerignore` to keep context lean and exclude secrets/`.env`.
- Healthcheck; explicit `EXPOSE`; pinned dependency install.

---

## Step 4: Infrastructure as Code

Generate IaC matching the stack (SAM/CloudFormation/Terraform):
- **Parameterized per environment** (dev/uat/prod) — same template, env-specific params/props.
- **Least-privilege IAM** — scoped roles/policies; no wildcard `*` unless explicitly required
  and documented.
- Externalized config/secrets (SSM/Secrets Manager references, not inline).
- Sensible defaults: encryption at rest, logging/metrics enabled, retention set.
- Lint-clean (`cfn-lint`/`checkov`/`terraform validate`).

---

## Step 5: Pre-commit hooks (shift-left, local)

Generate a `.pre-commit-config.yaml` (or husky/lint-staged) that runs **before commit**:
- format + lint, trailing-whitespace/EOF fixes,
- **secret detection** (gitleaks/detect-secrets),
- (optional) fast unit tests on changed files.

This catches issues locally before CI — reinforcing best practice at the earliest step.

---

## Step 6: Deliver

Provide:
1. CI workflow file(s) with ordered gates.
2. Dockerfile + `.dockerignore` (if containerized).
3. IaC templates + per-env parameter files (secret pointers only).
4. `.pre-commit-config.yaml`.
5. A short README section: how to run the pipeline, required CI secrets/OIDC role, how to deploy
   per environment, how to add a new env.

---

## Quality checklist (output filled-in)

- [ ] Matches existing CI platform & project conventions
- [ ] Gates ordered & fail-fast: lint → test+coverage → SAST/SCA/secret/IaC scan → build → deploy
- [ ] **No hardcoded secrets**; CI secrets/OIDC used; actions & images version-pinned
- [ ] Least-privilege CI & IAM permissions; high/critical scan findings block
- [ ] Dockerfile multi-stage, non-root, no secrets in layers, `.dockerignore` present
- [ ] IaC parameterized per env (dev/uat/prod), lint-clean, encryption/logging on
- [ ] Pre-commit hooks include secret detection + lint
- [ ] Complies with engineering-standards (§5) and integrates with config-manager

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
