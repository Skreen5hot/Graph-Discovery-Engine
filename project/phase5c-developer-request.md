# Development Request — Local Execution Layer + Graph Upload
## Phase 5.C: Demo Completion

**Priority:** High — blocks demo  
**Prerequisite:** Phase 5.A complete (local adapter running), Phase 5.B S1–S5 built  
**Kernel changes:** None  
**New files:** 3 (executor, upload endpoint, upload UI component)  
**Modified files:** `rpm-api.ts`, `demo.ts`, `ServerState` interface  

---

## Context

The current demo has a critical gap: the system discovers graph structure and builds a query, but never executes the query against actual data. `POST /rpm/compose` returns a CGP (Canonical Graph Pattern) — a structural description of the traversal path. There is no layer that walks that pattern against the actual triple store and returns matching records. As a result, the Results View shows empty cells and placeholder narratives rather than real data.

Additionally, the demo is currently tied to a single graph file loaded at startup. The Orchestrator needs the ability to upload any JSON-LD file at runtime, trigger discovery, and immediately query the resulting catalog — without restarting the server.

This request specifies two workstreams that can be built in parallel:

- **5.C.1** — Local Query Executor (makes results work)  
- **5.C.2** — Graph Upload (makes the demo dynamic)

---

## 5.C.1 — Local Query Executor

### What it does

Walks a composed graph pattern against the in-memory triple store and returns real result rows. Wires entity search to return actual named entities from the graph.

### Files to create

```
src/adapters/local/local-executor.ts
```

### Files to modify

```
src/adapters/integration/rpm-api.ts     — add POST /rpm/execute, wire entity search
src/adapters/local/local-discovery.ts   — expose triple store on result
demo.ts                                 — pass triple store into ServerState
```

---

### `local-executor.ts` — specification

#### Types

```typescript
/** A single matched result row from executing a CGP against the triple store. */
export interface QueryResult {
  /** The IRI of the matched subject entity. */
  subjectIri: string;
  /** Role name → resolved display value (label or IRI-cleaned local name). */
  bindings: Record<string, string>;
}
```

#### Exported functions

```typescript
/**
 * Execute a CGP_c against a local triple store.
 * Returns one QueryResult per matched subject per clause.
 * For subjectToSubject composition, returns rows where all clauses match
 * the same subject (AND semantics).
 */
export function executeLocalQuery(
  cgpC: CGP_c,
  store: LocalTripleStore,
  closure: OntologyClosure,
): QueryResult[]

/**
 * Execute a single CGP clause pattern against the store.
 * Returns bindings for subjects that fully satisfy the pattern.
 */
export function executeSingleClause(
  cgp: CGP,
  store: LocalTripleStore,
  closure: OntologyClosure,
): QueryResult[]

/**
 * Search for entities of a given class whose resolved label matches the query.
 * Used by GET /rpm/entity-search.
 * Returns up to maxResults items, each with iri and label.
 */
export function searchEntities(
  classIri: string,
  query: string,
  store: LocalTripleStore,
  closure: OntologyClosure,
  maxResults?: number,
): Array<{ iri: string; label: string }>
```

#### `executeSingleClause` algorithm

The CGP `@graph` produced by `RPM_Expand` contains nodes with deterministic blank node IDs and `@type` and predicate links. But those blank nodes represent the *pattern shape*, not the data instances. The executor must walk the *original pattern steps* from the `MappingDefinition`, not the CGP nodes.

The correct approach is to look up the mapping's pattern from the registry by the CGP's `provenance.rulesApplied[0]` (which is `"expand:{shorthand}"`), then walk the pattern steps against the triple store:

```typescript
// Step 1: Identify the subject class from the mapping's domainClasses
// Step 2: Find all triple store subjects that have rdf:type matching domainClasses
// Step 3: For each candidate subject, walk the pattern steps:
//   - edge step: find triples where (currentNode, predicate, ?)
//   - node step: verify the object has rdf:type matching the step's class
//   - bind step: record (role → currentNode) in the result bindings
//   - literal step (via direct): record (role → literal value) as a string
//   - branch step: recurse
// Step 4: If all steps resolve, emit one QueryResult for this subject
```

For resolving the display value of a bound IRI: call `resolveEntityLabel(iri, closure, classLevelFallback)` from `src/kernel/narrative.ts`. This applies the Labeling Law and falls back to IRI cleaning. For blank nodes, fall back to the class label. For literal values, return the value string directly.

The executor receives the `MappingRegistry` alongside the CGP so it can look up patterns. Add `mappingRegistry` to the function signature if needed.

**Composition modes:**

- `subjectToSubject`: intersect the subject IRIs across all clauses. A subject must satisfy all clauses to appear in results.
- `union`: union all clause results. A subject satisfying any clause appears.
- `targetToSubject`: chain — the bound target of clause N becomes the subject of clause N+1.

For the demo graph, `subjectToSubject` (All must match) is the primary mode.

#### `searchEntities` algorithm

```typescript
// 1. Find all IRIs with rdf:type matching classIri in the triple store
// 2. For each IRI, resolve its display label:
//    a. Check closure for rdfs:label or skos:prefLabel annotations
//    b. Fall back to extractLocalName + cleanLocalName from labeling.ts
// 3. Filter to labels that contain the query string (case-insensitive)
// 4. Return up to maxResults (default 8) as { iri, label } objects
// 5. Sort alphabetically by label for deterministic ordering
```

#### API changes in `rpm-api.ts`

**New endpoint: `POST /rpm/execute`**

```
Request body: {
  cgpC: CGP_c,               // the composed graph pattern from POST /rpm/compose
  subjectType: string,       // the selected subject class IRI
}

Response: {
  results: QueryResult[],
  count: number,
}
```

Role: any authenticated user.

This endpoint requires `state.localStore` to be present. If it is not (i.e., the server is running in SPARQL mode, not local mode), return `501 Not Implemented` with message "Query execution against a remote endpoint is not yet available."

**Update: `GET /rpm/entity-search`**

Currently returns an empty array. When `state.localStore` is present, call `searchEntities(rangeClass, query, state.localStore, state.closure)` and return the results. When `state.localStore` is absent, return the existing empty stub.

Response shape remains: `{ results: Array<{ iri: string; label: string }>, query, rangeClass }`

#### `ServerState` interface changes

Add one optional field:

```typescript
/** Present when running in local graph mode. Enables executeLocalQuery and entity search. */
localStore?: LocalTripleStore;
```

This field is optional so the existing SPARQL-mode server startup (when it exists in Phase 6) does not need to change.

#### `local-discovery.ts` change

`runLocalDiscovery` already builds the triple store internally. Expose it on the return value:

```typescript
// Change return type from:
AssemblyResult & { closure: OntologyClosure; typeResolver: TypeResolver }

// To:
AssemblyResult & { closure: OntologyClosure; typeResolver: TypeResolver; store: LocalTripleStore }
```

Add `store` to the return object on the final line.

#### `demo.ts` change

```typescript
const { registry, catalog, report, closure, typeResolver, store } =
  await runLocalDiscovery(graphPath, { ... });

const state: ServerState = {
  ...existing fields...
  localStore: store,   // add this
};
```

#### UI changes in the Results View

The Results View currently calls `POST /rpm/compose` and renders the CGP_c structure directly. Change it to a two-step call:

1. `POST /rpm/compose` → `CGP_c`
2. `POST /rpm/execute` with the `CGP_c` and the selected subject type → `QueryResult[]`

Render `QueryResult[]` as the table rows. Each row's columns correspond to `bindings` keyed by role name. The `outputBind.label` values from the mapping define the column headers; the corresponding `bindings[role]` values are the cell contents.

For the NarrativeSummary, call `generateNarrative` with:
- `cgp`: the first clause from `cgpC.clauses`
- `subjectLabel`: `resolveEntityLabel(result.subjectIri, closure, subjectTypeLabel)` — import `resolveEntityLabel` from the kernel
- `objectLabel`: `result.bindings["target"] ?? outputBind.label`

The closure should be held in React state, populated once on S1 load from a new `GET /rpm/closure-meta` endpoint or passed through app state from the initial catalog fetch. The simplest approach for the demo is to add the subject label map to the `GET /rpm/subject-types` response (it is already there) and derive the subject label from that.

#### Tests — `tests/local-executor.test.ts` (10 tests minimum)

- `executeSingleClause` on "Bearer Of Role" pattern returns Jane Doe's IRI
- `executeSingleClause` on "Is Object Of" pattern returns Jane Doe's IRI with Birth binding
- `executeLocalQuery` in subjectToSubject mode with two clauses returns only subjects satisfying both
- `executeLocalQuery` in union mode returns subjects satisfying either clause
- `searchEntities` for `cco:Person` with query "jane" returns Jane Doe
- `searchEntities` for `cco:Organization` with query "tech" returns Tech Giant
- `searchEntities` with query that matches nothing returns empty array
- `searchEntities` respects maxResults cap
- Empty triple store returns empty results without throwing
- Literal value bindings (via:direct pattern) returned as string values

---

## 5.C.2 — Graph Upload

### What it does

Adds a file upload UI component and an API endpoint that accepts a JSON-LD file, runs the full local discovery pipeline, and hot-swaps the server state. The Orchestrator can upload any JSON-LD file during a demo and immediately begin querying it.

### Files to create

```
src/ui/components/GraphUpload.tsx
src/ui/components/GraphUpload.module.css
```

### Files to modify

```
src/adapters/integration/rpm-api.ts   — add POST /rpm/upload-graph
demo.ts                               — set onRefresh to re-run discovery
```

---

### `GraphUpload.tsx` — specification

**Where it appears:** On Screen 1 (Subject Selection), below the type card grid. Visible always (not role-gated — the Orchestrator needs to use it without a role header).

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Upload a graph                                             │
│  ─────────────────────────────────────────────────────────  │
│  Upload a JSON-LD file to discover its search options.      │
│                                                             │
│  [ Choose file ]   No file selected                         │
│                                                             │
│  [ Upload and discover → ]   (disabled until file selected) │
│                                                             │
│  [progress / status area]                                   │
└─────────────────────────────────────────────────────────────┘
```

**States:**

| State | UI |
|---|---|
| Idle | Choose file button + disabled upload button |
| File selected | Filename shown, upload button enabled |
| Uploading | Progress spinner, "Discovering search options…", upload button disabled |
| Success | Green success message: "Discovery complete. [N] search types found across [M] record types." Type cards reload automatically. |
| Error | Red error message with the server's `userMessage`. Try again affordance. |

**Behavior:**

1. File input accepts `.jsonld` and `.json` files only. `accept=".jsonld,.json"`.
2. On upload button click: POST the file as `multipart/form-data` to `POST /rpm/upload-graph`.
3. Poll or await the response. On success, call a provided `onDiscoveryComplete()` callback which triggers S1 to reload `GET /rpm/subject-types`.
4. The component does not navigate — it reloads the type cards in place.

**Props:**

```typescript
interface GraphUploadProps {
  onDiscoveryComplete: () => void;
}
```

**Copy rules:** The component must not use the words "ontology", "graph" (except "Upload a graph" as a heading), "predicate", "IRI", "SPARQL", "triple", "crawl", "tier". Describe the capability in domain-neutral language.

---

### `POST /rpm/upload-graph` — API specification

**Request:** `multipart/form-data` with a single field `graph` containing the JSON-LD file.

**Role:** Any. No role header required.

**Processing:**

1. Parse the multipart body to extract the file content as a UTF-8 string.
2. Parse the string as JSON. If it fails, return `400` with `userMessage: "The uploaded file is not valid JSON. Please check the file and try again."`.
3. Validate that the parsed object has an `@context` and either `@graph` or recognizable JSON-LD structure. If not, return `400` with `userMessage: "The uploaded file does not appear to be a JSON-LD document. It must contain an @context field."`.
4. Write the file to a temporary path (e.g., `os.tmpdir() + /rpm-upload-{timestamp}.jsonld`).
5. Call `runLocalDiscovery(tempPath, { skipTier3: false })`.
6. On success: replace `state.registry`, `state.catalog`, `state.report`, `state.closure`, `state.typeResolver`, `state.localStore` atomically (assign all fields in one synchronous block). Stamp `state.lastCrawlTimestamp`. Clean up the temp file.
7. Return:

```json
{
  "success": true,
  "mappingCount": 21,
  "subjectTypeCount": 9,
  "timestamp": "2026-03-21T12:00:00.000Z"
}
```

**On discovery failure** (malformed graph that produces zero mappings): return `200` with `success: true` but `mappingCount: 0` and `subjectTypeCount: 0`. Do not return an error — zero mappings is a valid discovery outcome, not a failure.

**On internal error** (exception during discovery): return `500` with `userMessage: "Discovery could not be completed. Please check that the file is a valid JSON-LD document and try again."`.

**File size limit:** Reject files larger than 5MB with `413` and `userMessage: "The uploaded file is too large. Maximum size is 5MB."`. Check before parsing.

**Multipart parsing:** Node.js `http` module does not natively parse multipart. Add a minimal multipart parser inline in `rpm-api.ts` — do not add a runtime dependency. The parser only needs to handle a single file field. A boundary-based split on the body buffer is sufficient for this use case.

The multipart parser should:
1. Extract the `boundary` from the `Content-Type` header.
2. Split the body buffer on `--{boundary}`.
3. For each part, extract the `Content-Disposition` header to get the field name.
4. Return the body bytes after the double CRLF header separator.

---

### `demo.ts` change

The `onRefresh` callback in `ServerState` is already defined for `POST /rpm/refresh`. Wire it to re-run discovery against the last loaded graph path (before upload was added). After upload, `onRefresh` is no longer needed for re-crawl since upload replaces the graph entirely. No change to `onRefresh` is strictly necessary, but confirm the existing refresh endpoint does not interfere with the uploaded graph state.

---

## Acceptance Criteria

**5.C.1 — Executor complete when:**
- [ ] `tests/local-executor.test.ts` — 10+ tests passing
- [ ] `POST /rpm/execute` returns `QueryResult[]` with real data from the Jane Doe graph
- [ ] Results View renders result rows with actual values in cells (not empty)
- [ ] NarrativeSummary shows a real sentence with subject and object labels (not placeholder)
- [ ] `GET /rpm/entity-search?type=cco:Person&q=jane` returns Jane Doe's IRI and label
- [ ] Entity search autocomplete in the Intent Detail Panel shows results when typing
- [ ] All prior tests still passing (333+)

**5.C.2 — Upload complete when:**
- [ ] GraphUpload component renders on Screen 1 below the type cards
- [ ] Uploading `jane-doe.jsonld` via the UI replaces the server state and reloads type cards
- [ ] Uploading a different valid JSON-LD file runs discovery and updates the catalog
- [ ] Uploading a non-JSON file returns a readable error message in the UI
- [ ] Uploading a file larger than 5MB returns a readable error message
- [ ] The upload component contains none of the prohibited words listed above
- [ ] All prior tests still passing

**End-to-end demo flow after both are complete:**
1. Start the server: `npm run demo`  
2. Open the UI, upload `jane-doe.jsonld` via the upload component  
3. Select "Person" from the type cards  
4. Select "Bearer Of Role" from the sidebar, observe Jane Doe in entity search  
5. Add the clause without a filter, click Review, click Run search  
6. See one result row: Jane Doe, with a narrative sentence and breadcrumb path  
7. Upload a second JSON-LD file, observe the catalog update without restarting the server  

---

## Notes for the Developer

**The executor does not need to be complete before upload works, and upload does not need to be complete before the executor works.** Build them in parallel and integrate at the end.

**The multipart parser is the only tricky part of 5.C.2.** Test it against Chrome's multipart encoding (boundary format varies slightly by browser). If the parser is more than 30 lines, it is probably doing too much — the only goal is extracting one file's bytes from one field.

**The executor algorithm sounds complex but the demo graph is small.** There are fewer than 100 triples total. Linear scans are fine. Do not over-engineer the matching logic with indexes at this stage.

**Import `resolveEntityLabel` from `src/kernel/narrative.ts` for the executor.** This is the one additional permitted kernel import in the adapter layer for this task — the same logic used by the narrative generator is the right logic for resolving display values.

**Keep `state` mutation atomic in the upload endpoint.** Assign all state fields in a single synchronous block after discovery completes. This prevents a race condition where a request arrives mid-update and reads a partially-replaced state.

---

*These instructions should be read alongside `project/RPM-v2.1-FINAL.md` §32.9 (refresh policy), `project/GDE-UI-SPEC-v2.1.md` §11.2 (schema refresh), and the existing Phase 5.A deliverables in `src/adapters/local/`. In any conflict, the spec documents govern.*
