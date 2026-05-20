/** Chunk size for Drive resumable uploads (multiple of 256 KB per Google guidance). */
const CHUNK_SIZE = 8 * 256 * 1024;

export type DriveUploadResult = { id: string; name: string };

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
    const contentLength = end - offset;

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(contentLength),
        "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
      },
      body: chunk,
    });

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

    throw new Error(`UPLOAD_CHUNK_FAILED:${res.status}`);
  }

  throw new Error("UPLOAD_INCOMPLETE");
}
