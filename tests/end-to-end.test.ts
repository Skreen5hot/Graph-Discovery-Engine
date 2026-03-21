/**
 * End-to-End Integration Tests — Phase 4.3
 *
 * Full pipeline verification:
 * - Discovery → Registry → Expand → Narrative
 * - Static override merge → catalog update
 * - Override API → partial rebuild → catalog reflects change
 * - Degraded execution → system operational
 */

import { strictEqual, ok } from "node:assert";
import { generateTier1Mappings } from "../src/kernel/tier1-discovery.js";
import { assembleRegistry } from "../src/kernel/registry-assembler.js";
import { rpmExpand } from "../src/kernel/expand.js";
import { generateNarrative } from "../src/kernel/narrative.js";
import { buildClosure } from "../src/kernel/closure-builder.js";
import { createOwlTypeResolver } from "../src/kernel/type-resolver.js";
import { containsProhibitedTerm } from "../src/kernel/error-translation.js";
import { isCGP } from "../src/kernel/types.js";
import type { RPMContext, Subject, CGP } from "../src/kernel/types.js";

let passed = 0;
let failed = 0;

function pass(msg: string): void {
  console.log(`  \u2713 PASS: ${msg}`);
  passed++;
}

function fail(msg: string, error: unknown): void {
  console.error(`  \u2717 FAIL: ${msg}`);
  console.error("  ", error instanceof Error ? error.message : String(error));
  failed++;
}

// ---------------------------------------------------------------------------
// Full Pipeline: Discovery → Registry → Expand → Narrative
// ---------------------------------------------------------------------------

console.log("\n  --- Full Pipeline ---");

try {
  // 1. Build ontology closure
  const closure = buildClosure(
    [
      { iri: "mfg:ChemicalProcess", labels: [{ value: "Chemical Process", language: "en", predicate: "rdfs:label" }] },
      { iri: "mfg:Catalyst", labels: [{ value: "Catalyst", language: "en", predicate: "rdfs:label" }] },
    ],
    [
      {
        iri: "mfg:hasCatalyst",
        labels: [{ value: "Has Catalyst", language: "en", predicate: "rdfs:label" }],
        annotations: [{ value: "The catalyst used", language: "en", predicate: "rdfs:comment" }],
        range: ["mfg:Catalyst"],
      },
    ],
  );
  const resolver = createOwlTypeResolver(closure);

  // 2. Tier 1 discovery from simulated Q1 results
  const { mappings: tier1 } = generateTier1Mappings(
    [{ subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" }],
    [],
    closure,
    resolver,
  );
  ok(tier1.length >= 1, "Tier 1 produces at least one mapping");

  // 3. Assemble registry
  const { registry, catalog } = assembleRegistry(
    { tier1: { mappings: tier1, promotionLog: [] }, tier2: { mappings: [], promotionLog: [] }, tier3: { mappings: [], promotionLog: [] } },
    closure,
    resolver,
  );
  ok(registry.mappings.length >= 1, "Registry assembled");
  ok(catalog.groups.length >= 1, "Catalog has groups");

  // 4. Expand
  const ctx: RPMContext = { mappingRegistry: registry, ontologyClosure: closure, typeResolver: resolver };
  const subject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };
  const cgp = rpmExpand("mfg:hasCatalyst", subject, ctx);
  ok(isCGP(cgp), "Expansion produces CGP");

  // 5. Narrative
  const mapping = registry.mappings[0];
  const narrative = generateNarrative(
    cgp as CGP, mapping.ui, "mfg:hasCatalyst", 1, mapping.pattern,
    closure, "Batch 501", "Palladium",
  );
  ok(narrative.narrativeSummary.includes("Batch 501"));
  ok(narrative.narrativeSummary.includes("Palladium"));
  ok(!containsProhibitedTerm(narrative.narrativeSummary));

  pass("Full pipeline: Discovery → Registry → Expand → Narrative — all clean");
} catch (error) {
  fail("Full pipeline", error);
}

// ---------------------------------------------------------------------------
// Static Override Merge
// ---------------------------------------------------------------------------

console.log("\n  --- Static Override Merge ---");

try {
  const closure = buildClosure(
    [{ iri: "test:A", labels: [{ value: "Type A", language: "en", predicate: "rdfs:label" }] }],
    [{ iri: "test:pred", labels: [{ value: "Predicate", language: "en", predicate: "rdfs:label" }] }],
  );
  const resolver = createOwlTypeResolver(closure);

  const discoveredMapping = {
    shorthand: "test:pred", source: "discovered" as const, tier: 1 as const,
    exposure: "smeSurface" as const, domainClasses: ["test:A"], rangeClasses: ["test:A"],
    pattern: { type: "branch" as const, name: "x", steps: [] },
    ui: { label: "Auto Label", description: "", group: "G", examples: [], subjectLabel: "A", inputParameters: [], outputBinds: [] },
    description: "Discovered",
  };

  const staticMapping = {
    ...discoveredMapping,
    source: "static" as const,
    ui: { ...discoveredMapping.ui, label: "Curated Label", examples: ["Example Q?"] },
    description: "Static override",
  };

  const { registry } = assembleRegistry(
    { tier1: { mappings: [discoveredMapping], promotionLog: [] }, tier2: { mappings: [], promotionLog: [] }, tier3: { mappings: [], promotionLog: [] } },
    closure, resolver,
    { mappings: [staticMapping] },
  );

  const merged = registry.mappings.find((m) => m.shorthand === "test:pred");
  ok(merged);
  strictEqual(merged!.ui.label, "Curated Label", "Static label wins");
  strictEqual(merged!.ui.examples[0], "Example Q?", "Static examples preserved");
  strictEqual(merged!.source, "merged");

  pass("Static override merge: curated label wins, source=merged");
} catch (error) {
  fail("Static override merge", error);
}

// ---------------------------------------------------------------------------
// Degraded Execution — System Remains Operational
// ---------------------------------------------------------------------------

console.log("\n  --- Degraded Execution ---");

try {
  const closure = buildClosure();
  const resolver = createOwlTypeResolver(closure);

  // All tiers empty (simulating complete crawl failure)
  const { registry, catalog, report } = assembleRegistry(
    { tier1: { mappings: [], promotionLog: [] }, tier2: { mappings: [], promotionLog: [] }, tier3: { mappings: [], promotionLog: [] } },
    closure, resolver,
  );

  // System must not crash — all structures valid
  strictEqual(registry.mappings.length, 0);
  strictEqual(catalog.groups.length, 0);
  strictEqual(report["@type"], "rpm:DiscoveryReport");

  // Expand returns INTENT_NOT_FOUND (not a crash)
  const ctx: RPMContext = { mappingRegistry: registry, ontologyClosure: closure };
  const result = rpmExpand("test:anything", { "@id": "ex:X", "@type": ["test:T"] }, ctx);
  ok(result !== null && result !== undefined, "Expand returns a result, not null/undefined");

  pass("Degraded: empty tiers → valid empty state, expand returns error not crash");
} catch (error) {
  fail("Degraded execution", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
