/**
 * Labeling Law — RPM v2.1 §30
 *
 * Normative algorithm for resolving plain-language labels from ontology
 * and graph metadata. Every function is named, pure, and deterministic.
 *
 * No I/O. No network. No non-deterministic APIs.
 */

import type {
  LabelAnnotation,
  LabelingLawLevel,
  LabelResolution,
  QualityThresholdFailureReason,
  OntologyClosure,
  OntologyClass,
  OntologyProperty,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The ordered label predicate priority hierarchy (RPM §30.2 Levels 1–5).
 * Level 6 (IRI cleaning) is handled separately.
 */
const LABEL_PREDICATES: readonly LabelingLawLevel[] = [
  "skos:prefLabel",
  "rdfs:label",
  "schema:name",
  "dc:title",
  "foaf:name",
];

/**
 * Known ontology namespace acronym prefixes (RPM §30.5 Rules 1 and 3).
 * Used for the secondary condition in Rule 1 and for Rule 3 collision check.
 * Stored uppercase for case-insensitive comparison.
 */
const NAMESPACE_PREFIXES: ReadonlySet<string> = new Set([
  "BFO", "CCO", "OWL", "RDF", "RDFS", "SKOS", "XSD", "DC", "FOAF", "XML",
]);

/**
 * Hint predicate priority order (RPM §30.6).
 */
const HINT_PREDICATES: readonly string[] = [
  "rdfs:comment",
  "skos:definition",
  "skos:scopeNote",
];

// ---------------------------------------------------------------------------
// §30.4 — IRI Local Name Cleaning Algorithm
// ---------------------------------------------------------------------------

/**
 * Extract the local name from an IRI (RPM §30.4 Step 1).
 * If IRI contains `#`, take the fragment. Otherwise take the last path segment.
 */
export function extractLocalName(iri: string): string {
  const hashIndex = iri.lastIndexOf("#");
  if (hashIndex !== -1) {
    return iri.substring(hashIndex + 1);
  }
  const slashIndex = iri.lastIndexOf("/");
  if (slashIndex !== -1) {
    return iri.substring(slashIndex + 1);
  }
  return iri;
}

/**
 * Clean an IRI local name into a plain-language label (RPM §30.4).
 *
 * Steps:
 * 1. Extract local name (done by caller or extractLocalName)
 * 2. Replace underscores and hyphens with spaces
 * 3. CamelCase split: space before uppercase preceded by lowercase or digit
 * 4. Acronym boundary: space before uppercase after 2+ consecutive uppercase
 * 5. Trim and collapse whitespace
 * 6. Title case: capitalize first letter of each word, preserve existing uppercase
 */
export function cleanLocalName(localName: string): string {
  // Step 2: Replace underscores and hyphens with single space
  let result = localName.replace(/[_-]/g, " ");

  // Step 3: CamelCase split — space before uppercase preceded by lowercase letter.
  // hasCatalyst → has Catalyst
  // Note: RPM §30.4 says "lowercase letter or digit" but normative test output
  // for VALVE_3B → "Valve 3B" (CT-09 Part B) proves digit-to-uppercase splits
  // must NOT fire. We restrict to lowercase-to-uppercase only.
  result = result.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Step 4: Acronym boundary — space before uppercase that follows 2+ uppercase
  // CCOPerson → CCO Person, hasBFORole → has BFO Role
  result = result.replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2");

  // Step 5: Trim and collapse whitespace
  result = result.replace(/\s+/g, " ").trim();

  // Step 6: Title case — capitalize first letter of each word.
  // "Do not lowercase letters that were already uppercase (preserves acronyms)"
  // means: short all-uppercase tokens (≤3 chars, all alpha) are recognized as
  // acronyms and preserved. Longer words get standard title case (first upper,
  // rest lower). Non-alpha-leading tokens (e.g. "3B") are left unchanged.
  result = result
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      // Non-alpha-leading tokens (e.g. "01", "3B") — leave unchanged
      if (!/^[A-Za-z]/.test(word)) return word;
      // Short all-uppercase tokens are acronyms — preserve (CCO, BFO, ID)
      if (word.length <= 3 && /^[A-Z]+$/.test(word)) return word;
      // Standard title case: first letter upper, rest lower
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  return result;
}

// ---------------------------------------------------------------------------
// §30.5 — Minimum Quality Threshold
// ---------------------------------------------------------------------------

/**
 * Evaluate the minimum quality threshold on a cleaned label (RPM §30.5).
 *
 * Returns null if the label passes, or the failure reason if it fails.
 * All three rules are evaluated independently; failing any one triggers failure.
 */
export function evaluateQualityThreshold(
  cleanedLabel: string,
): QualityThresholdFailureReason | null {
  // Rule 2 — Too short: fewer than 2 characters after cleaning
  if (cleanedLabel.length < 2) {
    return "tooShort";
  }

  // Rule 3 — Namespace prefix collision: entire cleaned result matches a known prefix
  if (NAMESPACE_PREFIXES.has(cleanedLabel.toUpperCase())) {
    return "namespacePrefixCollision";
  }

  // Rule 1 — Insufficient alphabetic word content (two-part check)
  const alphaMatches = cleanedLabel.match(/[A-Za-z]{2,}/g);

  // Base condition: at least one sequence of 2+ consecutive alpha characters
  if (!alphaMatches || alphaMatches.length === 0) {
    return "noAlphabeticWord";
  }

  // Secondary condition: if every alpha sequence of 2+ chars is a known namespace
  // prefix AND all remaining non-space characters are digits, Rule 1 triggers.
  // This catches "BFO 0000023" while passing "Tank 01" and "ID 4421".
  const allMatchesAreNamespacePrefixes = alphaMatches.every((match) =>
    NAMESPACE_PREFIXES.has(match.toUpperCase()),
  );

  if (allMatchesAreNamespacePrefixes) {
    // Check if non-space, non-prefix-match characters are all digits
    let remainder = cleanedLabel;
    for (const match of alphaMatches) {
      remainder = remainder.replace(match, "");
    }
    remainder = remainder.replace(/\s/g, "");
    const remainderIsAllDigits = remainder.length === 0 || /^\d+$/.test(remainder);

    if (remainderIsAllDigits) {
      return "noAlphabeticWord";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// §30.3 — Language Preference
// ---------------------------------------------------------------------------

/**
 * Select the best label from a set of annotations at the same priority level,
 * applying language preference rules (RPM §30.3).
 *
 * Priority:
 * 1. Language tag `en` or `en-*`
 * 2. No language tag
 * 3. Alphabetically first non-English language tag (determinism)
 * 4. Among equals, prefer shortest
 */
export function selectByLanguagePreference(
  annotations: readonly LabelAnnotation[],
): LabelAnnotation | null {
  if (annotations.length === 0) return null;

  const sorted = [...annotations].sort((a, b) => {
    const aRank = languageRank(a.language);
    const bRank = languageRank(b.language);
    if (aRank !== bRank) return aRank - bRank;

    // Same rank — compare language tags alphabetically for determinism
    const aLang = a.language ?? "";
    const bLang = b.language ?? "";
    if (aLang !== bLang) return aLang.localeCompare(bLang);

    // Same language — prefer shortest
    return a.value.length - b.value.length;
  });

  return sorted[0] ?? null;
}

/**
 * Assign a numeric rank to a language tag for sorting (lower = preferred).
 */
function languageRank(language: string | undefined): number {
  if (language === undefined || language === "") return 1; // No tag — rank 2nd
  const lower = language.toLowerCase();
  if (lower === "en" || lower.startsWith("en-")) return 0; // English — rank 1st
  return 2; // Other languages — rank 3rd
}

// ---------------------------------------------------------------------------
// §30.2 — Label Resolution (Priority Hierarchy)
// ---------------------------------------------------------------------------

/**
 * Look up an ontology entry (class or property) by IRI.
 * Returns the entry from whichever map contains it.
 */
function lookupEntry(
  iri: string,
  closure: OntologyClosure,
): OntologyClass | OntologyProperty | undefined {
  return closure.classes.get(iri) ?? closure.properties.get(iri);
}

/**
 * Resolve a plain-language label for an IRI using the Labeling Law (RPM §30.2).
 *
 * Walks the six-level priority hierarchy. Returns a discriminated union:
 * - `{ status: "resolved", ... }` on success
 * - `{ status: "exhausted", ... }` on failure (quality threshold failed)
 *
 * Pure function: no I/O, no side effects.
 */
export function resolveLabel(
  iri: string,
  closure: OntologyClosure,
): LabelResolution {
  const entry = lookupEntry(iri, closure);

  // Levels 1–5: check label annotations in priority order
  if (entry) {
    for (const level of LABEL_PREDICATES) {
      const candidates = entry.labels.filter((a) => a.predicate === level);
      if (candidates.length > 0) {
        const best = selectByLanguagePreference(candidates);
        if (best && best.value.trim().length > 0) {
          return {
            status: "resolved",
            iri,
            label: best.value.trim(),
            level,
            language: best.language,
          };
        }
      }
    }
  }

  // Level 6: IRI local name cleaning
  const localName = extractLocalName(iri);
  const cleanedLabel = cleanLocalName(localName);
  const failureReason = evaluateQualityThreshold(cleanedLabel);

  if (failureReason === null) {
    return {
      status: "resolved",
      iri,
      label: cleanedLabel,
      level: "iriCleaning",
    };
  }

  return {
    status: "exhausted",
    iri,
    reason: failureReason,
  };
}

// ---------------------------------------------------------------------------
// §30.6 — Hint Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a hint (helper text) for a predicate IRI (RPM §30.6).
 *
 * Priority: rdfs:comment → skos:definition → skos:scopeNote → empty string.
 * Language preference from §30.3 applies.
 * Returns empty string if no hint source exists — absence is preferable
 * to a synthetic hint.
 */
/** Result of hint resolution with source predicate tracking. */
export interface HintResolution {
  value: string;
  source?: string;
}

/**
 * Resolve a hint with source predicate tracking (RPM §30.6).
 * Returns both the hint value and which predicate resolved it.
 */
export function resolveHintWithSource(
  iri: string,
  closure: OntologyClosure,
): HintResolution {
  const entry = lookupEntry(iri, closure);
  if (!entry) return { value: "" };

  for (const predicate of HINT_PREDICATES) {
    const candidates = entry.annotations.filter((a) => a.predicate === predicate);
    if (candidates.length > 0) {
      const best = selectByLanguagePreference(candidates);
      if (best && best.value.trim().length > 0) {
        return { value: best.value.trim(), source: predicate };
      }
    }
  }

  return { value: "" };
}

/**
 * Resolve a hint (helper text) for a predicate IRI (RPM §30.6).
 *
 * Priority: rdfs:comment → skos:definition → skos:scopeNote → empty string.
 * Language preference from §30.3 applies.
 * Returns empty string if no hint source exists — absence is preferable
 * to a synthetic hint.
 */
export function resolveHint(
  iri: string,
  closure: OntologyClosure,
): string {
  return resolveHintWithSource(iri, closure).value;
}

// ---------------------------------------------------------------------------
// §30.7 — Auto-Grouping Algorithm
// ---------------------------------------------------------------------------

/** Sentinel IRIs that should not be used as group names (RPM §30.7 Step 4). */
const TOP_LEVEL_CLASSES: ReadonlySet<string> = new Set([
  "owl:Thing",
  "http://www.w3.org/2002/07/owl#Thing",
  "rdf:Resource",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#Resource",
]);

/**
 * Resolve the group name for a mapping given its first domain class (RPM §30.7).
 *
 * Steps:
 * 1. Take the first domainClass IRI
 * 2. Apply Labeling Law to get the group name
 * 3. If domain class has a non-top-level superclass, use superclass label instead
 *    (up to one level of hierarchy, max two levels deep)
 * 4. If no group can be derived, return "General"
 */
export function resolveGroup(
  domainClassIri: string,
  closure: OntologyClosure,
): string {
  const classEntry = closure.classes.get(domainClassIri);
  if (!classEntry) {
    // No class entry — try labeling the IRI directly
    const resolution = resolveLabel(domainClassIri, closure);
    return resolution.status === "resolved" ? resolution.label : "General";
  }

  // Step 4: Check for a non-top-level superclass (one level up)
  const nonTopSuperclass = classEntry.superClasses.find(
    (sc) => !TOP_LEVEL_CLASSES.has(sc),
  );

  if (nonTopSuperclass) {
    const superResolution = resolveLabel(nonTopSuperclass, closure);
    if (superResolution.status === "resolved") {
      return superResolution.label;
    }
  }

  // Fall back to the domain class label itself
  const resolution = resolveLabel(domainClassIri, closure);
  return resolution.status === "resolved" ? resolution.label : "General";
}
