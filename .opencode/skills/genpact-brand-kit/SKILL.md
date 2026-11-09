---
name: genpact-brand-kit
description: >-
  The single source of truth for Genpact brand structure, styling, and logos across EVERY generated
  deliverable — Word documents (SDD, BRD, RA/Requirements Analysis, Test Cases/Test Plan, Case Study,
  Report, Runbook, Design Docs) and PowerPoint decks (project one-sliders, status/impact decks). Load
  this skill WHENEVER the user asks to generate, create, write, or export any document or presentation
  so the output follows the Genpact brand: Midnight/Gold/Coral palette, Calibri, the Genpact logo +
  "on it" tagline on the cover, branded header/footer, and the correct per-document-type section
  structure. Other doc-producing skills (solution-design-generator, requirements-analyzer,
  test-case-generator, documentation-generator, etc.) MUST apply these standards. Trigger phrases:
  "generate an SDD/BRD/RA/test cases/case study/report/one-slider/deck", "make a document",
  "brand this", "Genpact template", "add the logo", "on-brand PPT".
---

# Genpact Brand Kit

**Mandatory brand system for all generated documents and decks.** When any deliverable is produced —
directly or by another skill — it MUST follow the structure, palette, typography, logo usage, and
cover/header/footer rules below. Never ship an unbranded document or a document without the Genpact logo.

Base directory of this skill: `${SKILL_DIR}` (the folder containing this SKILL.md). All asset and lib
paths below are relative to it. Resolve the base dir at runtime, e.g.:
`SKILL_DIR = <absolute path to this skill folder>` — logos live in `assets/genpact-logos/`, reusable
code in `lib/`, and per-document structures in `references/document-structures.md`.

---

## 1. Brand assets (logos) — ALWAYS include

| File (in `assets/genpact-logos/`) | Use |
|---|---|
| `Genpact Logo White.png` | Cover page / dark (Midnight) backgrounds |
| `Genpact Logo Black.png` | Page headers, light backgrounds |
| `logo_ON_IT_horizontal_white_TMversion.png` | "on it™" tagline on dark backgrounds |
| `logo_On_It_horizontal_black_MB_TM_version.png` | "on it™" tagline on light backgrounds |

Every `.docx` cover and every `.pptx` title area MUST carry the Genpact logo. Use forward slashes in
paths. A deliverable without the logo is non-compliant.

## 2. Color tokens (hex — no `#` for docx-js/python-docx `RGBColor.from_string`)

```
midnight = 161916   # primary dark — headings, cover bg, table headers, arrows
fl01     = 444744   # dark grey — H2 subheadings
fl02     = 6D706B   # mid grey — captions, metadata, page numbers
fl03     = ADB1AC   # light grey — footer copyright, secondary labels, borders
white    = FFFFFF   # body on dark, page background
cream    = FFF2DF   # Sunrise Cream — alternate table rows / section bands
gold     = FFAD28   # Sunrise Gold — accent + footer rule (ONLY on Midnight/light rule; never body text)
coral    = FF555F   # Coral — section labels, status badges, project label on cover
```
Diagram palette: primary `#161916`, secondary `#444744`, actor `#FFAD28`, external `#FF555F`,
database `#6D706B`, decision `#ADB1AC`, arrows `#161916`, canvas `#FFFAF4`, swimlane hdr `#FFF2DF`.
Never use generic Office blue/green/purple.

## 3. Typography
- Font: **Calibri** everywhere.
- Cover title 28–32pt Bold White; project label 12–13pt Bold Coral.
- H1 16pt Bold Midnight · H2 14pt Bold FL01 · H3 12pt Bold FL01.
- Body 11pt Regular Midnight · Captions 9pt Italic FL02 · Section labels 10pt SemiBold Coral.
- Never colour body copy; never put Gold on white.

## 4. Cover / Header / Footer (mandatory on every document)
- **Cover:** full-width Midnight (`161916`) band → White logo, then "on it" white tagline, then title
  (White), Coral project label, grey metadata line (`Date | Version | Status`).
- **Header (every page):** deliverable name left (FL02), Genpact **Black** logo right.
- **Footer (every page):** thin **Gold** top border rule + `© <year> Copyright Genpact. All Rights
  Reserved.` (FL03) + page number (FL02).
- **Disclaimer block** (right after cover, for AI-generated docs — verbatim):
  > ACTION REQUIRED: Notice to all users. This document is produced by generative AI and results may
  > not be accurate or contain errors. You are required to independently review, verify and modify (as
  > necessary) any output before proceeding. In no circumstances should results be relied on, used, or
  > shared without manual review and validation.

## 5. Table styling
Header row Midnight fill + White Bold 10pt; body rows alternate White / Cream; borders FL03 thin;
cell padding ~80 DXA vertical / 120 DXA horizontal.

## 6. Document Control block (every Word deliverable, right after cover + disclaimer)
1. **Metadata table** (2-col): `Project Name`, `Account`, `Current Version`, `List of Contributors`,
   `Customer Contact Information`.
2. **Review & Approval** table: `Prepared by / Date` · `Reviewed by / Date` · `Approved by / Date` (blank).
3. **Version History** table: `Version` · `Date` · `Description of Change` · `Reason for Change` · `Affected Sections`.
4. **Table of Contents** listing the document's sections.

## 7. Per-document-type structure (use the matching section list)
Full outlines with per-section guidance are in **`references/document-structures.md`**. Summary:

- **SDD (Solution Design Document)** — 9 sections: 1 Introduction · 2 Purpose · 3 System Overview ·
  4 Design Constraints · 5 Roles and Responsibilities (agent/crew table) · 6 Project References ·
  7 Database Design (Tables | Columns) · 8 Hardware & Software Detailed Design (+ detailed design &
  implementation strategy) · 9 System Security and Integrity Controls. Include architecture, data-flow,
  sequence, deployment diagrams where applicable.
- **BRD (Business Requirements Document)** — Executive Summary · Business Context & Problem · Objectives
  & Success Metrics · Scope (In/Out) · Stakeholders · Business Requirements (BR table) · Functional &
  Non-Functional Requirements · Assumptions/Dependencies/Constraints · Risks · Acceptance Criteria.
- **RA (Requirements Analysis)** — Overview · Source Docs Reviewed · Requirement Inventory (traceable
  IDs) · Gap Analysis · Clarification Questions · Assumptions · Traceability Matrix (RTM) · Recommendations.
- **Test Cases / Test Plan** — Introduction & Scope · Test Strategy · Environment & Data · Test Case
  table (`TC ID | Scenario | Steps | Expected | Priority | Type`) covering functional/negative/edge/
  integration · RTM (requirement→test) · Entry/Exit criteria · Defect-handling.
- **Case Study** — Title/Client · Challenge · Approach/Solution · What Changed · Results & Impact
  (hero metrics) · Tech/Agents used · Quote/Callout · Next steps.
- **Report / Status** — Summary · Highlights · Metrics/KPIs (tables) · Details by area · Risks/Issues ·
  Next steps · Appendix.
- **PPT one-slider** — see §8.

## 8. PowerPoint one-slider format (AI COE deck style)
16:9 (13.33×7.5"). Per project, one slide, three bands:
- **THE CHALLENGE** — 3–4 icon pain-points (title + one-line desc) + a hero pain metric (e.g. "30 Days").
- **THE SOLUTION** — "**AGENT** automates …" (3 pipeline steps) + "**HUMAN** validates every stage" +
  a hero solution metric (e.g. "8 Days").
- **THE IMPACT** — big delta (e.g. "30d → 8d", "73% faster"), ✦ *IMPACT TO DATE* bullets, *LAUNCH
  TARGET*, and 3–4 key stats.
- Bottom pipeline strip (e.g. RA & SDD → Code Gen → Scan·Fix·TC) + Genpact footer `© <year> Copyright
  Genpact. All Rights Reserved.` + a one-line summary caption.
Colours/fonts per §2–§3; Midnight band headers, Coral labels, Gold accents.

## 9. Reusable builder code (use it — do not hand-roll branding)
`lib/genpact_brand.py` is a drop-in Python module (python-docx + python-pptx) that encodes all of the
above. Prefer it so every deliverable is pixel-consistent.

```python
import sys; sys.path.insert(0, f"{SKILL_DIR}/lib")
from genpact_brand import GenpactDoc, GenpactDeck, GP  # GP = color tokens

# --- Word ---
doc = GenpactDoc(skill_dir=SKILL_DIR)
doc.cover(title="Solution Design Document (SDD)", project="ADLC — Genpact AI Desktop Client",
          subtitle="Enterprise Integration", version="1.0", status="Draft")
doc.disclaimer()                        # verbatim AI disclaimer
doc.document_control(project="…", account="…", contributors="…")  # metadata+review+version tables
doc.toc(["1. Introduction", "2. Purpose", ...])
doc.h1("1. Introduction"); doc.body("…"); doc.bullet("…")
doc.table(["Col A","Col B"], [["a","b"], ["c","d"]])
doc.embed("/tmp/arch.png", "Figure 1 — Architecture")   # auto-scales + page-breaks
doc.save("reports/ADLC_SDD.docx")

# --- PowerPoint one-slider ---
deck = GenpactDeck(skill_dir=SKILL_DIR)
deck.one_slider(
  title="ADLC — Autonomous Development Life Cycle",
  tagline="AI-native desktop client: enterprise SSO, connectors, governed SDLC agents",
  challenge=[("Manual, siloed dev", "Handoffs, late security findings"), ...],
  challenge_metric=("30 Days", "Manual happy-path effort"),
  solution_steps=[("BRD → RA → SDD", "AI extracts & architects"), ...],
  solution_metric=("8 Days", "AI-accelerated"),
  human="BA · Architect · Developer · Reviewer · Tester",
  impact_delta="30d → 8d", impact_sub="73% faster SDLC",
  impact_bullets=["✦ …", "✦ …"], stats=[("6","AI skills"), ("30","pilot users")],
  pipeline=["RA & SDD","Code Gen","Scan·Fix·TC"], summary="…")
deck.save("reports/ADLC_one_slider.pptx")
```
See the module docstring for the full API. If Python libs are missing:
`pip install python-docx python-pptx matplotlib pillow --break-system-packages -q`.

## 10. Rules of engagement
- ALWAYS load this skill before producing an SDD/BRD/RA/Test/Case Study/Report/PPT.
- ALWAYS apply the palette, Calibri, logo cover, branded header/footer, Document Control block, and the
  correct §7 structure for the requested type.
- Derive content from the user's inputs; never fabricate specifics — use `[To be defined]` when unknown.
- Never commit secrets into any generated artifact.
- Diagrams (matplotlib) use the §2 diagram palette; embed via `doc.embed()` (auto-scale + page-break).
