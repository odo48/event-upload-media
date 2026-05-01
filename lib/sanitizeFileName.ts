import path from "node:path";

/**
 * Drops path traversal; keeps basename only. Leaves Unicode names intact for originals.
 */
export function sanitizeFileName(name: string | undefined): string {
  const base = path.basename(name ?? "").trim() || "upload.bin";
  if (base === "." || base === "..") return `upload-${Date.now()}.bin`;
  return base.slice(0, 240);
}
