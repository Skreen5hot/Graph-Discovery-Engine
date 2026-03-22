/**
 * Browser shim for node:fs/promises.
 * Vite aliases node:fs/promises to this module during browser builds.
 * Only loadJsonLdGraph uses readFile — parseJsonLdDoc does not.
 */
export function readFile(): never {
  throw new Error("readFile is not available in the browser.");
}
