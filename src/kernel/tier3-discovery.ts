/**
 * Tier 3 — Frequent Path Discovery — RPM v2.1 §32.6
 *
 * Identifies high-frequency multi-hop paths from Q5 sampling results
 * and promotes them to Compound Intents. Each compound intent compresses
 * a frequently-traversed N-hop path into a single SME-facing intent.
 *
 * The frequency score measures dominance among all paths between the
 * same subject-object class pair (§32.6.2), not raw occurrence count.
 *
 * Pure function: no I/O, no network. Operates on pre-fetched Q5 path
 * signatures and instance count data.
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
import { resolveLabel, resolveHintWithSource, resolveGroup, extractLocalName } from "./labeling.js";
import { inferControl } from "./control-inference.js";
import type { PromotionLogEntry } from "./tier1-discovery.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configurable thresholds for Tier 3 discovery (§32.6). */
export interface Tier3Config {
  /** Minimum frequency score for promotion (default: 0.70). */
  promotionThreshold: number;
  /** Minimum instance count for promotion (default: 100). */
  minInstanceCount: number;
  /** Minimum path length in hops for Tier 3 (default: 3). */
  minPathLength: number;
  /** Maximum hop depth for path sampling (default: 6). */
  maxHopDepth: number;
  /** Maximum compound intents per (SC, OC) pair (default: 5). */
  maxCompoundIntentsPerPair: number;
}

/** Default Tier 3 configuration. */
export const DEFAULT_TIER3_CONFIG: Tier3Config = {
  promotionThreshold: 0.70,
  minInstanceCount: 100,
  minPathLength: 3,
  maxHopDepth: 6,
  maxCompoundIntentsPerPair: 5,
};

// ---------------------------------------------------------------------------
// Types — Path Data
// ---------------------------------------------------------------------------

/** A single hop in a discovered path: predicate + node class. */
export interface PathHop {
  predicate: string;
  nodeClass: string;
}

/** A discovered path between a subject class and object class. */
export interface DiscoveredPath {
  subjectClass: string;
  objectClass: string;
  hops: PathHop[];
  /** Number of sampled instances that traversed this path. */
  instanceCount: number;
}

/** Pre-processed sampling data for a single subject class. */
export interface SubjectClassSample {
  subjectClass: string;
  totalInstances: number;
  paths: DiscoveredPath[];
}

// ---------------------------------------------------------------------------
// §32.6.2 — Frequency Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the frequency score for a path (§32.6.2).
 *
 * Dominance ratio: instances with this path / instances with ANY path to
 * the same object class. Not raw occurrence count.
 */
function calculateFrequency(
  path: DiscoveredPath,
  allPaths: DiscoveredPath[],
): number {
  // Denominator: total instances that reach the same OC by any path
  const pathsToSameOC = allPaths.filter(
    (p) => p.subjectClass === path.subjectClass && p.objectClass === path.objectClass,
  );
  const totalToOC = pathsToSameOC.reduce((sum, p) => sum + p.instanceCount, 0);

  if (totalToOC === 0) return 0;
  return path.instanceCount / totalToOC;
}

// ---------------------------------------------------------------------------
// §32.6.5 — Semantic Anchor Selection
// ---------------------------------------------------------------------------

/**
 * Find the semantic anchor: the node class with the greatest subsumption
 * depth from owl:Thing, excluding the subject and object classes (§32.6.5).
 *
 * Depth is computed as subsumptionDistance from owl:Thing to the class.
 * Greater depth = more specific class = better anchor.
 */
function findSemanticAnchor(
  hops: PathHop[],
  subjectClass: string,
  objectClass: string,
  typeResolver: TypeResolver,
): string | undefined {
  const candidates = hops
    .map((hop) => hop.nodeClass)
    .filter((cls) => cls !== subjectClass && cls !== objectClass);

  if (candidates.length === 0) return undefined;

  let bestAnchor: string | undefined;
  let bestDepth = -1;

  for (const candidate of candidates) {
    // Depth = distance from owl:Thing to candidate
    // We approximate by using subsumptionDistance(candidate, "owl:Thing")
    // If the candidate IS a subclass of owl:Thing, the distance is the depth
    const depth = typeResolver.subsumptionDistance(candidate, "owl:Thing");
    // Also check full IRI form
    const depthFull = typeResolver.subsumptionDistance(
      candidate, "http://www.w3.org/2002/07/owl#Thing",
    );
    const effectiveDepth = Math.max(depth, depthFull);

    if (effectiveDepth > bestDepth) {
      bestDepth = effectiveDepth;
      bestAnchor = candidate;
    }
  }

  // If no depth was found (classes not connected to owl:Thing),
  // fall back to the last intermediate class (most specific by position)
  if (bestAnchor === undefined && candidates.length > 0) {
    bestAnchor = candidates[candidates.length - 1];
  }

  return bestAnchor;
}

// ---------------------------------------------------------------------------
// §32.6.5 — Compound Label Composition
// ---------------------------------------------------------------------------

/**
 * Compose the compound label from the semantic anchor (§32.6.5).
 * Steps 1–4: anchor label directly, disambiguate if needed.
 */
function composeCompoundLabel(
  anchorClass: string | undefined,
  hops: PathHop[],
  closure: OntologyClosure,
  existingLabels: Set<string>,
): string {
  if (!anchorClass) return "Path";

  // Step 2: Resolve anchor label
  const resolution = resolveLabel(anchorClass, closure);
  let label = resolution.status === "resolved" ? resolution.label : "Path";

  // Step 4: Disambiguation — if label already used for same (SC, OC) pair
  if (existingLabels.has(label)) {
    // Find second-most-specific intermediate class
    const intermediates = hops
      .map((h) => h.nodeClass)
      .filter((c) => c !== anchorClass);
    if (intermediates.length > 0) {
      const secondRes = resolveLabel(intermediates[intermediates.length - 1], closure);
      if (secondRes.status === "resolved") {
        label = `${label} via ${secondRes.label}`;
      }
    }
  }

  // Final disambiguation: if still duplicate, append will be handled by caller
  // via frequency percentage
  return label;
}

// ---------------------------------------------------------------------------
// §32.6.6 — Compound Intent Shorthand
// ---------------------------------------------------------------------------

/**
 * Generate the compound intent shorthand (§32.6.6).
 * Format: rpm:compound_{SC}_{OC}_{Anchor}_v{N}
 * Uses local names from extractLocalName (not full IRIs).
 */
function generateCompoundShorthand(
  subjectClass: string,
  objectClass: string,
  anchorClass: string | undefined,
  rank: number,
): string {
  const scLocal = extractLocalName(subjectClass);
  const ocLocal = extractLocalName(objectClass);
  const anchorLocal = anchorClass ? extractLocalName(anchorClass) : "Path";
  return `rpm:compound_${scLocal}_${ocLocal}_${anchorLocal}_v${rank}`;
}

// ---------------------------------------------------------------------------
// Path Signature Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Q5 path signature string into an ordered array of hops.
 *
 * Path signatures are pipe-separated: "pred1|class1|pred2|class2|..."
 * This is NOT the same as the canonical hash input format — do not
 * use buildCanonicalInput for parsing (different escape rules).
 */
export function parsePathSignature(signature: string): PathHop[] {
  const parts = signature.split("|");
  const hops: PathHop[] = [];

  for (let i = 0; i + 1 < parts.length; i += 2) {
    hops.push({
      predicate: parts[i],
      nodeClass: parts[i + 1],
    });
  }

  return hops;
}

// ---------------------------------------------------------------------------
// §32.6 — Main Tier 3 Generation
// ---------------------------------------------------------------------------

/**
 * Generate Tier 3 Compound Intent mappings from sampled path data (§32.6).
 *
 * @param samples - Pre-processed sampling data per subject class
 * @param closure - Ontology closure for label resolution
 * @param typeResolver - For semantic anchor depth calculation
 * @param existingPairs - Set of "(SC, OC)" strings already covered by Tier 1/2 (§32.6.3 Rule 5)
 * @param config - Configurable thresholds
 * @returns Tier 3 mappings and promotion log
 */
export function generateTier3Mappings(
  samples: SubjectClassSample[],
  closure: OntologyClosure,
  typeResolver: TypeResolver,
  existingPairs: Set<string> = new Set(),
  config: Tier3Config = DEFAULT_TIER3_CONFIG,
): { mappings: MappingDefinition[]; promotionLog: PromotionLogEntry[] } {
  const mappings: MappingDefinition[] = [];
  const promotionLog: PromotionLogEntry[] = [];

  for (const sample of samples) {
    // Group paths by (SC, OC) pair
    const pairGroups = new Map<string, DiscoveredPath[]>();
    for (const path of sample.paths) {
      const key = `${path.subjectClass}|${path.objectClass}`;
      const group = pairGroups.get(key) ?? [];
      group.push(path);
      pairGroups.set(key, group);
    }

    for (const [pairKey, pathGroup] of pairGroups) {
      // §32.6.3 Rule 5: Skip if already covered by Tier 1/2
      if (existingPairs.has(pairKey)) {
        for (const path of pathGroup) {
          promotionLog.push({
            shorthand: pairKey,
            exposure: "internal",
            reason: "Duplicate of existing Tier 1/2 mapping for same (SC, OC) pair",
          });
        }
        continue;
      }

      // Calculate frequency for each path and evaluate promotion
      const candidates: Array<{
        path: DiscoveredPath;
        frequency: number;
        anchor: string | undefined;
      }> = [];

      for (const path of pathGroup) {
        const frequency = calculateFrequency(path, sample.paths);
        const hopCount = path.hops.length;

        // §32.6.3 Rules 1–3: threshold, instance count, path length
        if (frequency < config.promotionThreshold) {
          promotionLog.push({
            shorthand: pairKey,
            exposure: "internal",
            reason: `Frequency ${frequency.toFixed(2)} below threshold ${config.promotionThreshold}`,
          });
          continue;
        }

        if (path.instanceCount < config.minInstanceCount) {
          promotionLog.push({
            shorthand: pairKey,
            exposure: "internal",
            reason: `Instance count ${path.instanceCount} below minimum ${config.minInstanceCount}`,
          });
          continue;
        }

        if (hopCount < config.minPathLength || hopCount > config.maxHopDepth) {
          promotionLog.push({
            shorthand: pairKey,
            exposure: "internal",
            reason: `Path length ${hopCount} outside range [${config.minPathLength}, ${config.maxHopDepth}]`,
          });
          continue;
        }

        // §32.6.3 Rule 4: All node classes must have resolvable labels
        const allLabeled = path.hops.every((hop) => {
          const res = resolveLabel(hop.nodeClass, closure);
          return res.status === "resolved";
        });
        if (!allLabeled) {
          promotionLog.push({
            shorthand: pairKey,
            exposure: "internal",
            reason: "One or more intermediate classes have unresolvable labels",
          });
          continue;
        }

        const anchor = findSemanticAnchor(
          path.hops,
          path.subjectClass,
          path.objectClass,
          typeResolver,
        );

        candidates.push({ path, frequency, anchor });
      }

      // §32.6.4: Cap at maxCompoundIntentsPerPair, ranked by frequency
      candidates.sort((a, b) => b.frequency - a.frequency);

      const promoted = candidates.slice(0, config.maxCompoundIntentsPerPair);
      const capped = candidates.slice(config.maxCompoundIntentsPerPair);

      // Log capped candidates
      for (const c of capped) {
        promotionLog.push({
          shorthand: pairKey,
          exposure: "internal",
          reason: `Path explosion cap: only top ${config.maxCompoundIntentsPerPair} promoted`,
        });
      }

      // Compose labels and build mappings for promoted candidates
      const usedLabels = new Set<string>();

      for (let rank = 0; rank < promoted.length; rank++) {
        const { path, frequency, anchor } = promoted[rank];

        // §32.6.5: Compound label composition
        let label = composeCompoundLabel(anchor, path.hops, closure, usedLabels);

        // Final disambiguation with frequency if still duplicate
        if (usedLabels.has(label)) {
          label = `${label} (${Math.round(frequency * 100)}%)`;
        }
        usedLabels.add(label);

        // §32.6.6: Shorthand
        const shorthand = generateCompoundShorthand(
          path.subjectClass,
          path.objectClass,
          anchor,
          rank + 1,
        );

        // Build pattern
        const pattern = buildTier3Pattern(path, shorthand);

        // Build UI block
        const ui = buildTier3UIBlock(
          label,
          path,
          frequency,
          closure,
          typeResolver,
        );

        mappings.push({
          shorthand,
          source: "discovered",
          tier: 3,
          exposure: "smeSurface",
          domainClasses: [path.subjectClass],
          rangeClasses: [path.objectClass],
          pattern,
          ui,
          description: `Auto-generated. Frequent path (${Math.round(frequency * 100)}%).`,
          frequencyScore: frequency,
          instanceCount: path.instanceCount,
        });

        promotionLog.push({
          shorthand,
          exposure: "smeSurface",
          reason: `Frequency ${frequency.toFixed(2)}, ${path.instanceCount} instances, ${path.hops.length} hops`,
        });
      }
    }
  }

  return { mappings, promotionLog };
}

// ---------------------------------------------------------------------------
// Pattern Construction
// ---------------------------------------------------------------------------

function buildTier3Pattern(
  path: DiscoveredPath,
  shorthand: string,
): BranchStep {
  const steps: PatternStep[] = [];

  for (const hop of path.hops) {
    steps.push({ type: "edge", predicate: hop.predicate, direction: "forward" });
    steps.push({ type: "node", class: hop.nodeClass });
  }

  // Final bind
  steps.push({ type: "bind", role: "target" });

  return {
    type: "branch",
    name: extractLocalName(shorthand),
    steps,
  };
}

// ---------------------------------------------------------------------------
// UI Block Construction
// ---------------------------------------------------------------------------

function buildTier3UIBlock(
  label: string,
  path: DiscoveredPath,
  frequency: number,
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): UIBlock {
  const domainResolution = resolveLabel(path.subjectClass, closure);
  const subjectLabel = domainResolution.status === "resolved"
    ? domainResolution.label : "";

  const rangeResolution = resolveLabel(path.objectClass, closure);
  const resolvedRangeLabel = rangeResolution.status === "resolved"
    ? rangeResolution.label : "";

  const group = resolveGroup(path.subjectClass, closure);

  const controlResult = inferControl(path.objectClass, path.hops[0]?.predicate ?? "", closure, typeResolver);

  const inputParam: InputParameter = {
    id: `${extractLocalName(path.objectClass)}-filter`,
    role: "target",
    label: resolvedRangeLabel,
    hint: `Search for ${resolvedRangeLabel.toLowerCase() || "a result"} by name`,
    inputType: controlResult.inputType,
    inputTypeSource: controlResult.inputTypeSource,
    required: false,
    filterOp: controlResult.filterOp,
  };

  const outputBind: OutputBind = {
    role: "target",
    label: resolvedRangeLabel,
    description: `The ${resolvedRangeLabel.toLowerCase() || "result"} reached via the ${label} path.`,
  };

  return {
    label,
    labelSource: "compoundComposition",
    description: `${subjectLabel} to ${resolvedRangeLabel} path via ${label}, present in ${Math.round(frequency * 100)}% of ${subjectLabel} instances.`,
    group,
    groupSource: "domainClassLabel",
    examples: [],
    subjectLabel,
    inputParameters: [inputParam],
    outputBinds: [outputBind],
  };
}
