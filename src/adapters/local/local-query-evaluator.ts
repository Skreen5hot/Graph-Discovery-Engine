/**
 * Local Query Evaluator — Phase 5.A.2
 *
 * Implements RPM introspection queries Q1–Q6 as JavaScript functions
 * over a LocalTripleStore. Returns the same output shapes as the
 * SPARQL connector, so tier generators receive identical input.
 *
 * Adapter-layer code — MUST NOT be imported by kernel.
 */

import type { LocalTripleStore, Triple } from "./json-ld-loader.js";
import type { Q1Row, Q2Row } from "../../kernel/tier1-discovery.js";
import type { PropertyChain } from "../../kernel/tier2-discovery.js";
import type { SubjectClassSample, DiscoveredPath, PathHop } from "../../kernel/tier3-discovery.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDF_FIRST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
const RDF_REST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
const RDF_NIL = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";
const OWL_PROPERTY_CHAIN = "http://www.w3.org/2002/07/owl#propertyChainAxiom";
const OWL_ONE_OF = "http://www.w3.org/2002/07/owl#oneOf";
const OWL_SAME_AS = "http://www.w3.org/2002/07/owl#sameAs";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";

/** OWL meta-classes excluded from subject type indexing. */
const OWL_META_CLASSES = new Set([
  "http://www.w3.org/2002/07/owl#NamedIndividual",
  "http://www.w3.org/2002/07/owl#Thing",
  "http://www.w3.org/2002/07/owl#Class",
  "http://www.w3.org/2002/07/owl#ObjectProperty",
  "http://www.w3.org/2002/07/owl#DatatypeProperty",
  "http://www.w3.org/2002/07/owl#AnnotationProperty",
  "http://www.w3.org/2002/07/owl#Ontology",
]);

/** Structural predicates excluded from Q1/Q2. */
const STRUCTURAL_PREDICATES = new Set([
  RDF_TYPE, RDFS_LABEL, OWL_SAME_AS,
  "http://www.w3.org/2000/01/rdf-schema#subClassOf",
  "http://www.w3.org/2000/01/rdf-schema#domain",
  "http://www.w3.org/2000/01/rdf-schema#range",
  "http://www.w3.org/2000/01/rdf-schema#comment",
  "http://www.w3.org/2004/02/skos/core#prefLabel",
  "http://www.w3.org/2004/02/skos/core#definition",
  OWL_PROPERTY_CHAIN,
  OWL_ONE_OF,
  RDF_FIRST, RDF_REST,
]);

// ---------------------------------------------------------------------------
// Index Building
// ---------------------------------------------------------------------------

/** Build subject → class IRIs index, filtering OWL meta-classes. */
function buildSubjectTypes(store: LocalTripleStore): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const t of store.triples) {
    if (t.predicate === RDF_TYPE && !t.isLiteral && !OWL_META_CLASSES.has(t.object)) {
      const types = index.get(t.subject) ?? new Set();
      types.add(t.object);
      index.set(t.subject, types);
    }
  }
  return index;
}

/** Build subject → all triples index. */
function buildBySubject(store: LocalTripleStore): Map<string, Triple[]> {
  const index = new Map<string, Triple[]>();
  for (const t of store.triples) {
    const list = index.get(t.subject) ?? [];
    list.push(t);
    index.set(t.subject, list);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Q1 — Subject-Predicate-Object Class Patterns
// ---------------------------------------------------------------------------

/**
 * Q1: Find all (subjectClass, predicate, objectClass) patterns.
 * Excludes structural predicates and literal triples.
 */
export function runQ1(store: LocalTripleStore): Q1Row[] {
  const subjectTypes = buildSubjectTypes(store);
  const seen = new Set<string>();
  const rows: Q1Row[] = [];

  for (const t of store.triples) {
    if (t.isLiteral) continue;
    if (STRUCTURAL_PREDICATES.has(t.predicate)) continue;

    const subjectClasses = subjectTypes.get(t.subject);
    if (!subjectClasses || subjectClasses.size === 0) continue;

    const objectClasses = subjectTypes.get(t.object);
    const objectClass = objectClasses ? [...objectClasses][0] : undefined;

    for (const sc of subjectClasses) {
      const key = `${sc}|${t.predicate}|${objectClass ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ subjectClass: sc, predicate: t.predicate, objectClass });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Q2 — Subject-Predicate-Literal Patterns
// ---------------------------------------------------------------------------

/**
 * Q2: Find all (subjectClass, predicate, literalType) patterns.
 * Only includes literal triples.
 */
export function runQ2(store: LocalTripleStore): Q2Row[] {
  const subjectTypes = buildSubjectTypes(store);
  const seen = new Set<string>();
  const rows: Q2Row[] = [];

  for (const t of store.triples) {
    if (!t.isLiteral) continue;
    if (STRUCTURAL_PREDICATES.has(t.predicate)) continue;

    const subjectClasses = subjectTypes.get(t.subject);
    if (!subjectClasses || subjectClasses.size === 0) continue;

    const literalType = t.datatype ?? "http://www.w3.org/2001/XMLSchema#string";

    for (const sc of subjectClasses) {
      const key = `${sc}|${t.predicate}|${literalType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ subjectClass: sc, predicate: t.predicate, literalType });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Q3 — OWL Property Chain Axioms
// ---------------------------------------------------------------------------

/**
 * Traverse an rdf:List from a head blank node, collecting rdf:first values.
 * Cycle protection via visited set.
 */
function traverseRdfList(
  head: string,
  bySubject: Map<string, Triple[]>,
): string[] {
  const members: string[] = [];
  const visited = new Set<string>();
  let current = head;

  while (current && current !== RDF_NIL && !visited.has(current)) {
    visited.add(current);
    const triples = bySubject.get(current) ?? [];

    const first = triples.find((t) => t.predicate === RDF_FIRST);
    if (first) members.push(first.object);

    const rest = triples.find((t) => t.predicate === RDF_REST);
    current = rest ? rest.object : RDF_NIL;
  }

  return members;
}

/**
 * Q3: Extract OWL property chain axioms.
 * Finds owl:propertyChainAxiom triples, traverses the rdf:List,
 * returns PropertyChain[] with ordered chainProperties.
 */
export function runQ3(store: LocalTripleStore): PropertyChain[] {
  const bySubject = buildBySubject(store);
  const chains: PropertyChain[] = [];

  for (const t of store.triples) {
    if (t.predicate === OWL_PROPERTY_CHAIN) {
      const members = traverseRdfList(t.object, bySubject);
      if (members.length >= 2) {
        chains.push({ property: t.subject, chainProperties: members });
      }
    }
  }

  return chains;
}

// ---------------------------------------------------------------------------
// Q4 — Instance Counts by Subject Class
// ---------------------------------------------------------------------------

/**
 * Q4: Count rdf:type triples by object class.
 */
export function runQ4(store: LocalTripleStore): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of store.triples) {
    if (t.predicate === RDF_TYPE && !t.isLiteral && !OWL_META_CLASSES.has(t.object)) {
      counts.set(t.object, (counts.get(t.object) ?? 0) + 1);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Q5 — Multi-Hop Path Sampling (Exhaustive BFS)
// ---------------------------------------------------------------------------

/**
 * Q5: BFS from each typed subject, collecting paths of minHops to maxHops.
 * Not a statistical sample — exhaustive walk for small graphs.
 * Cycle protection via visited set per BFS.
 */
export function runQ5(
  store: LocalTripleStore,
  minHops: number = 3,
  maxHops: number = 6,
): SubjectClassSample[] {
  const subjectTypes = buildSubjectTypes(store);
  const bySubject = buildBySubject(store);
  const samples: SubjectClassSample[] = [];

  // Group subjects by class
  const subjectsByClass = new Map<string, string[]>();
  for (const [subj, classes] of subjectTypes) {
    for (const cls of classes) {
      const list = subjectsByClass.get(cls) ?? [];
      list.push(subj);
      subjectsByClass.set(cls, list);
    }
  }

  for (const [subjectClass, subjects] of subjectsByClass) {
    const pathMap = new Map<string, DiscoveredPath>();

    for (const subjectIri of subjects) {
      // BFS: collect multi-hop paths
      const queue: Array<{ node: string; hops: PathHop[]; visited: Set<string> }> = [
        { node: subjectIri, hops: [], visited: new Set([subjectIri]) },
      ];

      while (queue.length > 0) {
        const { node, hops, visited } = queue.shift()!;
        if (hops.length > maxHops) continue;

        const nodeTriples = bySubject.get(node) ?? [];
        for (const t of nodeTriples) {
          if (t.isLiteral) continue;
          if (STRUCTURAL_PREDICATES.has(t.predicate)) continue;
          if (visited.has(t.object)) continue;

          const objectClasses = subjectTypes.get(t.object);
          const objectClass = objectClasses ? [...objectClasses][0] : undefined;

          const newHops: PathHop[] = [
            ...hops,
            { predicate: t.predicate, nodeClass: objectClass ?? t.object },
          ];

          // Record path if within length bounds and target has a type
          if (newHops.length >= minHops && newHops.length <= maxHops && objectClass) {
            const sig = newHops.map((h) => `${h.predicate}|${h.nodeClass}`).join("||");
            const key = `${subjectClass}|${objectClass}|${sig}`;
            const existing = pathMap.get(key);
            if (existing) {
              existing.instanceCount++;
            } else {
              pathMap.set(key, {
                subjectClass,
                objectClass,
                hops: newHops,
                instanceCount: 1,
              });
            }
          }

          // Continue BFS if not at max depth
          if (newHops.length < maxHops) {
            const newVisited = new Set(visited);
            newVisited.add(t.object);
            queue.push({ node: t.object, hops: newHops, visited: newVisited });
          }
        }
      }
    }

    if (pathMap.size > 0) {
      samples.push({
        subjectClass,
        totalInstances: subjects.length,
        paths: [...pathMap.values()],
      });
    }
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Q6 — owl:oneOf Enumerated Individuals
// ---------------------------------------------------------------------------

/**
 * Q6: Find owl:oneOf declarations and extract enumerated individual IRIs.
 */
export function runQ6(store: LocalTripleStore): Map<string, string[]> {
  const bySubject = buildBySubject(store);
  const result = new Map<string, string[]>();

  for (const t of store.triples) {
    if (t.predicate === OWL_ONE_OF) {
      const members = traverseRdfList(t.object, bySubject);
      if (members.length > 0) {
        result.set(t.subject, members);
      }
    }
  }

  return result;
}
