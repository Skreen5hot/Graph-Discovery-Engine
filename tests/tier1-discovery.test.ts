/**
 * Tier 1 Discovery Tests
 *
 * Tests for direct predicate discovery (§32.4):
 * - Q1 object patterns → MappingDefinition with edge → node → bind
 * - Q2 literal patterns → MappingDefinition with edge → literal
 * - UI block auto-population via Labeling Law + Control Inference
 * - Automated promotion rules (§32.7)
 * - Deduplication by (subjectClass, predicate) — Q1 wins over Q2
 * - outputBind.label resolved at discovery time (not IRI)
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import {
  generateTier1Mappings,
  type Q1Row,
  type Q2Row,
} from "../src/kernel/tier1-discovery.js";
import { buildClosure } from "../src/kernel/closure-builder.js";
import { createOwlTypeResolver } from "../src/kernel/type-resolver.js";
import { stubTypeResolver } from "../src/kernel/expand.js";
import type { LabelAnnotation } from "../src/kernel/types.js";

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
// Fixtures — Ontology Closure with Labels
// ---------------------------------------------------------------------------

const closure = buildClosure(
  [
    {
      iri: "mfg:ChemicalProcess",
      labels: [{ value: "Chemical Process", language: "en", predicate: "rdfs:label" }],
      annotations: [],
    },
    {
      iri: "mfg:Catalyst",
      labels: [{ value: "Catalyst", language: "en", predicate: "rdfs:label" }],
      annotations: [{ value: "A substance that accelerates a reaction", language: "en", predicate: "rdfs:comment" }],
    },
    {
      iri: "mfg:Measurement",
      labels: [{ value: "Measurement", language: "en", predicate: "rdfs:label" }],
      annotations: [],
    },
  ],
  [
    {
      iri: "mfg:hasCatalyst",
      labels: [{ value: "Has Catalyst", language: "en", predicate: "rdfs:label" }],
      annotations: [{ value: "The catalyst used in this process", language: "en", predicate: "rdfs:comment" }],
      range: ["mfg:Catalyst"],
    },
    {
      iri: "mfg:hasWeight",
      labels: [{ value: "Has Weight", language: "en", predicate: "rdfs:label" }],
      annotations: [{ value: "Weight in kilograms", language: "en", predicate: "rdfs:comment" }],
      range: ["xsd:decimal"],
    },
  ],
);

const resolver = createOwlTypeResolver(closure);

// =========================================================================
// Q1 — Object Class Patterns
// =========================================================================

console.log("\n  --- Q1: Object Class Patterns ---");

try {
  const q1: Q1Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" },
  ];
  const { mappings, promotionLog } = generateTier1Mappings(q1, [], closure, resolver);

  strictEqual(mappings.length, 1);
  const m = mappings[0];

  // Core fields
  strictEqual(m.shorthand, "mfg:hasCatalyst");
  strictEqual(m.source, "discovered");
  strictEqual(m.tier, 1);
  deepStrictEqual(m.domainClasses, ["mfg:ChemicalProcess"]);
  deepStrictEqual(m.rangeClasses, ["mfg:Catalyst"]);

  // Pattern: branch → edge → node → bind
  strictEqual(m.pattern.type, "branch");
  strictEqual(m.pattern.steps.length, 3);
  strictEqual(m.pattern.steps[0].type, "edge");
  strictEqual(m.pattern.steps[1].type, "node");
  strictEqual(m.pattern.steps[2].type, "bind");

  pass("Q1: generates Tier 1 mapping with edge → node → bind pattern");
} catch (error) {
  fail("Q1 object pattern", error);
}

// =========================================================================
// UI Block Auto-Population
// =========================================================================

console.log("\n  --- UI Block Auto-Population ---");

try {
  const q1: Q1Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" },
  ];
  const { mappings } = generateTier1Mappings(q1, [], closure, resolver);
  const ui = mappings[0].ui;

  // Label from Labeling Law on predicate
  strictEqual(ui.label, "Has Catalyst");
  strictEqual(ui.labelSource, "rdfs:label");

  // Description from hint resolution
  strictEqual(ui.description, "The catalyst used in this process");

  // Group from domain class
  ok(ui.group.length > 0, "Group must be non-empty");

  // Subject label from domain class
  strictEqual(ui.subjectLabel, "Chemical Process");

  // Input parameter
  strictEqual(ui.inputParameters.length, 1);
  strictEqual(ui.inputParameters[0].inputType, "entitySearch");
  strictEqual(ui.inputParameters[0].inputTypeSource, "rangeIsObjectProperty");
  strictEqual(ui.inputParameters[0].label, "Catalyst");

  // Output bind — label resolved at discovery time, NOT an IRI
  strictEqual(ui.outputBinds.length, 1);
  strictEqual(ui.outputBinds[0].label, "Catalyst");
  ok(!ui.outputBinds[0].label.includes(":"), "outputBind.label must be resolved label, not IRI");
  strictEqual(ui.outputBinds[0].role, "target");

  pass("UI block: label, description, group, subjectLabel, inputParams, outputBinds all populated");
} catch (error) {
  fail("UI block auto-population", error);
}

// =========================================================================
// Q2 — Literal Patterns
// =========================================================================

console.log("\n  --- Q2: Literal Patterns ---");

try {
  const q2: Q2Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasWeight", literalType: "xsd:decimal" },
  ];
  const { mappings } = generateTier1Mappings([], q2, closure, resolver);

  strictEqual(mappings.length, 1);
  const m = mappings[0];

  // Pattern: branch → edge → literal (via direct)
  strictEqual(m.pattern.steps.length, 2);
  strictEqual(m.pattern.steps[0].type, "edge");
  strictEqual(m.pattern.steps[1].type, "literal");
  if (m.pattern.steps[1].type === "literal") {
    strictEqual(m.pattern.steps[1].via, "direct");
  }

  // Literal patterns have no inputParameters or outputBinds
  strictEqual(m.ui.inputParameters.length, 0);
  strictEqual(m.ui.outputBinds.length, 0);

  pass("Q2: generates literal pattern with edge → literal (via direct)");
} catch (error) {
  fail("Q2 literal pattern", error);
}

// =========================================================================
// Deduplication — Q1 Wins Over Q2
// =========================================================================

console.log("\n  --- Deduplication ---");

try {
  const q1: Q1Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" },
  ];
  const q2: Q2Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", literalType: "xsd:string" },
  ];
  const { mappings } = generateTier1Mappings(q1, q2, closure, resolver);

  strictEqual(mappings.length, 1, "Duplicate (subjectClass, predicate) → one mapping");
  // Should use Q1 (object pattern), not Q2 (literal)
  strictEqual(mappings[0].pattern.steps[1].type, "node", "Q1 takes precedence → node step, not literal");

  pass("Deduplication: same (subjectClass, predicate) → Q1 wins over Q2");
} catch (error) {
  fail("Deduplication", error);
}

// =========================================================================
// Multiple Subject Classes for Same Predicate
// =========================================================================

console.log("\n  --- Multiple Subject Classes ---");

try {
  const q1: Q1Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" },
    { subjectClass: "mfg:Measurement", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" },
  ];
  const { mappings } = generateTier1Mappings(q1, [], closure, resolver);

  strictEqual(mappings.length, 2, "Same predicate, different subject classes → two mappings");
  ok(mappings.some((m) => m.domainClasses[0] === "mfg:ChemicalProcess"));
  ok(mappings.some((m) => m.domainClasses[0] === "mfg:Measurement"));

  pass("Multiple subject classes: one mapping per unique (subjectClass, predicate)");
} catch (error) {
  fail("Multiple subject classes", error);
}

// =========================================================================
// §32.7 — Automated Promotion Rules
// =========================================================================

console.log("\n  --- Automated Promotion (§32.7) ---");

// Labels resolve → smeSurface
try {
  const q1: Q1Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst", objectClass: "mfg:Catalyst" },
  ];
  const { mappings, promotionLog } = generateTier1Mappings(q1, [], closure, resolver);

  strictEqual(mappings[0].exposure, "smeSurface");
  strictEqual(promotionLog[0].exposure, "smeSurface");
  ok(promotionLog[0].reason.includes("All promotion criteria met"));

  pass("Promotion: resolvable labels → smeSurface");
} catch (error) {
  fail("Promotion success", error);
}

// Predicate label unresolvable → internal
try {
  const emptyClosure = buildClosure();
  const q1: Q1Row[] = [
    { subjectClass: "https://example.org/BFO_0000023", predicate: "https://example.org/BFO_0000024", objectClass: "https://example.org/BFO_0000025" },
  ];
  const { mappings, promotionLog } = generateTier1Mappings(q1, [], emptyClosure, stubTypeResolver);

  // BFO numeric identifiers fail the quality threshold → internal
  strictEqual(mappings[0].exposure, "internal");
  ok(promotionLog[0].reason.includes("unresolvable"));

  pass("Promotion: unresolvable predicate label → internal");
} catch (error) {
  fail("Promotion failure", error);
}

// No objectClass in Q1 → internal (range unknown)
try {
  const q1: Q1Row[] = [
    { subjectClass: "mfg:ChemicalProcess", predicate: "mfg:hasCatalyst" },
    // objectClass is undefined
  ];
  const { mappings } = generateTier1Mappings(q1, [], closure, resolver);

  strictEqual(mappings[0].exposure, "internal");

  pass("Promotion: no objectClass → internal (range unknown)");
} catch (error) {
  fail("Promotion no range", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
