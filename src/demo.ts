/**
 * Demo Server — Phase 5.A.4
 *
 * Starts the RPM API server against a local JSON-LD graph file.
 * Usage: npm run demo -- ./data/jane-doe.jsonld
 */

import { runLocalDiscovery } from "./adapters/local/local-discovery.js";
import { registerRpmRoutes } from "./adapters/integration/rpm-api.js";
import { createHttpServer } from "./adapters/integration/http-server.js";
import type { ServerState } from "./adapters/integration/rpm-api.js";

const graphPath = process.argv[2] ?? "./data/jane-doe.jsonld";
const labelOverlayPath = process.argv[3] ?? undefined;

console.log(`Loading graph from ${graphPath}...`);
if (labelOverlayPath) {
  console.log(`Loading label overlay from ${labelOverlayPath}...`);
}

const { registry, catalog, report, closure, typeResolver, store } =
  await runLocalDiscovery(graphPath, {
    skipTier3: false,
    endpointLabel: `local:${graphPath}`,
    labelOverlayPath,
  });

console.log(`Discovered ${registry.mappings.length} mappings (` +
  `${catalog.subjectTypes.length} subject types)`);
console.log(`  smeSurface: ${registry.mappings.filter((m) => m.exposure === "smeSurface").length}`);
console.log(`  internal: ${registry.mappings.filter((m) => m.exposure === "internal").length}`);

const state: ServerState = {
  registry,
  catalog,
  closure,
  typeResolver,
  report,
  overrideStore: { "@type": "rpm:OverrideStore", version: "2.1.0", overrides: [] },
  overrideStorePath: "./rpm-overrides-demo.json",
  lastCrawlTimestamp: new Date().toISOString(),
  localStore: store,
};

const router = registerRpmRoutes(state);
const server = createHttpServer(router);
const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`\nDemo API ready at http://localhost:${port}`);
  console.log(`  GET http://localhost:${port}/rpm/subject-types`);
  console.log(`  GET http://localhost:${port}/rpm/catalog`);
  console.log(`  GET http://localhost:${port}/rpm/discovery-report  (X-RPM-Role: curator)`);
});
