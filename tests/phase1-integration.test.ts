/**
 * Phase 1 Integration and Benchmark Tests
 *
 * Consolidation tests that verify cross-module behavior:
 * - Narrative generation performance benchmark (≤ 5ms/row, ≤ 125ms/25 rows)
 * - Join anchor correctness: two clauses with same subject, different intents
 *   → exactly one anchor at the subject IRI, not at blank nodes
 * - Full pipeline: expand → compose → narrative round-trip
 */

import { strictEqual, ok } from "node:assert";
import { rpmExpand } from "../src/kernel/expand.js";
import { rpmCompose } from "../src/kernel/compose.js";
import { generateNarrative } from "../src/kernel/narrative.js";
import type {
  Subject,
  RPMContext,
  MappingRegistry,
  MappingDefinition,
  OntologyClosure,
  UIBlock,
  CGP,
  CGP_c,
  RPMError,
  CQO,
} from "../src/kernel/types.js";
import { isCGP, isRPMError } from "../src/kernel/types.js";

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
  label: "Has Catalyst", description: "", group: "Process", examples: [],
  subjectLabel: "Chemical Process", inputParameters: [],
  outputBinds: [{ role: "target", label: "Catalyst", description: "" }],
};

const catalystMapping: MappingDefinition = {
  shorthand: "mfg:hasCatalyst",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["mfg:ChemicalProcess"],
  rangeClasses: ["mfg:Catalyst"],
  pattern: {
    type: "branch", name: "catalyst",
    steps: [
      { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
      { type: "node", class: "mfg:Catalyst" },
      { type: "bind", role: "target" },
    ],
  },
  ui: emptyUI, description: "Catalyst",
};

const weightMapping: MappingDefinition = {
  shorthand: "mfg:hasWeight",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["mfg:ChemicalProcess"],
  rangeClasses: [],
  pattern: {
    type: "branch", name: "weight",
    steps: [
      { type: "edge", predicate: "mfg:hasWeight", direction: "forward" },
      { type: "node", class: "mfg:Measurement" },
      { type: "bind", role: "value" },
    ],
  },
  ui: { ...emptyUI, label: "Has Weight", outputBinds: [{ role: "value", label: "Weight", description: "" }] },
  description: "Weight",
};

function makeContext(...mappings: MappingDefinition[]): RPMContext {
  return {
    mappingRegistry: {
      "@context": { rpm: "https://spec.example.org/rpm/v2/" },
      "@type": "rpm:MappingRegistry",
      version: "2.1.0", source: "discovered",
      generatedAt: "2026-03-21T00:00:00Z",
      graphEndpoint: "https://example.org/sparql",
      mappings,
    },
    ontologyClosure: { classes: new Map(), properties: new Map() },
  };
}

const processSubject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };

// =========================================================================
// Narrative Generation Benchmark
// ≤ 5ms per row, ≤ 125ms for 25 rows
// =========================================================================

console.log("\n  --- Narrative Benchmark ---");

try {
  const ctx = makeContext(catalystMapping);
  const cgpResult = rpmExpand("mfg:hasCatalyst", processSubject, ctx);
  ok(isCGP(cgpResult), "Expansion must succeed for benchmark");
  const cgp = cgpResult as CGP;

  const closure: OntologyClosure = { classes: new Map(), properties: new Map() };

  // Warm up
  generateNarrative(
    cgp, emptyUI, "mfg:hasCatalyst", 1, catalystMapping.pattern,
    closure, "Batch 501", "Palladium",
  );

  // Benchmark: 25 rows
  const start = performance.now();
  for (let i = 0; i < 25; i++) {
    generateNarrative(
      cgp, emptyUI, "mfg:hasCatalyst", 1, catalystMapping.pattern,
      closure, `Batch ${500 + i}`, `Catalyst ${i}`,
    );
  }
  const elapsed = performance.now() - start;
  const perRow = elapsed / 25;

  ok(elapsed <= 125, `25 rows must complete in ≤ 125ms, took ${elapsed.toFixed(1)}ms`);
  ok(perRow <= 5, `Per-row must be ≤ 5ms, averaged ${perRow.toFixed(2)}ms`);
  pass(`Narrative benchmark: 25 rows in ${elapsed.toFixed(1)}ms (${perRow.toFixed(2)}ms/row)`);
} catch (error) {
  fail("Narrative benchmark", error);
}

// =========================================================================
// Join Anchor Correctness
// Two clauses, same subject, different intents → exactly one anchor
// at the subject IRI, not at any blank node
// =========================================================================

console.log("\n  --- Join Anchor Correctness ---");

try {
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "mfg:hasWeight", subject: processSubject },
    ],
    composition: { mode: "subjectToSubject" },
  };
  const result = rpmCompose(cqo, makeContext(catalystMapping, weightMapping));
  ok(!Array.isArray(result), "Must return CGP_c");

  const cgpC = result as CGP_c;
  ok(cgpC.joinAnchors, "Must have joinAnchors");
  strictEqual(cgpC.joinAnchors!.length, 1, "Exactly one join anchor");

  const anchor = cgpC.joinAnchors![0];
  strictEqual(anchor.sourceNodeId, "ex:Batch501", "Anchor must be the subject IRI");
  strictEqual(anchor.targetNodeId, "ex:Batch501", "Anchor target must be the subject IRI");
  ok(!anchor.sourceNodeId.startsWith("_:"), "Anchor must NOT be a blank node");

  pass("Two clauses, same subject → exactly one anchor at subject IRI, no blank nodes");
} catch (error) {
  fail("Join anchor correctness", error);
}

// =========================================================================
// Full Pipeline: Expand → Compose → Narrative
// =========================================================================

console.log("\n  --- Full Pipeline ---");

try {
  const ctx = makeContext(catalystMapping, weightMapping);
  const closure: OntologyClosure = { classes: new Map(), properties: new Map() };

  // Expand both clauses
  const cgp1 = rpmExpand("mfg:hasCatalyst", processSubject, ctx);
  const cgp2 = rpmExpand("mfg:hasWeight", processSubject, ctx);
  ok(isCGP(cgp1) && isCGP(cgp2), "Both expansions must succeed");

  // Compose
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "mfg:hasWeight", subject: processSubject },
    ],
    composition: { mode: "subjectToSubject" },
  };
  const composed = rpmCompose(cqo, ctx);
  ok(!Array.isArray(composed), "Composition must succeed");
  const cgpC = composed as CGP_c;
  strictEqual(cgpC.clauses.length, 2);

  // Generate narratives for each clause
  const narrative1 = generateNarrative(
    cgpC.clauses[0], emptyUI, "mfg:hasCatalyst", 1,
    catalystMapping.pattern, closure, "Batch 501", "Palladium",
  );
  ok(narrative1.narrativeSummary.includes("Batch 501"), "Narrative 1 has subject");
  ok(narrative1.narrativeSummary.endsWith("."), "Narrative 1 ends with period");

  const narrative2 = generateNarrative(
    cgpC.clauses[1], weightMapping.ui, "mfg:hasWeight", 1,
    weightMapping.pattern, closure, "Batch 501", "5.2 kg",
  );
  ok(narrative2.narrativeSummary.includes("Batch 501"), "Narrative 2 has subject");
  ok(narrative2.narrativeSummary.endsWith("."), "Narrative 2 ends with period");

  pass("Full pipeline: expand → compose → narrative for 2 clauses");
} catch (error) {
  fail("Full pipeline", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
