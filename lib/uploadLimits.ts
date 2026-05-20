/** Default max per file (2 GB). */
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

function parseMaxBytes(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** Override via NEXT_PUBLIC_MAX_UPLOAD_FILE_BYTES (client + server) or MAX_UPLOAD_FILE_BYTES (server only). */
export const MAX_FILE_BYTES =
  parseMaxBytes(process.env.NEXT_PUBLIC_MAX_UPLOAD_FILE_BYTES) ??
  parseMaxBytes(process.env.MAX_UPLOAD_FILE_BYTES) ??
  DEFAULT_MAX_FILE_BYTES;

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
