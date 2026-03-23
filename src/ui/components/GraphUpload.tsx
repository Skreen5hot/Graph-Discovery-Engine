/**
 * GraphUpload — File upload component for Screen 1
 * Uploads a JSON-LD file, runs discovery, and reloads type cards.
 */

import { useState, useRef } from "react";
import { uploadGraph } from "../api.js";
import styles from "./GraphUpload.module.css";

interface Props {
  onDiscoveryComplete: () => void;
}

export function GraphUpload({ onDiscoveryComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("Discovering search options…");

    try {
      const result = await uploadGraph(file);
      setStatus("success");
      setMessage(
        `Discovery complete. ${result.mappingCount} search types found across ${result.subjectTypeCount} record types.`,
      );
      onDiscoveryComplete();
    } catch {
      setStatus("error");
      setMessage("Upload failed. Please check the file format and try again.");
    }
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Upload a data file</h3>
      <p className={styles.description}>
        Upload a JSON-LD file to discover its search options.
      </p>

      <div className={styles.fileRow}>
        <button
          type="button"
          className={styles.chooseButton}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        <span className={styles.fileName}>
          {file ? file.name : "No file selected"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".jsonld,.json"
          className={styles.hiddenInput}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
            setMessage("");
          }}
        />
      </div>

      <button
        type="button"
        className={styles.uploadButton}
        disabled={!file || status === "uploading"}
        onClick={handleUpload}
      >
        {status === "uploading" ? "Discovering…" : "Upload and discover →"}
      </button>

      {message && (
        <p className={`${styles.statusMessage} ${
          status === "success" ? styles.success :
          status === "error" ? styles.error : ""
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}
