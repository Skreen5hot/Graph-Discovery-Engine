/**
 * Narrative Synthesis Tests — CT-14
 *
 * CT-14: Narrative Synthesis Test (RPM §33.9)
 * Verifies that the Narrative Synthesis Layer produces correct plain-language
 * path summaries with no prohibited terms in the output.
 *
 * Plus unit tests for verb conversion, entity label resolution, summary
 * composition, narrativePath assembly, firewall enforcement (including
 * prohibited term correction), and multi-clause narrative modes.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import {
  resolveEntityLabel,
  convertToVerbPhrase,
  composeSummary,
  buildNarrativePath,
  generateNarrative,
  formatMultiClauseNarrative,
} from "../src/kernel/narrative.js";
import { containsProhibitedTerm } from "../src/kernel/error-translation.js";
import type {
  CGP,
  UIBlock,
  BranchStep,
  OntologyClosure,
  OntologyClass,
  OntologyProperty,
  LabelAnnotation,
  NarrativeResult,
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
// Helpers
// ---------------------------------------------------------------------------

function makeClass(iri: string, labels: LabelAnnotation[] = []): OntologyClass {
  return { iri, superClasses: [], labels, annotations: [] };
}

function makeProp(iri: string, labels: LabelAnnotation[] = []): OntologyProperty {
  return { iri, superProperties: [], domain: [], range: [], labels, annotations: [] };
}

function makeClosure(classes: OntologyClass[] = [], properties: OntologyProperty[] = []): OntologyClosure {
  return {
    classes: new Map(classes.map((c) => [c.iri, c])),
    properties: new Map(properties.map((p) => [p.iri, p])),
  };
}

const emptyUI: UIBlock = {
  label: "Has Catalyst", description: "", group: "", examples: [],
  subjectLabel: "Chemical Process", inputParameters: [], outputBinds: [],
};

const emptyCGP: CGP = {
  "@context": { rpm: "https://spec.example.org/rpm/v2/" },
  "@graph": [],
  provenance: { "@type": "Provenance", kernelVersion: "0.1.0", rulesApplied: [] },
};

// =========================================================================
// §34.3 Step 2 — Predicate Verb Conversion
// =========================================================================

console.log("\n  --- Predicate Verb Conversion (§34.3 Step 2) ---");

try {
  strictEqual(convertToVerbPhrase("Has Catalyst"), "has catalyst");
  pass('"Has Catalyst" → "has catalyst"');
} catch (error) {
  fail("Has X rule", error);
}

try {
  strictEqual(convertToVerbPhrase("Has Legal Name"), "has legal name");
  pass('"Has Legal Name" → "has legal name"');
} catch (error) {
  fail("Has X multi-word", error);
}

try {
  strictEqual(convertToVerbPhrase("Employed by"), "is employed by");
  pass('"Employed by" → "is employed by"');
} catch (error) {
  fail("X by rule", error);
}

try {
  strictEqual(convertToVerbPhrase("Procured by"), "is procured by");
  pass('"Procured by" → "is procured by"');
} catch (error) {
  fail("X by variant", error);
}

try {
  strictEqual(convertToVerbPhrase("Is Member Of"), "is member of");
  pass('"Is Member Of" → "is member of"');
} catch (error) {
  fail("Is X rule", error);
}

try {
  strictEqual(convertToVerbPhrase("Employment"), "is linked to via employment");
  pass('"Employment" → "is linked to via employment" (fallback)');
} catch (error) {
  fail("Fallback rule", error);
}

try {
  strictEqual(convertToVerbPhrase(""), "is linked to");
  pass('Empty label → "is linked to"');
} catch (error) {
  fail("Empty label", error);
}

// =========================================================================
// §34.3 Steps 1 & 3 — Entity Label Resolution
// =========================================================================

console.log("\n  --- Entity Label Resolution (§34.3 Steps 1 & 3) ---");

try {
  const closure = makeClosure([], [
    makeProp("ex:Batch501", [{ value: "Batch 501", language: "en", predicate: "rdfs:label" }]),
  ]);
  const label = resolveEntityLabel("ex:Batch501", closure, "Chemical Process");
  strictEqual(label, "Batch 501");
  pass("Entity with rdfs:label → uses label");
} catch (error) {
  fail("Entity rdfs:label", error);
}

try {
  const closure = makeClosure();
  const label = resolveEntityLabel("https://example.org/mfg/Palladium", closure, "Catalyst");
  strictEqual(label, "Palladium");
  pass("Entity not in closure → IRI cleaning fallback");
} catch (error) {
  fail("IRI cleaning fallback", error);
}

try {
  const closure = makeClosure();
  const label = resolveEntityLabel("_:b1234567890abcdef", closure, "Chemical Process");
  strictEqual(label, "Chemical Process");
  pass("Blank node → class-level fallback");
} catch (error) {
  fail("Blank node fallback", error);
}

// =========================================================================
// §34.3 Step 4 — Summary Sentence Composition
// =========================================================================

console.log("\n  --- Summary Composition (§34.3 Step 4) ---");

try {
  const summary = composeSummary("Batch 501", "has catalyst", "Palladium", 1);
  strictEqual(summary, "Batch 501 has catalyst Palladium.");
  pass("Tier 1: subject + verb + object + period");
} catch (error) {
  fail("Tier 1 summary", error);
}

try {
  const summary = composeSummary("Alice", "is employed by", "Acme Corp", 3, "Act Of Employment");
  strictEqual(summary, "Alice is employed by Acme Corp via Act Of Employment.");
  pass("Tier 3: subject + verb + object + via anchor");
} catch (error) {
  fail("Tier 3 summary", error);
}

try {
  // Anchor label same as verb → omit "via" clause
  const summary = composeSummary("Alice", "employment", "Acme Corp", 3, "Employment");
  strictEqual(summary, "Alice employment Acme Corp.");
  pass("Anchor = verb → via clause omitted");
} catch (error) {
  fail("Anchor equals verb", error);
}

try {
  // Tier 2 with no anchor → omit via clause
  const summary = composeSummary("Alice", "has role", "Manager", 2);
  strictEqual(summary, "Alice has role Manager.");
  pass("Tier 2 with no anchor → no via clause");
} catch (error) {
  fail("Tier 2 no anchor", error);
}

// =========================================================================
// §34.3 Step 5 — narrativePath Assembly
// =========================================================================

console.log("\n  --- narrativePath Assembly (§34.3 Step 5) ---");

try {
  const steps: BranchStep = {
    type: "branch", name: "catalyst",
    steps: [
      { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
      { type: "node", class: "mfg:Catalyst" },
      { type: "bind", role: "target" },
    ],
  };
  const closure = makeClosure(
    [makeClass("mfg:Catalyst", [{ value: "Catalyst", language: "en", predicate: "rdfs:label" }])],
    [makeProp("mfg:hasCatalyst", [{ value: "Has Catalyst", language: "en", predicate: "rdfs:label" }])],
  );
  const path = buildNarrativePath(steps.steps, closure, "Palladium");
  strictEqual(path.length, 3);
  strictEqual(path[0].role, "predicate");
  strictEqual(path[0].label, "Has Catalyst");
  strictEqual(path[1].role, "intermediate");
  strictEqual(path[1].label, "Catalyst");
  strictEqual(path[2].role, "object");
  strictEqual(path[2].label, "Palladium");
  pass("Tier 1 path: predicate + intermediate + object");
} catch (error) {
  fail("narrativePath Tier 1", error);
}

// =========================================================================
// CT-14 — Narrative Synthesis Test (RPM §33.9)
// =========================================================================

console.log("\n  --- CT-14: Narrative Synthesis ---");

try {
  const closure = makeClosure(
    [makeClass("mfg:Catalyst", [{ value: "Catalyst", language: "en", predicate: "rdfs:label" }])],
    [
      makeProp("mfg:hasCatalyst", [{ value: "Has Catalyst", language: "en", predicate: "rdfs:label" }]),
      makeProp("ex:Batch501", [{ value: "Batch 501", language: "en", predicate: "rdfs:label" }]),
    ],
  );

  const ui: UIBlock = {
    label: "Has Catalyst", description: "The catalyst agent",
    group: "Chemical Process", examples: [],
    subjectLabel: "Chemical Process", inputParameters: [],
    outputBinds: [{ role: "target", label: "Catalyst", description: "The catalyst" }],
  };

  const pattern: BranchStep = {
    type: "branch", name: "catalyst",
    steps: [
      { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
      { type: "node", class: "mfg:Catalyst" },
      { type: "bind", role: "target" },
    ],
  };

  const result = generateNarrative(
    emptyCGP, ui, "mfg:hasCatalyst", 1, pattern, closure,
    "Batch 501", "Palladium",
  );

  // CT-14 Pass criteria:
  // 1. narrativeSummary includes subject label
  ok(result.narrativeSummary.includes("Batch 501"), "Summary includes subject label");
  // 2. narrativeSummary includes predicate verb form
  ok(
    result.narrativeSummary.includes("has catalyst") || result.narrativeSummary.includes("catalyst"),
    "Summary includes predicate/verb form",
  );
  // 3. narrativeSummary includes object label
  ok(result.narrativeSummary.includes("Palladium"), "Summary includes object label");
  // 4. No prohibited terms
  ok(!containsProhibitedTerm(result.narrativeSummary), "Summary contains no prohibited terms");
  // 5. narrativePath labels contain no prohibited terms
  for (const entry of result.narrativePath) {
    ok(!containsProhibitedTerm(entry.label), `Path label "${entry.label}" contains no prohibited terms`);
  }
  // 6. Summary is a grammatically complete sentence (ends with period)
  ok(result.narrativeSummary.endsWith("."), "Summary ends with period");
  // 7. sourceIntentLabel is set
  strictEqual(result.sourceIntentLabel, "Has Catalyst");

  pass("CT-14: Tier 1 narrative with subject, verb, object — no prohibited terms");
} catch (error) {
  fail("CT-14", error);
}

// =========================================================================
// §34.4 — Firewall Enforcement
// =========================================================================

console.log("\n  --- Firewall Enforcement (§34.4) ---");

// Test: prohibited term in a narrativePath label gets cleaned out
try {
  const closure = makeClosure(
    // Class with a label containing a prohibited IRI
    [makeClass("mfg:Catalyst", [{ value: "Catalyst", language: "en", predicate: "rdfs:label" }])],
    [
      // Predicate whose label contains a prefixed name (prohibited)
      makeProp("mfg:hasCatalyst", [{ value: "cco:HasCatalyst", language: "en", predicate: "rdfs:label" }]),
    ],
  );

  const ui: UIBlock = {
    label: "Has Catalyst", description: "", group: "", examples: [],
    subjectLabel: "Chemical Process", inputParameters: [],
    outputBinds: [{ role: "target", label: "Catalyst", description: "" }],
  };

  const pattern: BranchStep = {
    type: "branch", name: "catalyst",
    steps: [
      { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
      { type: "node", class: "mfg:Catalyst" },
      { type: "bind", role: "target" },
    ],
  };

  const result = generateNarrative(
    emptyCGP, ui, "mfg:hasCatalyst", 1, pattern, closure,
    "Batch 501", "Palladium",
  );

  // The predicate label "cco:HasCatalyst" contains a prohibited prefixed name.
  // The firewall should remove it from the narrativePath rather than emitting it.
  for (const entry of result.narrativePath) {
    ok(
      !containsProhibitedTerm(entry.label),
      `Firewall: path entry "${entry.label}" must not contain prohibited terms`,
    );
  }

  // The summary should still be produced (shorter but correct)
  ok(result.narrativeSummary.length > 0, "Summary is not empty");
  ok(!containsProhibitedTerm(result.narrativeSummary), "Summary passes firewall");

  pass("Firewall: prohibited term in path label removed, produces shorter correct output");
} catch (error) {
  fail("Firewall enforcement", error);
}

// Test: completely unresolvable narrative falls back gracefully
try {
  const closure = makeClosure();
  const ui: UIBlock = {
    label: "", description: "", group: "", examples: [],
    subjectLabel: "Process", inputParameters: [], outputBinds: [],
  };
  const pattern: BranchStep = { type: "branch", name: "x", steps: [] };

  const result = generateNarrative(
    emptyCGP, ui, "test:x", 1, pattern, closure,
    "Item A", "Item B",
  );

  ok(result.narrativeSummary.length > 0, "Fallback summary is not empty");
  ok(result.narrativeSummary.endsWith("."), "Fallback summary ends with period");
  ok(!containsProhibitedTerm(result.narrativeSummary), "Fallback passes firewall");
  pass("Completely empty labels → fallback summary produced");
} catch (error) {
  fail("Fallback narrative", error);
}

// =========================================================================
// §34.5 — Multi-Clause Narrative
// =========================================================================

console.log("\n  --- Multi-Clause Narrative (§34.5) ---");

const mockResults: NarrativeResult[] = [
  {
    "@type": "rpm:NarrativeResult", cgp: emptyCGP,
    narrativeSummary: "Alice is employed by Acme Corp via Act Of Employment.",
    narrativePath: [], sourceIntent: "i1", sourceIntentLabel: "Employment",
  },
  {
    "@type": "rpm:NarrativeResult", cgp: emptyCGP,
    narrativeSummary: 'Alice has legal name "Smith".',
    narrativePath: [], sourceIntent: "i2", sourceIntentLabel: "Legal Name",
  },
];

try {
  const lines = formatMultiClauseNarrative(mockResults, "subjectToSubject");
  strictEqual(lines.length, 2);
  strictEqual(lines[0], "Alice is employed by Acme Corp via Act Of Employment.");
  strictEqual(lines[1], 'Alice has legal name "Smith".');
  pass("Sequential (AND): each summary standalone");
} catch (error) {
  fail("Sequential mode", error);
}

try {
  const lines = formatMultiClauseNarrative(mockResults, "union");
  strictEqual(lines.length, 3);
  strictEqual(lines[0], "One of the following applies:");
  ok(lines[1].startsWith("·"));
  ok(lines[2].startsWith("·"));
  pass("Parallel (OR): prefixed with 'One of the following applies:'");
} catch (error) {
  fail("Parallel mode", error);
}

try {
  const lines = formatMultiClauseNarrative(mockResults, "targetToSubject");
  strictEqual(lines.length, 2);
  strictEqual(lines[0], "Alice is employed by Acme Corp via Act Of Employment.");
  ok(lines[1].startsWith("→ whose"), `Chained line must start with "→ whose", got: ${lines[1]}`);
  pass("Chained (targetToSubject): second clause prefixed with '→ whose'");
} catch (error) {
  fail("Chained mode", error);
}

try {
  const lines = formatMultiClauseNarrative([], "subjectToSubject");
  strictEqual(lines.length, 0);
  pass("Empty results → empty array");
} catch (error) {
  fail("Empty results", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
