/**
 * Screen 2 — Query Builder (Discovery Workspace)
 * GDE-UI-SPEC-v2.1.md §7
 *
 * Stub — full implementation in Phase 5.B.3
 */

import { useState, useEffect } from "react";
import { fetchCatalog } from "../api.js";

interface Props {
  subjectType: { classIri: string; label: string };
  onChangeType: () => void;
}

export function QueryBuilder({ subjectType, onChangeType }: Props) {
  const [catalog, setCatalog] = useState<any>(null);

  useEffect(() => {
    fetchCatalog(subjectType.classIri).then(setCatalog);
  }, [subjectType.classIri]);

  return (
    <div style={{ padding: "var(--space-5)" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--neutral-0)",
        borderBottom: "1px solid var(--neutral-200)",
        marginBottom: "var(--space-5)",
      }}>
        <span style={{ fontWeight: 600 }}>{subjectType.label} records</span>
        <button
          onClick={onChangeType}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent-500)",
            cursor: "pointer",
            fontSize: "var(--text-body-sm)",
          }}
        >
          [Change]
        </button>
      </div>

      {!catalog ? (
        <p>Loading search options...</p>
      ) : (
        <div>
          <p style={{ color: "var(--neutral-600)", marginBottom: "var(--space-4)" }}>
            {catalog.mappings?.length ?? 0} search options available
          </p>

          {catalog.compoundIntents?.length > 0 && (
            <div style={{ marginBottom: "var(--space-5)" }}>
              <h3 style={{ fontSize: "var(--text-label)", color: "var(--neutral-500)", textTransform: "uppercase", marginBottom: "var(--space-3)" }}>
                ★ Common questions
              </h3>
              {catalog.compoundIntents.map((m: any) => (
                <div key={m.shorthand} style={{
                  padding: "var(--space-3)",
                  borderBottom: "1px solid var(--neutral-200)",
                }}>
                  <strong>{m.ui.label}</strong>
                  <p style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-600)" }}>
                    {m.ui.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: "var(--text-label)", color: "var(--neutral-500)", textTransform: "uppercase", marginBottom: "var(--space-3)" }}>
            All search options
          </h3>
          {catalog.mappings?.map((m: any) => (
            <div key={m.shorthand} style={{
              padding: "var(--space-3)",
              borderBottom: "1px solid var(--neutral-200)",
            }}>
              <strong>{m.ui.label}</strong>
              <p style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-600)" }}>
                {m.ui.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
