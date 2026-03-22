/**
 * Static Discovery — Browser-safe discovery pipeline.
 *
 * Identical to runLocalDiscovery but accepts a pre-parsed JSON object
 * instead of a file path, avoiding the node:fs/promises dependency.
 *
 * Adapter-layer code — MUST NOT be imported by kernel.
 */

import type { OntologyClosure, TypeResolver } from "../../kernel/types.js";
import type { AssemblyResult } from "../../kernel/registry-assembler.js";
import type { Tier3Config } from "../../kernel/tier3-discovery.js";

import { parseJsonLdDoc, expandIri, type LocalTripleStore } from "../local/json-ld-loader.js";
import { buildClosureFromGraph, type LocalDiscoveryResult } from "../local/local-discovery.js";
import { runQ1, runQ2, runQ3, runQ5, runQ6 } from "../local/local-query-evaluator.js";
import { generateTier1Mappings } from "../../kernel/tier1-discovery.js";
import { generateTier2Mappings } from "../../kernel/tier2-discovery.js";
import { generateTier3Mappings, DEFAULT_TIER3_CONFIG } from "../../kernel/tier3-discovery.js";
import { assembleRegistry, buildExistingPairs } from "../../kernel/registry-assembler.js";
import { createOwlTypeResolver } from "../../kernel/type-resolver.js";
import { cleanLocalName } from "../../kernel/labeling.js";

/**
 * Run the full three-tier discovery pipeline against a pre-parsed JSON-LD
 * document object. No file I/O — safe for browser use.
 */
export function runStaticDiscovery(
  doc: Record<string, unknown> | unknown[],
  overlayDoc?: Record<string, unknown> | unknown[],
): LocalDiscoveryResult {
  const startTime = performance.now();

  // 1. Parse graph
  const store = parseJsonLdDoc(doc);

  // 1b. Merge label overlay if provided
  if (overlayDoc) {
    const overlayStore = parseJsonLdDoc(overlayDoc);
    store.triples.push(...overlayStore.triples);
    Object.assign(store.prefixes, overlayStore.prefixes);
  }

  // 1c. Inject synthetic rdfs:label triples from @context aliases
  const rawCtx = store.rawContext;
  if (rawCtx) {
    for (const [alias, value] of Object.entries(rawCtx)) {
      if (alias.startsWith("@")) continue;
      if (typeof value === "object" && value !== null && "@id" in (value as Record<string, unknown>)) {
        const id = (value as Record<string, unknown>)["@id"];
        if (typeof id === "string") {
          const expandedIri = expandIri(id, store.prefixes);
          const label = cleanLocalName(alias);
          store.triples.push({
            subject: expandedIri,
            predicate: "http://www.w3.org/2000/01/rdf-schema#label",
            object: label,
            isLiteral: true,
            language: "en",
          });
        }
      }
    }
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

  // 8. Tier 3
  const existingPairs = buildExistingPairs([
    ...tier1Result.mappings,
    ...tier2Result.mappings,
  ]);

  const demoConfig: Tier3Config = {
    ...DEFAULT_TIER3_CONFIG,
    minInstanceCount: 1,
    promotionThreshold: 0.50,
    minPathLength: 2,
  };

  const samples = runQ5(store, demoConfig.minPathLength, demoConfig.maxHopDepth);
  const tier3Result = generateTier3Mappings(samples, closure, typeResolver, existingPairs, demoConfig);

  // 9. Assemble registry
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
    "static:demo",
    durationMs,
  );

  // 10. Stamp timestamps
  const now = new Date().toISOString();
  assemblyResult.report.timestamp = now;
  assemblyResult.registry.generatedAt = now;

  assemblyResult.report.errors.push(
    "Static demo mode: Tier 3 thresholds lowered for demo. Frequency scores are not statistically representative.",
  );

  return {
    ...assemblyResult,
    closure,
    typeResolver,
    store,
  };
}
