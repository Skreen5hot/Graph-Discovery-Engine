/**
 * Deterministic ID Generation Tests — CT-02
 *
 * CT-02: Hash Stability Test (RPM §33.2, §9)
 * Identical inputs across 1,000 runs produce identical SHA-256-derived
 * blank node IDs. This is specifically a consistency test, not just
 * a general determinism test.
 *
 * All fixtures use the §9.2 canonical component order:
 *   subjectId | intent | mappingShorthand | stepPath | branchName | occurrenceIndex
 *
 * Plus unit tests for canonical input format, escape rules,
 * overrideId generation, and hex hash format.
 */

import { strictEqual, ok, notStrictEqual } from "node:assert";
import {
  buildCanonicalInput,
  generateBlankNodeId,
  generateNodeId,
  generateHexHash,
  generateOverrideId,
} from "../src/kernel/deterministic-id.js";

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
// CT-02 — Hash Stability Test (RPM §33.2)
// Identical inputs across 1,000 runs produce identical IDs.
// Component order per §9.2: subjectId | intent | mappingShorthand | stepPath | branchName | occurrenceIndex
// =========================================================================

console.log("\n  --- CT-02: Hash Stability (1,000 runs) ---");

// Fixture 1: Tier 1 direct predicate — full IRI shorthand, intent = shorthand
const f1 = {
  subjectId: "ex:Batch501",
  intent: "https://example.org/mfg/hasCatalyst",
  shorthand: "https://example.org/mfg/hasCatalyst",
  stepPath: "0",
  branchName: "catalyst",
  occurrenceIndex: 0,
};

try {
  const ref = generateNodeId(f1.subjectId, f1.intent, f1.shorthand, f1.stepPath, f1.branchName, f1.occurrenceIndex);
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(f1.subjectId, f1.intent, f1.shorthand, f1.stepPath, f1.branchName, f1.occurrenceIndex);
    strictEqual(id, ref, `Run ${i}: ID diverged`);
  }
  pass("Fixture 1 (Tier 1 hasCatalyst): 1,000 runs identical");
} catch (error) {
  fail("Fixture 1 stability", error);
}

// Fixture 2: Tier 3 compound intent — compound shorthand, distinct intent
const f2 = {
  subjectId: "ex:Alice",
  intent: "rpm:compound_Person_Organization_Employment_v1",
  shorthand: "rpm:compound_Person_Organization_Employment_v1",
  stepPath: "0.1.2",
  branchName: "participants",
  occurrenceIndex: 0,
};

try {
  const ref = generateNodeId(f2.subjectId, f2.intent, f2.shorthand, f2.stepPath, f2.branchName, f2.occurrenceIndex);
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(f2.subjectId, f2.intent, f2.shorthand, f2.stepPath, f2.branchName, f2.occurrenceIndex);
    strictEqual(id, ref, `Run ${i}: ID diverged`);
  }
  pass("Fixture 2 (Tier 3 compound): 1,000 runs identical");
} catch (error) {
  fail("Fixture 2 stability", error);
}

// Fixture 3: Root node — empty branch name, occurrenceIndex 0
const f3 = {
  subjectId: "ex:Batch501",
  intent: "https://example.org/mfg/hasCatalyst",
  shorthand: "https://example.org/mfg/hasCatalyst",
  stepPath: "0",
  branchName: "",
  occurrenceIndex: 0,
};

try {
  const ref = generateNodeId(f3.subjectId, f3.intent, f3.shorthand, f3.stepPath, f3.branchName, f3.occurrenceIndex);
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(f3.subjectId, f3.intent, f3.shorthand, f3.stepPath, f3.branchName, f3.occurrenceIndex);
    strictEqual(id, ref, `Run ${i}: ID diverged`);
  }
  pass("Fixture 3 (empty branch name): 1,000 runs identical");
} catch (error) {
  fail("Fixture 3 stability", error);
}

// Fixture 4: Deep nested step path, non-zero occurrenceIndex
const f4 = {
  subjectId: "ex:Bob",
  intent: "rpm:compound_Person_Organization_Employment_v1",
  shorthand: "rpm:compound_Person_Organization_Employment_v1",
  stepPath: "0.1.2.3.4",
  branchName: "employment",
  occurrenceIndex: 2,
};

try {
  const ref = generateNodeId(f4.subjectId, f4.intent, f4.shorthand, f4.stepPath, f4.branchName, f4.occurrenceIndex);
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(f4.subjectId, f4.intent, f4.shorthand, f4.stepPath, f4.branchName, f4.occurrenceIndex);
    strictEqual(id, ref, `Run ${i}: ID diverged`);
  }
  pass("Fixture 4 (deep path, occurrenceIndex=2): 1,000 runs identical");
} catch (error) {
  fail("Fixture 4 stability", error);
}

// Fixture 5: Special characters (pipe in IRI, backslash in subject)
const f5 = {
  subjectId: "ex:Entity\\With\\Backslash",
  intent: "https://example.org/ns#has|special",
  shorthand: "https://example.org/ns#has|special",
  stepPath: "0",
  branchName: "test",
  occurrenceIndex: 0,
};

try {
  const ref = generateNodeId(f5.subjectId, f5.intent, f5.shorthand, f5.stepPath, f5.branchName, f5.occurrenceIndex);
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(f5.subjectId, f5.intent, f5.shorthand, f5.stepPath, f5.branchName, f5.occurrenceIndex);
    strictEqual(id, ref, `Run ${i}: ID diverged`);
  }
  pass("Fixture 5 (special chars pipe+backslash): 1,000 runs identical");
} catch (error) {
  fail("Fixture 5 stability", error);
}

// =========================================================================
// §9.2 Component Order Verification
// Swapping any two components must produce a different ID
// =========================================================================

console.log("\n  --- §9.2 Component Order Matters ---");

try {
  // subjectId and intent swapped → different ID
  const id1 = generateNodeId("ex:A", "test:intent", "test:short", "0", "", 0);
  const id2 = generateNodeId("test:intent", "ex:A", "test:short", "0", "", 0);
  notStrictEqual(id1, id2, "Swapping subjectId and intent must produce different IDs");
  pass("subjectId ↔ intent swap → different ID");
} catch (error) {
  fail("Component order: subjectId/intent", error);
}

try {
  // intent and mappingShorthand swapped → different ID (when they differ)
  const id1 = generateNodeId("ex:A", "intent:X", "short:Y", "0", "", 0);
  const id2 = generateNodeId("ex:A", "short:Y", "intent:X", "0", "", 0);
  notStrictEqual(id1, id2, "Swapping intent and shorthand must produce different IDs");
  pass("intent ↔ mappingShorthand swap → different ID");
} catch (error) {
  fail("Component order: intent/shorthand", error);
}

try {
  // occurrenceIndex 0 vs 1 → different ID
  const id1 = generateNodeId("ex:A", "test:i", "test:s", "0", "b", 0);
  const id2 = generateNodeId("ex:A", "test:i", "test:s", "0", "b", 1);
  notStrictEqual(id1, id2, "Different occurrenceIndex must produce different IDs");
  pass("occurrenceIndex 0 vs 1 → different ID");
} catch (error) {
  fail("occurrenceIndex differentiation", error);
}

// =========================================================================
// Blank Node ID Format
// =========================================================================

console.log("\n  --- Blank Node ID Format ---");

try {
  const id = generateNodeId("ex:Subject", "test:intent", "test:pred", "0", "branch", 0);
  ok(id.startsWith("_:b"), `ID must start with "_:b", got: ${id}`);
  strictEqual(id.length, 3 + 16, `ID must be 19 chars (_:b + 16 hex), got: ${id.length}`);
  ok(/^_:b[0-9a-f]{16}$/.test(id), `ID must match _:b[0-9a-f]{16}, got: ${id}`);
  pass("Blank node ID format: _:b + 16 lowercase hex chars");
} catch (error) {
  fail("ID format", error);
}

try {
  const id = generateNodeId("ex:Subject", "test:intent", "test:pred", "0", "branch", 0);
  strictEqual(id, id.toLowerCase(), "ID must be lowercase");
  pass("ID is fully lowercase");
} catch (error) {
  fail("ID lowercase", error);
}

// =========================================================================
// Canonical Input Serialization
// =========================================================================

console.log("\n  --- Canonical Input Serialization ---");

try {
  const input = buildCanonicalInput("a", "b", "c");
  strictEqual(input, "a|b|c");
  pass("Basic pipe separation: a|b|c");
} catch (error) {
  fail("Basic pipe separation", error);
}

try {
  const input = buildCanonicalInput("a", "", "c");
  strictEqual(input, "a||c");
  pass("Empty component: a||c");
} catch (error) {
  fail("Empty component", error);
}

try {
  const input = buildCanonicalInput("has|pipe", "value");
  strictEqual(input, "has\\|pipe|value");
  pass("Pipe escape: has\\|pipe|value");
} catch (error) {
  fail("Pipe escape", error);
}

try {
  const input = buildCanonicalInput("has\\back", "value");
  strictEqual(input, "has\\\\back|value");
  pass("Backslash escape: has\\\\back|value");
} catch (error) {
  fail("Backslash escape", error);
}

try {
  const input = buildCanonicalInput("a\\|b", "c");
  strictEqual(input, "a\\\\\\|b|c");
  pass("Combined escape: backslash then pipe");
} catch (error) {
  fail("Combined escape", error);
}

// Six components in §9.2 order
try {
  const input = buildCanonicalInput("ex:A", "test:intent", "test:short", "0.1", "branch", "0");
  strictEqual(input, "ex:A|test:intent|test:short|0.1|branch|0");
  pass("Six components in §9.2 order: subjectId|intent|shorthand|stepPath|branchName|occurrenceIndex");
} catch (error) {
  fail("Six component canonical input", error);
}

// =========================================================================
// Different Inputs → Different IDs
// =========================================================================

console.log("\n  --- Different Inputs Produce Different IDs ---");

try {
  const id1 = generateNodeId("ex:A", "test:i", "test:s", "0", "b", 0);
  const id2 = generateNodeId("ex:B", "test:i", "test:s", "0", "b", 0);
  notStrictEqual(id1, id2);
  pass("Different subject IDs → different blank node IDs");
} catch (error) {
  fail("Different subjects", error);
}

try {
  const id1 = generateNodeId("ex:A", "test:i", "test:s1", "0", "", 0);
  const id2 = generateNodeId("ex:A", "test:i", "test:s2", "0", "", 0);
  notStrictEqual(id1, id2);
  pass("Different shorthands → different blank node IDs");
} catch (error) {
  fail("Different shorthands", error);
}

try {
  const id1 = generateNodeId("ex:A", "test:i", "test:s", "0", "", 0);
  const id2 = generateNodeId("ex:A", "test:i", "test:s", "0.1", "", 0);
  notStrictEqual(id1, id2);
  pass("Different step paths → different blank node IDs");
} catch (error) {
  fail("Different step paths", error);
}

try {
  const id1 = generateNodeId("ex:A", "test:i", "test:s", "0", "b1", 0);
  const id2 = generateNodeId("ex:A", "test:i", "test:s", "0", "b2", 0);
  notStrictEqual(id1, id2);
  pass("Different branch names → different blank node IDs");
} catch (error) {
  fail("Different branch names", error);
}

try {
  const id1 = generateNodeId("ex:A", "test:i1", "test:s", "0", "", 0);
  const id2 = generateNodeId("ex:A", "test:i2", "test:s", "0", "", 0);
  notStrictEqual(id1, id2);
  pass("Different intents → different blank node IDs");
} catch (error) {
  fail("Different intents", error);
}

// =========================================================================
// generateHexHash
// =========================================================================

console.log("\n  --- generateHexHash ---");

try {
  const hash = generateHexHash("test input");
  strictEqual(hash.length, 16);
  ok(/^[0-9a-f]{16}$/.test(hash));
  pass("generateHexHash: 16 lowercase hex chars");
} catch (error) {
  fail("generateHexHash format", error);
}

try {
  const h1 = generateHexHash("same input");
  const h2 = generateHexHash("same input");
  strictEqual(h1, h2);
  pass("generateHexHash: same input → same hash");
} catch (error) {
  fail("generateHexHash determinism", error);
}

// =========================================================================
// overrideId Generation (RPM §35.3)
// =========================================================================

console.log("\n  --- overrideId Generation (§35.3) ---");

try {
  const id = generateOverrideId("test:hasCatalyst", "2026-03-20T14:23:00Z");
  ok(id.startsWith("ov_"));
  strictEqual(id.length, 3 + 8);
  ok(/^ov_[0-9a-f]{8}$/.test(id));
  pass("overrideId format: ov_ + 8 lowercase hex chars");
} catch (error) {
  fail("overrideId format", error);
}

try {
  const id1 = generateOverrideId("test:hasCatalyst", "2026-03-20T14:23:00Z");
  const id2 = generateOverrideId("test:hasCatalyst", "2026-03-20T14:23:00Z");
  strictEqual(id1, id2);
  pass("overrideId: same inputs → same ID");
} catch (error) {
  fail("overrideId determinism", error);
}

try {
  const id1 = generateOverrideId("test:hasCatalyst", "2026-03-20T14:23:00Z");
  const id2 = generateOverrideId("test:hasCatalyst", "2026-03-20T14:24:00Z");
  notStrictEqual(id1, id2);
  pass("overrideId: different timestamps → different IDs");
} catch (error) {
  fail("overrideId different timestamps", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
