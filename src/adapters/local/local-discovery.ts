/**
 * Local Discovery Orchestrator — Phase 5.A.3
 *
 * Runs the full three-tier discovery pipeline against a local JSON-LD
 * file. Returns an AssemblyResult + OntologyClosure + TypeResolver
 * ready to initialize the Phase 3 API server.
 *
 * Adapter-layer code — MUST NOT be imported by kernel.
 */

import type {
  OntologyClosure,
  OntologyClass,
  OntologyProperty,
  TypeResolver,
  LabelAnnotation,
} from "../../kernel/types.js";
import type { AssemblyResult } from "../../kernel/registry-assembler.js";
import type { Tier3Config } from "../../kernel/tier3-discovery.js";

import { loadJsonLdGraph, parseJsonLdDoc, type LocalTripleStore, type Triple } from "./json-ld-loader.js";
import { runQ1, runQ2, runQ3, runQ4, runQ5, runQ6 } from "./local-query-evaluator.js";
import { generateTier1Mappings } from "../../kernel/tier1-discovery.js";
import { generateTier2Mappings } from "../../kernel/tier2-discovery.js";
import { generateTier3Mappings, DEFAULT_TIER3_CONFIG } from "../../kernel/tier3-discovery.js";
import { assembleRegistry, buildExistingPairs } from "../../kernel/registry-assembler.js";
import { createOwlTypeResolver } from "../../kernel/type-resolver.js";
import { resolveLabel } from "../../kernel/labeling.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalDiscoveryOptions {
  skipTier3?: boolean;
  tier3Config?: Partial<Tier3Config>;
  endpointLabel?: string;
  labelOverlayPath?: string;
}

export type LocalDiscoveryResult = AssemblyResult & {
  closure: OntologyClosure;
  typeResolver: TypeResolver;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SUBCLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE = "http://www.w3.org/2000/01/rdf-schema#range";
const OWL_THING = "http://www.w3.org/2002/07/owl#Thing";

/** Predicates that define ontology structure, not data predicates. */
const ONTOLOGY_STRUCTURE_PREDICATES = new Set([
  RDF_TYPE,
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://www.w3.org/2000/01/rdf-schema#comment",
  RDFS_SUBCLASS_OF,
  RDFS_DOMAIN,
  RDFS_RANGE,
  "http://www.w3.org/2004/02/skos/core#prefLabel",
  "http://www.w3.org/2004/02/skos/core#definition",
  "http://www.w3.org/2002/07/owl#propertyChainAxiom",
  "http://www.w3.org/2002/07/owl#oneOf",
  "http://www.w3.org/2002/07/owl#sameAs",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",
]);

/** Label predicates to extract. */
const LABEL_PREDICATES = new Set([
  "http://www.w3.org/2004/02/skos/core#prefLabel",
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://schema.org/name",
  "http://purl.org/dc/elements/1.1/title",
  "http://xmlns.com/foaf/0.1/name",
]);

/** Annotation predicates to extract. */
const ANNOTATION_PREDICATES = new Set([
  "http://www.w3.org/2000/01/rdf-schema#comment",
  "http://www.w3.org/2004/02/skos/core#definition",
  "http://www.w3.org/2004/02/skos/core#scopeNote",
]);

// ---------------------------------------------------------------------------
// Closure Building
// ---------------------------------------------------------------------------

/**
 * Build OntologyClosure from the triple store.
 */
function buildClosureFromGraph(
  store: LocalTripleStore,
): OntologyClosure {
  const classes = new Map<string, OntologyClass>();
  const properties = new Map<string, OntologyProperty>();

  // Collect all class IRIs (rdf:type objects and rdfs:subClassOf subjects/objects)
  const classIris = new Set<string>();
  for (const t of store.triples) {
    if (t.predicate === RDF_TYPE && !t.isLiteral) {
      classIris.add(t.object);
    }
    if (t.predicate === RDFS_SUBCLASS_OF && !t.isLiteral) {
      classIris.add(t.subject);
      classIris.add(t.object);
    }
  }

  // Initialize class entries
  for (const iri of classIris) {
    classes.set(iri, {
      iri,
      superClasses: [],
      labels: [],
      annotations: [],
    });
  }

  // Populate superClasses
  for (const t of store.triples) {
    if (t.predicate === RDFS_SUBCLASS_OF && !t.isLiteral) {
      const entry = classes.get(t.subject);
      if (entry && !entry.superClasses.includes(t.object)) {
        entry.superClasses.push(t.object);
      }
    }
  }

  // Add owl:Thing as fallback superclass for classes with no declared superclass
  for (const [iri, entry] of classes) {
    if (entry.superClasses.length === 0 && iri !== OWL_THING) {
      entry.superClasses.push(OWL_THING);
    }
  }
  // Ensure owl:Thing exists
  if (!classes.has(OWL_THING)) {
    classes.set(OWL_THING, { iri: OWL_THING, superClasses: [], labels: [], annotations: [] });
  }

  // Collect all property IRIs (every predicate that isn't structural)
  const propertyIris = new Set<string>();
  for (const t of store.triples) {
    if (!ONTOLOGY_STRUCTURE_PREDICATES.has(t.predicate)) {
      propertyIris.add(t.predicate);
    }
  }

  // Initialize property entries
  for (const iri of propertyIris) {
    properties.set(iri, {
      iri,
      superProperties: [],
      domain: [],
      range: [],
      labels: [],
      annotations: [],
    });
  }

  // Populate domain/range
  for (const t of store.triples) {
    if (t.predicate === RDFS_DOMAIN && !t.isLiteral) {
      const prop = properties.get(t.subject);
      if (prop && !prop.domain.includes(t.object)) {
        prop.domain.push(t.object);
      }
    }
    if (t.predicate === RDFS_RANGE && !t.isLiteral) {
      const prop = properties.get(t.subject);
      if (prop && !prop.range.includes(t.object)) {
        prop.range.push(t.object);
      }
    }
  }

  // Populate labels and annotations on both classes and properties
  for (const t of store.triples) {
    if (!t.isLiteral) continue;

    const annotation: LabelAnnotation = {
      value: t.object,
      language: t.language,
      predicate: compactPredicate(t.predicate),
    };

    if (LABEL_PREDICATES.has(t.predicate)) {
      const cls = classes.get(t.subject);
      if (cls) cls.labels.push(annotation);
      const prop = properties.get(t.subject);
      if (prop) prop.labels.push(annotation);
    }

    if (ANNOTATION_PREDICATES.has(t.predicate)) {
      const cls = classes.get(t.subject);
      if (cls) cls.annotations.push(annotation);
      const prop = properties.get(t.subject);
      if (prop) prop.annotations.push(annotation);
    }
  }

  // Populate enumeratedIndividuals from Q6
  const enumMap = runQ6(store);
  for (const [classIri, individuals] of enumMap) {
    const cls = classes.get(classIri);
    if (cls) {
      const closure: OntologyClosure = { classes, properties };
      cls.enumeratedIndividuals = individuals.map((iri) => {
        const res = resolveLabel(iri, closure);
        return {
          iri,
          label: res.status === "resolved" ? res.label : iri,
        };
      });
    }
  }

  return { classes, properties };
}

/**
 * Compact a full predicate IRI to its prefixed form for LabelAnnotation.predicate.
 * The Labeling Law expects prefixed predicates like "rdfs:label", "skos:prefLabel".
 */
function compactPredicate(iri: string): string {
  const prefixMap: Record<string, string> = {
    "http://www.w3.org/2004/02/skos/core#prefLabel": "skos:prefLabel",
    "http://www.w3.org/2000/01/rdf-schema#label": "rdfs:label",
    "http://schema.org/name": "schema:name",
    "http://purl.org/dc/elements/1.1/title": "dc:title",
    "http://xmlns.com/foaf/0.1/name": "foaf:name",
    "http://www.w3.org/2000/01/rdf-schema#comment": "rdfs:comment",
    "http://www.w3.org/2004/02/skos/core#definition": "skos:definition",
    "http://www.w3.org/2004/02/skos/core#scopeNote": "skos:scopeNote",
  };
  return prefixMap[iri] ?? iri;
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full three-tier discovery pipeline against a local JSON-LD file.
 *
 * @param graphPath - Path to the JSON-LD file
 * @param options - Discovery options (skipTier3, tier3Config, endpointLabel, labelOverlayPath)
 * @returns AssemblyResult + closure + typeResolver, ready for API server
 */
export async function runLocalDiscovery(
  graphPath: string,
  options: LocalDiscoveryOptions = {},
): Promise<LocalDiscoveryResult> {
  const startTime = performance.now();

  // 1. Load graph
  const store = await loadJsonLdGraph(graphPath);

  // 1b. Load label overlay if provided
  if (options.labelOverlayPath) {
    const overlayStore = await loadJsonLdGraph(options.labelOverlayPath);
    store.triples.push(...overlayStore.triples);
    // Merge prefixes (overlay wins on conflict)
    Object.assign(store.prefixes, overlayStore.prefixes);
  }

  // 2-3. Build closure and type resolver
  const closure = buildClosureFromGraph(store);
  const typeResolver = createOwlTypeResolver(closure);

  // 4-5. Tier 1
  const q1 = runQ1(store);
  const q2 = runQ2(store);
  const tier1Result = generateTier1Mappings(q1, q2, closure, typeResolver);

  // 6-7. Tier 2
  const chains = runQ3(store);
  const tier2Result = generateTier2Mappings(chains, closure, typeResolver);

  // 8. Tier 3 (optional)
  let tier3Result = { mappings: [] as any[], promotionLog: [] as any[] };
  if (!options.skipTier3) {
    const existingPairs = buildExistingPairs([
      ...tier1Result.mappings,
      ...tier2Result.mappings,
    ]);

    const demoConfig: Tier3Config = {
      ...DEFAULT_TIER3_CONFIG,
      minInstanceCount: 1,
      promotionThreshold: 0.50,
      minPathLength: 3,
      ...(options.tier3Config ?? {}),
    };

    const samples = runQ5(store, demoConfig.minPathLength, demoConfig.maxHopDepth);
    tier3Result = generateTier3Mappings(samples, closure, typeResolver, existingPairs, demoConfig);
  }

  // 9. Assemble registry
  const endpointLabel = options.endpointLabel ?? `local:${graphPath}`;
  const durationMs = Math.round(performance.now() - startTime);

  const assemblyResult = assembleRegistry(
    {
      tier1: tier1Result,
      tier2: tier2Result,
      tier3: tier3Result,
    },
    closure,
    typeResolver,
    undefined,
    endpointLabel,
    durationMs,
  );

  // 10. Stamp timestamps (adapter responsibility — kernel has no Date.now())
  const now = new Date().toISOString();
  assemblyResult.report.timestamp = now;
  assemblyResult.registry.generatedAt = now;

  // Flag demo mode in report
  if (!options.skipTier3) {
    assemblyResult.report.errors.push(
      "Local graph mode: Tier 3 thresholds lowered for demo. Frequency scores are not statistically representative.",
    );
  }

  return {
    ...assemblyResult,
    closure,
    typeResolver,
  };
}
