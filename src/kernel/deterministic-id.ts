/**
 * Deterministic Blank Node ID Generation — RPM v2.1 §9
 *
 * SHA-256 hash truncated to 16 lowercase hexadecimal characters.
 * Produces globally unique, deterministic blank node IDs from
 * a canonical input string.
 *
 * The canonical input format uses pipe-separated components with
 * escape rules to ensure unambiguous serialization:
 * - Pipes (|) in values are escaped as \|
 * - Backslashes (\) in values are escaped as \\
 * - Empty strings are represented as empty (two adjacent pipes: ||)
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 * Uses Node.js built-in crypto (deterministic hash, not random generation).
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Length of the truncated hex hash (RPM §9). */
const HASH_LENGTH = 16;

// ---------------------------------------------------------------------------
// Canonical Input Serialization
// ---------------------------------------------------------------------------

/**
 * Escape a value for inclusion in a pipe-separated canonical string.
 * Backslashes are escaped first (to avoid double-escaping pipes),
 * then pipes are escaped.
 */
function escapeComponent(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * Build a canonical input string from ordered components.
 * Components are joined with pipe (|) separators.
 * Each component is escaped to prevent ambiguity.
 *
 * The resulting string is the SHA-256 input — identical components
 * in identical order always produce identical hashes.
 */
export function buildCanonicalInput(...components: string[]): string {
  return components.map(escapeComponent).join("|");
}

// ---------------------------------------------------------------------------
// §9 — Deterministic ID Generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic blank node ID from a canonical input string (RPM §9).
 *
 * The ID is the first 16 characters of the lowercase hex SHA-256 digest
 * of the canonical input string. This produces a 64-bit namespace with
 * negligible collision probability for the expected mapping counts.
 *
 * @param canonicalInput - A pipe-separated canonical string from buildCanonicalInput
 * @returns A 16-character lowercase hexadecimal string prefixed with "_:b"
 */
export function generateBlankNodeId(canonicalInput: string): string {
  const hash = createHash("sha256")
    .update(canonicalInput, "utf8")
    .digest("hex")
    .substring(0, HASH_LENGTH);

  return `_:b${hash}`;
}

/**
 * Generate a deterministic blank node ID for a node in an expanded CGP (RPM §9.2).
 *
 * The canonical input is built from six components in spec-prescribed order:
 * 1. subjectId — the subject entity's @id
 * 2. intent — the intent shorthand used in the expand call
 * 3. mappingShorthand — the mapping's shorthand IRI (full predicate IRI for discovered)
 * 4. stepPath — the dot-separated step path within the pattern (e.g., "0.1.2")
 * 5. branchName — the branch name if inside a branch step, empty string otherwise
 * 6. occurrenceIndex — disambiguation index for repeated patterns (default 0)
 *
 * @param subjectId - The subject entity @id
 * @param intent - The intent shorthand from the expand call
 * @param mappingShorthand - The mapping shorthand (full predicate IRI for discovered)
 * @param stepPath - Dot-separated step indices (e.g., "0", "0.1", "0.1.2")
 * @param branchName - The enclosing branch name, or empty string
 * @param occurrenceIndex - Disambiguation for repeated patterns (default 0, no leading zeros)
 * @returns A deterministic blank node ID: "_:b" + 16 hex chars
 */
export function generateNodeId(
  subjectId: string,
  intent: string,
  mappingShorthand: string,
  stepPath: string,
  branchName: string = "",
  occurrenceIndex: number = 0,
): string {
  const canonicalInput = buildCanonicalInput(
    subjectId,
    intent,
    mappingShorthand,
    stepPath,
    branchName,
    String(occurrenceIndex),
  );
  return generateBlankNodeId(canonicalInput);
}

/**
 * Generate the raw 16-char hex hash without the "_:b" prefix.
 * Used when the consumer needs just the hash portion (e.g., for overrideId generation).
 *
 * @param input - Arbitrary string to hash
 * @returns 16-character lowercase hexadecimal string
 */
export function generateHexHash(input: string): string {
  return createHash("sha256")
    .update(input, "utf8")
    .digest("hex")
    .substring(0, HASH_LENGTH);
}

/**
 * Generate an overrideId for the Label Override API (RPM §35.3).
 * Format: "ov_" + first 8 hex chars of SHA-256(shorthand + createdAt).
 *
 * @param shorthand - The mapping shorthand
 * @param createdAt - ISO 8601 timestamp
 * @returns An override ID: "ov_" + 8 hex chars
 */
export function generateOverrideId(
  shorthand: string,
  createdAt: string,
): string {
  const hash = createHash("sha256")
    .update(shorthand + createdAt, "utf8")
    .digest("hex")
    .substring(0, 8);

  return `ov_${hash}`;
}
