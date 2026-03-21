/**
 * InputField — Renders input parameters by inputType
 * GDE-UI-SPEC-v2.1.md §8.5, §12.3, §18.3
 *
 * inputType → rendered component:
 * - text → single-line text input
 * - number → numeric input + operator dropdown (NEVER a slider) §12.3
 * - date → date picker
 * - entitySearch → autocomplete (stub — live SPARQL in Phase 6)
 * - select → dropdown from selectOptions
 * - boolean → radio group "Yes" / "No" only
 */

import { useState } from "react";
import styles from "./InputField.module.css";

/** Filter operator plain-language labels (§18.3) */
const OPERATOR_LABELS: Record<string, Record<string, string>> = {
  number: { eq: "is exactly", gt: "is greater than", lt: "is less than", range: "is between" },
  date: { eq: "is exactly", gt: "is after", lt: "is before", range: "is between" },
};

interface InputParam {
  id: string;
  role: string;
  label: string;
  hint: string;
  inputType: string;
  required: boolean;
  filterOp: string[];
  unit?: string;
  selectOptions?: Array<{ value: string; label: string }>;
}

interface Props {
  param: InputParam;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

export function InputField({ param, value, onChange, error }: Props) {
  const isOptional = !param.required;
  const labelText = `${param.label}${isOptional ? " (optional)" : ""}`;

  switch (param.inputType) {
    case "text":
      return (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={param.id}>{labelText}</label>
          <input
            id={param.id}
            type="text"
            className={`${styles.input} ${error ? styles.inputError : ""}`}
            placeholder={param.hint}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error && <p className={styles.error} id={`${param.id}-error`}>{error}</p>}
        </div>
      );

    case "number":
      return <NumberInput param={param} value={value} onChange={onChange} error={error} labelText={labelText} />;

    case "date":
      return (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={param.id}>{labelText}</label>
          <input
            id={param.id}
            type="date"
            className={`${styles.input} ${error ? styles.inputError : ""}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>
      );

    case "entitySearch":
      return (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={param.id}>{labelText}</label>
          <input
            id={param.id}
            type="text"
            className={`${styles.input} ${error ? styles.inputError : ""}`}
            placeholder={param.hint || `Search for ${param.label.toLowerCase()}...`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>
      );

    case "select":
      return (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={param.id}>{labelText}</label>
          <select
            id={param.id}
            className={`${styles.select} ${error ? styles.inputError : ""}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select...</option>
            {param.selectOptions?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      );

    case "boolean":
      return (
        <div className={styles.field}>
          <fieldset className={styles.radioGroup} role="radiogroup" aria-labelledby={`${param.id}-label`}>
            <legend className={styles.label} id={`${param.id}-label`}>{labelText}</legend>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name={param.id}
                value="true"
                checked={value === true || value === "true"}
                onChange={() => onChange(true)}
              />
              Yes
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name={param.id}
                value="false"
                checked={value === false || value === "false"}
                onChange={() => onChange(false)}
              />
              No
            </label>
          </fieldset>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      );

    default:
      return (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={param.id}>{labelText}</label>
          <input
            id={param.id}
            type="text"
            className={styles.input}
            placeholder={param.hint}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}

/**
 * Number Input — operator dropdown + numeric input + optional unit (§12.3)
 *
 * The operator dropdown is inline-left, same baseline, visually joined
 * with the numeric input. NEVER a slider.
 */
function NumberInput({
  param, value, onChange, error, labelText,
}: Props & { labelText: string }) {
  const [operator, setOperator] = useState(param.filterOp[0] ?? "eq");
  const labels = OPERATOR_LABELS.number;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={param.id}>{labelText}</label>
      <div className={styles.numberGroup}>
        <select
          className={styles.operatorDropdown}
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          aria-label="Comparison operator"
        >
          {param.filterOp.map((op) => (
            <option key={op} value={op}>{labels[op] ?? op}</option>
          ))}
        </select>
        <input
          id={param.id}
          type="number"
          className={`${styles.numberInput} ${error ? styles.inputError : ""}`}
          placeholder="0"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          step="any"
        />
        {param.unit && (
          <span className={styles.unitLabel}>{param.unit}</span>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
