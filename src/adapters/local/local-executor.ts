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
// Pattern Walking
// ---------------------------------------------------------------------------

interface WalkResult {
  matched: boolean;
  bindings: Record<string, string>;
}

/**
 * Walk pattern steps starting from a given node in the triple store.
 * Returns bindings if all steps match, null if any step fails.
 */
function walkSteps(
  steps: readonly PatternStep[],
  currentNode: string,
  bySubject: Map<string, Triple[]>,
  closure: OntologyClosure,
): WalkResult {
  const bindings: Record<string, string> = {};
  let node = currentNode;

  for (const step of steps) {
    switch (step.type) {
      case "edge": {
        // Find a triple where (node, predicate, ?)
        const triples = bySubject.get(node) ?? [];
        const match = step.direction === "forward"
          ? triples.find((t) => t.predicate === step.predicate && !t.isLiteral)
          : null; // Inverse edges: find triples where (?, predicate, node) — scan needed

        if (step.direction === "inverse") {
          // Scan all triples for inverse match
          // For small graphs this is fine
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
          if (!match) return { matched: false, bindings };
          node = match.object;
        }
        break;
      }

      case "node": {
        // Verify the current node has rdf:type matching the step's class
        const types = getTypes(node, bySubject);
        if (!types.includes(step.class)) {
          return { matched: false, bindings };
        }
        break;
      }

      case "bind": {
        // Record the current node's resolved label as a binding
        const label = resolveEntityLabel(node, closure, step.role);
        bindings[step.role] = label;
        break;
      }

      case "literal": {
        if (step.via === "direct") {
          // The previous edge step found a literal — check the last edge's object
          // Actually, in "direct" mode the edge target IS the literal value
          // Re-check: the edge step above already moved `node` to the object
          // For literal patterns, the edge object is a literal value
          // We need to find the literal value from the edge
          // Back-track: find the literal triple
          const parentTriples = bySubject.get(currentNode) ?? [];
          const literalTriple = parentTriples.find(
            (t) => t.isLiteral && !t.predicate.includes("rdf-syntax"),
          );
          if (literalTriple) {
            bindings["value"] = literalTriple.object;
          }
        }
        break;
      }

      case "branch": {
        // Recurse into branch steps from current node
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
      results.push({
        subjectIri,
        bindings: walkResult.bindings,
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
      // AND: intersect subject IRIs across all clauses
      if (clauseResults.length === 1) return clauseResults[0];
      const firstSubjects = new Set(clauseResults[0].map((r) => r.subjectIri));
      const intersection = clauseResults[0].filter((r) => {
        return clauseResults.every((cr) =>
          cr.some((cr2) => cr2.subjectIri === r.subjectIri),
        );
      });
      // Merge bindings from all clauses for intersected subjects
      return intersection.map((r) => {
        const merged: Record<string, string> = { ...r.bindings };
        for (const cr of clauseResults) {
          const match = cr.find((cr2) => cr2.subjectIri === r.subjectIri);
          if (match) Object.assign(merged, match.bindings);
        }
        return { subjectIri: r.subjectIri, bindings: merged };
      });
    }

    case "union": {
      // OR: union all results, deduplicate by subject
      const seen = new Set<string>();
      const union: QueryResult[] = [];
      for (const cr of clauseResults) {
        for (const r of cr) {
          if (!seen.has(r.subjectIri)) {
            seen.add(r.subjectIri);
            union.push(r);
          }
        }
      }
      return union;
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

    // Resolve display label
    const label = resolveEntityLabel(subjectIri, closure, "");
    if (label && label.toLowerCase().includes(queryLower)) {
      results.push({ iri: subjectIri, label });
    }
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}
