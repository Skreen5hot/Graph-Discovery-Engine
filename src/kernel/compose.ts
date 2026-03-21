/**
 * Query Composition Model — RPM v2.1 §24
 *
 * Composes multiple intent clauses into a CGP_c (Composed Graph Pattern).
 * Each clause is expanded independently via rpmExpand, then assembled
 * with structural metadata (joinAnchors, unionRoots, chainLinks)
 * based on the composition mode.
 *
 * Also implements specificity scoring for multi-mapping resolution (§5.6).
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type {
  CGP,
  CGP_c,
  CQO,
  CQOClause,
  JoinType,
  JoinAnchor,
  ChainLink,
  RPMError,
  RPMContext,
  MappingDefinition,
  MappingTier,
  TypeResolver,
  ExpandResult,
} from "./types.js";
import { isRPMError, isCGP } from "./types.js";
import { rpmExpand, stubTypeResolver } from "./expand.js";

// ---------------------------------------------------------------------------
// §5.6 — Specificity Scoring
// ---------------------------------------------------------------------------

/**
 * Calculate the specificity score for a mapping against a subject type (§5.6).
 *
 * Score components (lower = more specific = higher rank):
 * 1. Subsumption distance from subject type to domain class (lowest wins)
 * 2. Tier ranking: Tier 1 < Tier 2 < Tier 3 at equal distance
 * 3. Registry position as stable tiebreaker
 *
 * Returns a numeric score suitable for ascending sort.
 */
export function calculateSpecificity(
  mapping: MappingDefinition,
  subjectTypes: string[],
  typeResolver: TypeResolver,
  registryPosition: number,
): number {
  // Find the minimum subsumption distance across all subject type / domain class pairs
  let minDistance = Infinity;
  for (const subjectType of subjectTypes) {
    for (const domainClass of mapping.domainClasses) {
      const distance = typeResolver.subsumptionDistance(subjectType, domainClass);
      if (distance >= 0 && distance < minDistance) {
        minDistance = distance;
      }
    }
  }

  // If no subsumption relationship found, rank last
  if (minDistance === Infinity) {
    return Number.MAX_SAFE_INTEGER;
  }

  // Tier ranking: Tier 1 = 0, Tier 2 = 1, Tier 3 = 2
  const tierRank = mapping.tier - 1;

  // Combine: distance * 1000 + tierRank * 100 + registryPosition
  // This ensures distance is the primary sort key, tier is secondary,
  // and position is the stable tiebreaker
  return minDistance * 1000 + tierRank * 100 + registryPosition;
}

/**
 * Rank mappings by specificity for a given subject (§5.6).
 * Returns mappings sorted by ascending specificity score (most specific first).
 */
export function rankBySpecificity(
  mappings: MappingDefinition[],
  subjectTypes: string[],
  typeResolver: TypeResolver,
): MappingDefinition[] {
  const scored = mappings.map((m, i) => ({
    mapping: m,
    score: calculateSpecificity(m, subjectTypes, typeResolver, i),
  }));

  scored.sort((a, b) => a.score - b.score);

  return scored.map((s) => s.mapping);
}

// ---------------------------------------------------------------------------
// §24 — Composition: Join Anchor Resolution
// ---------------------------------------------------------------------------

/**
 * Find join anchors between two CGPs for subjectToSubject composition.
 *
 * In subjectToSubject mode, clauses share the same subject. The join
 * anchor is the subject node @id that appears in both CGPs.
 */
function resolveJoinAnchors(
  clauses: CGP[],
): JoinAnchor[] {
  const anchors: JoinAnchor[] = [];

  for (let i = 0; i < clauses.length - 1; i++) {
    for (let j = i + 1; j < clauses.length; j++) {
      // Find shared node IDs between the two @graph arrays
      const idsI = new Set(clauses[i]["@graph"].map((n) => String(n["@id"])));
      const idsJ = clauses[j]["@graph"].map((n) => String(n["@id"]));

      for (const id of idsJ) {
        if (idsI.has(id)) {
          anchors.push({
            sourceClause: i,
            targetClause: j,
            sourceNodeId: id,
            targetNodeId: id,
          });
          break; // One anchor per pair is sufficient for subject-to-subject
        }
      }
    }
  }

  return anchors;
}

/**
 * Collect union roots — the distinct subject @ids from all clauses.
 * Used for union (parallel) composition mode.
 */
function resolveUnionRoots(clauses: CGP[]): string[] {
  const roots = new Set<string>();
  for (const clause of clauses) {
    // The subject is typically the non-blank-node with the highest specificity,
    // but for Phase 1 we use the first non-blank node in each @graph
    for (const node of clause["@graph"]) {
      const id = String(node["@id"]);
      if (!id.startsWith("_:")) {
        roots.add(id);
        break;
      }
    }
  }
  return [...roots];
}

/**
 * Build chain links for targetToSubject composition.
 *
 * In targetToSubject mode, the bound output of clause N becomes the
 * subject of clause N+1. The chain link records which role in the source
 * clause maps to the subject of the target clause.
 */
function resolveChainLinks(
  clauses: CGP[],
): ChainLink[] {
  const links: ChainLink[] = [];

  for (let i = 0; i < clauses.length - 1; i++) {
    // Find the bound output node in clause i (has rpm:role)
    const sourceGraph = clauses[i]["@graph"];
    const boundNode = sourceGraph.find(
      (n) => n["rpm:role"] !== undefined,
    );

    if (boundNode) {
      links.push({
        sourceClause: i,
        targetClause: i + 1,
        fromRole: String(boundNode["rpm:role"]),
        toRole: "subject",
      });
    }
  }

  return links;
}

// ---------------------------------------------------------------------------
// §24 — RPM_Compose
// ---------------------------------------------------------------------------

/**
 * Compose multiple intent clauses into a CGP_c (RPM §4.1, §24).
 *
 * Each clause is expanded independently via rpmExpand. If any clause
 * fails, the entire composition fails with an array of RPMErrors.
 *
 * @param composedQuery - The CQO with clauses and composition mode
 * @param context - Runtime context with registry, closure, TypeResolver
 * @returns CGP_c on success, RPMError[] on failure
 */
export function rpmCompose(
  composedQuery: CQO,
  context: RPMContext,
): CGP_c | RPMError[] {
  const errors: RPMError[] = [];
  const expandedClauses: CGP[] = [];

  // Expand each clause independently
  for (let i = 0; i < composedQuery.clauses.length; i++) {
    const clause = composedQuery.clauses[i];
    const result = rpmExpand(clause.intent, clause.subject, context);

    if (isRPMError(result)) {
      // Tag the error with the clause index
      errors.push({ ...result, clauseIndex: i });
    } else if (isCGP(result)) {
      expandedClauses.push(result);
    }
  }

  // If any clause failed, return all errors (fail closed, §4.3)
  if (errors.length > 0) {
    return errors;
  }

  // Assemble the CGP_c with structural metadata based on composition mode
  const mode = composedQuery.composition.mode;

  const cgpC: CGP_c = {
    "@type": "rpm:ComposedGraphPattern",
    clauses: expandedClauses,
    joinType: mode,
  };

  switch (mode) {
    case "subjectToSubject":
      cgpC.joinAnchors = composedQuery.composition.anchors ?? resolveJoinAnchors(expandedClauses);
      break;

    case "union":
      cgpC.unionRoots = resolveUnionRoots(expandedClauses);
      break;

    case "targetToSubject":
      cgpC.chainLinks = resolveChainLinks(expandedClauses);
      break;
  }

  return cgpC;
}
