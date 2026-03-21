/**
 * SPARQL Connector Tests
 *
 * Tests for the adapter-layer SPARQL connector (Phase 2.1):
 * - Query template correctness (Q1–Q6)
 * - Q5 parameterized query generation
 * - Health check with mock responses
 * - Query execution with mock responses
 * - Pagination logic
 * - Retry on failure
 * - Timeout handling
 *
 * All tests use a mock HTTP server — no external endpoints.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createSparqlConnector,
  checkEndpointHealth,
  executeQueryWithRetry,
  executePaginatedQuery,
  buildQ5PathSampling,
  Q1_SUBJECT_PREDICATE_OBJECT,
  Q2_SUBJECT_PREDICATE_LITERAL,
  Q3_PROPERTY_CHAINS,
  Q4_INSTANCE_COUNTS,
  Q6_OWL_ONE_OF,
  type SparqlConnectorConfig,
  type SparqlResult,
} from "../src/adapters/integration/sparql-connector.js";

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
// Mock HTTP Server
// ---------------------------------------------------------------------------

let mockServer: Server;
let mockPort: number;
let mockHandler: (req: IncomingMessage, res: ServerResponse) => void;

async function startMockServer(): Promise<void> {
  return new Promise((resolve) => {
    mockServer = createServer((req, res) => {
      if (mockHandler) {
        mockHandler(req, res);
      } else {
        res.writeHead(200);
        res.end();
      }
    });
    mockServer.listen(0, () => {
      const addr = mockServer.address();
      if (addr && typeof addr === "object") {
        mockPort = addr.port;
      }
      resolve();
    });
  });
}

async function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    mockServer.close(() => resolve());
  });
}

function mockConfig(overrides?: Partial<SparqlConnectorConfig>): SparqlConnectorConfig {
  return {
    endpointUrl: `http://localhost:${mockPort}/sparql`,
    healthCheckTimeout: 5000,
    queryTimeout: 5000,
    pageSize: 3,
    ...overrides,
  };
}

function makeSparqlResponse(bindings: Record<string, { type: string; value: string }>[]): SparqlResult {
  const vars = bindings.length > 0 ? Object.keys(bindings[0]) : [];
  return {
    head: { vars },
    results: { bindings: bindings as any },
  };
}

// =========================================================================
// Query Templates
// =========================================================================

console.log("\n  --- Query Templates ---");

try {
  ok(Q1_SUBJECT_PREDICATE_OBJECT.includes("?subjectClass"));
  ok(Q1_SUBJECT_PREDICATE_OBJECT.includes("?predicate"));
  ok(Q1_SUBJECT_PREDICATE_OBJECT.includes("?objectClass"));
  ok(Q1_SUBJECT_PREDICATE_OBJECT.includes("FILTER"));
  ok(!Q1_SUBJECT_PREDICATE_OBJECT.includes("LIMIT")); // Pagination added externally
  pass("Q1: subject-predicate-object pattern with filters, no embedded LIMIT");
} catch (error) {
  fail("Q1 template", error);
}

try {
  ok(Q2_SUBJECT_PREDICATE_LITERAL.includes("isLiteral"));
  ok(Q2_SUBJECT_PREDICATE_LITERAL.includes("datatype"));
  pass("Q2: literal pattern with datatype extraction");
} catch (error) {
  fail("Q2 template", error);
}

try {
  ok(Q3_PROPERTY_CHAINS.includes("propertyChainAxiom"));
  pass("Q3: OWL property chain axioms");
} catch (error) {
  fail("Q3 template", error);
}

try {
  ok(Q4_INSTANCE_COUNTS.includes("COUNT"));
  ok(Q4_INSTANCE_COUNTS.includes("GROUP BY"));
  pass("Q4: instance counts with GROUP BY");
} catch (error) {
  fail("Q4 template", error);
}

try {
  ok(Q6_OWL_ONE_OF.includes("oneOf"));
  ok(Q6_OWL_ONE_OF.includes("first"));
  ok(Q6_OWL_ONE_OF.includes("?class"));
  ok(Q6_OWL_ONE_OF.includes("?individual"));
  pass("Q6: owl:oneOf enumeration traversal");
} catch (error) {
  fail("Q6 template", error);
}

// =========================================================================
// Q5 Parameterized Query
// =========================================================================

console.log("\n  --- Q5 Parameterized ---");

try {
  const q5 = buildQ5PathSampling("http://example.org/Person", 2);
  ok(q5.includes("http://example.org/Person"), "Q5 includes subject class IRI");
  ok(q5.includes("?n1"), "Q5 includes first hop node");
  ok(q5.includes("?n2"), "Q5 includes second hop node");
  ok(q5.includes("?c1"), "Q5 includes first hop class");
  ok(q5.includes("?p1"), "Q5 includes first hop predicate");
  ok(q5.includes("RAND()"), "Q5 uses random sampling");
  ok(q5.includes("LIMIT 1000"), "Q5 samples up to 1000 instances");
  ok(q5.includes("CONCAT"), "Q5 builds path signature");
  pass("Q5 (2 hops): correct structure with sampling and concat");
} catch (error) {
  fail("Q5 2-hop", error);
}

try {
  const q5_4 = buildQ5PathSampling("http://example.org/Person", 4);
  ok(q5_4.includes("?n4"), "Q5 4-hop includes ?n4");
  ok(q5_4.includes("?c4"), "Q5 4-hop includes ?c4");
  ok(q5_4.includes("?p4"), "Q5 4-hop includes ?p4");
  pass("Q5 (4 hops): extends to 4 hop variables");
} catch (error) {
  fail("Q5 4-hop", error);
}

// =========================================================================
// Connector Factory
// =========================================================================

console.log("\n  --- Connector Factory ---");

try {
  const connector = createSparqlConnector({ endpointUrl: "http://localhost:1234/sparql" });
  ok(connector.checkHealth);
  ok(connector.executeQuery);
  ok(connector.executePaginated);
  ok(connector.queries.Q1);
  ok(connector.queries.Q2);
  ok(connector.queries.Q3);
  ok(connector.queries.Q4);
  ok(connector.queries.buildQ5);
  ok(connector.queries.Q6);
  pass("createSparqlConnector: all methods and queries present");
} catch (error) {
  fail("Connector factory", error);
}

// =========================================================================
// Mock HTTP Tests
// =========================================================================

// Start mock server, run tests, stop server
await startMockServer();

// --- Health Check ---
console.log("\n  --- Health Check (mock) ---");

try {
  mockHandler = (_req, res) => {
    res.writeHead(200);
    res.end();
  };
  const result = await checkEndpointHealth(mockConfig());
  strictEqual(result.reachable, true);
  strictEqual(result.statusCode, 200);
  pass("Health check: 200 → reachable");
} catch (error) {
  fail("Health check 200", error);
}

try {
  mockHandler = (_req, res) => {
    res.writeHead(503);
    res.end();
  };
  const result = await checkEndpointHealth(mockConfig());
  strictEqual(result.reachable, false);
  strictEqual(result.statusCode, 503);
  pass("Health check: 503 → not reachable");
} catch (error) {
  fail("Health check 503", error);
}

try {
  mockHandler = (_req, res) => {
    // Never respond — let it timeout
    setTimeout(() => { res.writeHead(200); res.end(); }, 10000);
  };
  const result = await checkEndpointHealth(mockConfig({ healthCheckTimeout: 100 }));
  strictEqual(result.reachable, false);
  ok(result.error, "Timeout should produce error message");
  pass("Health check: timeout → not reachable with error");
} catch (error) {
  fail("Health check timeout", error);
}

// --- Query Execution ---
console.log("\n  --- Query Execution (mock) ---");

try {
  const testResult = makeSparqlResponse([
    { subjectClass: { type: "uri", value: "http://example.org/Person" } },
  ]);
  mockHandler = (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/sparql-results+json" });
    res.end(JSON.stringify(testResult));
  };
  const result = await executeQueryWithRetry(mockConfig(), "SELECT * WHERE { ?s ?p ?o }");
  strictEqual(result.results.bindings.length, 1);
  strictEqual(result.results.bindings[0].subjectClass.value, "http://example.org/Person");
  pass("Query execution: returns parsed SPARQL results");
} catch (error) {
  fail("Query execution", error);
}

// --- Retry Logic ---
console.log("\n  --- Retry Logic (mock) ---");

try {
  let attempts = 0;
  mockHandler = (_req, res) => {
    attempts++;
    if (attempts === 1) {
      res.writeHead(500);
      res.end("Server error");
    } else {
      res.writeHead(200, { "Content-Type": "application/sparql-results+json" });
      res.end(JSON.stringify(makeSparqlResponse([])));
    }
  };
  const result = await executeQueryWithRetry(mockConfig(), "SELECT * WHERE { ?s ?p ?o }");
  strictEqual(attempts, 2, "Should have retried once");
  strictEqual(result.results.bindings.length, 0);
  pass("Retry: first attempt fails, second succeeds");
} catch (error) {
  fail("Retry logic", error);
}

// --- Pagination ---
console.log("\n  --- Pagination (mock) ---");

try {
  let pageRequests = 0;
  mockHandler = (req, res) => {
    pageRequests++;
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      // Return pageSize results for first 2 pages, then fewer for last page
      const count = pageRequests <= 2 ? 3 : 1; // pageSize is 3
      const bindings = Array.from({ length: count }, (_, i) => ({
        item: { type: "uri" as const, value: `http://example.org/item${(pageRequests - 1) * 3 + i}` },
      }));
      res.writeHead(200, { "Content-Type": "application/sparql-results+json" });
      res.end(JSON.stringify(makeSparqlResponse(bindings)));
    });
  };
  const bindings = await executePaginatedQuery(mockConfig(), "SELECT ?item WHERE { ?s a ?item }");
  strictEqual(bindings.length, 7, "3 + 3 + 1 = 7 total results");
  strictEqual(pageRequests, 3, "3 pages requested");
  pass("Pagination: 3 pages (3+3+1=7 results)");
} catch (error) {
  fail("Pagination", error);
}

await stopMockServer();

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
