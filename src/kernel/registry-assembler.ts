/**
 * Registry Assembly and Merge — RPM v2.1 §32.2, §32.9, §23
 *
 * Orchestrates the three-tier discovery pipeline and assembles the
 * in-memory Mapping Registry. Merges discovered mappings with optional
 * static registry (static wins on shorthand conflict).
 *
 * Builds the Intent Catalog: filtered to smeSurface, grouped by
 * ui.group, specificity-scored.
 *
 * Generates the Discovery Report (§32.10).
 *
 * Pure function: no I/O. Operates on pre-fetched tier results.
 * The adapter layer calls the tier generators and feeds results here.
 */

import type {
  MappingDefinition,
  MappingRegistry,
  MappingSource,
  IntentCatalog,
  SubjectTypeEntry,
  CatalogGroup,
  DiscoveryReport,
  Tier1Report,
  Tier2Report,
  Tier3Report,
  StaticOverrideReport,
  CatalogSizeReport,
  OntologyClosure,
  TypeResolver,
} from "./types.js";
import { resolveLabel } from "./labeling.js";
import type { PromotionLogEntry } from "./tier1-discovery.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input to the registry assembler — results from each tier. */
export interface TierResults {
  tier1: { mappings: MappingDefinition[]; promotionLog: PromotionLogEntry[] };
  tier2: { mappings: MappingDefinition[]; promotionLog: PromotionLogEntry[] };
  tier3: { mappings: MappingDefinition[]; promotionLog: PromotionLogEntry[] };
}

/** Optional static registry for merge. */
export interface StaticRegistry {
  mappings: MappingDefinition[];
}

/** Result of registry assembly. */
export interface AssemblyResult {
  registry: MappingRegistry;
  catalog: IntentCatalog;
  report: DiscoveryReport;
}

// ---------------------------------------------------------------------------
// §5.1 — Registry Merge
// ---------------------------------------------------------------------------

/**
 * Merge discovered and static registries (§5.1).
 * Static definitions override discovered definitions for identical shorthands.
 * All other discovered definitions are included.
 */
function mergeRegistries(
  discovered: MappingDefinition[],
  staticMappings: MappingDefinition[],
): { merged: MappingDefinition[]; conflicts: number } {
  const mergedMap = new Map<string, MappingDefinition>();
  let conflicts = 0;

  // Add all discovered
  for (const mapping of discovered) {
    mergedMap.set(mapping.shorthand, mapping);
  }

  // Override with static (static wins)
  for (const mapping of staticMappings) {
    if (mergedMap.has(mapping.shorthand)) {
      conflicts++;
    }
    mergedMap.set(mapping.shorthand, { ...mapping, source: "merged" as MappingSource });
  }

  return { merged: [...mergedMap.values()], conflicts };
}

/**
 * Apply Tier 2 precedence: Tier 2 mappings override Tier 1 for same shorthand (§32.5).
 */
function applyTierPrecedence(
  tier1: MappingDefinition[],
  tier2: MappingDefinition[],
): MappingDefinition[] {
  const combined = new Map<string, MappingDefinition>();

  // Add Tier 1 first
  for (const m of tier1) {
    combined.set(m.shorthand, m);
  }

  // Override with Tier 2 (Tier 2 wins for same shorthand)
  for (const m of tier2) {
    combined.set(m.shorthand, m);
  }

  return [...combined.values()];
}

// ---------------------------------------------------------------------------
// §32.6.3 Rule 5 — Existing Pairs Set
// ---------------------------------------------------------------------------

/**
 * Build the existingPairs set from Tier 1 and Tier 2 mappings.
 * Cross-product of domainClasses × rangeClasses for each mapping.
 */
function buildExistingPairs(mappings: MappingDefinition[]): Set<string> {
  const pairs = new Set<string>();
  for (const mapping of mappings) {
    for (const sc of mapping.domainClasses) {
      for (const oc of mapping.rangeClasses) {
        pairs.add(`${sc}|${oc}`);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// §23 — Intent Catalog
// ---------------------------------------------------------------------------

/**
 * Build the Intent Catalog from merged mappings (§23).
 * Filtered to smeSurface, grouped by ui.group, specificity-scored.
 */
function buildIntentCatalog(
  mappings: MappingDefinition[],
  closure: OntologyClosure,
): IntentCatalog {
  const smeSurface = mappings.filter((m) => m.exposure === "smeSurface");

  // Collect subject types
  const subjectTypeMap = new Map<string, { count: number; label: string; description: string }>();
  for (const m of smeSurface) {
    for (const dc of m.domainClasses) {
      const existing = subjectTypeMap.get(dc);
      if (existing) {
        existing.count++;
      } else {
        const res = resolveLabel(dc, closure);
        subjectTypeMap.set(dc, {
          count: 1,
          label: res.status === "resolved" ? res.label : "",
          description: "",
        });
      }
    }
  }

  const subjectTypes: SubjectTypeEntry[] = [...subjectTypeMap.entries()].map(
    ([classIri, info]) => ({
      classIri,
      label: info.label,
      description: info.description,
      intentCount: info.count,
    }),
  );

  // Group by ui.group
  const groupMap = new Map<string, MappingDefinition[]>();
  for (const m of smeSurface) {
    const groupName = m.ui.group || "General";
    const group = groupMap.get(groupName) ?? [];
    group.push(m);
    groupMap.set(groupName, group);
  }

  // Sort within each group by tier ascending, then label alphabetically.
  // Specificity ranking happens at query time (Phase 3.1 GET /rpm/catalog?subjectType=)
  // when the SME's selected subject type is known. The catalog stores the
  // stable default order: Tier 1 before Tier 2 before Tier 3, then alphabetical.
  const groups: CatalogGroup[] = [...groupMap.entries()].map(
    ([name, intents]) => ({
      name,
      intents: [...intents].sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return a.ui.label.localeCompare(b.ui.label);
      }),
    }),
  );

  // Sort groups alphabetically for determinism
  groups.sort((a, b) => a.name.localeCompare(b.name));

  return { subjectTypes, groups };
}

// ---------------------------------------------------------------------------
// §32.10 — Discovery Report
// ---------------------------------------------------------------------------

function buildDiscoveryReport(
  tierResults: TierResults,
  staticOverrides: StaticOverrideReport,
  catalogSize: CatalogSizeReport,
  endpoint: string,
  durationMs: number,
): DiscoveryReport {
  const tier1Log = tierResults.tier1.promotionLog;
  const tier2Log = tierResults.tier2.promotionLog;
  const tier3Log = tierResults.tier3.promotionLog;

  // Count from mappings directly — mappings array contains all discovered
  // (both smeSurface and internal). Do NOT add promotion log internal count
  // to mappings.length — that would double-count suppressed entries.
  const tier1: Tier1Report = {
    patternsFound: tierResults.tier1.mappings.length,
    promoted: tierResults.tier1.mappings.filter((m) => m.exposure === "smeSurface").length,
    suppressed: tierResults.tier1.mappings.filter((m) => m.exposure === "internal").length,
  };

  const tier2: Tier2Report = {
    chainsFound: tierResults.tier2.mappings.length,
    promoted: tierResults.tier2.mappings.filter((m) => m.exposure === "smeSurface").length,
    suppressed: tierResults.tier2.mappings.filter((m) => m.exposure === "internal").length,
  };

  const tier3: Tier3Report = {
    pathsAnalyzed: tierResults.tier3.mappings.length,
    compoundIntentsPromoted: tierResults.tier3.mappings.filter((m) => m.exposure === "smeSurface").length,
    suppressed: tierResults.tier3.mappings.filter((m) => m.exposure === "internal").length,
    capHit: tier3Log.filter((l) => l.reason.includes("cap")).length,
  };

  const labelingLawExhausted =
    [...tier1Log, ...tier2Log, ...tier3Log]
      .filter((l) => l.reason.includes("unresolvable")).length;

  return {
    "@type": "rpm:DiscoveryReport",
    timestamp: "", // Adapter sets this — kernel has no Date.now()
    endpoint,
    duration_ms: durationMs,
    tier1,
    tier2,
    tier3,
    staticOverrides,
    catalogSize,
    labelingLawExhausted,
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Main Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the complete Mapping Registry from tier results (§32.2, §5.1).
 *
 * Steps:
 * 1. Apply Tier 2 precedence over Tier 1 for same shorthand
 * 2. Combine Tier 1/2 with Tier 3
 * 3. Merge with optional static registry (static wins)
 * 4. Build Intent Catalog
 * 5. Generate Discovery Report
 *
 * @param tierResults - Results from each tier generator
 * @param closure - Ontology closure for catalog building
 * @param typeResolver - For specificity ranking
 * @param staticRegistry - Optional static overrides (static wins on conflict)
 * @param endpoint - SPARQL endpoint URL for the report
 * @param durationMs - Total crawl duration for the report
 * @returns Complete registry, catalog, and report
 */
export function assembleRegistry(
  tierResults: TierResults,
  closure: OntologyClosure,
  _typeResolver: TypeResolver,
  staticRegistry?: StaticRegistry,
  endpoint: string = "",
  durationMs: number = 0,
): AssemblyResult {
  // Step 1: Tier 2 overrides Tier 1 for same shorthand
  const tier1And2 = applyTierPrecedence(
    tierResults.tier1.mappings,
    tierResults.tier2.mappings,
  );

  // Step 2: Combine with Tier 3
  const allDiscovered = [...tier1And2, ...tierResults.tier3.mappings];

  // Step 3: Merge with static (if provided)
  const staticMappings = staticRegistry?.mappings ?? [];
  const { merged, conflicts } = mergeRegistries(allDiscovered, staticMappings);

  // Build the registry object
  const registry: MappingRegistry = {
    "@context": { rpm: "https://spec.example.org/rpm/v2/" },
    "@type": "rpm:MappingRegistry",
    version: "2.1.0",
    source: staticMappings.length > 0 ? "merged" : "discovered",
    generatedAt: "", // Adapter sets — kernel has no Date.now()
    graphEndpoint: endpoint,
    mappings: merged,
  };

  // Step 4: Build Intent Catalog
  const catalog = buildIntentCatalog(merged, closure);

  // Step 5: Discovery Report
  const catalogSize: CatalogSizeReport = {
    smeSurface: merged.filter((m) => m.exposure === "smeSurface").length,
    internal: merged.filter((m) => m.exposure === "internal").length,
  };

  const staticOverrides: StaticOverrideReport = {
    loaded: staticMappings.length,
    conflicts,
    conflictResolution: "staticWins",
  };

  const report = buildDiscoveryReport(
    tierResults,
    staticOverrides,
    catalogSize,
    endpoint,
    durationMs,
  );

  return { registry, catalog, report };
}

/**
 * Build the existingPairs set for Tier 3 exclusion from Tier 1/2 results.
 * Exported so the adapter orchestrator can build this before calling Tier 3.
 */
export { buildExistingPairs };
