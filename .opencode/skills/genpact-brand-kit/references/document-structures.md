# Genpact deliverable structures

Canonical section outlines for each deliverable type. All use the Genpact brand (cover with logo,
disclaimer, Document Control block, branded header/footer, Midnight/Cream tables, Calibri) from
`SKILL.md`. Derive content from the user's inputs; use `[To be defined]` where unknown; never fabricate.

---

## SDD — Solution Design Document (9 sections)
1. **Introduction** — business context, problem, what the solution addresses.
2. **Purpose** — objectives, scope (in/out), the pillars the solution delivers.
3. **System Overview** — high-level description + **Architecture diagram** + **Data-Flow diagram**.
4. **Design Constraints** — Integration; Security & Compliance; Infrastructure & Deployment.
5. **Roles and Responsibilities** — agent/crew table (`Agent/Crew | Phase/Focus | Responsibilities |
   Tools/Access`) + human governance roles.
6. **Project References** — systems, standards, prior baselines, external docs.
7. **Database Design** — `Tables | Columns` (or logical stores for config-only apps) + **ER diagram** if 3+ entities.
8. **Hardware and Software Detailed Design** — tech-stack table + **Deployment diagram** + detailed
   design subsections (**Sequence diagrams** per use case) + Implementation Steps Strategy (phased).
9. **System Security and Integrity Controls** — auth, encryption, secret hygiene, least privilege,
   transport/TLS, auditability.
Diagrams: architecture + data-flow (§3), sequence + swimlane (§8), ER (§7), deployment (§8).

## BRD — Business Requirements Document
1. Executive Summary · 2. Business Context & Problem Statement · 3. Objectives & Success Metrics ·
4. Scope (In / Out) · 5. Stakeholders & Roles · 6. Business Requirements (`BR-ID | Requirement |
Priority | Rationale`) · 7. Functional Requirements · 8. Non-Functional Requirements ·
9. Assumptions, Dependencies & Constraints · 10. Risks & Mitigations · 11. Acceptance Criteria ·
12. Glossary. Include a process/workflow diagram in scope.

## RA — Requirements Analysis
1. Overview & Objective · 2. Source Documents Reviewed · 3. Requirement Inventory (traceable IDs,
grouped functional/non-functional) · 4. Gap Analysis (`Area | Gap | Impact | Recommendation`) ·
5. Clarification Questions (numbered, for the business to answer) · 6. Assumptions ·
7. Requirements Traceability Matrix (RTM: `Req ID | Source | Design Ref | Test Ref`) · 8. Recommendations.
Two-phase: Phase 1 = questions doc; Phase 2 = full RA once answers return.

## Test Cases / Test Plan
1. Introduction & Scope · 2. Test Strategy (levels: unit/integration/system/UAT) · 3. Environment &
Test Data · 4. **Test Case table** (`TC ID | Requirement | Scenario | Preconditions | Steps | Expected
Result | Priority | Type`) — cover functional, negative, edge/boundary, integration, and human/
exploratory · 5. RTM (requirement → test coverage) · 6. Entry / Exit Criteria · 7. Defect Handling ·
8. Risks. Enforce full requirement coverage.

## Case Study
1. Title & Client/Context · 2. The Challenge · 3. The Approach / Solution (agents, MCP, skills used) ·
4. What Changed · 5. Results & Impact (**hero metrics**, before→after) · 6. Technology & Architecture ·
7. Quote / Callout · 8. Next Steps. Punchy, metric-led; mirror the one-slider tone.

## Report / Status Report
1. Summary · 2. Highlights / Accomplishments · 3. Metrics & KPIs (tables/charts) · 4. Details by
Workstream/Area · 5. Risks, Issues & Blockers · 6. Next Steps / Plan · 7. Appendix.

## PPT — one-slider (AI COE style)
16:9. Bands: **THE CHALLENGE** (3–4 pain-points + hero pain metric) · **THE SOLUTION** ("AGENT
automates" 3 steps + "HUMAN validates" + hero solution metric) · **THE IMPACT** (big delta, ✦
impact-to-date bullets, launch target, 3–4 key stats). Bottom pipeline strip + Genpact footer +
one-line summary. Build with `GenpactDeck.one_slider(...)`.

---

### Diagrams (matplotlib) — Genpact palette
Use `GP_DIAGRAM` from `genpact_brand.py`: primary `#161916`, secondary `#444744`, actor `#FFAD28`,
external `#FF555F`, database `#6D706B`, decision `#ADB1AC`, arrows `#161916`, canvas `#FFFAF4`.
Save PNG at dpi=150; embed with `GenpactDoc.embed()` (auto-scales to ≤6" wide, page-breaks if tall).
