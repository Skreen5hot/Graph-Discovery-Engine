import { useState } from "react";
import { SubjectSelection } from "./screens/SubjectSelection.js";
import { QueryBuilder } from "./screens/QueryBuilder.js";
import { QueryReview } from "./screens/QueryReview.js";
import { ResultsView } from "./screens/ResultsView.js";
import { postCompose } from "./api.js";
import type { ClauseData } from "./screens/IntentDetailPanel.js";

export type Screen = "subject-selection" | "query-builder" | "query-review" | "results";

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

      // Build result rows from composed CGP
      const resultRows = (composed.clauses ?? []).map((cgp: any, i: number) => ({
        id: i,
        values: Object.fromEntries(
          (cgp["@graph"] ?? [])
            .filter((n: any) => n["rpm:role"])
            .map((n: any) => [n["rpm:role"], n["@type"]?.[0] ?? n["@id"]]),
        ),
        narrativeSummary: `Result ${i + 1} for ${selectedType.label}.`,
        narrativePath: [],
      }));

      setResults({
        rows: resultRows.length > 0 ? resultRows : [
          { id: 0, values: {}, narrativeSummary: `Query submitted for ${selectedType.label} records.`, narrativePath: [] },
        ],
        columns: clauses.map((c) => c.label),
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
          onEdit={(index) => setScreen("query-builder")}
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
