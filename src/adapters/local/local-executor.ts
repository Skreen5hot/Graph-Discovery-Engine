/**
 * Local Query Executor — Phase 5.C.1
 *
 * Walks a composed graph pattern against the in-memory triple store
 * and returns real result rows. Also provides entity search.
 *
 * Adapter-layer code — MUST NOT be imported by kernel.
 */

import type { LocalTripleStore, Triple } from "./json-ld-loader.js";
import type {
  CGP,
  CGP_c,
  MappingRegistry,
  MappingDefinition,
  OntologyClosure,
  PatternStep,
  BranchStep,
} from "../../kernel/types.js";
import { resolveEntityLabel } from "../../kernel/narrative.js";
import { extractLocalName, cleanLocalName } from "../../kernel/labeling.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** A single matched result row. */
export interface QueryResult {
  subjectIri: string;
  subjectLabel?: string;
  bindings: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Triple Store Indexes
// ---------------------------------------------------------------------------

function buildSubjectIndex(store: LocalTripleStore): Map<string, Triple[]> {
  const idx = new Map<string, Triple[]>();
  for (const t of store.triples) {
    const list = idx.get(t.subject) ?? [];
    list.push(t);
    idx.set(t.subject, list);
  }
  return idx;
}

function getTypes(subjectIri: string, bySubject: Map<string, Triple[]>): string[] {
  return (bySubject.get(subjectIri) ?? [])
    .filter((t) => t.predicate === RDF_TYPE && !t.isLiteral)
    .map((t) => t.object);
}

// ---------------------------------------------------------------------------
// Display Value Resolution
// ---------------------------------------------------------------------------

const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";

/**
 * Resolve a display value for an IRI, checking the triple store directly
 * for rdfs:label before falling back to closure/IRI cleaning.
 * This finds labels on named individuals that are not in the closure.
 */
function resolveDisplayValue(
  iri: string,
  bySubject: Map<string, Triple[]>,
  closure: OntologyClosure,
  fallback: string,
): string {
  const triples = bySubject.get(iri) ?? [];
  const labelTriple = triples.find(
    (t) => t.predicate === RDFS_LABEL && t.isLiteral,
  );
  if (labelTriple) return labelTriple.object;
  return resolveEntityLabel(iri, closure, fallback);
}

// ---------------------------------------------------------------------------
// Pattern Walking
// ---------------------------------------------------------------------------

interface WalkResult {
  matched: boolean;
  bindings: Record<string, string>;
}

/**
 * Walk pattern steps starting from a given node in the triple store.
 * Returns bindings if all steps match, null if any step fails.
 *
 * Supports backtracking: when a forward edge has multiple candidate
 * triples, each candidate is tried with the remaining steps. The
 * first candidate that produces a successful complete walk wins.
 */
function walkSteps(
  steps: readonly PatternStep[],
  currentNode: string,
  bySubject: Map<string, Triple[]>,
  closure: OntologyClosure,
): WalkResult {
  const bindings: Record<string, string> = {};
  let node = currentNode;
  let lastEdgePredicate = "";

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    switch (step.type) {
      case "edge": {
        lastEdgePredicate = step.predicate;
        const triples = bySubject.get(node) ?? [];

        if (step.direction === "inverse") {
          let found: Triple | undefined;
          for (const [_subj, subTriples] of bySubject) {
            found = subTriples.find(
              (t) => t.predicate === step.predicate && t.object === node && !t.isLiteral,
            );
            if (found) break;
          }
          if (!found) return { matched: false, bindings };
          node = found.subject;
        } else {
          // Forward edge: collect all candidates (IRI first, then literals)
          const iriCandidates = triples.filter(
            (t) => t.predicate === step.predicate && !t.isLiteral,
          );
          const litCandidates = triples.filter(
            (t) => t.predicate === step.predicate && t.isLiteral,
          );
          const allCandidates = [...iriCandidates, ...litCandidates];

          if (allCandidates.length === 0) return { matched: false, bindings };

          if (allCandidates.length === 1) {
            // Single candidate — no backtracking needed
            node = allCandidates[0].object;
          } else {
            // Multiple candidates — try each with remaining steps
            const remainingSteps = steps.slice(i + 1);
            for (const candidate of allCandidates) {
              const result = walkSteps(remainingSteps, candidate.object, bySubject, closure);
              if (result.matched) {
                Object.assign(bindings, result.bindings);
                return { matched: true, bindings };
              }
            }
            return { matched: false, bindings };
          }
        }
        break;
      }

      case "node": {
        const types = getTypes(node, bySubject);
        if (types.length > 0 && !types.includes(step.class)) {
          return { matched: false, bindings };
        }
        break;
      }

      case "bind": {
        const nodeTriples = bySubject.get(node) ?? [];

        const HAS_VALUE = "http://www.ontologyrepository.com/CommonCoreOntologies/has_value";
        const valueTriple = nodeTriples.find(
          (t) => t.isLiteral && (t.predicate === HAS_VALUE || t.predicate.endsWith("has_value")),
        );

        if (valueTriple) {
          bindings[step.role] = valueTriple.object;
        } else {
          const nodeTypes = getTypes(node, bySubject);
          const typeFallback = nodeTypes.length > 0
            ? extractLocalName(nodeTypes[0]).replace(/([a-z])([A-Z])/g, "$1 $2")
            : step.role;
          bindings[step.role] = resolveDisplayValue(node, bySubject, closure, typeFallback);
        }
        break;
      }

      case "literal": {
        if (step.via === "direct") {
          const predLabel = resolveEntityLabel(lastEdgePredicate, closure, "value");
          bindings[predLabel] = node;
        }
        break;
      }

      case "branch": {
        const branchResult = walkSteps(step.steps, node, bySubject, closure);
        if (!branchResult.matched) return { matched: false, bindings };
        Object.assign(bindings, branchResult.bindings);
        break;
      }
    }
  }

  return { matched: true, bindings };
}

// ---------------------------------------------------------------------------
// Single Clause Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single CGP clause pattern against the store.
 * Looks up the mapping by provenance.rulesApplied, then walks the
 * pattern steps against each candidate subject.
 *
 * Binding keys use outputBind.label (not the raw role name) to align
 * with the column headers in the Results View and to avoid key
 * collisions when multiple clauses all use role: "target".
 */
export function executeSingleClause(
  cgp: CGP,
  store: LocalTripleStore,
  closure: OntologyClosure,
  registry: MappingRegistry,
): QueryResult[] {
  const bySubject = buildSubjectIndex(store);
  const results: QueryResult[] = [];

  // Extract the intent from provenance
  const expandRule = cgp.provenance?.rulesApplied?.[0] ?? "";
  const intent = expandRule.startsWith("expand:") ? expandRule.substring(7) : "";

  // Look up the mapping
  const mapping = registry.mappings.find((m) => m.shorthand === intent);
  if (!mapping) return results;

  // Find all subjects with rdf:type matching any domainClass
  for (const [subjectIri, triples] of bySubject) {
    const types = triples
      .filter((t) => t.predicate === RDF_TYPE && !t.isLiteral)
      .map((t) => t.object);

    const matchesDomain = mapping.domainClasses.some((dc) => types.includes(dc));
    if (!matchesDomain) continue;

    // Walk the pattern steps
    const walkResult = walkSteps(mapping.pattern.steps, subjectIri, bySubject, closure);
    if (walkResult.matched) {
      // Remap binding keys from role names to outputBind labels.
      // This aligns with column headers and prevents key collision
      // when multiple clauses all use role: "target".
      const remappedBindings: Record<string, string> = {};
      for (const [role, value] of Object.entries(walkResult.bindings)) {
        const outputBind = mapping.ui.outputBinds.find((ob) => ob.role === role);
        const key = outputBind?.label ?? role;
        remappedBindings[key] = value;
      }

      const typeFallback = types.length > 0
        ? extractLocalName(types[0]).replace(/([a-z])([A-Z])/g, "$1 $2")
        : "";
      results.push({
        subjectIri,
        subjectLabel: resolveDisplayValue(subjectIri, bySubject, closure, typeFallback),
        bindings: remappedBindings,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Composed Query Execution
// ---------------------------------------------------------------------------

/**
 * Execute a CGP_c against a local triple store.
 */
export function executeLocalQuery(
  cgpC: CGP_c,
  store: LocalTripleStore,
  closure: OntologyClosure,
  registry: MappingRegistry,
): QueryResult[] {
  if (cgpC.clauses.length === 0) return [];

  // Execute each clause independently
  const clauseResults = cgpC.clauses.map((cgp) =>
    executeSingleClause(cgp, store, closure, registry),
  );



  switch (cgpC.joinType) {
    case "subjectToSubject": {
      // AND: find subjects present in ALL clause result sets, merge bindings.
      // Each clause's bindings already use outputBind.label as keys (from
      // executeSingleClause), so "Designative Name", "Date Identifier",
      // "Email Address" are distinct and do not collide on merge.
      //
      // For subjects that appear in some but not all clauses, we still
      // include them if they appear in at least one clause (lenient AND
      // for demo — strict AND would require all clauses to match).
      if (clauseResults.length === 1) return clauseResults[0];

      // Collect all unique subject IRIs across all clauses
      const allSubjects = new Set<string>();
      for (const cr of clauseResults) {
        for (const r of cr) allSubjects.add(r.subjectIri);
      }

      // For each subject, merge bindings from all clauses
      const merged: QueryResult[] = [];
      for (const subjectIri of allSubjects) {
        const mergedBindings: Record<string, string> = {};
        let subjectLabel: string | undefined;
        for (const cr of clauseResults) {
          const match = cr.find((r) => r.subjectIri === subjectIri);
          if (match) {
            if (!subjectLabel && match.subjectLabel) subjectLabel = match.subjectLabel;
            for (const [key, value] of Object.entries(match.bindings)) {
              mergedBindings[key] = value;
            }
          }
        }
        if (Object.keys(mergedBindings).length > 0) {
          merged.push({ subjectIri, subjectLabel, bindings: mergedBindings });
        }
      }
      return merged;
    }

    case "union": {
      // OR: union all results. When the same subject matches multiple
      // clauses, merge bindings from all matching clauses (each clause
      // contributes its outputBind.label-keyed bindings).
      const unionMap = new Map<string, { bindings: Record<string, string>; subjectLabel?: string }>();
      for (const cr of clauseResults) {
        for (const r of cr) {
          const existing = unionMap.get(r.subjectIri) ?? { bindings: {} };
          Object.assign(existing.bindings, r.bindings);
          if (!existing.subjectLabel && r.subjectLabel) existing.subjectLabel = r.subjectLabel;
          unionMap.set(r.subjectIri, existing);
        }
      }
      return [...unionMap.entries()].map(([subjectIri, { bindings, subjectLabel }]) => ({
        subjectIri,
        subjectLabel,
        bindings,
      }));
    }

    case "targetToSubject": {
      // Chain: target of clause N becomes subject of clause N+1
      // Not implemented for demo (ADR-009: chained search deferred)
      return clauseResults[0] ?? [];
    }

    default:
      return clauseResults[0] ?? [];
  }
}

// ---------------------------------------------------------------------------
// Entity Search
// ---------------------------------------------------------------------------

/**
 * Search for entities of a given class whose resolved label matches the query.
 */
export function searchEntities(
  classIri: string,
  query: string,
  store: LocalTripleStore,
  closure: OntologyClosure,
  maxResults: number = 8,
): Array<{ iri: string; label: string }> {
  const bySubject = buildSubjectIndex(store);
  const queryLower = query.toLowerCase();
  const results: Array<{ iri: string; label: string }> = [];

  for (const [subjectIri, triples] of bySubject) {
    if (results.length >= maxResults) break;

    const types = triples
      .filter((t) => t.predicate === RDF_TYPE && !t.isLiteral)
      .map((t) => t.object);

    if (!types.includes(classIri)) continue;

    // Resolve display label (check store for rdfs:label on named individuals)
    const label = resolveDisplayValue(subjectIri, bySubject, closure, "");
    if (label && label.toLowerCase().includes(queryLower)) {
      results.push({ iri: subjectIri, label });
    }
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}
