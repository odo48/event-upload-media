/**
 * Server-side media validation. Mirrors client accept rules; blocks SVG uploads.
 */
const BLOCKED = new Set(["image/svg+xml"]);

export function isAllowedMediaMime(raw: string | undefined): boolean {
  const normalized = (raw ?? "").toLowerCase().split(";")[0]?.trim();
  if (!normalized) return false;
  if (BLOCKED.has(normalized)) return false;
  return (
    normalized.startsWith("image/") || normalized.startsWith("video/")
  );
}
