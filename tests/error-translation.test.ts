/**
 * Error Translation Tests — CT-12
 *
 * CT-12: Dynamic Error Template Test (RPM §33.7)
 * Verifies that the Dynamic Template Engine correctly injects discovered
 * labels into error message templates and that no prohibited terms appear.
 *
 * Plus unit tests for all 11 error templates, token fallbacks, prohibited
 * term detection, and buildTranslationContext.
 */

import { strictEqual, ok } from "node:assert";
import {
  translateError,
  buildTranslationContext,
  containsProhibitedTerm,
} from "../src/kernel/error-translation.js";
import type { RPMError, RPMErrorCode, UIBlock } from "../src/kernel/types.js";

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

function makeError(errorCode: RPMErrorCode, clauseIndex: number = 0): RPMError {
  return {
    "@type": "rpm:RPMError",
    errorCode,
    intent: "test:hasCatalyst",
    subject: "ex:SomeOtherThing",
    clauseIndex,
  };
}

// =========================================================================
// CT-12 — Dynamic Error Template Test (RPM §33.7)
// =========================================================================

console.log("\n  --- CT-12: Dynamic Error Template ---");

// CT-12 Setup: discovered mapping with specific labels
const ct12Context = {
  subjectLabel: "Chemical Process",
  intentLabel: "Has Catalyst",
  domainLabel: "Chemical Process",
  fieldLabel: "Catalyst",
};

try {
  const error = makeError("SUBCLASS_VIOLATION");
  const translated = translateError(error, ct12Context);

  // Severity and placement
  strictEqual(translated.severity, "validation");
  strictEqual(translated.placement, "inline");
  strictEqual(translated.clauseIndex, 0);

  // userMessage must contain the injected labels
  ok(translated.userMessage.includes("Chemical Process"),
    'userMessage must contain "Chemical Process"');
  ok(translated.userMessage.includes("Has Catalyst"),
    'userMessage must contain "Has Catalyst"');

  // userMessage must NOT contain any prohibited terms
  ok(!translated.userMessage.includes("SUBCLASS_VIOLATION"),
    "userMessage must not contain raw error code");
  ok(!translated.userMessage.includes("test:hasCatalyst"),
    "userMessage must not contain IRI");
  ok(!containsProhibitedTerm(translated.userMessage),
    "userMessage must pass prohibited term scan");

  pass("CT-12: SUBCLASS_VIOLATION translated with correct labels, no prohibited terms");
} catch (error) {
  fail("CT-12 SUBCLASS_VIOLATION", error);
}

// =========================================================================
// All 11 Error Templates — Completeness
// =========================================================================

console.log("\n  --- All 11 Error Templates ---");

const allCodes: RPMErrorCode[] = [
  "INTENT_NOT_FOUND",
  "SUBCLASS_VIOLATION",
  "ONTOLOGY_TERM_UNRESOLVED",
  "MAPPING_CONSTRAINT_VIOLATION",
  "INVALID_PATTERN",
  "DETERMINISTIC_ID_COLLISION",
  "PARTIAL_RESOLUTION_DISABLED",
  "COMPOSITION_ANCHOR_MISSING",
  "COMPOSITION_CHAIN_BROKEN",
  "CRAWL_ENDPOINT_UNREACHABLE",
  "LABELING_LAW_EXHAUSTED",
];

for (const code of allCodes) {
  try {
    const error = makeError(code);
    const translated = translateError(error, ct12Context);
    strictEqual(translated["@type"], "rpm:TranslatedError");
    ok(translated.userMessage.length > 0, `${code} must produce non-empty userMessage`);
    ok(translated.severity === "validation" || translated.severity === "system",
      `${code} must have valid severity`);
    ok(translated.placement === "inline" || translated.placement === "banner",
      `${code} must have valid placement`);
    ok(!containsProhibitedTerm(translated.userMessage),
      `${code} userMessage must not contain prohibited terms`);
    pass(`${code} → valid TranslatedError, no prohibited terms`);
  } catch (error) {
    fail(`Template: ${code}`, error);
  }
}

// =========================================================================
// Severity and Placement Classification
// =========================================================================

console.log("\n  --- Severity/Placement Classification ---");

const validationCodes: RPMErrorCode[] = ["SUBCLASS_VIOLATION", "MAPPING_CONSTRAINT_VIOLATION"];
const systemCodes: RPMErrorCode[] = [
  "INTENT_NOT_FOUND", "ONTOLOGY_TERM_UNRESOLVED", "INVALID_PATTERN",
  "DETERMINISTIC_ID_COLLISION", "PARTIAL_RESOLUTION_DISABLED",
  "COMPOSITION_ANCHOR_MISSING", "COMPOSITION_CHAIN_BROKEN",
  "CRAWL_ENDPOINT_UNREACHABLE", "LABELING_LAW_EXHAUSTED",
];

try {
  for (const code of validationCodes) {
    const t = translateError(makeError(code), ct12Context);
    strictEqual(t.severity, "validation", `${code} must be validation`);
    strictEqual(t.placement, "inline", `${code} must be inline`);
  }
  pass("Validation errors: severity=validation, placement=inline");
} catch (error) {
  fail("Validation classification", error);
}

try {
  for (const code of systemCodes) {
    const t = translateError(makeError(code), ct12Context);
    strictEqual(t.severity, "system", `${code} must be system`);
    strictEqual(t.placement, "banner", `${code} must be banner`);
  }
  pass("System errors: severity=system, placement=banner");
} catch (error) {
  fail("System classification", error);
}

// =========================================================================
// Token Injection
// =========================================================================

console.log("\n  --- Token Injection ---");

try {
  const t = translateError(makeError("SUBCLASS_VIOLATION"), {
    subjectLabel: "Person",
    intentLabel: "Employed By",
    domainLabel: "Employee",
  });
  ok(t.userMessage.includes("Person"));
  ok(t.userMessage.includes("Employed By"));
  ok(t.userMessage.includes("Employee"));
  pass("SUBCLASS_VIOLATION injects subjectLabel, intentLabel, domainLabel");
} catch (error) {
  fail("Token injection", error);
}

try {
  const t = translateError(makeError("MAPPING_CONSTRAINT_VIOLATION"), {
    fieldLabel: "Employer",
    intentLabel: "Employment",
  });
  ok(t.userMessage.includes("Employer"));
  ok(t.userMessage.includes("Employment"));
  pass("MAPPING_CONSTRAINT_VIOLATION injects fieldLabel and intentLabel");
} catch (error) {
  fail("Field token injection", error);
}

try {
  const t = translateError(makeError("COMPOSITION_ANCHOR_MISSING"), {
    intentLabel: "Has Catalyst",
    intentLabel2: "Employed By",
  });
  ok(t.userMessage.includes("Has Catalyst"));
  ok(t.userMessage.includes("Employed By"));
  pass("COMPOSITION_ANCHOR_MISSING injects intentLabel and intentLabel2");
} catch (error) {
  fail("IntentLabel2 injection", error);
}

// =========================================================================
// Token Fallbacks (RPM §25.2)
// =========================================================================

console.log("\n  --- Token Fallbacks ---");

try {
  // Empty context — all tokens should use fallbacks
  const t = translateError(makeError("SUBCLASS_VIOLATION"), {});
  ok(t.userMessage.includes("this record type"), 'Missing subjectLabel → "this record type"');
  ok(t.userMessage.includes("this search"), 'Missing intentLabel → "this search"');
  ok(!containsProhibitedTerm(t.userMessage));
  pass("Missing tokens produce safe fallbacks, no prohibited terms");
} catch (error) {
  fail("Token fallbacks", error);
}

try {
  // No context at all
  const t = translateError(makeError("MAPPING_CONSTRAINT_VIOLATION"));
  ok(t.userMessage.includes("this field"), 'Missing fieldLabel → "this field"');
  pass("Undefined context produces safe fallbacks");
} catch (error) {
  fail("Undefined context fallback", error);
}

// =========================================================================
// clauseIndex Passthrough
// =========================================================================

console.log("\n  --- clauseIndex ---");

try {
  const error = makeError("SUBCLASS_VIOLATION", 3);
  const t = translateError(error, ct12Context);
  strictEqual(t.clauseIndex, 3);
  pass("clauseIndex passes through from RPMError to TranslatedError");
} catch (error) {
  fail("clauseIndex passthrough", error);
}

try {
  const noClauseError: RPMError = {
    "@type": "rpm:RPMError",
    errorCode: "INTENT_NOT_FOUND",
  };
  const t = translateError(noClauseError);
  strictEqual(t.clauseIndex, 0, "Missing clauseIndex defaults to 0");
  pass("Missing clauseIndex defaults to 0");
} catch (error) {
  fail("clauseIndex default", error);
}

// =========================================================================
// buildTranslationContext
// =========================================================================

console.log("\n  --- buildTranslationContext ---");

try {
  const ui: UIBlock = {
    label: "Has Catalyst",
    description: "The catalyst agent",
    group: "Chemical Process",
    examples: [],
    subjectLabel: "Chemical Process",
    inputParameters: [{ id: "f1", role: "target", label: "Catalyst", hint: "", inputType: "entitySearch", inputTypeSource: "rangeIsObjectProperty", required: false, filterOp: ["eq"] }],
    outputBinds: [],
  };
  const ctx = buildTranslationContext(ui, { domainLabel: "Process", fieldLabel: "Catalyst" });
  strictEqual(ctx.subjectLabel, "Chemical Process");
  strictEqual(ctx.intentLabel, "Has Catalyst");
  strictEqual(ctx.domainLabel, "Process");
  strictEqual(ctx.fieldLabel, "Catalyst");
  pass("buildTranslationContext extracts labels from UIBlock");
} catch (error) {
  fail("buildTranslationContext", error);
}

// =========================================================================
// containsProhibitedTerm
// =========================================================================

console.log("\n  --- containsProhibitedTerm ---");

try {
  ok(containsProhibitedTerm("The IRI https://example.org/foo is visible"));
  pass("Detects full IRI");
} catch (error) {
  fail("Full IRI detection", error);
}

try {
  ok(containsProhibitedTerm("The cco:Person type is visible"));
  pass("Detects prefixed name");
} catch (error) {
  fail("Prefixed name detection", error);
}

try {
  ok(containsProhibitedTerm("Node _:b1234567890abcdef is visible"));
  pass("Detects blank node ID");
} catch (error) {
  fail("Blank node detection", error);
}

try {
  ok(containsProhibitedTerm("Error SUBCLASS_VIOLATION occurred"));
  pass("Detects raw error code");
} catch (error) {
  fail("Error code detection", error);
}

try {
  ok(containsProhibitedTerm("The labelSource field is exposed"));
  pass("Detects internal field name");
} catch (error) {
  fail("Internal field detection", error);
}

try {
  ok(!containsProhibitedTerm("The Chemical Process record cannot use 'Has Catalyst'."));
  pass("Clean SME message passes");
} catch (error) {
  fail("Clean message", error);
}

try {
  ok(!containsProhibitedTerm("Please contact your system administrator."));
  pass("System message passes");
} catch (error) {
  fail("System message", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
