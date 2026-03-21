/**
 * Degraded Execution Tests — Phase 2.7
 *
 * Verifies the system handles tier timeouts gracefully (RPM §32.2, §18):
 * - Tier 3 timeout: Tier 1+2 produce valid catalog, report records timeout
 * - Tier 1 timeout: Tier 2+3 only, or empty catalog if no tiers complete
 * - All-tiers timeout: empty but valid registry, catalog, and report — no crash
 *
 * All tests use in-memory fixtures — no Oxigraph dependency.
 */

import { strictEqual, ok } from "node:assert";
import {
  assembleRegistry,
  type TierResults,
} from "../src/kernel/registry-assembler.js";
import { buildClosure } from "../src/kernel/closure-builder.js";
import { createOwlTypeResolver } from "../src/kernel/type-resolver.js";
import type { MappingDefinition, UIBlock } from "../src/kernel/types.js";

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
// Fixtures
// ---------------------------------------------------------------------------

const emptyUI: UIBlock = {
  label: "Test", description: "", group: "TestGroup", examples: [],
  subjectLabel: "Subject", inputParameters: [], outputBinds: [],
};

function makeMapping(overrides: Partial<MappingDefinition>): MappingDefinition {
  return {
    shorthand: "test:pred",
    source: "discovered",
    tier: 1,
    exposure: "smeSurface",
    domainClasses: ["test:Subject"],
    rangeClasses: ["test:Object"],
    pattern: { type: "branch", name: "test", steps: [] },
    ui: emptyUI,
    description: "Test",
    ...overrides,
  };
}

const closure = buildClosure([
  { iri: "test:Subject", labels: [{ value: "Subject", language: "en", predicate: "rdfs:label" }] },
]);
const resolver = createOwlTypeResolver(closure);

// =========================================================================
// Tier 3 Timeout — Tier 1+2 Produce Valid Catalog
// =========================================================================

console.log("\n  --- Tier 3 Timeout ---");

try {
  const results: TierResults = {
    tier1: {
      mappings: [
        makeMapping({ shorthand: "t1:a" }),
        makeMapping({ shorthand: "t1:b" }),
      ],
      promotionLog: [],
    },
    tier2: {
      mappings: [makeMapping({ shorthand: "t2:a", tier: 2 })],
      promotionLog: [],
    },
    // Tier 3 timed out — empty results
    tier3: { mappings: [], promotionLog: [] },
  };

  const { registry, catalog, report } = assembleRegistry(results, closure, resolver);

  // Registry has Tier 1+2 mappings
  strictEqual(registry.mappings.length, 3, "3 mappings from Tier 1+2");
  ok(registry.mappings.every((m) => m.tier === 1 || m.tier === 2), "Only Tier 1+2");

  // Catalog is valid
  ok(catalog.groups.length >= 1, "Catalog has groups from Tier 1+2");
  const allIntents = catalog.groups.flatMap((g) => g.intents);
  ok(allIntents.length >= 1, "Catalog has intents");

  // Report records Tier 3 as zero
  strictEqual(report.tier3.pathsAnalyzed, 0);
  strictEqual(report.tier3.compoundIntentsPromoted, 0);
  strictEqual(report.tier3.suppressed, 0);

  // Tier 1+2 counts are correct
  strictEqual(report.tier1.patternsFound, 2);
  strictEqual(report.tier2.chainsFound, 1);

  pass("Tier 3 timeout: Tier 1+2 valid catalog, report shows tier3=0");
} catch (error) {
  fail("Tier 3 timeout", error);
}

// =========================================================================
// Tier 1 Timeout — Tier 2+3 Only
// =========================================================================

console.log("\n  --- Tier 1 Timeout ---");

try {
  const results: TierResults = {
    // Tier 1 timed out — empty results
    tier1: { mappings: [], promotionLog: [] },
    tier2: {
      mappings: [makeMapping({ shorthand: "t2:a", tier: 2 })],
      promotionLog: [],
    },
    tier3: {
      mappings: [makeMapping({ shorthand: "t3:a", tier: 3, frequencyScore: 0.9, instanceCount: 500 })],
      promotionLog: [],
    },
  };

  const { registry, catalog, report } = assembleRegistry(results, closure, resolver);

  // Registry has only Tier 2+3
  strictEqual(registry.mappings.length, 2);
  ok(registry.mappings.every((m) => m.tier === 2 || m.tier === 3));

  // Report records Tier 1 as zero
  strictEqual(report.tier1.patternsFound, 0);
  strictEqual(report.tier1.promoted, 0);
  strictEqual(report.tier1.suppressed, 0);

  // Tier 2+3 counts are correct
  strictEqual(report.tier2.chainsFound, 1);
  strictEqual(report.tier3.compoundIntentsPromoted, 1);

  // System is operational — catalog has content
  ok(catalog.groups.length >= 1);

  pass("Tier 1 timeout: Tier 2+3 operational, report shows tier1=0");
} catch (error) {
  fail("Tier 1 timeout", error);
}

// =========================================================================
// All-Tiers Timeout — Empty But Valid
// =========================================================================

console.log("\n  --- All-Tiers Timeout ---");

try {
  const results: TierResults = {
    tier1: { mappings: [], promotionLog: [] },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };

  const { registry, catalog, report } = assembleRegistry(results, closure, resolver);

  // Registry is empty but valid
  strictEqual(registry.mappings.length, 0, "Empty registry");
  strictEqual(registry["@type"], "rpm:MappingRegistry", "Valid type");
  ok(registry["@context"], "Has @context");

  // Catalog is empty but valid
  strictEqual(catalog.groups.length, 0, "Empty groups");
  strictEqual(catalog.subjectTypes.length, 0, "Empty subject types");

  // Report records zeros everywhere
  strictEqual(report["@type"], "rpm:DiscoveryReport");
  strictEqual(report.tier1.patternsFound, 0);
  strictEqual(report.tier1.promoted, 0);
  strictEqual(report.tier2.chainsFound, 0);
  strictEqual(report.tier3.pathsAnalyzed, 0);
  strictEqual(report.tier3.compoundIntentsPromoted, 0);
  strictEqual(report.catalogSize.smeSurface, 0);
  strictEqual(report.catalogSize.internal, 0);

  // System did NOT crash — we got here
  // All returned values satisfy their type contracts (no undefined fields)
  ok(Array.isArray(report.errors), "errors is an array");

  pass("All-tiers timeout: empty but valid registry, catalog, report — no crash");
} catch (error) {
  fail("All-tiers timeout", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
