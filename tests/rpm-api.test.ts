/**
 * RPM API Tests — Phase 3
 *
 * Tests for all HTTP endpoints using a real HTTP server:
 * - GET /rpm/subject-types
 * - GET /rpm/catalog (full and filtered)
 * - GET /rpm/catalog/:shorthand
 * - POST /rpm/expand
 * - POST /rpm/compose
 * - GET /rpm/overrides
 * - POST /rpm/overrides (role enforcement)
 * - DELETE /rpm/overrides/:overrideId
 * - POST /rpm/refresh
 * - GET /rpm/discovery-report (role enforcement)
 * - GET /rpm/entity-search
 * - Error responses in TranslatedError format
 */

import { strictEqual, ok } from "node:assert";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createHttpServer } from "../src/adapters/integration/http-server.js";
import { registerRpmRoutes, type ServerState } from "../src/adapters/integration/rpm-api.js";
import { buildClosure } from "../src/kernel/closure-builder.js";
import { createOwlTypeResolver } from "../src/kernel/type-resolver.js";
import { stubTypeResolver } from "../src/kernel/expand.js";
import type {
  MappingRegistry,
  MappingDefinition,
  UIBlock,
  OverrideStore,
  DiscoveryReport,
} from "../src/kernel/types.js";
import { assembleRegistry } from "../src/kernel/registry-assembler.js";

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
// Fixtures
// ---------------------------------------------------------------------------

const emptyUI: UIBlock = {
  label: "Has Catalyst", description: "The catalyst", group: "Process", examples: ["Who has catalyst?"],
  subjectLabel: "Chemical Process", inputParameters: [],
  outputBinds: [{ role: "target", label: "Catalyst", description: "The catalyst agent" }],
};

const testMapping: MappingDefinition = {
  shorthand: "mfg:hasCatalyst",
  source: "discovered", tier: 1, exposure: "smeSurface",
  domainClasses: ["mfg:ChemicalProcess"],
  rangeClasses: ["mfg:Catalyst"],
  pattern: {
    type: "branch", name: "catalyst",
    steps: [
      { type: "edge", predicate: "mfg:hasCatalyst", direction: "forward" },
      { type: "node", class: "mfg:Catalyst" },
      { type: "bind", role: "target" },
    ],
  },
  ui: emptyUI,
  description: "Direct predicate",
};

const closure = buildClosure([
  { iri: "mfg:ChemicalProcess", labels: [{ value: "Chemical Process", language: "en", predicate: "rdfs:label" }] },
  { iri: "mfg:Catalyst", labels: [{ value: "Catalyst", language: "en", predicate: "rdfs:label" }] },
]);

const resolver = createOwlTypeResolver(closure);

function makeState(): ServerState {
  const tierResults = {
    tier1: { mappings: [testMapping], promotionLog: [] },
    tier2: { mappings: [], promotionLog: [] },
    tier3: { mappings: [], promotionLog: [] },
  };
  const { registry, catalog, report } = assembleRegistry(tierResults, closure, resolver);

  return {
    registry,
    catalog,
    closure,
    typeResolver: stubTypeResolver,
    report,
    overrideStore: { "@type": "rpm:OverrideStore", version: "2.1.0", overrides: [] },
    overrideStorePath: join(tmpdir(), `rpm-overrides-test-${Date.now()}.json`),
    lastCrawlTimestamp: "2026-03-21T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Server Setup
// ---------------------------------------------------------------------------

let server: Server;
let port: number;

async function startServer(): Promise<void> {
  const state = makeState();
  const router = registerRpmRoutes(state);
  server = createHttpServer(router);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") port = addr.port;
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; role?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.role) headers["X-RPM-Role"] = opts.role;

  const response = await fetch(`http://localhost:${port}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await response.json();
  return { status: response.status, body };
}

// =========================================================================
// Tests
// =========================================================================

await startServer();

// ----- Subject Types -----
console.log("\n  --- GET /rpm/subject-types ---");

try {
  const { status, body } = await api("/rpm/subject-types");
  strictEqual(status, 200);
  ok(Array.isArray(body.subjectTypes));
  ok(body.subjectTypes.length >= 1);
  pass("GET /rpm/subject-types returns subject types");
} catch (error) {
  fail("subject-types", error);
}

// ----- Catalog -----
console.log("\n  --- GET /rpm/catalog ---");

try {
  const { status, body } = await api("/rpm/catalog");
  strictEqual(status, 200);
  ok(body.groups || body.mappings);
  pass("GET /rpm/catalog returns catalog");
} catch (error) {
  fail("catalog", error);
}

try {
  const { status, body } = await api("/rpm/catalog?subjectType=mfg:ChemicalProcess");
  strictEqual(status, 200);
  ok(Array.isArray(body.mappings));
  ok(Array.isArray(body.compoundIntents));
  pass("GET /rpm/catalog?subjectType= returns mappings + compoundIntents");
} catch (error) {
  fail("catalog filtered", error);
}

// ----- Catalog Single Entry -----
try {
  const { status, body } = await api("/rpm/catalog/mfg:hasCatalyst");
  strictEqual(status, 200);
  strictEqual(body.shorthand, "mfg:hasCatalyst");
  ok(body.ui);
  pass("GET /rpm/catalog/:shorthand returns single entry with UI block");
} catch (error) {
  fail("catalog single", error);
}

try {
  const { status } = await api("/rpm/catalog/nonexistent:intent");
  strictEqual(status, 404);
  pass("GET /rpm/catalog/:shorthand 404 for unknown");
} catch (error) {
  fail("catalog 404", error);
}

// ----- Expand -----
console.log("\n  --- POST /rpm/expand ---");

try {
  const { status, body } = await api("/rpm/expand", {
    method: "POST",
    body: {
      intent: "mfg:hasCatalyst",
      subject: { "@id": "ex:Batch501", "@type": ["mfg:ChemicalProcess"] },
    },
  });
  strictEqual(status, 200);
  ok(body["@graph"]);
  ok(body.provenance);
  pass("POST /rpm/expand returns CGP with @graph and provenance");
} catch (error) {
  fail("expand success", error);
}

try {
  const { status, body } = await api("/rpm/expand", {
    method: "POST",
    body: {
      intent: "nonexistent:intent",
      subject: { "@id": "ex:A", "@type": ["mfg:ChemicalProcess"] },
    },
  });
  strictEqual(status, 422);
  strictEqual(body["@type"], "rpm:TranslatedError");
  ok(!body.userMessage.includes("INTENT_NOT_FOUND"), "No raw error code in userMessage");
  pass("POST /rpm/expand 422 with TranslatedError for unknown intent");
} catch (error) {
  fail("expand error", error);
}

// ----- Compose -----
console.log("\n  --- POST /rpm/compose ---");

try {
  const { status, body } = await api("/rpm/compose", {
    method: "POST",
    body: {
      clauses: [
        { intent: "mfg:hasCatalyst", subject: { "@id": "ex:B", "@type": ["mfg:ChemicalProcess"] } },
      ],
      composition: { mode: "subjectToSubject" },
    },
  });
  strictEqual(status, 200);
  ok(body.clauses);
  strictEqual(body["@type"], "rpm:ComposedGraphPattern");
  pass("POST /rpm/compose returns CGP_c");
} catch (error) {
  fail("compose", error);
}

// ----- Override API -----
console.log("\n  --- Override API ---");

// GET overrides — requires role
try {
  const { status } = await api("/rpm/overrides");
  strictEqual(status, 401);
  pass("GET /rpm/overrides without role → 401");
} catch (error) {
  fail("overrides no auth", error);
}

try {
  const { status, body } = await api("/rpm/overrides", { role: "sme" });
  strictEqual(status, 200);
  strictEqual(body.count, 0);
  pass("GET /rpm/overrides with sme role → 200");
} catch (error) {
  fail("overrides sme", error);
}

// POST override — sme → 403
try {
  const { status } = await api("/rpm/overrides", {
    method: "POST",
    role: "sme",
    body: { shorthand: "mfg:hasCatalyst", label: "New Label" },
  });
  strictEqual(status, 403);
  pass("POST /rpm/overrides with sme role → 403");
} catch (error) {
  fail("override sme write", error);
}

// POST override — curator → 200
try {
  const { status, body } = await api("/rpm/overrides", {
    method: "POST",
    role: "curator",
    body: { shorthand: "mfg:hasCatalyst", label: "Catalyst Agent" },
  });
  strictEqual(status, 200);
  ok(body.overrideId);
  ok(body.overrideId.startsWith("ov_"));
  strictEqual(body.catalogRebuilt, true);
  pass("POST /rpm/overrides with curator → 200, overrideId returned");
} catch (error) {
  fail("override curator write", error);
}

// GET overrides — now has 1, with originalLabel
try {
  const { status, body } = await api("/rpm/overrides", { role: "curator" });
  strictEqual(status, 200);
  strictEqual(body.count, 1);
  strictEqual(body.overrides[0].label, "Catalyst Agent");
  strictEqual(body.overrides[0].originalLabel, "Has Catalyst", "originalLabel captured at creation time");
  pass("GET /rpm/overrides after POST → count=1, originalLabel='Has Catalyst'");
} catch (error) {
  fail("overrides after post", error);
}

// DELETE override — restores original label
try {
  // First get the overrideId
  const listRes = await api("/rpm/overrides", { role: "curator" });
  const overrideId = listRes.body.overrides[0].overrideId;

  const { status, body } = await api(`/rpm/overrides/${overrideId}`, {
    method: "DELETE",
    role: "curator",
  });
  strictEqual(status, 200);
  strictEqual(body.catalogRebuilt, true);
  strictEqual(body.revertedTo, "discovered");

  // Verify the label was restored on the catalog entry
  const catalogRes = await api("/rpm/catalog/mfg:hasCatalyst");
  strictEqual(catalogRes.body.ui.label, "Has Catalyst", "Label restored after DELETE");

  pass("DELETE /rpm/overrides/:overrideId restores original label");
} catch (error) {
  fail("override delete restore", error);
}

// ----- Refresh -----
console.log("\n  --- POST /rpm/refresh ---");

try {
  const { status } = await api("/rpm/refresh", { method: "POST", role: "sme" });
  strictEqual(status, 403);
  pass("POST /rpm/refresh with sme → 403");
} catch (error) {
  fail("refresh sme", error);
}

// ----- Discovery Report -----
console.log("\n  --- GET /rpm/discovery-report ---");

try {
  const { status } = await api("/rpm/discovery-report", { role: "sme" });
  strictEqual(status, 403);
  pass("GET /rpm/discovery-report with sme → 403");
} catch (error) {
  fail("report sme", error);
}

try {
  const { status, body } = await api("/rpm/discovery-report", { role: "curator" });
  strictEqual(status, 200);
  strictEqual(body["@type"], "rpm:DiscoveryReport");
  pass("GET /rpm/discovery-report with curator → 200");
} catch (error) {
  fail("report curator", error);
}

// ----- Entity Search -----
console.log("\n  --- GET /rpm/entity-search ---");

try {
  const { status, body } = await api("/rpm/entity-search?type=mfg:Catalyst&q=pall");
  strictEqual(status, 200);
  ok(Array.isArray(body.results));
  pass("GET /rpm/entity-search returns results array");
} catch (error) {
  fail("entity search", error);
}

try {
  const { status } = await api("/rpm/entity-search");
  strictEqual(status, 400);
  pass("GET /rpm/entity-search without params → 400");
} catch (error) {
  fail("entity search no params", error);
}

// ----- 404 -----
console.log("\n  --- 404 ---");

try {
  const { status } = await api("/nonexistent");
  strictEqual(status, 404);
  pass("Unknown path → 404");
} catch (error) {
  fail("404", error);
}

await stopServer();

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
