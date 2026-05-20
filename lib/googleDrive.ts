import { Readable } from "node:stream";
import { google } from "googleapis";

type AuthMode = "oauth" | "jwt";

/** Broad scope so uploads to YOUR folder BY ID work with a refresh token from OAuth Playground. */
const SCOPES = ["https://www.googleapis.com/auth/drive"];

let cachedMode: AuthMode | null = null;
let cachedDrive: ReturnType<typeof google.drive> | null = null;

/**
 * Prefer OAuth — uploads run as YOUR Gmail / Google One account (uses your quota).
 * Use JWT service account only for Workspace Shared Drives and similar setups.
 */
export function describeDriveAuthMode(): AuthMode | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refresh = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const oauthReady = Boolean(id && secret && refresh);

  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const pk = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const jwtReady = Boolean(email && pk);

  if (oauthReady) return "oauth";
  if (jwtReady) return "jwt";
  return null;
}

export function assertDriveConfigured(): void {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()) {
    throw new Error("MISSING_DRIVE_CONFIG");
  }
  if (!describeDriveAuthMode()) {
    throw new Error("MISSING_DRIVE_AUTH");
  }
}

type DriveAuth =
  | InstanceType<typeof google.auth.OAuth2>
  | InstanceType<typeof google.auth.JWT>;

let cachedAuth: DriveAuth | null = null;

async function resolveAuth(): Promise<DriveAuth> {
  assertDriveConfigured();
  const mode = describeDriveAuthMode()!;

  if (cachedAuth && cachedMode === mode) {
    return cachedAuth;
  }

  cachedAuth = null;
  cachedDrive = null;

  if (mode === "oauth") {
    const oauth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
    );
    oauth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    });
    cachedAuth = oauth;
  } else {
    const jwt = createJwtClient();
    await jwt.authorize();
    cachedAuth = jwt;
  }

  cachedMode = mode;
  return cachedAuth;
}

async function resolveDrive(): Promise<ReturnType<typeof google.drive>> {
  const mode = describeDriveAuthMode()!;

  if (cachedDrive && cachedMode === mode) {
    return cachedDrive;
  }

  cachedDrive = google.drive({ version: "v3", auth: await resolveAuth() });
  return cachedDrive;
}

async function getAccessToken(): Promise<string> {
  const auth = await resolveAuth();
  const tokenResponse = await auth.getAccessToken();
  const token =
    typeof tokenResponse === "string"
      ? tokenResponse
      : tokenResponse?.token;
  if (!token) throw new Error("NO_ACCESS_TOKEN");
  return token;
}

function createJwtClient(): InstanceType<typeof google.auth.JWT> {
  const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL!,
    key,
    scopes: SCOPES,
  });
}

/**
 * Streams the readable body straight into Drive (no buffering the whole file in app memory).
 *
 * - OAuth mode: uploads as your user — put a folder YOU own under GOOGLE_DRIVE_FOLDER_ID.
 * - JWT mode (service account): share that folder with the service account email.
 */
export async function uploadReadableToDrive(options: {
  readable: Readable;
  originalName: string;
  mimeType: string;
  description?: string;
}): Promise<{ id: string; name: string }> {
  const drive = await resolveDrive();

  const res = await drive.files.create({
    requestBody: {
      name: options.originalName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
      ...(options.description
        ? { description: options.description.slice(0, 8000) }
        : {}),
    },
    media: {
      mimeType: options.mimeType,
      body: options.readable,
    },
    fields: "id,name",
    supportsAllDrives: true,
  });

  const id = res.data.id;
  if (!id) throw new Error("DRIVE_NO_FILE_ID");

  return { id, name: res.data.name ?? options.originalName };
}

/**
 * Starts a Drive resumable upload; client PUTs bytes directly to uploadUrl (bypasses app host body limits).
 */
export async function createResumableUploadSession(options: {
  name: string;
  mimeType: string;
  size: number;
  description?: string;
  /** Browser origin — passed to Google so the returned upload URL allows CORS PUTs. */
  origin?: string;
}): Promise<{ uploadUrl: string }> {
  const token = await getAccessToken();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;

  const metadata: Record<string, unknown> = {
    name: options.name,
    parents: [folderId],
  };
  if (options.description) {
    metadata.description = options.description.slice(0, 8000);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": options.mimeType,
    "X-Upload-Content-Length": String(options.size),
  };
  if (options.origin) {
    headers.Origin = options.origin;
  }

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers,
      body: JSON.stringify(metadata),
    },
  );

  if (!res.ok) {
    let apiError: unknown;
    try {
      apiError = await res.json();
    } catch {
      apiError = { message: await res.text() };
    }
    const err = new Error("RESUMABLE_INIT_FAILED") as Error & {
      response?: { status: number; data?: { error?: unknown } };
    };
    err.response = {
      status: res.status,
      data: {
        error:
          typeof apiError === "object" && apiError && "error" in apiError
            ? (apiError as { error: unknown }).error
            : apiError,
      },
    };
    throw err;
  }

  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) throw new Error("RESUMABLE_NO_LOCATION");

  return { uploadUrl };
}
