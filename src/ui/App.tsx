import { useState } from "react";
import { SubjectSelection } from "./screens/SubjectSelection.js";
import { QueryBuilder } from "./screens/QueryBuilder.js";
import { QueryReview } from "./screens/QueryReview.js";
import { ResultsView } from "./screens/ResultsView.js";
import { postCompose, fetchCatalogEntry } from "./api.js";
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

      // Build result rows from composed CGP
      const resultRows = (composed.clauses ?? []).map((cgp: any, i: number) => {
        const graph = cgp["@graph"] ?? [];
        const mapping = mappingDetails[i];
        const ui = mapping?.ui;
        const pattern = mapping?.pattern;

        // Find subject node (non-blank-node)
        const subjectNode = graph.find((n: any) => !String(n["@id"]).startsWith("_:"));
        const subjectId = subjectNode?.["@id"] ?? "";
        const subjectLabel = resolveDisplayLabel(subjectId, ui?.subjectLabel ?? selectedType!.label);

        // Find bound output node (has rpm:role)
        const boundNode = graph.find((n: any) => n["rpm:role"]);
        const boundId = boundNode?.["@id"] ?? "";
        const outputBindLabel = ui?.outputBinds?.[0]?.label ?? "Result";
        const objectLabel = resolveDisplayLabel(boundId, outputBindLabel);

        // Build cell values: outputBind.label → resolved bound node label
        const values: Record<string, string> = {};
        if (ui?.outputBinds) {
          for (const ob of ui.outputBinds) {
            const roleNode = graph.find((n: any) => n["rpm:role"] === ob.role);
            values[ob.label] = roleNode
              ? resolveDisplayLabel(roleNode["@id"], ob.label)
              : "";
          }
        }

        // Generate narrative using the kernel function
        let narrativeSummary = `${subjectLabel} is linked to ${objectLabel}.`;
        let narrativePath: Array<{ role: string; label: string }> = [];

        if (ui && pattern) {
          try {
            // Empty closure — labels resolved via IRI cleaning fallback
            const emptyClosure = { classes: new Map(), properties: new Map() };
            const narrative = generateNarrative(
              cgp,
              ui,
              clauses[i].intent,
              mapping.tier ?? 1,
              pattern,
              emptyClosure,
              subjectLabel,
              objectLabel,
            );
            narrativeSummary = narrative.narrativeSummary;
            narrativePath = narrative.narrativePath;
          } catch {
            // Fallback if narrative generation fails
          }
        }

        return {
          id: i,
          values,
          narrativeSummary,
          narrativePath,
        };
      });

      // Column headers from outputBind.label (not intent label)
      const columns = mappingDetails
        .filter(Boolean)
        .flatMap((m: any) => (m.ui?.outputBinds ?? []).map((ob: any) => ob.label))
        .filter((label: string, idx: number, arr: string[]) => arr.indexOf(label) === idx);

      setResults({
        rows: resultRows.length > 0 ? resultRows : [
          { id: 0, values: {}, narrativeSummary: `No results found for ${selectedType!.label}.`, narrativePath: [] },
        ],
        columns: columns.length > 0 ? columns : clauses.map((c) => c.label),
      });
      setScreen("results");
    } catch (err) {
      setError("An unexpected error occurred. Please contact your system administrator.");
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
