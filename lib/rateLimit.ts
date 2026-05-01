import type { NextRequest } from "next/server";

const WINDOW_MS = 10 * 60 * 1000;
/** Per-IP uploads allowed inside the sliding window (~80 concurrent spread across IPs). */
const MAX_UPLOADS_PER_WINDOW = 48;

const globalStore = globalThis as typeof globalThis & {
  __weddingUploadBuckets?: Map<string, number[]>;
};

if (!globalStore.__weddingUploadBuckets) {
  globalStore.__weddingUploadBuckets = new Map<string, number[]>();
}

const buckets = globalStore.__weddingUploadBuckets;

export function getClientIp(request: NextRequest): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * In-memory sliding window. On serverless, each warm instance tracks separately —
 * still reduces accidental abuse; Redis would be needed for strict global caps.
 */
export function checkUploadRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = buckets.get(ip)?.filter((t) => now - t < WINDOW_MS) ?? [];
  if (recent.length >= MAX_UPLOADS_PER_WINDOW) return false;
  recent.push(now);
  buckets.set(ip, recent);

  if (buckets.size > 20000) buckets.clear();

  return true;
}
