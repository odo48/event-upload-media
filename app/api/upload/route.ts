import { Readable } from "node:stream";
import busboy from "busboy";
import { NextRequest, NextResponse } from "next/server";

import { classifyDriveUploadError } from "@/lib/driveErrors";
import {
  assertDriveConfigured,
  uploadReadableToDrive,
} from "@/lib/googleDrive";
import { isAllowedMediaMime } from "@/lib/mime";
import { buildDriveFileName, sanitizeFileName } from "@/lib/sanitizeFileName";
import { checkUploadRateLimit, getClientIp } from "@/lib/rateLimit";
import { MAX_FILE_BYTES } from "@/lib/uploadLimits";

export const runtime = "nodejs";
/** Allow large-but-streamed payloads on hosts that honor this (self-hosted / Pro plans). */
export const maxDuration = 300;

type UploadResult =
  | { ok: true; id: string; name: string }
  | { ok: false; name: string; error: string };

export async function POST(request: NextRequest) {
  try {
    assertDriveConfigured();
  } catch {
    return NextResponse.json(
      { error: "SERVER_MISCONFIGURED" },
      { status: 500 }
    );
  }

  const ip = getClientIp(request);
  if (!checkUploadRateLimit(ip)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "EXPECTED_MULTIPART" }, { status: 400 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "EMPTY_BODY" }, { status: 400 });
  }

  const outcomes: UploadResult[] = [];
  let limitExceeded = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = busboy({
        headers: Object.fromEntries(request.headers.entries()),
        limits: { fileSize: MAX_FILE_BYTES, files: 40 },
      });

      let guestName = "";
      let pipeline = Promise.resolve();

      bb.on("field", (fieldname, value) => {
        if (fieldname === "guestName") {
          guestName = String(value ?? "")
            .trim()
            .slice(0, 200);
        }
      });

      bb.on(
        "file",
        (fieldname, file, info: { filename: string; mimeType?: string }) => {
          if (fieldname !== "files") {
            file.resume();
            return;
          }

          const mime = info.mimeType || "application/octet-stream";
          const safeBase = sanitizeFileName(info.filename);
          const driveFileName = buildDriveFileName(guestName, safeBase);

          if (!isAllowedMediaMime(mime)) {
            file.resume();
            pipeline = pipeline.then(() => {
              outcomes.push({
                ok: false,
                name: driveFileName,
                error: "UNSUPPORTED_TYPE",
              });
            });
            return;
          }

          const descriptionParts = ["Galerie fotografii — Alexandru & Elisabeta"];
          if (guestName) descriptionParts.unshift(`Invitat: ${guestName}`);

          pipeline = pipeline.then(async () => {
            try {
              const uploaded = await uploadReadableToDrive({
                readable: file as Readable,
                originalName: driveFileName,
                mimeType: mime,
                description: descriptionParts.join(" · "),
              });
              outcomes.push({
                ok: true,
                id: uploaded.id,
                name: uploaded.name,
              });
            } catch (err) {
              const raw = err instanceof Error ? err.message : String(err);
              if (raw.includes("limit") || raw.includes("LIMIT")) {
                outcomes.push({
                  ok: false,
                  name: driveFileName,
                  error: "FILE_TOO_LARGE",
                });
              } else {
                const { clientCode, logLine } = classifyDriveUploadError(err);
                console.error("[drive upload]", driveFileName, logLine, err);
                outcomes.push({
                  ok: false,
                  name: driveFileName,
                  error: clientCode,
                });
              }
            }
          });
        }
      );

      bb.on("filesLimit", () => {
        limitExceeded = true;
      });

      bb.on("limit", () => {
        limitExceeded = true;
      });

      bb.on("error", (err) => {
        reject(err);
      });

      bb.on("finish", () => {
        void pipeline.then(() => resolve()).catch(reject);
      });

      const nodeReadable = Readable.fromWeb(
        request.body as unknown as import("stream/web").ReadableStream
      );
      nodeReadable.once("error", reject);
      nodeReadable.pipe(bb);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PARSE_ERROR";
    return NextResponse.json(
      { error: "PARSE_FAILED", detail: message },
      { status: 400 }
    );
  }

  if (limitExceeded) {
    return NextResponse.json(
      { error: "FILE_TOO_LARGE", results: outcomes },
      { status: 400 }
    );
  }

  if (outcomes.length === 0) {
    return NextResponse.json({ error: "NO_FILES" }, { status: 400 });
  }

  const allOk = outcomes.every((o) => o.ok);
  return NextResponse.json(
    { results: outcomes },
    { status: allOk ? 200 : 207 }
  );
}
