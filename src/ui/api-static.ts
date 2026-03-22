/**
 * Static API Client — GDE Query Builder (Browser Demo Mode)
 *
 * Replaces api.ts when VITE_STATIC_DEMO is set. Runs the full discovery
 * pipeline in-browser and serves all API calls from in-memory state.
 * Same exported interface as api.ts — the UI code is unchanged.
 */

// Graph data imported as raw strings at build time
import graphRaw from "../../data/jane-doe.jsonld?raw";
import overlayRaw from "../../data/cco-labels.jsonld?raw";

import { runStaticDiscovery } from "../adapters/static/static-discovery.js";
import { rpmExpand } from "../kernel/expand.js";
import { rpmCompose } from "../kernel/compose.js";
import { rankBySpecificity } from "../kernel/compose.js";
import { translateError, buildTranslationContext } from "../kernel/error-translation.js";
import { isRPMError } from "../kernel/types.js";
import { executeLocalQuery, searchEntities as localSearchEntities } from "../adapters/local/local-executor.js";

import type {
  MappingRegistry,
  IntentCatalog,
  OntologyClosure,
  TypeResolver,
  RPMContext,
  CGP_c,
} from "../kernel/types.js";
import type { LocalTripleStore } from "../adapters/local/json-ld-loader.js";

// ---------------------------------------------------------------------------
// Re-export the SubjectTypeEntry interface to match api.ts
// ---------------------------------------------------------------------------

export interface SubjectTypeEntry {
  classIri: string;
  label: string;
  description: string;
  intentCount: number;
}

// ---------------------------------------------------------------------------
// Lazy Singleton — runs discovery on first API call
// ---------------------------------------------------------------------------

interface StaticState {
  registry: MappingRegistry;
  catalog: IntentCatalog;
  closure: OntologyClosure;
  typeResolver: TypeResolver;
  store: LocalTripleStore;
}

let statePromise: Promise<StaticState> | null = null;

function getState(): Promise<StaticState> {
  if (!statePromise) {
    statePromise = Promise.resolve().then(() => {
      const graphDoc = JSON.parse(graphRaw);
      const overlayDoc = JSON.parse(overlayRaw);
      const result = runStaticDiscovery(graphDoc, overlayDoc);
      return {
        registry: result.registry,
        catalog: result.catalog,
        closure: result.closure,
        typeResolver: result.typeResolver,
        store: result.store,
      };
    });
  }
  return statePromise;
}

// ---------------------------------------------------------------------------
// API Functions — same signatures as api.ts
// ---------------------------------------------------------------------------

export async function fetchSubjectTypes(): Promise<{ subjectTypes: SubjectTypeEntry[] }> {
  const state = await getState();
  return { subjectTypes: state.catalog.subjectTypes };
}

export async function fetchCatalog(subjectType?: string) {
  const state = await getState();

  if (subjectType) {
    const filtered = state.registry.mappings.filter(
      (m) =>
        m.exposure === "smeSurface" &&
        m.domainClasses.some((dc) =>
          state.typeResolver.isSubclassOf(subjectType, dc),
        ),
    );
    const ranked = rankBySpecificity(filtered, [subjectType], state.typeResolver);
    const compoundIntents = filtered
      .filter((m) => m.tier === 3)
      .sort((a, b) => (b.frequencyScore ?? 0) - (a.frequencyScore ?? 0));

    return { mappings: ranked, compoundIntents };
  }

  return state.catalog;
}

export async function fetchCatalogEntry(shorthand: string) {
  const state = await getState();
  const mapping = state.registry.mappings.find((m) => m.shorthand === shorthand);
  if (!mapping) return null;
  return { ...mapping, ui: { ...mapping.ui, originalLabel: null } };
}

export async function postExpand(intent: string, subject: { "@id": string; "@type": string[] }) {
  const state = await getState();
  const context: RPMContext = {
    mappingRegistry: state.registry,
    ontologyClosure: state.closure,
    typeResolver: state.typeResolver,
  };
  const result = rpmExpand(intent, subject, context);
  if (isRPMError(result)) {
    const mapping = state.registry.mappings.find((m) => m.shorthand === intent);
    const translationCtx = buildTranslationContext(mapping?.ui);
    return translateError(result, translationCtx);
  }
  return result;
}

export async function postCompose(clauses: any[], mode: string) {
  const state = await getState();
  const context: RPMContext = {
    mappingRegistry: state.registry,
    ontologyClosure: state.closure,
    typeResolver: state.typeResolver,
  };
  const cqo = { clauses, composition: { mode } };
  const result = rpmCompose(cqo as any, context);
  if (Array.isArray(result)) {
    return result.map((err) => {
      const mapping = state.registry.mappings.find((m) => m.shorthand === err.intent);
      return translateError(err, buildTranslationContext(mapping?.ui));
    });
  }
  return result;
}

export async function postExecute(cgpC: any, subjectType: string) {
  const state = await getState();
  const results = executeLocalQuery(cgpC as CGP_c, state.store, state.closure, state.registry);
  return { results, count: results.length };
}

export async function searchEntities(rangeClass: string, query: string) {
  const state = await getState();
  return localSearchEntities(rangeClass, query, state.store, state.closure);
}
