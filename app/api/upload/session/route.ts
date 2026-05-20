import { NextRequest, NextResponse } from "next/server";

import { classifyDriveUploadError } from "@/lib/driveErrors";
import {
  assertDriveConfigured,
  createResumableUploadSession,
} from "@/lib/googleDrive";
import { isAllowedMediaMime } from "@/lib/mime";
import { checkUploadRateLimit, getClientIp } from "@/lib/rateLimit";
import { buildDriveFileName, sanitizeFileName } from "@/lib/sanitizeFileName";
import { MAX_FILE_BYTES } from "@/lib/uploadLimits";

export const runtime = "nodejs";

type SessionBody = {
  guestName?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
};

export async function POST(request: NextRequest) {
  try {
    assertDriveConfigured();
  } catch {
    return NextResponse.json(
      { error: "SERVER_MISCONFIGURED" },
      { status: 500 },
    );
  }

  const ip = getClientIp(request);
  if (!checkUploadRateLimit(ip)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: SessionBody;
  try {
    body = (await request.json()) as SessionBody;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const guestName = String(body.guestName ?? "")
    .trim()
    .slice(0, 200);
  const fileName = String(body.fileName ?? "").trim();
  const mimeType = (body.mimeType || "application/octet-stream").split(";")[0]?.trim();
  const size = Number(body.size);

  if (!fileName || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "INVALID_FILE_META" }, { status: 400 });
  }

  if (size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
  }

  if (!isAllowedMediaMime(mimeType)) {
    return NextResponse.json({ error: "UNSUPPORTED_TYPE" }, { status: 400 });
  }

  const safeBase = sanitizeFileName(fileName);
  const driveFileName = buildDriveFileName(guestName, safeBase);

  const descriptionParts = ["Galerie fotografii — Alexandru & Elisabeta"];
  if (guestName) descriptionParts.unshift(`Invitat: ${guestName}`);

  try {
    const { uploadUrl } = await createResumableUploadSession({
      name: driveFileName,
      mimeType,
      size,
      description: descriptionParts.join(" · "),
    });

    return NextResponse.json({ uploadUrl, name: driveFileName });
  } catch (err) {
    const { clientCode, logLine } = classifyDriveUploadError(err);
    console.error("[drive session]", driveFileName, logLine, err);
    return NextResponse.json({ error: clientCode }, { status: 502 });
  }
}
