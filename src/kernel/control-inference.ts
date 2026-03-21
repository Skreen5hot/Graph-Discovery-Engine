/**
 * Control Inference — RPM v2.1 §31
 *
 * Normative mapping from a predicate's range type to a UI input component.
 * Given a range, deterministically selects inputType, filterOp defaults,
 * via (literal mode), and inputTypeSource.
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type {
  InputType,
  InputTypeSource,
  FilterOp,
  SelectOption,
  OntologyClosure,
  OntologyProperty,
  TypeResolver,
} from "./types.js";
import { resolveLabel } from "./labeling.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The result of Control Inference for a single predicate range. */
export interface ControlInferenceResult {
  inputType: InputType;
  inputTypeSource: InputTypeSource;
  filterOp: FilterOp[];
  via?: "direct" | "ice";
  selectOptions?: SelectOption[];
  unit?: string;
}

// ---------------------------------------------------------------------------
// §31.2 — XSD-to-UI Component Mapping Table
// ---------------------------------------------------------------------------

interface XSDMapping {
  inputType: InputType;
  filterOp: FilterOp[];
}

/**
 * The full 23-row XSD-to-UI mapping table (RPM §31.2).
 * Keys are the full XSD IRI or shorthand. Values are the inferred input config.
 */
const XSD_MAPPING_TABLE: ReadonlyMap<string, XSDMapping> = new Map([
  // String types
  ["xsd:string",           { inputType: "text",    filterOp: ["eq", "contains", "startsWith"] }],
  ["xsd:normalizedString", { inputType: "text",    filterOp: ["eq", "contains", "startsWith"] }],
  ["xsd:token",            { inputType: "text",    filterOp: ["eq", "contains"] }],

  // Boolean
  ["xsd:boolean",          { inputType: "boolean", filterOp: ["eq"] }],

  // Integer numeric types
  ["xsd:integer",            { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:int",                { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:long",               { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:short",              { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:nonNegativeInteger", { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:positiveInteger",    { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],

  // Decimal/float numeric types
  ["xsd:decimal", { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:float",   { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:double",  { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],

  // Date/time types
  ["xsd:dateTime", { inputType: "date", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:date",     { inputType: "date", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:time",     { inputType: "text", filterOp: ["eq"] }],

  // Year/month types
  ["xsd:gYear",      { inputType: "number", filterOp: ["eq", "gt", "lt", "range"] }],
  ["xsd:gYearMonth", { inputType: "text",   filterOp: ["eq", "contains"] }],

  // Other literal types
  ["xsd:duration", { inputType: "text",   filterOp: ["eq"] }],
  ["xsd:anyURI",   { inputType: "text",   filterOp: ["eq", "contains"] }],
  ["xsd:language", { inputType: "select", filterOp: ["eq"] }],

  // Untyped literal fallback
  ["rdfs:Literal", { inputType: "text", filterOp: ["eq", "contains"] }],
]);

/**
 * Known ICE superclasses for ObjectProperty literal mode detection (RPM §31.4).
 */
const ICE_SUPERCLASSES: ReadonlySet<string> = new Set([
  "skos:Concept",
  "http://www.w3.org/2004/02/skos/core#Concept",
  "skos:ConceptScheme",
  "http://www.w3.org/2004/02/skos/core#ConceptScheme",
]);

// ---------------------------------------------------------------------------
// §31.5 — Unit Inference
// ---------------------------------------------------------------------------

/** Known unit annotation predicates (RPM §31.5). */
const UNIT_PREDICATES: readonly string[] = [
  "qudt:unit",
  "qudt:applicableUnit",
  "om:unit",
];

/**
 * Patterns to extract unit from rdfs:comment text (RPM §31.5 Step 3).
 * Matches "in [unit]" or "unit: [unit]" patterns.
 */
const UNIT_COMMENT_PATTERNS: readonly RegExp[] = [
  /\bin\s+(\w+)\b/i,
  /\bunit:\s*(\w+)\b/i,
];

/**
 * Infer the unit-of-measure for a numeric predicate (RPM §31.5).
 * Returns the resolved unit label, or undefined if no unit found.
 */
export function inferUnit(
  predicateIri: string,
  closure: OntologyClosure,
): string | undefined {
  const prop = closure.properties.get(predicateIri);
  if (!prop) return undefined;

  // Step 1–2: Check for unit annotation predicates
  for (const unitPredicate of UNIT_PREDICATES) {
    const unitAnnotation = prop.annotations.find(
      (a) => a.predicate === unitPredicate,
    );
    if (unitAnnotation && unitAnnotation.value.trim().length > 0) {
      // The annotation value is a unit IRI — resolve its label
      const resolution = resolveLabel(unitAnnotation.value, closure);
      return resolution.status === "resolved" ? resolution.label : unitAnnotation.value;
    }
  }

  // Step 3: Pattern match in rdfs:comment
  const comment = prop.annotations.find((a) => a.predicate === "rdfs:comment");
  if (comment) {
    for (const pattern of UNIT_COMMENT_PATTERNS) {
      const match = comment.value.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// §31.3 — Enumeration Detection
// ---------------------------------------------------------------------------

/**
 * Check if a range class has an owl:oneOf enumeration and return select options
 * if the enumeration has ≤ 20 members (RPM §31.3).
 *
 * Returns the select options array, or null if not an enumeration or > 20 members.
 */
export function detectEnumeration(
  rangeClassIri: string,
  closure: OntologyClosure,
): SelectOption[] | null {
  const rangeClass = closure.classes.get(rangeClassIri);
  if (!rangeClass) return null;

  const individuals = rangeClass.enumeratedIndividuals;
  if (!individuals || individuals.length === 0) return null;

  // Maximum 20 options; fall back to entitySearch if exceeded (RPM §31.3)
  if (individuals.length > 20) return null;

  return individuals.map((ind) => ({
    value: ind.iri,
    label: ind.label,
  }));
}

// ---------------------------------------------------------------------------
// §31.4 — ObjectProperty Literal Mode
// ---------------------------------------------------------------------------

/**
 * Determine the literal mode for an ObjectProperty range (RPM §31.4).
 *
 * Returns "ice" if the range class is a subclass of skos:Concept,
 * skos:ConceptScheme, or any declared ICE class.
 * Returns undefined (via omitted) for standard edge → node → bind patterns.
 */
export function determineObjectPropertyVia(
  rangeClassIri: string,
  typeResolver: TypeResolver,
): "ice" | undefined {
  for (const iceClass of ICE_SUPERCLASSES) {
    if (typeResolver.isSubclassOf(rangeClassIri, iceClass)) {
      return "ice";
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// §31.2 — Main Inference Function
// ---------------------------------------------------------------------------

/**
 * Determine whether a range type IRI is an XSD/literal type or an ObjectProperty.
 * XSD types and rdfs:Literal are in the mapping table.
 * Everything else is treated as an ObjectProperty (OWL class range).
 */
function isXSDOrLiteralType(rangeType: string): boolean {
  return XSD_MAPPING_TABLE.has(rangeType);
}

/**
 * Infer the UI control configuration for a predicate based on its range type
 * (RPM §31.2).
 *
 * @param rangeType - The range type IRI (XSD type, OWL class, "rdfs:Literal", or null)
 * @param predicateIri - The predicate IRI (for unit inference)
 * @param closure - The ontology closure (for enumeration detection and unit inference)
 * @param typeResolver - For ICE subclass checking
 * @returns The inferred control configuration
 */
export function inferControl(
  rangeType: string | null,
  predicateIri: string,
  closure: OntologyClosure,
  typeResolver: TypeResolver,
): ControlInferenceResult {
  // No range declared — ultimate fallback (RPM §31.2 last row)
  if (rangeType === null || rangeType === undefined) {
    return {
      inputType: "text",
      inputTypeSource: "noRangeFallback",
      filterOp: ["eq", "contains"],
      via: "direct",
    };
  }

  // Check XSD/literal mapping table
  const xsdMapping = XSD_MAPPING_TABLE.get(rangeType);
  if (xsdMapping) {
    const result: ControlInferenceResult = {
      inputType: xsdMapping.inputType,
      inputTypeSource: "xsdMapping",
      filterOp: [...xsdMapping.filterOp],
      via: "direct",
    };

    // §31.3: Enumeration detection for xsd:token
    if (rangeType === "xsd:token") {
      const enumOptions = detectEnumeration(rangeType, closure);
      if (enumOptions) {
        result.inputType = "select";
        result.inputTypeSource = "enumerationDetected";
        result.filterOp = ["eq"];
        result.selectOptions = enumOptions;
      }
    }

    // §31.5: Unit inference for number types
    if (result.inputType === "number") {
      const unit = inferUnit(predicateIri, closure);
      if (unit) {
        result.unit = unit;
      }
    }

    return result;
  }

  // ObjectProperty (OWL class range) — RPM §31.2 row 21
  // §31.3: Check enumeration detection first
  const enumOptions = detectEnumeration(rangeType, closure);
  if (enumOptions) {
    return {
      inputType: "select",
      inputTypeSource: "enumerationDetected",
      filterOp: ["eq"],
      selectOptions: enumOptions,
    };
  }

  // §31.4: Determine via (ICE vs standard path)
  const via = determineObjectPropertyVia(rangeType, typeResolver);

  return {
    inputType: "entitySearch",
    inputTypeSource: "rangeIsObjectProperty",
    filterOp: ["eq"],
    via,
  };
}
