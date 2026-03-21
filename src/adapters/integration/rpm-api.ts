/**
 * RPM API Routes — Phase 3
 *
 * HTTP endpoints for the RPM v2.1 Discovery Engine.
 * All routes use the kernel's pure functions and return JSON responses.
 * Adapter-layer code — MUST NOT be imported by kernel.
 *
 * Endpoints:
 * - GET  /rpm/subject-types         — S1 subject type cards
 * - GET  /rpm/catalog               — full or filtered intent catalog
 * - GET  /rpm/catalog/:shorthand    — single catalog entry
 * - POST /rpm/expand                — expand intent to CGP
 * - POST /rpm/compose               — compose multiple intents to CGP_c
 * - GET  /rpm/overrides             — list all label overrides
 * - POST /rpm/overrides             — create/replace label override
 * - DELETE /rpm/overrides/:overrideId — remove override
 * - POST /rpm/refresh               — trigger schema re-crawl
 * - GET  /rpm/discovery-report      — latest discovery report
 * - GET  /rpm/entity-search         — live entity search
 */

import type { ServerResponse } from "node:http";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouter, sendJson, sendError, type ParsedRequest } from "./http-server.js";
import { rpmExpand } from "../../kernel/expand.js";
import { rpmCompose } from "../../kernel/compose.js";
import { rankBySpecificity } from "../../kernel/compose.js";
import { translateError, buildTranslationContext } from "../../kernel/error-translation.js";
import { generateOverrideId } from "../../kernel/deterministic-id.js";
import { isRPMError } from "../../kernel/types.js";
import { executeLocalQuery, searchEntities } from "../local/local-executor.js";
import { runLocalDiscovery } from "../local/local-discovery.js";
import type { LocalTripleStore } from "../local/json-ld-loader.js";
import type {
  MappingRegistry,
  MappingDefinition,
  IntentCatalog,
  OntologyClosure,
  TypeResolver,
  DiscoveryReport,
  OverrideStore,
  OverrideEntry,
  Subject,
  CQO,
  CGP_c,
  RPMContext,
} from "../../kernel/types.js";

// ---------------------------------------------------------------------------
// Server State
// ---------------------------------------------------------------------------

/** Mutable server state managed by the adapter layer. */
export interface ServerState {
  registry: MappingRegistry;
  catalog: IntentCatalog;
  closure: OntologyClosure;
  typeResolver: TypeResolver;
  report: DiscoveryReport;
  overrideStore: OverrideStore;
  overrideStorePath: string;
  lastCrawlTimestamp: string;
  /** Callback to trigger a re-crawl. Adapter provides this. */
  onRefresh?: () => Promise<{ newMappingCount: number }>;
  /** Present when running in local graph mode. Enables executeLocalQuery and entity search. */
  localStore?: LocalTripleStore;
}

// ---------------------------------------------------------------------------
// Role Guards
// ---------------------------------------------------------------------------

function requireRole(
  req: ParsedRequest,
  res: ServerResponse,
  ...allowedRoles: Array<"sme" | "curator">
): boolean {
  if (req.role === null) {
    sendError(res, 401, "Authentication required.");
    return false;
  }
  if (!allowedRoles.includes(req.role)) {
    sendError(res, 403, "You do not have permission to perform this action.");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Override Store Persistence
// ---------------------------------------------------------------------------

async function loadOverrideStore(path: string): Promise<OverrideStore> {
  try {
    const data = await readFile(path, "utf8");
    return JSON.parse(data) as OverrideStore;
  } catch {
    return { "@type": "rpm:OverrideStore", version: "2.1.0", overrides: [] };
  }
}

async function saveOverrideStore(path: string, store: OverrideStore): Promise<void> {
  await writeFile(path, JSON.stringify(store, null, 2), "utf8");
}

/**
 * Apply overrides to the registry's mappings.
 * Overrides > static > discovered (§35.3).
 */
function applyOverrides(
  registry: MappingRegistry,
  overrides: OverrideEntry[],
): void {
  for (const override of overrides) {
    const mapping = registry.mappings.find((m) => m.shorthand === override.shorthand);
    if (!mapping) continue;

    if (override.label !== null) mapping.ui.label = override.label;
    if (override.description !== null) mapping.ui.description = override.description;
    if (override.group !== null) mapping.ui.group = override.group;
    if (override.examples !== null) mapping.ui.examples = override.examples;
  }
}

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

/**
 * Register all RPM API routes on a router.
 *
 * @param state - Mutable server state (registry, catalog, closure, etc.)
 * @returns The configured router
 */
// ---------------------------------------------------------------------------
// Multipart Helpers (for graph upload)
// ---------------------------------------------------------------------------

/**
 * Extract the file content from a multipart/form-data body.
 * Minimal parser: handles a single file field only.
 */
function extractMultipartFile(body: Buffer, contentType: string): string {
  // Extract boundary from Content-Type
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) return body.toString("utf8");

  const boundary = boundaryMatch[1];
  const bodyStr = body.toString("utf8");

  // Split on boundary
  const parts = bodyStr.split(`--${boundary}`);

  // Find the part with file content (skip preamble and epilogue)
  for (const part of parts) {
    if (part.trim() === "" || part.trim() === "--") continue;

    // Find the double CRLF that separates headers from body
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headers = part.substring(0, headerEnd);
    if (headers.includes("Content-Disposition") && headers.includes("filename")) {
      return part.substring(headerEnd + 4).replace(/\r\n$/, "");
    }
  }

  // Fallback: return everything after the first double CRLF
  const firstPart = parts.find((p) => p.includes("Content-Disposition"));
  if (firstPart) {
    const headerEnd = firstPart.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      return firstPart.substring(headerEnd + 4).replace(/\r\n$/, "");
    }
  }

  return body.toString("utf8");
}

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerRpmRoutes(state: ServerState) {
  const router = createRouter();

  // ----- GET /rpm/subject-types -----
  router.get("/rpm/subject-types", async (_req, res) => {
    sendJson(res, 200, {
      subjectTypes: state.catalog.subjectTypes,
    });
  });

  // ----- GET /rpm/catalog -----
  router.get("/rpm/catalog", async (req, res) => {
    const subjectType = req.query.subjectType;

    if (subjectType) {
      // Filter to mappings whose domainClasses include the subject type
      const filtered = state.registry.mappings.filter(
        (m) => m.exposure === "smeSurface" &&
          m.domainClasses.some((dc) =>
            state.typeResolver.isSubclassOf(subjectType, dc),
          ),
      );

      // Specificity-ranked mappings (Phase 3.1 query-time ranking)
      const ranked = rankBySpecificity(filtered, [subjectType], state.typeResolver);

      // Compound Intents (Tier 3) ranked by frequencyScore descending
      const compoundIntents = filtered
        .filter((m) => m.tier === 3)
        .sort((a, b) => (b.frequencyScore ?? 0) - (a.frequencyScore ?? 0));

      sendJson(res, 200, { mappings: ranked, compoundIntents });
    } else {
      // Full catalog
      sendJson(res, 200, state.catalog);
    }
  });

  // ----- GET /rpm/catalog/:shorthand -----
  router.get("/rpm/catalog/:shorthand", async (req, res) => {
    const shorthand = req.params.shorthand;
    const mapping = state.registry.mappings.find((m) => m.shorthand === shorthand);

    if (!mapping) {
      sendError(res, 404, "This search type was not found.");
      return;
    }

    // Include originalLabel for M4 Revert
    const override = state.overrideStore.overrides.find((o) => o.shorthand === shorthand);
    const originalMapping = state.registry.mappings.find((m) => m.shorthand === shorthand);

    sendJson(res, 200, {
      ...mapping,
      ui: {
        ...mapping.ui,
        originalLabel: override ? getOriginalLabel(shorthand, state) : null,
      },
    });
  });

  // ----- POST /rpm/expand -----
  router.post("/rpm/expand", async (req, res) => {
    const body = req.body as { intent?: string; subject?: Subject } | undefined;
    if (!body?.intent || !body?.subject) {
      sendError(res, 400, "Request must include 'intent' and 'subject' fields.", "validation");
      return;
    }

    const context: RPMContext = {
      mappingRegistry: state.registry,
      ontologyClosure: state.closure,
      typeResolver: state.typeResolver,
    };

    const result = rpmExpand(body.intent, body.subject, context);

    if (isRPMError(result)) {
      const mapping = state.registry.mappings.find((m) => m.shorthand === body.intent);
      const translationCtx = buildTranslationContext(mapping?.ui);
      const translated = translateError(result, translationCtx);
      sendJson(res, 422, translated);
    } else {
      sendJson(res, 200, result);
    }
  });

  // ----- POST /rpm/compose -----
  router.post("/rpm/compose", async (req, res) => {
    const body = req.body as CQO | undefined;
    if (!body?.clauses || !body?.composition) {
      sendError(res, 400, "Request must include 'clauses' and 'composition' fields.", "validation");
      return;
    }

    const context: RPMContext = {
      mappingRegistry: state.registry,
      ontologyClosure: state.closure,
      typeResolver: state.typeResolver,
    };

    const result = rpmCompose(body, context);

    if (Array.isArray(result)) {
      // Errors — translate each
      const translated = result.map((err) => {
        const mapping = state.registry.mappings.find((m) => m.shorthand === err.intent);
        return translateError(err, buildTranslationContext(mapping?.ui));
      });
      sendJson(res, 422, translated);
    } else {
      sendJson(res, 200, result);
    }
  });

  // ----- GET /rpm/overrides -----
  router.get("/rpm/overrides", async (req, res) => {
    if (!requireRole(req, res, "sme", "curator")) return;

    // Include originalLabel per entry for Override History UI
    const enriched = state.overrideStore.overrides.map((o) => ({
      ...o,
      originalLabel: getOriginalLabel(o.shorthand, state),
    }));

    sendJson(res, 200, { overrides: enriched, count: enriched.length });
  });

  // ----- POST /rpm/overrides -----
  router.post("/rpm/overrides", async (req, res) => {
    if (!requireRole(req, res, "curator")) return;

    const body = req.body as {
      shorthand?: string;
      label?: string | null;
      description?: string | null;
      group?: string | null;
      examples?: string[] | null;
      appliesTo?: string;
    } | undefined;

    if (!body?.shorthand) {
      sendError(res, 400, "Request must include a 'shorthand' field.", "validation");
      return;
    }

    // Validate at least one overrideable field is non-null
    if (body.label === undefined && body.description === undefined &&
        body.group === undefined && body.examples === undefined) {
      sendError(res, 400, "At least one field (label, description, group, or examples) must be provided.", "validation");
      return;
    }

    // Validate shorthand exists in registry
    const mapping = state.registry.mappings.find((m) => m.shorthand === body.shorthand);
    if (!mapping) {
      sendError(res, 404, "The specified search type was not found.", "validation");
      return;
    }

    // Capture the pre-override label BEFORE mutation
    const originalLabel = mapping.ui.label;

    const now = new Date().toISOString();
    const overrideId = generateOverrideId(body.shorthand, now);

    const entry: OverrideEntry = {
      overrideId,
      shorthand: body.shorthand,
      label: body.label ?? null,
      description: body.description ?? null,
      group: body.group ?? null,
      examples: body.examples ?? null,
      createdAt: now,
      createdBy: req.role ?? "unknown",
      appliesTo: (body.appliesTo as "discovered" | "static" | "any") ?? "discovered",
      originalLabel,
    };

    // Replace existing override for same shorthand (§35.4)
    state.overrideStore.overrides = state.overrideStore.overrides.filter(
      (o) => o.shorthand !== body.shorthand,
    );
    state.overrideStore.overrides.push(entry);

    // Persist
    await saveOverrideStore(state.overrideStorePath, state.overrideStore);

    // Partial catalog rebuild — apply override to registry (§35.5)
    applyOverrides(state.registry, [entry]);

    sendJson(res, 200, {
      overrideId,
      shorthand: body.shorthand,
      label: entry.label,
      appliedAt: now,
      catalogRebuilt: true,
    });
  });

  // ----- DELETE /rpm/overrides/:overrideId -----
  router.delete("/rpm/overrides/:overrideId", async (req, res) => {
    if (!requireRole(req, res, "curator")) return;

    const overrideId = req.params.overrideId;
    const override = state.overrideStore.overrides.find((o) => o.overrideId === overrideId);

    if (!override) {
      sendError(res, 404, "This override was not found.");
      return;
    }

    const shorthand = override.shorthand;

    // Remove from store
    state.overrideStore.overrides = state.overrideStore.overrides.filter(
      (o) => o.overrideId !== overrideId,
    );

    // Restore the original label on the in-memory mapping
    const mapping = state.registry.mappings.find((m) => m.shorthand === shorthand);
    if (mapping && override.originalLabel) {
      mapping.ui.label = override.originalLabel;
    }

    // Persist
    await saveOverrideStore(state.overrideStorePath, state.overrideStore);

    sendJson(res, 200, {
      overrideId,
      shorthand,
      revertedTo: "discovered",
      catalogRebuilt: true,
    });
  });

  // ----- POST /rpm/refresh -----
  router.post("/rpm/refresh", async (req, res) => {
    if (!requireRole(req, res, "curator")) return;

    if (!state.onRefresh) {
      sendError(res, 501, "Refresh is not configured.");
      return;
    }

    try {
      const { newMappingCount } = await state.onRefresh();
      state.lastCrawlTimestamp = new Date().toISOString();
      sendJson(res, 200, {
        refreshed: true,
        newSearchTypes: newMappingCount,
        timestamp: state.lastCrawlTimestamp,
      });
    } catch {
      sendError(res, 503, "The data source could not be reached during startup. Please contact your system administrator.");
    }
  });

  // ----- GET /rpm/discovery-report -----
  router.get("/rpm/discovery-report", async (req, res) => {
    if (!requireRole(req, res, "curator")) return;
    sendJson(res, 200, state.report);
  });

  // ----- POST /rpm/execute -----
  router.post("/rpm/execute", async (req, res) => {
    const body = req.body as { cgpC?: CGP_c; subjectType?: string } | undefined;
    if (!body?.cgpC) {
      sendError(res, 400, "Request must include a 'cgpC' field.", "validation");
      return;
    }

    if (!state.localStore) {
      sendError(res, 501, "Query execution against a remote endpoint is not yet available.");
      return;
    }

    try {
      const results = executeLocalQuery(body.cgpC, state.localStore, state.closure, state.registry);
      sendJson(res, 200, { results, count: results.length });
    } catch {
      sendError(res, 500, "An unexpected error occurred during query execution. Please contact your system administrator.");
    }
  });

  // ----- GET /rpm/entity-search -----
  router.get("/rpm/entity-search", async (req, res) => {
    const rangeClass = req.query.type;
    const query = req.query.q;

    if (!rangeClass || !query) {
      sendError(res, 400, "Request must include 'type' and 'q' query parameters.", "validation");
      return;
    }

    // Entity search is always live — never cached (§32.9.4).
    if (state.localStore) {
      const results = searchEntities(rangeClass, query, state.localStore, state.closure);
      sendJson(res, 200, { results, query, rangeClass });
      return;
    }

    // No local store — return empty (SPARQL mode, Phase 6)
    sendJson(res, 200, {
      results: [],
      query,
      rangeClass,
    });
  });

  // ----- POST /rpm/upload-graph -----
  router.post("/rpm/upload-graph", async (req, res) => {
    try {
      // Use raw body buffer from the router (already read)
      const bodyBuf = req.rawBody ?? Buffer.alloc(0);

      // Check size limit (5MB)
      if (bodyBuf.length > 5 * 1024 * 1024) {
        sendError(res, 413, "The uploaded file is too large. Maximum size is 5MB.");
        return;
      }

      // Extract file content from multipart or raw JSON
      let fileContent: string;
      const contentType = req.raw.headers["content-type"] ?? "";

      if (contentType.includes("multipart/form-data")) {
        fileContent = extractMultipartFile(bodyBuf, contentType);
      } else {
        fileContent = bodyBuf.toString("utf8");
      }

      // Parse JSON
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(fileContent);
      } catch {
        sendError(res, 400, "The uploaded file is not valid JSON. Please check the file and try again.");
        return;
      }

      // Validate JSON-LD structure
      if (!doc["@context"]) {
        sendError(res, 400, "The uploaded file does not appear to be a JSON-LD document. It must contain an @context field.");
        return;
      }

      // Write to temp file
      const tempPath = join(tmpdir(), `rpm-upload-${Date.now()}.jsonld`);
      await writeFile(tempPath, fileContent, "utf8");

      // Run discovery
      const result = await runLocalDiscovery(tempPath, { skipTier3: false });

      // Atomic state swap
      state.registry = result.registry;
      state.catalog = result.catalog;
      state.report = result.report;
      state.closure = result.closure;
      state.typeResolver = result.typeResolver;
      state.localStore = result.store;
      state.lastCrawlTimestamp = new Date().toISOString();

      // Clean up temp file
      await unlink(tempPath).catch(() => {});

      sendJson(res, 200, {
        success: true,
        mappingCount: result.registry.mappings.length,
        subjectTypeCount: result.catalog.subjectTypes.length,
        timestamp: state.lastCrawlTimestamp,
      });
    } catch (err) {
      sendError(res, 500, "Discovery could not be completed. Please check that the file is a valid JSON-LD document and try again.");
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the original (pre-override) label for a mapping.
 * Reads from the OverrideEntry.originalLabel captured at creation time.
 */
function getOriginalLabel(shorthand: string, state: ServerState): string | null {
  const override = state.overrideStore.overrides.find((o) => o.shorthand === shorthand);
  return override?.originalLabel ?? null;
}
