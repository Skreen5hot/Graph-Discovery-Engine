/**
 * Deterministic ID Generation Tests — CT-02
 *
 * CT-02: Hash Stability Test (RPM §33.2, §9)
 * Identical inputs across 1,000 runs produce identical SHA-256-derived
 * blank node IDs. This is specifically a consistency test, not just
 * a general determinism test.
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
// Identical inputs across 1,000 runs produce identical IDs
// =========================================================================

console.log("\n  --- CT-02: Hash Stability (1,000 runs) ---");

// Fixture 1: Tier 1 direct predicate — full IRI shorthand
const fixture1 = {
  shorthand: "https://example.org/mfg/hasCatalyst",
  subjectId: "ex:Batch501",
  stepPath: "0",
  branchName: "catalyst",
};

try {
  const referenceId = generateNodeId(
    fixture1.shorthand,
    fixture1.subjectId,
    fixture1.stepPath,
    fixture1.branchName,
  );
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(
      fixture1.shorthand,
      fixture1.subjectId,
      fixture1.stepPath,
      fixture1.branchName,
    );
    strictEqual(id, referenceId, `Run ${i}: ID diverged`);
  }
  pass("Fixture 1 (Tier 1 hasCatalyst): 1,000 runs identical");
} catch (error) {
  fail("Fixture 1 stability", error);
}

// Fixture 2: Tier 3 compound intent — compound shorthand
const fixture2 = {
  shorthand: "rpm:compound_Person_Organization_Employment_v1",
  subjectId: "ex:Alice",
  stepPath: "0.1.2",
  branchName: "participants",
};

try {
  const referenceId = generateNodeId(
    fixture2.shorthand,
    fixture2.subjectId,
    fixture2.stepPath,
    fixture2.branchName,
  );
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(
      fixture2.shorthand,
      fixture2.subjectId,
      fixture2.stepPath,
      fixture2.branchName,
    );
    strictEqual(id, referenceId, `Run ${i}: ID diverged`);
  }
  pass("Fixture 2 (Tier 3 compound): 1,000 runs identical");
} catch (error) {
  fail("Fixture 2 stability", error);
}

// Fixture 3: Root node — empty branch name
const fixture3 = {
  shorthand: "https://example.org/mfg/hasCatalyst",
  subjectId: "ex:Batch501",
  stepPath: "0",
  branchName: "",
};

try {
  const referenceId = generateNodeId(
    fixture3.shorthand,
    fixture3.subjectId,
    fixture3.stepPath,
    fixture3.branchName,
  );
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(
      fixture3.shorthand,
      fixture3.subjectId,
      fixture3.stepPath,
      fixture3.branchName,
    );
    strictEqual(id, referenceId, `Run ${i}: ID diverged`);
  }
  pass("Fixture 3 (empty branch name): 1,000 runs identical");
} catch (error) {
  fail("Fixture 3 stability", error);
}

// Fixture 4: Deep nested step path
const fixture4 = {
  shorthand: "rpm:compound_Person_Organization_Employment_v1",
  subjectId: "ex:Bob",
  stepPath: "0.1.2.3.4",
  branchName: "employment",
};

try {
  const referenceId = generateNodeId(
    fixture4.shorthand,
    fixture4.subjectId,
    fixture4.stepPath,
    fixture4.branchName,
  );
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(
      fixture4.shorthand,
      fixture4.subjectId,
      fixture4.stepPath,
      fixture4.branchName,
    );
    strictEqual(id, referenceId, `Run ${i}: ID diverged`);
  }
  pass("Fixture 4 (deep path 0.1.2.3.4): 1,000 runs identical");
} catch (error) {
  fail("Fixture 4 stability", error);
}

// Fixture 5: Subject with special characters (pipe in IRI)
const fixture5 = {
  shorthand: "https://example.org/ns#has|special",
  subjectId: "ex:Entity\\With\\Backslash",
  stepPath: "0",
  branchName: "test",
};

try {
  const referenceId = generateNodeId(
    fixture5.shorthand,
    fixture5.subjectId,
    fixture5.stepPath,
    fixture5.branchName,
  );
  for (let i = 0; i < 1000; i++) {
    const id = generateNodeId(
      fixture5.shorthand,
      fixture5.subjectId,
      fixture5.stepPath,
      fixture5.branchName,
    );
    strictEqual(id, referenceId, `Run ${i}: ID diverged`);
  }
  pass("Fixture 5 (special chars pipe+backslash): 1,000 runs identical");
} catch (error) {
  fail("Fixture 5 stability", error);
}

// =========================================================================
// Blank Node ID Format
// =========================================================================

console.log("\n  --- Blank Node ID Format ---");

try {
  const id = generateNodeId("test:pred", "ex:Subject", "0", "branch");
  ok(id.startsWith("_:b"), `ID must start with "_:b", got: ${id}`);
  strictEqual(id.length, 3 + 16, `ID must be 19 chars (_:b + 16 hex), got: ${id.length}`);
  ok(/^_:b[0-9a-f]{16}$/.test(id), `ID must match _:b[0-9a-f]{16}, got: ${id}`);
  pass("Blank node ID format: _:b + 16 lowercase hex chars");
} catch (error) {
  fail("ID format", error);
}

try {
  const id = generateNodeId("test:pred", "ex:Subject", "0", "branch");
  strictEqual(id, id.toLowerCase(), "ID must be lowercase");
  pass("ID is fully lowercase");
} catch (error) {
  fail("ID lowercase", error);
}

// =========================================================================
// Canonical Input Serialization
// =========================================================================

console.log("\n  --- Canonical Input Serialization ---");

// Basic pipe separation
try {
  const input = buildCanonicalInput("a", "b", "c");
  strictEqual(input, "a|b|c");
  pass("Basic pipe separation: a|b|c");
} catch (error) {
  fail("Basic pipe separation", error);
}

// Empty component (two adjacent pipes)
try {
  const input = buildCanonicalInput("a", "", "c");
  strictEqual(input, "a||c");
  pass("Empty component: a||c");
} catch (error) {
  fail("Empty component", error);
}

// Pipe in value is escaped
try {
  const input = buildCanonicalInput("has|pipe", "value");
  strictEqual(input, "has\\|pipe|value");
  pass("Pipe escape: has\\|pipe|value");
} catch (error) {
  fail("Pipe escape", error);
}

// Backslash in value is escaped
try {
  const input = buildCanonicalInput("has\\back", "value");
  strictEqual(input, "has\\\\back|value");
  pass("Backslash escape: has\\\\back|value");
} catch (error) {
  fail("Backslash escape", error);
}

// Both pipe and backslash
try {
  const input = buildCanonicalInput("a\\|b", "c");
  strictEqual(input, "a\\\\\\|b|c");
  pass("Combined escape: backslash then pipe");
} catch (error) {
  fail("Combined escape", error);
}

// =========================================================================
// Different Inputs → Different IDs
// =========================================================================

console.log("\n  --- Different Inputs Produce Different IDs ---");

try {
  const id1 = generateNodeId("test:pred", "ex:A", "0", "branch");
  const id2 = generateNodeId("test:pred", "ex:B", "0", "branch");
  notStrictEqual(id1, id2, "Different subjects must produce different IDs");
  pass("Different subject IDs → different blank node IDs");
} catch (error) {
  fail("Different subjects", error);
}

try {
  const id1 = generateNodeId("test:pred1", "ex:A", "0", "");
  const id2 = generateNodeId("test:pred2", "ex:A", "0", "");
  notStrictEqual(id1, id2, "Different shorthands must produce different IDs");
  pass("Different shorthands → different blank node IDs");
} catch (error) {
  fail("Different shorthands", error);
}

try {
  const id1 = generateNodeId("test:pred", "ex:A", "0", "");
  const id2 = generateNodeId("test:pred", "ex:A", "0.1", "");
  notStrictEqual(id1, id2, "Different step paths must produce different IDs");
  pass("Different step paths → different blank node IDs");
} catch (error) {
  fail("Different step paths", error);
}

try {
  const id1 = generateNodeId("test:pred", "ex:A", "0", "branch1");
  const id2 = generateNodeId("test:pred", "ex:A", "0", "branch2");
  notStrictEqual(id1, id2, "Different branch names must produce different IDs");
  pass("Different branch names → different blank node IDs");
} catch (error) {
  fail("Different branch names", error);
}

// =========================================================================
// generateHexHash
// =========================================================================

console.log("\n  --- generateHexHash ---");

try {
  const hash = generateHexHash("test input");
  strictEqual(hash.length, 16, "Hash must be 16 chars");
  ok(/^[0-9a-f]{16}$/.test(hash), "Hash must be lowercase hex");
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
  ok(id.startsWith("ov_"), `overrideId must start with "ov_", got: ${id}`);
  strictEqual(id.length, 3 + 8, `overrideId must be 11 chars (ov_ + 8 hex), got: ${id.length}`);
  ok(/^ov_[0-9a-f]{8}$/.test(id), `overrideId must match ov_[0-9a-f]{8}, got: ${id}`);
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
