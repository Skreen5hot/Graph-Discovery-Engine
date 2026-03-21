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
        // For forward edges, try IRI objects first, then literals
        const match = step.direction === "forward"
          ? (triples.find((t) => t.predicate === step.predicate && !t.isLiteral)
             ?? triples.find((t) => t.predicate === step.predicate))
          : null;

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
        // Verify the current node has rdf:type matching the step's class.
        // For small demo graphs, be lenient: if the node exists in the store
        // but lacks an explicit rdf:type for this specific class, still allow
        // the match if the node has ANY type. This handles nested objects
        // that may have been auto-typed during JSON-LD expansion.
        const types = getTypes(node, bySubject);
        if (types.length > 0 && !types.includes(step.class)) {
          return { matched: false, bindings };
        }
        // If node has no types at all but exists in the store, continue
        // (blank nodes from nested JSON-LD objects)
        break;
      }

      case "bind": {
        // Record the resolved display value for the bound node.
        // Priority:
        // 1. Follow cco:has_value or similar literal predicates for the actual value
        // 2. Resolve the node IRI via Labeling Law / IRI cleaning
        // 3. Fall back to the node's class label (never the role name)
        const nodeTriples = bySubject.get(node) ?? [];

        // Check for a literal value predicate (cco:has_value, rdfs:label, etc.)
        const HAS_VALUE = "http://www.ontologyrepository.com/CommonCoreOntologies/has_value";
        const literalTriple = nodeTriples.find(
          (t) => t.isLiteral && (t.predicate === HAS_VALUE || t.predicate.endsWith("has_value")),
        ) ?? nodeTriples.find(
          (t) => t.isLiteral && (t.predicate.endsWith("label") || t.predicate.endsWith("name")),
        );

        if (literalTriple) {
          bindings[step.role] = literalTriple.object;
        } else {
          // Resolve the IRI — use the node's first rdf:type label as fallback
          const nodeTypes = getTypes(node, bySubject);
          const typeFallback = nodeTypes.length > 0
            ? extractLocalName(nodeTypes[0]).replace(/([a-z])([A-Z])/g, "$1 $2")
            : step.role;
          bindings[step.role] = resolveEntityLabel(node, closure, typeFallback);
        }
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

      results.push({
        subjectIri,
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
        for (const cr of clauseResults) {
          const match = cr.find((r) => r.subjectIri === subjectIri);
          if (match) {
            // Each clause's bindings are already keyed by outputBind.label
            for (const [key, value] of Object.entries(match.bindings)) {
              mergedBindings[key] = value;
            }
          }
        }
        if (Object.keys(mergedBindings).length > 0) {
          merged.push({ subjectIri, bindings: mergedBindings });
        }
      }
      return merged;
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
