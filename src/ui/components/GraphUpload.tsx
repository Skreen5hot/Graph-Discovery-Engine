/**
 * GraphUpload — File upload component for Screen 1
 * Uploads a JSON-LD file, runs discovery, and reloads type cards.
 */

import { useState, useRef } from "react";
import styles from "./GraphUpload.module.css";

interface Props {
  onDiscoveryComplete: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

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
      const formData = new FormData();
      formData.append("graph", file);

      const response = await fetch(`${API_BASE}/rpm/upload-graph`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(result.userMessage ?? "Upload failed. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(
        `Discovery complete. ${result.mappingCount} search types found across ${result.subjectTypeCount} record types.`,
      );
      onDiscoveryComplete();
    } catch {
      setStatus("error");
      setMessage("Upload failed. Please check your connection and try again.");
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
