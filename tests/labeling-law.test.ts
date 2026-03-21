/**
 * Labeling Law Tests — CT-08, CT-09, CT-13
 *
 * CT-08: Labeling Law Priority Test (RPM §33.3)
 * CT-09: IRI Cleaning Algorithm and Quality Threshold Test (RPM §33.4)
 * CT-13: Quality Threshold Boundary Test (RPM §33.8)
 *
 * Plus unit tests for language preference, hint resolution, and auto-grouping.
 */

import { strictEqual, deepStrictEqual } from "node:assert";
import {
  extractLocalName,
  cleanLocalName,
  evaluateQualityThreshold,
  selectByLanguagePreference,
  resolveLabel,
  resolveHint,
  resolveGroup,
} from "../src/kernel/labeling.js";
import type {
  LabelAnnotation,
  OntologyClosure,
  OntologyClass,
  OntologyProperty,
  LabelResolution,
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
// Helpers — build test ontology closures
// ---------------------------------------------------------------------------

function makeClass(
  iri: string,
  labels: LabelAnnotation[] = [],
  annotations: LabelAnnotation[] = [],
  superClasses: string[] = [],
): OntologyClass {
  return { iri, superClasses, labels, annotations };
}

function makeProperty(
  iri: string,
  labels: LabelAnnotation[] = [],
  annotations: LabelAnnotation[] = [],
): OntologyProperty {
  return {
    iri,
    superProperties: [],
    domain: [],
    range: [],
    labels,
    annotations,
    inverseOf: undefined,
    propertyChain: undefined,
  };
}

function makeClosure(
  classes: OntologyClass[] = [],
  properties: OntologyProperty[] = [],
): OntologyClosure {
  return {
    classes: new Map(classes.map((c) => [c.iri, c])),
    properties: new Map(properties.map((p) => [p.iri, p])),
  };
}

// =========================================================================
// CT-09 Part A — IRI Cleaning Algorithm Correctness (RPM §33.4)
// =========================================================================

console.log("\n  --- CT-09 Part A: IRI Cleaning Algorithm ---");

const cleaningCases: Array<[string, string]> = [
  ["has_catalyst",       "Has Catalyst"],
  ["hasCatalyst",        "Has Catalyst"],
  ["ActOfEmployment",    "Act Of Employment"],
  ["procured_via",       "Procured Via"],
  ["DistillationProcess","Distillation Process"],
  ["CCOPerson",          "CCO Person"],
  ["hasBFORole",         "Has BFO Role"],
];

for (const [input, expected] of cleaningCases) {
  try {
    const result = cleanLocalName(input);
    strictEqual(result, expected);
    pass(`cleanLocalName("${input}") = "${expected}"`);
  } catch (error) {
    fail(`cleanLocalName("${input}") expected "${expected}" but got "${cleanLocalName(input)}"`, error);
  }
}

// =========================================================================
// CT-09 Part B — Quality Threshold Boundary Cases (RPM §33.4)
// =========================================================================

console.log("\n  --- CT-09 Part B: Quality Threshold ---");

const thresholdCases: Array<[string, string, boolean, string]> = [
  // [inputLocalName, expectedCleanedLabel, expectsPass, description]
  ["BFO_0000023", "BFO 0000023", false, "namespace prefix + all-digit remainder → fails"],
  ["TANK_01",     "Tank 01",     true,  "alphabetic word, not namespace prefix → passes"],
  ["PUMP_A2",     "Pump A2",     true,  "alphabetic word → passes"],
  ["R2",          "R2",          false, "single alpha char → base condition fails"],
  ["VALVE_3B",    "Valve 3B",    true,  "alphabetic word → passes"],
  ["4421",        "4421",        false, "all digits → no alpha content"],
  ["ID_4421",     "ID 4421",     true,  "'ID' is 2 alpha chars, not a namespace prefix → passes"],
];

for (const [inputLocalName, expectedCleaned, expectsPass, desc] of thresholdCases) {
  try {
    const cleaned = cleanLocalName(inputLocalName);
    strictEqual(cleaned, expectedCleaned);
    const failureReason = evaluateQualityThreshold(cleaned);
    if (expectsPass) {
      strictEqual(failureReason, null, `Expected pass but got failure: ${failureReason}`);
    } else {
      if (failureReason === null) {
        throw new Error("Expected threshold failure but got pass");
      }
    }
    pass(`threshold("${inputLocalName}" → "${expectedCleaned}"): ${expectsPass ? "passes" : "fails"} — ${desc}`);
  } catch (error) {
    fail(`threshold("${inputLocalName}"): ${desc}`, error);
  }
}

// =========================================================================
// CT-13 — Quality Threshold Boundary Test (RPM §33.8)
// Verifies specific failure reasons for each case
// =========================================================================

console.log("\n  --- CT-13: Quality Threshold Failure Reasons ---");

try {
  const cleaned = cleanLocalName("BFO_0000023");
  const reason = evaluateQualityThreshold(cleaned);
  strictEqual(reason, "noAlphabeticWord");
  pass('BFO_0000023 → reason: "noAlphabeticWord" (secondary condition: namespace prefix + digits)');
} catch (error) {
  fail('BFO_0000023 failure reason', error);
}

try {
  const cleaned = cleanLocalName("R2");
  const reason = evaluateQualityThreshold(cleaned);
  strictEqual(reason, "noAlphabeticWord");
  pass('R2 → reason: "noAlphabeticWord" (base condition: single alpha char)');
} catch (error) {
  fail('R2 failure reason', error);
}

try {
  const cleaned = cleanLocalName("4421");
  const reason = evaluateQualityThreshold(cleaned);
  strictEqual(reason, "noAlphabeticWord");
  pass('4421 → reason: "noAlphabeticWord" (no alpha chars at all)');
} catch (error) {
  fail('4421 failure reason', error);
}

try {
  const reason = evaluateQualityThreshold("X");
  strictEqual(reason, "tooShort");
  pass('"X" → reason: "tooShort" (< 2 chars)');
} catch (error) {
  fail('"X" tooShort rule', error);
}

try {
  const reason = evaluateQualityThreshold("RDF");
  strictEqual(reason, "namespacePrefixCollision");
  pass('"RDF" → reason: "namespacePrefixCollision"');
} catch (error) {
  fail('"RDF" namespacePrefixCollision rule', error);
}

try {
  const reason = evaluateQualityThreshold("OWL");
  strictEqual(reason, "namespacePrefixCollision");
  pass('"OWL" → reason: "namespacePrefixCollision"');
} catch (error) {
  fail('"OWL" namespacePrefixCollision rule', error);
}

// =========================================================================
// CT-08 — Labeling Law Priority Test (RPM §33.3)
// skos:prefLabel overrides rdfs:label on the same IRI
// =========================================================================

console.log("\n  --- CT-08: Labeling Law Priority ---");

try {
  const closure = makeClosure([], [
    makeProperty("test:hasCatalyst", [
      { value: "Catalytic Agent", language: "en", predicate: "rdfs:label" },
      { value: "Catalyst", language: "en", predicate: "skos:prefLabel" },
    ]),
  ]);

  const result = resolveLabel("test:hasCatalyst", closure);
  strictEqual(result.status, "resolved");
  if (result.status === "resolved") {
    strictEqual(result.label, "Catalyst");
    strictEqual(result.level, "skos:prefLabel");
  }
  pass('skos:prefLabel "Catalyst" overrides rdfs:label "Catalytic Agent"');
} catch (error) {
  fail("Labeling Law priority: skos:prefLabel should override rdfs:label", error);
}

// Verify each level falls through correctly
try {
  const closure = makeClosure([], [
    makeProperty("test:schemaOnly", [
      { value: "Schema Name", language: "en", predicate: "schema:name" },
    ]),
  ]);
  const result = resolveLabel("test:schemaOnly", closure);
  strictEqual(result.status, "resolved");
  if (result.status === "resolved") {
    strictEqual(result.label, "Schema Name");
    strictEqual(result.level, "schema:name");
  }
  pass("Level 3 (schema:name) resolves when Levels 1–2 absent");
} catch (error) {
  fail("Level 3 fallthrough", error);
}

// Level 6: IRI cleaning fallback
try {
  const closure = makeClosure([], [
    makeProperty("https://example.org/mfg/hasCatalyst", []),
  ]);
  const result = resolveLabel("https://example.org/mfg/hasCatalyst", closure);
  strictEqual(result.status, "resolved");
  if (result.status === "resolved") {
    strictEqual(result.label, "Has Catalyst");
    strictEqual(result.level, "iriCleaning");
  }
  pass("Level 6 (IRI cleaning) resolves when Levels 1–5 have no labels");
} catch (error) {
  fail("Level 6 IRI cleaning fallback", error);
}

// Level 6 failure: quality threshold
try {
  const closure = makeClosure([], [
    makeProperty("https://example.org/BFO_0000023", []),
  ]);
  const result = resolveLabel("https://example.org/BFO_0000023", closure);
  strictEqual(result.status, "exhausted");
  if (result.status === "exhausted") {
    strictEqual(result.reason, "noAlphabeticWord");
  }
  pass("Level 6 failure: BFO_0000023 exhausts labeling law");
} catch (error) {
  fail("Level 6 quality threshold failure", error);
}

// IRI not in closure at all — falls through to IRI cleaning
try {
  const closure = makeClosure();
  const result = resolveLabel("https://example.org/mfg/DistillationProcess", closure);
  strictEqual(result.status, "resolved");
  if (result.status === "resolved") {
    strictEqual(result.label, "Distillation Process");
    strictEqual(result.level, "iriCleaning");
  }
  pass("IRI not in closure → falls through to IRI cleaning");
} catch (error) {
  fail("IRI not in closure fallthrough", error);
}

// =========================================================================
// Language Preference Tests (RPM §30.3)
// =========================================================================

console.log("\n  --- Language Preference (§30.3) ---");

try {
  const annotations: LabelAnnotation[] = [
    { value: "Katalisator", language: "de", predicate: "rdfs:label" },
    { value: "Catalyst", language: "en", predicate: "rdfs:label" },
    { value: "Catalyseur", language: "fr", predicate: "rdfs:label" },
  ];
  const best = selectByLanguagePreference(annotations);
  strictEqual(best?.value, "Catalyst");
  pass("English label preferred over German and French");
} catch (error) {
  fail("English preference", error);
}

try {
  const annotations: LabelAnnotation[] = [
    { value: "Katalisator", language: "de", predicate: "rdfs:label" },
    { value: "Untagged Label", language: undefined, predicate: "rdfs:label" },
    { value: "Catalyseur", language: "fr", predicate: "rdfs:label" },
  ];
  const best = selectByLanguagePreference(annotations);
  strictEqual(best?.value, "Untagged Label");
  pass("No-language-tag label preferred when no English available");
} catch (error) {
  fail("No-language-tag preference", error);
}

try {
  const annotations: LabelAnnotation[] = [
    { value: "Katalisator", language: "de", predicate: "rdfs:label" },
    { value: "Catalyseur", language: "fr", predicate: "rdfs:label" },
  ];
  const best = selectByLanguagePreference(annotations);
  strictEqual(best?.value, "Katalisator");
  pass("Alphabetically first non-English tag wins (de < fr)");
} catch (error) {
  fail("Alphabetical language determinism", error);
}

try {
  const annotations: LabelAnnotation[] = [
    { value: "Catalyst Agent", language: "en", predicate: "rdfs:label" },
    { value: "Catalyst", language: "en", predicate: "rdfs:label" },
  ];
  const best = selectByLanguagePreference(annotations);
  strictEqual(best?.value, "Catalyst");
  pass("Shorter label preferred among same-language ties");
} catch (error) {
  fail("Shortest label tiebreaker", error);
}

// en-US should be treated as English
try {
  const annotations: LabelAnnotation[] = [
    { value: "Color", language: "en-US", predicate: "rdfs:label" },
    { value: "Farbe", language: "de", predicate: "rdfs:label" },
  ];
  const best = selectByLanguagePreference(annotations);
  strictEqual(best?.value, "Color");
  pass("en-US treated as English (en-* match)");
} catch (error) {
  fail("en-US as English", error);
}

// =========================================================================
// Hint Resolution Tests (RPM §30.6)
// =========================================================================

console.log("\n  --- Hint Resolution (§30.6) ---");

try {
  const closure = makeClosure([], [
    makeProperty("test:hasCatalyst", [], [
      { value: "The catalyst agent", language: "en", predicate: "rdfs:comment" },
      { value: "A catalyst definition", language: "en", predicate: "skos:definition" },
    ]),
  ]);
  const hint = resolveHint("test:hasCatalyst", closure);
  strictEqual(hint, "The catalyst agent");
  pass("rdfs:comment preferred over skos:definition");
} catch (error) {
  fail("Hint resolution priority", error);
}

try {
  const closure = makeClosure([], [
    makeProperty("test:hasCatalyst", [], [
      { value: "A catalyst definition", language: "en", predicate: "skos:definition" },
    ]),
  ]);
  const hint = resolveHint("test:hasCatalyst", closure);
  strictEqual(hint, "A catalyst definition");
  pass("skos:definition used when rdfs:comment absent");
} catch (error) {
  fail("Hint fallthrough to skos:definition", error);
}

try {
  const closure = makeClosure([], [
    makeProperty("test:noHints", [], []),
  ]);
  const hint = resolveHint("test:noHints", closure);
  strictEqual(hint, "");
  pass("Empty string returned when no hint source exists");
} catch (error) {
  fail("No hint → empty string", error);
}

// =========================================================================
// Auto-Grouping Tests (RPM §30.7)
// =========================================================================

console.log("\n  --- Auto-Grouping (§30.7) ---");

try {
  const closure = makeClosure([
    makeClass("mfg:ChemicalProcess", [
      { value: "Chemical Process", language: "en", predicate: "rdfs:label" },
    ], [], ["mfg:Process"]),
    makeClass("mfg:Process", [
      { value: "Process", language: "en", predicate: "rdfs:label" },
    ]),
  ]);
  const group = resolveGroup("mfg:ChemicalProcess", closure);
  strictEqual(group, "Process");
  pass("Group uses superclass label when non-top-level superclass exists");
} catch (error) {
  fail("Superclass grouping", error);
}

try {
  const closure = makeClosure([
    makeClass("mfg:ChemicalProcess", [
      { value: "Chemical Process", language: "en", predicate: "rdfs:label" },
    ], [], ["http://www.w3.org/2002/07/owl#Thing"]),
  ]);
  const group = resolveGroup("mfg:ChemicalProcess", closure);
  strictEqual(group, "Chemical Process");
  pass("Group falls back to class label when only superclass is owl:Thing");
} catch (error) {
  fail("owl:Thing superclass fallback", error);
}

try {
  const closure = makeClosure();
  const group = resolveGroup("https://example.org/mfg/UnknownClass", closure);
  strictEqual(group, "Unknown Class");
  pass('Unknown IRI grouped via IRI cleaning ("Unknown Class")');
} catch (error) {
  fail("Unknown class IRI cleaning group", error);
}

try {
  const closure = makeClosure();
  const group = resolveGroup("https://example.org/BFO_0000023", closure);
  strictEqual(group, "General");
  pass('Unlabelable IRI grouped as "General"');
} catch (error) {
  fail("Unlabelable IRI → General", error);
}

// =========================================================================
// extractLocalName Tests
// =========================================================================

console.log("\n  --- extractLocalName ---");

try {
  strictEqual(extractLocalName("http://example.org/ns#hasCatalyst"), "hasCatalyst");
  pass("Fragment extraction: ns#hasCatalyst → hasCatalyst");
} catch (error) {
  fail("Fragment extraction", error);
}

try {
  strictEqual(extractLocalName("http://example.org/mfg/hasCatalyst"), "hasCatalyst");
  pass("Path segment extraction: mfg/hasCatalyst → hasCatalyst");
} catch (error) {
  fail("Path segment extraction", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
