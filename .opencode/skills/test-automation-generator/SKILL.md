---
name: test-automation-generator
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill to generate RUNNABLE automated test code (not test documents) for a codebase or
  feature — unit tests, integration tests, fixtures/mocks, parametrized edge & negative cases,
  and coverage configuration. Supports pytest, unittest, jest/vitest, JUnit, Go testing, etc.
  Trigger phrases: "write tests for this code", "generate unit tests", "add test coverage",
  "create pytest/jest tests", "automate these test cases", "add integration tests", "increase
  coverage". Use when the goal is executable tests. For test-case DOCUMENTS/plans/RTM from
  requirements, use test-case-generator instead. Can consume test-case-generator output and turn
  it into runnable tests. Applies the bundled Genpact engineering standards.
---

# Test Automation Generator

Produce **executable, well-structured automated tests** that actually run and meaningfully verify
behavior — closing the gap between test *design* and test *code*.

> **MANDATORY:** Comply with the bundled engineering standards (`references/engineering-standards.md`). Test code is real code: it must
> be readable, modular, and free of hardcoded secrets.

> **Scope:** This writes runnable test code. For human-readable test cases / test plans / RTM
> documents, use **test-case-generator** (this skill can consume its output).

---

## Step 0: Confirm scope (infer first, ask once if unclear)

Auto-detect the language, test framework, and layout from the repo (Step 1). Before writing
tests, confirm scope in **one** batched question only if it isn't already clear from the request:

> "Quick scope check before I write tests:
> 1. **What to cover** — a specific module/function/endpoint, the changed files, or the whole project?
> 2. **Test level** — unit only, or unit + integration (real DB/API interactions)?
> 3. **Coverage target** — any threshold to hit (e.g. 80%), or just meaningful coverage of the key paths?"

If the user already named a file or said "unit tests for X", infer silently and proceed. Generate
**progressively**: confirm the coverage plan (Step 2) before generating the full suite.

---

## Step 1: Understand the system under test (SUT)

- Identify the language, existing test framework, and test directory layout. **Match them.**
- Determine units vs. integration boundaries: pure functions (unit) vs. code that touches
  network/DB/filesystem/clock (integration — mock the boundary in unit tests).
- Read the code to understand inputs, outputs, side effects, and error paths.
- If requirements/test-case docs are provided, map each requirement → test(s) for traceability.

---

## Step 2: Plan coverage (enforce breadth)

For each unit/endpoint, plan tests across **all** of these categories — do not stop at the happy
path:

| Category | What to cover |
|----------|---------------|
| **Happy path** | Typical valid inputs → expected output |
| **Boundaries** | Min/max, empty, zero, one, large, off-by-one |
| **Negative** | Invalid input, wrong types, missing fields → correct error/exception |
| **Edge cases** | Nulls, unicode, duplicates, concurrency, ordering |
| **Error paths** | Each `raise`/failure branch is exercised |
| **Integration** | Real interaction across components (DB/API) where applicable |

State a short coverage plan before writing code.

---

## Step 3: Generate the tests

Follow framework idioms and these rules:
- **AAA structure** — Arrange, Act, Assert; one logical assertion focus per test.
- **Descriptive names** — `test_<unit>_<condition>_<expected>` (e.g.
  `test_issue_key_unknown_app_raises`).
- **Parametrize** repetitive cases instead of copy-paste.
- **Isolate** — no test depends on another; no shared mutable state; deterministic (mock clock,
  random, network). No real network/secrets — use fixtures/mocks.
- **Mock external boundaries** (HTTP, AWS, DB) with the standard tool (`unittest.mock`,
  `responses`/`moto`, `nock`, Mockito); keep true integration tests separate and clearly marked.
- **Assert behavior, not implementation** — avoid brittle over-mocking.
- **Test error handling explicitly** — assert the right exception/type/message is raised.

**Example (pytest)**
```python
import pytest
from auth_gateway.session_manager import issue_gateway_key
from auth_gateway.errors import AppNotRegistered

@pytest.mark.parametrize("ttl,expected", [(60, 60), (10_000, 3600)])  # capped at 3600
def test_issue_key_caps_ttl(fake_apps_table, ttl, expected):
    key = issue_gateway_key("user-1", "orbit", ttl=ttl)
    assert key.startswith("gk_")
    assert fake_apps_table.last_ttl == expected

def test_issue_key_unknown_app_raises(fake_apps_table):
    with pytest.raises(AppNotRegistered):
        issue_gateway_key("user-1", "does-not-exist")
```

---

## Step 4: Fixtures, mocks & test config

- Create reusable **fixtures** for common setup (clients, sample data, temp dirs).
- Provide **mocks/stubs** for external services; use fakes for AWS (`moto`) where helpful.
- Ensure tests read no real secrets — use dummy values/fixtures.

---

## Step 5: Coverage configuration & runner

- Add/update coverage config (`pytest.ini`/`pyproject.toml` + `coverage`, `jest --coverage`,
  JaCoCo) with a sensible threshold (e.g. 80% on changed code).
- Provide the exact **run commands**:
  ```bash
  pytest -q --cov=src --cov-report=term-missing
  ```
- Ensure tests are CI-ready (no interactive prompts, deterministic). Pairs with
  `devops-assist`.

---

## Step 6: Verify & deliver

1. **Run the tests** if the environment allows; report pass/fail and fix flaky/failing tests.
2. Deliver:
   - test files in the correct directory,
   - fixtures/mocks,
   - coverage config + run command,
   - a short summary: units covered, categories covered, requirement→test traceability (if docs
     were provided), and any gaps that need real integration environments.

---

## Quality checklist (output filled-in)

- [ ] Matches project's framework & layout
- [ ] Happy + boundary + negative + edge + error paths covered (not just happy path)
- [ ] AAA structure, descriptive names, parametrized where repetitive
- [ ] Deterministic & isolated; external boundaries mocked; no real secrets
- [ ] Error/exception behavior explicitly asserted
- [ ] Coverage config + run command provided; CI-ready
- [ ] Tests executed (or clearly noted why not) and passing
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
