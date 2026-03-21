/**
 * CGP Serializer Tests
 *
 * Tests for the canonical CGP serializer:
 * - Step path tracking through branch recursion
 * - @graph node ordering (sorted by @id)
 * - Provenance attachment
 * - Deterministic output (same inputs → same JSON string)
 * - Nested branch expansion with correct intermediate node IDs
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import {
  buildStepPath,
  normalizeGraph,
  buildProvenance,
  serializeCGP,
  expandPatternToCGP,
  stringifyCGP,
  CGP_CONTEXT,
} from "../src/kernel/cgp-serializer.js";
import { stableStringify } from "../src/kernel/canonicalize.js";
import type {
  CGPNode,
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

// =========================================================================
// Step Path Tracking
// =========================================================================

console.log("\n  --- Step Path Tracking ---");

try {
  strictEqual(buildStepPath("", 0), "0");
  pass('buildStepPath("", 0) = "0"');
} catch (error) {
  fail("Root path", error);
}

try {
  strictEqual(buildStepPath("0", 1), "0.1");
  pass('buildStepPath("0", 1) = "0.1"');
} catch (error) {
  fail("One level", error);
}

try {
  strictEqual(buildStepPath("0.1", 2), "0.1.2");
  pass('buildStepPath("0.1", 2) = "0.1.2"');
} catch (error) {
  fail("Two levels", error);
}

try {
  strictEqual(buildStepPath("0.1.2.3", 4), "0.1.2.3.4");
  pass('buildStepPath("0.1.2.3", 4) = "0.1.2.3.4"');
} catch (error) {
  fail("Deep path", error);
}

// =========================================================================
// @graph Node Ordering
// =========================================================================

console.log("\n  --- @graph Node Ordering ---");

try {
  const nodes: CGPNode[] = [
    { "@id": "_:bcccc", "@type": ["test:C"] },
    { "@id": "_:baaaa", "@type": ["test:A"] },
    { "@id": "_:bbbbb", "@type": ["test:B"] },
  ];
  const sorted = normalizeGraph(nodes);
  strictEqual(sorted[0]["@id"], "_:baaaa");
  strictEqual(sorted[1]["@id"], "_:bbbbb");
  strictEqual(sorted[2]["@id"], "_:bcccc");
  pass("Nodes sorted by @id lexicographically");
} catch (error) {
  fail("Node ordering", error);
}

try {
  const nodes: CGPNode[] = [
    { "@id": "ex:Subject", "@type": ["test:A"] },
    { "@id": "_:b0000000000000001", "@type": ["test:B"] },
    { "@id": "_:b0000000000000002", "@type": ["test:C"] },
  ];
  const sorted = normalizeGraph(nodes);
  // Lexicographic: "_:b..." < "ex:..." since '_' < 'e' in ASCII
  strictEqual(sorted[0]["@id"], "_:b0000000000000001");
  strictEqual(sorted[1]["@id"], "_:b0000000000000002");
  strictEqual(sorted[2]["@id"], "ex:Subject");
  pass("Subject node sorted alongside blank nodes");
} catch (error) {
  fail("Subject + blank node ordering", error);
}

try {
  // Sorting must not mutate the original array
  const nodes: CGPNode[] = [
    { "@id": "_:bbb", "@type": ["test:B"] },
    { "@id": "_:baa", "@type": ["test:A"] },
  ];
  const original0 = nodes[0]["@id"];
  normalizeGraph(nodes);
  strictEqual(nodes[0]["@id"], original0, "Original array must not be mutated");
  pass("normalizeGraph does not mutate input");
} catch (error) {
  fail("Immutability", error);
}

// =========================================================================
// Provenance
// =========================================================================

console.log("\n  --- Provenance ---");

try {
  const prov = buildProvenance(["rule-a", "rule-b"]);
  strictEqual(prov["@type"], "Provenance");
  strictEqual(prov.kernelVersion, "0.1.0");
  deepStrictEqual(prov.rulesApplied, ["rule-a", "rule-b"]);
  pass("Provenance has correct structure");
} catch (error) {
  fail("Provenance structure", error);
}

try {
  // rulesApplied must be a copy, not a reference
  const rules = ["rule-a"];
  const prov = buildProvenance(rules);
  rules.push("rule-c");
  strictEqual(prov.rulesApplied.length, 1, "Provenance must not share reference with input");
  pass("Provenance.rulesApplied is a defensive copy");
} catch (error) {
  fail("Provenance defensive copy", error);
}

// =========================================================================
// serializeCGP — Complete CGP Document
// =========================================================================

console.log("\n  --- serializeCGP ---");

try {
  const nodes: CGPNode[] = [
    { "@id": "_:b1", "@type": ["test:Node"] },
  ];
  const cgp = serializeCGP(nodes, ["test-rule"]);
  ok(cgp["@context"], "CGP must have @context");
  ok(cgp["@graph"], "CGP must have @graph");
  ok(cgp.provenance, "CGP must have provenance");
  strictEqual((cgp["@context"] as Record<string, string>).rpm, CGP_CONTEXT.rpm);
  pass("serializeCGP produces valid CGP with @context, @graph, provenance");
} catch (error) {
  fail("serializeCGP structure", error);
}

try {
  // Keys must be sorted (round-tripped through stableStringify)
  const nodes: CGPNode[] = [
    { "@id": "_:b1", "@type": ["test:Node"], "zzz:last": "value", "aaa:first": "value" },
  ];
  const cgp = serializeCGP(nodes, []);
  const json = JSON.stringify(cgp);
  const aPos = json.indexOf('"aaa:first"');
  const zPos = json.indexOf('"zzz:last"');
  ok(aPos < zPos, "Keys must be lexicographically sorted");
  pass("serializeCGP produces sorted keys");
} catch (error) {
  fail("Key sorting", error);
}

// =========================================================================
// expandPatternToCGP — Tier 1 Direct Predicate
// =========================================================================

console.log("\n  --- expandPatternToCGP: Tier 1 ---");

const tier1Subject: Subject = {
  "@id": "ex:Batch501",
  "@type": ["mfg:ChemicalProcess"],
};

const tier1Pattern: BranchStep = {
  type: "branch",
  name: "catalyst",
  steps: [
    { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
    { type: "node", class: "mfg:Catalyst" },
    { type: "bind", role: "target" },
  ],
};

try {
  const cgp = expandPatternToCGP(
    tier1Subject,
    "mfg:hasCatalyst",
    "mfg:hasCatalyst",
    tier1Pattern,
    ["expand-tier1"],
  );

  // Must have @context, @graph, provenance
  ok(cgp["@context"]);
  ok(cgp["@graph"]);
  ok(cgp.provenance);

  // @graph must contain at least 2 nodes: subject + target
  ok(cgp["@graph"].length >= 2, `Expected ≥2 nodes, got ${cgp["@graph"].length}`);

  // Subject node must be present
  const subjectNode = cgp["@graph"].find((n) => n["@id"] === "ex:Batch501");
  ok(subjectNode, "Subject node must be in @graph");

  // Target node must have mfg:Catalyst type
  const targetNode = cgp["@graph"].find(
    (n) => n["@id"] !== "ex:Batch501" && (n["@type"] as string[]).includes("mfg:Catalyst"),
  );
  ok(targetNode, "Target node with mfg:Catalyst type must be in @graph");

  // Target node must have a deterministic blank node ID
  ok(
    String(targetNode!["@id"]).startsWith("_:b"),
    `Target node @id must be blank node, got: ${targetNode!["@id"]}`,
  );
  ok(
    /^_:b[0-9a-f]{16}$/.test(String(targetNode!["@id"])),
    "Target node @id must be _:b + 16 hex",
  );

  // Subject node must link to target via mfg:hasCatalyst
  ok(
    subjectNode!["mfg:hasCatalyst"],
    "Subject must have mfg:hasCatalyst predicate",
  );

  // Provenance
  deepStrictEqual(cgp.provenance.rulesApplied, ["expand-tier1"]);

  pass("Tier 1 expansion: subject → edge → node → bind produces correct CGP");
} catch (error) {
  fail("Tier 1 expansion", error);
}

// Determinism: same inputs → identical JSON string
try {
  const cgp1 = expandPatternToCGP(tier1Subject, "mfg:hasCatalyst", "mfg:hasCatalyst", tier1Pattern, ["rule"]);
  const cgp2 = expandPatternToCGP(tier1Subject, "mfg:hasCatalyst", "mfg:hasCatalyst", tier1Pattern, ["rule"]);
  strictEqual(stringifyCGP(cgp1), stringifyCGP(cgp2));
  pass("Tier 1: identical inputs produce identical JSON strings");
} catch (error) {
  fail("Tier 1 determinism", error);
}

// =========================================================================
// expandPatternToCGP — Nested Branch (Tier 3-like)
// =========================================================================

console.log("\n  --- expandPatternToCGP: Nested Branch ---");

const nestedSubject: Subject = {
  "@id": "ex:Alice",
  "@type": ["cco:Person"],
};

const nestedPattern: BranchStep = {
  type: "branch",
  name: "employment",
  steps: [
    { type: "edge", predicate: "cco:is_bearer_of", direction: "forward" },
    { type: "node", class: "cco:EmployeeRole" },
    { type: "edge", predicate: "cco:is_realized_in", direction: "forward" },
    { type: "node", class: "cco:ActOfEmployment" },
    {
      type: "branch",
      name: "participants",
      steps: [
        { type: "edge", predicate: "cco:has_participant", direction: "forward" },
        { type: "node", class: "cco:Organization" },
        { type: "bind", role: "employer" },
      ],
    },
  ],
};

try {
  const cgp = expandPatternToCGP(
    nestedSubject,
    "rpm:compound_Person_Organization_Employment_v1",
    "rpm:compound_Person_Organization_Employment_v1",
    nestedPattern,
    ["expand-tier3"],
  );

  // Must have 4 nodes: Alice + EmployeeRole + ActOfEmployment + Organization
  strictEqual(cgp["@graph"].length, 4, `Expected 4 nodes, got ${cgp["@graph"].length}`);

  // All nodes must have @id and @type
  for (const node of cgp["@graph"]) {
    ok(node["@id"], "Every node must have @id");
    ok(node["@type"], "Every node must have @type");
  }

  // Subject node
  const alice = cgp["@graph"].find((n) => n["@id"] === "ex:Alice");
  ok(alice, "Subject node ex:Alice must be present");

  // Intermediate nodes must have blank node IDs
  const blankNodes = cgp["@graph"].filter((n) => String(n["@id"]).startsWith("_:b"));
  strictEqual(blankNodes.length, 3, "3 intermediate nodes must have blank node IDs");

  // Organization node must have employer role
  const orgNode = cgp["@graph"].find(
    (n) => (n["@type"] as string[]).includes("cco:Organization"),
  );
  ok(orgNode, "Organization node must be present");
  strictEqual(orgNode!["rpm:role"], "employer");

  pass("Nested branch: 4 nodes with correct types, blank IDs, and employer role");
} catch (error) {
  fail("Nested branch expansion", error);
}

// Step path correctness: intermediate nodes in nested branch must have
// paths like "1" (EmployeeRole at step 1), "3" (ActOfEmployment at step 3),
// "4.1" (Organization at branch step 4, inner step 1).
// We verify this indirectly: all 3 blank node IDs must be distinct.
try {
  const cgp = expandPatternToCGP(
    nestedSubject,
    "rpm:compound_Person_Organization_Employment_v1",
    "rpm:compound_Person_Organization_Employment_v1",
    nestedPattern,
    [],
  );
  const blankIds = cgp["@graph"]
    .filter((n) => String(n["@id"]).startsWith("_:b"))
    .map((n) => n["@id"]);
  const uniqueIds = new Set(blankIds);
  strictEqual(uniqueIds.size, 3, "All 3 blank node IDs must be distinct");
  pass("Nested branch: all intermediate blank node IDs are distinct (correct step paths)");
} catch (error) {
  fail("Nested branch step path uniqueness", error);
}

// Determinism across runs
try {
  const cgp1 = expandPatternToCGP(
    nestedSubject,
    "rpm:compound_Person_Organization_Employment_v1",
    "rpm:compound_Person_Organization_Employment_v1",
    nestedPattern,
    ["rule"],
  );
  const cgp2 = expandPatternToCGP(
    nestedSubject,
    "rpm:compound_Person_Organization_Employment_v1",
    "rpm:compound_Person_Organization_Employment_v1",
    nestedPattern,
    ["rule"],
  );
  strictEqual(stringifyCGP(cgp1), stringifyCGP(cgp2));
  pass("Nested branch: identical inputs produce identical JSON strings");
} catch (error) {
  fail("Nested branch determinism", error);
}

// =========================================================================
// @graph ordering is deterministic regardless of insertion order
// =========================================================================

console.log("\n  --- @graph Ordering Determinism ---");

try {
  // The @graph array must be sorted by @id, not insertion order.
  // Since blank node IDs are SHA-256 derived, their sort order is
  // not the same as the pattern traversal order.
  const cgp = expandPatternToCGP(
    nestedSubject,
    "rpm:compound_Person_Organization_Employment_v1",
    "rpm:compound_Person_Organization_Employment_v1",
    nestedPattern,
    [],
  );
  const ids = cgp["@graph"].map((n) => String(n["@id"]));
  const sortedIds = [...ids].sort();
  deepStrictEqual(ids, sortedIds, "@graph nodes must be sorted by @id");
  pass("@graph nodes are sorted by @id (not insertion order)");
} catch (error) {
  fail("@graph sort order", error);
}

// =========================================================================
// CGP_CONTEXT
// =========================================================================

console.log("\n  --- CGP_CONTEXT ---");

try {
  ok(CGP_CONTEXT.rpm, "CGP_CONTEXT must include rpm namespace");
  ok(CGP_CONTEXT.rdf, "CGP_CONTEXT must include rdf namespace");
  ok(CGP_CONTEXT.rdfs, "CGP_CONTEXT must include rdfs namespace");
  ok(CGP_CONTEXT.owl, "CGP_CONTEXT must include owl namespace");
  ok(CGP_CONTEXT.xsd, "CGP_CONTEXT must include xsd namespace");
  strictEqual(CGP_CONTEXT.rpm, "https://spec.example.org/rpm/v2/");
  pass("CGP_CONTEXT has required namespace prefixes");
} catch (error) {
  fail("CGP_CONTEXT", error);
}

// =========================================================================
// stringifyCGP
// =========================================================================

console.log("\n  --- stringifyCGP ---");

try {
  const cgp = expandPatternToCGP(tier1Subject, "test:i", "test:s", tier1Pattern, []);
  const compact = stringifyCGP(cgp, false);
  const pretty = stringifyCGP(cgp, true);
  ok(!compact.includes("\n"), "Compact mode has no newlines");
  ok(pretty.includes("\n"), "Pretty mode has newlines");
  // Both must parse to the same structure
  deepStrictEqual(JSON.parse(compact), JSON.parse(pretty));
  pass("stringifyCGP: compact and pretty modes produce equivalent JSON");
} catch (error) {
  fail("stringifyCGP modes", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
