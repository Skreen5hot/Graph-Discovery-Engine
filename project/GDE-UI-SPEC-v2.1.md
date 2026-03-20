# GDE Query Builder — UI Specification v2.1
### For Non-Technical Subject Matter Experts
*Companion to Graph Discovery Engine (GDE) / RPM v2.1 Production Specification*

---

## Document Status

| Field | Value |
|---|---|
| Version | 2.1 |
| Status | Production Ready |
| Engine Version | RPM v2.1 (Discovery-First) |
| Audience | Frontend Engineers, Product Designers, QA Engineers |
| Supersedes | GDE UI Spec v2.0, RPM UI Spec v1.0 |

---

## Changelog: v2.0 → v2.1

**1. Section 7 — Sidebar Tier Structure Corrected**
v2.0 inverted the RPM v2.1 §5.6 specificity ranking by placing Tier 3 Compound Intents above direct predicates. v2.1 introduces a two-surface sidebar model: a "Common questions" discovery strip (top-N Compound Intents by `frequencyScore`) coexists with the specificity-ranked full catalog below it. These serve different purposes and are both present simultaneously.

**2. Section 8 — Curator "Edit Label" Action Added**
The Intent Detail Panel now specifies the Curator-role edit affordance (pencil icon beside intent title), the Label Override Modal (fields, constraints, revert action), and the partial catalog rebuild feedback loop — closing the gap in v2.0 which omitted the modal delete/revert path.

**3. Section 10 — Results View Updated for Narrative Synthesis**
The Results View is fully specified with NarrativeSummary, narrativePath breadcrumbs, and the truncated-narrative treatment when the Firewall Enforcement (RPM §34.4) omits a clause. The `narrativeSummary` subtitle and "Show path" toggle are now fully specified components.

**4. Section 11 — Curator Tools Corrected and Completed**
The "Refresh search options" control is moved from the application header to a settings panel. The Label Override Modal now includes a "Revert to original" action for existing overrides, closing the gap in v2.0 which had no delete path.

**5. Section 18 — Input Rendering: Number Input Corrected**
v2.0 incorrectly described the number input as a "slider." RPM v2.1 §31.2 specifies `inputType: "number"` as a numeric input paired with a comparison operator dropdown. This section is corrected.

**6. Section 19 — Compliance Test Table Completed**
CT-13 (Quality Threshold Boundary) is added. CT-10 pass criterion is corrected from "numeric slider" to "numeric input with operator dropdown."

---

## Table of Contents

1. Purpose and Scope
2. Governing Principles
3. Application Architecture Overview
4. Screen Inventory
5. Layout and Grid
6. Screen 1 — Subject Selection
7. Screen 2 — Query Builder (Discovery Workspace)
8. Screen 3 — Intent Detail Panel
9. Screen 4 — Query Review and Submit
10. Screen 5 — Results View
11. Curator Tools
12. Component Library
13. Interaction and Behavior
14. Motion and Transitions
15. Visual Design Standards
16. Typography
17. Color System
18. Content and Messaging
19. Error Handling and System Feedback
20. Compliance Test Reference
21. Accessibility
22. Responsive Behavior
23. Platform Constraints
24. Open Questions

---

## 1. Purpose and Scope

This document specifies the user interface for the GDE Query Builder: a tool that allows subject matter experts (SMEs) to construct queries against any well-formed knowledge graph without knowledge of SPARQL, ontology structure, or graph data models. The UI is driven by the RPM v2.1 Discovery-First engine: the Intent Catalog is generated automatically from the graph and its ontology closure. No architect manually authors the menus, labels, or input fields.

This specification is the downstream companion to RPM v2.1. It governs everything RPM deliberately leaves out of scope: layout, visual design, interaction patterns, copy, accessibility, and responsive behavior. Where this document references an RPM requirement, the section is cited as (RPM §X.X).

### 1.1 Who This Spec Is For

This document is written for the team building and validating the UI. SMEs will never see this document; they will use the application it describes.

### 1.2 What This Spec Governs

- Every screen, panel, and modal the SME and Curator interact with
- The exact wording of all labels, tooltips, placeholder text, error messages, and confirmation copy
- Component states and state transitions
- Layout measurements, spacing, and responsive breakpoints
- Motion, animation, and transition specifications
- Color, typography, and iconography systems
- Accessibility requirements and keyboard navigation
- System feedback patterns for all success, error, and in-progress states
- Curator-role tools: label overrides, schema refresh, narrative path disclosure

### 1.3 What This Spec Does Not Govern

- Backend query execution (governed by RPM v2.1 and the adapter layer)
- The XSD-to-UI component mapping table (normatively defined in RPM v2.1 §31.2; this spec adds only UI rendering notes)
- The Labeling Law algorithm (RPM v2.1 §30)
- The Mapping Registry contents (governed by the domain team and the Discovery Engine)
- The ontology closure (governed by the ontology team)

---

## 2. Governing Principles

These six principles take precedence over any individual design decision in this document. When a new decision must be made that the spec does not cover, the principles are the tiebreaker.

### 2.1 The Firewall Principle *(RPM §21.1)*

The SME must never see an ontology IRI, predicate name, blank node ID, namespace prefix, internal error code, tier value, frequency score, or source field. This is the single most important constraint in the system. Every design decision that trades SME clarity for implementation convenience is wrong.

Practical test: any person with domain expertise but no ontology training must be able to use any screen in this application without encountering a term they cannot understand.

This principle extends to Curator-facing surfaces. Curators may see plain-language labels, descriptions, and groups. They must not see shorthand IRIs, `overrideId` values, `appliesTo` fields, or any internal identifier.

### 2.2 Discovery-First

The UI is inferred, not authored. Every menu item, input field, and group heading was generated from the graph and its ontology by the Discovery Engine. The design must communicate this honestly: when a catalog is freshly populated, it reflects the actual structure of the connected graph — not a curated list someone decided to include.

This principle has one practical consequence: the UI must never present an empty catalog as a failure. If the Discovery Engine found nothing for a given subject type, the UI must explain that no search options were found for that record type and suggest either selecting a different type or asking a Curator to refresh.

### 2.3 Progressive Disclosure

The query builder must not present everything at once. A query that can be expressed in one step must not require three screens. Advanced capabilities (composition modes, chained queries, path disclosure) must be discoverable but not mandatory.

### 2.4 Automated Explainability

Every result row must include a plain-language NarrativeSummary that explains what was found and how. The SME should be able to read the result without interpreting a raw table. When a narrative is truncated by Firewall enforcement, the truncation must be handled gracefully: a shorter correct sentence is shown; no error is surfaced to the SME.

### 2.5 Failure Is Informative, Not Punishing

When the system cannot process a query, the SME receives a message that tells them what to do next. Validation errors appear adjacent to the field that caused them. System errors direct the SME to an administrator. The system never asks an SME to retry a system-level error.

### 2.6 Results Are the Goal

The query builder is a means to an end. Every design decision should minimize the number of interactions between the SME's question and their answer. The results view is the most important screen in the application.

---

## 3. Application Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  DISCOVERY ENGINE (startup, background)                  │
│  Crawls graph → resolves labels → infers controls        │
│  → builds Intent Catalog in memory                       │
└──────────────────────────┬───────────────────────────────┘
                           │ (catalog ready)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  SCREEN 1: SUBJECT SELECTION                             │
│  SME selects entity type. Intent Catalog filters.        │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  SCREEN 2: QUERY BUILDER (DISCOVERY WORKSPACE)           │
│  "Common questions" strip (top Compound Intents)         │
│  + Specificity-ranked full catalog below                 │
│  SME adds clauses and sets composition mode.             │
└──────────────────────────┬───────────────────────────────┘
                           │ (on intent selection)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  SCREEN 3: INTENT DETAIL PANEL (SLIDE-IN)                │
│  Inference-driven inputs (Control Inference §31.2).      │
│  Hints from rdfs:comment / skos:definition.              │
│  Curator: Edit Label affordance.                         │
└──────────────────────────┬───────────────────────────────┘
                           │ (returns to S2)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  SCREEN 4: QUERY REVIEW AND SUBMIT                       │
│  Plain-language query summary. SME confirms.             │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  SCREEN 5: RESULTS VIEW                                  │
│  NarrativeSummary per row. "Show path" toggle.           │
│  Columns = outputBind labels. Export and refine.         │
└──────────────────────────────────────────────────────────┘
```

**Persistent elements (Screen 2 onward):**
- Application header: logo, user identity, help link, settings icon (Curator only)
- Current query summary bar

**New in v2.1:**
- Narrative Synthesis Layer sits between CGP output and Results View (RPM §34)
- Label Override API surfaces in Screen 3 and via M4 (Label Override Modal)
- Schema refresh is in the settings panel, not the header

---

## 4. Screen Inventory

| ID | Name | Primary Action | Role |
|---|---|---|---|
| S1 | Subject Selection | Choose record type | SME + Curator |
| S2 | Query Builder | Browse intents, build clauses | SME + Curator |
| S3 | Intent Detail Panel | Configure a single intent | SME + Curator |
| S4 | Query Review | Confirm before submitting | SME + Curator |
| S5 | Results View | Read, sort, export results | SME + Curator |
| M1 | Clause Delete Confirmation | Confirm clause removal | SME + Curator |
| M2 | Clear Query Confirmation | Confirm clearing query | SME + Curator |
| M3 | System Error Modal | Display unrecoverable errors | SME + Curator |
| M4 | Label Override Modal | Correct an auto-generated label | Curator only |
| P1 | Settings Panel | Access Curator tools | Curator only |

---

## 5. Layout and Grid

### 5.1 Baseline Grid

All vertical spacing uses an **8px baseline grid**. Every margin, padding, and element height must be a multiple of 8px. 4px is permitted for half-units. 2px is permitted only for borders and dividers.

### 5.2 Layout Column Structure

**12-column grid** at desktop breakpoints.

| Zone | Columns | Usage |
|---|---|---|
| Left sidebar | 3 col (288px at 1280px viewport) | Intent catalog / group navigation |
| Main content | 6 col (576px) | Query canvas, results |
| Right panel | 3 col (288px) | Intent detail (slide-in), query summary |

At tablet: right panel collapses. At mobile: sidebar collapses into a drawer.

### 5.3 Responsive Breakpoints

| Name | Min Width | Layout |
|---|---|---|
| Mobile | 320px | Single column. Sidebar = bottom drawer. Detail panel = full-screen modal. |
| Mobile-L | 480px | Single column, wider content. |
| Tablet | 768px | Two-column. Sidebar visible. Right panel = slide-in overlay. |
| Desktop | 1024px | Three-column. |
| Desktop-L | 1440px | Three-column, main content 8 col. |
| Widescreen | 1920px | Max-width 1440px centered. |

### 5.4 Content Max-Widths

| Element | Max Width |
|---|---|
| Application container | 1440px |
| Main content zone | 736px |
| Intent detail panel | 480px |
| Label Override Modal | 480px |
| Settings panel | 320px (right drawer) |
| Inline error message | 100% of parent field |
| System error modal | 480px |
| Results table | 100% of main content zone |
| NarrativeSummary per row | 100% of result row width |

### 5.5 Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Tight internal padding |
| `space-2` | 8px | Component internal padding |
| `space-3` | 12px | Small gaps between related elements |
| `space-4` | 16px | Standard component gap |
| `space-5` | 24px | Section internal padding |
| `space-6` | 32px | Section separation |
| `space-7` | 48px | Major section gap |
| `space-8` | 64px | Screen-level padding |

---

## 6. Screen 1 — Subject Selection

### 6.1 Purpose

The SME declares the entity type they are querying. This drives the Intent Catalog filter (RPM §23.3): only intents whose `domainClasses` are satisfied by the chosen type are displayed in Screen 2. Subject type cards are populated from the discovered registry — their labels are Labeling Law resolved values, not hand-authored.

### 6.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [App Header — logo, user, help, ⚙ (Curator only)]          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   What type of record are you looking for?                   │
│   ─────────────────────────────────────────────────────────  │
│                                                              │
│   [ 🔍 Search record types...                            ]   │
│                                                              │
│   Common types                                               │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│   │   Person     │  │ Organization │  │   Location   │       │
│   │  [icon]      │  │  [icon]      │  │  [icon]      │       │
│   └──────────────┘  └──────────────┘  └──────────────┘       │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│   │   Document   │  │    Event     │  │    Item      │       │
│   │  [icon]      │  │  [icon]      │  │  [icon]      │       │
│   └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│   All types  ▼                                               │
│                                                              │
│   [ Find [Subject Type] records → ]  (disabled until select) │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Component Specifications

**Page heading:** "What type of record are you looking for?" — H1 in display font.

**Search field:** Placeholder: "Search record types…". Live filter 150ms debounce, matches `ui.subjectLabel` values. No results: "No record types match '[query]'. Try a different term or browse all types below."

**Subject type cards:** 3-column grid (desktop), 2-column (tablet), 1-column (mobile). Each shows: icon, `ui.subjectLabel`, one-line description. States: default, hover, selected (accent fill + checkmark), disabled.

**Empty catalog state:** If the Discovery Engine found no intents for any subject type, show: "No search options are available. The data source may not be connected. Contact your system administrator." Do not show an empty grid.

**"All types" expandable:** Collapsed by default, shows 6 most-used types. "Show all [N] types" / "Show fewer types".

**Continue button:** Label: "Find [Subject Type] records →". Disabled until a type is selected. Sticky at bottom right.

### 6.4 Behavior

On selection the card enters selected state. Clicking Continue advances to S2. The [Change] link in the query summary bar returns to S1; if clauses exist, Modal M2 fires first.

---

## 7. Screen 2 — Query Builder (Discovery Workspace)

### 7.1 Purpose

The central workspace. The SME browses the auto-generated Intent Catalog, adds intent clauses, and sets composition mode. In v2.1 the sidebar has two distinct sections: a discovery shortcut strip and the full specificity-ranked catalog.

### 7.2 Layout (Desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│  [App Header]                                    [Help]  [User]  │
├──────────────────────────────────────────────────────────────────┤
│  Person records  ·  [Change]       2 conditions added   [Review →]│
├────────────────┬─────────────────────────┬───────────────────────┤
│  BROWSE        │  YOUR QUERY             │  [DETAIL PANEL]       │
│  ──────────    │  ──────────────         │  (hidden until open)  │
│                │                         │                       │
│  [Search...]   │  [+ Add a condition]    │                       │
│                │                         │                       │
│  ★ Common      │  ┌─── Clause chip ──┐   │                       │
│  questions     │  │ Employed by      │   │                       │
│  ──────────    │  │ Employer: Acme   │   │                       │
│  · Employment  │  └──────────────────┘   │                       │
│  · Has Catalyst│                         │                       │
│  · Procurement │  Combine as:            │                       │
│                │  ● All must match       │                       │
│  All search    │  ○ Any can match        │                       │
│  options       │  ○ Chained search       │                       │
│  ──────────    │                         │                       │
│  [Groups...]   │                         │                       │
│                │                         │                       │
└────────────────┴─────────────────────────┴───────────────────────┘
```

### 7.3 Left Sidebar — Intent Browser

The sidebar is divided into two sections, separated by a visible divider. Both sections are always present when the catalog has content.

#### 7.3.1 "Common Questions" Strip (Discovery Shortcut)

**Purpose:** Surfaces the top Compound Intents by `frequencyScore` as a discovery shortcut. These are the paths the graph itself uses most often. This section helps the SME identify the most traversed and meaningful paths without needing to understand what a "Compound Intent" is.

**Heading:** "★ Common questions" — muted label, all-caps small, with a star icon. No technical terms.

**Content:** Top-N Compound Intents (Tier 3) for the current subject type, ranked by `frequencyScore` descending. N = minimum of 5 or the number of available Compound Intents.

**Rendering:** Same list item format as the full catalog (label + one-line description). No frequency score, tier, or shorthand is shown. A subtle frequency indicator — a small bar or dot — may optionally indicate relative popularity using visual weight alone (no numbers, no percentages).

**Empty state:** If no Compound Intents exist for the current subject type (e.g., a sparse graph that produced no Tier 3 results), this section is hidden entirely. The sidebar shows only the full catalog.

**Important:** This section is a shortcut, not a replacement. An intent appearing here also appears in its proper group in the full catalog below. The SME may use either surface to reach the same Intent Detail Panel.

#### 7.3.2 Full Catalog (Specificity-Ranked)

**Purpose:** The complete, specificity-ranked Intent Catalog for the current subject type. This is the authoritative list. Tier 1 (direct predicates) and Tier 2 (property chains) appear before Tier 3 (Compound Intents) at equal subsumption distance, per RPM §5.6. This order is not adjustable by the SME.

**Heading:** "All search options" — muted label.

**Search field:** Placeholder: "Search conditions…". Searches `ui.label`, first 80 characters of `ui.description`, and any `ui.examples` string. Case-insensitive. Live filter 150ms debounce. Searching collapses group structure into a flat ranked list. Clear button [✕] inside field when text is present. No results: "No conditions match '[query]'. Try different words, or browse the groups above."

**Group list:** One heading per `ui.group` value in the filtered catalog. Groups with no applicable intents are hidden entirely. Group headings clickable to expand/collapse. Default: all groups expanded. Intent count badge "(3)" in muted text beside each group heading. Groups are derived from the domain class hierarchy (RPM §30.7) — their names are resolved labels, not hand-authored.

**Intent list items:**
- Primary: `ui.label`
- Secondary: `ui.description`, one line, ellipsis overflow
- States: default, hover (row highlight), active (left accent bar), already-added (checkmark, muted)
- Click: opens Intent Detail Panel (S3)
- Keyboard: Tab to focus, Enter or Space to open

**Auto-generated label indicator:** A subtle "auto" badge (small grey pill reading "auto") may optionally appear on intent labels that have `source: "discovered"` and no static override. This helps Curators identify entries that could benefit from label correction. The badge must not appear for `sme` role users. The badge must never display the word "discovered", a tier number, a shorthand IRI, or any internal value.

### 7.4 Center Column — Query Canvas

**Empty state:**
```
        ┌────────────────────────────────────┐
        │  [+ icon]                          │
        │  Start building your search        │
        │  Select a condition type from      │
        │  the left panel to begin.          │
        └────────────────────────────────────┘
```

**Clause chips:**
```
┌───────────────────────────────────────────────────────┐
│  [Intent label]        [field label]: [value]    [✕]  │
│  Employed by           Employer: Acme Corp             │
└───────────────────────────────────────────────────────┘
```
- Shows `ui.label` and plain-English parameter summary.
- Unset optional parameters are not shown.
- Required parameters that are unset: "[Label]: Required" in error color.
- [✕] removes the clause (Modal M1 if 2+ clauses exist).
- Clicking the chip body reopens S3 pre-populated.

**Composition mode selector (visible when 2+ clauses present):**
```
  Combine these conditions as:
  ● All must match
  ○ Any can match
  ○ Chained search  (visible only when targetToSubject join is possible)
```
- "All must match" = sequential/subjectToSubject (RPM §24.2 Mode 1)
- "Any can match" = parallel (RPM §24.2 Mode 2)
- "Chained search" = targetToSubject/nested (RPM §24.2 Mode 3) — shown only when applicable; never shown disabled
- Default: "All must match"
- Helper text below selector: "Not sure? Start with 'All must match' — you can change it before running your search."

**"Add another condition" button:** Label: "+ Add another condition". Below the last chip. On click: focuses the sidebar search field.

**"Review query" button:** In query summary bar. Disabled until at least one clause has all required fields filled. Label: "Review query →"

### 7.5 Query Summary Bar

Sticky at top of content area, visible from S2 onward.
```
┌──────────────────────────────────────────────────────────────────┐
│  Person records  ·  [Change]    2 conditions, all must match     [Review query →] │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Screen 3 — Intent Detail Panel

### 8.1 Purpose

The SME configures a single intent: reads its plain-language description, fills in the auto-generated input fields, and adds the clause to the query. Curators additionally see a label edit affordance.

### 8.2 Layout

The panel slides in from the right column at desktop. Overlays the sidebar at tablet. Full-screen view at mobile.

```
┌──────────────────────────────────────────────────────┐
│  [← Back to conditions]                        [✕]  │
│  ────────────────────────────────────────────────    │
│  [GROUP NAME — muted all-caps]         [✏ Curator]  │ ← edit icon, Curator only
│  Employed by                                         │ ← ui.label, H2
│  ────────────────────────────────────────────────    │
│  Find the organization that employs this person.     │ ← ui.description
│                                                      │
│  Example questions           ▼ (collapsible)         │
│  · Who employs Jane Smith?                           │
│  · What company does this agent work for?            │
│  ────────────────────────────────────────────────    │
│  Configure this condition                            │
│                                                      │
│  Filter by employer (optional)                       │
│  [Search for an organization...                 ]    │
│                                                      │
│  ────────────────────────────────────────────────    │
│  What this search returns ▼ (collapsed by default)   │
│  · Employer — The organization employing this person │
│  ────────────────────────────────────────────────    │
│  [ Add to query ]                                    │
│  [ Cancel       ]                                    │
└──────────────────────────────────────────────────────┘
```

### 8.3 Panel Header

- Back link: "← Back to conditions"
- Close button [✕]: same behavior
- Group label: `ui.group` value, muted text, all-caps small label
- Intent title: `ui.label`, H2
- Edit icon [✏]: visible to `curator` role only, positioned right-aligned beside the intent title. Tooltip: "Edit label". On click: opens Modal M4 (Label Override Modal). Never visible to `sme` role.
- Divider below title row

### 8.4 Description and Examples

**Description:** `ui.description`, body text. If `ui.description` is empty (auto-generated mapping with no `rdfs:comment`), this area is hidden rather than showing a blank line or placeholder.

**Example questions:**
- Collapsible. Default: expanded on first open, remembered per session.
- Content: `ui.examples` strings as a bulleted list.
- If `ui.examples` is empty (common for auto-generated mappings without static overrides), the section is hidden entirely. The absence of examples is not an error — it is the expected state for a freshly discovered intent.
- No more than 3 shown without a "Show more" link.

### 8.5 Input Parameter Fields

All fields are generated from `ui.inputParameters`. The `inputType` for each field was inferred by Control Inference (RPM §31.2) — there is no manual declaration. The UI renders each field according to the table below, which reflects RPM §31.2 exactly.

**Section heading:** "Configure this condition"

**Field label:** `inputParameter.label`
- Append "(optional)" in muted text if `required: false`
- No asterisk for required fields

**Rendering by `inputType`:**

| `inputType` | Rendered as | Notes |
|---|---|---|
| `text` | Single-line text input | Placeholder = `inputParameter.hint` |
| `number` | Numeric text input + comparison operator dropdown | Operator dropdown (see §18.3). Unit label from `inputParameter.unit` to the right. Never a slider. |
| `date` | Date picker | Locale display format. ISO 8601 internal. |
| `dateRange` | Two date pickers (From / To) | Inclusive. "To" cannot precede "From". |
| `entitySearch` | Autocomplete field | Live SPARQL query — always current data. Spinner after 250ms. Dropdown max 8 items: label (bold) + type (muted). Selection fills with entity label, never IRI. |
| `select` | Dropdown | Options from `selectOptions`, displayed verbatim. |
| `boolean` | Radio group | Labels: "Yes" / "No" only. Never true/false, 1/0. |

**Number input — operator dropdown:** Placed immediately left of the numeric input. Options rendered from `filterOp` values via the plain-language table in §18.3. The dropdown and the numeric input are a single visually unified field group — they must not appear as separate unrelated controls.

**Hint text:** `inputParameter.hint` is shown as placeholder text within the field. If longer than fits as a placeholder, displayed as a line of help text below the field in muted style. Hints are sourced from `rdfs:comment` or `skos:definition` (RPM §30.6). If no hint source exists, the field is rendered without helper text — absence is preferable to a fabricated hint.

**Inline validation errors:** Below the relevant field, on blur. Error color text. Copy from `TranslatedError.userMessage` (RPM §25). See §19.

### 8.6 Output Binds Section

Below input fields. Collapsed by default.

```
  What this search returns  ▼
  ──────────────────────────
  · Employer — The organization employing this person
```

Shows `outputBind.label` and `outputBind.description` for each bind in the mapping. Hidden if no `outputBinds` exist.

### 8.7 Action Buttons

**"Add to query" (primary):**
- Enabled when all `required: true` fields have valid values.
- On click: clause added, panel closes, focus returns to canvas.
- When editing an existing clause: label is "Update condition".

**"Cancel" (secondary):**
- Closes without saving. Discards changes if editing.
- Returns focus to sidebar or canvas.

---

## 9. Screen 4 — Query Review and Submit

### 9.1 Purpose

Plain-language query summary before execution. Last edit point before results are fetched.

### 9.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [App Header]                                                │
├──────────────────────────────────────────────────────────────┤
│  ← Back to editing                                           │
│                                                              │
│  Review your search                                          │
│  ──────────────────────────────────────────────              │
│                                                              │
│  Searching for: Person records                               │
│  Conditions:    All must match                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  1  Employed by: Acme Corp                  [Edit]   │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  2  Legal name contains: Smith              [Edit]   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  This search will return:                                    │
│  · Employer — The organization employing this person         │
│  · Legal name — The officially registered name               │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│  [ Run search ]                                  [← Edit]    │
└──────────────────────────────────────────────────────────────┘
```

### 9.3 Component Specifications

**Back link:** "← Back to editing" — returns to S2 preserving query state.

**Page heading:** "Review your search" — H1.

**Query summary block:**
- "Searching for:" + `ui.subjectLabel` in bold
- "Conditions:" + composition mode plain label

**Clause list:** Numbered, one row per clause. Intent label + filled parameter summary. [Edit] link per row. Read-only. Chained search shows directional arrow between items.

**"This search will return" section:** Unique `outputBind.label` values across all clauses, deduplicated. Heading: "This search will return:"

**"Run search" (primary):** Full-width at mobile, right-aligned at desktop. On click: enters loading state ("Searching…"), navigates to S5 on success.

**"← Edit" (secondary):** Returns to S2.

---

## 10. Screen 5 — Results View

### 10.1 Purpose

Displays the result set with NarrativeSummary per row. Columns correspond to `outputBind.label` values. SME can sort, export, and return to refine.

### 10.2 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  [App Header]                                                    │
├──────────────────────────────────────────────────────────────────┤
│  ← Refine search    [N] results for Person records               │
│                     All conditions matched · [View conditions]   │
├──────────────────────────────────────────────────────────────────┤
│  [Export ▾]  [Sort by ▾]                               [Search]  │
├──────────────────────────────────────────────────────────────────┤
│  #  │  Employer        │  Legal Name       │  [more cols]        │
│  ─  │  ────────────    │  ────────────     │                     │
│  1  │  Acme Corp       │  Smith, Jane      │                     │
│     │  Jane Smith is employed by Acme Corp via Employment.       │  ← NarrativeSummary
│     │  [Show path ▼]                                             │  ← Disclosure toggle
│  2  │  Acme Corp       │  Smith, Robert    │                     │
│     │  Robert Smith is employed by Acme Corp via Employment.     │
│     │  [Show path ▼]                                             │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 NarrativeSummary

Every result row displays a `NarrativeSummary` (RPM §34.2) as a subtitle rendered beneath the row's primary identifier.

**Rendering:**
- Font: `text-body-sm`, `neutral-600`, italic
- Position: spans the full row width, below the data cells, above the "Show path" toggle
- Must never contain: IRIs, namespace prefixes, blank node IDs, class names, tier values, shorthand values, or any term from the Section 26 prohibited list
- Always ends with a period
- Maximum display length: 2 lines. If longer, truncate with "…" and a "Show full explanation" link that expands inline

**Truncated narrative (Firewall enforcement case):**
When RPM §34.4 has omitted a clause from the narrative because no label was resolvable, the summary is shorter than expected. The UI treats this silently for `sme` role users: a shorter sentence is shown with no indicator of truncation.

For `curator` role users only: a small muted tag "Partial path" appears at the end of the sentence. This tag contains no technical detail — it simply signals to the Curator that the Narrative Generator omitted one or more intermediate nodes. Hovering the tag shows a tooltip: "Some path details could not be labeled. Edit the label using the search panel to improve this description." No IRI, error code, or internal identifier appears in the tooltip.

### 10.4 "Show Path" Toggle

Below the NarrativeSummary on each row. Label: "Show path ▼" / "Hide path ▲".

When expanded, renders the `narrativePath` array as a breadcrumb strip:

```
Chemical Process  →  Has Catalyst  →  Palladium
```

- Each node and edge shows its resolved label only
- No IRIs, class names, blank node IDs, or role values are shown
- Intermediate nodes (Tier 3 compound path hops) are included in the strip
- If an intermediate node has no resolved label, it is omitted from the strip without a gap marker
- The strip is horizontally scrollable on narrow viewports

**Accessible label:** `aria-label="Path that produced this result"` on the breadcrumb container.

### 10.5 Results Table

**Columns:** `outputBind.label` values, in clause order. Row number always first.

**Column widths:** Auto, minimum 120px. Horizontally scrollable when total width exceeds viewport.

**Sorting:** Click header for ascending, again for descending, again for unsorted. Sort indicator: ▲ / ▼. No icon = unsorted.

**Row hover:** Light background highlight.

**Pagination:** Default 25 rows. Size selector: 10, 25, 50, 100. First and last page always shown in pagination controls.

**Export:** Dropdown: "Export as CSV", "Export as Excel", "Copy to clipboard". Exports all results, not just current page. Shows "Preparing your file…" toast for large sets.

**Empty state:**
```
  [search icon]
  No records matched your search.

  This could mean:
  · No records meet all your conditions.
  · Try changing "All must match" to "Any can match".
  · Try broadening one of your conditions.

  [ ← Refine search ]
```

**Loading state:** Skeleton loader rows with shimmer. Results bar shows "Searching…". If no response after 30 seconds: Modal M3.

---

## 11. Curator Tools

Curator tools are accessible only to users with the `curator` role. SME-role users do not see these affordances. Curator tools must never expose internal identifiers, IRIs, or technical metadata to the Curator.

### 11.1 Settings Panel (P1)

Accessed via a gear icon [⚙] in the application header, visible to `curator` role only. Opens as a right-side drawer (320px wide). Contains:

- Schema Refresh control (§11.2)
- Link to Override History (§11.3)
- Display of last crawl timestamp ("Search options last updated: [date/time]")
- No technical content: no endpoint URL, no tier counts, no frequency scores

**Header gear icon:**
- Visible: `curator` role
- Hidden: `sme` role (no gear icon, no affordance, no disabled state)
- Tooltip: "Curator settings"
- Keyboard: focusable, Enter or Space opens the panel

### 11.2 Schema Refresh

Located in the Settings Panel (P1), not in the application header. A full button in the header would give visual weight to an administrative function that SMEs never use and Curators use infrequently.

**Control:**
```
Refresh search options
Search types were last updated [date/time].
[Refresh now]
```

**Behavior on click:**
1. Button enters loading state. Label: "Updating…". Disabled.
2. Progress note appears below: "Scanning the data source for new search types…"
3. On success: success notification (green banner): "Search options updated. [N] new search types added." Auto-dismisses after 8 seconds.
4. On failure: error banner: "The data source could not be reached. Please check the connection and try again." (Maps to `CRAWL_ENDPOINT_UNREACHABLE` — RPM §25.2.)
5. Timestamp below the button updates to the current time.

**Important distinction (copy in the settings panel):**
A help text paragraph appears permanently below the Refresh control:

> "Refreshing updates the available search types. Individual records are always current — new items added to the database appear in search results immediately without refreshing."

This copy addresses the SME expectation gap identified in RPM v2.1 §32.9.1 and prevents Curators from triggering unnecessary re-crawls to see new records.

### 11.3 Label Override History

Accessible from the Settings Panel via a "View overrides" link. Shows a list of all active overrides from `GET /rpm/overrides`:

```
  Active label overrides  [N]
  ────────────────────────────────────────────────────
  Has Catalyst → Catalyst Agent       [Revert]
  Employment → Job History            [Revert]
```

- Each row: original auto-generated label → current label + Revert button
- Does not show: `shorthand` IRI, `overrideId`, `appliesTo`, `createdAt`, `createdBy`
- [Revert] calls `DELETE /rpm/overrides/{overrideId}` and removes the row on success
- Empty state: "No label overrides have been set. Labels shown to users are auto-generated from the data."

### 11.4 Label Override Modal (M4)

Triggered from the edit icon [✏] in the Intent Detail Panel header (§8.3). Opens as a modal, 480px wide.

**Layout:**
```
┌────────────────────────────────────────────────────┐
│  Edit label                                   [✕]  │
│  ──────────────────────────────────────────────    │
│  You are editing the display name for:             │
│  "Has Catalyst"  (Chemical Process)                │
│                                                    │
│  Label                                             │
│  [Catalyst Agent                              ]    │
│                                                    │
│  Description (optional)                            │
│  [The chemical agent that initiates or ...   ]     │
│                                                    │
│  Group (optional)                                  │
│  [Chemical Process                            ]    │
│                                                    │
│  ──────────────────────────────────────────────    │
│  [ Save changes ]        [ Cancel ]                │
│                                                    │
│  [Revert to original label]  ← shown only when     │
│   an existing override is active for this intent   │
└────────────────────────────────────────────────────┘
```

**Fields:**
- **Label** (required): pre-populated with current `ui.label`. Must not be empty on save. Max 80 characters.
- **Description** (optional): pre-populated with current `ui.description`. May be left empty.
- **Group** (optional): pre-populated with current `ui.group`. Changing this moves the intent to a different group in the catalog.
- The `shorthand` IRI, `overrideId`, `appliesTo`, or any internal field must not appear in the modal. The Curator works with plain-language presentation fields only.

**"Save changes" (primary):**
- Calls `POST /rpm/overrides` (RPM §35.4)
- On success: modal closes, intent label updates in place within 5 seconds without a full re-crawl (`catalogRebuilt: true` response from engine — RPM §35.5). A brief toast: "Label updated. Changes are live for all users."
- On failure: inline error below the Save button: "The label could not be saved. Please try again or contact your system administrator."

**"Cancel" (secondary):** Closes modal, no changes.

**"Revert to original label" (destructive, text link):**
- Visible only when an existing override is active for this intent. Hidden if no override exists.
- On click: confirmation prompt inline (not a new modal): "This will restore the auto-generated label '[original label]'. Are you sure?" with "Restore" and "Cancel" inline buttons.
- On confirm: calls `DELETE /rpm/overrides/{overrideId}` (RPM §35.4). Modal closes. Intent label reverts. Toast: "Label restored to original."
- The "original label" shown in the confirmation is the pre-override `ui.label` from the discovered registry, retrieved from the engine before the modal opens.

**Partial catalog rebuild feedback:**
After Save or Revert, the intent's entry in the sidebar updates in place within 5 seconds. If the rebuild takes longer than 5 seconds (`catalogRebuilt: false` response), a spinner appears on the intent row in the sidebar with a tooltip "Updating…" and disappears when the rebuild completes.

---

## 12. Component Library

### 12.1 Button Variants

| Variant | Usage | States |
|---|---|---|
| Primary | Main action per screen (Run search, Add to query, Save changes) | Default, Hover, Active, Loading, Disabled |
| Secondary | Supporting actions (Cancel, Back) | Default, Hover, Active, Disabled |
| Destructive | Revert to original (text link style, not filled) | Default, Hover, Active |
| Ghost | In-table actions (Edit), low-priority links | Default, Hover, Active, Disabled |
| Icon-only | Close [✕], expand/collapse, edit [✏], gear [⚙] | Default, Hover, Active, Disabled |

### 12.2 Input Field States

| State | Visual |
|---|---|
| Default | Border: 1px solid `neutral-300`. Background: white. |
| Focus | Border: 2px solid `accent-500`. Subtle box shadow. |
| Filled | Border: 1px solid `neutral-400`. |
| Error | Border: 2px solid `error-500`. Error message below. |
| Disabled | Background: `neutral-100`. Text: `neutral-400`. |
| Read-only | Background: `neutral-50`. No border change. |

### 12.3 Number Input Group

The number input type is a unified field group consisting of a comparison operator dropdown + numeric text input + optional unit label. These three elements must be visually grouped (same row, shared border or consistent alignment).

```
[ is greater than  ▾ ] [ 5.0   ] [ kg ]
```

- Operator dropdown width: auto, minimum 120px
- Numeric input width: minimum 80px
- Unit label: plain text, `neutral-600`, no border
- This is never a slider. A slider implies known min/max bounds; the engine does not infer bounds from XSD types alone.

### 12.4 Narrative Summary Row

Each result row has two sub-rows: the data cells row and the narrative row.

```
│  #  │  Employer    │  Legal Name    │
│  1  │  Acme Corp   │  Smith, Jane   │
│     │  Jane Smith is employed by Acme Corp via Employment.   [Show path ▼]  │
```

The narrative sub-row spans all columns. Font: `text-body-sm`, italic, `neutral-600`. "Show path" toggle aligns right within the row.

### 12.5 Breadcrumb Path Strip

Rendered when "Show path" is expanded.

```
Chemical Process  →  Has Catalyst  →  Palladium
```

- Each segment: `text-body-sm`, `neutral-700`, pill background `neutral-100`
- Arrow separator: `→`, `neutral-400`
- Horizontally scrollable on narrow viewports, no text wrapping
- Maximum segments displayed: 8; additional segments collapsed with "… [N more]" which expands on click

### 12.6 "Auto" Badge

Optional small badge for Curator-role views indicating an auto-generated label.

- Dimensions: height 16px, min-width 32px
- Text: "auto", `text-caption`, `neutral-500`
- Background: `neutral-100`, border: 1px solid `neutral-200`, `radius-sm`
- Position: right-aligned within the intent list item row
- Invisible to `sme` role. Never displays internal values.

### 12.7 Clause Chip States

| State | Visual |
|---|---|
| Complete | White background, neutral border, full opacity |
| Incomplete (required field missing) | Warning-tinted border, warning icon |
| Selected (panel open) | Accent-tinted border, subtle fill |
| Hover | Slight elevation |

---

## 13. Interaction and Behavior

### 13.1 Subject Type Selection Flow

1. SME lands on S1. No type selected.
2. SME selects a card. Continue activates.
3. Continue navigates to S2. Intent Catalog filters.
4. [Change] in summary bar: if no clauses, return to S1. If clauses exist: Modal M2.

### 13.2 Adding a Clause

1. SME clicks an intent (from either "Common questions" strip or full catalog).
2. Intent Detail Panel slides in.
3. SME reads description.
4. SME fills in input parameters (all rendered by Control Inference).
5. "Add to query" activates when all required fields are filled.
6. Clause chip appears in canvas. Panel closes. Focus returns to canvas.

### 13.3 Editing a Clause

1. SME clicks the clause chip body.
2. Panel opens pre-populated.
3. "Update condition" replaces "Add to query".
4. Save updates the chip in place.

### 13.4 Removing a Clause

1. SME clicks [✕] on a chip.
2. Single clause: removed immediately.
3. Two or more: Modal M1.
4. On confirm: removed. Composition selector re-evaluates.

### 13.5 Composition Mode — Chained Search Rendering

When "Chained search" is selected, the canvas shows directional flow:

```
  ┌─────────────────────────────────────────────┐
  │  1  Legal name contains: Smith       [Edit] │
  └───────────────────┬─────────────────────────┘
                      │  whose employer is →
                      ▼
  ┌─────────────────────────────────────────────┐
  │  2  Employed by: [any employer]      [Edit] │
  └─────────────────────────────────────────────┘
```

The connector label derives from `fromRole`'s `outputBind.description` and `toClause`'s subject label. Not hardcoded.

### 13.6 Entity Search Freshness

Entity search always queries the live SPARQL endpoint. New instances added to the graph appear immediately without any refresh. The UI must never cache entity search results. See RPM §32.9.4.

### 13.7 Intent Search Behavior

- Debounce: 150ms
- Matches `ui.label`, first 80 chars of `ui.description`, `ui.examples` strings
- Ranked: exact label > description > examples
- Minimum query length: 1 character

### 13.8 Label Override Propagation

After a Curator saves a label override or reverts one, the new label appears in the sidebar and the Intent Detail Panel header within 5 seconds (partial catalog rebuild, RPM §35.5). No page reload is required. If the SME currently has that intent's panel open, the panel header updates in place without closing.

### 13.9 Navigation Guards

If the SME navigates away from S2 with unsaved panel changes: "You have unsaved changes to this condition. Discard them?" — options "Keep editing" and "Discard changes". Browser back button is intercepted on all screens beyond S1.

---

## 14. Motion and Transitions

### 14.1 Governing Principle

Motion communicates state change, not decoration. Every animation must have a functional purpose.

### 14.2 Duration Scale

| Token | Duration | Usage |
|---|---|---|
| `motion-instant` | 0ms | Color/opacity on hover |
| `motion-fast` | 100ms | Button active state |
| `motion-standard` | 200ms | Dropdown open, tooltip appear |
| `motion-enter` | 250ms | Panel slide-in, modal appear |
| `motion-exit` | 180ms | Panel slide-out, modal dismiss |
| `motion-page` | 300ms | Screen transitions |

### 14.3 Easing Functions

| Token | Curve | Usage |
|---|---|---|
| `ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Most transitions |
| `ease-enter` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering screen |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving screen |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Clause chip appear |

### 14.4 Specific Transitions

**Intent Detail Panel:** Enter: `translateX(100%) → translateX(0)`, `motion-enter`, `ease-enter`. Exit: reverse, `motion-exit`, `ease-exit`.

**Clause chip appear:** `opacity: 0 → 1`, `scale: 0.95 → 1`, `motion-standard`, `ease-spring`.

**Clause chip remove:** `opacity: 1 → 0`, height collapse, `motion-exit`, `ease-exit`.

**Settings panel:** Enter: `translateX(100%) → translateX(0)`, `motion-enter`. Backdrop: `opacity: 0 → 0.4`.

**Modals (M1–M4):** Backdrop `opacity: 0 → 0.5`. Modal `opacity: 0 → 1`, `scale: 0.96 → 1`, `motion-enter`.

**Narrative row appear:** Fade in below data row: `opacity: 0 → 1`, `motion-standard`, 50ms delay after row appears.

**Loading → Results (S4 → S5):** Skeleton fades out. Table rows stagger in: 30ms delay × row index, capped at 10 rows.

**Reduce Motion:** All transitions respect `prefers-reduced-motion`. Durations become `motion-instant`, transforms removed. Opacity fades retained.

---

## 15. Visual Design Standards

### 15.1 Design Language

**Utilitarian clarity.** Clean, structured, unhurried. The UI earns confidence through reliability. Visual interest comes from information density and clear hierarchy.

Deliberately avoids: heavy shadows, gradient fills on interactive elements, rounded corners beyond 8px, decorative illustrations, visual elements that compete with intent labels and descriptions for attention.

### 15.2 Elevation Model

| Level | Usage | Shadow |
|---|---|---|
| Level 0 | Default surfaces | None |
| Level 1 | Hover cards, tooltips, dropdowns | `0 2px 8px rgba(0,0,0,0.10)` |
| Level 2 | Panels, modals, settings drawer | `0 8px 24px rgba(0,0,0,0.14)` |

### 15.3 Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 3px | Input fields, small badges, "auto" badge |
| `radius-md` | 6px | Buttons, cards, clause chips |
| `radius-lg` | 10px | Panels, modals, settings drawer |
| `radius-full` | 9999px | Toggle switches, spinner |

---

## 16. Typography

### 16.1 Font Families

| Role | Family | Fallback |
|---|---|---|
| Display (H1–H2) | `IBM Plex Serif` | Georgia, serif |
| UI (labels, body, inputs) | `IBM Plex Sans` | system-ui, sans-serif |
| Mono (admin/debug only — never SME-facing) | `IBM Plex Mono` | Consolas, monospace |

### 16.2 Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `text-display` | 28px | 400 | 36px | S1 page heading |
| `text-h1` | 24px | 600 | 32px | Screen headings |
| `text-h2` | 20px | 600 | 28px | Panel headings |
| `text-h3` | 16px | 600 | 24px | Section headings |
| `text-body` | 15px | 400 | 24px | Descriptions, body |
| `text-body-sm` | 13px | 400 | 20px | Help text, narrative summary, muted labels |
| `text-label` | 13px | 500 | 20px | Field labels, group headings |
| `text-caption` | 12px | 400 | 16px | Counts, timestamps, "auto" badge |
| `text-button` | 14px | 500 | 20px | Button text |
| `text-input` | 15px | 400 | 24px | Input values |

Monospace font is for developer/admin consoles only. It must never appear in any SME-facing surface.

---

## 17. Color System

### 17.1 Palette

**Neutral**

| Token | Hex | Usage |
|---|---|---|
| `neutral-0` | `#FFFFFF` | White surfaces |
| `neutral-50` | `#F8F9FA` | Page background, read-only fields |
| `neutral-100` | `#F1F3F5` | Hover backgrounds, "auto" badge fill, breadcrumb pills |
| `neutral-200` | `#E9ECEF` | Dividers, "auto" badge border |
| `neutral-300` | `#DEE2E6` | Input borders (default) |
| `neutral-400` | `#CED4DA` | Input borders (filled), arrows, separators |
| `neutral-500` | `#ADB5BD` | Muted text, "auto" badge text |
| `neutral-600` | `#6C757D` | Secondary text, narrative summary |
| `neutral-700` | `#495057` | Field labels, breadcrumb text |
| `neutral-800` | `#343A40` | Body text |
| `neutral-900` | `#212529` | Primary text, headings |

**Accent (primary action)**

| Token | Hex | Usage |
|---|---|---|
| `accent-50` | `#EFF6FF` | Selected chip background |
| `accent-100` | `#DBEAFE` | Active item background |
| `accent-500` | `#3B82F6` | Primary button, focus ring, left-accent bar |
| `accent-600` | `#2563EB` | Primary button hover |
| `accent-700` | `#1D4ED8` | Primary button active |

**Semantic**

| Token | Hex | Usage |
|---|---|---|
| `error-50` | `#FEF2F2` | Error field background |
| `error-500` | `#EF4444` | Error border, icon |
| `error-600` | `#DC2626` | Error text |
| `success-500` | `#22C55E` | Success toast icon |
| `success-700` | `#15803D` | Success text |
| `warning-400` | `#FACC15` | Incomplete clause indicator |
| `warning-700` | `#A16207` | Warning text |
| `curator-50` | `#F0FDF4` | Curator-only tool backgrounds (subtle green tint to distinguish) |
| `curator-600` | `#16A34A` | Curator-only control accents |

The `curator-*` tokens are used for the settings panel header and the [✏] edit icon to provide a subtle visual cue that these controls operate in a different capability tier. They must never be used on SME-facing surfaces.

### 17.2 Color Contrast

All text-on-background combinations meet WCAG 2.1 AA minimum (4.5:1 normal text, 3:1 large text). Focus indicators: `2px solid accent-500`, `outline-offset: 2px`. Never `outline: none` without a custom replacement.

---

## 18. Content and Messaging

### 18.1 Voice and Tone

Direct, plain, calm. The application assumes the SME is competent in their domain and unfamiliar with graph structure — and treats both facts neutrally. Active voice. Positive framing. No "please" as filler. No exclamation points. Error messages name what went wrong and what to do, in that order.

### 18.2 Auto-Generation Transparency

The UI acknowledges, without apologizing, that its menus were generated from the data. When the SME first lands on S2, a one-time dismissible note appears:

> "Search options were automatically discovered from your data source. If a search type is missing or named incorrectly, contact a Curator."

This note must not use the words "ontology", "graph", "predicate", "schema", "Tier", "crawl", or "IRI". It disappears after one dismissal and does not reappear.

### 18.3 Filter Operator Plain-Language Labels

Operators are rendered from `filterOp` tokens (RPM §22.6). The following translations are required for all number and date input types.

| `filterOp` token | Number display | Date display |
|---|---|---|
| `eq` | "is exactly" | "is exactly" |
| `contains` | (text only) | — |
| `startsWith` | (text only) | — |
| `gt` | "is greater than" | "is after" |
| `lt` | "is less than" | "is before" |
| `range` | "is between" | "is between" |

### 18.4 Composition Mode Labels

| RPM mode | UI label | Supporting copy |
|---|---|---|
| sequential / subjectToSubject | "All must match" | "Only records meeting every condition appear in results." |
| parallel | "Any can match" | "Records meeting at least one condition appear in results." |
| sequential / targetToSubject | "Chained search" | "The result of the first condition becomes the subject of the second." |

### 18.5 Standard UI Copy by Screen

**S1:** Heading: "What type of record are you looking for?" Continue: "Find [Subject Type] records →"

**S2 empty:** "Start building your search. Select a condition type from the left panel to begin."

**S2 helper text (mode selector):** "Not sure? Start with 'All must match' — you can change it before running your search."

**S2 discovery strip heading:** "★ Common questions"

**S2 full catalog heading:** "All search options"

**S3 configure heading:** "Configure this condition"

**S3 output binds heading:** "What this search returns"

**S4 heading:** "Review your search"

**S5 results bar:** "[N] results for [Subject Type] records"

**S5 show path:** "Show path ▼" / "Hide path ▲"

**S5 partial path tag (Curator only):** "Partial path"

**S5 partial path tooltip (Curator only):** "Some path details could not be labeled. Edit the label using the search panel to improve this description."

**P1 refresh help text:** "Refreshing updates the available search types. Individual records are always current — new items added to the database appear in search results immediately without refreshing."

---

## 19. Error Handling and System Feedback

### 19.1 Error Classification

**Validation errors** (`severity: "validation"`, `placement: "inline"` — RPM §25.1): Caused by SME input. Rendered adjacent to the relevant field. Tone invites correction. Never use the word "invalid" or "error" in the message.

**System errors** (`severity: "system"`, `placement: "banner"`): Caused by configuration or infrastructure. Rendered as a banner or Modal M3. SME directed to an administrator. Never ask the SME to retry.

### 19.2 Inline Validation

Appears immediately below the relevant field on blur. Disappears when the field value changes. Format:

```
[Field label — error border]
[Error message text in error-600]
```

Message text = `TranslatedError.userMessage` (RPM §25.2). Contains no error codes, IRIs, or class names.

### 19.3 Banner Notifications

At top of content zone, below query summary bar. Dismissible [×]. Does not auto-dismiss.

```
┌────────────────────────────────────────────────────────────┐
│  [icon]  [userMessage]                          [Dismiss]  │
└────────────────────────────────────────────────────────────┘
```

Background: `warning-50` or `error-50` per `severity`.

### 19.4 Modal M3 — System Error

```
┌─────────────────────────────────────────────────────┐
│  [error icon — 32px]                                │
│  Something went wrong                               │
│  [userMessage]                                      │
│  [Contact your administrator]  [← Return to search] │
└─────────────────────────────────────────────────────┘
```

"Contact your administrator" opens the configured support link. "Return to search" returns to S2 without clearing the query.

### 19.5 Success Feedback

**Clause added:** The clause chip appears. No toast needed.

**Clause updated:** Chip updates in place.

**Label override saved:** Toast: "Label updated. Changes are live for all users." Auto-dismisses 5 seconds.

**Label reverted:** Toast: "Label restored to original." Auto-dismisses 5 seconds.

**Schema refresh complete:** Success banner in settings panel: "Search options updated. [N] new search types added." Auto-dismisses 8 seconds.

**Export ready:** Toast: "Your file is ready." with download link. Auto-dismisses 5 seconds. For large exports: "Preparing your file…" until ready.

### 19.6 Loading States

| Context | Treatment |
|---|---|
| Entity search autocomplete | Spinner inside field (trailing) |
| Intent catalog loading (S2 initial) | 3 skeleton intent rows per group |
| Query executing (S4 → S5) | Button loading state → S5 skeleton |
| Results table paginating | Skeleton rows |
| Schema refresh in progress | Button loading state in settings panel |
| Label override saving | Button loading state in M4 |
| Partial catalog rebuild | Spinner on affected intent row in sidebar |

Skeleton loaders use CSS shimmer animation (gradient left to right). Base: `neutral-100`. Shimmer: `neutral-50`. Duration: 1.4s loop.

---

## 20. Compliance Test Reference

This section maps the UI specification to the relevant canonical tests from RPM v2.1 Section 33. The UI is responsible for surface-level compliance; the engine is responsible for algorithmic compliance. Tests marked "UI + Engine" require both layers to be validated together.

| Test ID | Name | What the UI Must Verify | Responsibility |
|---|---|---|---|
| CT-01 | SME Blind Test | No IRI, namespace prefix, blank node ID, tier value, frequency score, shorthand, `overrideId`, or `labelSource` appears in any SME-facing rendered output including narrative summaries and breadcrumb labels. | UI + Engine |
| CT-08 | Labeling Law Priority | Intent list shows `skos:prefLabel` value ("Catalyst") not `rdfs:label` value ("Catalytic Agent") when both are present. | Engine (UI is consumer) |
| CT-09 | IRI Cleaning and Quality Threshold | "Tank 01" appears as a valid intent label. "BFO 0000023" does not appear — its mapping is `internal` and excluded from the catalog. "ID 4421" appears as a valid intent label. | Engine (UI is consumer) |
| CT-10 | Control Inference Table | `xsd:decimal` range renders a **numeric text input paired with a comparison operator dropdown**, not a slider. `xsd:dateTime` renders a date picker. ObjectProperty renders entity search autocomplete. | UI + Engine |
| CT-13 | Quality Threshold Boundary | `TANK_01` → "Tank 01" passes threshold and appears in catalog. `BFO_0000023` is suppressed. | Engine (UI is consumer) |
| CT-14 | Narrative Integrity | NarrativeSummary for each result row contains subject label, predicate/verb form, and object label. No IRI, namespace prefix, class name, or prohibited term appears in any narrative field or breadcrumb segment. | UI + Engine |
| CT-15 | Override Persistence | A Curator's label change via M4 appears in the sidebar within 5 seconds without a page reload. The change survives a process restart and re-crawl. | UI + Engine |

**Notes on CT-10 correction from v2.0:** The v2.0 spec incorrectly described the number input as a "slider." RPM v2.1 §31.2 specifies `inputType: "number"` as a numeric text input with an adjacent operator dropdown. A slider implies known min/max bounds, which the Control Inference engine does not infer from XSD types. The CT-10 pass criterion is corrected accordingly.

**Reference only (not UI-primary):** CT-02 (hash stability), CT-03 (closure integrity), CT-04 (mode invariance), CT-05 (specificity ranking), CT-06 (partial mode guard), CT-07 (translation interception), CT-11 (frequent path discovery), CT-12 (dynamic error template) are engine-side tests. UI teams do not need to implement these directly but should be aware of what the engine guarantees they can consume.

---

## 21. Accessibility

### 21.1 Standard

WCAG 2.1 Level AA required for all screens. Level AAA targeted for core flows (S1 through S4).

### 21.2 Keyboard Navigation

All interactive elements reachable by keyboard. Tab order follows visual reading order (left-to-right, top-to-bottom).

**Focus trapping:**
- Intent Detail Panel (S3): traps focus when open. Tab cycles through panel only. Escape or back/close releases trap and returns focus to the triggering element.
- Modals (M1–M4): trap focus. Escape closes M1–M3. M4 requires an explicit button action.
- Settings Panel (P1): traps focus when open. Escape closes.

**Keyboard shortcuts (Level AAA, optional):**

| Shortcut | Action |
|---|---|
| `/` | Focus the intent search field |
| Escape | Close open panel, modal, or settings panel |
| Enter on intent list item | Open Intent Detail Panel |
| Enter on clause chip | Open clause for editing |

Shortcuts must not conflict with screen reader shortcuts. Discoverable via keyboard reference (help icon in header).

### 21.3 Screen Reader Support

- All icons: `aria-label` or `aria-hidden="true"` (decorative only).
- [✕] close: `aria-label="Close"`.
- [✏] edit: `aria-label="Edit label"`.
- [⚙] settings: `aria-label="Curator settings"`.
- Intent Detail Panel: `role="dialog"`, `aria-labelledby` → intent title.
- Modals M1–M4: `role="alertdialog"`.
- Settings Panel P1: `role="dialog"`, `aria-labelledby` → "Curator settings".
- Intent list: `role="list"`, items `role="listitem"`.
- Composition mode: `role="radiogroup"`, `aria-labelledby`.
- Inline errors: linked to inputs via `aria-describedby`.
- Loading states: announced via `aria-live="polite"`.
- Results table: `role="table"`, `scope` on headers.
- Clause chips: `role="button"`, keyboard-operable.
- NarrativeSummary: rendered as a `<p>` element within the result row. Does not require additional ARIA; it is standard paragraph text.
- Breadcrumb path: `aria-label="Path that produced this result"` on container.
- "Partial path" tag (Curator): `aria-label="Partial path — some intermediate nodes could not be labeled"`.

### 21.4 Color Independence

No information conveyed by color alone. Each semantic use of color is accompanied by a text label, icon, or shape change. Error state: red border + error message text. Curator-only surface: curator color + "Curator" label in header.

### 21.5 Text Sizing

Fully functional at 200% browser zoom. No content loss from truncation at 200%.

---

## 22. Responsive Behavior

### 22.1 Desktop (≥ 1024px)

Three-column layout. All features available. Panel and settings drawer slide in from right.

### 22.2 Tablet (768px–1023px)

Two-column layout. Sidebar visible. Detail panel and settings drawer overlay the canvas. "Common questions" strip visible in sidebar. Composition mode selector moves below clause list.

### 22.3 Mobile (< 768px)

Single-column layout.
- S1: 2-column card grid
- S2: Sidebar collapses to bottom sheet triggered by "Browse conditions" button. "Common questions" appears at top of the bottom sheet.
- S3: Full-screen modal with back navigation.
- S4: Stacked vertically.
- S5: Horizontal scroll on table. Results bar and pagination sticky at bottom.

Minimum touch target: 44px × 44px (WCAG 2.5.5).

### 22.4 Feature Parity

All features available at desktop must be available at mobile. Curator tools (settings panel, edit label) must be accessible at all breakpoints. The settings panel becomes a full-screen modal at mobile.

---

## 23. Platform Constraints

### 23.1 Supported Browsers

| Browser | Min Version | Support |
|---|---|---|
| Chrome | 110+ | Primary |
| Firefox | 110+ | Primary |
| Safari | 16+ | Primary |
| Edge | 110+ | Primary |
| Chrome Android | 110+ | Mobile primary |
| Safari iOS | 16+ | Mobile primary |
| IE 11 | — | Not supported |

### 23.2 JavaScript Requirement

Required. `<noscript>`: "This application requires JavaScript. Please enable JavaScript in your browser settings."

### 23.3 Performance Budgets

| Metric | Target |
|---|---|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3.0s |
| Intent catalog load (S2 initial) | < 500ms after catalog is built |
| Entity search autocomplete | < 400ms first result |
| Query execution (S4 → S5) | < 10s p90. Loading state after 300ms. |
| Label override partial rebuild | < 5s (per RPM §35.5) |
| Initial JS bundle (gzipped) | < 200KB |

### 23.4 Offline Behavior

The Intent Catalog may be cached (IndexedDB or service worker). If offline:
- S1–S4: usable from cache.
- S5: requires network. Message: "Results require a connection. Your query has been saved. Connect and try again."
- Stale cache: banner if catalog is more than 24 hours old: "Your search options may be out of date. Connect to refresh."
- Entity search: requires network. Field shows: "Search is unavailable offline. Connect to search for records."

---

## 24. Open Questions

| ID | Question | Owner | Status |
|---|---|---|---|
| OQ-01 | What is the expected maximum catalog size at launch? Affects whether alphabetical sorting within groups is needed. | Registry / Discovery Team | Open |
| OQ-02 | Does entity search return type information alongside the label? Richer autocomplete is possible if yes. | Backend Team | Open |
| OQ-03 | Is Excel export a day-one requirement or post-launch? | Product | Open |
| OQ-04 | Is the result row detail view (clicking a row to see the full entity record) in scope for v1? | Product | Deferred to v1.1 |
| OQ-05 | What is the support contact mechanism for "Contact your administrator" in M3? | Operations | Open |
| OQ-06 | Is user account management (login, session, saved queries) in scope? The spec assumes single-session stateless use. | Product | Open |
| OQ-07 | What is the expected maximum number of Compound Intents per subject type? This affects whether the "Common questions" strip needs a scroll affordance or a "Show all [N]" expansion. | Discovery Team | Open |
| OQ-08 | Is WCAG 2.1 AAA required by organizational policy? | Legal / Compliance | Open |
| OQ-09 | What is the maximum expected result set size? Affects virtualized table decision. | Backend Team | Open |
| OQ-10 | Should chained search (targetToSubject) be available at launch or deferred? If deferred, hide the "Chained search" radio option entirely — do not show it disabled. | Product | Open |
| OQ-11 | Should the "auto" badge on Curator-view intent labels be implemented at launch, or is it a post-launch enhancement? The feature adds Curator value but adds implementation surface. | Product | Open |
| OQ-12 | What is the deployment environment for the settings panel's "Contact your administrator" support link? Needed to configure the URL before launch. | Operations | Open |

---

*GDE Query Builder UI Specification v2.1*
*Companion to Graph Discovery Engine / RPM v2.1 Production Specification*
*Parts I, II, III (Sections 30–35), and Section 33 of RPM v2.1 govern all behavioral and data contract questions. This document governs the user-facing layer only.*
*The XSD-to-UI component mapping table is normatively defined in RPM v2.1 §31.2. This spec adds only UI rendering notes and does not duplicate the table.*
