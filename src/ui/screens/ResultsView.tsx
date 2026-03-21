/**
 * Screen 5 — Results View
 * GDE-UI-SPEC-v2.1.md §10
 */

import { useState } from "react";
import styles from "./ResultsView.module.css";

interface NarrativePathEntry {
  role: string;
  label: string;
}

interface ResultRow {
  id: number;
  values: Record<string, string>;
  narrativeSummary: string;
  narrativePath: NarrativePathEntry[];
}

interface Props {
  results: ResultRow[];
  columns: string[];
  subjectLabel: string;
  onRefine: () => void;
}

export function ResultsView({ results, columns, subjectLabel, onRefine }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [expandedPaths, setExpandedPaths] = useState<Set<number>>(new Set());
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const totalPages = Math.ceil(results.length / pageSize);
  const paged = results.slice(page * pageSize, (page + 1) * pageSize);

  const togglePath = (id: number) => {
    const next = new Set(expandedPaths);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedPaths(next);
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  // Empty state
  if (results.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No records matched your search.</p>
          <p className={styles.emptyHints}>This could mean:</p>
          <ul className={styles.emptyList}>
            <li>No records meet all your conditions.</li>
            <li>Try changing "All must match" to "Any can match".</li>
            <li>Try broadening one of your conditions.</li>
          </ul>
          <button type="button" className={styles.refineButton} onClick={onRefine}>
            ← Refine search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Results bar */}
      <div className={styles.resultsBar}>
        <button type="button" className={styles.refineLink} onClick={onRefine}>
          ← Refine search
        </button>
        <span className={styles.resultCount}>
          {results.length} results for {subjectLabel} records
        </span>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <select
          className={styles.pageSizeSelect}
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
        >
          <option value={10}>10 per page</option>
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>

      {/* Results table */}
      <table className={styles.table} role="table">
        <thead>
          <tr>
            <th className={styles.rowNumHeader}>#</th>
            {columns.map((col) => (
              <th
                key={col}
                className={styles.columnHeader}
                onClick={() => handleSort(col)}
                style={{ cursor: "pointer" }}
              >
                {col}
                {sortColumn === col && (sortDir === "asc" ? " ▲" : " ▼")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((row, i) => (
            <>
              <tr key={row.id} className={styles.dataRow}>
                <td className={styles.rowNum}>{page * pageSize + i + 1}</td>
                {columns.map((col) => (
                  <td key={col} className={styles.cell}>{row.values[col] ?? ""}</td>
                ))}
              </tr>
              {/* NarrativeSummary row — §10.3, §12.4 */}
              <tr key={`${row.id}-narrative`} className={styles.narrativeRow}>
                <td colSpan={columns.length + 1}>
                  <p className={styles.narrativeSummary}>{row.narrativeSummary}</p>
                  <button
                    type="button"
                    className={styles.showPathToggle}
                    onClick={() => togglePath(row.id)}
                    aria-label="Path that produced this result"
                  >
                    {expandedPaths.has(row.id) ? "Hide path ▲" : "Show path ▼"}
                  </button>
                  {/* Breadcrumb path strip — §10.4, §12.5 */}
                  {expandedPaths.has(row.id) && row.narrativePath.length > 0 && (
                    <div className={styles.breadcrumbStrip} aria-label="Path that produced this result">
                      {row.narrativePath.slice(0, 8).map((entry, j) => (
                        <span key={j}>
                          {j > 0 && <span className={styles.breadcrumbArrow}> → </span>}
                          <span className={styles.breadcrumbPill}>{entry.label}</span>
                        </span>
                      ))}
                      {row.narrativePath.length > 8 && (
                        <span className={styles.breadcrumbMore}>
                          … {row.narrativePath.length - 8} more
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            </>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button type="button" disabled={page === 0} onClick={() => setPage(0)}>First</button>
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last</button>
        </div>
      )}
    </div>
  );
}
