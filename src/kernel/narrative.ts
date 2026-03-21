/**
 * Narrative Synthesis Layer — RPM v2.1 §34
 *
 * Transforms a resolved CGP into a plain-language path summary.
 * Produces NarrativeResult with narrativeSummary and narrativePath.
 *
 * The Narrative Generator is subject to the same Firewall constraints
 * as all other SME-facing output — no IRIs, no predicate names,
 * no class names, no blank node IDs, no namespace prefixes.
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 * Performance budget: ≤ 5ms per row (Phase 1.8 acceptance criteria).
 */

import type {
  CGP,
  NarrativeResult,
  NarrativePathEntry,
  NarrativeRole,
  UIBlock,
  MappingTier,
  OntologyClosure,
  BranchStep,
  PatternStep,
} from "./types.js";
import { resolveLabel } from "./labeling.js";
import { cleanLocalName, extractLocalName, evaluateQualityThreshold } from "./labeling.js";
import { containsProhibitedTerm } from "./error-translation.js";

// ---------------------------------------------------------------------------
// §34.3 Step 1 & 3 — Label Resolution for Narrative
// ---------------------------------------------------------------------------

/**
 * Resolve a display label for an entity in the narrative (§34.3 Steps 1 & 3).
 *
 * Priority:
 * 1. Entity's label from the ontology closure (Labeling Law Levels 1–5)
 * 2. Entity's @id local name cleaned via IRI cleaning (Level 6)
 * 3. Class-level fallback from the UI block
 *
 * @param entityId - The entity's @id (may be an IRI or blank node)
 * @param closure - The ontology closure for label lookup
 * @param classLevelFallback - The ui.subjectLabel or ui.outputBinds[n].label
 * @returns A plain-language label, never an IRI or blank node ID
 */
export function resolveEntityLabel(
  entityId: string,
  closure: OntologyClosure,
  classLevelFallback: string,
): string {
  // Blank node IDs cannot be cleaned or looked up — use class fallback immediately
  if (entityId.startsWith("_:")) {
    return classLevelFallback || "this item";
  }

  // Try Labeling Law (Levels 1–6: annotation lookup then IRI cleaning)
  const resolution = resolveLabel(entityId, closure);
  if (resolution.status === "resolved") {
    return resolution.label;
  }

  // All resolution paths exhausted — class-level fallback
  return classLevelFallback || "this item";
}

// ---------------------------------------------------------------------------
// §34.3 Step 2 — Predicate Verb Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a mapping's ui.label into a verb phrase for the narrative (§34.3 Step 2).
 *
 * Three named rules + fallback — best-effort, not linguistically perfect:
 * 1. "Has X" → "has" (e.g., "Has Catalyst" → "has catalyst")
 * 2. "Employed by" / "X by" → "is [label in lowercase]"
 * 3. "Is X" → lowercase as-is (e.g., "Is Member Of" → "is member of")
 * 4. Everything else → "is linked to via [label]" (fallback)
 */
export function convertToVerbPhrase(uiLabel: string): string {
  const trimmed = uiLabel.trim();
  if (trimmed.length === 0) return "is linked to";

  // Rule 1: "Has X" → "has [rest in lowercase]"
  if (/^Has\b/i.test(trimmed)) {
    const rest = trimmed.substring(3).trim().toLowerCase();
    return rest.length > 0 ? `has ${rest}` : "has";
  }

  // Rule 2: "X by" pattern → "is [label in lowercase]"
  if (/\bby$/i.test(trimmed)) {
    return `is ${trimmed.toLowerCase()}`;
  }

  // Rule 3: "Is X" → lowercase as-is
  if (/^Is\b/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Rule 4: Fallback — noun phrase introduced by "is linked to via"
  return `is linked to via ${trimmed.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// §34.3 Step 4 — Summary Sentence Composition
// ---------------------------------------------------------------------------

/**
 * Compose the narrative summary sentence (§34.3 Step 4).
 *
 * Tier 1: "{SubjectLabel} {predicateVerb} {ObjectLabel}."
 * Tier 2/3: "{SubjectLabel} {predicateVerb} {ObjectLabel} via {anchorLabel}."
 *
 * The "via {anchorLabel}" clause is omitted if the anchor label is identical
 * to the predicate verb (§34.3 Step 4 final paragraph).
 */
export function composeSummary(
  subjectLabel: string,
  predicateVerb: string,
  objectLabel: string,
  tier: MappingTier,
  anchorLabel?: string,
): string {
  if (tier === 1 || !anchorLabel) {
    return `${subjectLabel} ${predicateVerb} ${objectLabel}.`;
  }

  // Omit "via" clause if anchor label matches predicate verb
  if (anchorLabel.toLowerCase() === predicateVerb.toLowerCase()) {
    return `${subjectLabel} ${predicateVerb} ${objectLabel}.`;
  }

  return `${subjectLabel} ${predicateVerb} ${objectLabel} via ${anchorLabel}.`;
}

// ---------------------------------------------------------------------------
// §34.3 Step 5 — narrativePath Assembly
// ---------------------------------------------------------------------------

/**
 * Build the narrativePath from a pattern's steps and resolved labels (§34.3 Step 5).
 *
 * For each step in the CGP walk order:
 * - Edge steps: { role: "predicate", label: resolved predicate label }
 * - Node steps: { role: "intermediate", label: resolved node class label }
 * - Bind steps: { role: "object", label: resolved bound node label }
 *
 * The subject entry is prepended by the caller.
 */
export function buildNarrativePath(
  steps: readonly PatternStep[],
  closure: OntologyClosure,
  objectLabel: string,
): NarrativePathEntry[] {
  const path: NarrativePathEntry[] = [];

  for (const step of steps) {
    switch (step.type) {
      case "edge": {
        const resolution = resolveLabel(step.predicate, closure);
        const label = resolution.status === "resolved" ? resolution.label : "";
        if (label) {
          path.push({ role: "predicate", label });
        }
        break;
      }
      case "node": {
        const resolution = resolveLabel(step.class, closure);
        const label = resolution.status === "resolved" ? resolution.label : "";
        if (label) {
          path.push({ role: "intermediate", label });
        }
        break;
      }
      case "bind": {
        path.push({ role: "object", label: objectLabel });
        break;
      }
      case "branch": {
        // Recurse into branch steps
        const branchPath = buildNarrativePath(step.steps, closure, objectLabel);
        path.push(...branchPath);
        break;
      }
      // literal steps don't appear in the narrative path
    }
  }

  return path;
}

// ---------------------------------------------------------------------------
// §34.4 — Firewall Enforcement
// ---------------------------------------------------------------------------

/**
 * Run firewall enforcement on a narrative string (§34.4).
 *
 * If a prohibited term is detected, returns the fallback.
 * If no fallback is available, returns empty string (omit the clause).
 * Never produces a TranslatedError — this is an internal correction.
 *
 * @returns The cleaned string, or empty string if the clause should be omitted
 */
function firewallClean(
  text: string,
  fallback: string,
): string {
  if (!containsProhibitedTerm(text)) {
    return text;
  }
  // §34.4 Step 1: Replace with fallback
  if (fallback && !containsProhibitedTerm(fallback)) {
    return fallback;
  }
  // §34.4 Step 3: Omit the clause entirely
  return "";
}

/**
 * Apply firewall enforcement to all label fields in a narrativePath (§34.4).
 * Entries with prohibited terms that cannot be cleaned are removed.
 */
function firewallCleanPath(
  path: NarrativePathEntry[],
  classLevelFallback: string,
): NarrativePathEntry[] {
  return path
    .map((entry) => ({
      ...entry,
      label: firewallClean(entry.label, classLevelFallback),
    }))
    .filter((entry) => entry.label.length > 0);
}

// ---------------------------------------------------------------------------
// §34.2 — Main Narrative Generation
// ---------------------------------------------------------------------------

/**
 * Generate a NarrativeResult from a resolved CGP and its mapping metadata (§34.2).
 *
 * @param cgp - The resolved Canonical Graph Pattern
 * @param ui - The mapping's UI block with resolved labels
 * @param intent - The intent shorthand (internal, not rendered to SMEs)
 * @param tier - The mapping tier (1, 2, or 3)
 * @param pattern - The mapping's pattern (for narrativePath assembly)
 * @param closure - The ontology closure for label resolution
 * @param anchorLabel - For Tier 2/3: the semantic anchor class label
 * @param objectLabel - Resolved label for the bound output node
 * @param subjectLabel - Resolved label for the subject entity
 * @returns A NarrativeResult with firewall-clean narrative fields
 */
export function generateNarrative(
  cgp: CGP,
  ui: UIBlock,
  intent: string,
  tier: MappingTier,
  pattern: BranchStep,
  closure: OntologyClosure,
  subjectLabel: string,
  objectLabel: string,
  anchorLabel?: string,
): NarrativeResult {
  // Step 2: Predicate verb conversion
  const predicateVerb = convertToVerbPhrase(ui.label);

  // Step 4: Compose summary sentence
  let narrativeSummary = composeSummary(
    subjectLabel,
    predicateVerb,
    objectLabel,
    tier,
    anchorLabel,
  );

  // Step 5: Assemble narrativePath
  const subjectEntry: NarrativePathEntry = { role: "subject", label: subjectLabel };
  const rawPath = buildNarrativePath(pattern.steps, closure, objectLabel);
  let narrativePath: NarrativePathEntry[] = [subjectEntry, ...rawPath];

  // §34.4: Firewall enforcement on narrativeSummary
  const classLevelFallback = ui.subjectLabel || "this item";
  narrativeSummary = firewallClean(narrativeSummary, classLevelFallback);

  // If the summary was completely omitted, produce a minimal fallback
  if (narrativeSummary.length === 0) {
    narrativeSummary = `${classLevelFallback} is linked to a result.`;
  }

  // Ensure summary ends with a period
  if (!narrativeSummary.endsWith(".")) {
    narrativeSummary += ".";
  }

  // §34.4: Firewall enforcement on narrativePath labels
  narrativePath = firewallCleanPath(narrativePath, classLevelFallback);

  return {
    "@type": "rpm:NarrativeResult",
    cgp,
    narrativeSummary,
    narrativePath,
    sourceIntent: intent,
    sourceIntentLabel: ui.label,
  };
}

// ---------------------------------------------------------------------------
// §34.5 — Multi-Clause Narrative Assembly
// ---------------------------------------------------------------------------

/**
 * Format multiple NarrativeResults for combined display (§34.5).
 *
 * Each clause produces its own summary. The Results View assembles them
 * into a combined display based on the composition mode. The Narrative
 * Layer is responsible for individual clause summaries only — the UI
 * handles layout.
 *
 * @returns An array of formatted summary strings, one per clause
 */
export function formatMultiClauseNarrative(
  results: NarrativeResult[],
  mode: "subjectToSubject" | "union" | "targetToSubject",
): string[] {
  if (results.length === 0) return [];

  switch (mode) {
    case "subjectToSubject":
      // Sequential (AND) — each summary stands alone
      return results.map((r) => r.narrativeSummary);

    case "union":
      // Parallel (OR) — prefix with "One of the following applies:"
      return [
        "One of the following applies:",
        ...results.map((r) => `· ${r.narrativeSummary}`),
      ];

    case "targetToSubject":
      // Chained — first summary standalone, subsequent prefixed with "→ whose"
      return results.map((r, i) => {
        if (i === 0) return r.narrativeSummary;
        // Remove trailing period for chaining, prefix with arrow
        const withoutPeriod = r.narrativeSummary.replace(/\.$/, "");
        return `→ whose ${withoutPeriod}.`;
      });
  }
}
