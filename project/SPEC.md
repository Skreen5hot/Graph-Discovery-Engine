# GDE Domain Specification — RPM v2.1

<!--
  This file defines the input/output contract for the Graph Discovery Engine kernel.
  All types are implemented in src/kernel/types.ts.

  Normative sources:
    project/RPM-v2.1-FINAL.md     — Engine specification (§4 Input/Output Contract)
    project/GDE-UI-SPEC-v2.1.md   — UI specification (screens, components, design system)
-->

---

## 1. Input Contract (RPM §4.1)

Two entry points, both pure functions:

```typescript
RPM_Expand(intent: string, subject: Subject, context: RPMContext)
  → CGP | RPMError | RPMPartialCGP

RPM_Compose(composedQuery: CQO, context: RPMContext)
  → CGP_c | RPMError[]
```

### Intent

A `string` — the mapping shorthand identifying the pattern to expand. May be a predicate IRI (Tier 1/2) or a compound shorthand (Tier 3: `rpm:compound_{SC}_{OC}_{Anchor}_v{N}`).

### Subject (RPM §4.2)

```typescript
interface Subject {
  "@id": string;     // Entity IRI, e.g. "ex:Alice"
  "@type": string[]; // One or more class IRIs, e.g. ["cco:Person", "schema:Worker"]
}
```

Validation: at least one declared `@type` must be a subclass of at least one `domainClass` in the mapping (any-match via `TypeResolver`).

### Context (RPM §4.1)

```typescript
interface RPMContext {
  mappingRegistry: MappingRegistry;  // Merged: discovered + static + overrides
  ontologyClosure: OntologyClosure;  // Classes, properties, labels, subsumption
  [key: string]: unknown;            // Optional runtime parameters
}
```

### Composed Query Object — CQO (RPM §24)

```typescript
interface CQO {
  clauses: CQOClause[];             // One or more intent clauses
  composition: {
    mode: JoinType;                  // "subjectToSubject" | "union" | "targetToSubject"
    anchors?: JoinAnchor[];
  };
}

interface CQOClause {
  intent: string;
  subject: Subject;
  parameters?: Record<string, unknown>;
}
```

---

## 2. Output Contract (RPM §4.3)

### CGP — Canonical Graph Pattern (single clause)

```typescript
interface CGP extends JsonLdDocument {
  "@graph": CGPNode[];               // Expanded graph nodes with deterministic @id values
  provenance: Provenance;            // kernelVersion + rulesApplied
}
```

All blank node IDs are SHA-256 derived, truncated to 16 lowercase hex characters (RPM §9).

### CGP_c — Composed Graph Pattern (multiple clauses)

```typescript
interface CGP_c {
  "@type": "rpm:ComposedGraphPattern";
  clauses: CGP[];
  joinType: JoinType;
  joinAnchors?: JoinAnchor[];        // subjectToSubject mode
  unionRoots?: string[];             // union mode
  chainLinks?: ChainLink[];          // targetToSubject mode
}
```

### RPMError

Returned on failure. Default behavior is fail-closed (RPM §4.3).

```typescript
interface RPMError {
  "@type": "rpm:RPMError";
  errorCode: RPMErrorCode;           // 11 defined codes — see src/kernel/types.ts
  intent?: string;
  subject?: string;
  clauseIndex?: number;
  details?: string;
}
```

### TranslatedError (RPM §25)

The SME-facing representation. Contains ONLY plain language — no IRIs, no error codes.

```typescript
interface TranslatedError {
  "@type": "rpm:TranslatedError";
  userMessage: string;               // Injected via Dynamic Template Engine
  severity: "validation" | "system";
  placement: "inline" | "banner";    // Drives UI rendering (UI Spec §19.1)
  fieldBinding?: string;
  clauseIndex: number;
}
```

### NarrativeResult (RPM §34)

Plain-language result summary for the UI Results View (UI Spec §10.3).

```typescript
interface NarrativeResult {
  "@type": "rpm:NarrativeResult";
  cgp: CGP;
  narrativeSummary: string;          // "Batch 501 has catalyst Palladium."
  narrativePath: NarrativePathEntry[];
  sourceIntent: string;              // Internal — never rendered to SMEs
  sourceIntentLabel: string;         // May be rendered as label tag
}
```

---

## 3. Key Domain Types

All types are defined in `src/kernel/types.ts`. Key structures:

| Type | Purpose | RPM Section |
|------|---------|-------------|
| `MappingDefinition` | A single mapping in the registry | §5.3 |
| `MappingRegistry` | Hybrid registry (discovered + static + merged) | §5.2 |
| `UIBlock` | Auto-generated or hand-authored UI metadata | §22.1 |
| `InputParameter` | A single input field inferred by Control Inference | §22.3, §31.2 |
| `OutputBind` | A bound output variable displayed in results | §22.4 |
| `PatternStep` | Step in a path pattern: edge, node, bind, literal, branch | §6 |
| `OntologyClosure` | Classes, properties, labels, subsumption chains | §3.4 |
| `OverrideEntry` | A curator label override | §35.3 |
| `DiscoveryReport` | Post-crawl statistics | §32.10 |
| `TypeResolver` | Pluggable subsumption interface | §10 |
| `IntentCatalog` | Runtime catalog filtered to smeSurface | §23 |

---

## 4. JSON-LD Context

**Decision: Embedded context.** CGP output uses an embedded `@context` object (not a remote URL). Defined in `src/kernel/cgp-serializer.ts` as `CGP_CONTEXT`.

```typescript
const CGP_CONTEXT = {
  rpm:  "https://spec.example.org/rpm/v2/",
  rdf:  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl:  "http://www.w3.org/2002/07/owl#",
  xsd:  "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
};
```

Production contexts may extend this with domain-specific prefixes (e.g., `mfg`, `cco`). The identity transform's `"@context": "https://schema.org"` remains in the template snapshot test and will be replaced when Phase 1.6 updates the examples.

---

## 5. Examples

The `examples/` directory currently contains the template's identity transform input/output. These will be updated when Phase 1.6 replaces the identity transform with `RPM_Expand`. Until then, the snapshot test validates against the current identity transform output.

**Target example** (Phase 1.6): A Tier 1 `RPM_Expand` call with a `mfg:hasCatalyst` intent on a `mfg:ChemicalProcess` subject, producing a CGP with edge → node → bind steps and SHA-256 blank node IDs.
