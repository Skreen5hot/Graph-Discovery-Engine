/**
 * SPARQL Endpoint Connector — RPM v2.1 §32.2–32.3
 *
 * Adapter-layer component for executing SPARQL queries against a
 * configured endpoint. This module MUST NOT be imported by kernel code.
 *
 * Implements:
 * - HTTP HEAD health check with 10s timeout (§32.2)
 * - Paginated query execution (10,000 results/page) with 30s per-query
 *   timeout and one retry (§32.3)
 * - All 6 introspection query templates: Q1–Q5 (§32.3) + Q6 (owl:oneOf)
 *
 * Uses Node.js built-in fetch (Node 22+). No external HTTP dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the SPARQL connector. */
export interface SparqlConnectorConfig {
  /** The SPARQL endpoint URL (e.g., "https://example.org/sparql"). */
  endpointUrl: string;
  /** Health check timeout in ms (default: 10000). */
  healthCheckTimeout?: number;
  /** Per-query timeout in ms (default: 30000). */
  queryTimeout?: number;
  /** Results per page for paginated queries (default: 10000). */
  pageSize?: number;
}

/** A single row from a SPARQL SELECT result. */
export interface SparqlBinding {
  [variable: string]: {
    type: "uri" | "literal" | "bnode";
    value: string;
    "xml:lang"?: string;
    datatype?: string;
  };
}

/** Parsed SPARQL SELECT response. */
export interface SparqlResult {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

/** Health check result. */
export interface HealthCheckResult {
  reachable: boolean;
  statusCode?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HEALTH_TIMEOUT = 10_000;
const DEFAULT_QUERY_TIMEOUT = 30_000;
const DEFAULT_PAGE_SIZE = 10_000;

// ---------------------------------------------------------------------------
// §32.2 — Health Check
// ---------------------------------------------------------------------------

/**
 * Check if the SPARQL endpoint is reachable (§32.2).
 * HTTP HEAD with configurable timeout (default 10s).
 */
export async function checkEndpointHealth(
  config: SparqlConnectorConfig,
): Promise<HealthCheckResult> {
  const timeout = config.healthCheckTimeout ?? DEFAULT_HEALTH_TIMEOUT;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(config.endpointUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timer);

    return {
      reachable: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// §32.3 — Query Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single SPARQL SELECT query with timeout.
 * Returns the parsed result or throws on timeout/error.
 */
async function executeSingleQuery(
  endpointUrl: string,
  query: string,
  timeoutMs: number,
): Promise<SparqlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        "Accept": "application/sparql-results+json",
      },
      body: query,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`SPARQL endpoint returned ${response.status}: ${response.statusText}`);
    }

    return await response.json() as SparqlResult;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Execute a SPARQL query with one retry on failure (§32.3).
 * 30s per-query timeout. If the first attempt fails, retries once.
 * If the retry also fails, throws the error.
 */
export async function executeQueryWithRetry(
  config: SparqlConnectorConfig,
  query: string,
): Promise<SparqlResult> {
  const timeout = config.queryTimeout ?? DEFAULT_QUERY_TIMEOUT;

  try {
    return await executeSingleQuery(config.endpointUrl, query, timeout);
  } catch (firstError) {
    // One retry
    try {
      return await executeSingleQuery(config.endpointUrl, query, timeout);
    } catch (retryError) {
      throw retryError;
    }
  }
}

/**
 * Execute a paginated SPARQL query (§32.3).
 * Iterates pages of `pageSize` results until exhausted.
 * Each page uses the query with LIMIT/OFFSET appended.
 */
export async function executePaginatedQuery(
  config: SparqlConnectorConfig,
  baseQuery: string,
): Promise<SparqlBinding[]> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const allBindings: SparqlBinding[] = [];
  let offset = 0;

  while (true) {
    const paginatedQuery = `${baseQuery}\nLIMIT ${pageSize} OFFSET ${offset}`;
    const result = await executeQueryWithRetry(config, paginatedQuery);
    const bindings = result.results.bindings;

    allBindings.push(...bindings);

    if (bindings.length < pageSize) {
      break; // Last page — fewer results than page size
    }
    offset += pageSize;
  }

  return allBindings;
}

// ---------------------------------------------------------------------------
// §32.3 — Introspection Query Templates (Q1–Q6)
// ---------------------------------------------------------------------------

/** Q1 — Subject-Predicate-Object class patterns (§32.3). */
export const Q1_SUBJECT_PREDICATE_OBJECT = `
SELECT DISTINCT ?subjectClass ?predicate ?objectClass
WHERE {
  ?s a ?subjectClass .
  ?s ?predicate ?o .
  OPTIONAL { ?o a ?objectClass }
  FILTER(isIRI(?predicate))
  FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
  FILTER(?predicate != <http://www.w3.org/2000/01/rdf-schema#label>)
  FILTER(?predicate != <http://www.w3.org/2002/07/owl#sameAs>)
}`.trim();

/** Q2 — Subject-Predicate-Literal patterns (§32.3). */
export const Q2_SUBJECT_PREDICATE_LITERAL = `
SELECT DISTINCT ?subjectClass ?predicate (datatype(?o) AS ?literalType)
WHERE {
  ?s a ?subjectClass .
  ?s ?predicate ?o .
  FILTER(isLiteral(?o))
  FILTER(isIRI(?predicate))
}`.trim();

/** Q3 — OWL property chain axioms (§32.3). */
export const Q3_PROPERTY_CHAINS = `
SELECT ?property ?chain
WHERE {
  ?property <http://www.w3.org/2002/07/owl#propertyChainAxiom> ?chain .
}`.trim();

/** Q4 — Instance counts by subject class (§32.3). */
export const Q4_INSTANCE_COUNTS = `
SELECT ?subjectClass (COUNT(?s) AS ?count)
WHERE { ?s a ?subjectClass }
GROUP BY ?subjectClass`.trim();

/**
 * Q5 — Multi-hop path sampling (§32.3).
 * Parameterized by subject class and hop depth.
 * Generate concrete queries per hop depth at crawl time.
 */
export function buildQ5PathSampling(
  subjectClassIri: string,
  hopDepth: number,
): string {
  // Build the chain of ?s <p1> ?n1 . ?n1 a ?c1 . ?n1 <p2> ?n2 ...
  const triples: string[] = [];
  const concatParts: string[] = [];

  let prevVar = "?s";
  for (let hop = 1; hop <= hopDepth; hop++) {
    const nodeVar = `?n${hop}`;
    const classVar = `?c${hop}`;
    const predVar = `?p${hop}`;

    triples.push(`${prevVar} ${predVar} ${nodeVar} .`);
    triples.push(`${nodeVar} a ${classVar} .`);

    if (hop > 1) concatParts.push('"|"');
    concatParts.push(`str(${predVar})`, '"|"', `str(${classVar})`);

    prevVar = nodeVar;
  }

  return `
SELECT ?pathSignature
WHERE {
  { SELECT ?s WHERE { ?s a <${subjectClassIri}> } ORDER BY RAND() LIMIT 1000 }
  ${triples.join("\n  ")}
  BIND(CONCAT(${concatParts.join(", ")}) AS ?pathSignature)
}`.trim();
}

/**
 * Q6 — owl:oneOf enumerated individuals.
 * Not in §32.3 but needed for enumeration detection (§31.3).
 */
export const Q6_OWL_ONE_OF = `
SELECT ?class ?individual
WHERE {
  ?class <http://www.w3.org/2002/07/owl#oneOf>/<http://www.w3.org/1999/02/22-rdf-syntax-ns#rest>*/<http://www.w3.org/1999/02/22-rdf-syntax-ns#first> ?individual .
}`.trim();

// ---------------------------------------------------------------------------
// Connector Factory
// ---------------------------------------------------------------------------

/**
 * Create a SPARQL connector instance with the given configuration.
 * Returns an object with methods for health check, query execution,
 * and introspection query access.
 */
export function createSparqlConnector(config: SparqlConnectorConfig) {
  return {
    config,
    checkHealth: () => checkEndpointHealth(config),
    executeQuery: (query: string) => executeQueryWithRetry(config, query),
    executePaginated: (query: string) => executePaginatedQuery(config, query),
    queries: {
      Q1: Q1_SUBJECT_PREDICATE_OBJECT,
      Q2: Q2_SUBJECT_PREDICATE_LITERAL,
      Q3: Q3_PROPERTY_CHAINS,
      Q4: Q4_INSTANCE_COUNTS,
      buildQ5: (subjectClass: string, hopDepth: number) =>
        buildQ5PathSampling(subjectClass, hopDepth),
      Q6: Q6_OWL_ONE_OF,
    },
  };
}
