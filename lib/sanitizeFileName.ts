import path from "node:path";

const MAX_DRIVE_NAME_LENGTH = 240;
const MAX_GUEST_PREFIX_LENGTH = 80;

/**
 * Drops path traversal; keeps basename only. Leaves Unicode names intact for originals.
 */
export function sanitizeFileName(name: string | undefined): string {
  const base = path.basename(name ?? "").trim() || "upload.bin";
  if (base === "." || base === "..") return `upload-${Date.now()}.bin`;
  return base.slice(0, MAX_DRIVE_NAME_LENGTH);
}

/** Safe fragment for Drive filename prefix (no slashes, restricted punctuation). */
export function sanitizeGuestNamePrefix(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const cleaned = raw
    .trim()
    .slice(0, MAX_GUEST_PREFIX_LENGTH)
    .replace(/[/\\:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * If guest supplied a name: `{nume}__{nume-original-fisier}`. Else original basename only.
 */
export function buildDriveFileName(
  guestName: string | undefined,
  originalSanitizedBasename: string,
): string {
  const prefix = sanitizeGuestNamePrefix(guestName ?? "");
  if (!prefix) return originalSanitizedBasename;
  const combined = `${prefix}__${originalSanitizedBasename}`;
  return combined.slice(0, MAX_DRIVE_NAME_LENGTH);
}
