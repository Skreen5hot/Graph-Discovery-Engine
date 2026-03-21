/**
 * RPM_Expand — RPM v2.1 §4.1, §7
 *
 * The core expansion function. Takes an intent, subject, and context,
 * and produces a Canonical Graph Pattern (CGP) or an RPMError.
 *
 * Expansion steps per §7.1:
 * 1. Resolve mapping in the merged registry by shorthand
 * 2. Validate subject types via subsumption check against domainClasses
 * 3. Instantiate canonical root
 * 4. Expand pattern recursively
 * 5. Inject intermediate nodes (all intermediate entities explicit)
 * 6. Bind outputs per role labels
 * 7. Canonicalize: SHA-256 blank node IDs, normalize ordering, produce JSON-LD
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type {
  CGP,
  RPMError,
  RPMPartialCGP,
  ExpandResult,
  Subject,
  RPMContext,
  MappingDefinition,
  MappingRegistry,
  TypeResolver,
} from "./types.js";
import { expandPatternToCGP } from "./cgp-serializer.js";

// ---------------------------------------------------------------------------
// Stub TypeResolver (Phase 1 — exact match only)
// ---------------------------------------------------------------------------

/**
 * Stub TypeResolver for Phase 1 testing (RPM §10).
 *
 * Performs exact-match type checking only — no subsumption traversal.
 * Phase 2.2 replaces this with the real OWL/RDFS implementation that
 * walks the ontology closure's superclass chains.
 */
export const stubTypeResolver: TypeResolver = {
  isSubclassOf(subjectType: string, domainClass: string): boolean {
    return subjectType === domainClass;
  },
  subsumptionDistance(subjectType: string, domainClass: string): number {
    return subjectType === domainClass ? 0 : -1;
  },
};

// ---------------------------------------------------------------------------
// Mapping Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a mapping from the registry by shorthand (§7.1 Step 1).
 * Returns the mapping definition or null if not found.
 */
function resolveMapping(
  intent: string,
  registry: MappingRegistry,
): MappingDefinition | null {
  return registry.mappings.find((m) => m.shorthand === intent) ?? null;
}

// ---------------------------------------------------------------------------
// Subject Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the subject's types satisfy the mapping's domainClasses (§7.1 Step 2).
 *
 * Validation succeeds if at least one declared subject type is a subclass of
 * at least one declared domain class (any-match, RPM §5.4).
 */
function validateSubjectTypes(
  subject: Subject,
  mapping: MappingDefinition,
  typeResolver: TypeResolver,
): boolean {
  for (const subjectType of subject["@type"]) {
    for (const domainClass of mapping.domainClasses) {
      if (typeResolver.isSubclassOf(subjectType, domainClass)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Error Factory
// ---------------------------------------------------------------------------

function makeError(
  errorCode: RPMError["errorCode"],
  intent?: string,
  subject?: string,
  details?: string,
): RPMError {
  return {
    "@type": "rpm:RPMError",
    errorCode,
    intent,
    subject,
    details,
  };
}

// ---------------------------------------------------------------------------
// RPM_Expand
// ---------------------------------------------------------------------------

/**
 * Expand an intent into a Canonical Graph Pattern (RPM §4.1, §7).
 *
 * @param intent - The mapping shorthand to expand
 * @param subject - The subject entity
 * @param context - Runtime context with registry, closure, and optional TypeResolver
 * @returns CGP on success, RPMError on failure
 */
export function rpmExpand(
  intent: string,
  subject: Subject,
  context: RPMContext,
): ExpandResult {
  const typeResolver = context.typeResolver ?? stubTypeResolver;

  // Step 1: Resolve mapping
  const mapping = resolveMapping(intent, context.mappingRegistry);
  if (!mapping) {
    return makeError(
      "INTENT_NOT_FOUND",
      intent,
      subject["@id"],
      `No mapping found for shorthand "${intent}"`,
    );
  }

  // Step 2: Validate subject types
  if (!validateSubjectTypes(subject, mapping, typeResolver)) {
    return makeError(
      "SUBCLASS_VIOLATION",
      intent,
      subject["@id"],
      `Subject types [${subject["@type"].join(", ")}] do not satisfy domain classes [${mapping.domainClasses.join(", ")}]`,
    );
  }

  // Steps 3–7: Expand pattern, inject intermediates, bind outputs, canonicalize
  // All handled by expandPatternToCGP which walks the pattern, generates
  // deterministic IDs, normalizes ordering, and attaches provenance.
  const rulesApplied = [`expand:${intent}`];

  const cgp = expandPatternToCGP(
    subject,
    intent,
    mapping.shorthand,
    mapping.pattern,
    rulesApplied,
  );

  return cgp;
}
