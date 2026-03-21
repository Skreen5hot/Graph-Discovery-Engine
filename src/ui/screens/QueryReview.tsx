/**
 * Screen 4 — Query Review and Submit
 * GDE-UI-SPEC-v2.1.md §9
 */

import type { ClauseData } from "./IntentDetailPanel.js";
import styles from "./QueryReview.module.css";

interface Props {
  subjectLabel: string;
  clauses: ClauseData[];
  compositionMode: string;
  onEdit: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
}

const MODE_LABELS: Record<string, string> = {
  subjectToSubject: "All must match",
  union: "Any can match",
};

export function QueryReview({
  subjectLabel, clauses, compositionMode,
  onEdit, onBack, onSubmit, loading, error,
}: Props) {
  // Deduplicated output bind labels across all clauses
  const outputLabels = [...new Set(
    clauses.flatMap((c) => Object.keys(c.values).filter((k) => c.values[k])),
  )];

  return (
    <div className={styles.container}>
      <button type="button" className={styles.backLink} onClick={onBack}>
        ← Back to editing
      </button>

      <h1 className={styles.heading}>Review your search</h1>

      <div className={styles.summary}>
        <p><strong>Searching for:</strong> {subjectLabel} records</p>
        <p><strong>Conditions:</strong> {MODE_LABELS[compositionMode] ?? compositionMode}</p>
      </div>

      <div className={styles.clauseList}>
        {clauses.map((clause, i) => (
          <div key={i} className={styles.clauseRow}>
            <span className={styles.clauseNumber}>{i + 1}</span>
            <span className={styles.clauseLabel}>
              {clause.label}
              {Object.entries(clause.values).map(([key, val]) =>
                val ? <span key={key} className={styles.clauseParam}>: {String(val)}</span> : null,
              )}
            </span>
            <button type="button" className={styles.editLink} onClick={() => onEdit(i)}>
              Edit
            </button>
          </div>
        ))}
      </div>

      {outputLabels.length > 0 && (
        <div className={styles.outputSection}>
          <h3>This search will return:</h3>
          <ul>
            {outputLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.submitButton}
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? "Searching…" : "Run search"}
        </button>
        <button type="button" className={styles.editButton} onClick={onBack}>
          ← Edit
        </button>
      </div>
    </div>
  );
}
