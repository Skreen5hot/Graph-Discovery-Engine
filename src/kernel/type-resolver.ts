/**
 * OWL/RDFS Type Resolver — RPM v2.1 §10
 *
 * Concrete TypeResolver implementation that walks rdfs:subClassOf chains
 * in the OntologyClosure to perform subsumption checks and calculate
 * subsumption distance.
 *
 * Handles cycles in the superclass graph via a visited set — real
 * ontologies occasionally have them due to authoring errors.
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type { TypeResolver, OntologyClosure } from "./types.js";

/**
 * Create a TypeResolver that walks rdfs:subClassOf chains in the ontology closure.
 *
 * @param closure - The ontology closure containing class hierarchy
 * @returns A TypeResolver that performs real OWL/RDFS subsumption
 */
export function createOwlTypeResolver(closure: OntologyClosure): TypeResolver {
  return {
    isSubclassOf(subjectType: string, domainClass: string): boolean {
      if (subjectType === domainClass) return true;
      return walkSuperclasses(subjectType, domainClass, closure);
    },

    subsumptionDistance(subjectType: string, domainClass: string): number {
      if (subjectType === domainClass) return 0;
      return calculateDistance(subjectType, domainClass, closure);
    },
  };
}

/**
 * Walk the rdfs:subClassOf chain to check if `subjectType` is a subclass of `targetClass`.
 * Uses BFS with a visited set to handle cycles.
 */
function walkSuperclasses(
  subjectType: string,
  targetClass: string,
  closure: OntologyClosure,
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [subjectType];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const classEntry = closure.classes.get(current);
    if (!classEntry) continue;

    for (const superClass of classEntry.superClasses) {
      if (superClass === targetClass) return true;
      if (!visited.has(superClass)) {
        queue.push(superClass);
      }
    }
  }

  return false;
}

/**
 * Calculate the subsumption distance from `subjectType` to `targetClass`.
 * Uses BFS to find the shortest path through the superclass hierarchy.
 * Returns -1 if no subsumption relationship exists.
 * Handles cycles via a visited set.
 */
function calculateDistance(
  subjectType: string,
  targetClass: string,
  closure: OntologyClosure,
): number {
  const visited = new Set<string>();
  const queue: Array<{ iri: string; distance: number }> = [
    { iri: subjectType, distance: 0 },
  ];

  while (queue.length > 0) {
    const { iri, distance } = queue.shift()!;
    if (visited.has(iri)) continue;
    visited.add(iri);

    const classEntry = closure.classes.get(iri);
    if (!classEntry) continue;

    for (const superClass of classEntry.superClasses) {
      if (superClass === targetClass) return distance + 1;
      if (!visited.has(superClass)) {
        queue.push({ iri: superClass, distance: distance + 1 });
      }
    }
  }

  return -1;
}
