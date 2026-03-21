/**
 * RPM_Expand Tests
 *
 * Tests for the core expansion function:
 * - Mapping resolution (INTENT_NOT_FOUND)
 * - Subject validation (SUBCLASS_VIOLATION)
 * - Tier 1 expansion (edge → node → bind)
 * - Tier 3 nested branch expansion
 * - Inverse edge direction
 * - Literal step handling (via direct + via ice)
 * - Stub TypeResolver
 * - Determinism across invocations
 * - Type guard usage
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { rpmExpand, stubTypeResolver } from "../src/kernel/expand.js";
import { isRPMError, isCGP } from "../src/kernel/types.js";
import { stableStringify } from "../src/kernel/canonicalize.js";
import type {
  Subject,
  RPMContext,
  MappingRegistry,
  MappingDefinition,
  OntologyClosure,
  BranchStep,
  UIBlock,
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
// Test Fixtures
// ---------------------------------------------------------------------------

const emptyUIBlock: UIBlock = {
  label: "", labelSource: undefined, description: "", descriptionSource: undefined,
  group: "", groupSource: undefined, examples: [], subjectLabel: "",
  inputParameters: [], outputBinds: [],
};

const tier1Pattern: BranchStep = {
  type: "branch", name: "catalyst",
  steps: [
    { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
    { type: "node", class: "mfg:Catalyst" },
    { type: "bind", role: "target" },
  ],
};

const tier1Mapping: MappingDefinition = {
  shorthand: "mfg:hasCatalyst",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["mfg:ChemicalProcess"],
  rangeClasses: ["mfg:Catalyst"],
  pattern: tier1Pattern,
  ui: emptyUIBlock,
  description: "Direct predicate",
};

const tier3Pattern: BranchStep = {
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
};

const tier3Mapping: MappingDefinition = {
  shorthand: "rpm:compound_Person_Organization_Employment_v1",
  source: "discovered", tier: 3, exposure: "smeSurface",
  domainClasses: ["cco:Person"],
  rangeClasses: ["cco:Organization"],
  pattern: tier3Pattern,
  ui: emptyUIBlock,
  description: "Compound intent",
  frequencyScore: 0.94,
  instanceCount: 847293,
};

const inverseMappingPattern: BranchStep = {
  type: "branch", name: "member",
  steps: [
    { type: "edge", predicate: "org:memberOf", direction: "inverse" },
    { type: "node", class: "org:Person" },
    { type: "bind", role: "member" },
  ],
};

const inverseMapping: MappingDefinition = {
  shorthand: "org:hasMembers",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["org:Organization"],
  rangeClasses: ["org:Person"],
  pattern: inverseMappingPattern,
  ui: emptyUIBlock,
  description: "Inverse edge test",
};

const icePattern: BranchStep = {
  type: "branch", name: "designation",
  steps: [
    { type: "edge", predicate: "cco:is_designated_by", direction: "forward" },
    { type: "literal", via: "ice" },
    { type: "bind", role: "name" },
  ],
};

const iceMapping: MappingDefinition = {
  shorthand: "cco:has_legal_name",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["cco:Person"],
  rangeClasses: [],
  pattern: icePattern,
  ui: emptyUIBlock,
  description: "ICE literal test",
};

const directLiteralPattern: BranchStep = {
  type: "branch", name: "value",
  steps: [
    { type: "edge", predicate: "mfg:hasWeight", direction: "forward" },
    { type: "literal", via: "direct" },
  ],
};

const directLiteralMapping: MappingDefinition = {
  shorthand: "mfg:hasWeight",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["mfg:ChemicalProcess"],
  rangeClasses: [],
  pattern: directLiteralPattern,
  ui: emptyUIBlock,
  description: "Direct literal test",
};

function makeRegistry(...mappings: MappingDefinition[]): MappingRegistry {
  return {
    "@context": { rpm: "https://spec.example.org/rpm/v2/" },
    "@type": "rpm:MappingRegistry",
    version: "2.1.0",
    source: "discovered",
    generatedAt: "2026-03-21T00:00:00Z",
    graphEndpoint: "https://example.org/sparql",
    mappings,
  };
}

const emptyClosure: OntologyClosure = {
  classes: new Map(),
  properties: new Map(),
};

function makeContext(...mappings: MappingDefinition[]): RPMContext {
  return {
    mappingRegistry: makeRegistry(...mappings),
    ontologyClosure: emptyClosure,
  };
}

// =========================================================================
// Mapping Resolution — INTENT_NOT_FOUND
// =========================================================================

console.log("\n  --- Mapping Resolution ---");

try {
  const subject: Subject = { "@id": "ex:A", "@type": ["mfg:ChemicalProcess"] };
  const result = rpmExpand("nonexistent:intent", subject, makeContext(tier1Mapping));
  ok(isRPMError(result), "Must return RPMError for unknown intent");
  if (isRPMError(result)) {
    strictEqual(result.errorCode, "INTENT_NOT_FOUND");
    strictEqual(result.intent, "nonexistent:intent");
  }
  pass("Unknown intent → INTENT_NOT_FOUND");
} catch (error) {
  fail("INTENT_NOT_FOUND", error);
}

try {
  const subject: Subject = { "@id": "ex:A", "@type": ["mfg:ChemicalProcess"] };
  const result = rpmExpand("mfg:hasCatalyst", subject, makeContext()); // empty registry
  ok(isRPMError(result));
  if (isRPMError(result)) {
    strictEqual(result.errorCode, "INTENT_NOT_FOUND");
  }
  pass("Empty registry → INTENT_NOT_FOUND");
} catch (error) {
  fail("Empty registry", error);
}

// =========================================================================
// Subject Validation — SUBCLASS_VIOLATION
// =========================================================================

console.log("\n  --- Subject Validation ---");

try {
  const wrongSubject: Subject = { "@id": "ex:A", "@type": ["cco:Person"] };
  const result = rpmExpand("mfg:hasCatalyst", wrongSubject, makeContext(tier1Mapping));
  ok(isRPMError(result), "Must return RPMError for wrong subject type");
  if (isRPMError(result)) {
    strictEqual(result.errorCode, "SUBCLASS_VIOLATION");
  }
  pass("Wrong subject type → SUBCLASS_VIOLATION");
} catch (error) {
  fail("SUBCLASS_VIOLATION", error);
}

try {
  // Multi-typed subject — at least one type matches
  const multiSubject: Subject = { "@id": "ex:A", "@type": ["schema:Thing", "mfg:ChemicalProcess"] };
  const result = rpmExpand("mfg:hasCatalyst", multiSubject, makeContext(tier1Mapping));
  ok(isCGP(result), "Multi-typed subject with one matching type should pass validation");
  pass("Multi-typed subject with matching type → passes validation");
} catch (error) {
  fail("Multi-typed subject", error);
}

// =========================================================================
// Tier 1 Expansion
// =========================================================================

console.log("\n  --- Tier 1 Expansion ---");

try {
  const subject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };
  const result = rpmExpand("mfg:hasCatalyst", subject, makeContext(tier1Mapping));
  ok(isCGP(result), "Tier 1 expansion must return CGP");

  if (isCGP(result)) {
    // @context present
    ok(result["@context"]);

    // @graph has subject + target
    ok(result["@graph"].length >= 2);

    // Subject node present with correct type
    const subjectNode = result["@graph"].find((n) => n["@id"] === "ex:Batch501");
    ok(subjectNode);
    ok((subjectNode!["@type"] as string[]).includes("mfg:ChemicalProcess"));

    // Target node with mfg:Catalyst type
    const targetNode = result["@graph"].find(
      (n) => n["@id"] !== "ex:Batch501" && (n["@type"] as string[]).includes("mfg:Catalyst"),
    );
    ok(targetNode);

    // Target has blank node ID
    ok(/^_:b[0-9a-f]{16}$/.test(String(targetNode!["@id"])));

    // Subject links to target via mfg:hasCatalyst
    ok(subjectNode!["mfg:hasCatalyst"]);

    // Provenance
    ok(result.provenance);
    ok(result.provenance.rulesApplied.includes("expand:mfg:hasCatalyst"));

    // Target has bind role
    strictEqual(targetNode!["rpm:role"], "target");
  }
  pass("Tier 1: full expansion with subject, target, predicate link, provenance, and bind role");
} catch (error) {
  fail("Tier 1 expansion", error);
}

// =========================================================================
// Tier 3 Nested Branch Expansion
// =========================================================================

console.log("\n  --- Tier 3 Nested Branch ---");

try {
  const subject: Subject = { "@id": "ex:Alice", "@type": ["cco:Person"] };
  const result = rpmExpand(
    "rpm:compound_Person_Organization_Employment_v1",
    subject,
    makeContext(tier3Mapping),
  );
  ok(isCGP(result));

  if (isCGP(result)) {
    // 4 nodes: Alice + EmployeeRole + ActOfEmployment + Organization
    strictEqual(result["@graph"].length, 4);

    // Organization has employer role
    const orgNode = result["@graph"].find(
      (n) => (n["@type"] as string[]).includes("cco:Organization"),
    );
    ok(orgNode);
    strictEqual(orgNode!["rpm:role"], "employer");

    // All blank nodes are distinct
    const blankIds = result["@graph"]
      .filter((n) => String(n["@id"]).startsWith("_:b"))
      .map((n) => n["@id"]);
    strictEqual(new Set(blankIds).size, 3);
  }
  pass("Tier 3: 4 nodes, employer role, distinct blank IDs");
} catch (error) {
  fail("Tier 3 expansion", error);
}

// =========================================================================
// Inverse Edge Direction
// =========================================================================

console.log("\n  --- Inverse Edge ---");

try {
  const subject: Subject = { "@id": "ex:AcmeCorp", "@type": ["org:Organization"] };
  const result = rpmExpand("org:hasMembers", subject, makeContext(inverseMapping));
  ok(isCGP(result));

  if (isCGP(result)) {
    // The new node should point BACK to the subject via org:memberOf (inverse)
    const memberNode = result["@graph"].find(
      (n) => (n["@type"] as string[]).includes("org:Person"),
    );
    ok(memberNode);
    // Inverse edge: the child node has the predicate pointing to the parent
    ok(memberNode!["org:memberOf"], "Inverse edge: child points back to parent");
    const ref = memberNode!["org:memberOf"] as { "@id": string };
    strictEqual(ref["@id"], "ex:AcmeCorp");
  }
  pass("Inverse edge: child node links back to parent via predicate");
} catch (error) {
  fail("Inverse edge", error);
}

// =========================================================================
// Literal Step — via "ice"
// =========================================================================

console.log("\n  --- Literal Steps ---");

try {
  const subject: Subject = { "@id": "ex:Alice", "@type": ["cco:Person"] };
  const result = rpmExpand("cco:has_legal_name", subject, makeContext(iceMapping));
  ok(isCGP(result));

  if (isCGP(result)) {
    // Should have an ICE node
    const iceNode = result["@graph"].find(
      (n) => (n["@type"] as string[]).includes("rpm:InformationContentEntity"),
    );
    ok(iceNode, "ICE node must be present for via:ice");
    ok(/^_:b[0-9a-f]{16}$/.test(String(iceNode!["@id"])), "ICE node has blank node ID");
  }
  pass('Literal via "ice": creates ICE node with blank node ID');
} catch (error) {
  fail("Literal via ice", error);
}

// Literal via "direct" — no extra nodes
try {
  const subject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };
  const result = rpmExpand("mfg:hasWeight", subject, makeContext(directLiteralMapping));
  ok(isCGP(result));

  if (isCGP(result)) {
    // Only the subject node — direct literal doesn't create intermediate nodes
    strictEqual(result["@graph"].length, 1, "Direct literal: only subject node, no intermediate");
  }
  pass('Literal via "direct": no intermediate node created');
} catch (error) {
  fail("Literal via direct", error);
}

// =========================================================================
// Determinism
// =========================================================================

console.log("\n  --- Determinism ---");

try {
  const subject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };
  const ctx = makeContext(tier1Mapping);
  const r1 = rpmExpand("mfg:hasCatalyst", subject, ctx);
  const r2 = rpmExpand("mfg:hasCatalyst", subject, ctx);
  ok(isCGP(r1) && isCGP(r2));
  strictEqual(stableStringify(r1), stableStringify(r2));
  pass("Same inputs → identical canonical JSON output");
} catch (error) {
  fail("Determinism", error);
}

// =========================================================================
// Type Guards
// =========================================================================

console.log("\n  --- Type Guards ---");

try {
  const subject: Subject = { "@id": "ex:A", "@type": ["mfg:ChemicalProcess"] };
  const cgp = rpmExpand("mfg:hasCatalyst", subject, makeContext(tier1Mapping));
  ok(isCGP(cgp), "Successful expansion passes isCGP");
  ok(!isRPMError(cgp), "Successful expansion fails isRPMError");
  pass("Type guards correctly discriminate CGP from RPMError");
} catch (error) {
  fail("Type guard CGP", error);
}

try {
  const subject: Subject = { "@id": "ex:A", "@type": ["wrong:Type"] };
  const err = rpmExpand("mfg:hasCatalyst", subject, makeContext(tier1Mapping));
  ok(isRPMError(err), "Failed expansion passes isRPMError");
  ok(!isCGP(err), "Failed expansion fails isCGP");
  pass("Type guards correctly discriminate RPMError from CGP");
} catch (error) {
  fail("Type guard RPMError", error);
}

// =========================================================================
// Input Immutability
// =========================================================================

console.log("\n  --- Input Immutability ---");

try {
  const subject: Subject = { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] };
  const subjectCopy = JSON.parse(JSON.stringify(subject));
  const ctx = makeContext(tier1Mapping);
  rpmExpand("mfg:hasCatalyst", subject, ctx);
  deepStrictEqual(subject, subjectCopy, "Subject must not be mutated");
  pass("rpmExpand does not mutate the input subject");
} catch (error) {
  fail("Input immutability", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
