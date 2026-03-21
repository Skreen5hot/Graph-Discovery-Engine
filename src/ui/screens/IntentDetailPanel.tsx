/**
 * Screen 3 — Intent Detail Panel
 * GDE-UI-SPEC-v2.1.md §8
 *
 * Slide-in panel showing mapping details, input fields, and action buttons.
 * Receives a MappingDefinition and fires onAdd(clause) when the user
 * adds or updates a condition.
 */

import { useState } from "react";
import { InputField } from "../components/InputField.js";
import styles from "./IntentDetailPanel.module.css";

interface MappingDef {
  shorthand: string;
  ui: {
    label: string;
    description: string;
    group: string;
    examples: string[];
    subjectLabel: string;
    inputParameters: Array<{
      id: string;
      role: string;
      label: string;
      hint: string;
      inputType: string;
      required: boolean;
      filterOp: string[];
      unit?: string;
      selectOptions?: Array<{ value: string; label: string }>;
    }>;
    outputBinds: Array<{ role: string; label: string; description: string }>;
  };
}

export interface ClauseData {
  intent: string;
  label: string;
  values: Record<string, unknown>;
}

interface Props {
  mapping: MappingDef;
  onAdd: (clause: ClauseData) => void;
  onCancel: () => void;
  existingValues?: Record<string, unknown>;
  isCurator?: boolean;
  onEditLabel?: () => void;
}

export function IntentDetailPanel({
  mapping, onAdd, onCancel, existingValues, isCurator, onEditLabel,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(existingValues ?? {});
  const [showExamples, setShowExamples] = useState(true);
  const [showOutputs, setShowOutputs] = useState(false);

  const isEditing = existingValues !== undefined;
  const ui = mapping.ui;

  const allRequiredFilled = ui.inputParameters
    .filter((p) => p.required)
    .every((p) => {
      const v = values[p.id];
      return v !== undefined && v !== null && v !== "";
    });

  const handleAdd = () => {
    onAdd({
      intent: mapping.shorthand,
      label: ui.label,
      values,
    });
  };

  return (
    <div className={styles.panel} role="dialog" aria-labelledby="panel-title">
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onCancel}>
          ← Back to conditions
        </button>
        <button className={styles.closeButton} onClick={onCancel} aria-label="Close">
          ✕
        </button>
      </div>

      <div className={styles.titleRow}>
        <span className={styles.groupLabel}>{ui.group}</span>
        <div className={styles.titleWithEdit}>
          <h2 id="panel-title" className={styles.title}>{ui.label}</h2>
          {isCurator && onEditLabel && (
            <button
              className={styles.editButton}
              onClick={onEditLabel}
              aria-label="Edit label"
              title="Edit label"
            >
              ✏
            </button>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Description — hidden if empty (§8.4) */}
      {ui.description && (
        <p className={styles.description}>{ui.description}</p>
      )}

      {/* Example questions — hidden if empty (§8.4) */}
      {ui.examples.length > 0 && (
        <div className={styles.examplesSection}>
          <button
            className={styles.sectionToggle}
            onClick={() => setShowExamples(!showExamples)}
          >
            Example questions {showExamples ? "▲" : "▼"}
          </button>
          {showExamples && (
            <ul className={styles.examplesList}>
              {ui.examples.slice(0, 3).map((ex, i) => (
                <li key={i}>{ex}</li>
              ))}
              {ui.examples.length > 3 && (
                <li className={styles.showMore}>
                  Show {ui.examples.length - 3} more...
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className={styles.divider} />

      {/* Input Parameters */}
      {ui.inputParameters.length > 0 && (
        <div className={styles.inputSection}>
          <h3 className={styles.sectionHeading}>Configure this condition</h3>
          {ui.inputParameters.map((param) => (
            <InputField
              key={param.id}
              param={param}
              value={values[param.id]}
              onChange={(v) => setValues({ ...values, [param.id]: v })}
            />
          ))}
        </div>
      )}

      <div className={styles.divider} />

      {/* Output Binds — collapsed by default (§8.6) */}
      {ui.outputBinds.length > 0 && (
        <div className={styles.outputSection}>
          <button
            className={styles.sectionToggle}
            onClick={() => setShowOutputs(!showOutputs)}
          >
            What this search returns {showOutputs ? "▲" : "▼"}
          </button>
          {showOutputs && (
            <ul className={styles.outputList}>
              {ui.outputBinds.map((ob) => (
                <li key={ob.role}>
                  <strong>{ob.label}</strong> — {ob.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.divider} />

      {/* Action Buttons (§8.7) */}
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={!allRequiredFilled}
          onClick={handleAdd}
        >
          {isEditing ? "Update condition" : "Add to query"}
        </button>
        <button className={styles.secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
