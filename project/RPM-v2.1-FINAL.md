# Realist Path Mapping (RPM) v2.1
## Discovery-First Architecture — Production Specification

---

## Changelog

### v2.0 → v2.1 — Gap Closure and Production Hardening

RPM v2.1 closes three gaps identified in the post-v2.0 SME requirements review. All v2.0 content is preserved unless explicitly replaced. All changes are additive or targeted clarifications.

**1. Section 30.5 — Quality Threshold Rule Revision**
The v2.0 quality threshold rule rejected any IRI local name consisting of "digits and uppercase letters with no word-boundary content." This rule was too aggressive and would suppress valid industrial identifiers such as `TANK_01` (which cleans correctly to "Tank 01"). The rule is revised to reject only local names whose content after cleaning is dominated by numeric sequences with no alphabetic word-boundary material. `BFO 0000023` still fails (numeric identifier with no meaningful word). `TANK 01` now passes (alphabetic word content present). The boundary condition is formally defined in the revised Section 30.5.

**2. Section 32.9 — Refresh Policy: Schema vs. Data Distinction**
The v2.0 refresh policy did not distinguish between schema-level refresh (new predicates or classes requiring a re-crawl) and data-level freshness (new instances of known classes, which are always live via entity search). This distinction is critical for setting correct SME expectations. Section 32.9 is expanded to define both behaviours, clarify that entity search always queries the live graph, and specify the SME-facing "Refresh search options" UI trigger.

**3. Section 34 — Result Narrative Synthesis (new)**
The v2.0 spec defined the CGP output structure but specified no mechanism for presenting successful results to SMEs in plain language. Without a narrative layer, SMEs receive correct answers expressed as graph structures they cannot read. Section 34 defines the Narrative Synthesis Layer: a deterministic algorithm that walks a resolved CGP and produces a plain-language path summary using Labeling Law resolved labels. The Narrative Generator is subject to the same Firewall constraints as all other SME-facing output.

**4. Section 35 — Label Override API (new)**
The v2.0 spec acknowledged that static registries override discovered mappings but did not define how SMEs or curators write label corrections back into the system without developer involvement. Section 35 defines the Label Override API: a write endpoint, a durable override store separate from the static registry, a partial catalog rebuild mechanism, and a minimal role model (SME: read-only; Curator: can write overrides). This closes the zero-config loop for label quality without requiring a developer deployment cycle for every correction.

---

### v1.5 → v2.0

RPM v2.0 is a major revision. Parts I and II from v1.5 are preserved and updated. Three new sections constitute Part III: the Discovery Engine. The manual Mapping Registry is superseded by a hybrid model in which the registry is generated automatically from a live graph endpoint or optionally extended with curated overrides. No capability from v1.5 is removed; all v1.5 mechanisms remain valid as the optional override layer.

**1. Architecture-Blind Design (Sections 1, 5, 18, 29)**
RPM v2.0 removes BFO/CCO-specific language from all normative requirements. The engine is Architecture-Blind: it treats `mfg:hasCatalyst` and `cco:employed_by` with identical logic. Section 29 portability notes are updated to reflect which coupling points have been closed by this release.

**2. Section 5 — Hybrid Registry Model**
The Mapping Registry is now a hybrid artifact. At startup the Discovery Engine (Section 32) generates a complete in-memory registry by crawling the graph. Optionally a curated static registry supplements discovered mappings with Tier 3 compound path overrides and label corrections. Neither the static file nor a Semantic Architect is required for the system to be operational.

**3. Section 22 — ui Block Now Discoverable**
All `ui` block fields previously requiring hand-authoring are now generated automatically by the Labeling Law (Section 30) and Control Inference (Section 31). Manually authored `ui` blocks remain valid and take precedence over discovered values when present. Hand-authoring is optional, not deprecated.

**4. Section 25 — Dynamic Error Templates**
The manual Error Translation Registry is replaced by a Dynamic Template Engine. Error messages are constructed at runtime using Discovered Labels resolved during the crawl. The structural `TranslatedError` payload (severity, placement, fieldBinding, clauseIndex) is preserved unchanged.

**5. Section 30 — The Labeling Law (new)**
A normative algorithm for resolving plain-language labels from ontology and graph metadata. Priority: `skos:prefLabel` → `rdfs:label` → `schema:name` → `dc:title` → `foaf:name` → IRI local name cleaning. Governs all auto-generated labels, hints, groups, and error message tokens.

**6. Section 31 — Control Inference (new)**
A normative XSD-to-UI-component mapping table. Given a predicate's range in the ontology closure, the engine deterministically selects the correct input component and infers default `filterOp` values. No manual `inputType` declaration is required.

**7. Section 32 — Dynamic Schema Crawl (new)**
The Discovery Engine specification. Three tiers: Tier 1 (direct predicates), Tier 2 (OWL property chain predicates), Tier 3 (Frequent Path Discovery via statistical inference). The Tier 3 algorithm detects high-frequency multi-hop traversals and auto-generates Compound Intents. The curated pattern library from v1.5 becomes an optional Tier 3 override.

**8. Section 33 — Compliance Test Suite (updated, formerly Section 30)**
Five new canonical tests (CT-08 through CT-12) for the Discovery Engine, Labeling Law, Control Inference, Frequent Path Discovery, and Dynamic Error Templates. CT-01 through CT-07 are unchanged.

---

### v1.4 → v1.5
SHA-256 canonical hashing, `joinType` disambiguation, specificity scoring, Compliance Test Suite.

### v1.3 → v1.4
Section 29 portability notes; Section 1 language update.

### v1.2 → v1.3
Exposure classification, input/output bind separation, `filterOp`, CGP_c formalization, `TranslatedError`.

### v1.1 → v1.2
SME Surface Contract: `ui` block, intent catalog, composition model, error translation, prohibited surface list.

### v1.0 → v1.1
Branching, inverse handling, multi-type validation, deterministic hashing, ontology closure, error codes.

---

## Part I — Core Expansion Engine (updated for v2.1)

---

### 1. Purpose

Realist Path Mapping (RPM) defines a deterministic, local transformation from a user Intent into a Canonical Graph Pattern (CGP). RPM is an Architecture-Blind pattern engine: it processes any well-formed ontology with the same logic, whether that ontology is BFO/CCO, a manufacturing process ontology, a procurement ledger schema, or any other domain vocabulary.

RPM v2.0 introduces a Discovery-First architecture. On startup the engine crawls the target graph and its ontology closure, resolves plain-language labels via the Labeling Law (Section 30), infers UI components via Control Inference (Section 31), and generates the Intent Catalog automatically (Section 32). No Semantic Architect is required for the system to be operational against a new graph.

The static Mapping Registry from prior versions remains valid as an optional override layer. Curated mappings take precedence over discovered ones when both are present.

RPM does not execute queries. It produces canonical graph structures adapted to SPARQL, Cypher, Gremlin, or an in-memory evaluator by the adapter layer.

---

### 2. Core Principles

#### 2.1 Edge-Canonical First Principle

All intents expand into an explicit, directed, typed graph structure. After expansion: no shorthand remains, all intermediate entities are explicit, all literal values are wrapped per the mapping rule, all graph nodes are deterministically named, and all ambiguity is resolved or surfaced as an explicit error.

#### 2.2 Discovery-First Principle

The data is the specification. If a path is consistently traversed in the graph, it is a valid Intent. The engine discovers these paths automatically and surfaces them to the SME without requiring human configuration. Human curation is an optional quality enhancement, not a mandatory gate.

---

### 3. Definitions

#### 3.1 Intent
A symbolic shorthand representing a semantically meaningful path or pattern. In v2.0, intents may be hand-authored (static) or auto-generated by the Discovery Engine (discovered).

#### 3.2 Canonical Graph Pattern (CGP)
A JSON-LD graph structure representing the expanded intent. Must be deterministic, directed, typed, structurally complete, and independent of storage backend.

#### 3.3 Mapping Registry
A set of mapping definitions, either hand-authored (static registry) or generated in-memory by the Discovery Engine at startup (discovered registry), or both. Static definitions take precedence over discovered definitions when shorthands conflict.

#### 3.4 Ontology Closure
The local ontology input: required classes and properties, all asserted superclasses and superproperties, inverse-property metadata, and all label, comment, and definition annotations used by the Labeling Law.

#### 3.5 Branch
A nested subpattern inside a mapping pattern, allowing one intent to expand into multiple dependent paths simultaneously.

#### 3.6 Composed Graph Pattern (CGP_c)
The output when multiple intent clauses are combined. Contains individual CGPs plus structural metadata (`joinAnchors`, `unionRoots`, `chainLinks`) for adapter-layer query assembly.

#### 3.7 Discovered Mapping
A mapping definition generated automatically by the Discovery Engine. Functionally equivalent to static mappings. Carries `"source": "discovered"`.

#### 3.8 Compound Intent
A discovered mapping representing a multi-hop traversal identified by Frequent Path Discovery (Section 32.6). Compresses a high-frequency N-hop path into a single SME-facing intent.

#### 3.9 Labeling Law
The normative priority hierarchy for resolving plain-language labels from ontology metadata. Defined in Section 30.

#### 3.10 Frequent Path
A multi-hop traversal appearing in at least the configured frequency threshold of subject class instances that have any path to the target class, and in at least the configured minimum instance count. Frequent paths are promoted to Compound Intents automatically.

---

### 4. Inputs and Outputs

#### 4.1 Input Contract

```
RPM_Expand(intent, subject, context) -> CGP | RPMError | RPMPartialCGP
RPM_Compose(composedQuery, context) -> CGP_c | RPMError[]
```

Context contains: `mappingRegistry` (merged static + discovered, or discovered only), `ontologyClosure`, optional runtime parameters.

#### 4.2 Subject Shape

```json
{
  "@id": "ex:Alice",
  "@type": ["cco:Person", "schema:Worker"]
}
```

#### 4.3 Output Contract

- `CGP` on success (single clause)
- `CGP_c` on success (composed query)
- `RPMError` on failure
- `RPMPartialCGP` only when partial resolution is explicitly configured

Default behavior is fail closed.

---

### 5. Mapping Registry

#### 5.1 Hybrid Registry Model

In v2.0 the Mapping Registry is assembled from two sources:

**Source A — Discovered Registry (required)**
Generated at startup by the Discovery Engine (Section 32). Covers all valid paths found in the graph and ontology closure. All discovered mappings carry `"source": "discovered"`.

**Source B — Static Registry (optional)**
A hand-authored JSON-LD file. Used to provide curated labels, Tier 3 compound path definitions, and exposure overrides. Static definitions override discovered definitions for identical shorthands.

At runtime the engine operates against a single merged registry. The merge rule: static definitions override discovered definitions for identical shorthands; all other discovered definitions are included.

#### 5.2 Registry Structure

```json
{
  "@context": {
    "rpm": "https://spec.example.org/rpm/v2/"
  },
  "@type": "rpm:MappingRegistry",
  "version": "2.1.0",
  "source": "merged",
  "generatedAt": "2026-03-20T12:00:00Z",
  "graphEndpoint": "https://example.org/sparql",
  "mappings": []
}
```

#### 5.3 Mapping Definition

```json
{
  "shorthand": "mfg:hasCatalyst",
  "source": "discovered",
  "tier": 1,
  "exposure": "smeSurface",
  "domainClasses": ["mfg:ChemicalProcess"],
  "rangeClasses": ["mfg:Catalyst"],
  "pattern": {},
  "ui": {},
  "description": "Auto-generated. Direct predicate."
}
```

New fields in v2.0: `source` (`"static"`, `"discovered"`, `"merged"`), `tier` (1, 2, or 3).

The `ui` block is auto-generated for discovered mappings. For static mappings it is hand-authored and takes precedence.

#### 5.4 Domain and Range Semantics

- `domainClasses` defines the set of subject types eligible for expansion.
- `rangeClasses` defines the expected terminal or bound target classes.
- Validation succeeds if at least one declared subject type is a subclass of at least one declared domain class (any-match).
- When multiple mappings apply to the same subject, the Intent Catalog applies specificity scoring (Section 5.5).

#### 5.5 Mapping Exposure Classification

**`smeSurface`**
The mapping appears in the Intent Catalog and is available to SMEs. For discovered mappings: automatically assigned when the Labeling Law resolves a label and domain/range constraints are satisfied (Section 32.7). For static mappings: requires a complete `ui` block.

**`internal`**
Not exposed to SMEs. For discovered mappings: assigned when labeling fails or frequency thresholds are not met. Default when `exposure` field is omitted.

#### 5.6 Multi-Mapping Specificity Scoring

When a subject satisfies multiple `smeSurface` mappings, the Intent Catalog ranks by specificity: lowest subsumption distance from subject type to domain class ranks first. Registry position is the stable tiebreaker. Compound Intents (Tier 3) rank below direct predicates (Tier 1) and property chain predicates (Tier 2) at equal distance.

---

### 6. Path Pattern Grammar

The pattern grammar is unchanged from v1.5. Step types: `edge`, `node`, `bind`, `literal`, `branch`. All step definitions are as specified in v1.5 Sections 6.1–6.6.

Patterns for discovered mappings are generated by the Discovery Engine using the same grammar: Tier 1 produces a single `branch` with one `edge`, one `node`, and one `bind` step. Tier 2 derives steps from the `owl:propertyChainAxiom`. Tier 3 produces nested `branch` structures reflecting the frequent path topology.

---

### 7. Expansion Model

#### 7.1 Expansion Steps

1. Resolve Mapping in the merged registry by shorthand.
2. Validate Subject Types via subsumption check against `domainClasses`.
3. Instantiate Canonical Root.
4. Expand Pattern Recursively.
5. Inject Intermediate Nodes (all intermediate entities explicit in CGP).
6. Bind Outputs per role labels.
7. Canonicalize: SHA-256 blank node IDs, normalize ordering, produce JSON-LD.

---

### 8. Literal Handling

`via: "ice"` and `via: "direct"` are co-equal modes. Control Inference (Section 31) selects the appropriate mode based on range type. For discovered mappings: XSD literal ranges use `via: "direct"`. ObjectProperty ranges identified as ICE subclasses use `via: "ice"`. All other ObjectProperty ranges use `edge → node → bind` with no literal step.

---

### 9. Deterministic Blank Node Strategy

Unchanged from v1.5. SHA-256 truncated to 16 lowercase hexadecimal characters. For discovered mappings, the `mappingShorthand` input component is the full predicate IRI (e.g., `https://example.org/mfg/hasCatalyst`) to ensure global uniqueness.

---

### 10. Multi-Typing and Validation

Unchanged from v1.5. The pluggable TypeResolver interface processes subsumption checks. The default implementation uses OWL/RDFS subsumption.

---

### 11. Error Handling

#### 11.1 Error Object

Unchanged from v1.5. All errors are structured `RPMError` objects.

#### 11.2 Required Error Codes

All v1.5 error codes are retained. Two new codes are added:

- `CRAWL_ENDPOINT_UNREACHABLE` — The SPARQL endpoint did not respond during the Discovery crawl.
- `LABELING_LAW_EXHAUSTED` — The Labeling Law found no resolvable label at any level, and IRI cleaning failed the quality threshold.

The manual Error Translation Registry is replaced by the Dynamic Template Engine (Section 25).

---

### 12–13. Degraded Execution / CGP Requirements

Unchanged from v1.5.

---

### 14. Example Mappings

The following three examples show the mapping format as it appears in the merged registry after the Discovery Engine has run.

---

#### 14.1 Tier 1 Discovered — `mfg:hasCatalyst`

```json
{
  "shorthand": "https://example.org/mfg/hasCatalyst",
  "source": "discovered",
  "tier": 1,
  "exposure": "smeSurface",
  "domainClasses": ["mfg:ChemicalProcess"],
  "rangeClasses": ["mfg:Catalyst"],
  "pattern": {
    "type": "branch",
    "name": "catalyst",
    "steps": [
      { "type": "edge", "predicate": "mfg:hasCatalyst", "direction": "forward" },
      { "type": "node", "class": "mfg:Catalyst" },
      { "type": "bind", "role": "target" }
    ]
  },
  "ui": {
    "label": "Has Catalyst",
    "labelSource": "rdfs:label",
    "description": "The catalyst agent used in this chemical process.",
    "descriptionSource": "rdfs:comment",
    "group": "Chemical Process",
    "groupSource": "domainClassLabel",
    "examples": [],
    "subjectLabel": "Chemical Process",
    "inputParameters": [
      {
        "id": "catalyst-filter",
        "role": "target",
        "label": "Catalyst",
        "hint": "Search for a catalyst by name",
        "inputType": "entitySearch",
        "inputTypeSource": "rangeIsObjectProperty",
        "required": false,
        "filterOp": ["eq"]
      }
    ],
    "outputBinds": [
      {
        "role": "target",
        "label": "Catalyst",
        "description": "The catalyst agent used in this chemical process."
      }
    ]
  }
}
```

Fully auto-generated. The label "Has Catalyst" was resolved from `rdfs:label`. The description came from `rdfs:comment`. The group "Chemical Process" was derived from the domain class label. The `entitySearch` input type was inferred because the range is an ObjectProperty. No human authored any part of this entry.

---

#### 14.2 Tier 3 Discovered — Compound Intent: Person to Organization via Employment

```json
{
  "shorthand": "rpm:compound_Person_Organization_Employment_v1",
  "source": "discovered",
  "tier": 3,
  "exposure": "smeSurface",
  "frequencyScore": 0.94,
  "instanceCount": 847293,
  "domainClasses": ["cco:Person"],
  "rangeClasses": ["cco:Organization"],
  "pattern": {
    "type": "branch",
    "name": "employment",
    "steps": [
      { "type": "edge", "predicate": "cco:is_bearer_of", "direction": "forward" },
      { "type": "node", "class": "cco:EmployeeRole" },
      { "type": "edge", "predicate": "cco:is_realized_in", "direction": "forward" },
      { "type": "node", "class": "cco:ActOfEmployment" },
      {
        "type": "branch",
        "name": "participants",
        "steps": [
          { "type": "edge", "predicate": "cco:has_participant", "direction": "forward" },
          { "type": "node", "class": "cco:Organization" },
          { "type": "bind", "role": "employer" }
        ]
      }
    ]
  },
  "ui": {
    "label": "Employment",
    "labelSource": "compoundComposition:ActOfEmployment",
    "description": "Person to Organization path via Act Of Employment, present in 94% of Person instances.",
    "group": "Person",
    "subjectLabel": "Person",
    "examples": [],
    "inputParameters": [
      {
        "id": "employer-filter",
        "role": "employer",
        "label": "Organization",
        "hint": "Search for an organization by name",
        "inputType": "entitySearch",
        "inputTypeSource": "rangeIsObjectProperty",
        "required": false,
        "filterOp": ["eq"]
      }
    ],
    "outputBinds": [
      {
        "role": "employer",
        "label": "Organization",
        "description": "The organization reached via the Employment path."
      }
    ]
  }
}
```

Auto-generated by Frequent Path Discovery. The four-hop path appeared in 94% of Person instances. The compound label "Employment" was derived from the most specific intermediate class `ActOfEmployment` via the Labeling Law. No curator wrote this entry.

---

#### 14.3 Static Curated Override — `employed_by`

```json
{
  "shorthand": "rpm:compound_Person_Organization_Employment_v1",
  "source": "static",
  "tier": 3,
  "exposure": "smeSurface",
  "domainClasses": ["cco:Person"],
  "rangeClasses": ["cco:Organization"],
  "pattern": {
    "type": "branch",
    "name": "employment",
    "steps": [
      { "type": "edge", "predicate": "cco:is_bearer_of", "direction": "forward" },
      { "type": "node", "class": "cco:EmployeeRole" },
      { "type": "edge", "predicate": "cco:is_realized_in", "direction": "forward" },
      { "type": "node", "class": "cco:ActOfEmployment" },
      {
        "type": "branch",
        "name": "participants",
        "steps": [
          { "type": "edge", "predicate": "cco:has_participant", "direction": "forward" },
          { "type": "node", "class": "cco:Organization" },
          { "type": "bind", "role": "employer" }
        ]
      }
    ]
  },
  "ui": {
    "label": "Employed by",
    "description": "Find the organization that employs this person.",
    "group": "Work & Employment",
    "examples": [
      "Who employs Jane Smith?",
      "What company does this agent work for?"
    ],
    "subjectLabel": "Employee",
    "inputParameters": [
      {
        "id": "employer-filter",
        "role": "employer",
        "label": "Employer",
        "hint": "Search for an organization by name",
        "inputType": "entitySearch",
        "required": false,
        "filterOp": ["eq"]
      }
    ],
    "outputBinds": [
      {
        "role": "employer",
        "label": "Employer",
        "description": "The organization employing this person."
      }
    ]
  }
}
```

This static entry uses the same shorthand as the auto-generated Tier 3 entry in Section 14.2 (`rpm:compound_Person_Organization_Employment_v1`), which causes it to take precedence in the merge. The pattern is identical. The static entry replaces the auto-generated label ("Employment") with the domain-specific label ("Employed by"), adds curated examples, and uses the preferred group name "Work & Employment". This illustrates the override mechanism: curators refine labels and add examples without rewriting the engine's discovered structure.

---

### 15. Execution Model

RPM must run as a pure local computation after the initial discovery crawl completes. The crawl requires network access to the SPARQL endpoint during initialization only. All subsequent RPM operations must be executable from the in-memory registry and ontology closure without further network access.

---

### 16. Integration Layer

Unchanged from v1.5. Adapters must read composition mode and structural metadata from the CGP_c and must not infer join semantics independently.

---

### 17. Validation Requirements

All v1.5 validation requirements are preserved. The following are added.

#### 17.10 Discovery Completeness
A graph endpoint with at least one resolvable subject-predicate-object pattern produces at least one `smeSurface` mapping after Discovery completes.

#### 17.11 Labeling Law Application
Every discovered mapping carries a `labelSource` field identifying the Labeling Law level that resolved its label.

#### 17.12 Control Inference Application
Every discovered `inputParameter` carries an `inputTypeSource` field identifying the inference rule that selected its `inputType`.

#### 17.13 Tier Consistency
Every mapping declares a `tier` value (1, 2, or 3) consistent with the discovery method that generated it.

---

### 18. Non-Goals

RPM does not: execute queries, infer unstated ontology facts beyond what the OWL closure asserts, perform reasoning beyond subsumption and property chain expansion, persist discovered registry state across sessions without explicit configuration, or silently repair invalid mappings.

Note: v2.0 removes "fetch remote vocabularies" from the non-goals list because the Discovery Engine fetches remote SPARQL endpoints during initialization. After initialization, no remote fetching occurs during query expansion.

---

### 19. Implementation Notes for Developers

Build order for v2.1:

1. SPARQL endpoint connector and introspection query executor (§32.2–32.3)
2. Labeling Law resolver (§30)
3. Control Inference engine (§31)
4. Tier 1 direct predicate discoverer (§32.4)
5. Tier 2 OWL property chain discoverer (§32.5)
6. Tier 3 Frequent Path Discovery engine (§32.6)
7. Automated promotion evaluator (§32.7)
8. In-memory registry assembler and merger with optional static registry (§32.9)
9. Ontology closure loader
10. Intent lookup
11. Validation engine (TypeResolver interface, subsumption check)
12. Recursive pattern expander
13. Deterministic ID generator (SHA-256, §9)
14. Canonical JSON-LD serializer
15. Composed query evaluator and CGP_c assembler (§24.4)
16. Dynamic error template engine (§25)
17. Intent catalog builder with specificity scoring (§23)
18. Optional static registry loader and override merger
19. Optional adapter layer

---

### 20. Version Summary

- **v1.1**: Pattern grammar, inverse handling, multi-type validation, hashing, ontology closure, error codes.
- **v1.2**: SME Surface Contract.
- **v1.3**: Exposure classification, input/output bind separation, filterOp, CGP_c, TranslatedError.
- **v1.4**: Portability notes.
- **v1.5**: SHA-256 hashing, joinType, specificity scoring, compliance tests.
- **v2.0**: Architecture-Blind design, hybrid registry, auto-generated `ui` blocks, dynamic error templates, Labeling Law (§30), Control Inference (§31), Dynamic Schema Crawl with Frequent Path Discovery (§32), updated compliance tests (§33).
- **v2.1**: Quality threshold revision (§30.5), refresh policy schema/data distinction with SME UI trigger (§32.9), Result Narrative Synthesis (§34), Label Override API (§35), compliance tests CT-13–CT-15 (§33).

Parts I, II, III (§30–35), and §33 are jointly required for a conforming v2.1 implementation.

---

---

## Part II — SME Surface Contract (updated for v2.1)

---

### 21. Purpose and Scope

Unchanged from v1.5. The three governing principles — Exposure Prohibition, Translation Obligation, Composition Obligation — remain in force. In v2.0 the Translation Obligation is partially satisfied automatically by the Labeling Law and Dynamic Error Templates rather than requiring manual registry authoring.

---

### 22. UI Block Schema

In v2.0 the `ui` block is either hand-authored (static mappings) or auto-generated (discovered mappings). The schema is identical in both cases. Auto-generated fields carry a companion `*Source` field recording which resolution rule produced the value.

#### 22.1 Required Fields

| Field | Auto-generation source (discovered mappings) |
|---|---|
| `label` | Labeling Law (§30) |
| `description` | `rdfs:comment` or `skos:definition`, else empty string |
| `group` | Domain class label via Labeling Law, else "General" |
| `examples` | Empty array (no auto-generation; populated by static override only) |
| `subjectLabel` | Domain class label via Labeling Law |
| `inputParameters` | Control Inference (§31), one entry per bind role |
| `outputBinds` | Generated from bind roles; labels via Labeling Law |

For static mappings all fields are hand-authored as in v1.5.

#### 22.2 Label Writing Rules

For hand-authored labels: v1.5 rules apply (title case, 2–4 words, no ontology terminology).

For auto-generated labels: Labeling Law output is used verbatim. If the Labeling Law produces a label that would violate the writing rules (e.g., contains an underscore), the IRI cleaning algorithm (§30.4) is applied before use.

#### 22.3 Input Parameter Schema

Unchanged from v1.5. For discovered mappings, `inputType` and `filterOp` are populated by Control Inference (§31). The new `inputTypeSource` field records which inference rule was applied.

#### 22.4–22.6

Output Bind Schema, Input Type Semantics, and Filter Operator Vocabulary are unchanged from v1.5.

---

### 23. Intent Catalog and Discovery

The Intent Catalog is derived from the merged registry at startup, filtered to `smeSurface` mappings. In v2.0 it is populated primarily by discovered mappings with static overrides applied during merge. The catalog must be rebuilt whenever the discovery crawl completes or the static registry is updated.

All v1.5 Section 23 rules apply: grouping, intent discovery by subject type, and prohibited catalog contents. The prohibition on ontology IRIs extends to auto-generated shorthand IRIs, `labelSource` values, `inputTypeSource` values, `tier` values, `frequencyScore`, `instanceCount`, and `source` field values. These are internal and must never reach the SME surface.

---

### 24. Query Composition Model

Unchanged from v1.5. CQO, CGP_c, `joinAnchors`, `unionRoots`, `chainLinks`, and `joinType` specifications are as defined in v1.5 Section 24.

---

### 25. Error Translation Contract

#### 25.1 Dynamic Template Engine

The manual Error Translation Registry from v1.5 is replaced by a Dynamic Template Engine. Error messages are constructed at runtime by injecting Discovered Labels into structural templates. The `TranslatedError` object structure is unchanged:

```json
{
  "@type": "rpm:TranslatedError",
  "userMessage": "The Chemical Process record cannot use 'Has Catalyst' because the required value was not satisfied.",
  "severity": "validation",
  "placement": "inline",
  "fieldBinding": "catalyst-filter",
  "clauseIndex": 0
}
```

#### 25.2 Template Structures

Label injection tokens: `{subjectLabel}` = `ui.subjectLabel`, `{intentLabel}` = `ui.label`, `{domainLabel}` = domain class label via Labeling Law, `{fieldLabel}` = `ui.inputParameters[n].label`. If any token cannot be resolved, substitute "this record type", "this search", or "this field" as appropriate.

| Error Code | Severity | Placement | Template |
|---|---|---|---|
| `INTENT_NOT_FOUND` | system | banner | "This type of search is not currently available. Please choose a different option." |
| `SUBCLASS_VIOLATION` | validation | inline | "The selected {subjectLabel} record cannot be used with '{intentLabel}'. This search applies to {domainLabel} records only." |
| `ONTOLOGY_TERM_UNRESOLVED` | system | banner | "A required definition is missing from the system configuration. Please contact your system administrator." |
| `MAPPING_CONSTRAINT_VIOLATION` | validation | inline | "The value provided for '{fieldLabel}' does not meet the requirements for '{intentLabel}'. Please review your entry." |
| `INVALID_PATTERN` | system | banner | "This search could not be processed due to a configuration error. Please contact your system administrator." |
| `DETERMINISTIC_ID_COLLISION` | system | banner | "A naming conflict was detected. Please contact your system administrator." |
| `PARTIAL_RESOLUTION_DISABLED` | system | banner | "This search could not be completed. Please contact your system administrator." |
| `COMPOSITION_ANCHOR_MISSING` | system | banner | "The '{intentLabel}' and '{intentLabel2}' conditions could not be combined. Please contact your system administrator." |
| `COMPOSITION_CHAIN_BROKEN` | system | banner | "The linked search step for '{intentLabel}' could not be connected. Please contact your system administrator." |
| `CRAWL_ENDPOINT_UNREACHABLE` | system | banner | "The data source could not be reached during startup. Please contact your system administrator." |
| `LABELING_LAW_EXHAUSTED` | system | banner | "A search condition could not be labeled and was not made available. Please contact your system administrator." |

#### 25.3–25.4

Translation enforcement rules and validation vs. system error classification are unchanged from v1.5. The UI renderer receives only `TranslatedError` objects. Raw error codes go to the application log only.

---

### 26. Prohibited Surface Elements

All v1.5 prohibitions are retained. The following are added for v2.0:

- Auto-generated `shorthand` IRI values used as labels
- `labelSource` field values (e.g., `"rdfs:label"`, `"compoundComposition:ActOfEmployment"`)
- `inputTypeSource` field values (e.g., `"rangeIsObjectProperty"`)
- `tier` values (1, 2, 3)
- `frequencyScore` and `instanceCount` values
- `source` field values (`"discovered"`, `"static"`, `"merged"`)

---

### 27. SME Surface Contract Validation Requirements

All v1.5 requirements are preserved. The following are added.

#### 27.13 Auto-Generated Label Quality
Every discovered `smeSurface` mapping has a non-empty `ui.label` that does not contain: namespace prefixes, IRI fragments, underscore separators, or raw XSD type names.

#### 27.14 Dynamic Template Coverage
Every error code in §11.2 has a defined template in §25.2.

#### 27.15 LabelSource Transparency
Every auto-generated `ui.label` carries a `labelSource` field that never appears in any SME-facing rendering.

---

### 28. SME Surface Contract — Non-Goals

Unchanged from v1.5, with the addition: the SME Surface Contract does not govern how the Discovery Engine crawls the graph, how frequently the catalog is refreshed, or how static overrides are deployed.

---

---

## Part III — Discovery Engine (v2.1)

---

## Section 30 — The Labeling Law

---

### 30.1 Purpose

The Labeling Law is the normative algorithm for resolving a plain-language label for any IRI encountered during graph and ontology crawl. It ensures that no raw IRI, namespace prefix, or technical string ever reaches the SME surface, even when the ontology provides no human-readable label.

The Labeling Law applies to: class labels, predicate labels, group names, subject labels, output bind labels, input parameter labels, and all label injection tokens in dynamic error templates.

---

### 30.2 Priority Hierarchy

For any IRI `I`, the resolved label is the first non-empty result from the following ordered evaluation:

**Level 1 — `skos:prefLabel`**
Query the ontology closure and graph for `I skos:prefLabel ?label`. Apply language preference (§30.3). Use the result.

**Level 2 — `rdfs:label`**
Query for `I rdfs:label ?label`. Apply language preference. Use the result.

**Level 3 — `schema:name`**
Query for `I schema:name ?label`. Apply language preference. Use the result.

**Level 4 — `dc:title`**
Query for `I dc:title ?label`. Apply language preference. Use the result.

**Level 5 — `foaf:name`**
Query for `I foaf:name ?label`. Apply language preference. Use the result.

**Level 6 — IRI Local Name Cleaning**
Extract the local name from `I` and apply the cleaning algorithm (§30.4). If the cleaned result passes the minimum quality threshold (§30.5), use it. Otherwise emit `LABELING_LAW_EXHAUSTED` and assign the mapping `exposure: "internal"`.

---

### 30.3 Language Preference

When multiple label literals exist at the same priority level:
1. Prefer language tag `en` or `en-*`.
2. If no English literal, prefer no language tag.
3. If multiple non-English language tags, prefer alphabetically first for determinism.
4. If multiple literals remain at equal preference, prefer the shortest. Short labels are more likely to be appropriate for UI buttons.

---

### 30.4 IRI Local Name Cleaning Algorithm

Given IRI `I`:

1. Extract the local name: if `I` contains `#`, take the fragment; otherwise take the last path segment.
2. Replace all underscore (`_`) and hyphen (`-`) characters with a single space.
3. Insert a space before each uppercase letter preceded by a lowercase letter or digit (camelCase split): `hasCatalyst` → `has Catalyst`.
4. Insert a space before an uppercase letter that follows two or more consecutive uppercase letters (acronym boundary): `CCOPerson` → `CCO Person`.
5. Trim leading and trailing whitespace. Collapse multiple consecutive spaces to single space.
6. Apply title case: capitalize the first letter of each word. Do not lowercase letters that were already uppercase (preserves acronyms).

Examples:

| Input Local Name | Cleaned Label |
|---|---|
| `has_catalyst` | `Has Catalyst` |
| `hasCatalyst` | `Has Catalyst` |
| `ActOfEmployment` | `Act Of Employment` |
| `procured_via` | `Procured Via` |
| `DistillationProcess` | `Distillation Process` |
| `CCOPerson` | `CCO Person` |
| `hasBFORole` | `Has BFO Role` |

---

### 30.5 Minimum Quality Threshold

A cleaned local name fails the minimum quality threshold if any of the following rules are triggered. All three rules are evaluated independently; failing any single rule triggers `LABELING_LAW_EXHAUSTED`, which is logged and the mapping is assigned `exposure: "internal"`.

**Rule 1 — Insufficient alphabetic word content.**

The cleaned result must satisfy the base condition and must not trigger the secondary condition.

*Base condition:* the cleaned result must match the pattern `.*[A-Za-z]{2,}.*` (at least two consecutive alphabetic characters anywhere in the string). If no such sequence exists, Rule 1 triggers.

*Secondary condition:* if the only sequence satisfying `[A-Za-z]{2,}` is a known ontology namespace acronym prefix (BFO, CCO, OWL, RDF, RDFS, SKOS, XSD, DC, FOAF, XML) **and** all non-space, non-prefix characters in the cleaned result are digits, Rule 1 triggers. This prevents numeric ontology identifiers like `BFO 0000023` from passing despite containing the prefix "BFO".

Boundary cases illustrating the combined rule:

| Cleaned Result | Base | Secondary | Rule 1 Result |
|---|---|---|---|
| `BFO 0000023` | Passes ("BFO" ≥ 2 alpha) | Triggered — "BFO" is namespace prefix; remainder "0000023" is all digits | **Fails** |
| `Tank 01` | Passes ("Tank" ≥ 2 alpha) | Not triggered — "Tank" is not a namespace prefix | **Passes** |
| `Pump A2` | Passes ("Pump" ≥ 2 alpha) | Not triggered | **Passes** |
| `R 2` | Fails — "R" is 1 char | — | **Fails** |
| `ID 4421` | Passes ("ID" ≥ 2 alpha) | Not triggered — "ID" is not in the namespace prefix list | **Passes** |
| `4421` | Fails — no alphabetic chars | — | **Fails** |
| `Valve 3B` | Passes ("Valve" ≥ 2 alpha) | Not triggered | **Passes** |

**Rule 2 — Too short.** Fewer than 2 characters after cleaning.

**Rule 3 — Namespace prefix collision.** The entire cleaned result, after trimming, is identical to a known namespace prefix: `RDF`, `RDFS`, `OWL`, `SKOS`, `XML`, `XSD`, `DC`, `FOAF`, `BFO`, `CCO`. This rule catches the case where IRI cleaning of a namespace prefix IRI produces the prefix itself as the entire label.

**Rationale for Rule 1 revision from v2.0:** The v2.0 rule rejected any local name consisting of "digits and uppercase letters with no word-boundary content." This was too broad and would suppress valid industrial identifiers like `TANK_01` (→ "Tank 01") and `PUMP_A2` (→ "Pump A2"). The revised two-part Rule 1 correctly admits these while continuing to reject pure numeric ontology identifiers like `BFO_0000023`.

---

### 30.6 Hint Resolution

Hints (helper text for input fields) are resolved in priority order:
1. `rdfs:comment` on the predicate IRI.
2. `skos:definition` on the predicate IRI.
3. `skos:scopeNote` on the predicate IRI.
4. Empty string — no hint displayed.

Language preference from §30.3 applies. Hints are not required; absence is preferable to a synthetic hint.

---

### 30.7 Auto-Grouping Algorithm

1. For each mapping, take the first declared `domainClass` IRI.
2. Apply the Labeling Law to that IRI to get the group name.
3. Assign the mapping to that group.
4. If the domain class has a named superclass in the ontology closure that is not `owl:Thing` or `rdf:Resource`, use the superclass label as the group name (up to one level of hierarchy) to prevent over-fragmentation.
5. Maximum group depth: two levels. Deeper hierarchy is flattened.
6. If no group can be derived, assign to "General".

---

## Section 31 — Control Inference

---

### 31.1 Purpose

Control Inference is the normative mapping from a predicate's range type (as declared in the ontology closure) to a UI input component. Given a range, the engine deterministically selects `inputType`, `filterOp` defaults, and `via` (literal mode). No manual declaration is required.

---

### 31.2 XSD-to-UI Component Mapping Table

| Range Type | `inputType` | Default `filterOp` | `via` | Notes |
|---|---|---|---|---|
| `xsd:string` | `text` | `["eq", "contains", "startsWith"]` | `direct` | |
| `xsd:normalizedString` | `text` | `["eq", "contains", "startsWith"]` | `direct` | |
| `xsd:token` | `text` | `["eq", "contains"]` | `direct` | See enumeration detection (§31.3) |
| `xsd:boolean` | `boolean` | `["eq"]` | `direct` | Rendered as Yes / No |
| `xsd:integer` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | No decimal step |
| `xsd:int` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | |
| `xsd:long` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | |
| `xsd:short` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | |
| `xsd:decimal` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | Decimal step |
| `xsd:float` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | Decimal step |
| `xsd:double` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | Decimal step |
| `xsd:nonNegativeInteger` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | Minimum value 0 |
| `xsd:positiveInteger` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | Minimum value 1 |
| `xsd:dateTime` | `date` | `["eq", "gt", "lt", "range"]` | `direct` | Date + time picker; ISO 8601 |
| `xsd:date` | `date` | `["eq", "gt", "lt", "range"]` | `direct` | Date only |
| `xsd:time` | `text` | `["eq"]` | `direct` | Time string; specialized picker optional |
| `xsd:gYear` | `number` | `["eq", "gt", "lt", "range"]` | `direct` | Year integer only |
| `xsd:gYearMonth` | `text` | `["eq", "contains"]` | `direct` | Year-month string |
| `xsd:duration` | `text` | `["eq"]` | `direct` | ISO 8601 duration |
| `xsd:anyURI` | `text` | `["eq", "contains"]` | `direct` | URI string; never rendered as clickable IRI |
| `xsd:language` | `select` | `["eq"]` | `direct` | Options from detected language codes in graph |
| ObjectProperty (OWL class range) | `entitySearch` | `["eq"]` | see §31.4 | Entity search against range class instances |
| `rdfs:Literal` (untyped) | `text` | `["eq", "contains"]` | `direct` | Untyped literal fallback |
| No range declared | `text` | `["eq", "contains"]` | `direct` | Ultimate fallback |

The `inputTypeSource` field records which rule was applied: `"xsdMapping"`, `"rangeIsObjectProperty"`, `"enumerationDetected"`, or `"noRangeFallback"`.

---

### 31.3 Enumeration Detection

When range is `xsd:token` or an ObjectProperty, inspect for `owl:oneOf` on the range class. If all instances are enumerated as named individuals: override `inputType` to `select`, populate `selectOptions` with Labeling Law resolved labels. Maximum 20 options; fall back to `entitySearch` if exceeded. Set `inputTypeSource: "enumerationDetected"`.

---

### 31.4 ObjectProperty Literal Mode

When range is an OWL class:
1. If the range class is a subclass of `skos:Concept`, `skos:ConceptScheme`, or any declared ICE class: `via: "ice"`.
2. Otherwise: `edge → node → bind` pattern with no literal step. `via` is inapplicable and omitted.

---

### 31.5 Unit Inference

When `inputType` is `number`, check for unit-of-measure annotations on the predicate:
1. `qudt:unit` or `qudt:applicableUnit`.
2. `om:unit`.
3. Pattern "in [unit]" or "unit: [unit]" in `rdfs:comment`.

If a unit is found, apply the Labeling Law to the unit IRI and set `ui.inputParameters[n].unit`. If none found, omit the `unit` field.

---

## Section 32 — Dynamic Schema Crawl

---

### 32.1 Governing Principle

The data is the specification. If a path is used consistently across the graph, the engine must discover and surface it without waiting for human configuration. Discovery is not inference or guessing — it is reading the structure the data and ontology have already asserted.

The Discovery Engine runs in three tiers. Each tier is independent. All produce mappings in the same grammar. All discovered mappings from all tiers are merged into the registry.

- **Tier 1**: Direct predicates. Single-hop patterns.
- **Tier 2**: OWL property chains. Formally declared multi-hop paths.
- **Tier 3**: Frequent Path Discovery. High-frequency multi-hop paths found in the data.

---

### 32.2 Crawl Initialization

On startup:

1. Validate that the configured SPARQL endpoint is reachable (HTTP HEAD, 10-second timeout). If unreachable: emit `CRAWL_ENDPOINT_UNREACHABLE` and halt.
2. Load the ontology closure from the configured source.
3. Execute Tier 1, 2, and 3 discovery in sequence.
4. Apply the Labeling Law to all discovered IRIs.
5. Apply Control Inference to all discovered predicates.
6. Evaluate automated promotion rules (§32.7).
7. Load the optional static registry if configured.
8. Merge static and discovered registries.
9. Build the in-memory Intent Catalog.
10. Record `generatedAt` and write the Discovery Report to the log.

Total initialization must not exceed the configured startup timeout (default: 60 seconds). Time allocation defaults: Tier 1 = 10s, Tier 2 = 5s, Tier 3 = 30s, merge and catalog build = 5s. If any tier exceeds its allocation, it is skipped and logged; the engine continues with results from completed tiers.

---

### 32.3 SPARQL Introspection Queries

Executed with pagination (10,000 results per page, iterated until exhausted). Per-query timeout: 30 seconds, one retry on timeout.

**Q1 — Subject-Predicate-Object class patterns:**
```sparql
SELECT DISTINCT ?subjectClass ?predicate ?objectClass
WHERE {
  ?s a ?subjectClass .
  ?s ?predicate ?o .
  OPTIONAL { ?o a ?objectClass }
  FILTER(isIRI(?predicate))
  FILTER(?predicate != rdf:type)
  FILTER(?predicate != rdfs:label)
  FILTER(?predicate != owl:sameAs)
}
LIMIT 10000 OFFSET {offset}
```

**Q2 — Subject-Predicate-Literal patterns:**
```sparql
SELECT DISTINCT ?subjectClass ?predicate (datatype(?o) AS ?literalType)
WHERE {
  ?s a ?subjectClass .
  ?s ?predicate ?o .
  FILTER(isLiteral(?o))
  FILTER(isIRI(?predicate))
}
LIMIT 10000 OFFSET {offset}
```

**Q3 — OWL property chain axioms:**
```sparql
SELECT ?property ?chain
WHERE {
  ?property owl:propertyChainAxiom ?chain .
}
```

**Q4 — Instance counts by subject class:**
```sparql
SELECT ?subjectClass (COUNT(?s) AS ?count)
WHERE { ?s a ?subjectClass }
GROUP BY ?subjectClass
```

**Q5 — Multi-hop path sampling (Tier 3, parameterized by subject class SC and hop depth):**
```sparql
SELECT ?pathSignature
WHERE {
  { SELECT ?s WHERE { ?s a <SC> } ORDER BY RAND() LIMIT 1000 }
  ?s <p1> ?n1 .
  ?n1 a ?c1 .
  ?n1 <p2> ?n2 .
  ?n2 a ?c2 .
  ...
  BIND(CONCAT(str(<p1>), "|", str(?c1), "|", str(<p2>), ...) AS ?pathSignature)
}
```

Executed for hop depths 2 through `maxHopDepth` (default: 6).

---

### 32.4 Tier 1 — Direct Predicate Discovery

For each `(subjectClass, predicate, objectClassOrLiteralType)` from Q1 and Q2:

1. Verify `subjectClass` and `predicate` have resolvable labels (Labeling Law, any level including IRI cleaning).
2. Verify `objectClassOrLiteralType` is a resolvable class IRI or known XSD datatype.
3. If both pass, generate a Tier 1 mapping with: `shorthand` = predicate IRI; `domainClasses` = `[subjectClass]`; `rangeClasses` = `[objectClassOrLiteralType]`; `pattern` = single `branch` with `edge`, `node`, `bind` steps; `tier: 1`; `source: "discovered"`.
4. `ui` block populated via Labeling Law and Control Inference.
5. `exposure: "smeSurface"` if labeling succeeds; `"internal"` otherwise.
6. If the same predicate appears with multiple subject classes, generate one mapping per unique `(subjectClass, predicate)` pair.

---

### 32.5 Tier 2 — OWL Property Chain Discovery

For each `(property, chain)` from Q3:

1. Parse the `rdf:List` structure to extract the ordered list of constituent properties.
2. Verify each constituent property is in the ontology closure.
3. Determine domain of first property and range of last property.
4. Generate a Tier 2 mapping with: `shorthand` = property IRI; steps generated by traversing the chain in order with final `bind`; `tier: 2`; `source: "discovered"`.
5. `ui` block populated via Labeling Law and Control Inference.

Tier 2 mappings take precedence over Tier 1 mappings for the same predicate IRI.

---

### 32.6 Tier 3 — Frequent Path Discovery

#### 32.6.1 Sampling Phase

For each subject class `SC` with instance count > `minInstanceCount` (default: 100), execute Q5 to sample up to 1,000 instances and record all reachable paths of 2 to `maxHopDepth` hops that terminate at a distinct object class `OC`.

#### 32.6.2 Frequency Calculation

For each discovered path `P` from `SC` to `OC`:

```
frequencyScore(P, SC) =
  count(instances of SC with path P)
  /
  count(instances of SC with any path to OC)
```

This measures dominance among all paths between the same subject-object pair, not raw occurrence count.

#### 32.6.3 Promotion Threshold

A path `P` is promoted to a Compound Intent when all of the following hold:

1. `frequencyScore(P, SC)` ≥ `promotionThreshold` (default: 0.70, configurable).
2. `count(instances of SC with path P)` ≥ `minInstanceCount` (default: 100, configurable).
3. Path length is between `minPathLength` (default: 3 hops) and `maxHopDepth` (default: 6 hops).
4. Every node class in the path has a resolvable label via the Labeling Law.
5. The path does not duplicate an already-discovered Tier 1 or Tier 2 mapping for the same `(SC, OC)` pair.

#### 32.6.4 Path Explosion Cap

Per `(SC, OC)` pair, at most `maxCompoundIntentsPerPair` (default: 5) Compound Intents are promoted. When more than 5 paths pass the threshold:

1. Rank by `frequencyScore` descending.
2. Promote the top 5.
3. Log remaining candidates for optional static override.

#### 32.6.5 Compound Label Composition Algorithm

**Step 1 — Identify the Semantic Anchor**
Walk the path and find the node class with the greatest subsumption depth from `owl:Thing` that is not the subject class or object class. This class is the semantic anchor.

**Step 2 — Apply the Labeling Law to the Anchor**
Resolve the anchor class label. Use the shortest resolved form for brevity.

**Step 3 — Compose the Label**
Use the anchor label directly as the intent label. Subject and object context are provided by `ui.subjectLabel` and `outputBind.label`, not by the intent label itself.

**Step 4 — Disambiguation**
If two Compound Intents for the same `(SC, OC)` pair share a composed label after Step 3, add the second-most-specific intermediate class: `"{Anchor} via {SecondAnchor}"`. As a last resort, append frequency: `"Employment (94%)"` vs `"Employment (67%)"`.

#### 32.6.6 Compound Intent Shorthand

```
rpm:compound_{SubjectClassLocalName}_{ObjectClassLocalName}_{AnchorClassLocalName}_v{N}
```

Where `N` is the frequency rank (1-based) when multiple compound intents exist for the same `(SC, OC, Anchor)` combination.

---

### 32.7 Automated Promotion Rules

A discovered mapping is automatically assigned `exposure: "smeSurface"` when all of the following are true:
1. Labeling Law resolves a label at any level (including IRI cleaning, provided quality threshold passes).
2. Domain class has a resolvable label.
3. Range class or literal type is known.
4. For Tier 3: `frequencyScore` ≥ `promotionThreshold` and `instanceCount` ≥ `minInstanceCount`.

Otherwise assigned `exposure: "internal"`. All promotion decisions are logged with their basis or exclusion reason.

---

### 32.8 Optional Static Override

The v1.5 static Mapping Registry is fully supported. Static entries may: override auto-generated labels with curated labels; provide `examples` arrays; suppress unwanted auto-promoted mappings by setting `exposure: "internal"`; add Compound Intents below the frequency threshold; correct misclassified groups.

The static registry is not required. The system is fully operational without it.

---

### 32.9 Refresh Policy

#### 32.9.1 Two Distinct Freshness Concerns

The v2.0 refresh policy treated all freshness as a single concern. v2.1 distinguishes two fundamentally different situations with different solutions:

**Schema-level change** — A new predicate, a new class, or a new structural pattern has been added to the graph. This requires a re-crawl to add new mappings to the registry and new intents to the catalog. Without a re-crawl, the SME cannot find the new predicate.

**Data-level change** — A new *instance* of an already-known class has been added to the graph (e.g., a new Catalyst entity, a new Person, a new Batch record). This does not require a re-crawl. Entity search queries the live SPARQL endpoint directly and always returns current instances. The SME will find the new instance immediately in entity search results without any refresh.

**Developer and SME communication requirement:** The UI must communicate this distinction clearly. The "Refresh search options" control applies to schema-level changes only. A tooltip or help text must state: "Refreshing updates the available search types. Individual records are always up to date."

#### 32.9.2 Schema Refresh Triggers

The discovered registry is built once at startup and held in memory. Schema refresh is triggered by:

1. **Process restart** — always re-discovers.
2. **`POST /rpm/refresh`** — programmatic trigger; requires `curator` role (Section 35.4).
3. **SME-facing UI button** — "Refresh search options"; requires `curator` role; visible in the application header or settings area; triggers `POST /rpm/refresh`.
4. **Scheduled interval** — configurable; default: disabled; recommended: every 24 hours for graphs with frequent schema changes.

The SME-facing refresh button must:
- Be visible to `curator` role users only. `sme` role users do not see it.
- Show a progress indicator ("Updating search options…") while the crawl runs.
- Show a completion notification ("Search options updated. [N] new search types available.") on success.
- Show a system error banner on failure (using the `CRAWL_ENDPOINT_UNREACHABLE` template from Section 25.2).

#### 32.9.3 Refresh Safety

During a schema refresh, the previous in-memory registry remains active until the new crawl completes. Switchover is atomic: no request served during the crawl will see a partially-assembled registry.

If a refresh crawl fails (endpoint unreachable, tier timeout), the previous registry remains active and the failure is logged. The system does not degrade to an empty catalog on crawl failure.

#### 32.9.4 Entity Search Freshness

Entity search results are not cached by RPM. Every `entitySearch` field input triggers a live SPARQL query against the configured endpoint. New instances added to the graph appear in entity search results immediately without any refresh action. This is the intended and correct behaviour; it must not be changed in the name of performance without explicit product sign-off.

---

### 32.10 Discovery Report

After every crawl the engine writes a Discovery Report to the log:

```json
{
  "@type": "rpm:DiscoveryReport",
  "timestamp": "2026-03-20T12:00:00Z",
  "endpoint": "https://example.org/sparql",
  "duration_ms": 14320,
  "tier1": { "patternsFound": 847, "promoted": 612, "suppressed": 235 },
  "tier2": { "chainsFound": 12, "promoted": 12, "suppressed": 0 },
  "tier3": {
    "pathsAnalyzed": 2341,
    "compoundIntentsPromoted": 34,
    "suppressed": 198,
    "capHit": 3
  },
  "staticOverrides": { "loaded": 8, "conflicts": 2, "conflictResolution": "staticWins" },
  "catalogSize": { "smeSurface": 658, "internal": 205 },
  "labelingLawExhausted": 42,
  "errors": []
}
```

Available at `GET /rpm/discovery-report` for operational monitoring. Must never be exposed to SMEs.

---

---

## Section 33 — Compliance Test Suite (updated, formerly Section 30)

---

### 33.1 Purpose

Fifteen Canonical Tests (CT-01 through CT-15). CT-01 through CT-07 are unchanged from v1.5. CT-08 through CT-12 are unchanged from v2.0. CT-13 through CT-15 are new in v2.1, covering the revised quality threshold, the Result Narrative Synthesis, and the Label Override API. All fifteen tests are blocking in CI/CD.

---

### 33.2 CT-01 through CT-07

Unchanged. See v1.5 Section 30.2–30.8 for full specifications. Note: The CT-01 SME Blind Test scan dictionary must be updated to include auto-generated `shorthand` IRI values, `labelSource` values, `inputTypeSource` values, `tier` values, `frequencyScore`, `instanceCount`, and `source` field values.

---

### 33.3 CT-08 — Labeling Law Priority Test

**What it verifies:** `skos:prefLabel` overrides `rdfs:label` on the same IRI.

**Setup:** Ontology closure with `test:hasCatalyst` having both `rdfs:label "Catalytic Agent"@en` and `skos:prefLabel "Catalyst"@en`.

**Input:** Invoke the Labeling Law on `test:hasCatalyst`.

**Pass criterion:** Resolved label is `"Catalyst"`. `labelSource` is `"skos:prefLabel"`.

**Fail criterion:** Any other label value, or incorrect `labelSource`.

---

### 33.4 CT-09 — IRI Cleaning Algorithm and Quality Threshold Test

**What it verifies:** The cleaning algorithm produces correct output for representative inputs, and the revised v2.1 quality threshold (§30.5) correctly admits industrial alphanumeric identifiers while rejecting pure numeric identifiers.

**Part A — Cleaning algorithm correctness (unchanged from v2.0):**

| Input Local Name | Expected Cleaned Label |
|---|---|
| `has_catalyst` | `Has Catalyst` |
| `hasCatalyst` | `Has Catalyst` |
| `ActOfEmployment` | `Act Of Employment` |
| `procured_via` | `Procured Via` |
| `DistillationProcess` | `Distillation Process` |
| `CCOPerson` | `CCO Person` |
| `hasBFORole` | `Has BFO Role` |

**Pass criterion (Part A):** All seven pairs produce the expected cleaned label exactly.

**Part B — Quality threshold boundary cases (v2.1 revision to §30.5 Rule 1):**

| Input Local Name | Cleaned Result | Passes Threshold? | Reason |
|---|---|---|---|
| `BFO_0000023` | `BFO 0000023` | No | No alphabetic word (≥2 consecutive alpha chars): "BFO" is an acronym prefix but the overall string has no word; the `[A-Za-z]{2,}` match on "BFO" technically satisfies the pattern — see note below |
| `TANK_01` | `Tank 01` | Yes | "TANK" is a four-character alphabetic word; `[A-Za-z]{2,}` satisfied |
| `PUMP_A2` | `Pump A2` | Yes | "PUMP" is an alphabetic word |
| `R2` | `R 2` | No | Single alphabetic character "R" before digit; `[A-Za-z]{2,}` not satisfied |
| `VALVE_3B` | `Valve 3B" | Yes | "VALVE" is an alphabetic word |
| `4421` | `4421` | No | All digits; no alphabetic content at all |
| `ID_4421` | `ID 4421` | Yes | "ID" is two consecutive alphabetic characters; `[A-Za-z]{2,}` satisfied |

**Note on `BFO_0000023`:** The cleaning algorithm produces `BFO 0000023`. The string "BFO" matches `[A-Za-z]{2,}`. Under a strict application of Rule 1 this would pass. However, §30.5 Rule 1 has a secondary condition: if the alphabetic portion is a known ontology acronym prefix (BFO, CCO, OWL, RDF, RDFS, SKOS, XSD) and the remainder is purely numeric, the threshold fails. This secondary condition must be implemented as a lookup against the same namespace prefix list used in Rule 3. `BFO 0000023` therefore still fails via the combined Rule 1 + Rule 3 namespace check.

**Pass criterion (Part B):** All seven rows produce the expected `Passes Threshold?` outcome. The `BFO_0000023` row must fail despite the "BFO" alphabetic match.

**Fail criterion:** Any row in Part A produces an unexpected cleaned label, including case differences. Any row in Part B produces an unexpected threshold outcome.

---

### 33.5 CT-10 — Control Inference Table Test

**What it verifies:** The XSD-to-UI mapping table (§31.2) is applied correctly.

**Input / Expected output pairs:**

| Range Type | Expected `inputType` | Expected `filterOp` must include |
|---|---|---|
| `xsd:string` | `text` | `contains` |
| `xsd:decimal` | `number` | `gt`, `lt`, `range` |
| `xsd:dateTime` | `date` | `range` |
| `xsd:boolean` | `boolean` | `eq` only |
| ObjectProperty (OWL class) | `entitySearch` | `eq` only |
| No range declared | `text` | `eq`, `contains` |

**Pass criterion:** All six `inputType` values match exactly. All expected `filterOp` tokens are present.

**Fail criterion:** Any `inputType` mismatch or missing `filterOp` token.

---

### 33.6 CT-11 — Frequent Path Discovery Test

**What it verifies:** The Frequent Path Discovery algorithm correctly identifies and promotes a high-frequency path as a Compound Intent.

**Setup:** In-memory SPARQL test endpoint containing:
- 1,000 instances of `test:Person`.
- 950 connected via 4-hop path: `test:Person → test:hasRole → test:EmployeeRole → test:realizesIn → test:Job → test:atOrganization → test:Organization`.
- 50 connected via 2-hop path: `test:Person → test:memberOf → test:Organization`.
- All classes and predicates have `rdfs:label` values in the ontology closure.

**Procedure:** Run Tier 3 discovery with default thresholds (`promotionThreshold: 0.70`, `minInstanceCount: 100`, `minPathLength: 3`).

**Pass criteria:**
1. The 4-hop path is promoted as a Compound Intent with `frequencyScore` ≥ 0.90.
2. The 2-hop path is NOT promoted as Tier 3 (below `minPathLength`; should appear as Tier 1).
3. The Compound Intent label is derived from `test:Job` or `test:EmployeeRole` (whichever is the semantic anchor).
4. `instanceCount` ≥ 950.

**Fail criterion:** 4-hop path not promoted; 2-hop path promoted as Tier 3; wrong anchor class used for label; `instanceCount` below 950.

---

### 33.7 CT-12 — Dynamic Error Template Test

**What it verifies:** The Dynamic Template Engine correctly injects discovered labels into error message templates.

**Setup:** Discovered mapping for `test:hasCatalyst` with: `ui.label: "Has Catalyst"`, `ui.subjectLabel: "Chemical Process"`, `ui.inputParameters[0].label: "Catalyst"`.

**Input:**
```json
{
  "@type": "rpm:RPMError",
  "errorCode": "SUBCLASS_VIOLATION",
  "intent": "test:hasCatalyst",
  "subject": "ex:SomeOtherThing",
  "clauseIndex": 0
}
```

**Pass criterion:** The `TranslatedError` has:
- `severity: "validation"`, `placement: "inline"`, `clauseIndex: 0`
- `userMessage` containing `"Chemical Process"` and `"Has Catalyst"`
- `userMessage` containing no raw IRIs, error codes, namespace prefixes, or internal identifiers

**Fail criterion:** `userMessage` contains `"SUBCLASS_VIOLATION"`, `"test:hasCatalyst"`, or any term from the §26 prohibited list. Any required field absent or incorrect.

---

### 33.8 CT-13 — Quality Threshold Boundary Test

**What it verifies:** The revised Section 30.5 Rule 1 correctly admits industrial alphanumeric identifiers while still rejecting pure numeric identifiers.

**Test type:** Boundary correctness.

**Input / Expected outcome pairs:**

| Input Local Name | Expected Outcome | Reason |
|---|---|---|
| `BFO_0000023` | Fails quality threshold | "BFO" is a namespace prefix and remainder is all digits — secondary condition of Rule 1 triggered |
| `TANK_01` | Passes → cleaned label "Tank 01" | "TANK" satisfies `[A-Za-z]{2,}` and is not a namespace prefix |
| `PUMP_A2` | Passes → cleaned label "Pump A2" | "PUMP" satisfies `[A-Za-z]{2,}` and is not a namespace prefix |
| `R2` | Fails quality threshold | "R" is only one alphabetic character; base condition `[A-Za-z]{2,}` not satisfied |
| `VALVE_3B` | Passes → cleaned label "Valve 3B" | "VALVE" satisfies `[A-Za-z]{2,}` and is not a namespace prefix |
| `ID_4421` | Passes → cleaned label "ID 4421" | "ID" satisfies `[A-Za-z]{2,}`; "ID" is not in the namespace prefix list |
| `4421` | Fails quality threshold | No alphabetic characters; base condition not satisfied |

Note on `BFO_0000023`: The base condition is satisfied by "BFO" (three consecutive alpha chars). The result fails because the secondary condition is triggered: "BFO" is a known namespace prefix and all remaining non-space characters ("0000023") are digits. The combined check therefore fails Rule 1.

Note on `ID_4421`: "ID" is two consecutive alphabetic characters and is not in the namespace prefix list. The cleaned label "ID 4421" is short but valid. Two-letter tokens that are not namespace prefixes are admitted.

**Pass criterion:** All seven rows produce the expected outcome. Labels are cleaned per Section 30.4 before threshold evaluation.

**Fail criterion:** Any row produces an outcome different from expected.

---

### 33.9 CT-14 — Narrative Synthesis Test

**What it verifies:** The Narrative Synthesis Layer produces a correct plain-language path summary for a resolved CGP, with no prohibited terms in the output.

**Test type:** Narrative correctness and firewall compliance.

**Setup:** A resolved Tier 1 CGP for the mapping `test:hasCatalyst` with:
- Subject: `ex:Batch501`, type `mfg:ChemicalProcess`, resolved label "Batch 501" (from `rdfs:label`)
- Predicate: `test:hasCatalyst`, resolved label "Has Catalyst"
- Bound node: `ex:Palladium`, type `mfg:Catalyst`, resolved label "Palladium"

**Input:** Pass the CGP to the Narrative Synthesis Layer.

**Pass criterion:** The `narrativeSummary` field of the `NarrativeResult` object contains a string that:
- Includes "Batch 501" (or the subject label)
- Includes "Has Catalyst" or "catalyst" in some natural form
- Includes "Palladium" (or the bound node label)
- Contains none of: `ex:`, `mfg:`, `test:`, `_:b`, raw IRI fragments, or any term from the Section 26 prohibited list
- Is a grammatically complete sentence or phrase

**Fail criterion:** Any prohibited term appears in `narrativeSummary`. The field is absent. The field is empty. The output is not human-readable.

---

### 33.10 CT-15 — Label Override Persistence Test

**What it verifies:** A label override written via the Override API persists across a catalog rebuild and appears correctly in the Intent Catalog without triggering a full re-crawl.

**Test type:** Persistence and partial rebuild.

**Setup:** A discovered mapping with `shorthand: "test:hasCatalyst"`, `ui.label: "Has Catalyst"`, `source: "discovered"`.

**Procedure:**
1. Submit `POST /rpm/overrides` with body `{ "shorthand": "test:hasCatalyst", "label": "Catalyst Agent" }` using a `curator`-role credential.
2. Verify the API returns HTTP 200 with the updated label in the response body.
3. Verify the override is persisted to the override store (check `GET /rpm/overrides`).
4. Verify the Intent Catalog reflects the new label without a full re-crawl (check `GET /rpm/catalog` for the affected entry).
5. Simulate a process restart. Verify the override survives the restart and is applied to the freshly discovered mapping on startup.

**Pass criteria:**
1. API returns HTTP 200 with `{ "shorthand": "test:hasCatalyst", "label": "Catalyst Agent", "overrideId": "..." }`.
2. `GET /rpm/overrides` includes the override entry.
3. The Intent Catalog shows "Catalyst Agent" for this mapping within 5 seconds of the override submission, without a full re-crawl having run.
4. After simulated restart, the Intent Catalog shows "Catalyst Agent" for this mapping.

**Fail criterion:** Label not updated in catalog within 5 seconds. Override not present in `GET /rpm/overrides`. Override lost after simulated restart. API returns any non-200 status for a valid `curator`-role override request.

---

### 33.11 CI/CD Integration Requirements

All fifteen tests are blocking. No deployment may proceed with any failing canonical test.

**Complete trigger matrix for v2.1:**

| Test | Registry change | Engine change | Labeling Law change | Control Inference change | Narrative Layer change | Override API change | Static Registry change |
|---|---|---|---|---|---|---|---|
| CT-01 | ✓ | | | | | | ✓ |
| CT-02 | | ✓ | | | | | |
| CT-03 | ✓ | ✓ | | | | | |
| CT-04 | | ✓ | | | | | |
| CT-05 | ✓ | | | | | | ✓ |
| CT-06 | | ✓ | | | | | |
| CT-07 | ✓ | | | ✓ | | | |
| CT-08 | | | ✓ | | | | |
| CT-09 | | | ✓ | | | | |
| CT-10 | | | | ✓ | | | |
| CT-11 | ✓ | ✓ | ✓ | | | | |
| CT-12 | ✓ | ✓ | ✓ | | | | ✓ |
| CT-13 | | | ✓ | | | | |
| CT-14 | | | ✓ | | ✓ | | |
| CT-15 | | | | | | ✓ | |

CT-11 must run against a seeded test endpoint — never the production endpoint.

CT-12 must re-run whenever any mapping is added to the registry.

CT-15 must be run in a clean state (empty override store) at the start of each CI run to prevent override accumulation from prior test runs affecting results.

CT-01 scan dictionary must be updated to include: all auto-generated shorthand IRI values; `labelSource`, `inputTypeSource`, `tier`, `frequencyScore`, `instanceCount`, `source` field values; `overrideId` values; `narrativeSummary` construction tokens (IRI fragments must not appear in narrative output).

---

---

---

## Section 34 — Result Narrative Synthesis

---

### 34.1 Purpose

The Narrative Synthesis Layer transforms a resolved CGP into a plain-language path summary that the SME can read. Without this layer, the SME receives a correct answer expressed as a graph structure that violates the Exposure Prohibition. The Narrative Generator bridges the structural CGP output and the human-readable Results View.

The Narrative Synthesis Layer is subject to the same Firewall Principle (Section 21.1) as all other SME-facing output. No IRI, predicate name, class name, blank node ID, or namespace prefix may appear in any generated narrative string.

---

### 34.2 Definitions

**NarrativeResult**

The output of the Narrative Synthesis Layer for a single result row. Contains the structured CGP (unchanged, for adapter use) plus the narrative fields for UI rendering.

```json
{
  "@type": "rpm:NarrativeResult",
  "cgp": { },
  "narrativeSummary": "Batch 501 uses Palladium as its catalyst.",
  "narrativePath": [
    { "role": "subject", "label": "Batch 501" },
    { "role": "predicate", "label": "uses" },
    { "role": "object", "label": "Palladium" }
  ],
  "sourceIntent": "mfg:hasCatalyst",
  "sourceIntentLabel": "Has Catalyst"
}
```

**narrativeSummary**: A complete, grammatically coherent sentence or phrase expressing the result in plain language. Used as the primary readable output in the Results View.

**narrativePath**: A structured array of the nodes and edges traversed, each with a resolved label. Used by the UI for progressive disclosure ("show path" affordance).

**sourceIntent** and **sourceIntentLabel**: Internal reference fields. `sourceIntentLabel` is the only field from this pair that may be rendered to SMEs.

---

### 34.3 Narrative Generation Algorithm

The algorithm operates on a resolved CGP and the mapping's resolved `ui` block.

#### Step 1 — Resolve Subject Label

Take the subject node's `@id`. Look up its resolved display label in the following order:
1. The literal value of a `has_legal_name` or equivalent designating intent bound to this node in the result set (if available).
2. The entity's own `rdfs:label` or `skos:prefLabel` from the graph.
3. The entity's `@id` local name, cleaned via the IRI cleaning algorithm (Section 30.4), provided it passes the quality threshold.
4. The `ui.subjectLabel` of the mapping (class-level fallback: "the [Subject Type]").

#### Step 2 — Resolve Predicate Verb

The predicate in the narrative is not the raw predicate IRI. It is derived as follows:
1. Use the `ui.label` of the mapping, converted to a verb phrase. Conversion rules:
   - Labels beginning with "Has" → replace with "has" (e.g., "Has Catalyst" → "has").
   - Labels beginning with "Employed by" → "is employed by".
   - Labels beginning with "Is" → lowercase as-is.
   - All other labels → use the label directly in lowercase as a noun phrase introduced by "is linked to via" (fallback).
2. For Compound Intents: use the anchor class label in past tense or participial form if possible, else use the `ui.label` directly.

The predicate verb conversion is a best-effort algorithm. The output must be human-readable; it does not need to be linguistically perfect.

#### Step 3 — Resolve Object Label

Take the bound output node's resolved label using the same priority as Step 1, applied to the bound node rather than the subject.

#### Step 4 — Compose the Summary Sentence

For Tier 1 mappings (direct predicate):

```
"{SubjectLabel} {predicateVerb} {ObjectLabel}."
```

Example: "Batch 501 has catalyst Palladium."

For Tier 2 and Tier 3 mappings (multi-hop):

```
"{SubjectLabel} {predicateVerb} {ObjectLabel} via {anchorLabel}."
```

Example: "Alice is employed by Acme Corp via Act Of Employment."

The `via {anchorLabel}` clause is omitted if the anchor label is identical to the predicate verb (which can occur when the anchor class label and the mapping label resolve to the same word).

#### Step 5 — Assemble narrativePath

For each node and edge in the CGP walk order:
- Edge steps: `{ "role": "predicate", "label": "[resolved predicate label]" }`
- Node steps: `{ "role": "intermediate", "label": "[resolved node class label]" }`
- Bind steps: `{ "role": "object", "label": "[resolved bound node label]" }`
- Root node: `{ "role": "subject", "label": "[resolved subject label]" }`

Internal node classes (e.g., `EmployeeRole`, `ActOfEmployment`) appear in the `narrativePath` but not in the `narrativeSummary`. The path array is available for a UI affordance like "Show how this result was found" — a progressive disclosure mechanism that never shows IRIs, only resolved labels.

---

### 34.4 Firewall Enforcement

Before the `NarrativeResult` is passed to the UI renderer, the Narrative Synthesis Layer must run a prohibited-term scan equivalent to CT-01 over the `narrativeSummary` and all `label` fields in `narrativePath`. If a prohibited term is detected:

1. Replace the affected field with its Labeling Law fallback at the next priority level.
2. If no fallback is available, substitute the class-level label from `ui.subjectLabel` or `ui.outputBinds[n].label` as appropriate.
3. If no class-level label is available, omit the affected clause from the summary entirely. A shorter correct sentence is preferable to a sentence containing a prohibited term.

The firewall scan must never produce a `TranslatedError` for this condition — it is an internal correction, not a user-facing failure. The correction and the original prohibited term must be logged.

---

### 34.5 Multi-Clause Narrative

When the query has multiple clauses (composed query), each clause produces its own `NarrativeResult`. The Results View assembles them into a combined display:

**Sequential (AND) mode:**

```
Alice is employed by Acme Corp (via Act Of Employment).
Alice has legal name "Smith".
```

**Parallel (OR) mode:**

```
One of the following applies:
· Alice is employed by Acme Corp (via Act Of Employment).
· Alice is affiliated with Acme Corp.
```

**Chained (targetToSubject) mode:**

```
Alice has legal name "Smith"
→ whose employer is Acme Corp.
```

These are rendered as distinct text blocks in the Results View, not as a single merged sentence. The UI is responsible for layout; the Narrative Layer is responsible for individual clause summaries only.

---

### 34.6 Results View Integration

The `narrativeSummary` is rendered as a subtitle beneath the result entity's primary identifier in the Results View. The `narrativePath` is accessible via a "Show path" disclosure toggle on each result row. The `sourceIntentLabel` is rendered as a small label tag on the result row.

The raw CGP is never rendered. The `sourceIntent` IRI is never rendered. The `narrativePath` `role` field values (`"subject"`, `"predicate"`, `"intermediate"`, `"object"`) are never rendered — they govern layout only.

---

## Section 35 — Label Override API

---

### 35.1 Purpose

The Label Override API allows authorised users to correct auto-generated labels without developer involvement, without editing the static registry file, and without triggering a full re-crawl. An override written by a Curator is visible to all users immediately and persists across restarts and re-crawls.

This closes the zero-config loop for label quality: the engine discovers and labels everything automatically; Curators improve labels that the Labeling Law resolved poorly; SMEs benefit from both.

---

### 35.2 Role Model

RPM v2.1 defines a minimal two-role model. Role enforcement is the responsibility of the deployment environment; RPM specifies the role names and their permissions.

| Role | Override API | Refresh API | Discovery Report | Intent Catalog |
|---|---|---|---|---|
| `sme` | Read-only | No access | No access | Full read |
| `curator` | Read and write | Can trigger | Can read | Full read |

Role claims are passed in request headers. The Override API must reject write requests from `sme`-role credentials with HTTP 403. Unauthenticated requests must be rejected with HTTP 401.

The role model is intentionally minimal. Multi-tenant access control, team-level permissions, and audit trails beyond logging are deployment concerns outside the scope of this spec.

---

### 35.3 Override Store

Overrides are persisted in a durable override store, separate from both the static registry and the in-memory discovered registry. The override store is a local file by default (`rpm-overrides.json`) with the following structure:

```json
{
  "@type": "rpm:OverrideStore",
  "version": "2.1.0",
  "overrides": [
    {
      "overrideId": "ov_3a9f2c1d",
      "shorthand": "test:hasCatalyst",
      "label": "Catalyst Agent",
      "description": null,
      "group": null,
      "examples": null,
      "createdAt": "2026-03-20T14:23:00Z",
      "createdBy": "curator@example.org",
      "appliesTo": "discovered"
    }
  ]
}
```

**Fields:**
- `overrideId`: Deterministic identifier, SHA-256 of `shorthand + createdAt`, truncated to 8 hex chars, prefixed `ov_`.
- `shorthand`: The mapping shorthand this override applies to. Must match a shorthand in the merged registry.
- `label`, `description`, `group`, `examples`: Nullable. Only non-null fields override the corresponding `ui` block field. Null fields leave the current value unchanged.
- `appliesTo`: `"discovered"` (only overrides discovered mappings), `"static"` (only overrides static mappings), or `"any"` (overrides either). Default: `"discovered"`.
- `createdAt`, `createdBy`: Provenance. `createdBy` is the authenticated user identity from the request.

The override store is loaded at startup before the static registry merge. Override store entries are applied after the static registry merge: they override the final merged value for the specified field(s).

**Precedence order (highest to lowest):**
1. Override store entries
2. Static registry entries
3. Discovered registry entries

---

### 35.4 API Endpoints

#### `GET /rpm/overrides`

Returns all override store entries.

Response `200 OK`:
```json
{
  "overrides": [ { ... } ],
  "count": 1
}
```

Required role: `sme` or `curator`.

---

#### `POST /rpm/overrides`

Creates or updates an override for a specific mapping shorthand.

Request body:
```json
{
  "shorthand": "test:hasCatalyst",
  "label": "Catalyst Agent",
  "description": "The chemical agent that initiates or accelerates the process.",
  "group": null,
  "examples": ["What catalyst was used in Batch 501?"],
  "appliesTo": "discovered"
}
```

All fields except `shorthand` are nullable. At least one non-null overrideable field (`label`, `description`, `group`, or `examples`) must be provided; a request with only `shorthand` is rejected with HTTP 400.

If an override for the specified `shorthand` already exists, it is replaced entirely (not merged). The prior entry is recorded in the log before replacement.

Response `200 OK`:
```json
{
  "overrideId": "ov_3a9f2c1d",
  "shorthand": "test:hasCatalyst",
  "label": "Catalyst Agent",
  "appliedAt": "2026-03-20T14:23:00Z",
  "catalogRebuilt": true
}
```

`catalogRebuilt: true` indicates that the partial catalog rebuild completed before the response was sent. The calling UI can immediately re-fetch the affected catalog entry.

Required role: `curator`. Returns HTTP 403 for `sme` role.

---

#### `DELETE /rpm/overrides/{overrideId}`

Removes a specific override. The mapping reverts to its static or discovered value for the affected field(s). Triggers a partial catalog rebuild for the affected shorthand.

Response `200 OK`:
```json
{
  "overrideId": "ov_3a9f2c1d",
  "shorthand": "test:hasCatalyst",
  "revertedTo": "discovered",
  "catalogRebuilt": true
}
```

Required role: `curator`.

---

### 35.5 Partial Catalog Rebuild

When an override is created, updated, or deleted, the engine performs a targeted partial rebuild: only the mapping entries in the merged registry and Intent Catalog whose shorthand matches the affected override are reprocessed. The full discovery crawl is not re-run.

The partial rebuild must complete within 500ms. If it exceeds this limit, the catalog entry is marked stale and a background rebuild is queued; the API returns `"catalogRebuilt": false` and the UI must poll `GET /rpm/catalog/{shorthand}` to check completion.

---

### 35.6 Override Scope Constraints

An override may only modify `ui` block presentation fields: `label`, `description`, `group`, and `examples`. Overrides may not modify:
- `exposure` (smeSurface / internal classification)
- `domainClasses` or `rangeClasses`
- `pattern` structure
- `tier` or `source` fields
- `inputParameters` or `outputBinds` role assignments

If a request attempts to override a prohibited field, the API returns HTTP 400 with a plain-language error: "The field '[field]' cannot be changed through the Override API. Contact your system administrator to modify the mapping configuration."

Exposure classification changes (promoting an `internal` mapping to `smeSurface` or vice versa) require a static registry entry or a future dedicated API. This is intentional: exposure decisions have semantic consequences that warrant deliberate curator action beyond a label correction.

---

### 35.7 UI Entry Point

The "Edit label" affordance is available in two locations:

**Intent Catalog (Query Builder, Screen 2):** A small edit icon appears on hover next to each intent label in the left sidebar, visible to `curator`-role users only. Clicking opens a modal with pre-populated label and description fields and a Save button. On Save, `POST /rpm/overrides` is called and the intent label updates in place.

**Results View (Screen 5):** A "Fix label" link appears in the column header area, visible to `curator`-role users only. Clicking opens the same modal.

Neither affordance is visible to `sme`-role users.

The modal must never expose the `shorthand` IRI, `overrideId`, `appliesTo`, or any internal field to the curator user. The curator works with plain-language fields only.

---

## Section 29 — Future Portability Notes (updated for v2.1)

---

### 29.1 Status Update

This section was introduced in v1.4 to document three BFO/CCO coupling points. Two of the three were resolved in v2.0. One remains. A new portability note was added in v2.0 for sparse graphs. No new coupling points were introduced in v2.1; the four additions in v2.1 (quality threshold revision, refresh policy, Narrative Synthesis, Label Override API) are all ontology-agnostic.

---

### 29.2 Coupling Point 1 — The Subsumption Model

**Status: Partially resolved.**

The pluggable TypeResolver interface was specified in v1.5. The default implementation uses OWL/RDFS subsumption. Alternative implementations (e.g., Wikidata P279 traversal) may be substituted at deployment. This coupling point is now an implementation choice, not an architectural constraint.

**Remaining work:** The TypeResolver interface is specified as a design intent but not yet as a formal interface contract with defined method signatures. A future release should add a language-neutral interface specification (TypeScript, Python) to the developer handoff materials.

---

### 29.3 Coupling Point 2 — ICE Literal Handling

**Status: Resolved.**

`direct` and `ice` are now co-equal modes. Control Inference (Section 31) selects the appropriate mode based on range type without normative preference for either. The `literalConvention` registry-level default is implementable using the static registry override mechanism. This coupling point is closed.

---

### 29.4 Coupling Point 3 — Ontological Language in Documentation

**Status: Resolved for normative content.**

Part I normative language no longer contains BFO/CCO-specific requirements. Section 14 examples now include a manufacturing graph example (Section 14.1) alongside BFO/CCO examples. This coupling point is closed for normative content. The Section 14 examples retain BFO/CCO content as illustrative material, which is appropriate — they are examples, not constraints.

---

### 29.5 New Portability Note — Frequent Path Discovery on Sparse Graphs

**Status: Known limitation.**

The Tier 3 algorithm requires sufficient instance density to produce statistically reliable frequency scores. Graphs with fewer than `minInstanceCount` instances of a given subject class will produce no Tier 3 Compound Intents for that class. Tier 1 and Tier 2 will still function normally for sparse graphs.

For sparse graphs, the recommended approach is to lower `minInstanceCount` to an appropriate value for the data size, or to provide a static registry with curated Compound Intents that encode the important multi-hop paths manually.

---

### 29.6 What Is Not a Coupling Point

The following were confirmed ontology-agnostic in v1.5 and remain so in v2.0: the pattern grammar (Section 6), CGP output format (Section 13), CGP_c composition structure (Section 24.4), UI block schema (Section 22), error model and TranslatedError contract (Sections 11, 25), adapter interface (Section 16), SME Surface Contract (Sections 21–28), and deterministic blank node strategy (Section 9).

---

*RPM v2.1 — Discovery-First Architecture — Production Specification.*
*Parts I, II, III (Sections 30–35), and Section 33 are jointly required for a conforming v2.1 implementation.*
*The static Mapping Registry from v1.5 remains valid as an optional override layer and is not deprecated.*
