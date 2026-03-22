import { useState } from "react";
import { SubjectSelection } from "./screens/SubjectSelection.js";
import { QueryBuilder } from "./screens/QueryBuilder.js";
import { QueryReview } from "./screens/QueryReview.js";
import { ResultsView } from "./screens/ResultsView.js";
import { postCompose, postExecute, fetchCatalogEntry } from "./api.js";
import type { ClauseData } from "./screens/IntentDetailPanel.js";

// The one permitted kernel import in the UI — generateNarrative is pure, no I/O
import { generateNarrative } from "../kernel/narrative.js";
import { cleanLocalName, extractLocalName, evaluateQualityThreshold } from "../kernel/labeling.js";

export type Screen = "subject-selection" | "query-builder" | "query-review" | "results";

/**
 * Resolve a display label from an @id.
 * Blank nodes → class fallback. IRIs → IRI cleaning.
 */
function resolveDisplayLabel(id: string, fallback: string): string {
  if (!id || id.startsWith("_:")) return fallback;
  const localName = extractLocalName(id);
  const cleaned = cleanLocalName(localName);
  const threshold = evaluateQualityThreshold(cleaned);
  return threshold === null ? cleaned : fallback;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("subject-selection");
  const [selectedType, setSelectedType] = useState<{
    classIri: string;
    label: string;
  } | null>(null);
  const [clauses, setClauses] = useState<ClauseData[]>([]);
  const [compositionMode, setCompositionMode] = useState("subjectToSubject");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleRunSearch = async () => {
    if (!selectedType || clauses.length === 0) return;
    setLoading(true);
    setError(undefined);
    try {
      const composed = await postCompose(
        clauses.map((c) => ({
          intent: c.intent,
          subject: { "@id": `query:${selectedType.classIri}`, "@type": [selectedType.classIri] },
        })),
        compositionMode,
      );

      if (composed["@type"] === "rpm:TranslatedError" || Array.isArray(composed)) {
        const msg = Array.isArray(composed)
          ? composed.map((e: any) => e.userMessage).join("; ")
          : composed.userMessage;
        setError(msg);
        setLoading(false);
        return;
      }

      // Fetch mapping details for each clause to get ui blocks and patterns
      const mappingDetails = await Promise.all(
        clauses.map((c) => fetchCatalogEntry(c.intent).catch(() => null)),
      );

      // Execute the composed query against the triple store
      const executeResult = await postExecute(composed, selectedType!.classIri);
      const queryResults: Array<{ subjectIri: string; subjectLabel?: string; bindings: Record<string, string> }> =
        executeResult.results ?? [];

      // Build result rows from QueryResult[]
      const resultRows = queryResults.map((qr, i) => {
        const subjectLabel = qr.subjectLabel ?? resolveDisplayLabel(qr.subjectIri, selectedType!.label);

        // The executor returns bindings keyed by outputBind.label
        // (e.g., "Date Identifier", "Email Address", "Designative Name").
        // These keys already match the column headers. Use them directly.
        const values: Record<string, string> = { ...qr.bindings };

        // Generate narrative using first available mapping
        const objectLabel = Object.values(qr.bindings)[0] ?? "";
        const mapping0 = mappingDetails.find(Boolean);
        let narrativeSummary = `${subjectLabel} is linked to ${objectLabel}.`;
        let narrativePath: Array<{ role: string; label: string }> = [];

        if (mapping0?.ui && mapping0?.pattern) {
          try {
            const emptyClosure = { classes: new Map(), properties: new Map() };
            const narrative = generateNarrative(
              composed.clauses?.[0] ?? { "@context": {}, "@graph": [], provenance: { "@type": "Provenance", kernelVersion: "0.1.0", rulesApplied: [] } },
              mapping0.ui,
              clauses[0].intent,
              mapping0.tier ?? 1,
              mapping0.pattern,
              emptyClosure,
              subjectLabel,
              objectLabel,
            );
            narrativeSummary = narrative.narrativeSummary;
            narrativePath = narrative.narrativePath;
          } catch {
            // Fallback
          }
        }

        return { id: i, values, narrativeSummary, narrativePath };
      });

      // Column headers: merge outputBind labels AND binding keys from results.
      // Literal-type clauses have empty outputBinds, so their columns only
      // appear in the binding keys. Deduplicate while preserving order.
      const outputBindColumns = mappingDetails
        .filter(Boolean)
        .flatMap((m: any) => (m.ui?.outputBinds ?? []).map((ob: any) => ob.label));

      const bindingKeyColumns = queryResults.length > 0
        ? Object.keys(queryResults[0].bindings)
        : [];

      const allColumns = [...outputBindColumns, ...bindingKeyColumns];
      const effectiveColumns = allColumns.length > 0
        ? allColumns.filter((label, idx, arr) => arr.indexOf(label) === idx)
        : clauses.map((c) => c.label);

      setResults({
        rows: resultRows.length > 0 ? resultRows : [
          { id: 0, values: {}, narrativeSummary: `No results found for ${selectedType!.label}.`, narrativePath: [] },
        ],
        columns: effectiveColumns,
      });
      setScreen("results");
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please contact your system administrator.");
    }
    setLoading(false);
  };

  return (
    <div className="app-container">
      {screen === "subject-selection" && (
        <SubjectSelection
          onSelect={(classIri, label) => {
            setSelectedType({ classIri, label });
            setClauses([]);
            setScreen("query-builder");
          }}
        />
      )}
      {screen === "query-builder" && selectedType && (
        <QueryBuilder
          subjectType={selectedType}
          onChangeType={() => {
            setClauses([]);
            setScreen("subject-selection");
          }}
          onReview={(newClauses, mode) => {
            setClauses(newClauses);
            setCompositionMode(mode);
            setScreen("query-review");
          }}
        />
      )}
      {screen === "query-review" && selectedType && (
        <QueryReview
          subjectLabel={selectedType.label}
          clauses={clauses}
          compositionMode={compositionMode}
          onEdit={() => setScreen("query-builder")}
          onBack={() => setScreen("query-builder")}
          onSubmit={handleRunSearch}
          loading={loading}
          error={error}
        />
      )}
      {screen === "results" && selectedType && results && (
        <ResultsView
          results={results.rows}
          columns={results.columns}
          subjectLabel={selectedType.label}
          onRefine={() => setScreen("query-builder")}
        />
      )}
    </div>
  );
}
