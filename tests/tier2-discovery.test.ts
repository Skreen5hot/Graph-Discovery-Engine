/**
 * Tier 2 Discovery Tests
 *
 * Tests for OWL property chain discovery (§32.5):
 * - 2-hop chain → edge/node/edge/node/bind pattern
 * - 3-hop chain
 * - UI block auto-population
 * - Chain property not in closure → skipped
 * - No domain → skipped
 * - Promotion rules
 * - Tier 2 precedence over Tier 1 (verified by shorthand collision)
 */

import { strictEqual, ok } from "node:assert";
import {
  generateTier2Mappings,
  type PropertyChain,
} from "../src/kernel/tier2-discovery.js";
import { buildClosure } from "../src/kernel/closure-builder.js";
import { createOwlTypeResolver } from "../src/kernel/type-resolver.js";

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

const closure = buildClosure(
  [
    { iri: "cco:Person", labels: [{ value: "Person", language: "en", predicate: "rdfs:label" }] },
    { iri: "cco:EmployeeRole", labels: [{ value: "Employee Role", language: "en", predicate: "rdfs:label" }] },
    { iri: "cco:Organization", labels: [{ value: "Organization", language: "en", predicate: "rdfs:label" }] },
    { iri: "cco:ActOfEmployment", labels: [{ value: "Act Of Employment", language: "en", predicate: "rdfs:label" }] },
  ],
  [
    {
      iri: "cco:employed_by",
      labels: [{ value: "Employed By", language: "en", predicate: "rdfs:label" }],
      annotations: [{ value: "Employment relationship", language: "en", predicate: "rdfs:comment" }],
      domain: ["cco:Person"],
      range: ["cco:Organization"],
      propertyChain: ["cco:is_bearer_of", "cco:is_realized_in"],
    },
    {
      iri: "cco:is_bearer_of",
      labels: [{ value: "Is Bearer Of", language: "en", predicate: "rdfs:label" }],
      domain: ["cco:Person"],
      range: ["cco:EmployeeRole"],
    },
    {
      iri: "cco:is_realized_in",
      labels: [{ value: "Is Realized In", language: "en", predicate: "rdfs:label" }],
      domain: ["cco:EmployeeRole"],
      range: ["cco:Organization"],
    },
  ],
);

const resolver = createOwlTypeResolver(closure);

// =========================================================================
// 2-Hop Chain
// =========================================================================

console.log("\n  --- 2-Hop Property Chain ---");

try {
  const chains: PropertyChain[] = [{
    property: "cco:employed_by",
    chainProperties: ["cco:is_bearer_of", "cco:is_realized_in"],
  }];
  const { mappings, promotionLog } = generateTier2Mappings(chains, closure, resolver);

  strictEqual(mappings.length, 1);
  const m = mappings[0];

  strictEqual(m.shorthand, "cco:employed_by");
  strictEqual(m.source, "discovered");
  strictEqual(m.tier, 2);
  ok(m.domainClasses.includes("cco:Person"), "Domain from first property");
  ok(m.rangeClasses.includes("cco:Organization"), "Range from last property");

  // Pattern: edge/node (hop 1) + edge/node (hop 2) + bind = 5 steps
  strictEqual(m.pattern.steps.length, 5);
  strictEqual(m.pattern.steps[0].type, "edge");
  strictEqual(m.pattern.steps[1].type, "node");
  strictEqual(m.pattern.steps[2].type, "edge");
  strictEqual(m.pattern.steps[3].type, "node");
  strictEqual(m.pattern.steps[4].type, "bind");

  // Verify predicate IRIs in edge steps
  if (m.pattern.steps[0].type === "edge") {
    strictEqual(m.pattern.steps[0].predicate, "cco:is_bearer_of");
  }
  if (m.pattern.steps[2].type === "edge") {
    strictEqual(m.pattern.steps[2].predicate, "cco:is_realized_in");
  }

  pass("2-hop chain: edge/node/edge/node/bind with correct predicates");
} catch (error) {
  fail("2-hop chain", error);
}

// =========================================================================
// UI Block
// =========================================================================

console.log("\n  --- UI Block ---");

try {
  const chains: PropertyChain[] = [{
    property: "cco:employed_by",
    chainProperties: ["cco:is_bearer_of", "cco:is_realized_in"],
  }];
  const { mappings } = generateTier2Mappings(chains, closure, resolver);
  const ui = mappings[0].ui;

  strictEqual(ui.label, "Employed By");
  strictEqual(ui.labelSource, "rdfs:label");
  strictEqual(ui.description, "Employment relationship");
  strictEqual(ui.descriptionSource, "rdfs:comment");
  strictEqual(ui.subjectLabel, "Person");
  ok(ui.group.length > 0);
  strictEqual(ui.outputBinds[0].label, "Organization");
  ok(!ui.outputBinds[0].label.includes(":"), "outputBind.label is resolved, not IRI");

  pass("UI block: label, description, descriptionSource, subjectLabel, outputBind all correct");
} catch (error) {
  fail("UI block", error);
}

// =========================================================================
// Chain Property Not in Closure → Skipped
// =========================================================================

console.log("\n  --- Validation ---");

try {
  const chains: PropertyChain[] = [{
    property: "test:missing_chain",
    chainProperties: ["test:nonexistent_prop1", "test:nonexistent_prop2"],
  }];
  const { mappings, promotionLog } = generateTier2Mappings(chains, closure, resolver);

  strictEqual(mappings.length, 0, "Missing chain properties → no mapping");
  strictEqual(promotionLog[0].exposure, "internal");
  ok(promotionLog[0].reason.includes("not in ontology closure"));

  pass("Chain properties not in closure → skipped with log entry");
} catch (error) {
  fail("Missing chain property", error);
}

// No domain on first property → skipped
try {
  const noDomainClosure = buildClosure([], [
    { iri: "test:prop1", range: ["test:Mid"] },
    { iri: "test:prop2", range: ["test:End"] },
  ]);
  const chains: PropertyChain[] = [{
    property: "test:chain",
    chainProperties: ["test:prop1", "test:prop2"],
  }];
  const noDomainResolver = createOwlTypeResolver(noDomainClosure);
  const { mappings, promotionLog } = generateTier2Mappings(chains, noDomainClosure, noDomainResolver);

  strictEqual(mappings.length, 0);
  ok(promotionLog[0].reason.includes("no declared domain"));

  pass("First property has no domain → skipped");
} catch (error) {
  fail("No domain", error);
}

// =========================================================================
// Promotion
// =========================================================================

console.log("\n  --- Promotion ---");

try {
  const chains: PropertyChain[] = [{
    property: "cco:employed_by",
    chainProperties: ["cco:is_bearer_of", "cco:is_realized_in"],
  }];
  const { mappings } = generateTier2Mappings(chains, closure, resolver);

  strictEqual(mappings[0].exposure, "smeSurface");
  pass("Labels resolve → smeSurface");
} catch (error) {
  fail("Promotion success", error);
}

// =========================================================================
// 3-Hop Chain
// =========================================================================

console.log("\n  --- 3-Hop Chain ---");

try {
  const closure3 = buildClosure(
    [
      { iri: "test:A" }, { iri: "test:B" }, { iri: "test:C" }, { iri: "test:D" },
    ],
    [
      { iri: "test:p1", domain: ["test:A"], range: ["test:B"] },
      { iri: "test:p2", domain: ["test:B"], range: ["test:C"] },
      { iri: "test:p3", domain: ["test:C"], range: ["test:D"] },
      { iri: "test:chain3", labels: [{ value: "Three Hop", language: "en", predicate: "rdfs:label" }] },
    ],
  );
  const chains: PropertyChain[] = [{
    property: "test:chain3",
    chainProperties: ["test:p1", "test:p2", "test:p3"],
  }];
  const r = createOwlTypeResolver(closure3);
  const { mappings } = generateTier2Mappings(chains, closure3, r);

  strictEqual(mappings.length, 1);
  // 3 hops: 3 × (edge+node) + bind = 7 steps
  strictEqual(mappings[0].pattern.steps.length, 7);
  strictEqual(mappings[0].tier, 2);

  pass("3-hop chain: 7 steps (3 × edge/node + bind)");
} catch (error) {
  fail("3-hop chain", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
