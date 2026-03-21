/**
 * Ontology Closure Builder — RPM v2.1 §3.4
 *
 * Constructs an OntologyClosure from raw class and property data.
 * Used by Phase 2 adapters to build the closure from SPARQL results,
 * and by tests to build closures from fixture data.
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type {
  OntologyClosure,
  OntologyClass,
  OntologyProperty,
  LabelAnnotation,
  EnumeratedIndividual,
} from "./types.js";

// ---------------------------------------------------------------------------
// Builder Types
// ---------------------------------------------------------------------------

/** Input data for building an OntologyClass entry. */
export interface ClassInput {
  iri: string;
  superClasses?: string[];
  labels?: LabelAnnotation[];
  annotations?: LabelAnnotation[];
  enumeratedIndividuals?: EnumeratedIndividual[];
}

/** Input data for building an OntologyProperty entry. */
export interface PropertyInput {
  iri: string;
  superProperties?: string[];
  domain?: string[];
  range?: string[];
  labels?: LabelAnnotation[];
  annotations?: LabelAnnotation[];
  inverseOf?: string;
  propertyChain?: string[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build an OntologyClosure from arrays of class and property inputs.
 *
 * Defaults all optional fields to empty arrays/undefined.
 * Deduplicates by IRI — last entry wins for duplicate IRIs.
 */
export function buildClosure(
  classes: ClassInput[] = [],
  properties: PropertyInput[] = [],
): OntologyClosure {
  const classMap = new Map<string, OntologyClass>();
  for (const input of classes) {
    classMap.set(input.iri, {
      iri: input.iri,
      superClasses: input.superClasses ?? [],
      labels: input.labels ?? [],
      annotations: input.annotations ?? [],
      enumeratedIndividuals: input.enumeratedIndividuals,
    });
  }

  const propertyMap = new Map<string, OntologyProperty>();
  for (const input of properties) {
    propertyMap.set(input.iri, {
      iri: input.iri,
      superProperties: input.superProperties ?? [],
      domain: input.domain ?? [],
      range: input.range ?? [],
      labels: input.labels ?? [],
      annotations: input.annotations ?? [],
      inverseOf: input.inverseOf,
      propertyChain: input.propertyChain,
    });
  }

  return { classes: classMap, properties: propertyMap };
}

/**
 * Merge two OntologyClosures. The second closure's entries take precedence
 * for duplicate IRIs.
 */
export function mergeClosure(
  base: OntologyClosure,
  overlay: OntologyClosure,
): OntologyClosure {
  const classes = new Map(base.classes);
  for (const [iri, cls] of overlay.classes) {
    classes.set(iri, cls);
  }

  const properties = new Map(base.properties);
  for (const [iri, prop] of overlay.properties) {
    properties.set(iri, prop);
  }

  return { classes, properties };
}

/**
 * Add a label annotation to a class in the closure.
 * Creates the class entry if it doesn't exist.
 */
export function addClassLabel(
  closure: OntologyClosure,
  classIri: string,
  label: LabelAnnotation,
): void {
  let entry = closure.classes.get(classIri);
  if (!entry) {
    entry = {
      iri: classIri,
      superClasses: [],
      labels: [],
      annotations: [],
    };
    closure.classes.set(classIri, entry);
  }
  entry.labels.push(label);
}

/**
 * Add an annotation (comment, definition, scope note) to a class.
 * Creates the class entry if it doesn't exist.
 */
export function addClassAnnotation(
  closure: OntologyClosure,
  classIri: string,
  annotation: LabelAnnotation,
): void {
  let entry = closure.classes.get(classIri);
  if (!entry) {
    entry = {
      iri: classIri,
      superClasses: [],
      labels: [],
      annotations: [],
    };
    closure.classes.set(classIri, entry);
  }
  entry.annotations.push(annotation);
}

/**
 * Add a superclass relationship.
 * Creates the class entry if it doesn't exist.
 */
export function addSuperclass(
  closure: OntologyClosure,
  classIri: string,
  superClassIri: string,
): void {
  let entry = closure.classes.get(classIri);
  if (!entry) {
    entry = {
      iri: classIri,
      superClasses: [],
      labels: [],
      annotations: [],
    };
    closure.classes.set(classIri, entry);
  }
  if (!entry.superClasses.includes(superClassIri)) {
    entry.superClasses.push(superClassIri);
  }
}
