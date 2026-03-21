/**
 * Query Composition Tests
 *
 * Tests for RPM_Compose (§24) and specificity scoring (§5.6):
 * - CQO processing with multiple clauses
 * - subjectToSubject (AND) with joinAnchors
 * - union (OR) with unionRoots
 * - targetToSubject (chained) with chainLinks
 * - Error propagation: any clause failure → RPMError[]
 * - Specificity scoring: distance, tier ranking, registry position tiebreaker
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { rpmCompose, calculateSpecificity, rankBySpecificity } from "../src/kernel/compose.js";
import { stubTypeResolver } from "../src/kernel/expand.js";
import type {
  CQO,
  CGP_c,
  RPMError,
  RPMContext,
  MappingRegistry,
  MappingDefinition,
  OntologyClosure,
  UIBlock,
  BranchStep,
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyUI: UIBlock = {
  label: "", description: "", group: "", examples: [],
  subjectLabel: "", inputParameters: [], outputBinds: [],
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
  ui: emptyUI, description: "Weight",
};

const employmentMapping: MappingDefinition = {
  shorthand: "rpm:compound_Person_Organization_Employment_v1",
  source: "discovered", tier: 3, exposure: "smeSurface",
  domainClasses: ["cco:Person"],
  rangeClasses: ["cco:Organization"],
  pattern: {
    type: "branch", name: "employment",
    steps: [
      { type: "edge", predicate: "cco:is_bearer_of", direction: "forward" },
      { type: "node", class: "cco:EmployeeRole" },
      { type: "edge", predicate: "cco:is_realized_in", direction: "forward" },
      { type: "node", class: "cco:ActOfEmployment" },
      {
        type: "branch", name: "participants",
        steps: [
          { type: "edge", predicate: "cco:has_participant", direction: "forward" },
          { type: "node", class: "cco:Organization" },
          { type: "bind", role: "employer" },
        ],
      },
    ],
  },
  ui: emptyUI, description: "Employment",
  frequencyScore: 0.94, instanceCount: 847293,
};

function makeRegistry(...mappings: MappingDefinition[]): MappingRegistry {
  return {
    "@context": { rpm: "https://spec.example.org/rpm/v2/" },
    "@type": "rpm:MappingRegistry",
    version: "2.1.0", source: "discovered",
    generatedAt: "2026-03-21T00:00:00Z",
    graphEndpoint: "https://example.org/sparql",
    mappings,
  };
}

const emptyClosure: OntologyClosure = { classes: new Map(), properties: new Map() };

function makeContext(...mappings: MappingDefinition[]): RPMContext {
  return { mappingRegistry: makeRegistry(...mappings), ontologyClosure: emptyClosure };
}

const processSubject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };
const personSubject: Subject = { "@id": "ex:Alice", "@type": ["cco:Person"] };

// =========================================================================
// subjectToSubject (AND) Composition
// =========================================================================

console.log("\n  --- subjectToSubject (AND) ---");

try {
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "mfg:hasWeight", subject: processSubject },
    ],
    composition: { mode: "subjectToSubject" },
  };
  const result = rpmCompose(cqo, makeContext(catalystMapping, weightMapping));
  ok(!Array.isArray(result), "Must return CGP_c, not error array");

  const cgpC = result as CGP_c;
  strictEqual(cgpC["@type"], "rpm:ComposedGraphPattern");
  strictEqual(cgpC.clauses.length, 2);
  strictEqual(cgpC.joinType, "subjectToSubject");
  ok(cgpC.joinAnchors, "Must have joinAnchors");
  ok(cgpC.joinAnchors!.length > 0, "Must have at least one join anchor");
  // The shared subject should be the anchor
  strictEqual(cgpC.joinAnchors![0].sourceNodeId, "ex:Batch501");
  strictEqual(cgpC.joinAnchors![0].targetNodeId, "ex:Batch501");
  pass("AND mode: 2 clauses, shared subject anchor");
} catch (error) {
  fail("subjectToSubject composition", error);
}

// =========================================================================
// union (OR) Composition
// =========================================================================

console.log("\n  --- union (OR) ---");

try {
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "mfg:hasWeight", subject: processSubject },
    ],
    composition: { mode: "union" },
  };
  const result = rpmCompose(cqo, makeContext(catalystMapping, weightMapping));
  ok(!Array.isArray(result));

  const cgpC = result as CGP_c;
  strictEqual(cgpC.joinType, "union");
  ok(cgpC.unionRoots, "Must have unionRoots");
  ok(cgpC.unionRoots!.includes("ex:Batch501"), "unionRoots must include subject");
  pass("OR mode: 2 clauses, subject in unionRoots");
} catch (error) {
  fail("union composition", error);
}

// =========================================================================
// targetToSubject (Chained) Composition
// =========================================================================

console.log("\n  --- targetToSubject (Chained) ---");

try {
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "mfg:hasWeight", subject: processSubject },
    ],
    composition: { mode: "targetToSubject" },
  };
  const result = rpmCompose(cqo, makeContext(catalystMapping, weightMapping));
  ok(!Array.isArray(result));

  const cgpC = result as CGP_c;
  strictEqual(cgpC.joinType, "targetToSubject");
  ok(cgpC.chainLinks, "Must have chainLinks");
  strictEqual(cgpC.chainLinks!.length, 1);
  strictEqual(cgpC.chainLinks![0].sourceClause, 0);
  strictEqual(cgpC.chainLinks![0].targetClause, 1);
  strictEqual(cgpC.chainLinks![0].fromRole, "target");
  strictEqual(cgpC.chainLinks![0].toRole, "subject");
  pass("Chained mode: chain link from clause 0 target to clause 1 subject");
} catch (error) {
  fail("targetToSubject composition", error);
}

// =========================================================================
// Error Propagation
// =========================================================================

console.log("\n  --- Error Propagation ---");

try {
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "nonexistent:intent", subject: processSubject },
    ],
    composition: { mode: "subjectToSubject" },
  };
  const result = rpmCompose(cqo, makeContext(catalystMapping));
  ok(Array.isArray(result), "Must return RPMError[] when any clause fails");
  const errors = result as RPMError[];
  ok(errors.length > 0);
  strictEqual(errors[0].errorCode, "INTENT_NOT_FOUND");
  strictEqual(errors[0].clauseIndex, 1);
  pass("One clause fails → RPMError[] with clauseIndex");
} catch (error) {
  fail("Error propagation", error);
}

try {
  const cqo: CQO = {
    clauses: [
      { intent: "nonexistent:a", subject: processSubject },
      { intent: "nonexistent:b", subject: processSubject },
    ],
    composition: { mode: "union" },
  };
  const result = rpmCompose(cqo, makeContext());
  ok(Array.isArray(result));
  const errors = result as RPMError[];
  strictEqual(errors.length, 2);
  strictEqual(errors[0].clauseIndex, 0);
  strictEqual(errors[1].clauseIndex, 1);
  pass("Both clauses fail → 2 errors with correct clauseIndex values");
} catch (error) {
  fail("Multiple errors", error);
}

// =========================================================================
// Single Clause Composition
// =========================================================================

console.log("\n  --- Single Clause ---");

try {
  const cqo: CQO = {
    clauses: [{ intent: "mfg:hasCatalyst", subject: processSubject }],
    composition: { mode: "subjectToSubject" },
  };
  const result = rpmCompose(cqo, makeContext(catalystMapping));
  ok(!Array.isArray(result));
  const cgpC = result as CGP_c;
  strictEqual(cgpC.clauses.length, 1);
  pass("Single clause composition produces valid CGP_c");
} catch (error) {
  fail("Single clause", error);
}

// =========================================================================
// §5.6 — Specificity Scoring
// =========================================================================

console.log("\n  --- Specificity Scoring (§5.6) ---");

// Exact match (distance 0) ranks higher than non-match
try {
  const score = calculateSpecificity(
    catalystMapping,
    ["mfg:ChemicalProcess"],
    stubTypeResolver,
    0,
  );
  ok(score < 1000, `Exact match score should be < 1000, got ${score}`);
  pass("Exact match: distance 0 → low score (high rank)");
} catch (error) {
  fail("Exact match scoring", error);
}

// No subsumption relationship → max score
try {
  const score = calculateSpecificity(
    catalystMapping,
    ["cco:Person"],
    stubTypeResolver,
    0,
  );
  strictEqual(score, Number.MAX_SAFE_INTEGER);
  pass("No subsumption → MAX_SAFE_INTEGER (lowest rank)");
} catch (error) {
  fail("No subsumption scoring", error);
}

// Tier ranking: Tier 1 < Tier 3 at equal distance
try {
  const tier1Score = calculateSpecificity(
    { ...catalystMapping, tier: 1 },
    ["mfg:ChemicalProcess"],
    stubTypeResolver,
    0,
  );
  const tier3Score = calculateSpecificity(
    { ...catalystMapping, tier: 3 },
    ["mfg:ChemicalProcess"],
    stubTypeResolver,
    0,
  );
  ok(tier1Score < tier3Score, `Tier 1 (${tier1Score}) must rank before Tier 3 (${tier3Score})`);
  pass("Tier 1 ranks before Tier 3 at equal subsumption distance");
} catch (error) {
  fail("Tier ranking", error);
}

// Registry position as tiebreaker
try {
  const scorePos0 = calculateSpecificity(catalystMapping, ["mfg:ChemicalProcess"], stubTypeResolver, 0);
  const scorePos5 = calculateSpecificity(catalystMapping, ["mfg:ChemicalProcess"], stubTypeResolver, 5);
  ok(scorePos0 < scorePos5, `Position 0 (${scorePos0}) must rank before position 5 (${scorePos5})`);
  pass("Registry position is stable tiebreaker");
} catch (error) {
  fail("Position tiebreaker", error);
}

// rankBySpecificity — sorted output
try {
  const tier3 = { ...catalystMapping, tier: 3 as const, shorthand: "tier3" };
  const tier1 = { ...catalystMapping, tier: 1 as const, shorthand: "tier1" };
  const ranked = rankBySpecificity(
    [tier3, tier1],
    ["mfg:ChemicalProcess"],
    stubTypeResolver,
  );
  strictEqual(ranked[0].shorthand, "tier1");
  strictEqual(ranked[1].shorthand, "tier3");
  pass("rankBySpecificity: Tier 1 before Tier 3");
} catch (error) {
  fail("rankBySpecificity", error);
}

// =========================================================================
// Determinism
// =========================================================================

console.log("\n  --- Determinism ---");

try {
  const cqo: CQO = {
    clauses: [
      { intent: "mfg:hasCatalyst", subject: processSubject },
      { intent: "mfg:hasWeight", subject: processSubject },
    ],
    composition: { mode: "subjectToSubject" },
  };
  const ctx = makeContext(catalystMapping, weightMapping);
  const r1 = rpmCompose(cqo, ctx) as CGP_c;
  const r2 = rpmCompose(cqo, ctx) as CGP_c;
  strictEqual(JSON.stringify(r1), JSON.stringify(r2));
  pass("Same CQO → identical CGP_c JSON");
} catch (error) {
  fail("Composition determinism", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
