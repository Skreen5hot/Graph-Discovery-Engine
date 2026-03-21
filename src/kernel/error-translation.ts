/**
 * Dynamic Error Template Engine — RPM v2.1 §25
 *
 * Constructs SME-facing error messages at runtime by injecting
 * Discovered Labels into structural templates. The UI renderer
 * receives only TranslatedError objects — raw error codes go to
 * the application log only.
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type {
  RPMError,
  RPMErrorCode,
  TranslatedError,
  ErrorSeverity,
  ErrorPlacement,
  UIBlock,
} from "./types.js";

// ---------------------------------------------------------------------------
// §25.2 — Template Structures
// ---------------------------------------------------------------------------

interface ErrorTemplate {
  severity: ErrorSeverity;
  placement: ErrorPlacement;
  template: string;
}

/**
 * The complete error template table (RPM §25.2).
 * All 11 error codes with their severity, placement, and template string.
 * Templates use injection tokens: {subjectLabel}, {intentLabel},
 * {domainLabel}, {fieldLabel}, {intentLabel2}.
 */
const ERROR_TEMPLATES: ReadonlyMap<RPMErrorCode, ErrorTemplate> = new Map([
  ["INTENT_NOT_FOUND", {
    severity: "system",
    placement: "banner",
    template: "This type of search is not currently available. Please choose a different option.",
  }],
  ["SUBCLASS_VIOLATION", {
    severity: "validation",
    placement: "inline",
    template: "The selected {subjectLabel} record cannot be used with '{intentLabel}'. This search applies to {domainLabel} records only.",
  }],
  ["ONTOLOGY_TERM_UNRESOLVED", {
    severity: "system",
    placement: "banner",
    template: "A required definition is missing from the system configuration. Please contact your system administrator.",
  }],
  ["MAPPING_CONSTRAINT_VIOLATION", {
    severity: "validation",
    placement: "inline",
    template: "The value provided for '{fieldLabel}' does not meet the requirements for '{intentLabel}'. Please review your entry.",
  }],
  ["INVALID_PATTERN", {
    severity: "system",
    placement: "banner",
    template: "This search could not be processed due to a configuration error. Please contact your system administrator.",
  }],
  ["DETERMINISTIC_ID_COLLISION", {
    severity: "system",
    placement: "banner",
    template: "A naming conflict was detected. Please contact your system administrator.",
  }],
  ["PARTIAL_RESOLUTION_DISABLED", {
    severity: "system",
    placement: "banner",
    template: "This search could not be completed. Please contact your system administrator.",
  }],
  ["COMPOSITION_ANCHOR_MISSING", {
    severity: "system",
    placement: "banner",
    template: "The '{intentLabel}' and '{intentLabel2}' conditions could not be combined. Please contact your system administrator.",
  }],
  ["COMPOSITION_CHAIN_BROKEN", {
    severity: "system",
    placement: "banner",
    template: "The linked search step for '{intentLabel}' could not be connected. Please contact your system administrator.",
  }],
  ["CRAWL_ENDPOINT_UNREACHABLE", {
    severity: "system",
    placement: "banner",
    template: "The data source could not be reached during startup. Please contact your system administrator.",
  }],
  ["LABELING_LAW_EXHAUSTED", {
    severity: "system",
    placement: "banner",
    template: "A search condition could not be labeled and was not made available. Please contact your system administrator.",
  }],
]);

// ---------------------------------------------------------------------------
// §25.2 — Token Resolution Context
// ---------------------------------------------------------------------------

/**
 * Context for resolving label injection tokens in error templates.
 * All fields are optional — if a token cannot be resolved, a safe
 * fallback is substituted (RPM §25.2).
 */
export interface ErrorTranslationContext {
  subjectLabel?: string;
  intentLabel?: string;
  domainLabel?: string;
  fieldLabel?: string;
  intentLabel2?: string;
}

/** Fallback values when tokens cannot be resolved (RPM §25.2). */
const TOKEN_FALLBACKS: Record<string, string> = {
  subjectLabel: "this record type",
  intentLabel: "this search",
  domainLabel: "the required",
  fieldLabel: "this field",
  intentLabel2: "the other condition",
};

// ---------------------------------------------------------------------------
// Token Injection
// ---------------------------------------------------------------------------

/**
 * Inject resolved labels into a template string.
 * Tokens: {subjectLabel}, {intentLabel}, {domainLabel}, {fieldLabel}, {intentLabel2}.
 * Unresolvable tokens are replaced with safe fallbacks per §25.2.
 */
function injectTokens(
  template: string,
  context: ErrorTranslationContext,
): string {
  return template
    .replace(/\{subjectLabel\}/g, context.subjectLabel ?? TOKEN_FALLBACKS.subjectLabel)
    .replace(/\{intentLabel\}/g, context.intentLabel ?? TOKEN_FALLBACKS.intentLabel)
    .replace(/\{domainLabel\}/g, context.domainLabel ?? TOKEN_FALLBACKS.domainLabel)
    .replace(/\{fieldLabel\}/g, context.fieldLabel ?? TOKEN_FALLBACKS.fieldLabel)
    .replace(/\{intentLabel2\}/g, context.intentLabel2 ?? TOKEN_FALLBACKS.intentLabel2);
}

// ---------------------------------------------------------------------------
// §25.1 — Translation Function
// ---------------------------------------------------------------------------

/**
 * Translate an RPMError into a TranslatedError for the SME surface (RPM §25.1).
 *
 * The translated error contains ONLY plain-language content — no IRIs,
 * no error codes, no namespace prefixes, no internal identifiers.
 * Raw error codes go to the application log only.
 *
 * @param error - The structured RPMError from the kernel
 * @param context - Label resolution context for token injection
 * @returns A TranslatedError safe for SME rendering
 */
export function translateError(
  error: RPMError,
  context: ErrorTranslationContext = {},
): TranslatedError {
  const template = ERROR_TEMPLATES.get(error.errorCode);

  if (!template) {
    // Unknown error code — produce a safe system error
    return {
      "@type": "rpm:TranslatedError",
      userMessage: "An unexpected error occurred. Please contact your system administrator.",
      severity: "system",
      placement: "banner",
      clauseIndex: error.clauseIndex ?? 0,
    };
  }

  const userMessage = injectTokens(template.template, context);

  return {
    "@type": "rpm:TranslatedError",
    userMessage,
    severity: template.severity,
    placement: template.placement,
    fieldBinding: error.errorCode === "MAPPING_CONSTRAINT_VIOLATION"
      ? context.fieldLabel
      : undefined,
    clauseIndex: error.clauseIndex ?? 0,
  };
}

/**
 * Build an ErrorTranslationContext from a UIBlock.
 * Extracts the label fields that token injection needs.
 */
export function buildTranslationContext(
  ui: UIBlock | undefined,
  opts: {
    domainLabel?: string;
    fieldLabel?: string;
    intentLabel2?: string;
  } = {},
): ErrorTranslationContext {
  return {
    subjectLabel: ui?.subjectLabel || undefined,
    intentLabel: ui?.label || undefined,
    domainLabel: opts.domainLabel || undefined,
    fieldLabel: opts.fieldLabel || undefined,
    intentLabel2: opts.intentLabel2 || undefined,
  };
}

/**
 * Check if a string contains any prohibited surface elements (RPM §26).
 * Used by CT-01 and CT-12 compliance checks.
 *
 * Checks for: namespace prefixes (IRI patterns), raw error codes,
 * internal field names, and technical identifiers.
 */
export function containsProhibitedTerm(text: string): boolean {
  // IRI patterns
  if (/[a-zA-Z]+:\/\//.test(text)) return true;
  // Prefixed names (foo:bar)
  if (/\b[a-z]{2,}:[A-Z]/.test(text)) return true;
  // Blank node IDs
  if (/_:b[0-9a-f]/.test(text)) return true;
  // Raw error codes (all-caps with underscores)
  if (/\b[A-Z]{2,}_[A-Z]{2,}/.test(text)) return true;
  // Internal field values
  if (/\b(labelSource|inputTypeSource|overrideId|frequencyScore|instanceCount)\b/.test(text)) return true;
  // Tier values
  if (/\btier:\s*[123]\b/i.test(text)) return true;

  return false;
}
