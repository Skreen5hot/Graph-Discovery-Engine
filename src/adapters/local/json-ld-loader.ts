/**
 * JSON-LD Loader — Phase 5.A.1
 *
 * Parses a JSON-LD document into a flat array of RDF triples.
 * Handles @context prefix expansion, @type assertions, nested objects,
 * arrays, @value literals, and blank node generation.
 *
 * Adapter-layer code — MUST NOT be imported by kernel.
 */

import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single RDF triple. */
export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  isLiteral: boolean;
  datatype?: string;
  language?: string;
}

/** A flat triple store parsed from JSON-LD. */
export interface LocalTripleStore {
  triples: Triple[];
  prefixes: Record<string, string>;
  /** Raw @context object, preserved for alias label injection. */
  rawContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// IRI Expansion
// ---------------------------------------------------------------------------

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/**
 * Default prefix map for graphs that use common prefixed terms without @context.
 * Applied when no @context is provided (e.g., tagteam.jsonld).
 */
const DEFAULT_PREFIXES: Record<string, string> = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dc: "http://purl.org/dc/elements/1.1/",
  dcterms: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  schema: "http://schema.org/",
};

/**
 * Expand a prefixed term or return it as-is if already a full IRI.
 * E.g., "cco:Person" → "http://www.ontologyrepository.com/CommonCoreOntologies/Person"
 */
export function expandIri(term: string, prefixes: Record<string, string>): string {
  if (term.startsWith("http://") || term.startsWith("https://") || term.startsWith("urn:")) {
    return term;
  }
  if (term.startsWith("_:")) {
    return term;
  }
  // Check for exact-match alias first (e.g., "val" → "cco:has_value" expanded)
  if (prefixes[term] !== undefined) {
    return prefixes[term];
  }
  // Check for prefix:localName pattern
  const colonIndex = term.indexOf(":");
  if (colonIndex > 0) {
    const prefix = term.substring(0, colonIndex);
    const local = term.substring(colonIndex + 1);
    const base = prefixes[prefix];
    if (base) {
      return base + local;
    }
  }
  return term;
}

// ---------------------------------------------------------------------------
// Context Parsing
// ---------------------------------------------------------------------------

/**
 * Extract prefix map from @context.
 * Keys are prefixes, values are base IRIs.
 * Handles:
 *   - String values that are full IRIs (prefix declarations)
 *   - String values that are prefixed terms (aliases like "val": "cco:has_value")
 *   - Object values with @id (term definitions like "Person": { "@id": "cco:ont00001262" })
 */
function parseContext(context: unknown): Record<string, string> {
  const prefixes: Record<string, string> = {};
  if (typeof context !== "object" || context === null) return prefixes;

  const ctx = context as Record<string, unknown>;
  // First pass: collect direct URI prefixes (string → full IRI)
  for (const [key, value] of Object.entries(ctx)) {
    if (key.startsWith("@")) continue;
    if (typeof value === "string" && (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("urn:"))) {
      prefixes[key] = value;
    }
  }
  // Second pass: expand string aliases (prefixed terms like "val": "cco:has_value")
  for (const [key, value] of Object.entries(ctx)) {
    if (key.startsWith("@")) continue;
    if (typeof value === "string" && !value.startsWith("http://") && !value.startsWith("https://") && !value.startsWith("urn:")) {
      const expanded = expandIri(value, prefixes);
      if (expanded !== value) {
        prefixes[key] = expanded;
      }
    }
  }
  // Third pass: extract @id from object-valued term definitions
  // e.g., "Person": { "@id": "cco:ont00001262" } → prefixes["Person"] = expanded IRI
  for (const [key, value] of Object.entries(ctx)) {
    if (key.startsWith("@")) continue;
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      const id = obj["@id"];
      if (typeof id === "string") {
        const expanded = expandIri(id, prefixes);
        prefixes[key] = expanded;
      }
    }
  }
  return prefixes;
}

// ---------------------------------------------------------------------------
// Triple Extraction
// ---------------------------------------------------------------------------

let blankNodeCounter = 0;

function nextBlankNode(): string {
  return `_:b${blankNodeCounter++}`;
}

/**
 * Extract triples from a JSON-LD node.
 * Returns the subject IRI of this node.
 */
function extractNode(
  node: Record<string, unknown>,
  prefixes: Record<string, string>,
  triples: Triple[],
): string {
  // Determine subject
  const rawId = node["@id"] as string | undefined;
  const subject = rawId ? expandIri(rawId, prefixes) : nextBlankNode();

  // @type → rdf:type triples
  const types = node["@type"];
  if (types) {
    const typeArray = Array.isArray(types) ? types : [types];
    for (const t of typeArray) {
      triples.push({
        subject,
        predicate: RDF_TYPE,
        object: expandIri(String(t), prefixes),
        isLiteral: false,
      });
    }
  }

  // Other properties
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@")) continue;
    const predicate = expandIri(key, prefixes);
    processValue(subject, predicate, value, prefixes, triples);
  }

  return subject;
}

/**
 * Process a property value recursively.
 */
function processValue(
  subject: string,
  predicate: string,
  value: unknown,
  prefixes: Record<string, string>,
  triples: Triple[],
): void {
  if (value === null || value === undefined) return;

  // Array → recurse on each element
  if (Array.isArray(value)) {
    for (const item of value) {
      processValue(subject, predicate, item, prefixes, triples);
    }
    return;
  }

  // Object
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // @value → literal
    if ("@value" in obj) {
      const litValue = String(obj["@value"]);
      const datatype = obj["@type"] ? expandIri(String(obj["@type"]), prefixes) : undefined;
      const language = obj["@language"] ? String(obj["@language"]) : undefined;
      triples.push({
        subject,
        predicate,
        object: litValue,
        isLiteral: true,
        datatype: datatype ?? "http://www.w3.org/2001/XMLSchema#string",
        language,
      });
      return;
    }

    // Nested node → extract and link
    const nestedSubject = extractNode(obj, prefixes, triples);
    triples.push({
      subject,
      predicate,
      object: nestedSubject,
      isLiteral: false,
    });
    return;
  }

  // Primitive → literal
  let datatype = "http://www.w3.org/2001/XMLSchema#string";
  if (typeof value === "number") {
    datatype = Number.isInteger(value)
      ? "http://www.w3.org/2001/XMLSchema#integer"
      : "http://www.w3.org/2001/XMLSchema#decimal";
  } else if (typeof value === "boolean") {
    datatype = "http://www.w3.org/2001/XMLSchema#boolean";
  }

  triples.push({
    subject,
    predicate,
    object: String(value),
    isLiteral: true,
    datatype,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a JSON-LD document object into a LocalTripleStore.
 * Resets the blank node counter for deterministic output.
 */
export function parseJsonLdDoc(doc: Record<string, unknown> | unknown[]): LocalTripleStore {
  blankNodeCounter = 0;
  const triples: Triple[] = [];

  // Handle expanded JSON-LD array (array of nodes with full IRIs, no @context)
  if (Array.isArray(doc)) {
    const prefixes: Record<string, string> = { ...DEFAULT_PREFIXES };
    for (const node of doc) {
      if (typeof node === "object" && node !== null) {
        extractNode(node as Record<string, unknown>, prefixes, triples);
      }
    }
    return { triples, prefixes };
  }

  // Parse context — merge with defaults for common prefixes
  const rawContext = (typeof doc["@context"] === "object" && doc["@context"] !== null)
    ? doc["@context"] as Record<string, unknown>
    : undefined;
  const prefixes = { ...DEFAULT_PREFIXES, ...parseContext(rawContext) };

  // Parse graph
  const graph = doc["@graph"];
  if (Array.isArray(graph)) {
    for (const node of graph) {
      if (typeof node === "object" && node !== null) {
        extractNode(node as Record<string, unknown>, prefixes, triples);
      }
    }
  } else {
    // No @graph — treat root as a single node
    extractNode(doc, prefixes, triples);
  }

  return { triples, prefixes, rawContext };
}

/**
 * Load a JSON-LD file and parse it into a LocalTripleStore.
 * Resets the blank node counter at the start of each call.
 */
export async function loadJsonLdGraph(filePath: string): Promise<LocalTripleStore> {
  const content = await readFile(filePath, "utf8");
  const doc = JSON.parse(content) as Record<string, unknown> | unknown[];
  return parseJsonLdDoc(doc);
}
