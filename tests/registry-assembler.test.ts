/**
 * Registry Assembly Tests
 *
 * Tests for the registry assembler (§32.2, §5.1, §23):
 * - Tier 2 precedence over Tier 1
 * - Static registry merge (static wins on conflict)
 * - Intent Catalog: smeSurface only, grouped, sorted
 * - Discovery Report generation
 * - existingPairs set construction
 * - Empty tiers / no static registry
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import {
  assembleRegistry,
  buildExistingPairs,
  type TierResults,
  type StaticRegistry,
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
  { iri: "test:Object", labels: [{ value: "Object", language: "en", predicate: "rdfs:label" }] },
]);

const resolver = createOwlTypeResolver(closure);

function emptyTierResults(): TierResults {
  return {
    tier1: { mappings: [], promotionLog: [] },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };
}

// =========================================================================
// Tier 2 Precedence Over Tier 1
// =========================================================================

console.log("\n  --- Tier 2 Precedence ---");

try {
  const results: TierResults = {
    tier1: { mappings: [makeMapping({ shorthand: "test:shared", tier: 1, description: "Tier 1" })], promotionLog: [] },
    tier2: { mappings: [makeMapping({ shorthand: "test:shared", tier: 2, description: "Tier 2" })], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };
  const { registry } = assembleRegistry(results, closure, resolver);

  const shared = registry.mappings.find((m) => m.shorthand === "test:shared");
  ok(shared);
  strictEqual(shared!.tier, 2, "Tier 2 takes precedence over Tier 1 for same shorthand");
  strictEqual(shared!.description, "Tier 2");

  pass("Tier 2 overrides Tier 1 for same shorthand");
} catch (error) {
  fail("Tier 2 precedence", error);
}

// =========================================================================
// Static Registry Merge
// =========================================================================

console.log("\n  --- Static Registry Merge ---");

try {
  const results: TierResults = {
    tier1: { mappings: [makeMapping({ shorthand: "test:discovered", description: "Discovered" })], promotionLog: [] },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };
  const staticReg: StaticRegistry = {
    mappings: [makeMapping({ shorthand: "test:discovered", source: "static", description: "Static Override" })],
  };

  const { registry, report } = assembleRegistry(results, closure, resolver, staticReg);

  const m = registry.mappings.find((m) => m.shorthand === "test:discovered");
  ok(m);
  strictEqual(m!.description, "Static Override", "Static wins on shorthand conflict");
  strictEqual(m!.source, "merged");
  strictEqual(registry.source, "merged");
  strictEqual(report.staticOverrides.conflicts, 1);
  strictEqual(report.staticOverrides.conflictResolution, "staticWins");

  pass("Static override wins on conflict, source = merged, conflict counted");
} catch (error) {
  fail("Static merge", error);
}

// Static adds new mapping alongside discovered
try {
  const results: TierResults = {
    tier1: { mappings: [makeMapping({ shorthand: "test:a" })], promotionLog: [] },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };
  const staticReg: StaticRegistry = {
    mappings: [makeMapping({ shorthand: "test:b", source: "static" })],
  };

  const { registry } = assembleRegistry(results, closure, resolver, staticReg);
  strictEqual(registry.mappings.length, 2, "Both discovered and static included");

  pass("Static adds new mapping alongside discovered (no conflict)");
} catch (error) {
  fail("Static add", error);
}

// =========================================================================
// Intent Catalog
// =========================================================================

console.log("\n  --- Intent Catalog ---");

try {
  const results: TierResults = {
    tier1: {
      mappings: [
        makeMapping({ shorthand: "test:surface", exposure: "smeSurface" }),
        makeMapping({ shorthand: "test:internal", exposure: "internal" }),
      ],
      promotionLog: [],
    },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };

  const { catalog } = assembleRegistry(results, closure, resolver);

  // Only smeSurface in catalog
  const allIntents = catalog.groups.flatMap((g) => g.intents);
  ok(allIntents.every((m) => m.exposure === "smeSurface"), "Catalog contains only smeSurface");
  ok(!allIntents.some((m) => m.shorthand === "test:internal"), "Internal mapping excluded");

  pass("Catalog filters to smeSurface only");
} catch (error) {
  fail("Catalog smeSurface filter", error);
}

try {
  const results: TierResults = {
    tier1: {
      mappings: [
        makeMapping({ shorthand: "test:a", ui: { ...emptyUI, group: "Alpha" } }),
        makeMapping({ shorthand: "test:b", ui: { ...emptyUI, group: "Beta" } }),
        makeMapping({ shorthand: "test:c", ui: { ...emptyUI, group: "Alpha" } }),
      ],
      promotionLog: [],
    },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };

  const { catalog } = assembleRegistry(results, closure, resolver);

  strictEqual(catalog.groups.length, 2, "Two groups: Alpha, Beta");
  // Alphabetically sorted
  strictEqual(catalog.groups[0].name, "Alpha");
  strictEqual(catalog.groups[1].name, "Beta");
  strictEqual(catalog.groups[0].intents.length, 2, "Alpha has 2 intents");
  strictEqual(catalog.groups[1].intents.length, 1, "Beta has 1 intent");

  pass("Catalog grouped and alphabetically sorted");
} catch (error) {
  fail("Catalog grouping", error);
}

// Subject types
try {
  const results: TierResults = {
    tier1: {
      mappings: [
        makeMapping({ shorthand: "test:a", domainClasses: ["test:Subject"] }),
        makeMapping({ shorthand: "test:b", domainClasses: ["test:Subject"] }),
      ],
      promotionLog: [],
    },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };

  const { catalog } = assembleRegistry(results, closure, resolver);
  ok(catalog.subjectTypes.length >= 1);
  const st = catalog.subjectTypes.find((s) => s.classIri === "test:Subject");
  ok(st);
  strictEqual(st!.intentCount, 2);
  strictEqual(st!.label, "Subject");

  pass("Subject types with intent counts and resolved labels");
} catch (error) {
  fail("Subject types", error);
}

// =========================================================================
// Discovery Report
// =========================================================================

console.log("\n  --- Discovery Report ---");

try {
  const results: TierResults = {
    tier1: { mappings: [makeMapping({ shorthand: "t1" })], promotionLog: [{ shorthand: "t1x", exposure: "internal", reason: "Predicate label unresolvable" }] },
    tier2: { mappings: [makeMapping({ shorthand: "t2", tier: 2 })], promotionLog: [] },
    tier3: { mappings: [makeMapping({ shorthand: "t3", tier: 3 })], promotionLog: [] },
  };

  const { report } = assembleRegistry(results, closure, resolver, undefined, "https://example.org/sparql", 14320);

  strictEqual(report["@type"], "rpm:DiscoveryReport");
  strictEqual(report.endpoint, "https://example.org/sparql");
  strictEqual(report.duration_ms, 14320);
  strictEqual(report.tier1.promoted, 1);
  strictEqual(report.tier1.suppressed, 1);
  strictEqual(report.tier2.promoted, 1);
  strictEqual(report.tier3.compoundIntentsPromoted, 1);
  strictEqual(report.labelingLawExhausted, 1);

  pass("Discovery Report with correct tier counts and labeling exhausted count");
} catch (error) {
  fail("Discovery Report", error);
}

// =========================================================================
// existingPairs Set
// =========================================================================

console.log("\n  --- existingPairs Set ---");

try {
  const mappings: MappingDefinition[] = [
    makeMapping({ domainClasses: ["sc1", "sc2"], rangeClasses: ["oc1"] }),
    makeMapping({ domainClasses: ["sc1"], rangeClasses: ["oc2", "oc3"] }),
  ];
  const pairs = buildExistingPairs(mappings);

  // Cross-product: (sc1,oc1), (sc2,oc1), (sc1,oc2), (sc1,oc3)
  ok(pairs.has("sc1|oc1"));
  ok(pairs.has("sc2|oc1"));
  ok(pairs.has("sc1|oc2"));
  ok(pairs.has("sc1|oc3"));
  strictEqual(pairs.size, 4);

  pass("existingPairs: cross-product of domainClasses × rangeClasses");
} catch (error) {
  fail("existingPairs", error);
}

// =========================================================================
// Empty Tiers
// =========================================================================

console.log("\n  --- Empty Tiers ---");

try {
  const { registry, catalog, report } = assembleRegistry(emptyTierResults(), closure, resolver);
  strictEqual(registry.mappings.length, 0);
  strictEqual(catalog.groups.length, 0);
  strictEqual(report.tier1.patternsFound, 0);
  pass("Empty tiers → empty registry, catalog, and report");
} catch (error) {
  fail("Empty tiers", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
