import { useState } from "react";
import { SubjectSelection } from "./screens/SubjectSelection.js";
import { QueryBuilder } from "./screens/QueryBuilder.js";

export type Screen = "subject-selection" | "query-builder";

export function App() {
  const [screen, setScreen] = useState<Screen>("subject-selection");
  const [selectedType, setSelectedType] = useState<{
    classIri: string;
    label: string;
  } | null>(null);

  return (
    <div className="app-container">
      {screen === "subject-selection" && (
        <SubjectSelection
          onSelect={(classIri, label) => {
            setSelectedType({ classIri, label });
            setScreen("query-builder");
          }}
        />
      )}
      {screen === "query-builder" && selectedType && (
        <QueryBuilder
          subjectType={selectedType}
          onChangeType={() => setScreen("subject-selection")}
        />
      )}
    </div>
  );
}
