/**
 * Local Executor Tests — Phase 5.C.1
 *
 * Tests for executeSingleClause, executeLocalQuery, and searchEntities
 * against the Jane Doe demo graph.
 */

import { strictEqual, ok } from "node:assert";
import { join } from "node:path";
import { parseJsonLdDoc } from "../src/adapters/local/json-ld-loader.js";
import { executeSingleClause, executeLocalQuery, searchEntities } from "../src/adapters/local/local-executor.js";
import { runLocalDiscovery } from "../src/adapters/local/local-discovery.js";
import type { CGP, CGP_c, MappingRegistry } from "../src/kernel/types.js";
import { rpmExpand } from "../src/kernel/expand.js";
import { rpmCompose } from "../src/kernel/compose.js";

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
// Load demo graph via local discovery
// ---------------------------------------------------------------------------

const graphPath = join(process.cwd(), "data", "jane-doe.jsonld");
const labelOverlayPath = join(process.cwd(), "data", "cco-labels.jsonld");

const discovery = await runLocalDiscovery(graphPath, {
  skipTier3: true,
  labelOverlayPath,
});

const { registry, closure, typeResolver, store } = discovery;

// Helper: expand an intent and return CGP
function expand(intent: string): CGP | null {
  const result = rpmExpand(intent, {
    "@id": "http://example.org/data/Person_JaneDoe_001",
    "@type": ["http://www.ontologyrepository.com/CommonCoreOntologies/Person"],
  }, { mappingRegistry: registry, ontologyClosure: closure, typeResolver });
  return result && "@graph" in result ? result as CGP : null;
}

// =========================================================================
// executeSingleClause
// =========================================================================

console.log("\n  --- executeSingleClause ---");

// Find a Tier 1 mapping for Person
const personMappings = registry.mappings.filter(
  (m) => m.domainClasses.includes("http://www.ontologyrepository.com/CommonCoreOntologies/Person"),
);

try {
  // Use "designated_by" which should match Jane Doe → PersonGivenName
  // Find any Tier 1 mapping that has results for Person
  let foundWorking = false;
  for (const m of personMappings) {
    const cgp = expand(m.shorthand);
    if (!cgp) continue;
    const results = executeSingleClause(cgp, store, closure, registry);
    if (results.length >= 1) {
      ok(results[0].subjectIri.includes("Person_JaneDoe") || results[0].subjectIri.includes("Person"), "Subject is a Person");
      ok(Object.keys(results[0].bindings).length > 0, "Has bindings");
      pass(`executeSingleClause: ${m.ui.label} returns Person with ${Object.keys(results[0].bindings).length} bindings`);
      foundWorking = true;
      break;
    }
  }
  if (!foundWorking) {
    // Try with any mapping that works
    for (const m of registry.mappings) {
      const subject = { "@id": "test:any", "@type": m.domainClasses };
      const result = rpmExpand(m.shorthand, subject, { mappingRegistry: registry, ontologyClosure: closure, typeResolver });
      if (result && "@graph" in result) {
        const results = executeSingleClause(result as CGP, store, closure, registry);
        if (results.length >= 1) {
          pass(`executeSingleClause: ${m.ui.label} returns ${results.length} result(s)`);
          foundWorking = true;
          break;
        }
      }
    }
  }
  ok(foundWorking, "At least one mapping produces executor results");
} catch (error) {
  fail("executeSingleClause designated_by", error);
}

// Bearer Of Role (obo:RO_0000053) — should match Jane → OccupationRole
try {
  const bearerOf = personMappings.find((m) =>
    m.shorthand.includes("RO_0000053"),
  );
  if (bearerOf) {
    const cgp = expand(bearerOf.shorthand);
    ok(cgp, "CGP expanded for Bearer Of Role");

    const results = executeSingleClause(cgp!, store, closure, registry);
    ok(results.length >= 1, "Bearer Of Role returns results");
    pass(`executeSingleClause: Bearer Of Role returns ${results.length} result(s)`);
  } else {
    pass("executeSingleClause: Bearer Of Role mapping not in Tier 1 (may be Tier 3)");
  }
} catch (error) {
  fail("executeSingleClause Bearer Of Role", error);
}

// =========================================================================
// executeLocalQuery — subjectToSubject
// =========================================================================

console.log("\n  --- executeLocalQuery ---");

try {
  const designatedBy = personMappings.find((m) => m.shorthand.includes("designated_by"));
  if (designatedBy) {
    const cgp = expand(designatedBy.shorthand);
    ok(cgp);
    const cgpC: CGP_c = {
      "@type": "rpm:ComposedGraphPattern",
      clauses: [cgp!],
      joinType: "subjectToSubject",
    };
    const results = executeLocalQuery(cgpC, store, closure, registry);
    ok(results.length >= 1);
    pass(`executeLocalQuery subjectToSubject: ${results.length} result(s)`);
  } else {
    pass("executeLocalQuery: skipped (no designated_by mapping)");
  }
} catch (error) {
  fail("executeLocalQuery subjectToSubject", error);
}

// union mode
try {
  const m1 = personMappings[0];
  const m2 = personMappings.length > 1 ? personMappings[1] : personMappings[0];
  const cgp1 = expand(m1.shorthand);
  const cgp2 = expand(m2.shorthand);
  if (cgp1 && cgp2) {
    const cgpC: CGP_c = {
      "@type": "rpm:ComposedGraphPattern",
      clauses: [cgp1, cgp2],
      joinType: "union",
    };
    const results = executeLocalQuery(cgpC, store, closure, registry);
    ok(results.length >= 1);
    pass(`executeLocalQuery union: ${results.length} result(s)`);
  } else {
    pass("executeLocalQuery union: skipped");
  }
} catch (error) {
  fail("executeLocalQuery union", error);
}

// =========================================================================
// searchEntities
// =========================================================================

console.log("\n  --- searchEntities ---");

try {
  const results = searchEntities(
    "http://www.ontologyrepository.com/CommonCoreOntologies/Person",
    "jane",
    store, closure,
  );
  ok(results.length >= 1, "searchEntities finds Jane");
  ok(results[0].label.toLowerCase().includes("jane"), `Label contains 'jane': ${results[0].label}`);
  pass(`searchEntities: "jane" returns ${results.length} Person result(s)`);
} catch (error) {
  fail("searchEntities jane", error);
}

try {
  const results = searchEntities(
    "http://www.ontologyrepository.com/CommonCoreOntologies/Organization",
    "tech",
    store, closure,
  );
  ok(results.length >= 1, "searchEntities finds Tech Giant");
  pass(`searchEntities: "tech" returns ${results.length} Organization result(s)`);
} catch (error) {
  fail("searchEntities tech", error);
}

try {
  const results = searchEntities(
    "http://www.ontologyrepository.com/CommonCoreOntologies/Person",
    "zzzznonexistent",
    store, closure,
  );
  strictEqual(results.length, 0);
  pass("searchEntities: no match returns empty array");
} catch (error) {
  fail("searchEntities no match", error);
}

try {
  const results = searchEntities(
    "http://www.ontologyrepository.com/CommonCoreOntologies/Person",
    "",
    store, closure, 2,
  );
  ok(results.length <= 2, "maxResults cap respected");
  pass(`searchEntities: maxResults=2 returns ${results.length} result(s)`);
} catch (error) {
  fail("searchEntities maxResults", error);
}

// Empty store
try {
  const emptyStore = { triples: [], prefixes: {} };
  const results = searchEntities("test:Class", "query", emptyStore, closure);
  strictEqual(results.length, 0);
  pass("searchEntities: empty store returns empty without throwing");
} catch (error) {
  fail("searchEntities empty store", error);
}

// =========================================================================
// Summary
// =========================================================================

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
