/**
 * TypeResolver and Closure Builder Tests
 *
 * Tests for the real OWL/RDFS TypeResolver (Phase 2.2):
 * - Exact match (distance 0)
 * - Direct superclass (distance 1)
 * - Multi-hop subsumption (distance 2+)
 * - No subsumption (-1)
 * - Cycle handling (visited set prevents infinite loop)
 * - Multi-typed subject (any-match semantics)
 * - Closure builder helpers
 * - rpmExpand integration with real TypeResolver
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { createOwlTypeResolver } from "../src/kernel/type-resolver.js";
import {
  buildClosure,
  mergeClosure,
  addClassLabel,
  addSuperclass,
} from "../src/kernel/closure-builder.js";
import { rpmExpand } from "../src/kernel/expand.js";
import { isCGP, isRPMError } from "../src/kernel/types.js";
import type {
  OntologyClosure,
  MappingDefinition,
  MappingRegistry,
  RPMContext,
  UIBlock,
  Subject,
} from "../src/kernel/types.js";

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

// =========================================================================
// TypeResolver — Subsumption
// =========================================================================

console.log("\n  --- TypeResolver: Subsumption ---");

// A → B → C hierarchy
const hierarchyClosure = buildClosure([
  { iri: "test:A", superClasses: ["test:B"] },
  { iri: "test:B", superClasses: ["test:C"] },
  { iri: "test:C", superClasses: [] },
  { iri: "test:D", superClasses: [] },
]);
const resolver = createOwlTypeResolver(hierarchyClosure);

try {
  strictEqual(resolver.isSubclassOf("test:A", "test:A"), true);
  strictEqual(resolver.subsumptionDistance("test:A", "test:A"), 0);
  pass("Exact match: A isSubclassOf A, distance 0");
} catch (error) {
  fail("Exact match", error);
}

try {
  strictEqual(resolver.isSubclassOf("test:A", "test:B"), true);
  strictEqual(resolver.subsumptionDistance("test:A", "test:B"), 1);
  pass("Direct superclass: A → B, distance 1");
} catch (error) {
  fail("Direct superclass", error);
}

try {
  strictEqual(resolver.isSubclassOf("test:A", "test:C"), true);
  strictEqual(resolver.subsumptionDistance("test:A", "test:C"), 2);
  pass("Transitive: A → B → C, distance 2");
} catch (error) {
  fail("Transitive subsumption", error);
}

try {
  strictEqual(resolver.isSubclassOf("test:A", "test:D"), false);
  strictEqual(resolver.subsumptionDistance("test:A", "test:D"), -1);
  pass("No relationship: A and D, distance -1");
} catch (error) {
  fail("No relationship", error);
}

try {
  strictEqual(resolver.isSubclassOf("test:B", "test:A"), false);
  strictEqual(resolver.subsumptionDistance("test:B", "test:A"), -1);
  pass("Not symmetric: B is NOT subclass of A");
} catch (error) {
  fail("Asymmetry", error);
}

try {
  // IRI not in closure at all
  strictEqual(resolver.isSubclassOf("test:Unknown", "test:A"), false);
  strictEqual(resolver.subsumptionDistance("test:Unknown", "test:A"), -1);
  pass("Unknown IRI: not in closure, returns false/-1");
} catch (error) {
  fail("Unknown IRI", error);
}

// =========================================================================
// TypeResolver — Cycle Handling
// =========================================================================

console.log("\n  --- TypeResolver: Cycle Handling ---");

try {
  // A → B → C → A (cycle)
  const cycleClosure = buildClosure([
    { iri: "test:A", superClasses: ["test:B"] },
    { iri: "test:B", superClasses: ["test:C"] },
    { iri: "test:C", superClasses: ["test:A"] },
  ]);
  const cycleResolver = createOwlTypeResolver(cycleClosure);

  // Should not infinite loop — visited set breaks the cycle
  strictEqual(cycleResolver.isSubclassOf("test:A", "test:B"), true);
  strictEqual(cycleResolver.isSubclassOf("test:A", "test:C"), true);
  // A → B → C → A is a cycle, so A is "subclass" of all in the cycle
  strictEqual(cycleResolver.subsumptionDistance("test:A", "test:C"), 2);
  pass("Cycle A → B → C → A: resolves without infinite loop");
} catch (error) {
  fail("Cycle handling", error);
}

try {
  // Self-referencing class (A → A)
  const selfClosure = buildClosure([
    { iri: "test:Self", superClasses: ["test:Self"] },
  ]);
  const selfResolver = createOwlTypeResolver(selfClosure);
  strictEqual(selfResolver.isSubclassOf("test:Self", "test:Self"), true);
  strictEqual(selfResolver.subsumptionDistance("test:Self", "test:Self"), 0);
  pass("Self-reference A → A: exact match at distance 0, no loop");
} catch (error) {
  fail("Self-reference", error);
}

// =========================================================================
// TypeResolver — Diamond Inheritance
// =========================================================================

console.log("\n  --- TypeResolver: Diamond Inheritance ---");

try {
  // Diamond: D → B, D → C, B → A, C → A
  const diamondClosure = buildClosure([
    { iri: "test:D", superClasses: ["test:B", "test:C"] },
    { iri: "test:B", superClasses: ["test:A"] },
    { iri: "test:C", superClasses: ["test:A"] },
    { iri: "test:A", superClasses: [] },
  ]);
  const diamondResolver = createOwlTypeResolver(diamondClosure);

  strictEqual(diamondResolver.isSubclassOf("test:D", "test:A"), true);
  // BFS: D → B (1), D → C (1), B → A (2), C → A (2) — shortest is 2
  strictEqual(diamondResolver.subsumptionDistance("test:D", "test:A"), 2);
  pass("Diamond: D → {B,C} → A, shortest distance 2");
} catch (error) {
  fail("Diamond inheritance", error);
}

// =========================================================================
// Closure Builder
// =========================================================================

console.log("\n  --- Closure Builder ---");

try {
  const closure = buildClosure(
    [{ iri: "test:Class1", superClasses: ["test:Parent"], labels: [{ value: "Class One", language: "en", predicate: "rdfs:label" }] }],
    [{ iri: "test:prop1", domain: ["test:Class1"], range: ["xsd:string"] }],
  );
  ok(closure.classes.has("test:Class1"));
  ok(closure.properties.has("test:prop1"));
  strictEqual(closure.classes.get("test:Class1")!.labels[0].value, "Class One");
  strictEqual(closure.properties.get("test:prop1")!.range[0], "xsd:string");
  pass("buildClosure: creates maps with correct data");
} catch (error) {
  fail("buildClosure", error);
}

try {
  const base = buildClosure([{ iri: "test:A" }]);
  const overlay = buildClosure([{ iri: "test:A", labels: [{ value: "Override", language: "en", predicate: "rdfs:label" }] }]);
  const merged = mergeClosure(base, overlay);
  strictEqual(merged.classes.get("test:A")!.labels.length, 1);
  strictEqual(merged.classes.get("test:A")!.labels[0].value, "Override");
  pass("mergeClosure: overlay takes precedence");
} catch (error) {
  fail("mergeClosure", error);
}

try {
  const closure = buildClosure();
  addClassLabel(closure, "test:New", { value: "New Class", language: "en", predicate: "rdfs:label" });
  ok(closure.classes.has("test:New"));
  strictEqual(closure.classes.get("test:New")!.labels[0].value, "New Class");
  pass("addClassLabel: creates entry if missing");
} catch (error) {
  fail("addClassLabel", error);
}

try {
  const closure = buildClosure();
  addSuperclass(closure, "test:Child", "test:Parent");
  addSuperclass(closure, "test:Child", "test:Parent"); // duplicate
  strictEqual(closure.classes.get("test:Child")!.superClasses.length, 1);
  pass("addSuperclass: deduplicates");
} catch (error) {
  fail("addSuperclass dedup", error);
}

// =========================================================================
// rpmExpand Integration with Real TypeResolver
// =========================================================================

console.log("\n  --- rpmExpand with Real TypeResolver ---");

const emptyUI: UIBlock = {
  label: "", description: "", group: "", examples: [],
  subjectLabel: "", inputParameters: [], outputBinds: [],
};

const mapping: MappingDefinition = {
  shorthand: "test:hasProperty",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["test:Parent"],
  rangeClasses: [],
  pattern: {
    type: "branch", name: "prop",
    steps: [
      { type: "edge", predicate: "test:hasProperty", direction: "forward" },
      { type: "node", class: "test:Target" },
      { type: "bind", role: "target" },
    ],
  },
  ui: emptyUI, description: "Test",
};

const registry: MappingRegistry = {
  "@context": { rpm: "https://spec.example.org/rpm/v2/" },
  "@type": "rpm:MappingRegistry",
  version: "2.1.0", source: "discovered",
  generatedAt: "2026-03-21T00:00:00Z",
  graphEndpoint: "https://example.org/sparql",
  mappings: [mapping],
};

// Subject is test:Child, domain is test:Parent — subsumption should pass
try {
  const closure = buildClosure([
    { iri: "test:Child", superClasses: ["test:Parent"] },
    { iri: "test:Parent", superClasses: [] },
  ]);
  const ctx: RPMContext = {
    mappingRegistry: registry,
    ontologyClosure: closure,
    typeResolver: createOwlTypeResolver(closure),
  };

  const subject: Subject = { "@id": "ex:Instance", "@type": ["test:Child"] };
  const result = rpmExpand("test:hasProperty", subject, ctx);
  ok(isCGP(result), "Subclass should pass validation with real TypeResolver");
  pass("rpmExpand: Child subclass of Parent passes with real TypeResolver");
} catch (error) {
  fail("rpmExpand real subsumption pass", error);
}

// Subject is test:Unrelated, domain is test:Parent — should fail
try {
  const closure = buildClosure([
    { iri: "test:Unrelated", superClasses: [] },
    { iri: "test:Parent", superClasses: [] },
  ]);
  const ctx: RPMContext = {
    mappingRegistry: registry,
    ontologyClosure: closure,
    typeResolver: createOwlTypeResolver(closure),
  };

  const subject: Subject = { "@id": "ex:Instance", "@type": ["test:Unrelated"] };
  const result = rpmExpand("test:hasProperty", subject, ctx);
  ok(isRPMError(result), "Unrelated type should fail validation");
  if (isRPMError(result)) {
    strictEqual(result.errorCode, "SUBCLASS_VIOLATION");
  }
  pass("rpmExpand: Unrelated type fails with SUBCLASS_VIOLATION");
} catch (error) {
  fail("rpmExpand real subsumption fail", error);
}

// No typeResolver in context — falls back to stubTypeResolver (exact match)
try {
  const closure = buildClosure([
    { iri: "test:Child", superClasses: ["test:Parent"] },
    { iri: "test:Parent", superClasses: [] },
  ]);
  const ctx: RPMContext = {
    mappingRegistry: registry,
    ontologyClosure: closure,
    // No typeResolver — should fall back to stub (exact match only)
  };

  const subject: Subject = { "@id": "ex:Instance", "@type": ["test:Child"] };
  const result = rpmExpand("test:hasProperty", subject, ctx);
  // Stub does exact match only — test:Child ≠ test:Parent, so this fails
  ok(isRPMError(result), "Without real TypeResolver, subsumption fails (stub is exact-match)");
  pass("rpmExpand: no typeResolver → stub fallback (exact match only)");
} catch (error) {
  fail("rpmExpand stub fallback", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
