/**
 * Screen 1 — Subject Selection
 * GDE-UI-SPEC-v2.1.md §6
 */

import { useState, useEffect, useCallback } from "react";
import { fetchSubjectTypes, type SubjectTypeEntry } from "../api.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { GraphUpload } from "../components/GraphUpload.js";
import styles from "./SubjectSelection.module.css";

interface Props {
  onSelect: (classIri: string, label: string) => void;
}

export function SubjectSelection({ onSelect }: Props) {
  const [types, setTypes] = useState<SubjectTypeEntry[]>([]);
  const loadTypes = useCallback(() => {
    setLoading(true);
    fetchSubjectTypes().then((data) => {
      setTypes(data.subjectTypes);
      setLoading(false);
    });
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const debouncedSearch = useDebounce(search, 150);
  const filtered = types.filter((t) =>
    t.label.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const displayed = showAll ? filtered : filtered.slice(0, 6);
  const selectedEntry = types.find((t) => t.classIri === selected);

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>What type of record are you looking for?</h1>
        <div className={styles.skeleton}>Loading...</div>
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>What type of record are you looking for?</h1>
        <p className={styles.empty}>
          No search options are available. The data source may not be connected.
          Contact your system administrator.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>What type of record are you looking for?</h1>

      <input
        type="text"
        className={styles.search}
        placeholder="Search record types…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search record types"
      />

      <div className={styles.grid}>
        {displayed.map((t) => (
          <button
            key={t.classIri}
            className={`${styles.card} ${selected === t.classIri ? styles.cardSelected : ""}`}
            onClick={() => setSelected(t.classIri)}
            aria-pressed={selected === t.classIri}
          >
            <span className={styles.cardLabel}>{t.label}</span>
            <span className={styles.cardCount}>{t.intentCount} search options</span>
          </button>
        ))}
      </div>

      {filtered.length > 6 && !showAll && (
        <button
          className={styles.showAll}
          onClick={() => setShowAll(true)}
        >
          Show all {filtered.length} types
        </button>
      )}
      {showAll && filtered.length > 6 && (
        <button
          className={styles.showAll}
          onClick={() => setShowAll(false)}
        >
          Show fewer types
        </button>
      )}

      <button
        className={styles.continueButton}
        disabled={!selected}
        onClick={() => {
          if (selected && selectedEntry) {
            onSelect(selected, selectedEntry.label);
          }
        }}
      >
        {selectedEntry
          ? `Find ${selectedEntry.label} records →`
          : "Select a record type to continue"}
      </button>

      {!import.meta.env.VITE_STATIC_DEMO && (
        <GraphUpload onDiscoveryComplete={loadTypes} />
      )}
    </div>
  );
}
