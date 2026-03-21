/**
 * Control Inference Tests — CT-10
 *
 * CT-10: Control Inference Table Test (RPM §33.5)
 *
 * Plus unit tests for enumeration detection, ObjectProperty ICE mode,
 * unit inference, and full XSD mapping table coverage.
 */

import { strictEqual, deepStrictEqual, ok } from "node:assert";
import {
  inferControl,
  inferUnit,
  detectEnumeration,
  determineObjectPropertyVia,
} from "../src/kernel/control-inference.js";
import type {
  OntologyClosure,
  OntologyClass,
  OntologyProperty,
  TypeResolver,
  LabelAnnotation,
  EnumeratedIndividual,
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

function makeClass(
  iri: string,
  opts: {
    labels?: LabelAnnotation[];
    annotations?: LabelAnnotation[];
    superClasses?: string[];
    enumeratedIndividuals?: EnumeratedIndividual[];
  } = {},
): OntologyClass {
  return {
    iri,
    superClasses: opts.superClasses ?? [],
    labels: opts.labels ?? [],
    annotations: opts.annotations ?? [],
    enumeratedIndividuals: opts.enumeratedIndividuals,
  };
}

function makeProperty(
  iri: string,
  opts: {
    labels?: LabelAnnotation[];
    annotations?: LabelAnnotation[];
    range?: string[];
  } = {},
): OntologyProperty {
  return {
    iri,
    superProperties: [],
    domain: [],
    range: opts.range ?? [],
    labels: opts.labels ?? [],
    annotations: opts.annotations ?? [],
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

/** Stub TypeResolver: exact-match only, no subsumption traversal (Phase 1 stub). */
const stubTypeResolver: TypeResolver = {
  isSubclassOf(subjectType: string, domainClass: string): boolean {
    return subjectType === domainClass;
  },
  subsumptionDistance(subjectType: string, domainClass: string): number {
    return subjectType === domainClass ? 0 : -1;
  },
};

/** TypeResolver that recognizes skos:Concept subclass relationships. */
const iceTypeResolver: TypeResolver = {
  isSubclassOf(subjectType: string, domainClass: string): boolean {
    if (subjectType === domainClass) return true;
    // Simulate: test:MaterialType is a subclass of skos:Concept
    if (subjectType === "test:MaterialType" && domainClass === "skos:Concept") return true;
    return false;
  },
  subsumptionDistance(subjectType: string, domainClass: string): number {
    if (subjectType === domainClass) return 0;
    if (subjectType === "test:MaterialType" && domainClass === "skos:Concept") return 1;
    return -1;
  },
};

const emptyClosure = makeClosure();

// =========================================================================
// CT-10 — Control Inference Table Test (RPM §33.5)
// =========================================================================

console.log("\n  --- CT-10: Control Inference Table ---");

// Row 1: xsd:string → text, contains
try {
  const result = inferControl("xsd:string", "test:p", emptyClosure, stubTypeResolver);
  strictEqual(result.inputType, "text");
  ok(result.filterOp.includes("contains"), "filterOp must include 'contains'");
  strictEqual(result.inputTypeSource, "xsdMapping");
  pass('xsd:string → text, filterOp includes "contains"');
} catch (error) {
  fail("xsd:string", error);
}

// Row 2: xsd:decimal → number, gt/lt/range
try {
  const result = inferControl("xsd:decimal", "test:p", emptyClosure, stubTypeResolver);
  strictEqual(result.inputType, "number");
  ok(result.filterOp.includes("gt"), "filterOp must include 'gt'");
  ok(result.filterOp.includes("lt"), "filterOp must include 'lt'");
  ok(result.filterOp.includes("range"), "filterOp must include 'range'");
  strictEqual(result.inputTypeSource, "xsdMapping");
  pass('xsd:decimal → number, filterOp includes "gt", "lt", "range"');
} catch (error) {
  fail("xsd:decimal", error);
}

// Row 3: xsd:dateTime → date, range
try {
  const result = inferControl("xsd:dateTime", "test:p", emptyClosure, stubTypeResolver);
  strictEqual(result.inputType, "date");
  ok(result.filterOp.includes("range"), "filterOp must include 'range'");
  strictEqual(result.inputTypeSource, "xsdMapping");
  pass('xsd:dateTime → date, filterOp includes "range"');
} catch (error) {
  fail("xsd:dateTime", error);
}

// Row 4: xsd:boolean → boolean, eq only
try {
  const result = inferControl("xsd:boolean", "test:p", emptyClosure, stubTypeResolver);
  strictEqual(result.inputType, "boolean");
  deepStrictEqual(result.filterOp, ["eq"]);
  strictEqual(result.inputTypeSource, "xsdMapping");
  pass('xsd:boolean → boolean, filterOp = ["eq"] only');
} catch (error) {
  fail("xsd:boolean", error);
}

// Row 5: ObjectProperty (OWL class) → entitySearch, eq only
try {
  const closure = makeClosure([makeClass("test:Organization")]);
  const result = inferControl("test:Organization", "test:p", closure, stubTypeResolver);
  strictEqual(result.inputType, "entitySearch");
  deepStrictEqual(result.filterOp, ["eq"]);
  strictEqual(result.inputTypeSource, "rangeIsObjectProperty");
  pass('ObjectProperty (OWL class) → entitySearch, filterOp = ["eq"] only');
} catch (error) {
  fail("ObjectProperty", error);
}

// Row 6: No range declared → text, eq/contains
try {
  const result = inferControl(null, "test:p", emptyClosure, stubTypeResolver);
  strictEqual(result.inputType, "text");
  ok(result.filterOp.includes("eq"), "filterOp must include 'eq'");
  ok(result.filterOp.includes("contains"), "filterOp must include 'contains'");
  strictEqual(result.inputTypeSource, "noRangeFallback");
  pass('No range declared → text, filterOp includes "eq", "contains"');
} catch (error) {
  fail("No range declared", error);
}

// =========================================================================
// Extended XSD Mapping Table Coverage
// =========================================================================

console.log("\n  --- Extended XSD Mapping Coverage ---");

const extendedCases: Array<[string, string, string[]]> = [
  ["xsd:normalizedString", "text", ["eq", "contains", "startsWith"]],
  ["xsd:token",            "text", ["eq", "contains"]],
  ["xsd:integer",          "number", ["eq", "gt", "lt", "range"]],
  ["xsd:int",              "number", ["eq", "gt", "lt", "range"]],
  ["xsd:long",             "number", ["eq", "gt", "lt", "range"]],
  ["xsd:short",            "number", ["eq", "gt", "lt", "range"]],
  ["xsd:float",            "number", ["eq", "gt", "lt", "range"]],
  ["xsd:double",           "number", ["eq", "gt", "lt", "range"]],
  ["xsd:nonNegativeInteger","number", ["eq", "gt", "lt", "range"]],
  ["xsd:positiveInteger",  "number", ["eq", "gt", "lt", "range"]],
  ["xsd:date",             "date", ["eq", "gt", "lt", "range"]],
  ["xsd:time",             "text", ["eq"]],
  ["xsd:gYear",            "number", ["eq", "gt", "lt", "range"]],
  ["xsd:gYearMonth",       "text", ["eq", "contains"]],
  ["xsd:duration",         "text", ["eq"]],
  ["xsd:anyURI",           "text", ["eq", "contains"]],
  ["xsd:language",         "select", ["eq"]],
  ["rdfs:Literal",         "text", ["eq", "contains"]],
];

for (const [rangeType, expectedInputType, expectedFilterOps] of extendedCases) {
  try {
    const result = inferControl(rangeType, "test:p", emptyClosure, stubTypeResolver);
    strictEqual(result.inputType, expectedInputType);
    for (const op of expectedFilterOps) {
      ok(result.filterOp.includes(op as any), `filterOp must include '${op}'`);
    }
    strictEqual(result.via, "direct");
    pass(`${rangeType} → ${expectedInputType}`);
  } catch (error) {
    fail(`${rangeType}`, error);
  }
}

// =========================================================================
// §31.3 — Enumeration Detection
// =========================================================================

console.log("\n  --- Enumeration Detection (§31.3) ---");

// ObjectProperty with ≤20 owl:oneOf members → select
try {
  const closure = makeClosure([
    makeClass("test:Status", {
      enumeratedIndividuals: [
        { iri: "test:Active", label: "Active" },
        { iri: "test:Inactive", label: "Inactive" },
        { iri: "test:Pending", label: "Pending" },
      ],
    }),
  ]);
  const result = inferControl("test:Status", "test:p", closure, stubTypeResolver);
  strictEqual(result.inputType, "select");
  strictEqual(result.inputTypeSource, "enumerationDetected");
  strictEqual(result.selectOptions?.length, 3);
  strictEqual(result.selectOptions?.[0].label, "Active");
  pass("ObjectProperty with owl:oneOf (3 members) → select with 3 options");
} catch (error) {
  fail("Enumeration detection ≤20", error);
}

// ObjectProperty with >20 owl:oneOf members → entitySearch (falls back)
try {
  const individuals: EnumeratedIndividual[] = Array.from({ length: 21 }, (_, i) => ({
    iri: `test:Item${i}`,
    label: `Item ${i}`,
  }));
  const closure = makeClosure([
    makeClass("test:LargeEnum", { enumeratedIndividuals: individuals }),
  ]);
  const result = inferControl("test:LargeEnum", "test:p", closure, stubTypeResolver);
  strictEqual(result.inputType, "entitySearch");
  strictEqual(result.inputTypeSource, "rangeIsObjectProperty");
  pass("ObjectProperty with owl:oneOf (21 members) → entitySearch fallback");
} catch (error) {
  fail("Enumeration detection >20", error);
}

// xsd:token with enumeration → select override
try {
  const closure = makeClosure([
    makeClass("xsd:token", {
      enumeratedIndividuals: [
        { iri: "test:Small", label: "Small" },
        { iri: "test:Medium", label: "Medium" },
        { iri: "test:Large", label: "Large" },
      ],
    }),
  ]);
  const result = inferControl("xsd:token", "test:p", closure, stubTypeResolver);
  strictEqual(result.inputType, "select");
  strictEqual(result.inputTypeSource, "enumerationDetected");
  pass("xsd:token with owl:oneOf → select override");
} catch (error) {
  fail("xsd:token enumeration override", error);
}

// =========================================================================
// §31.4 — ObjectProperty Literal Mode (ICE)
// =========================================================================

console.log("\n  --- ObjectProperty Literal Mode (§31.4) ---");

// Range is skos:Concept subclass → via: "ice"
try {
  const closure = makeClosure([makeClass("test:MaterialType")]);
  const result = inferControl("test:MaterialType", "test:p", closure, iceTypeResolver);
  strictEqual(result.inputType, "entitySearch");
  strictEqual(result.via, "ice");
  pass("Range is skos:Concept subclass → via: 'ice'");
} catch (error) {
  fail("ICE detection", error);
}

// Range is not ICE subclass → via omitted
try {
  const closure = makeClosure([makeClass("test:Organization")]);
  const result = inferControl("test:Organization", "test:p", closure, stubTypeResolver);
  strictEqual(result.via, undefined);
  pass("Range is not ICE subclass → via omitted");
} catch (error) {
  fail("Non-ICE ObjectProperty", error);
}

// =========================================================================
// §31.5 — Unit Inference
// =========================================================================

console.log("\n  --- Unit Inference (§31.5) ---");

// qudt:unit annotation → resolved unit label
try {
  const closure = makeClosure(
    [makeClass("qudt:Kilogram", {
      labels: [{ value: "Kilogram", language: "en", predicate: "rdfs:label" }],
    })],
    [makeProperty("test:hasMass", {
      annotations: [{ value: "qudt:Kilogram", predicate: "qudt:unit", language: undefined }],
    })],
  );
  const result = inferControl("xsd:decimal", "test:hasMass", closure, stubTypeResolver);
  strictEqual(result.unit, "Kilogram");
  pass('qudt:unit → unit: "Kilogram"');
} catch (error) {
  fail("Unit inference via qudt:unit", error);
}

// rdfs:comment pattern "in kg" → unit: "kg"
try {
  const closure = makeClosure([], [
    makeProperty("test:weight", {
      annotations: [{ value: "Weight measured in kg", predicate: "rdfs:comment", language: "en" }],
    }),
  ]);
  const result = inferControl("xsd:decimal", "test:weight", closure, stubTypeResolver);
  strictEqual(result.unit, "kg");
  pass('rdfs:comment "in kg" → unit: "kg"');
} catch (error) {
  fail("Unit inference via comment pattern", error);
}

// No unit annotation → unit omitted
try {
  const closure = makeClosure([], [
    makeProperty("test:count", {
      annotations: [{ value: "How many items", predicate: "rdfs:comment", language: "en" }],
    }),
  ]);
  const result = inferControl("xsd:integer", "test:count", closure, stubTypeResolver);
  strictEqual(result.unit, undefined);
  pass("No unit annotation → unit omitted");
} catch (error) {
  fail("No unit", error);
}

// =========================================================================
// All XSD types produce via: "direct"
// =========================================================================

console.log("\n  --- All XSD types produce via: 'direct' ---");

try {
  const xsdTypes = [
    "xsd:string", "xsd:boolean", "xsd:integer", "xsd:decimal",
    "xsd:dateTime", "xsd:date", "xsd:gYear", "xsd:duration", "xsd:anyURI",
  ];
  for (const t of xsdTypes) {
    const result = inferControl(t, "test:p", emptyClosure, stubTypeResolver);
    strictEqual(result.via, "direct", `${t} should have via: "direct"`);
  }
  pass("All XSD types produce via: 'direct'");
} catch (error) {
  fail("XSD via check", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
