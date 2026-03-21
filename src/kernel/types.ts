/**
 * RPM v2.1 Domain Types
 *
 * Canonical type definitions for the Graph Discovery Engine.
 * All types are pure data — no methods, no I/O, no side effects.
 *
 * Source: project/RPM-v2.1-FINAL.md
 * UI contract: project/GDE-UI-SPEC-v2.1.md
 */

// ---------------------------------------------------------------------------
// JSON-LD Foundation
// ---------------------------------------------------------------------------

/** A valid JSON-LD document. MUST include @context. */
export interface JsonLdDocument {
  "@context":
    | string
    | Record<string, unknown>
    | Array<string | Record<string, unknown>>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Provenance and Uncertainty
// ---------------------------------------------------------------------------

/** Deterministic provenance metadata. No timestamps — determinism constraint. */
export interface Provenance {
  "@type": "Provenance";
  kernelVersion: string;
  rulesApplied: string[];
}

/** Uncertainty annotation for unresolved values (RPM §13). */
export interface UncertaintyAnnotation {
  "@type": "Uncertainty";
  status: "deferred" | "assumed" | "unknown";
  reason: string;
  references: string[];
}

// ---------------------------------------------------------------------------
// Subject (RPM §4.2)
// ---------------------------------------------------------------------------

/** The entity being queried. */
export interface Subject {
  "@id": string;
  "@type": string[];
}

// ---------------------------------------------------------------------------
// Pattern Grammar (RPM §6)
// ---------------------------------------------------------------------------

export interface EdgeStep {
  type: "edge";
  predicate: string;
  direction: "forward" | "inverse";
}

export interface NodeStep {
  type: "node";
  class: string;
}

export interface BindStep {
  type: "bind";
  role: string;
}

export interface LiteralStep {
  type: "literal";
  via: "direct" | "ice";
}

export interface BranchStep {
  type: "branch";
  name: string;
  steps: PatternStep[];
}

/** A single step in a mapping pattern. */
export type PatternStep =
  | EdgeStep
  | NodeStep
  | BindStep
  | LiteralStep
  | BranchStep;

// ---------------------------------------------------------------------------
// UI Block (RPM §22)
// ---------------------------------------------------------------------------

/**
 * Input types inferred by Control Inference (RPM §31.2).
 * The UI renders each field according to this type.
 * UI Spec §8.5 depends on this enumeration.
 */
export type InputType =
  | "text"
  | "number"
  | "date"
  | "dateRange"
  | "entitySearch"
  | "select"
  | "boolean";

/**
 * The inference rule that selected the inputType (RPM §31.2).
 * Internal — never rendered to SMEs (RPM §26).
 */
export type InputTypeSource =
  | "xsdMapping"
  | "rangeIsObjectProperty"
  | "enumerationDetected"
  | "noRangeFallback";

/** Filter operators for input parameters (RPM §22.6). */
export type FilterOp =
  | "eq"
  | "contains"
  | "startsWith"
  | "gt"
  | "lt"
  | "range";

/** A single input field in the Intent Detail Panel (RPM §22.3, UI Spec §8.5). */
export interface InputParameter {
  id: string;
  role: string;
  label: string;
  hint: string;
  inputType: InputType;
  inputTypeSource: InputTypeSource;
  required: boolean;
  filterOp: FilterOp[];
  unit?: string;
  selectOptions?: SelectOption[];
}

/** An option in a select dropdown (RPM §31.3). */
export interface SelectOption {
  value: string;
  label: string;
}

/** An output binding displayed in the results (RPM §22.4, UI Spec §8.6). */
export interface OutputBind {
  role: string;
  label: string;
  description: string;
}

/**
 * The UI block for a mapping definition (RPM §22.1).
 * Auto-generated for discovered mappings, hand-authored for static.
 * *Source fields are internal — never rendered to SMEs (RPM §26).
 */
export interface UIBlock {
  label: string;
  labelSource?: string;
  description: string;
  descriptionSource?: string;
  group: string;
  groupSource?: string;
  examples: string[];
  subjectLabel: string;
  inputParameters: InputParameter[];
  outputBinds: OutputBind[];
}

// ---------------------------------------------------------------------------
// Mapping Definition (RPM §5.3)
// ---------------------------------------------------------------------------

/** The provenance source of a mapping. */
export type MappingSource = "discovered" | "static" | "merged";

/** Discovery tier: direct predicate, OWL chain, or frequent path. */
export type MappingTier = 1 | 2 | 3;

/** Visibility classification (RPM §5.5). */
export type MappingExposure = "smeSurface" | "internal";

/** A single mapping in the registry (RPM §5.3). */
export interface MappingDefinition {
  shorthand: string;
  source: MappingSource;
  tier: MappingTier;
  exposure: MappingExposure;
  domainClasses: string[];
  rangeClasses: string[];
  pattern: BranchStep;
  ui: UIBlock;
  description: string;
  /** Tier 3 only — dominance ratio among paths between the same (SC, OC) pair (RPM §32.6.2). */
  frequencyScore?: number;
  /** Tier 3 only — absolute count of instances with this path (RPM §32.6.3). */
  instanceCount?: number;
}

// ---------------------------------------------------------------------------
// Mapping Registry (RPM §5.2)
// ---------------------------------------------------------------------------

/** The hybrid mapping registry: discovered + static + merged (RPM §5.1). */
export interface MappingRegistry {
  "@context": { rpm: string };
  "@type": "rpm:MappingRegistry";
  version: string;
  source: MappingSource;
  generatedAt: string;
  graphEndpoint: string;
  mappings: MappingDefinition[];
}

// ---------------------------------------------------------------------------
// Canonical Graph Pattern — CGP (RPM §4.3, §13)
// ---------------------------------------------------------------------------

/** A node in the expanded graph pattern. */
export interface CGPNode {
  "@id": string;
  "@type": string[];
  [predicate: string]: unknown;
}

/** Canonical Graph Pattern — the output of a single intent expansion (RPM §13). */
export interface CGP extends JsonLdDocument {
  "@graph": CGPNode[];
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Composed Graph Pattern — CGP_c (RPM §24.4)
// ---------------------------------------------------------------------------

/** A join anchor between two clauses in a composed query. */
export interface JoinAnchor {
  sourceClause: number;
  targetClause: number;
  sourceNodeId: string;
  targetNodeId: string;
}

/** A chain link between two clauses in a targetToSubject composition. */
export interface ChainLink {
  sourceClause: number;
  targetClause: number;
  fromRole: string;
  toRole: string;
}

/** Composition join type (RPM §24). */
export type JoinType =
  | "subjectToSubject"
  | "union"
  | "targetToSubject";

/** Composed Graph Pattern — multiple clauses combined (RPM §24.4). */
export interface CGP_c {
  "@type": "rpm:ComposedGraphPattern";
  clauses: CGP[];
  joinType: JoinType;
  joinAnchors?: JoinAnchor[];
  unionRoots?: string[];
  chainLinks?: ChainLink[];
}

// ---------------------------------------------------------------------------
// Composed Query Object — CQO (RPM §24)
// ---------------------------------------------------------------------------

/** A single clause in a composed query. */
export interface CQOClause {
  intent: string;
  subject: Subject;
  parameters?: Record<string, unknown>;
}

/** Composed Query Object — input to RPM_Compose (RPM §24). */
export interface CQO {
  clauses: CQOClause[];
  composition: {
    mode: JoinType;
    anchors?: JoinAnchor[];
  };
}

// ---------------------------------------------------------------------------
// Error Handling (RPM §11, §25)
// ---------------------------------------------------------------------------

/** All RPM error codes (RPM §11.2). */
export type RPMErrorCode =
  | "INTENT_NOT_FOUND"
  | "SUBCLASS_VIOLATION"
  | "ONTOLOGY_TERM_UNRESOLVED"
  | "MAPPING_CONSTRAINT_VIOLATION"
  | "INVALID_PATTERN"
  | "DETERMINISTIC_ID_COLLISION"
  | "PARTIAL_RESOLUTION_DISABLED"
  | "COMPOSITION_ANCHOR_MISSING"
  | "COMPOSITION_CHAIN_BROKEN"
  | "CRAWL_ENDPOINT_UNREACHABLE"
  | "LABELING_LAW_EXHAUSTED";

/** Structured error object (RPM §11.1). */
export interface RPMError {
  "@type": "rpm:RPMError";
  errorCode: RPMErrorCode;
  intent?: string;
  subject?: string;
  clauseIndex?: number;
  details?: string;
}

/** Error severity classification (RPM §25.1). */
export type ErrorSeverity = "validation" | "system";

/** Error placement in the UI (RPM §25.1, UI Spec §19.1). */
export type ErrorPlacement = "inline" | "banner";

/**
 * Translated error for the SME surface (RPM §25.1, UI Spec §19).
 * Contains ONLY plain-language content — no IRIs, no error codes.
 */
export interface TranslatedError {
  "@type": "rpm:TranslatedError";
  userMessage: string;
  severity: ErrorSeverity;
  placement: ErrorPlacement;
  fieldBinding?: string;
  clauseIndex: number;
}

/** Partial CGP returned when partial resolution is explicitly configured (RPM §4.3). */
export interface RPMPartialCGP extends CGP {
  "@type": "rpm:PartialCGP";
  unresolvedSteps: string[];
}

// ---------------------------------------------------------------------------
// RPM_Expand Output Type Guards
// ---------------------------------------------------------------------------

/** The full discriminated return type of RPM_Expand (RPM §4.3). */
export type ExpandResult = CGP | RPMError | RPMPartialCGP;

/** Check if an expand result is an RPMError. Discriminates on "@type". */
export function isRPMError(result: ExpandResult): result is RPMError {
  return (
    result != null &&
    typeof result === "object" &&
    "@type" in result &&
    (result as Record<string, unknown>)["@type"] === "rpm:RPMError"
  );
}

/** Check if an expand result is a RPMPartialCGP. Discriminates on "@type". */
export function isPartialCGP(result: ExpandResult): result is RPMPartialCGP {
  return (
    result != null &&
    typeof result === "object" &&
    "@type" in result &&
    (result as Record<string, unknown>)["@type"] === "rpm:PartialCGP"
  );
}

/** Check if an expand result is a successful CGP (not error, not partial). */
export function isCGP(result: ExpandResult): result is CGP {
  return !isRPMError(result) && !isPartialCGP(result);
}

// ---------------------------------------------------------------------------
// Narrative Synthesis (RPM §34)
// ---------------------------------------------------------------------------

/** Role of a node/edge in the narrative path (RPM §34.3 Step 5). */
export type NarrativeRole = "subject" | "predicate" | "intermediate" | "object";

/** A single entry in the narrative path breadcrumb (RPM §34.2, UI Spec §10.4). */
export interface NarrativePathEntry {
  role: NarrativeRole;
  label: string;
}

/**
 * The output of the Narrative Synthesis Layer (RPM §34.2).
 * Consumed by UI Results View (UI Spec §10.3–10.4).
 */
export interface NarrativeResult {
  "@type": "rpm:NarrativeResult";
  cgp: CGP;
  narrativeSummary: string;
  narrativePath: NarrativePathEntry[];
  /** Internal — never rendered to SMEs. */
  sourceIntent: string;
  /** May be rendered to SMEs as a label tag on the result row (UI Spec §34.6). */
  sourceIntentLabel: string;
}

// ---------------------------------------------------------------------------
// Label Override API (RPM §35)
// ---------------------------------------------------------------------------

/** Scope of an override — which mapping source it applies to (RPM §35.3). */
export type OverrideScope = "discovered" | "static" | "any";

/** A single label override entry (RPM §35.3). */
export interface OverrideEntry {
  overrideId: string;
  shorthand: string;
  label: string | null;
  description: string | null;
  group: string | null;
  examples: string[] | null;
  createdAt: string;
  createdBy: string;
  appliesTo: OverrideScope;
}

/** The durable override store (RPM §35.3). */
export interface OverrideStore {
  "@type": "rpm:OverrideStore";
  version: string;
  overrides: OverrideEntry[];
}

// ---------------------------------------------------------------------------
// Ontology Closure (RPM §3.4)
// ---------------------------------------------------------------------------

/** Label annotation on a class or property in the ontology. */
export interface LabelAnnotation {
  value: string;
  language?: string;
  predicate: string;
}

/** A class in the ontology closure. */
export interface OntologyClass {
  iri: string;
  superClasses: string[];
  labels: LabelAnnotation[];
  /**
   * All non-label annotations: rdfs:comment, skos:definition, skos:scopeNote, etc.
   * The Labeling Law hint resolver (§30.6) queries this array by predicate IRI
   * in the same single-lookup pattern as label resolution.
   *
   * Note: Phase 3 crawl queries (RPM §32.3) must fetch skos:definition and
   * skos:scopeNote alongside rdfs:comment to populate this array fully.
   */
  annotations: LabelAnnotation[];
}

/** A property in the ontology closure. */
export interface OntologyProperty {
  iri: string;
  superProperties: string[];
  domain: string[];
  range: string[];
  labels: LabelAnnotation[];
  /**
   * All non-label annotations: rdfs:comment, skos:definition, skos:scopeNote, etc.
   * The Labeling Law hint resolver (§30.6) queries this array by predicate IRI
   * in the same single-lookup pattern as label resolution.
   *
   * Note: Phase 3 crawl queries (RPM §32.3) must fetch skos:definition and
   * skos:scopeNote alongside rdfs:comment to populate this array fully.
   */
  annotations: LabelAnnotation[];
  inverseOf?: string;
  propertyChain?: string[];
}

/**
 * The local ontology input (RPM §3.4).
 * Contains all classes, properties, and their annotations
 * needed for subsumption checks and label resolution.
 *
 * Covers classes and properties only. Named individuals are not
 * indexed here — they are resolved via entity search (Phase 3.5,
 * RPM §32.9.4). Any IRI that is neither a class nor a property
 * will return undefined from both maps.
 */
export interface OntologyClosure {
  classes: Map<string, OntologyClass>;
  properties: Map<string, OntologyProperty>;
}

// ---------------------------------------------------------------------------
// Discovery Report (RPM §32.10)
// ---------------------------------------------------------------------------

/** Tier-level discovery statistics. */
export interface Tier1Report {
  patternsFound: number;
  promoted: number;
  suppressed: number;
}

export interface Tier2Report {
  chainsFound: number;
  promoted: number;
  suppressed: number;
}

export interface Tier3Report {
  pathsAnalyzed: number;
  compoundIntentsPromoted: number;
  suppressed: number;
  capHit: number;
}

/** Static registry merge statistics. */
export interface StaticOverrideReport {
  loaded: number;
  conflicts: number;
  conflictResolution: string;
}

/** Catalog size breakdown. */
export interface CatalogSizeReport {
  smeSurface: number;
  internal: number;
}

/** Discovery report written after every crawl (RPM §32.10). */
export interface DiscoveryReport {
  "@type": "rpm:DiscoveryReport";
  timestamp: string;
  endpoint: string;
  duration_ms: number;
  tier1: Tier1Report;
  tier2: Tier2Report;
  tier3: Tier3Report;
  staticOverrides: StaticOverrideReport;
  catalogSize: CatalogSizeReport;
  labelingLawExhausted: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Labeling Law (RPM §30)
// ---------------------------------------------------------------------------

/** The priority level that resolved a label (RPM §30.2). */
export type LabelingLawLevel =
  | "skos:prefLabel"
  | "rdfs:label"
  | "schema:name"
  | "dc:title"
  | "foaf:name"
  | "iriCleaning";

/**
 * Quality threshold failure reasons (RPM §30.5 Rules 1–3).
 * Used in DiscoveryReport grouping, CT-13 assertions, and
 * curator-facing override history to explain why an intent was suppressed.
 */
export type QualityThresholdFailureReason =
  | "noAlphabeticWord"
  | "tooShort"
  | "namespacePrefixCollision";

/** Successful label resolution — the Labeling Law found a label at some priority level. */
export interface LabelResolutionSuccess {
  status: "resolved";
  iri: string;
  label: string;
  level: LabelingLawLevel;
  language?: string;
}

/** Failed label resolution — all six levels exhausted or quality threshold failed. */
export interface LabelResolutionFailure {
  status: "exhausted";
  iri: string;
  reason: QualityThresholdFailureReason;
}

/**
 * Result of applying the Labeling Law to an IRI (RPM §30).
 * Discriminated union: check `status` field.
 * On failure, the mapping should be assigned `exposure: "internal"`
 * and LABELING_LAW_EXHAUSTED logged.
 */
export type LabelResolution = LabelResolutionSuccess | LabelResolutionFailure;

// ---------------------------------------------------------------------------
// Intent Catalog (RPM §23)
// ---------------------------------------------------------------------------

/** The runtime intent catalog, filtered to smeSurface mappings. */
export interface IntentCatalog {
  subjectTypes: SubjectTypeEntry[];
  groups: CatalogGroup[];
}

/** A subject type available for querying (UI Spec §6.3). */
export interface SubjectTypeEntry {
  classIri: string;
  label: string;
  description: string;
  intentCount: number;
}

/** A group of intents in the catalog (RPM §30.7). */
export interface CatalogGroup {
  name: string;
  intents: MappingDefinition[];
}

// ---------------------------------------------------------------------------
// RPM Context (RPM §4.1)
// ---------------------------------------------------------------------------

/** Runtime context passed to RPM_Expand and RPM_Compose. */
export interface RPMContext {
  mappingRegistry: MappingRegistry;
  ontologyClosure: OntologyClosure;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// TypeResolver Interface (RPM §10)
// ---------------------------------------------------------------------------

/**
 * Pluggable type resolution interface (RPM §10).
 * Default implementation uses OWL/RDFS subsumption.
 * Phase 1 provides a stub (exact-match only).
 * Phase 2.2 provides the real implementation.
 */
export interface TypeResolver {
  /**
   * Check if `subjectType` is a subclass of `domainClass`.
   * Returns true if subsumption holds.
   */
  isSubclassOf(subjectType: string, domainClass: string): boolean;

  /**
   * Calculate the subsumption distance from `subjectType` to `domainClass`.
   * Returns 0 for exact match, 1 for direct superclass, etc.
   * Returns -1 if no subsumption relationship exists.
   */
  subsumptionDistance(subjectType: string, domainClass: string): number;
}
