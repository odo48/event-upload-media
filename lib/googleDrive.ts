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

async function resolveDrive(): Promise<ReturnType<typeof google.drive>> {
  assertDriveConfigured();
  const mode = describeDriveAuthMode()!;

  if (cachedDrive && cachedMode === mode) {
    return cachedDrive;
  }

  cachedDrive = null;

  let cachedAuth:
    | InstanceType<typeof google.auth.OAuth2>
    | InstanceType<typeof google.auth.JWT>;

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

  cachedDrive = google.drive({ version: "v3", auth: cachedAuth });
  cachedMode = mode;
  return cachedDrive;
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
