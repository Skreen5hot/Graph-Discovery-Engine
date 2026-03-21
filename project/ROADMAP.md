# Roadmap — GDE v2.1: RPM Discovery Engine + Query Builder UI

<!--
  This is the project's north star. AI agents read this at session start to
  understand what to work on and — critically — what NOT to touch.

  Source specs:
    project/RPM-v2.1-FINAL.md     — Engine spec (kernel, discovery, APIs)
    project/GDE-UI-SPEC-v2.1.md   — UI spec (screens, components, design system)
  Build order: RPM v2.1 §19
  Layer rules: docs/ARCHITECTURE.md
-->

---

## Phase 0: Repository Setup and Development Readiness

**Goal:** Get the template building, tested, and green. Establish project identity, clean up git state, create the domain SPEC placeholder, and configure the repo so every future session starts from a working baseline.

**Status:** In Progress

**Layer:** N/A — infrastructure and project scaffolding only. No domain code.

### 0.1 Install Dependencies and Verify Green Baseline

**Status:** Complete | **Priority:** Critical

The template must build and pass all spec tests before any domain work begins.

**Acceptance Criteria:**
- [x] `npm install` completes without errors
- [x] `npm run build` — zero TypeScript errors
- [x] `npm test` — all 3 spec tests pass (determinism, no-network, snapshot)
- [x] `npm run test:purity` — kernel isolation verified
- [x] `node dist/kernel/index.js examples/input.jsonld` — CLI produces valid JSON-LD output

### 0.2 Update Project Identity

**Status:** Complete | **Priority:** High

Rename the template to reflect the GDE project.

**Acceptance Criteria:**
- [x] `package.json` `name` updated to `graph-discovery-engine`
- [x] `package.json` `description` updated to reflect GDE / RPM v2.1
- [x] `package.json` `version` set to `0.0.0` (pre-Phase 1)
- [x] `KERNEL_VERSION` in `src/kernel/transform.ts` remains `"0.1.0"` until Phase 1 replaces the identity transform
- [x] `npm run build` still passes after changes

### 0.3 Create Domain SPEC Placeholder

**Status:** Complete | **Priority:** High

The template shipped with a generic `project/SPEC.md` that was deleted. Create the GDE-specific SPEC placeholder that Phase 1.1 will populate.

**Acceptance Criteria:**
- [x] `project/SPEC.md` created with RPM v2.1 header, stub sections for Input Contract (§4.1), Output Contract (§4.3), Subject Shape (§4.2), and Context requirements
- [x] References `project/RPM-v2.1-FINAL.md` as the normative engine spec
- [x] References `project/GDE-UI-SPEC-v2.1.md` as the normative UI spec
- [x] Sections are stubs — Phase 1.1 fills them in

### 0.4 Clean Git State

**Status:** In Progress | **Priority:** High

The working tree has uncommitted changes from project setup. Get to a clean baseline commit.

**Acceptance Criteria:**
- [ ] `project/RPM-v2.1-FINAL.md` tracked (the normative engine spec)
- [ ] `project/GDE-UI-SPEC-v2.1.md` tracked (the normative UI spec)
- [ ] `project/ROADMAP.md` changes committed (this roadmap)
- [ ] `project/SPEC.md` placeholder committed
- [x] `project/DECISIONS.md` updated: ADR-002 (domain specs) + ADR-003 (GitHub Pages + Actions)
- [ ] `.claude/settings.json` tracked if appropriate, or added to `.gitignore`
- [ ] Working tree clean on `main`

### 0.5 Add Development Convenience Scripts

**Status:** Complete | **Priority:** Medium

Add npm scripts that reduce friction during iterative development.

**Acceptance Criteria:**
- [x] `npm run verify` — single command that runs `build` + `test` + `test:purity` in sequence (the full Terminal Check from CLAUDE.md §5)
- [x] `npm run clean` already exists (verified working)
- [x] All scripts work on Windows (no Unix-only syntax in `package.json`)

### 0.6 Verify CI Pipeline

**Status:** Complete | **Priority:** Medium

Confirm the GitHub Actions workflow will pass on the current repo state.

**Acceptance Criteria:**
- [x] `.github/workflows/ci.yml` reviewed — no references to deleted files or incorrect paths
- [x] CI uses `.nvmrc` for Node version (single source of truth)
- [x] CI runs `build` → `test` → `test:purity` → CLI verify
- [x] Updated to use `node-version-file: '.nvmrc'` instead of hardcoded version

### 0.7 Add .nvmrc

**Status:** Complete | **Priority:** Low

Pin the Node version so all contributors and CI use the same runtime.

**Acceptance Criteria:**
- [x] `.nvmrc` created with `22` (matches `package.json` engines and CI config)

**NOT in scope for Phase 0:**
- Domain types or business logic — that is Phase 1
- New devDependencies (linters, formatters) — only add if the Orchestrator requests them
- Modifying spec tests
- Modifying kernel logic
- Frontend tooling decisions — that is Phase 5

**Exit Criteria:** `npm run build && npm test && npm run test:purity` all green. Git working tree clean. Every subsequent session can start from this known-good state.

---

## Phase 1: Kernel Foundation — Types, Contracts, and Core Algorithms

**Goal:** Establish the RPM type system, domain I/O contract, and the pure deterministic algorithms that have no external dependencies: Labeling Law, IRI cleaning, Control Inference, deterministic ID generation, and canonical serialization.

**Status:** In Progress

**Layer:** 0 — `src/kernel/` only. No I/O, no network, no adapters.

### 1.1 Define Input/Output Contract and Type System

**Status:** Complete | **Priority:** High

Define the JSON-LD types for RPM domain objects. Document in [SPEC.md](./SPEC.md). This is the foundation everything else builds on. Types defined here serve both the engine (Phases 2–4) and the UI (Phase 5).

**Acceptance Criteria:**
- [x] `Intent`, `CGP`, `CGP_c`, `RPMError`, `RPMPartialCGP` types defined in `src/kernel/types.ts`
- [x] `MappingDefinition` type with `shorthand`, `source`, `tier`, `exposure`, `domainClasses`, `rangeClasses`, `pattern`, `ui` fields
- [x] `MappingRegistry` type (hybrid: discovered + static + merged)
- [x] `UIBlock` type with all §22 required fields and `*Source` companion fields
- [x] `InputParameter` type with `id`, `role`, `label`, `hint`, `inputType`, `inputTypeSource`, `required`, `filterOp`, `unit`, `selectOptions` (UI Spec §8.5 depends on this)
- [x] `OutputBind` type with `role`, `label`, `description` (UI Spec §8.6 depends on this)
- [x] `TranslatedError` type with `userMessage`, `severity`, `placement`, `fieldBinding`, `clauseIndex` (§25; UI Spec §19 depends on this)
- [x] `NarrativeResult` type with `cgp`, `narrativeSummary`, `narrativePath`, `sourceIntent`, `sourceIntentLabel` (§34; UI Spec §10.3 depends on this)
- [x] `OverrideEntry` and `OverrideStore` types (§35)
- [x] `OntologyClosure` type (§3.4)
- [x] `DiscoveryReport` type (§32.10)
- [x] Pattern grammar types: `Branch`, `Edge`, `Node`, `Bind`, `Literal` steps (§6)
- [x] `Provenance` type with `rulesApplied`, `kernelVersion`
- [x] `UncertaintyAnnotation` type
- [x] Input/output contract documented in [SPEC.md](./SPEC.md) per §4
- [ ] `examples/input.jsonld` updated with representative RPM input — deferred to Phase 1.6 (identity transform still in place; changing examples would break snapshot test)
- [ ] `examples/expected-output.jsonld` updated with expected CGP output — deferred to Phase 1.6
- [x] `npm run build` passes — no TypeScript errors

**Post-review additions:**
- [x] `LabelResolution` refactored to discriminated union (`LabelResolutionSuccess | LabelResolutionFailure`)
- [x] `QualityThresholdFailureReason` literal union: `"noAlphabeticWord" | "tooShort" | "namespacePrefixCollision"`
- [x] `comments` renamed to `annotations` on `OntologyClass` and `OntologyProperty` for hint resolution (§30.6)
- [x] `ExpandResult` type alias and type guard trio: `isRPMError()`, `isPartialCGP()`, `isCGP()`
- [x] `OntologyClosure` JSDoc documenting named individual gap (Phase 3.5)

### 1.2 Labeling Law (§30)

**Status:** Complete | **Priority:** High

Implement the normative label resolution algorithm. This is a pure function: IRI + ontology metadata in → resolved label + labelSource out. No network. No I/O.

**Implementation:** `src/kernel/labeling.ts` — all functions named, pure, deterministic.

**Acceptance Criteria:**
- [x] Priority hierarchy implemented: `skos:prefLabel` → `rdfs:label` → `schema:name` → `dc:title` → `foaf:name` → IRI local name cleaning (§30.2)
- [x] Language preference rules implemented (§30.3): `en` preferred → no tag → alphabetical → shortest
- [x] IRI local name cleaning algorithm implemented (§30.4): underscore/hyphen split, camelCase split, acronym boundary, title case
- [x] Quality threshold implemented (§30.5): Rule 1 (alphabetic word content + namespace prefix secondary check), Rule 2 (minimum length), Rule 3 (namespace prefix collision)
- [x] Hint resolution implemented (§30.6): `rdfs:comment` → `skos:definition` → `skos:scopeNote` → empty
- [x] Auto-grouping algorithm implemented (§30.7)
- [x] All 7 IRI cleaning test cases from §30.4 pass (CT-09 Part A)
- [x] All 7 quality threshold boundary cases from §30.5 pass (CT-09 Part B)
- [x] Each function is named and pure — no side effects
- [x] `LabelResolution` discriminated union tracks which level resolved each label (`LabelResolutionSuccess.level`)
- [x] `npm test` (45/45) and `npm run test:purity` (5 kernel files) pass

**Tests:** `tests/labeling-law.test.ts` — 39 tests covering CT-08, CT-09 Parts A & B, CT-13, language preference, hint resolution, auto-grouping, and extractLocalName.

**Implementation notes:**
- Step 3 regex restricted to lowercase-to-uppercase only (not digit-to-uppercase). RPM §30.4 says "lowercase letter or digit" but CT-09 Part B normative output for `VALVE_3B` → `Valve 3B` proves digit-to-uppercase splits must NOT fire. **Spec maintenance flag:** §30.4 Step 3 should be corrected to read "lowercase letter" only, dropping the "or digit" clause.
- Title case preserves short all-uppercase tokens (≤3 chars) as acronyms: `CCO`, `BFO`, `ID` stay uppercase. Longer all-uppercase words get standard title case: `TANK` → `Tank`, `VALVE` → `Valve`. **Phase 3 validation note:** the ≤3-char acronym rule also preserves 2-char tokens like `UK`, `US`, `EU` — likely correct for manufacturing/procurement graphs but should be validated against real graph data when Tier 1 discovery runs.

### 1.3 Control Inference (§31)

**Status:** Complete | **Priority:** High

Implement the XSD-to-UI component mapping. Pure function: range type in → `inputType`, `filterOp`, `via`, `inputTypeSource` out. The UI layer (Phase 5) renders fields based on these inferred values — see UI Spec §8.5 and §12.3.

**Implementation:** `src/kernel/control-inference.ts` — all functions named, pure, deterministic.

**Acceptance Criteria:**
- [x] Full XSD-to-UI mapping table implemented (§31.2) — all 23 range types
- [x] Enumeration detection implemented (§31.3): `owl:oneOf` → `select` (max 20 options)
- [x] ObjectProperty literal mode implemented (§31.4): ICE subclass → `via: "ice"`, otherwise `edge → node → bind`
- [x] Unit inference implemented (§31.5): `qudt:unit`, `om:unit`, comment pattern matching
- [x] `inputTypeSource` recorded for every inference (`xsdMapping`, `rangeIsObjectProperty`, `enumerationDetected`, `noRangeFallback`)
- [x] All 6 CT-10 test cases pass
- [x] `npm test` (78/78) and `npm run test:purity` (6 kernel files) pass

**Tests:** `tests/control-inference.test.ts` — 33 tests covering CT-10 (6 rows), all 18 extended XSD types, enumeration detection (≤20 / >20 / xsd:token override), ICE mode, unit inference (qudt annotation, comment pattern, absent), and via:direct verification.

**Pre-implementation type addition:** `EnumeratedIndividual` type and `OntologyClass.enumeratedIndividuals` field added to `types.ts` to support §31.3 enumeration detection.

**Known gap — `xsd:token` enumeration detection is silently inert:** The `xsd:token` branch in `inferControl` calls `detectEnumeration("xsd:token", closure)`, which queries `closure.classes.get("xsd:token")` — always returns `undefined` because `"xsd:token"` is an XSD type literal, not an OWL class IRI. The fallback to `text` is correct. The fix requires passing the actual range class IRI from `OntologyProperty.range`, not the XSD type string. Deferred to Phase 3 when the crawl populates range data and the full predicate entry is available.

### 1.4 Deterministic ID Generation (§9)

**Status:** Complete | **Priority:** High

SHA-256 blank node IDs. Pure function: mapping shorthand + structural inputs → deterministic hex ID.

**Implementation:** `src/kernel/deterministic-id.ts` — 5 exported functions, all pure and deterministic.

**Acceptance Criteria:**
- [x] SHA-256 hash truncated to 16 lowercase hex characters
- [x] For discovered mappings, input component is the full predicate IRI
- [x] CT-02 Hash Stability: 5 fixtures × 1,000 runs each, all identical
- [x] `npm test` (99/99) and `npm run test:purity` (7 kernel files) pass

**Tests:** `tests/deterministic-id.test.ts` — 21 tests covering CT-02 (5 fixtures × 1,000 runs), ID format, canonical input serialization (pipe separation, escaping), uniqueness (4 component-difference tests), generateHexHash, and overrideId generation (§35.3).

**Exported functions:**
- `buildCanonicalInput(...components)` — pipe-separated canonical string with escape rules
- `generateBlankNodeId(canonicalInput)` — `_:b` + 16 hex chars from SHA-256
- `generateNodeId(subjectId, intent, mappingShorthand, stepPath, branchName, occurrenceIndex)` — full CGP node ID, 6 components in §9.2 order
- `generateHexHash(input)` — raw 16-char hex (no prefix)
- `generateOverrideId(shorthand, createdAt)` — `ov_` + 8 hex chars per §35.3

**Post-review fix:** `generateNodeId` corrected from 4 components in wrong order to 6 components in §9.2 spec order: `subjectId | intent | mappingShorthand | stepPath | branchName | occurrenceIndex`. Added `intent` and `occurrenceIndex` parameters. CT-02 fixtures and component-order verification tests updated to match. Tests now include explicit component-swap assertions proving order sensitivity.

**Note:** CT-02 in v2.1 spec says "see v1.5 §30.2–30.8 for full specifications." The v1.5 spec is not in this repo. The canonical input format (pipe-separated, escaped) was designed to match the stated contract in §9. If v1.5 canonical input strings are obtained later, CT-02 fixture expectations should be updated to match.

### 1.5 Canonical JSON-LD Serializer

**Status:** Complete | **Priority:** High

Extend the existing `src/kernel/canonicalize.ts` to handle CGP-specific output requirements.

**Implementation:** `src/kernel/cgp-serializer.ts` — builds on `canonicalize.ts` (key sorting) and `deterministic-id.ts` (blank node IDs).

**Acceptance Criteria:**
- [x] CGP output includes required `@context` (embedded, resolved — see SPEC.md §4), `@graph`, and `provenance`
- [x] `@graph` nodes sorted by `@id` lexicographically (RPM §13 normalized ordering)
- [x] Recursively sorted keys via `stableStringify` round-trip
- [x] Step path tracking through branch recursion: dot-separated indices (e.g., "0", "0.1", "0.1.2")
- [x] Tier 1 expansion test: subject → edge → node → bind produces correct CGP with blank node IDs
- [x] Nested branch expansion test: 4-hop Tier 3 pattern produces 4 nodes with distinct blank node IDs and correct types
- [x] Determinism: identical inputs produce identical JSON strings
- [x] Snapshot test unchanged (identity transform still in place — examples deferred to Phase 1.6)
- [x] `npm test` (123/123) and `npm run test:purity` (8 kernel files) pass

**Tests:** `tests/cgp-serializer.test.ts` — 19 tests covering step path building, @graph ordering, provenance, serializeCGP, Tier 1 expansion, nested branch expansion (Tier 3-like), ordering determinism, CGP_CONTEXT, and stringifyCGP modes.

**Exported functions:**
- `expandPatternToCGP(subject, intent, mappingShorthand, pattern, rulesApplied)` — main entry for Phase 1.6
- `serializeCGP(nodes, rulesApplied)` — assemble nodes into canonical CGP document
- `walkPatternSteps(steps, parentPath, parentNodeId, branchName, ctx)` — recursive pattern walker
- `normalizeGraph(nodes)` — sort @graph by @id
- `buildStepPath(parentPath, stepIndex)` — step path string builder
- `buildProvenance(rulesApplied)` — provenance factory
- `stringifyCGP(cgp, pretty?)` — canonical JSON string output
- `CGP_CONTEXT` — embedded @context object

**`@context` decision resolved:** Embedded context with `rpm`, `rdf`, `rdfs`, `owl`, `xsd`, `skos` prefixes. Documented in SPEC.md §4. Production contexts may extend with domain prefixes.

**No `types.ts` changes in this phase.**

### 1.6 Pattern Grammar and Recursive Expander (§6, §7)

**Status:** Complete | **Priority:** High

Implement the path pattern grammar and the recursive expansion model. Pure function: mapping + subject + context → CGP.

**Implementation:** `src/kernel/expand.ts` — `rpmExpand()` entry point + `stubTypeResolver`. `src/kernel/cgp-serializer.ts` updated with pendingEdge carry-forward and literal step ICE handling.

**Acceptance Criteria:**
- [x] Step types implemented: `edge`, `node`, `bind`, `literal`, `branch` (§6)
- [x] Expansion steps implemented in order (§7.1): resolve mapping → validate subject → instantiate root → expand pattern → inject intermediates → bind outputs → canonicalize
- [x] Literal handling: `via: "ice"` creates ICE node, `via: "direct"` is structural no-op (§8)
- [x] Multi-typing and subsumption validation (§10): pluggable `TypeResolver` interface; any-match semantics
- [x] **Stub `TypeResolver` implemented** (`stubTypeResolver`): exact-match only, exported for Phase 1 tests
- [x] Branch nesting supported for Tier 2 and Tier 3 compound patterns (tested with 4-hop employment path)
- [x] Inverse edge direction supported (child node links back to parent)
- [x] Input immutability preserved (tested: subject not mutated after expansion)
- [x] `npm test` (136/136) and `npm run test:purity` (9 kernel files) pass

**Tests:** `tests/expand.test.ts` — 13 tests covering INTENT_NOT_FOUND (2), SUBCLASS_VIOLATION (1), multi-typed subject (1), Tier 1 full expansion (1), Tier 3 nested branch (1), inverse edge (1), literal via ice (1), literal via direct (1), determinism (1), type guards (2), input immutability (1).

**Pre-implementation refactors (carried from Phase 1.5 review):**
- Edge handling refactored from lookback (`steps[i-1]`) to carry-forward (`pendingEdge`) — correctly handles edge → branch sequences
- Literal step ICE contract documented in SPEC.md §5

**Files changed:** `src/kernel/expand.ts` (new), `src/kernel/cgp-serializer.ts` (pendingEdge + ICE literal), `tests/expand.test.ts` (new), `project/SPEC.md` (§5 literal contract). No `types.ts` changes.

### 1.7 Error Handling (§11, §25)

**Status:** Complete | **Priority:** Medium

Implement structured error objects and the Dynamic Template Engine. The `TranslatedError` output is consumed directly by the UI for inline validation and banner errors (UI Spec §19).

**Implementation:** `src/kernel/error-translation.ts` — `translateError()`, `buildTranslationContext()`, `containsProhibitedTerm()`.

**Acceptance Criteria:**
- [x] All 11 error codes from §11.2 have templates (including `CRAWL_ENDPOINT_UNREACHABLE`, `LABELING_LAW_EXHAUSTED`)
- [x] Dynamic Template Engine: label injection tokens `{subjectLabel}`, `{intentLabel}`, `{domainLabel}`, `{fieldLabel}`, `{intentLabel2}` (§25.2)
- [x] Token fallback values when labels unresolvable: "this record type", "this search", "this field" (§25.2)
- [x] All 11 error templates from §25.2 implemented with correct severity/placement classification
- [x] `TranslatedError` output: `userMessage`, `severity`, `placement`, `fieldBinding`, `clauseIndex`
- [x] CT-12: no raw IRIs, error codes, namespace prefixes, or internal identifiers in any userMessage
- [x] `containsProhibitedTerm()` scanner for CT-01/CT-12 compliance
- [x] `npm test` (165/165) and `npm run test:purity` (10 kernel files) pass

**Tests:** `tests/error-translation.test.ts` — 29 tests covering CT-12 (SUBCLASS_VIOLATION with labels + prohibited term scan), all 11 templates (completeness + no prohibited terms), severity/placement classification (validation vs system), token injection (3 patterns), token fallbacks (2 cases), clauseIndex passthrough (2 cases), buildTranslationContext (1), containsProhibitedTerm (7 cases).

**No `types.ts` changes.**

**Spec clarification needed (Phase 2 review):** `SUBCLASS_VIOLATION` has `placement: "inline"` but no `fieldBinding`. RPM §27.8 says inline errors with null fieldBinding are conformance failures. However, SUBCLASS_VIOLATION is a subject-type mismatch (Screen 1 selection vs. mapping domainClasses) — there is no input field to bind to. The inline placement is correct (error should appear near the intent in the panel, not in a banner) but fieldBinding is null by design. §27.8 needs a clarifying exception for subject-type errors. CT-07 should explicitly assert `fieldBinding: undefined` for SUBCLASS_VIOLATION. Implementation is correct — do not change.

### 1.8 Narrative Synthesis Layer (§34)

**Status:** Not Started | **Priority:** Medium

Transform resolved CGPs into plain-language summaries. Pure function: CGP + UI block → `NarrativeResult`. The UI renders `narrativeSummary` as a subtitle per result row and `narrativePath` as a breadcrumb strip (UI Spec §10.3–10.4, §12.4–12.5).

**Acceptance Criteria:**
- [ ] Subject label resolution (§34.3 Step 1): 4-level fallback
- [ ] Predicate verb conversion (§34.3 Step 2): "Has X" → "has", "Employed by" → "is employed by", etc.
- [ ] Object label resolution (§34.3 Step 3)
- [ ] Summary sentence composition (§34.3 Step 4): Tier 1 vs. Tier 2/3 templates
- [ ] `narrativePath` assembly (§34.3 Step 5)
- [ ] Firewall enforcement (§34.4): prohibited-term scan on all narrative output
- [ ] Multi-clause narrative modes: sequential AND, parallel OR, chained (§34.5)
- [ ] **Performance budget:** ≤ 5ms per row for narrative generation (pure string operations, no network). A page of 25 rows MUST complete narrative generation in ≤ 125ms total. This is the kernel's share of the 10-second query execution budget (UI Spec §23.3). Measured by benchmark test included in Phase 1.10.
- [ ] CT-14 test cases pass
- [ ] `npm test` and `npm run test:purity` pass

### 1.9 Query Composition Model (§24)

**Status:** Not Started | **Priority:** Medium

Compose multiple intent clauses into a `CGP_c`. Pure function: composed query + context → `CGP_c`. The UI composition mode selector (UI Spec §7.4) maps directly to these modes.

**Acceptance Criteria:**
- [ ] `CQO` (Composed Query Object) processing
- [ ] `joinAnchors`, `unionRoots`, `chainLinks` structural metadata
- [ ] `joinType` disambiguation
- [ ] Specificity scoring for multi-mapping resolution (§5.6)
- [ ] Three composition modes: sequential/subjectToSubject ("All must match"), parallel ("Any can match"), targetToSubject ("Chained search") — per UI Spec §18.4
- [ ] `npm test` and `npm run test:purity` pass

### 1.10 Domain Tests — Phase 1

**Status:** Not Started | **Priority:** High

Write domain-specific tests for all Phase 1 kernel functions.

**Acceptance Criteria:**
- [ ] CT-08 — Labeling Law Priority Test (§33.3)
- [ ] CT-09 — IRI Cleaning Algorithm and Quality Threshold Test (§33.4)
- [ ] CT-10 — Control Inference Table Test (§33.5)
- [ ] CT-12 — Dynamic Error Template Test (§33.7)
- [ ] CT-13 — Quality Threshold Boundary Test (§33.8)
- [ ] CT-14 — Narrative Synthesis Test (§33.9)
- [ ] Unit tests for pattern expansion, deterministic ID generation, composition
- [ ] Narrative generation benchmark test: verify ≤ 5ms per row, ≤ 125ms for 25 rows (Phase 1.8 performance budget)
- [ ] All tests follow `tests/*.test.ts` convention
- [ ] `npm test` passes all spec + domain tests
- [ ] `npm run test:purity` passes

**NOT in scope for Phase 1:**
- SPARQL endpoint connectivity — that is Phase 2
- Discovery Engine crawl logic — that is Phase 2
- Tier 3 Frequent Path Discovery — that is Phase 2
- HTTP API / REST endpoints — that is Phase 3
- Label Override API persistence — that is Phase 3
- Frontend UI — that is Phase 5
- Deployment — that is Phase 6

**Decisions Deferred:**
- JSON-LD context: embedded vs. remote (await Orchestrator input)
- `TypeResolver` concrete implementation beyond default OWL/RDFS subsumption

---

## Phase 2: Discovery Engine — Schema Crawl and Registry Assembly

**Goal:** Implement the three-tier Discovery Engine that crawls a SPARQL endpoint and assembles the in-memory Mapping Registry. This phase bridges kernel algorithms (Phase 1) with live graph data.

**Status:** Not Started

**Layer:** 0 (`src/kernel/`) for registry assembly and tier logic; 2 (`src/adapters/`) for SPARQL endpoint connectivity.

### 2.0 CT-11 Test Endpoint Infrastructure

**Status:** Not Started | **Priority:** Critical — blocks 2.5 and 2.7

CT-11 (Frequent Path Discovery) requires a SPARQL test endpoint seeded with deterministic fixture data. This infrastructure must exist before Tier 3 development begins and must run in CI without manual provisioning.

**Acceptance Criteria:**
- [ ] Triple store technology chosen and documented in `project/DECISIONS.md` (ADR required — e.g., Oxigraph, Apache Jena, RDF4J, or in-memory N-Quads fixture with a minimal SPARQL evaluator)
- [ ] Fixture data created per RPM §33.6: 1,000 `test:Person` instances; 950 connected via 4-hop path (`test:Person → test:hasRole → test:EmployeeRole → test:realizesIn → test:Job → test:atOrganization → test:Organization`); 50 connected via 2-hop path (`test:Person → test:memberOf → test:Organization`); all classes and predicates have `rdfs:label` values
- [ ] Fixture data committed to repository (e.g., `tests/fixtures/ct-11-endpoint/`)
- [ ] CI setup script provisions the test endpoint from fixture data before tests run
- [ ] Test endpoint is isolated — never points at a production graph
- [ ] Startup time for test endpoint < 10s in CI

### 2.1 SPARQL Endpoint Connector

**Status:** Not Started | **Priority:** High

Adapter-layer component for executing SPARQL queries against a configured endpoint.

**Acceptance Criteria:**
- [ ] Lives in `src/adapters/` — not in kernel
- [ ] Executes paginated queries (10,000 results/page) with 30s per-query timeout and one retry (§32.3)
- [ ] HTTP HEAD health check with 10s timeout (§32.2)
- [ ] Emits `CRAWL_ENDPOINT_UNREACHABLE` on failure
- [ ] All 5 introspection queries implemented: Q1–Q5 (§32.3)
- [ ] Replaceable without kernel changes

### 2.2 Ontology Closure Loader

**Status:** Not Started | **Priority:** High

Load and index the ontology closure for subsumption checks, label lookups, and property chain resolution.

**Acceptance Criteria:**
- [ ] `OntologyClosure` populated with classes, properties, superclass/superproperty chains, inverse metadata, label/comment/definition annotations
- [ ] Subsumption distance calculation for specificity scoring
- [ ] Pluggable `TypeResolver` interface wired to default OWL/RDFS implementation

### 2.3 Tier 1 — Direct Predicate Discovery (§32.4)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Processes Q1 (object patterns) and Q2 (literal patterns)
- [ ] Generates one mapping per unique `(subjectClass, predicate)` pair
- [ ] Pattern: single `branch` with `edge`, `node`, `bind`
- [ ] UI block auto-populated via Labeling Law + Control Inference
- [ ] `exposure` set by automated promotion rules (§32.7)
- [ ] `tier: 1`, `source: "discovered"`

### 2.4 Tier 2 — OWL Property Chain Discovery (§32.5)

**Status:** Not Started | **Priority:** Medium

**Acceptance Criteria:**
- [ ] Parses `rdf:List` structures from Q3 results
- [ ] Steps generated by traversing the chain in order
- [ ] Domain from first property, range from last property
- [ ] Tier 2 takes precedence over Tier 1 for same predicate IRI
- [ ] `tier: 2`, `source: "discovered"`

### 2.5 Tier 3 — Frequent Path Discovery (§32.6)

**Status:** Not Started | **Priority:** Medium

**Acceptance Criteria:**
- [ ] Sampling phase: Q5 for subject classes with instance count > `minInstanceCount` (§32.6.1)
- [ ] Frequency calculation: dominance ratio, not raw count (§32.6.2)
- [ ] Promotion threshold: `frequencyScore` ≥ 0.70, `instanceCount` ≥ 100, path length 3–6 hops (§32.6.3)
- [ ] Path explosion cap: max 5 per `(SC, OC)` pair (§32.6.4)
- [ ] Compound label composition: semantic anchor + Labeling Law + disambiguation (§32.6.5)
- [ ] Compound Intent shorthand format: `rpm:compound_{SC}_{OC}_{Anchor}_v{N}` (§32.6.6)
- [ ] CT-11 Frequent Path Discovery test passes (§33.6)

### 2.6 Registry Assembly and Merge

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] In-memory registry assembled from Tier 1 + 2 + 3 results
- [ ] Optional static registry loaded and merged (static wins on shorthand conflict)
- [ ] Intent Catalog built: filtered to `smeSurface`, grouped, specificity-scored (§23)
- [ ] Automated promotion rules applied (§32.7)
- [ ] Discovery Report generated (§32.10)
- [ ] Crawl initialization sequence per §32.2 with tier time allocation (10s/5s/30s/5s)

### 2.7 Domain Tests — Phase 2

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] CT-11 — Frequent Path Discovery Test against seeded test endpoint (§33.6)
- [ ] Registry merge tests: static overrides, shorthand conflicts, exposure suppression
- [ ] Tier 1/2/3 discovery unit tests with fixture data
- [ ] Crawl timeout and degraded execution tests:
  - [ ] Tier 3 timeout test: simulate Tier 3 exceeding its 30s allocation, verify Tier 1 + 2 results produce a valid catalog with correct `smeSurface` mappings, and verify the Discovery Report accurately records the timeout with `tier3.suppressed` reflecting all Tier 3 candidates
  - [ ] Tier 1 timeout test: simulate Tier 1 exceeding its 10s allocation, verify system remains operational with Tier 2 + 3 only (or empty catalog if no tiers complete), and verify error is logged without crashing
  - [ ] All-tiers-timeout test: simulate all tiers timing out, verify system starts with an empty catalog and emits appropriate log, does NOT crash, and reports the condition in the Discovery Report
- [ ] All tests pass via `npm test`

**Phase 2 Prerequisites (from Phase 1 review):**
- ICE class and predicate in `cgp-serializer.ts` are currently hardcoded as `rpm:InformationContentEntity` and `rpm:is_designated_by`. RPM §8.1 requires these to come from the registry/ontology closure (e.g., `cco:InformationContentEntity`, `cco:is_designated_by` in BFO/CCO graphs). Fix requires either extending `LiteralStep` with `iceClass`/`icePredicate` fields or looking them up from the closure. Must be resolved before real ontology expansion.
- `stubTypeResolver` in `expand.ts` is retrieved from `context.typeResolver` via unsafe cast on `unknown`. Phase 2.2 replaces the stub with real OWL/RDFS implementation — at that point, make `typeResolver` an explicit optional parameter on `rpmExpand` rather than threading through the context bag.

**NOT in scope for Phase 2:**
- HTTP API endpoints — that is Phase 3
- Label Override API — that is Phase 3
- Refresh policy UI — that is Phase 3
- Frontend UI — that is Phase 5
- Deployment — that is Phase 6

---

## Phase 3: API Layer — Override API, Refresh, and Intent Lookup

**Goal:** Expose the kernel and Discovery Engine through HTTP endpoints. Implement the Label Override API, refresh policy, and intent lookup/expansion service. These endpoints are the contract between the engine and the Query Builder UI (Phase 5).

**Status:** Not Started

**Layer:** 2 — `src/adapters/` for HTTP endpoints; kernel for override application logic.

### 3.1 Intent Lookup and Expansion Endpoint

**Status:** Not Started | **Priority:** High

These endpoints serve the Query Builder UI screens S1–S5 (UI Spec §6–10).

**Acceptance Criteria:**
- [ ] `POST /rpm/expand` — accepts Intent + Subject + Context, returns CGP or RPMError
- [ ] `POST /rpm/compose` — accepts composed query, returns CGP_c or RPMError[]
- [ ] `GET /rpm/catalog` — returns Intent Catalog (smeSurface mappings, grouped, scored)
- [ ] `GET /rpm/catalog?subjectType={type}` — filtered catalog for S2 sidebar (UI Spec §7.3)
- [ ] `GET /rpm/catalog/{shorthand}` — returns single catalog entry
- [ ] `GET /rpm/subject-types` — returns available subject types for S1 cards (UI Spec §6.3)
- [ ] Catalog response includes `ui` blocks with all fields needed by S3 (UI Spec §8.5): `inputParameters`, `outputBinds`, `examples`, `description`, `group`, `label`
- [ ] Compound Intents served for the "Common questions" strip (UI Spec §7.3.1): `GET /rpm/catalog?subjectType={type}` response MUST include a `compoundIntents` array containing Tier 3 mappings ranked by `frequencyScore` descending, separate from the specificity-ranked `mappings` array. The UI uses `compoundIntents` for the strip and `mappings` for the full catalog. Both use the same `MappingDefinition` shape. `frequencyScore` is included in the response for ranking but is a prohibited surface element — the UI MUST NOT render it.
- [ ] Prohibited surface elements (§26) never appear in catalog responses

### 3.2 Label Override API (§35)

**Status:** Not Started | **Priority:** High

Serves the Label Override Modal M4 (UI Spec §11.4) and Override History (UI Spec §11.3).

**Acceptance Criteria:**
- [ ] `GET /rpm/overrides` — returns all override store entries (sme + curator roles); used by UI Spec §11.3 Override History
- [ ] `POST /rpm/overrides` — create/replace override (curator role only, §35.4); called by M4 Save (UI Spec §11.4)
- [ ] `DELETE /rpm/overrides/{overrideId}` — remove override (curator role only); called by M4 Revert (UI Spec §11.4) and Override History Revert (UI Spec §11.3)
- [ ] Override store persisted to `rpm-overrides.json` (§35.3)
- [ ] Partial catalog rebuild within 500ms on override change (§35.5)
- [ ] Override scope constraints enforced: only `label`, `description`, `group`, `examples` (§35.6)
- [ ] Precedence: overrides > static > discovered (§35.3)
- [ ] `overrideId` generation: SHA-256 of `shorthand + createdAt`, truncated to 8 hex, prefixed `ov_`
- [ ] HTTP 403 for sme-role write attempts, HTTP 401 for unauthenticated
- [ ] Response shape for pre-override label: `GET /rpm/overrides` response MUST include an `originalLabel` field per entry containing the pre-override `ui.label` from the discovered (or static) registry. This is used by M4 Revert confirmation text: "This will restore the auto-generated label '[originalLabel]'." (UI Spec §11.4). Additionally, `GET /rpm/catalog/{shorthand}` MUST include both `ui.label` (current, post-override) and `ui.originalLabel` (pre-override, null if no override active) so the M4 modal can display the revert target without a separate API call.
- [ ] CT-15 Label Override Persistence Test passes (§33.10)

### 3.3 Refresh Policy (§32.9)

**Status:** Not Started | **Priority:** Medium

Serves the Settings Panel refresh control (UI Spec §11.2).

**Acceptance Criteria:**
- [ ] Schema vs. data freshness distinction implemented (§32.9.1)
- [ ] `POST /rpm/refresh` — triggers schema re-crawl (curator role, §32.9.2); called by Settings Panel "Refresh now" (UI Spec §11.2)
- [ ] Response includes count of new search types for success notification (UI Spec §11.2: "[N] new search types added")
- [ ] Atomic registry switchover during refresh (§32.9.3)
- [ ] Previous registry remains active if refresh fails
- [ ] Entity search always queries live endpoint — no caching (§32.9.4); UI entity search autocomplete depends on this (UI Spec §8.5)
- [ ] Scheduled refresh interval: configurable, default disabled
- [ ] Last crawl timestamp available for Settings Panel display (UI Spec §11.1)

### 3.4 Discovery Report Endpoint

**Status:** Not Started | **Priority:** Low

**Acceptance Criteria:**
- [ ] `GET /rpm/discovery-report` — returns latest Discovery Report (curator role only)
- [ ] Report structure per §32.10
- [ ] Never exposed to SME-role users

### 3.5 Entity Search Endpoint

**Status:** Not Started | **Priority:** High

Serves the entity search autocomplete field (UI Spec §8.5, `inputType: "entitySearch"`).

**Acceptance Criteria:**
- [ ] `GET /rpm/entity-search?type={rangeClass}&q={query}` — live SPARQL query against range class instances
- [ ] Returns label (bold) + type (muted) per result, max 8 results (UI Spec §8.5)
- [ ] Response within 400ms p90 (UI Spec §23.3 performance budget)
- [ ] Never returns IRIs in display fields — labels only
- [ ] Never cached — always live (RPM §32.9.4)

### 3.6 Dynamic Error Template Integration

**Status:** Not Started | **Priority:** Medium

**Acceptance Criteria:**
- [ ] All HTTP error responses use `TranslatedError` format
- [ ] `severity` and `placement` fields drive UI rendering: `inline` for field errors, `banner` for system errors (UI Spec §19.1)
- [ ] No raw error codes, IRIs, or internal identifiers in response bodies
- [ ] CT-12 verified end-to-end through HTTP layer

### 3.7 Domain Tests — Phase 3

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] CT-15 — Label Override Persistence Test (§33.10)
- [ ] Override CRUD integration tests
- [ ] Refresh safety tests (atomic switchover, failure recovery)
- [ ] Role-based access control tests (sme vs. curator)
- [ ] End-to-end expand/compose tests through HTTP
- [ ] Entity search response shape tests
- [ ] All tests pass via `npm test`

**NOT in scope for Phase 3:**
- Frontend UI rendering — that is Phase 5
- Deployment infrastructure — that is Phase 6
- Multi-tenant access control — deployment concern per §35.2

---

## Phase 4: Compliance Suite and Integration Verification

**Goal:** Implement and pass all 15 Canonical Tests (CT-01 through CT-15). Verify end-to-end integration across all layers.

**Status:** Not Started

### 4.1 CT-01 through CT-07 — Core Compliance (v1.5)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] CT-01 — SME Blind Test: scan dictionary includes all §26 prohibited elements
- [ ] CT-02 — Hash Stability Test: identical inputs across 1,000 runs produce identical SHA-256-derived blank node IDs. If the engine is ever implemented in multiple languages (Python, Java adapter), CT-02 must pass independently in each language environment.
- [ ] CT-03 — Registry Round-Trip
- [ ] CT-04 — Error Encapsulation
- [ ] CT-05 — Specificity Scoring
- [ ] CT-06 — Composed Query Assembly
- [ ] CT-07 — Multi-Type Validation
- [ ] All 7 tests blocking in CI

### 4.2 CT-08 through CT-15 — Discovery and v2.1 Compliance

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] CT-08 — Labeling Law Priority (§33.3) — verified Phase 1, re-validated here
- [ ] CT-09 — IRI Cleaning + Quality Threshold (§33.4)
- [ ] CT-10 — Control Inference Table (§33.5)
- [ ] CT-11 — Frequent Path Discovery (§33.6) — seeded test endpoint, never production
- [ ] CT-12 — Dynamic Error Template (§33.7)
- [ ] CT-13 — Quality Threshold Boundary (§33.8)
- [ ] CT-14 — Narrative Synthesis (§33.9)
- [ ] CT-15 — Label Override Persistence (§33.10) — clean override store per CI run
- [ ] CT-01 scan dictionary updated for all v2.0/v2.1 prohibited elements
- [ ] All 15 tests blocking in CI per §33.11 trigger matrix

### 4.3 End-to-End Integration Tests

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Full pipeline: SPARQL crawl → discovery → registry assembly → intent expansion → narrative synthesis
- [ ] Static override merge verified end-to-end
- [ ] Override API → partial rebuild → catalog update verified
- [ ] Refresh → atomic switchover verified
- [ ] Degraded execution: tier timeout → partial registry → system operational

**NOT in scope for Phase 4:**
- New feature development
- Deployment infrastructure
- Frontend — that is Phase 5

---

## Phase 5: Query Builder UI — GDE Frontend

**Goal:** Build the GDE Query Builder frontend per [GDE-UI-SPEC-v2.1.md](./GDE-UI-SPEC-v2.1.md). Five screens (S1–S5), four modals (M1–M4), one settings panel (P1), design system, and Curator tools. The UI consumes the Phase 3 API layer and renders Phase 1 kernel types.

**Status:** Not Started

**Source spec:** `project/GDE-UI-SPEC-v2.1.md` — all section references below (UI §X) refer to this document.

**Sequencing:** Phase 5 MAY begin in parallel with Phases 3–4 if the API mocking strategy (see 5.1) is in place. Phase 5 is NOT blocked on Phase 3 completion. However, **Phase 5 integration testing (5.11) IS blocked on Phase 3** — UI compliance tests require live API endpoints, not mocks. The Orchestrator must decide the parallel-vs-sequential relationship before Phase 5 planning begins.

**Dependencies:** Phase 1 types (`UIBlock`, `InputParameter`, `OutputBind`, `TranslatedError`, `NarrativeResult`) are the data contract — these MUST be finalized before Phase 5 starts. Phase 3 API endpoints must be available (live or mocked) before UI integration.

### 5.1 Project Scaffolding and Design System Foundation

**Status:** Not Started | **Priority:** Critical

**Acceptance Criteria:**
- [ ] Frontend framework decision made and documented in `project/DECISIONS.md` (ADR required — Orchestrator approval)
- [ ] Project structure created (separate directory or monorepo workspace — Orchestrator decision)
- [ ] Design tokens implemented: spacing scale (UI §5.5), color palette (UI §17.1), typography scale (UI §16.2), border radius (UI §15.3), elevation model (UI §15.2)
- [ ] Motion tokens implemented: duration scale (UI §14.2), easing functions (UI §14.3)
- [ ] `prefers-reduced-motion` respected globally (UI §14.4)
- [ ] 8px baseline grid enforced (UI §5.1)
- [ ] 12-column grid layout with responsive breakpoints (UI §5.2–5.3)
- [ ] IBM Plex font families loaded: Serif (display), Sans (UI), Mono (admin only) (UI §16.1)
- [ ] Component library stubs: Button variants (UI §12.1), Input field states (UI §12.2)
- [ ] **API mocking layer implemented:** If Phase 5 begins before Phase 3 is complete, a mock API server or fixture-based client must be in place, returning responses that conform to the Phase 3.1–3.6 response shapes. Mocks must use the same TypeScript types from Phase 1.1. Mock data must include: subject types, catalog with Tier 1/2/3 mappings, entity search results, at least one override entry, and narrative results. Mocks are NOT a substitute for Phase 5.11 integration testing — those require live endpoints.

### 5.2 Screen 1 — Subject Selection (UI §6)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Page heading: "What type of record are you looking for?" (UI §6.3)
- [ ] Subject type cards populated from `GET /rpm/subject-types`: icon, `ui.subjectLabel`, one-line description (UI §6.3)
- [ ] Search field: live filter 150ms debounce on `ui.subjectLabel` (UI §6.3)
- [ ] Card states: default, hover, selected (accent fill + checkmark), disabled
- [ ] "All types" expandable: collapsed by default, top 6 shown (UI §6.3)
- [ ] Continue button: "Find [Subject Type] records →", disabled until selection (UI §6.3)
- [ ] Empty catalog state: "No search options are available…" message (UI §6.3)
- [ ] Responsive: 3-col desktop, 2-col tablet, 1-col mobile (UI §6.3)

### 5.3 Screen 2 — Query Builder / Discovery Workspace (UI §7)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Left sidebar: two-section layout with visible divider (UI §7.3)
- [ ] "Common questions" strip: top-N Compound Intents by `frequencyScore`, hidden if none exist (UI §7.3.1)
- [ ] Full catalog: specificity-ranked, grouped by `ui.group`, expandable/collapsible groups (UI §7.3.2)
- [ ] Sidebar search: 150ms debounce, matches `ui.label` + `ui.description` (80 chars) + `ui.examples` (UI §7.3.2, §13.7)
- [ ] "Auto" badge: visible to `curator` role only, never shows internal values (UI §12.6)
- [ ] Center column: clause chips with intent label + parameter summary (UI §7.4, §12.7)
- [ ] Composition mode selector: "All must match" / "Any can match" / "Chained search" — visible when 2+ clauses (UI §7.4)
- [ ] "Chained search" shown only when `targetToSubject` join is possible (UI §7.4)
- [ ] Chained search rendering: directional flow with connector labels (UI §13.5)
- [ ] Query summary bar: sticky, shows subject type + clause count + mode (UI §7.5)
- [ ] One-time dismissible discovery note on first S2 visit (UI §18.2)

### 5.4 Screen 3 — Intent Detail Panel (UI §8)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Slide-in panel from right at desktop, overlay at tablet, full-screen at mobile (UI §8.2)
- [ ] Panel header: group label (muted), intent title (H2), edit icon [✏] for curator only (UI §8.3)
- [ ] Description from `ui.description`, hidden if empty (UI §8.4)
- [ ] Example questions: collapsible bulleted list from `ui.examples`, hidden if empty, max 3 before "Show more" (UI §8.4)
- [ ] Input fields rendered by `inputType` from Control Inference (UI §8.5):
  - [ ] `text` → single-line text input with `hint` as placeholder
  - [ ] `number` → numeric input + comparison operator dropdown + optional unit label (UI §12.3); **never a slider**
  - [ ] `date` → date picker; `dateRange` → two date pickers
  - [ ] `entitySearch` → autocomplete field, live SPARQL query, spinner after 250ms, max 8 dropdown items (UI §8.5)
  - [ ] `select` → dropdown from `selectOptions`
  - [ ] `boolean` → radio group "Yes" / "No" only (UI §8.5)
- [ ] Output binds section: collapsed by default, "What this search returns" (UI §8.6)
- [ ] "Add to query" / "Update condition" / "Cancel" buttons with correct enabled states (UI §8.7)
- [ ] Inline validation errors: `TranslatedError.userMessage` below field on blur (UI §19.2)
- [ ] Focus trap when panel is open (UI §21.2)
- [ ] Panel transitions: `translateX` slide-in/out per motion tokens (UI §14.4)

### 5.5 Screen 4 — Query Review and Submit (UI §9)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Plain-language query summary: subject type, composition mode, numbered clause list (UI §9.2–9.3)
- [ ] Per-clause [Edit] links returning to S3 pre-populated (UI §9.3)
- [ ] "This search will return" section: deduplicated `outputBind.label` values (UI §9.3)
- [ ] "Run search" button: loading state → navigate to S5 (UI §9.3)
- [ ] "← Back to editing" returns to S2 preserving state (UI §9.3)

### 5.6 Screen 5 — Results View (UI §10)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] Results table: columns from `outputBind.label`, row numbers, sortable headers (UI §10.5)
- [ ] `NarrativeSummary` subtitle per row: `text-body-sm`, italic, `neutral-600`, max 2 lines with "Show full explanation" (UI §10.3, §12.4)
- [ ] Truncated narrative for Firewall cases: shorter sentence, no error; "Partial path" tag for curator only (UI §10.3)
- [ ] "Show path" / "Hide path" toggle per row: `narrativePath` as breadcrumb strip (UI §10.4, §12.5)
- [ ] Breadcrumb strip: resolved labels only, arrow separators, horizontally scrollable, max 8 segments (UI §12.5)
- [ ] Pagination: default 25, size selector 10/25/50/100 (UI §10.5)
- [ ] Export dropdown: CSV, Excel, Copy to clipboard (UI §10.5)
- [ ] Empty state: "No records matched your search" with suggestions (UI §10.5)
- [ ] Loading state: skeleton rows with CSS shimmer, 30s timeout → Modal M3 (UI §10.5)
- [ ] Stagger animation: 30ms delay × row index, capped at 10 rows (UI §14.4)

### 5.7 Modals M1–M4 (UI §7.4, §19.4, §11.4)

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] M1 — Clause Delete Confirmation: shown when 2+ clauses exist (UI §13.4)
- [ ] M2 — Clear Query Confirmation: shown when changing subject type with existing clauses (UI §13.1)
- [ ] M3 — System Error Modal: error icon, `userMessage`, "Contact administrator" + "Return to search" (UI §19.4)
- [ ] M4 — Label Override Modal (curator only, 480px wide): Label (required, max 80 chars), Description (optional), Group (optional), Save/Cancel/Revert (UI §11.4)
- [ ] M4 Save: calls `POST /rpm/overrides`, toast on success, inline error on failure (UI §11.4)
- [ ] M4 Revert: inline confirmation "This will restore…", calls `DELETE /rpm/overrides/{overrideId}` (UI §11.4)
- [ ] M4 partial catalog rebuild feedback: sidebar updates within 5s, spinner if longer (UI §11.4)
- [ ] All modals: backdrop fade, focus trap, Escape to close (M1–M3), accessible roles (UI §14.4, §21.2–21.3)

### 5.8 Settings Panel P1 and Curator Tools (UI §11)

**Status:** Not Started | **Priority:** Medium

**Acceptance Criteria:**
- [ ] Gear icon [⚙] in header: visible to `curator` only, hidden (not disabled) for `sme` (UI §11.1)
- [ ] Settings panel: right-side drawer 320px, contains Schema Refresh + Override History + last crawl timestamp (UI §11.1)
- [ ] Schema Refresh control: "Refresh now" button with loading state, success/failure notifications, help text about schema vs. data freshness (UI §11.2)
- [ ] Override History list: original label → current label + [Revert] per row; empty state message (UI §11.3)
- [ ] No technical content in panel: no endpoint URL, tier counts, frequency scores (UI §11.1)
- [ ] Panel transitions per motion tokens (UI §14.4)

### 5.9 Accessibility and Responsive Behavior

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] WCAG 2.1 Level AA all screens; Level AAA targeted for S1–S4 (UI §21.1)
- [ ] Full keyboard navigation: tab order, focus trapping on panels/modals, Escape to close (UI §21.2)
- [ ] Screen reader support: all ARIA roles, labels, and live regions per UI §21.3
- [ ] Color independence: no information by color alone (UI §21.4)
- [ ] 200% browser zoom without content loss (UI §21.5)
- [ ] Responsive: desktop (3-col), tablet (2-col), mobile (1-col) with feature parity (UI §22)
- [ ] Mobile: sidebar as bottom sheet, detail panel as full-screen modal, settings panel as full-screen modal (UI §22.3)
- [ ] Minimum touch target: 44px × 44px (UI §22.3)
- [ ] Navigation guards: unsaved changes prompt, browser back button intercepted (UI §13.9)

### 5.10 Performance and Offline

**Status:** Not Started | **Priority:** Medium

**Acceptance Criteria:**
- [ ] First Contentful Paint < 1.5s (UI §23.3)
- [ ] Time to Interactive < 3.0s (UI §23.3)
- [ ] Intent catalog load < 500ms after catalog built (UI §23.3)
- [ ] Entity search autocomplete < 400ms first result (UI §23.3)
- [ ] Narrative rendering < 5ms per row on the client (kernel guarantees ≤ 5ms generation; UI must not add significant overhead in rendering `narrativeSummary` and `narrativePath`)
- [ ] Initial JS bundle < 200KB gzipped (UI §23.3)
- [ ] Offline: S1–S4 usable from cached catalog (IndexedDB or service worker) (UI §23.4)
- [ ] Offline S5: "Results require a connection" message (UI §23.4)
- [ ] Stale cache banner after 24 hours (UI §23.4)

### 5.11 UI Compliance Tests

**Status:** Not Started | **Priority:** High

These are the UI-side obligations from RPM §33 and UI Spec §20.

**Acceptance Criteria:**
- [ ] CT-01 (UI surface): No IRI, namespace prefix, blank node ID, tier value, frequency score, shorthand, `overrideId`, or `labelSource` in any rendered output including narratives and breadcrumbs
- [ ] CT-10 (UI rendering): `xsd:decimal` renders numeric input + operator dropdown (never slider); `xsd:dateTime` renders date picker; ObjectProperty renders entity search autocomplete
- [ ] CT-14 (UI rendering): `NarrativeSummary` contains subject label + predicate verb + object label; no prohibited terms in narratives or breadcrumbs
- [ ] CT-15 (UI behavior): Curator label change via M4 appears in sidebar within 5 seconds without page reload; survives process restart
- [ ] Browser testing across Chrome 110+, Firefox 110+, Safari 16+, Edge 110+ (UI §23.1)
- [ ] Accessibility audit: automated (axe-core or equivalent) + manual screen reader testing

**NOT in scope for Phase 5:**
- Backend engine changes — that is Phases 1–3
- Compliance test changes — that is Phase 4
- Deployment — that is Phase 6

**Decisions Required Before Phase 5:**
- Frontend framework (React, Vue, Svelte, etc.) — ADR required
- Monorepo workspace or separate repository
- CSS approach (CSS modules, Tailwind, styled-components, etc.)
- Open Questions from UI Spec §24 — blocking items must be resolved before the affected task begins (see §OQ Resolution Schedule below)

### OQ Resolution Schedule

Open Questions from UI Spec §24 that block specific Phase 5 tasks. The Orchestrator MUST resolve these before the blocked task begins. Non-blocking OQs may be deferred to post-launch.

| OQ | Question | Blocks | Deadline |
|---|---|---|---|
| OQ-01 | Max catalog size → alphabetical sorting within groups? | 5.3 | Before Phase 5.3 |
| OQ-02 | Entity search returns type info alongside label? | 5.4 | Before Phase 5.4 |
| OQ-03 | Excel export day-one or post-launch? | 5.6 | Before Phase 5.6 |
| OQ-05 | Support contact mechanism for M3 | 5.7, 6.1 | Before Phase 5.7 |
| OQ-06 | User account management in scope? | 3.2 (role enforcement) | Before Phase 3.2 |
| OQ-07 | Max Compound Intents per subject type → strip scroll? | 5.3 | Before Phase 5.3 |
| OQ-08 | WCAG AAA required by policy? | 5.9 | Before Phase 5.9 |
| OQ-09 | Max result set size → virtualized table? | 5.6 | Before Phase 5.6 |
| OQ-10 | Chained search at launch or deferred? | 5.3, 5.4, 5.5 | **Before Phase 5.3** |
| OQ-11 | "Auto" badge at launch or post-launch? | 5.3 | Before Phase 5.3 |
| OQ-12 | Settings panel support link URL | 5.8, 6.1 | Before Phase 5.8 |
| OQ-04 | Result row detail view | Not blocking | Deferred to post-v1 |

---

## Phase 6: Deployment and Operational Readiness

**Goal:** Deploy the GDE v2.1 system via GitHub Pages (UI) and GitHub Actions (CI/CD). See ADR-003.

**Status:** Not Started

**Deployment architecture:**
- **GitHub Pages** — hosts the Query Builder UI as a static site. The RPM kernel runs client-side (edge-canonical, Architecture Principle §1).
- **GitHub Actions** — CI/CD pipeline for build, test, purity, CT suite, and automatic deployment to Pages on merge to `main`.
- **API server** — Phase 3 endpoints (SPARQL connector, entity search, override API, refresh) require a server runtime. GitHub Pages serves static assets only. The API hosting decision (e.g., Cloudflare Workers, Vercel serverless, self-hosted) is deferred to Phase 6.1 and requires an ADR.

### 6.1 Configuration and Environment

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] SPARQL endpoint URL configurable (environment variable or runtime config, not baked into static build)
- [ ] Tier thresholds configurable: `promotionThreshold`, `minInstanceCount`, `maxHopDepth`, `maxCompoundIntentsPerPair`
- [ ] Startup timeout configurable (default 60s) with tier time allocation
- [ ] Scheduled refresh interval configurable (default disabled)
- [ ] Override store file path configurable
- [ ] Static registry file path configurable (optional)
- [ ] Role header names configurable
- [ ] Support contact URL configurable (for M3 "Contact your administrator" — UI Spec §19.4, OQ-05/OQ-12)
- [ ] API server hosting decision made and documented (ADR required — affects Phase 3 endpoint deployment)

### 6.2 CI/CD Pipeline — GitHub Actions

**Status:** Not Started | **Priority:** High

**Acceptance Criteria:**
- [ ] `.github/workflows/ci.yml` runs on every push/PR to `main`: build → test → purity → CT suite
- [ ] All 15 CTs run on every push/PR
- [ ] CT-11 runs against seeded test endpoint (provisioned as a GitHub Actions service container or in-memory fixture)
- [ ] CT-15 runs with clean override store
- [ ] Trigger matrix from §33.11 implemented
- [ ] Frontend build + lint + UI compliance tests added to CI pipeline
- [ ] Browser testing in CI (headless Chrome/Firefox via Playwright or similar)
- [ ] `.github/workflows/deploy.yml` added: on merge to `main`, builds UI static assets and deploys to GitHub Pages via `actions/deploy-pages@v4`
- [ ] GitHub Pages configured: source = GitHub Actions (not branch-based)
- [ ] Deploy workflow is gated on CI passing — no deployment if any test fails

### 6.3 Operational Monitoring

**Status:** Not Started | **Priority:** Medium

**Acceptance Criteria:**
- [ ] Discovery Report available at `/rpm/discovery-report` (API server)
- [ ] Crawl duration, tier results, error counts logged
- [ ] Override activity logged with provenance
- [ ] Health check endpoint (API server)
- [ ] Frontend performance monitoring: FCP, TTI, bundle size tracking (Lighthouse CI in GitHub Actions or equivalent)

**NOT in scope for Phase 6:**
- Multi-tenant access control — deployment environment concern
- Horizontal scaling — future concern
- User account management — OQ-06, deferred

---

## Cross-Phase Constraints

These apply to ALL phases at ALL times.

### Engine Constraints (Phases 1–4)

1. **Spec tests MUST pass:** `npm run build`, `npm test`, `npm run test:purity` — every change, every phase.
2. **Kernel purity:** `src/kernel/` MUST NOT import from `src/adapters/` or `src/composition/`.
3. **Determinism:** Kernel code MUST NOT reference `Date.now()`, `Math.random()`, `process.env`, `fetch`, or any non-deterministic API.
4. **No spec test modification:** `tests/determinism.test.ts`, `tests/no-network.test.ts`, `tests/snapshot.test.ts` MUST NOT be altered.
5. **No runtime dependencies** added to `package.json` without explicit Orchestrator approval.
6. **>3 file change rule:** If a change requires modifying more than 3 files simultaneously, STOP and request Architectural Review.

### UI Constraints (Phase 5)

7. **SME Firewall:** No IRI, namespace prefix, class name, predicate name, blank node ID, tier value, frequency score, shorthand, `overrideId`, `labelSource`, `inputTypeSource`, `source` field value, or internal identifier may appear in any SME-facing rendered output — enforced by CT-01 and §34.4.
8. **Curator Firewall:** Curators see plain-language fields only. No shorthand IRIs, `overrideId`, `appliesTo`, or internal identifiers in Curator surfaces (UI §2.1, §11.4).
9. **Control Inference fidelity:** `inputType: "number"` renders as numeric input + operator dropdown, **never a slider** (UI §8.5, §12.3, §18.3). UI MUST NOT override Control Inference mappings.
10. **Entity search freshness:** Entity search autocomplete MUST query the live SPARQL endpoint. MUST NOT cache results (RPM §32.9.4, UI §13.6).
11. **No fabricated content:** If a field (`ui.description`, `ui.examples`, hint) is empty, hide the section — do not show placeholder text or synthetic content (UI §8.4).
