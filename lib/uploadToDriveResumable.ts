/** Chunk size for Drive resumable uploads (multiple of 256 KB per Google guidance). */
const CHUNK_SIZE = 8 * 256 * 1024;
const MAX_RETRIES_PER_CHUNK = 3;

export type DriveUploadResult = { id: string; name: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function putChunk(args: {
  uploadUrl: string;
  chunk: Blob;
  offset: number;
  end: number;
  totalSize: number;
}): Promise<Response> {
  return fetch(args.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes ${args.offset}-${args.end - 1}/${args.totalSize}`,
    },
    body: args.chunk,
  });
}

/**
 * Uploads a browser File to a Drive resumable session URL (chunked PUT).
 * Must run in the client — file bytes never pass through your Next.js server.
 */
export async function uploadFileViaResumableUrl(options: {
  file: File;
  uploadUrl: string;
  onProgress?: (percent: number) => void;
}): Promise<DriveUploadResult> {
  const { file, uploadUrl, onProgress } = options;

  if (file.size === 0) {
    throw new Error("EMPTY_FILE");
  }

  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    let attempt = 0;
    let res: Response | null = null;
    let lastError: unknown = null;

    while (attempt < MAX_RETRIES_PER_CHUNK) {
      try {
        res = await putChunk({
          uploadUrl,
          chunk,
          offset,
          end,
          totalSize: file.size,
        });
        if (res.status >= 500 || res.status === 408 || res.status === 429) {
          attempt += 1;
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        break;
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt >= MAX_RETRIES_PER_CHUNK) break;
        await sleep(500 * Math.pow(2, attempt));
      }
    }

    if (!res) {
      const detail =
        lastError instanceof Error ? lastError.message : "network";
      throw new Error(`UPLOAD_CHUNK_NETWORK:${detail}`);
    }

    if (res.status === 308) {
      const range = res.headers.get("Range");
      const match = range?.match(/bytes=0-(\d+)/);
      offset = match ? Number(match[1]) + 1 : end;
      onProgress?.(Math.min(99, (offset / file.size) * 100));
      continue;
    }

    if (res.ok) {
      const data = (await res.json()) as { id?: string; name?: string };
      if (!data.id) throw new Error("DRIVE_NO_FILE_ID");
      onProgress?.(100);
      return { id: data.id, name: data.name ?? file.name };
    }

    let errorBody = "";
    try {
      errorBody = await res.text();
    } catch {
      // ignore
    }
    throw new Error(
      `UPLOAD_CHUNK_FAILED:${res.status}${errorBody ? `:${errorBody.slice(0, 200)}` : ""}`,
    );
  }

  throw new Error("UPLOAD_INCOMPLETE");
}
