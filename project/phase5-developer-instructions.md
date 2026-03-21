# Phase 5 — Query Builder UI + Local Graph Adapter
## Developer Instructions

**Spec references:** `project/RPM-v2.1-FINAL.md`, `project/GDE-UI-SPEC-v2.1.md`  
**Prerequisite phases:** 0–4 complete (307 tests passing, clean working tree)  
**Blocked on Orchestrator decisions:** Framework ADR (§5.1), API hosting ADR (§6.1)

---

## Scope

Phase 5 has two parallel workstreams:

**5.A — Local Graph Adapter** (no framework decision needed, start immediately)  
Build the demo-mode adapter that lets the engine run against a local JSON-LD file instead of a SPARQL endpoint. This unblocks demo use before the API hosting ADR is resolved.

**5.B — Query Builder Frontend** (blocked on framework ADR)  
Build the GDE Query Builder UI per `GDE-UI-SPEC-v2.1.md`. Five screens, four modals, one settings panel, full Curator tools.

Both workstreams produce zero changes to `src/kernel/`. All new code lives in `src/adapters/local/` (5.A) and `src/ui/` (5.B).

---

## Part A — Local Graph Adapter

### Overview

The demo graph provided by the Orchestrator is a CCO-grounded JSON-LD document representing a single Person (`Jane Doe`) and an Organization (`Tech Giant`) with employment, birth, address, and email relationships. The adapter runs the full three-tier discovery pipeline — Tier 1, Tier 2, Tier 3 — against this file without a SPARQL endpoint.

The adapter is not a stub. It is a full implementation of the same pipeline that runs against Oxigraph in production, just with JavaScript functions replacing the SPARQL wire calls. The returned `AssemblyResult` is structurally identical to what the SPARQL adapter produces. The Phase 3 API server requires no changes.

### Files to create

```
src/adapters/local/
  json-ld-loader.ts         — parse JSON-LD into a flat triple store
  local-query-evaluator.ts  — Q1–Q6 as JavaScript over the triple store
  local-discovery.ts        — orchestrate all three tiers, return AssemblyResult
```

No other files change. No new runtime dependencies.

---

### 5.A.1 — `json-ld-loader.ts`

**Purpose:** Parse a JSON-LD document file into a flat array of RDF triples.

**Exports:**

```typescript
export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  isLiteral: boolean;
  datatype?: string;
  language?: string;
}

export interface LocalTripleStore {
  triples: Triple[];
  prefixes: Record<string, string>;
}

export async function loadJsonLdGraph(filePath: string): Promise<LocalTripleStore>
export function parseJsonLdDoc(doc: Record<string, unknown>): LocalTripleStore
export function expandIri(term: string, prefixes: Record<string, string>): string
```

**Behavioral contract:**

1. Read the file at `filePath` as UTF-8 JSON. Throw if the file does not exist or is not valid JSON.
2. Extract `@context` and build a prefix map. Keys are prefixes (e.g. `"cco"`), values are base IRIs (e.g. `"http://www.ontologyrepository.com/CommonCoreOntologies/"`). Ignore `@vocab`, `@base`, `@language` for now.
3. Walk every node in `@graph` (or the root document if no `@graph`). For each node:
   - Determine the subject IRI: `expandIri(node["@id"])` if present; otherwise generate a stable blank node `_:b{n}` using a counter.
   - For each `@type` value, emit a triple: `(subject, rdf:type, expandIri(typeValue))`.
   - For each other key/value pair, call the recursive value handler.
4. The recursive value handler:
   - If the value is an array, recurse on each element.
   - If the value is a plain object with `@value`, emit a literal triple.
   - If the value is a plain object without `@value`, treat it as a nested node. Recurse with `extractNode`, which returns the nested subject IRI. Emit `(subject, predicate, nestedSubject)` as an IRI triple.
   - If the value is a primitive string/number/boolean, emit a literal triple with appropriate XSD datatype.
5. Reset the blank node counter at the start of each `loadJsonLdGraph` call. This ensures repeated calls to the same file produce identical blank node IDs.

**What the demo graph requires:**

Your graph uses `val` as a shorthand for `cco:has_value` in `@context`. The loader must expand this: `val` → `http://www.ontologyrepository.com/CommonCoreOntologies/has_value`. Verify by asserting that the `val: "Jane"` literal on `ex:Name_Jane_001` becomes the triple:
```
(ex:Name_Jane_001, cco:has_value, "Jane"^^xsd:string)
```

**Tests — `tests/json-ld-loader.test.ts` (8 tests minimum):**
- IRI expansion: `cco:Person` expands correctly
- Shorthand alias: `val: "Jane"` expands to full `cco:has_value` predicate
- `@type` assertion produces `rdf:type` triple
- Nested object produces subject-predicate-object IRI triple and recurses
- Array value produces multiple triples
- Explicit `@value` produces literal triple
- Blank node assignment for nodes without `@id`
- Blank node counter resets between `loadJsonLdGraph` calls

---

### 5.A.2 — `local-query-evaluator.ts`

**Purpose:** Implement the RPM introspection queries Q1, Q2, Q3, Q4, Q6 (and a simplified Q5) as JavaScript functions over a `LocalTripleStore`. These functions return the same output shapes as the SPARQL connector, so the tier generators receive identical input regardless of whether data came from Oxigraph or a local file.

**Exports:**

```typescript
export function runQ1(store: LocalTripleStore): Q1Row[]
export function runQ2(store: LocalTripleStore): Q2Row[]
export function runQ3(store: LocalTripleStore): PropertyChain[]
export function runQ4(store: LocalTripleStore): Map<string, number>
export function runQ5(store: LocalTripleStore, minHops?: number, maxHops?: number): SubjectClassSample[]
export function runQ6(store: LocalTripleStore): Map<string, string[]>
```

Where `Q1Row`, `Q2Row` are from `src/kernel/tier1-discovery.ts`; `PropertyChain` from `src/kernel/tier2-discovery.ts`; `SubjectClassSample` from `src/kernel/tier3-discovery.ts`.

**Implementation notes per query:**

**Q1** — Build two indexes: `subjectTypes: Map<string, Set<string>>` (subject IRI → class IRIs) and `bySubject: Map<string, Triple[]>` (subject IRI → all triples). For each non-literal, non-structural predicate triple where the subject has at least one `rdf:type`, emit one `Q1Row` per unique `(subjectClass, predicate, objectClass)` combination. The object class is the first `rdf:type` of the object IRI, if any. Structural predicates to exclude: `rdf:type`, `rdfs:label`, `owl:sameAs`.

**Q2** — Same indexes. For each literal triple where the subject has at least one `rdf:type`, emit one `Q2Row` per unique `(subjectClass, predicate, literalType)`. `literalType` is `triple.datatype ?? "xsd:string"`.

**Q3** — Find triples with predicate `owl:propertyChainAxiom`. The object is a blank node that is the head of an `rdf:List`. Traverse `rdf:first` / `rdf:rest` links until `rdf:nil` to extract the ordered chain members. Return `PropertyChain[]` with the list members as `chainProperties: string[]`. Skip chains with fewer than 2 members.

**Q4** — Count `rdf:type` triples by object class. Return `Map<classIri, count>`.

**Q5** — BFS from each typed subject node, collecting paths of length `minHops` to `maxHops`. Record each path as a `DiscoveredPath` with `instanceCount: 1`. This is not a statistical sample — it is an exhaustive walk. For the demo graph with one Person instance this means all multi-hop paths from Jane Doe are returned. The Tier 3 generator will apply threshold rules; very small graphs will produce few or no Tier 3 promotions. That is correct behavior.

**Q6** — Find triples with predicate `owl:oneOf`. The object is an `rdf:List` head. Traverse it to collect member IRIs. Return `Map<classIri, string[]>` from class to its enumerated individuals.

**Cycle protection:** All BFS/traversal functions (Q3 list traversal, Q5 BFS) must use a `visited: Set<string>` to prevent infinite loops on malformed graphs.

**Tests — `tests/local-query-evaluator.test.ts` (12 tests minimum):**  
Build a small fixture triple store using `parseJsonLdDoc` on the Jane Doe graph (inline, no file I/O in tests):
- Q1: finds `(cco:Person, cco:designated_by, cco:PersonGivenName)` pattern
- Q1: excludes `rdf:type` from results
- Q1: deduplicates identical patterns
- Q2: finds `(cco:PersonGivenName, cco:has_value, xsd:string)` pattern
- Q3: extracts empty chains from a graph with no `owl:propertyChainAxiom` (returns `[]`)
- Q4: counts one `cco:Person` instance, one `cco:Organization` instance
- Q5: returns at least one path of length 3 from `cco:Person`
- Q5: no cycles even on graphs with shared nodes
- Q6: returns empty map for a graph with no `owl:oneOf`
- Integration: Q1 + Q2 together cover all predicate patterns on the demo graph

---

### 5.A.3 — `local-discovery.ts`

**Purpose:** Orchestrate the full three-tier discovery pipeline against a local JSON-LD file and return an `AssemblyResult` plus the `OntologyClosure` and `TypeResolver` needed to initialize the Phase 3 API server.

**Exports:**

```typescript
export interface LocalDiscoveryOptions {
  skipTier3?: boolean;
  tier3Config?: Partial<Tier3Config>;
  endpointLabel?: string;
}

export async function runLocalDiscovery(
  graphPath: string,
  options?: LocalDiscoveryOptions,
): Promise<AssemblyResult & { closure: OntologyClosure; typeResolver: TypeResolver }>
```

**Execution sequence:**

1. `loadJsonLdGraph(graphPath)` — parse JSON-LD into triple store.
2. Build two indexes from the triple store: `bySubject` and `byPredicate` (same as evaluator — this is the only duplication and is intentional to keep the loader stateless).
3. `buildClosureFromGraph(triples, bySubject, byPredicate)` — construct `OntologyClosure`. See below.
4. `createOwlTypeResolver(closure)` — create the type resolver.
5. `runQ1(store)` + `runQ2(store)` — get tier 1 inputs.
6. `generateTier1Mappings(q1, q2, closure, typeResolver)` — tier 1 mappings.
7. `runQ3(store)` — get tier 2 inputs.
8. `generateTier2Mappings(chains, closure, typeResolver)` — tier 2 mappings.
9. If `!skipTier3`: `buildExistingPairs([...tier1, ...tier2])`, `runQ5(store)`, `generateTier3Mappings(...)` with lowered thresholds (see below).
10. `assembleRegistry(tierResults, closure, typeResolver, undefined, endpointLabel, duration)`.
11. Stamp `report.timestamp` and `registry.generatedAt` with `new Date().toISOString()`. The kernel cannot do this (determinism constraint); the adapter must.
12. Return `{ ...assemblyResult, closure, typeResolver }`.

**`buildClosureFromGraph` — what to extract:**

Populate `OntologyClosure.classes` and `OntologyClosure.properties` from the triple store:

- **Classes:** every IRI that appears as an `rdf:type` object or as `rdfs:subClassOf` subject/object.
  - `labels`: triples where predicate is `skos:prefLabel` or `rdfs:label` and subject is the class IRI.
  - `annotations`: triples where predicate is `rdfs:comment` or `skos:definition`.
  - `superClasses`: objects of `rdfs:subClassOf` triples where subject is the class IRI.
  - Always add `owl:Thing` as a superclass fallback for every class that has no other declared superclass, so subsumption distance calculations reach a common root.
  - `enumeratedIndividuals`: populated from Q6 results for this class IRI.

- **Properties:** every IRI that appears as a predicate in the triple store, excluding the structural set (`rdf:type`, `rdfs:label`, `rdfs:comment`, `rdfs:subClassOf`, `rdfs:domain`, `rdfs:range`, `skos:prefLabel`, `skos:definition`, `owl:propertyChainAxiom`, `owl:oneOf`, `owl:sameAs`, `rdf:first`, `rdf:rest`).
  - `labels`: same pattern as classes.
  - `annotations`: same pattern as classes.
  - `domain`: objects of `rdfs:domain` triples where subject is the property IRI.
  - `range`: objects of `rdfs:range` triples where subject is the property IRI.

**Demo graph labeling reality check:**

The Jane Doe graph does not include `rdfs:label` annotations on CCO terms. The CCO ontology is not bundled. This means the Labeling Law will fall through to Level 6 (IRI cleaning) for every predicate and class. Results:

- `cco:Person` → "Person" ✓
- `cco:designated_by` → "Designated By" ✓
- `obo:RO_0000053` → "RO 0000053" → **fails quality threshold** → `exposure: "internal"` → suppressed from SME catalog ✗

This is correct engine behavior, not a bug. The predicate `obo:RO_0000053` (which represents `bearer of` / role attribution in the CCO model) gets suppressed because its local name has no alphabetic word content. The Orchestrator should provide a label overlay file alongside the demo graph to surface the relationships they want to demonstrate. Instructions for this are in the supplementary note at the end of this document.

**Tier 3 config for small graphs:**

The default Tier 3 thresholds require `minInstanceCount: 100` and `promotionThreshold: 0.70`. The demo graph has one Person instance. Apply these overrides automatically when `skipTier3` is false:

```typescript
const demoConfig: Tier3Config = {
  ...DEFAULT_TIER3_CONFIG,
  minInstanceCount: 1,
  promotionThreshold: 0.50,
  minPathLength: 3,
};
```

This allows Tier 3 to promote compound paths even on single-instance graphs. The resulting `frequencyScore` values will be 1.0 for any path that is the only path between a subject-object pair — accurate but not statistically meaningful. Flag this in the Discovery Report by setting `report.errors` to include `"Local graph mode: Tier 3 thresholds lowered for demo. Frequency scores are not statistically representative."`.

**Tests — `tests/local-discovery.test.ts` (10 tests minimum):**
- Full pipeline on Jane Doe graph produces at least one Tier 1 mapping
- `cco:Person` appears in `catalog.subjectTypes`
- `obo:RO_0000053` mapping is `exposure: "internal"` (quality threshold suppression)
- `registry.generatedAt` is an ISO timestamp (not empty string)
- `report.timestamp` is set
- `closure.classes` contains `cco:Person`
- `closure.properties` contains `cco:designated_by`
- `typeResolver.isSubclassOf("cco:Person", "owl:Thing")` returns true
- `runLocalDiscovery` with `skipTier3: true` returns faster and produces no tier 3 mappings
- AssemblyResult shape matches production shape (same fields, no extra/missing keys)

---

### 5.A.4 — Demo Server Startup

Add a startup entry point at `src/demo.ts`:

```typescript
import { runLocalDiscovery } from "./adapters/local/local-discovery.js";
import { registerRpmRoutes } from "./adapters/integration/rpm-api.js";
import { createHttpServer } from "./adapters/integration/http-server.js";
import { loadOverrideStore } from "./adapters/integration/rpm-api.js";  // expose if needed
import type { ServerState } from "./adapters/integration/rpm-api.js";

const graphPath = process.argv[2] ?? "./data/demo-graph.jsonld";

console.log(`Loading graph from ${graphPath}...`);
const { registry, catalog, report, closure, typeResolver } =
  await runLocalDiscovery(graphPath, {
    skipTier3: false,
    endpointLabel: `local:${graphPath}`,
  });

console.log(`Discovered ${registry.mappings.length} mappings (` +
  `${catalog.subjectTypes.length} subject types)`);

const state: ServerState = {
  registry,
  catalog,
  closure,
  typeResolver,
  report,
  overrideStore: { "@type": "rpm:OverrideStore", version: "2.1.0", overrides: [] },
  overrideStorePath: "./rpm-overrides-demo.json",
  lastCrawlTimestamp: new Date().toISOString(),
};

const router = registerRpmRoutes(state);
const server = createHttpServer(router);
const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Demo API ready at http://localhost:${port}`);
  console.log(`  GET http://localhost:${port}/rpm/subject-types`);
  console.log(`  GET http://localhost:${port}/rpm/catalog`);
  console.log(`  GET http://localhost:${port}/rpm/discovery-report  (curator role)`);
});
```

Add to `package.json`:
```json
"scripts": {
  "demo": "node --experimental-vm-modules dist/demo.js"
}
```

The developer runs `npm run build && npm run demo -- ./data/jane-doe.jsonld` and the API is live.

---

## Part B — Query Builder Frontend

### Orchestrator decisions required before starting

The following decisions must be made and documented as ADRs in `project/DECISIONS.md` before any Phase 5.B code is written:

| Decision | Why it blocks |
|---|---|
| Frontend framework (React, Vue, Svelte, etc.) | All component code depends on this |
| CSS approach (Tailwind, CSS modules, styled-components) | Design token implementation depends on this |
| Monorepo structure or separate `ui/` directory | Affects all import paths |
| API base URL strategy (env var, config file, build-time constant) | `GET /rpm/catalog` calls depend on this |

Resolve Open Questions OQ-10 (chained search at launch?), OQ-01 (max catalog size?), OQ-07 (max Compound Intents per strip?) before Phase 5.3 starts. These are documented in `GDE-UI-SPEC-v2.1.md §24` with their blocking tasks.

### Layer rules

Phase 5.B code lives in `src/ui/` (or a separate `ui/` package if the Orchestrator chooses a workspace structure). It **must not** import from `src/kernel/` directly. All data flows through the Phase 3 HTTP API. The kernel TypeScript types may be imported for type annotation only — no runtime kernel function calls from the frontend.

### 5.B.1 — Design System Foundation

Before any screen is implemented, establish the design token layer. All values come from `GDE-UI-SPEC-v2.1.md` §5, §14–17.

**Required before any screen work:**
- Spacing scale (`space-1` through `space-8`, §5.5)
- Color palette: `neutral-*`, `accent-*`, `error-*`, `success-*`, `warning-*`, `curator-*` (§17.1)
- Typography scale with IBM Plex Serif (display), IBM Plex Sans (UI), IBM Plex Mono (admin only) (§16)
- Border radius tokens (§15.3)
- Elevation model: Level 0/1/2 only (§15.2)
- Motion tokens with `prefers-reduced-motion` respected globally (§14.2–14.4)
- 8px baseline grid enforcement (§5.1)

**Acceptance criteria:**
- `npm run build` passes with no TypeScript errors
- Design tokens available as CSS custom properties or equivalent
- IBM Plex fonts load from a self-hosted or CDN source
- `prefers-reduced-motion: reduce` collapses all durations to 0ms

### 5.B.2 — Screen 1: Subject Selection

**Spec:** `GDE-UI-SPEC-v2.1.md §6`

**Data source:** `GET /rpm/subject-types` → `{ subjectTypes: SubjectTypeEntry[] }`

**Key requirements:**
- Subject type cards populated from API response. Label from `subjectTypes[n].label`. Description from `subjectTypes[n].description`. Intent count badge from `subjectTypes[n].intentCount`.
- Search field: 150ms debounce, filters on `label`.
- Default: top 6 types visible, "Show all [N] types" expandable.
- Card states: default / hover / selected (accent fill + checkmark) / disabled.
- Continue button: "Find [label] records →". Disabled until a type is selected.
- Empty catalog state (API returns empty array): "No search options are available. The data source may not be connected. Contact your system administrator." — not an empty grid.
- Responsive: 3-col desktop, 2-col tablet, 1-col mobile.
- The gear icon [⚙] appears in the header for `curator` role users only. Role is determined by the `X-RPM-Role` header value stored in application state after login/role selection (or hardcoded for the demo).

### 5.B.3 — Screen 2: Query Builder

**Spec:** `GDE-UI-SPEC-v2.1.md §7`

**Data source:** `GET /rpm/catalog?subjectType={selectedType}` → `{ mappings: MappingDefinition[], compoundIntents: MappingDefinition[] }`

**Key requirements — sidebar (§7.3):**

The sidebar has two sections separated by a visible divider. Both sections must always be present if the catalog has content.

*"Common questions" strip (§7.3.1):*
- Shows the top-N entries from `compoundIntents` (API response), ranked by `frequencyScore` descending.
- N = min(5, compoundIntents.length). If N = 0, this section is hidden entirely — no empty heading.
- Heading: "★ Common questions". Use a star icon, not literal "★".
- Never display `frequencyScore`, tier value, shorthand, or any internal field to the SME.
- Optional: a subtle visual weight indicator (small bar or dot) for relative popularity. No numbers or percentages.

*Full catalog (§7.3.2):*
- Shows `mappings` from the API response, already specificity-ranked by the server.
- Grouped by `ui.group`. Group headings show intent count badge.
- Intent list item: primary = `ui.label`, secondary = `ui.description` (one line, ellipsis overflow).
- For `curator` role: show "auto" badge (§12.6) on items where `ui.labelSource === "iriCleaning"`. Never show this to `sme` role.
- Search field: searches `ui.label`, first 80 chars of `ui.description`, `ui.examples`. 150ms debounce. Clear button when text is present.

**Key requirements — query canvas (§7.4):**
- Clause chips: `ui.label` + plain-language parameter summary. [✕] removes. Click reopens S3.
- Composition mode selector (visible when 2+ clauses): "All must match" / "Any can match" / "Chained search". "Chained search" shown only when a `targetToSubject` join is possible given current clause types. If OQ-10 defers chained search, hide this option entirely — do not show disabled.
- "Add another condition": focuses sidebar search.
- Query summary bar: sticky, shows subject type label, clause count, composition mode. "Review query →" button disabled until all required fields are filled.

### 5.B.4 — Screen 3: Intent Detail Panel

**Spec:** `GDE-UI-SPEC-v2.1.md §8`

**Data source:** `GET /rpm/catalog/{shorthand}` → `MappingDefinition` with `ui.originalLabel`

**Key requirements:**
- Panel slides in from the right at desktop, overlays sidebar at tablet, full-screen at mobile.
- Group label (muted, all-caps), intent title (H2), edit icon [✏] for `curator` role only.
- Description hidden if `ui.description` is empty. No placeholder copy.
- Example questions hidden if `ui.examples` is empty. No placeholder copy. Max 3 before "Show more".
- Input fields rendered by `inputType` per §8.5 and §12.3:
  - `number` → numeric text input + operator dropdown left of field. **Never a slider.** Operator labels from §18.3 plain-language table.
  - `entitySearch` → autocomplete hitting `GET /rpm/entity-search?type={rangeClass}&q={query}`. 2 char minimum, 250ms debounce, max 8 results. Spinner after 250ms with no response. Selection fills field with label — never IRI.
  - `boolean` → radio group "Yes" / "No" only.
  - All others per spec table.
- "Add to query" enabled when all `required: true` fields have values.
- Focus trap when panel is open. Escape closes.

**Curator edit flow:**
- [✏] icon opens M4 (Label Override Modal).
- After save, panel header updates in place within 5 seconds — no panel close/reopen.

### 5.B.5 — Screen 4: Query Review and Submit

**Spec:** `GDE-UI-SPEC-v2.1.md §9`

**Key requirements:**
- Plain-language query summary: "Searching for: [subject type]", "Conditions: [mode label]".
- Numbered clause list with [Edit] links per clause.
- "This search will return" section: deduplicated `outputBind.label` values across all clauses.
- "Run search" button: loading state → calls `POST /rpm/compose` → navigates to S5.
- On `POST /rpm/compose` error (422): show `TranslatedError.userMessage` as banner. Do not navigate to S5.

### 5.B.6 — Screen 5: Results View

**Spec:** `GDE-UI-SPEC-v2.1.md §10`

**Data source:** `POST /rpm/compose` → `CGP_c`. Narratives generated client-side by calling the kernel's `generateNarrative` function (the one kernel import permitted in the UI — it is pure and has no I/O).

**Key requirements:**
- Results table: columns from `outputBind.label` values, row numbers, sortable headers.
- `NarrativeSummary` per row: italic, `neutral-600`, `text-body-sm`, spans full row width. Max 2 lines with "Show full explanation" expansion.
- Truncated narrative (Firewall case): shorter sentence, no error for SME. "Partial path" tag for `curator` role only (see §10.3).
- "Show path" / "Hide path" toggle: `narrativePath` as breadcrumb strip. Labels only, no IRIs. Arrow separators. Horizontally scrollable. Max 8 segments; "... [N more]" expansion.
- Pagination: default 25, size selector 10/25/50/100.
- Export dropdown: CSV, Excel (if OQ-03 resolved yes), Copy to clipboard.
- Loading state: skeleton rows, shimmer animation. 30-second timeout → M3.
- Empty state: "No records matched your search" with suggestions to change mode or broaden conditions.

### 5.B.7 — Modals M1–M4

**Spec:** `GDE-UI-SPEC-v2.1.md §7.4, §11.4, §19.4`

All modals: backdrop fade, focus trap, accessible `role="alertdialog"` (M1–M3) or `role="dialog"` (M4), Escape to close M1–M3.

**M4 — Label Override Modal (Curator only):**
- Fields: Label (required, max 80 chars), Description (optional), Group (optional).
- Do NOT expose `shorthand`, `overrideId`, `appliesTo`, or any internal field to the Curator.
- "Save changes" → `POST /rpm/overrides`. On success: close modal, toast "Label updated. Changes are live for all users." Intent row in sidebar updates within 5 seconds without page reload. Show spinner on the row if rebuild takes longer than 5 seconds.
- "Revert to original label" (visible only when `ui.originalLabel !== null`): inline confirmation "This will restore the auto-generated label '[ui.originalLabel]'. Are you sure?" with "Restore" / "Cancel". On confirm: `DELETE /rpm/overrides/{overrideId}`. Toast: "Label restored to original."
- The `overrideId` needed for DELETE is obtained from `GET /rpm/overrides` — never displayed to the Curator.

### 5.B.8 — Settings Panel P1 and Curator Tools

**Spec:** `GDE-UI-SPEC-v2.1.md §11`

- Gear icon [⚙] in header: visible to `curator` role only. Hidden (not disabled) for `sme` role.
- Settings panel (right drawer, 320px): Schema Refresh + Override History + last crawl timestamp.
- Schema Refresh: "Refresh now" button → `POST /rpm/refresh`. Loading state, success banner "Search options updated. [N] new search types added.", failure banner. Help text: "Refreshing updates the available search types. Individual records are always current — new items added to the database appear in search results immediately without refreshing." (This exact copy, verbatim.)
- Override History: list from `GET /rpm/overrides`. Each row: "original label → current label [Revert]". [Revert] calls `DELETE /rpm/overrides/{overrideId}`. Empty state: "No label overrides have been set."
- Settings panel must NOT display: endpoint URL, tier counts, frequency scores, shorthand IRIs, `overrideId` values.

### 5.B.9 — Accessibility and Responsive Behavior

**Spec:** `GDE-UI-SPEC-v2.1.md §21–22`

WCAG 2.1 AA required all screens. AAA targeted for S1–S4. All of the following are required, not optional:

- Full keyboard navigation in tab order matching visual reading order.
- Focus trapping on Intent Detail Panel, all modals, Settings Panel. Escape releases S3/M1–M3/P1. M4 requires explicit button action.
- ARIA roles: `role="dialog"` + `aria-labelledby` for S3 and P1. `role="alertdialog"` for M1–M3. `role="list"` + `role="listitem"` for intent lists.
- All icons: `aria-label` or `aria-hidden="true"`.
- Inline errors linked to inputs via `aria-describedby`.
- Loading states announced via `aria-live="polite"`.
- NarrativeSummary rendered as `<p>` — no additional ARIA needed.
- Breadcrumb path: `aria-label="Path that produced this result"` on container.
- 200% browser zoom without content loss.
- Minimum touch target 44px × 44px.
- Navigation guards: unsaved panel changes prompt on navigate-away. Browser back button intercepted.

### 5.B.10 — Performance Budget

**Spec:** `GDE-UI-SPEC-v2.1.md §23.3`

These are hard targets, not aspirations:

| Metric | Target |
|---|---|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3.0s |
| Catalog load (S2 initial) | < 500ms after catalog is ready |
| Entity search first result | < 400ms |
| Narrative rendering per row | < 5ms (kernel guarantees generation; UI must not add overhead) |
| Initial JS bundle (gzipped) | < 200KB |

### 5.B.11 — UI Compliance Tests

These tests must be automated and run in CI:

| Test | Assertion |
|---|---|
| CT-01 (UI surface) | Scan every rendered DOM node in S1–S5, M1–M4, P1. Assert no IRI, namespace prefix, blank node ID, tier value, frequency score, shorthand, `overrideId`, `labelSource`, `inputTypeSource`, `source` field value, or internal identifier appears in any text content or `aria-label` visible to SME role. |
| CT-10 (UI rendering) | `xsd:decimal` range renders a numeric input with an operator dropdown. Never a slider. Assert no `input[type=range]` anywhere in S3. |
| CT-14 (UI rendering) | NarrativeSummary contains subject label + predicate verb + object label. No prohibited terms in any `.narrative-summary` or `.breadcrumb-path` element. |
| CT-15 (UI behavior) | POST override via M4 → sidebar intent label updates within 5 seconds without `window.location.reload()`. Assert using a MutationObserver or polling assertion in the test. |

---

## Cross-cutting: One-time dismissible discovery note

On the SME's first visit to S2, show this note once (store dismissed state in `localStorage`):

> "Search options were automatically discovered from your data source. If a search type is missing or named incorrectly, contact a Curator."

**Prohibited words in this note:** ontology, graph, predicate, schema, Tier, crawl, IRI. Do not use them even if they seem clarifying.

---

## Supplementary Note: Label Overlay for the Demo Graph

The Orchestrator has provided a demo graph (`jane-doe.jsonld`) that uses CCO terms without inline `rdfs:label` annotations. Without labels, the Labeling Law falls through to IRI cleaning. Most CCO terms clean correctly (`cco:Person` → "Person", `cco:designated_by` → "Designated By"). However, OBO Relation Ontology terms like `obo:RO_0000053` (which encodes the employment role relationship) will be suppressed by the quality threshold because their local names are purely numeric after the prefix.

**To expose the employment relationship in the demo**, the Orchestrator should provide a label overlay file alongside `jane-doe.jsonld`. The overlay is a separate JSON-LD file containing only `rdfs:label` annotations for the predicates and classes they want visible:

```json
{
  "@context": {
    "cco": "http://www.ontologyrepository.com/CommonCoreOntologies/",
    "obo": "http://purl.obolibrary.org/obo/",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#"
  },
  "@graph": [
    { "@id": "obo:RO_0000053", "rdfs:label": "Has Role" },
    { "@id": "obo:RO_0000057", "rdfs:label": "Has Participant" },
    { "@id": "obo:RO_0001025", "rdfs:label": "Located In" }
  ]
}
```

The local discovery orchestrator should accept an optional `labelOverlayPath` parameter and merge that file's triples into the closure before running tier discovery. The developer should implement this as part of `LocalDiscoveryOptions`:

```typescript
export interface LocalDiscoveryOptions {
  skipTier3?: boolean;
  tier3Config?: Partial<Tier3Config>;
  endpointLabel?: string;
  labelOverlayPath?: string;  // add this
}
```

When `labelOverlayPath` is provided, load the overlay file, extract its triples, and add them to the closure's label arrays before tier generation runs. This takes effect on the labels already indexed for those IRIs. The Orchestrator controls which relationships are visible in the demo by editing the overlay — no code changes needed.

---

## Acceptance Criteria Summary

**Phase 5.A complete when:**
- [ ] `tests/json-ld-loader.test.ts` — 8+ tests passing
- [ ] `tests/local-query-evaluator.test.ts` — 12+ tests passing
- [ ] `tests/local-discovery.test.ts` — 10+ tests passing
- [ ] `npm run demo -- ./data/jane-doe.jsonld` starts server on port 3000
- [ ] `GET http://localhost:3000/rpm/subject-types` returns `cco:Person` and `cco:Organization`
- [ ] `GET http://localhost:3000/rpm/catalog` returns at least one smeSurface mapping
- [ ] `GET http://localhost:3000/rpm/discovery-report` (with `X-RPM-Role: curator` header) returns valid report
- [ ] No kernel files modified
- [ ] All prior tests still passing

**Phase 5.B complete when:**
- [ ] All five screens implemented per spec
- [ ] All four modals implemented per spec
- [ ] Settings panel implemented per spec
- [ ] CT-01, CT-10, CT-14, CT-15 UI compliance tests pass in CI
- [ ] WCAG 2.1 AA verified by automated axe-core scan on all screens
- [ ] Browser testing passes on Chrome 110+, Firefox 110+, Safari 16+, Edge 110+
- [ ] Performance budgets met (Lighthouse CI or equivalent)
- [ ] No kernel files modified
- [ ] All prior tests still passing

---

*These instructions are to be read alongside `project/RPM-v2.1-FINAL.md` and `project/GDE-UI-SPEC-v2.1.md`, which are the normative sources. In any conflict between this document and the spec documents, the spec documents win.*
