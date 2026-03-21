/**
 * Tier 1 — Direct Predicate Discovery — RPM v2.1 §32.4
 *
 * Transforms Q1 (object patterns) and Q2 (literal patterns) SPARQL results
 * into MappingDefinition entries with auto-populated UI blocks.
 *
 * For each unique (subjectClass, predicate) pair:
 * 1. Verify labels resolvable via Labeling Law
 * 2. Generate pattern: branch → edge → node → bind
 * 3. Auto-populate UI block via Labeling Law + Control Inference
 * 4. Apply automated promotion rules (§32.7)
 *
 * Pure function: no I/O, no network. Operates on pre-fetched SPARQL results.
 */

import type {
  MappingDefinition,
  MappingExposure,
  OntologyClosure,
  BranchStep,
  UIBlock,
  InputParameter,
  OutputBind,
  TypeResolver,
} from "./types.js";
import { resolveLabel, resolveHint, resolveHintWithSource, resolveGroup } from "./labeling.js";
import { inferControl } from "./control-inference.js";

// ---------------------------------------------------------------------------
// Types — Q1/Q2 Result Shapes
// ---------------------------------------------------------------------------

/** A single row from Q1 (subject-predicate-object class pattern). */
export interface Q1Row {
  subjectClass: string;
  predicate: string;
  objectClass?: string;
}

/** A single row from Q2 (subject-predicate-literal pattern). */
export interface Q2Row {
  subjectClass: string;
  predicate: string;
  literalType?: string;
}

/** Log entry for a promotion decision (§32.7). */
export interface PromotionLogEntry {
  shorthand: string;
  exposure: MappingExposure;
  reason: string;
}

// ---------------------------------------------------------------------------
// §32.4 — Tier 1 Mapping Generation
// ---------------------------------------------------------------------------

/**
 * Generate Tier 1 mappings from Q1 and Q2 SPARQL results (§32.4).
 *
 * One mapping per unique (subjectClass, predicate) pair.
 * Q1 provides object class patterns, Q2 provides literal type patterns.
 * When a predicate appears in both Q1 and Q2, the Q1 (object) result is used.
 *
 * UI blocks are auto-populated:
 * - label, labelSource: Labeling Law on predicate IRI
 * - description, descriptionSource: hint resolution on predicate IRI
 * - group, groupSource: auto-grouping from domain class
 * - subjectLabel: Labeling Law on domain class
 * - inputParameters: Control Inference on range type
 * - outputBinds: label from Labeling Law on range class
 *
 * All outputBind.label values are resolved labels, not IRIs (Phase 1.8 contract).
 *
 * @param q1Rows - Results from Q1 (subject-predicate-object patterns)
 * @param q2Rows - Results from Q2 (subject-predicate-literal patterns)
 * @param closure - Ontology closure for label resolution
 * @param typeResolver - For Control Inference ICE detection
 * @returns Tier 1 mappings and promotion log
 */
export function generateTier1Mappings(
  q1Rows: Q1Row[],
  q2Rows: Q2Row[],
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): { mappings: MappingDefinition[]; promotionLog: PromotionLogEntry[] } {
  const mappings: MappingDefinition[] = [];
  const promotionLog: PromotionLogEntry[] = [];

  // Deduplicate by (subjectClass, predicate) — Q1 takes precedence over Q2
  const seen = new Set<string>();

  // Process Q1 — object class patterns
  for (const row of q1Rows) {
    const key = `${row.subjectClass}|${row.predicate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rangeType = row.objectClass ?? null;
    const result = buildTier1Mapping(
      row.subjectClass,
      row.predicate,
      rangeType,
      false,
      closure,
      typeResolver,
    );
    mappings.push(result.mapping);
    promotionLog.push(result.logEntry);
  }

  // Process Q2 — literal type patterns (only if not already seen from Q1)
  for (const row of q2Rows) {
    const key = `${row.subjectClass}|${row.predicate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rangeType = row.literalType ?? null;
    const result = buildTier1Mapping(
      row.subjectClass,
      row.predicate,
      rangeType,
      true,
      closure,
      typeResolver,
    );
    mappings.push(result.mapping);
    promotionLog.push(result.logEntry);
  }

  return { mappings, promotionLog };
}

// ---------------------------------------------------------------------------
// Individual Mapping Construction
// ---------------------------------------------------------------------------

function buildTier1Mapping(
  subjectClass: string,
  predicate: string,
  rangeType: string | null,
  isLiteral: boolean,
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): { mapping: MappingDefinition; logEntry: PromotionLogEntry } {
  // Resolve labels for promotion evaluation (§32.7)
  const predicateLabel = resolveLabel(predicate, closure);
  const domainLabel = resolveLabel(subjectClass, closure);
  const rangeLabel = rangeType ? resolveLabel(rangeType, closure) : null;

  // Determine exposure via automated promotion rules (§32.7)
  const { exposure, reason } = evaluatePromotion(
    predicateLabel.status,
    domainLabel.status,
    rangeType,
    isLiteral,
  );

  // Build the pattern: branch → edge → node → bind
  const pattern = buildTier1Pattern(predicate, rangeType, isLiteral);

  // Build the UI block
  const ui = buildTier1UIBlock(
    predicate,
    subjectClass,
    rangeType,
    isLiteral,
    closure,
    typeResolver,
  );

  const mapping: MappingDefinition = {
    shorthand: predicate,
    source: "discovered",
    tier: 1,
    exposure,
    domainClasses: [subjectClass],
    rangeClasses: rangeType ? [rangeType] : [],
    pattern,
    ui,
    description: `Auto-generated. Direct predicate.`,
  };

  const logEntry: PromotionLogEntry = {
    shorthand: predicate,
    exposure,
    reason,
  };

  return { mapping, logEntry };
}

// ---------------------------------------------------------------------------
// §32.7 — Automated Promotion Rules
// ---------------------------------------------------------------------------

function evaluatePromotion(
  predicateLabelStatus: "resolved" | "exhausted",
  domainLabelStatus: "resolved" | "exhausted",
  rangeType: string | null,
  isLiteral: boolean,
): { exposure: MappingExposure; reason: string } {
  // Rule 1: Predicate label must resolve
  if (predicateLabelStatus === "exhausted") {
    return { exposure: "internal", reason: "Predicate label unresolvable" };
  }

  // Rule 2: Domain class label must resolve
  if (domainLabelStatus === "exhausted") {
    return { exposure: "internal", reason: "Domain class label unresolvable" };
  }

  // Rule 3: Range class or literal type must be known
  if (!isLiteral && rangeType === null) {
    return { exposure: "internal", reason: "Range class unknown (no objectClass in Q1)" };
  }

  return { exposure: "smeSurface", reason: "All promotion criteria met" };
}

// ---------------------------------------------------------------------------
// Pattern Construction
// ---------------------------------------------------------------------------

function buildTier1Pattern(
  predicate: string,
  rangeType: string | null,
  isLiteral: boolean,
): BranchStep {
  if (isLiteral) {
    // Literal pattern: edge → literal (via direct)
    return {
      type: "branch",
      name: extractSimpleName(predicate),
      steps: [
        { type: "edge", predicate, direction: "forward" },
        { type: "literal", via: "direct" },
      ],
    };
  }

  // Object property pattern: edge → node → bind
  return {
    type: "branch",
    name: extractSimpleName(predicate),
    steps: [
      { type: "edge", predicate, direction: "forward" },
      { type: "node", class: rangeType ?? "owl:Thing" },
      { type: "bind", role: "target" },
    ],
  };
}

/** Extract a simple name from a predicate IRI for the branch name. */
function extractSimpleName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  if (hashIdx !== -1) return iri.substring(hashIdx + 1);
  const slashIdx = iri.lastIndexOf("/");
  if (slashIdx !== -1) return iri.substring(slashIdx + 1);
  return iri;
}

// ---------------------------------------------------------------------------
// UI Block Construction
// ---------------------------------------------------------------------------

function buildTier1UIBlock(
  predicate: string,
  subjectClass: string,
  rangeType: string | null,
  isLiteral: boolean,
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): UIBlock {
  // Label from Labeling Law on predicate
  const predicateResolution = resolveLabel(predicate, closure);
  const label = predicateResolution.status === "resolved"
    ? predicateResolution.label
    : "";
  const labelSource = predicateResolution.status === "resolved"
    ? predicateResolution.level
    : undefined;

  // Description from hint resolution on predicate — with source tracking
  const hintResult = resolveHintWithSource(predicate, closure);
  const description = hintResult.value;

  // Group from auto-grouping on domain class
  const group = resolveGroup(subjectClass, closure);

  // Subject label from Labeling Law on domain class
  const subjectResolution = resolveLabel(subjectClass, closure);
  const subjectLabel = subjectResolution.status === "resolved"
    ? subjectResolution.label
    : "";

  // Range label — resolved once, used by both inputParam and outputBind
  const rangeResolution = rangeType ? resolveLabel(rangeType, closure) : null;
  const resolvedRangeLabel = rangeResolution?.status === "resolved"
    ? rangeResolution.label
    : "";

  // Input parameter from Control Inference
  // Q1 uses executePaginated, Q2 uses executeQuery — the selection is
  // documented here per Orchestrator guidance (not left implicit)
  const controlResult = inferControl(rangeType, predicate, closure, typeResolver);

  const inputParam: InputParameter = {
    id: `${extractSimpleName(predicate)}-filter`,
    role: "target",
    label: resolvedRangeLabel,
    hint: description,
    inputType: controlResult.inputType,
    inputTypeSource: controlResult.inputTypeSource,
    required: false,
    filterOp: controlResult.filterOp,
    unit: controlResult.unit,
    selectOptions: controlResult.selectOptions,
  };

  // Output bind — label resolved at discovery time, not lazily (Phase 1.8 contract)
  const outputBind: OutputBind = {
    role: "target",
    label: resolvedRangeLabel,
    description: rangeType ? resolveHint(rangeType, closure) : "",
  };

  return {
    label,
    labelSource,
    description,
    descriptionSource: hintResult.source,
    group,
    groupSource: "domainClassLabel",
    examples: [],
    subjectLabel,
    inputParameters: isLiteral ? [] : [inputParam],
    outputBinds: isLiteral ? [] : [outputBind],
  };
}
