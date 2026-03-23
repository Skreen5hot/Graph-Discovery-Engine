/**
 * API Client — GDE Query Builder
 *
 * Typed fetch wrapper for all RPM API endpoints.
 * Uses VITE_API_BASE_URL env var (default: http://localhost:3000).
 * All data flows through the Phase 3 HTTP API — no kernel imports.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...opts?.headers,
    },
    ...opts,
  });
  return response.json() as Promise<T>;
}

export interface SubjectTypeEntry {
  classIri: string;
  label: string;
  description: string;
  intentCount: number;
}

export async function fetchSubjectTypes(): Promise<{ subjectTypes: SubjectTypeEntry[] }> {
  return apiFetch("/rpm/subject-types");
}

export async function fetchCatalog(subjectType?: string) {
  const path = subjectType
    ? `/rpm/catalog?subjectType=${encodeURIComponent(subjectType)}`
    : "/rpm/catalog";
  return apiFetch<any>(path);
}

export async function fetchCatalogEntry(shorthand: string) {
  return apiFetch<any>(`/rpm/catalog/${encodeURIComponent(shorthand)}`);
}

export async function postExpand(intent: string, subject: { "@id": string; "@type": string[] }) {
  return apiFetch<any>("/rpm/expand", {
    method: "POST",
    body: JSON.stringify({ intent, subject }),
  });
}

export async function postCompose(clauses: any[], mode: string) {
  return apiFetch<any>("/rpm/compose", {
    method: "POST",
    body: JSON.stringify({ clauses, composition: { mode } }),
  });
}

export async function postExecute(cgpC: any, subjectType: string) {
  return apiFetch<any>("/rpm/execute", {
    method: "POST",
    body: JSON.stringify({ cgpC, subjectType }),
  });
}

export async function searchEntities(rangeClass: string, query: string) {
  return apiFetch<any>(`/rpm/entity-search?type=${encodeURIComponent(rangeClass)}&q=${encodeURIComponent(query)}`);
}

export async function uploadGraph(file: File): Promise<{ mappingCount: number; subjectTypeCount: number }> {
  const formData = new FormData();
  formData.append("graph", file);
  const response = await fetch(`${API_BASE}/rpm/upload-graph`, {
    method: "POST",
    body: formData,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.userMessage ?? "Upload failed.");
  return { mappingCount: result.mappingCount, subjectTypeCount: result.subjectTypeCount };
}
