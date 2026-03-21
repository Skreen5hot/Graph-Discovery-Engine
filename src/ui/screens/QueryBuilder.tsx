/**
 * Screen 2 — Query Builder (Discovery Workspace)
 * GDE-UI-SPEC-v2.1.md §7
 */

import { useState, useEffect } from "react";
import { fetchCatalog } from "../api.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { IntentDetailPanel, type ClauseData } from "./IntentDetailPanel.js";
import styles from "./QueryBuilder.module.css";

interface MappingDef {
  shorthand: string;
  tier: number;
  ui: {
    label: string;
    labelSource?: string;
    description: string;
    group: string;
    examples: string[];
    subjectLabel: string;
    inputParameters: any[];
    outputBinds: any[];
  };
}

interface Props {
  subjectType: { classIri: string; label: string };
  onChangeType: () => void;
}

type CompositionMode = "subjectToSubject" | "union";

export function QueryBuilder({ subjectType, onChangeType }: Props) {
  const [mappings, setMappings] = useState<MappingDef[]>([]);
  const [compoundIntents, setCompoundIntents] = useState<MappingDef[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMapping, setSelectedMapping] = useState<MappingDef | null>(null);
  const [clauses, setClauses] = useState<ClauseData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [compositionMode, setCompositionMode] = useState<CompositionMode>("subjectToSubject");
  const [showDiscoveryNote, setShowDiscoveryNote] = useState(() => {
    return !localStorage.getItem("gde-discovery-note-dismissed");
  });

  const debouncedSearch = useDebounce(search, 150);

  useEffect(() => {
    fetchCatalog(subjectType.classIri).then((data) => {
      setMappings(data.mappings ?? []);
      setCompoundIntents(data.compoundIntents ?? []);
    });
  }, [subjectType.classIri]);

  // Group mappings by ui.group
  const grouped = new Map<string, MappingDef[]>();
  const searchLower = debouncedSearch.toLowerCase();
  const filteredMappings = debouncedSearch
    ? mappings.filter((m) =>
        m.ui.label.toLowerCase().includes(searchLower) ||
        m.ui.description.substring(0, 80).toLowerCase().includes(searchLower) ||
        m.ui.examples.some((ex) => ex.toLowerCase().includes(searchLower)),
      )
    : mappings;

  for (const m of filteredMappings) {
    const group = m.ui.group || "General";
    const list = grouped.get(group) ?? [];
    list.push(m);
    grouped.set(group, list);
  }

  const handleAddClause = (clause: ClauseData) => {
    if (editingIndex !== null) {
      const updated = [...clauses];
      updated[editingIndex] = clause;
      setClauses(updated);
      setEditingIndex(null);
    } else {
      setClauses([...clauses, clause]);
    }
    setSelectedMapping(null);
  };

  const handleRemoveClause = (index: number) => {
    setClauses(clauses.filter((_, i) => i !== index));
  };

  const handleDismissNote = () => {
    setShowDiscoveryNote(false);
    localStorage.setItem("gde-discovery-note-dismissed", "true");
  };

  const allRequiredFilled = clauses.length > 0;

  return (
    <div className={styles.layout}>
      {/* Query Summary Bar — §7.5 */}
      <div className={styles.summaryBar}>
        <span className={styles.summaryType}>
          {subjectType.label} records
        </span>
        <button type="button" className={styles.changeLink} onClick={onChangeType}>[Change]</button>
        <span className={styles.summaryInfo}>
          {clauses.length > 0
            ? `${clauses.length} condition${clauses.length > 1 ? "s" : ""}${clauses.length > 1 ? `, ${compositionMode === "subjectToSubject" ? "all must match" : "any can match"}` : ""}`
            : ""}
        </span>
        <button
          type="button"
          className={styles.reviewButton}
          disabled={!allRequiredFilled}
        >
          Review query →
        </button>
      </div>

      {/* Discovery note — one-time dismissible (§18.2) */}
      {showDiscoveryNote && (
        <div className={styles.discoveryNote}>
          <p>Search options were automatically discovered from your data source. If a search type is missing or named incorrectly, contact a Curator.</p>
          <button type="button" onClick={handleDismissNote} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className={styles.columns}>
        {/* Left Sidebar — Intent Browser §7.3 */}
        <aside className={styles.sidebar}>
          <input
            type="text"
            className={styles.sidebarSearch}
            placeholder="Search conditions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conditions"
          />

          {/* Common questions strip — §7.3.1 */}
          {compoundIntents.length > 0 && !debouncedSearch && (
            <div className={styles.commonStrip}>
              <h4 className={styles.stripHeading}>★ Common questions</h4>
              {compoundIntents.slice(0, 5).map((m) => (
                <button
                  type="button"
                  key={m.shorthand}
                  className={styles.intentItem}
                  onClick={() => setSelectedMapping(m)}
                >
                  <span className={styles.intentLabel}>{m.ui.label}</span>
                  <span className={styles.intentDesc}>{m.ui.description}</span>
                </button>
              ))}
              <div className={styles.stripDivider} />
            </div>
          )}

          {/* Full catalog — §7.3.2 */}
          <h4 className={styles.catalogHeading}>All search options</h4>
          {[...grouped.entries()].map(([groupName, items]) => (
            <div key={groupName} className={styles.catalogGroup}>
              <h5 className={styles.groupHeading}>
                {groupName} <span className={styles.groupCount}>({items.length})</span>
              </h5>
              {items.map((m) => {
                const isAdded = clauses.some((c) => c.intent === m.shorthand);
                return (
                  <button
                    type="button"
                    key={m.shorthand}
                    className={`${styles.intentItem} ${isAdded ? styles.intentAdded : ""}`}
                    onClick={() => setSelectedMapping(m)}
                  >
                    <span className={styles.intentLabel}>
                      {m.ui.label}
                      {isAdded && <span className={styles.checkmark}> ✓</span>}
                    </span>
                    <span className={styles.intentDesc}>{m.ui.description}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {filteredMappings.length === 0 && debouncedSearch && (
            <p className={styles.noResults}>
              No conditions match "{debouncedSearch}". Try different words.
            </p>
          )}
        </aside>

        {/* Center — Query Canvas §7.4 */}
        <main className={styles.canvas}>
          {clauses.length === 0 ? (
            <div className={styles.emptyCanvas}>
              <p>Start building your search</p>
              <p className={styles.emptyHint}>Select a condition type from the left panel to begin.</p>
            </div>
          ) : (
            <>
              {clauses.map((clause, i) => (
                <div key={i} className={styles.clauseChip}>
                  <button
                    type="button"
                    className={styles.chipBody}
                    onClick={() => {
                      const m = mappings.find((m) => m.shorthand === clause.intent);
                      if (m) {
                        setSelectedMapping(m);
                        setEditingIndex(i);
                      }
                    }}
                  >
                    <strong>{clause.label}</strong>
                    {Object.entries(clause.values).map(([key, val]) =>
                      val ? <span key={key} className={styles.chipParam}>{key}: {String(val)}</span> : null,
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => handleRemoveClause(i)}
                    aria-label={`Remove ${clause.label}`}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Composition mode — visible when 2+ clauses (§7.4) */}
              {clauses.length >= 2 && (
                <div className={styles.compositionSelector}>
                  <p className={styles.compositionLabel}>Combine these conditions as:</p>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="composition"
                      value="subjectToSubject"
                      checked={compositionMode === "subjectToSubject"}
                      onChange={() => setCompositionMode("subjectToSubject")}
                    />
                    All must match
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="composition"
                      value="union"
                      checked={compositionMode === "union"}
                      onChange={() => setCompositionMode("union")}
                    />
                    Any can match
                  </label>
                  {/* Chained search hidden per ADR-009 */}
                  <p className={styles.compositionHint}>
                    Not sure? Start with "All must match" — you can change it before running your search.
                  </p>
                </div>
              )}

              <button
                type="button"
                className={styles.addAnother}
                onClick={() => {
                  const searchInput = document.querySelector(`.${styles.sidebarSearch}`) as HTMLInputElement;
                  searchInput?.focus();
                }}
              >
                + Add another condition
              </button>
            </>
          )}
        </main>
      </div>

      {/* Intent Detail Panel — S3 */}
      {selectedMapping && (
        <IntentDetailPanel
          mapping={selectedMapping as any}
          onAdd={handleAddClause}
          onCancel={() => {
            setSelectedMapping(null);
            setEditingIndex(null);
          }}
          existingValues={editingIndex !== null ? clauses[editingIndex]?.values : undefined}
        />
      )}
    </div>
  );
}
