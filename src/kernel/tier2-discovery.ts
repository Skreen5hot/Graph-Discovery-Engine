/**
 * Tier 2 — OWL Property Chain Discovery — RPM v2.1 §32.5
 *
 * Transforms Q3 SPARQL results (OWL property chain axioms) into
 * MappingDefinition entries. Each chain produces a multi-step pattern
 * with edge/node pairs for each constituent property.
 *
 * Tier 2 mappings take precedence over Tier 1 for the same predicate IRI.
 *
 * Pure function: no I/O, no network. Operates on pre-fetched Q3 results
 * and the ontology closure.
 */

import type {
  MappingDefinition,
  MappingExposure,
  OntologyClosure,
  BranchStep,
  PatternStep,
  UIBlock,
  InputParameter,
  OutputBind,
  TypeResolver,
} from "./types.js";
import { resolveLabel, resolveHintWithSource, resolveGroup } from "./labeling.js";
import { inferControl } from "./control-inference.js";
import type { PromotionLogEntry } from "./tier1-discovery.js";

// ---------------------------------------------------------------------------
// Types — Q3 Result Shape
// ---------------------------------------------------------------------------

/** A parsed property chain from Q3 results. */
export interface PropertyChain {
  /** The declared property with the owl:propertyChainAxiom. */
  property: string;
  /** The ordered list of constituent property IRIs from the rdf:List. */
  chainProperties: string[];
}

// ---------------------------------------------------------------------------
// §32.5 — Tier 2 Mapping Generation
// ---------------------------------------------------------------------------

/**
 * Generate Tier 2 mappings from parsed property chains (§32.5).
 *
 * For each chain:
 * 1. Verify all constituent properties are in the closure
 * 2. Determine domain (first property) and range (last property)
 * 3. Generate multi-step pattern: edge/node pairs for each hop, final bind
 * 4. Auto-populate UI block
 * 5. Apply promotion rules
 *
 * @param chains - Parsed property chains from Q3
 * @param closure - Ontology closure for label/property lookup
 * @param typeResolver - For Control Inference ICE detection
 * @returns Tier 2 mappings and promotion log
 */
export function generateTier2Mappings(
  chains: PropertyChain[],
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): { mappings: MappingDefinition[]; promotionLog: PromotionLogEntry[] } {
  const mappings: MappingDefinition[] = [];
  const promotionLog: PromotionLogEntry[] = [];

  for (const chain of chains) {
    // Step 1: Verify all constituent properties exist in closure
    const allInClosure = chain.chainProperties.every(
      (propIri) => closure.properties.has(propIri),
    );
    if (!allInClosure) {
      promotionLog.push({
        shorthand: chain.property,
        exposure: "internal",
        reason: "One or more chain properties not in ontology closure",
      });
      continue;
    }

    // Step 2: Domain from first property, range from last property
    const firstProp = closure.properties.get(chain.chainProperties[0]);
    const lastProp = closure.properties.get(chain.chainProperties[chain.chainProperties.length - 1]);

    const domainClasses = firstProp?.domain ?? [];
    const rangeClasses = lastProp?.range ?? [];

    if (domainClasses.length === 0) {
      promotionLog.push({
        shorthand: chain.property,
        exposure: "internal",
        reason: "First chain property has no declared domain",
      });
      continue;
    }

    // Step 3: Generate pattern
    const pattern = buildChainPattern(chain, closure);

    // Step 4: Resolve labels and build UI block
    const propertyLabel = resolveLabel(chain.property, closure);
    const domainLabel = resolveLabel(domainClasses[0], closure);
    const rangeType = rangeClasses.length > 0 ? rangeClasses[0] : null;

    // Step 5: Promotion evaluation
    const exposure: MappingExposure =
      propertyLabel.status === "resolved" && domainLabel.status === "resolved"
        ? "smeSurface"
        : "internal";

    const reason =
      exposure === "smeSurface"
        ? "All promotion criteria met"
        : propertyLabel.status === "exhausted"
          ? "Property label unresolvable"
          : "Domain class label unresolvable";

    const ui = buildTier2UIBlock(
      chain.property,
      domainClasses[0],
      rangeType,
      closure,
      typeResolver,
    );

    mappings.push({
      shorthand: chain.property,
      source: "discovered",
      tier: 2,
      exposure,
      domainClasses,
      rangeClasses,
      pattern,
      ui,
      description: "Auto-generated. OWL property chain.",
    });

    promotionLog.push({
      shorthand: chain.property,
      exposure,
      reason,
    });
  }

  return { mappings, promotionLog };
}

// ---------------------------------------------------------------------------
// Pattern Construction
// ---------------------------------------------------------------------------

/**
 * Build a multi-step pattern from a property chain.
 * Each constituent property produces an edge → node pair.
 * The final step is a bind.
 */
function buildChainPattern(
  chain: PropertyChain,
  closure: OntologyClosure,
): BranchStep {
  const steps: PatternStep[] = [];

  for (let i = 0; i < chain.chainProperties.length; i++) {
    const propIri = chain.chainProperties[i];
    const prop = closure.properties.get(propIri);

    // Edge step for this hop
    steps.push({ type: "edge", predicate: propIri, direction: "forward" });

    // Node step — use the range of this property as the class
    const nodeClass = prop?.range?.[0] ?? "owl:Thing";
    steps.push({ type: "node", class: nodeClass });
  }

  // Final bind step
  steps.push({ type: "bind", role: "target" });

  return {
    type: "branch",
    name: extractSimpleName(chain.property),
    steps,
  };
}

/** Extract a simple name from an IRI for the branch name. */
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

function buildTier2UIBlock(
  property: string,
  domainClass: string,
  rangeType: string | null,
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): UIBlock {
  const predicateResolution = resolveLabel(property, closure);
  const label = predicateResolution.status === "resolved"
    ? predicateResolution.label : "";
  const labelSource = predicateResolution.status === "resolved"
    ? predicateResolution.level : undefined;

  const hintResult = resolveHintWithSource(property, closure);
  const group = resolveGroup(domainClass, closure);

  const subjectResolution = resolveLabel(domainClass, closure);
  const subjectLabel = subjectResolution.status === "resolved"
    ? subjectResolution.label : "";

  const rangeResolution = rangeType ? resolveLabel(rangeType, closure) : null;
  const resolvedRangeLabel = rangeResolution?.status === "resolved"
    ? rangeResolution.label : "";

  const controlResult = inferControl(rangeType, property, closure, typeResolver);

  const inputParam: InputParameter = {
    id: `${extractSimpleName(property)}-filter`,
    role: "target",
    label: resolvedRangeLabel,
    hint: hintResult.value,
    inputType: controlResult.inputType,
    inputTypeSource: controlResult.inputTypeSource,
    required: false,
    filterOp: controlResult.filterOp,
    unit: controlResult.unit,
    selectOptions: controlResult.selectOptions,
  };

  const outputBind: OutputBind = {
    role: "target",
    label: resolvedRangeLabel,
    description: rangeType
      ? resolveHintWithSource(rangeType, closure).value
      : "",
  };

  return {
    label,
    labelSource,
    description: hintResult.value,
    descriptionSource: hintResult.source,
    group,
    groupSource: "domainClassLabel",
    examples: [],
    subjectLabel,
    inputParameters: rangeType ? [inputParam] : [],
    outputBinds: rangeType ? [outputBind] : [],
  };
}
