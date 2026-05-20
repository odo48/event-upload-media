"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { ProgressBar } from "@/components/ProgressBar";
import { fireUploadConfetti } from "@/lib/celebrateUpload";
import { uploadFileViaResumableUrl } from "@/lib/uploadToDriveResumable";
import { humanBytes, MAX_FILE_BYTES } from "@/lib/uploadLimits";

type ServerResult =
  | { ok: true; id: string; name: string }
  | { ok: false; name: string; error: string };

type FileUploadItem = {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [guestName, setGuestName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<ServerResult[] | null>(null);
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([]);

  const resetStatus = useCallback(() => {
    setStatus("idle");
    setMessage(null);
    setProgress(0);
    setLastResults(null);
    setUploadItems([]);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const input = inputRef.current;
      const list = input?.files;
      if (!list || list.length === 0) {
        setStatus("error");
        setMessage("Alege cel puțin o fotografie sau un clip video.");
        return;
      }

      const files = Array.from(list);
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setStatus("error");
          setMessage(
            `„${file.name}” este prea mare. Fiecare fișier trebuie să fie sub ${humanBytes(MAX_FILE_BYTES)}.`,
          );
          return;
        }
      }

      setStatus("uploading");
      setMessage(null);
      setProgress(0);
      setLastResults(null);
      setUploadItems(
        files.map((file, index) => ({
          key: fileKey(file, index),
          name: file.name,
          size: file.size,
          progress: 0,
          status: "pending",
        }))
      );

      const totalBytes = Math.max(
        1,
        files.reduce((sum, file) => sum + file.size, 0)
      );
      const results: ServerResult[] = [];
      let completedBytes = 0;

      for (const [index, file] of files.entries()) {
        const key = fileKey(file, index);
        updateUploadItem(setUploadItems, key, {
          status: "uploading",
          progress: 0,
          error: undefined,
        });

        try {
          const uploaded = await uploadSingleFile({
            file,
            guestName,
            completedBytes,
            totalBytes,
            onOverallProgress: setProgress,
            onFileProgress: (value) => {
              updateUploadItem(setUploadItems, key, { progress: value });
            },
          });
          results.push(...uploaded);
          const failed = uploaded.filter((result) => !result.ok);
          updateUploadItem(
            setUploadItems,
            key,
            failed.length > 0
              ? {
                  status: "error",
                  progress: 100,
                  error: failed.map((result) => result.error).join(", "),
                }
              : { status: "done", progress: 100, error: undefined }
          );
        } catch {
          results.push({
            ok: false,
            name: file.name,
            error: "UPLOAD_FAILED",
          });
          updateUploadItem(setUploadItems, key, {
            status: "error",
            progress: 100,
            error: "UPLOAD_FAILED",
          });
        } finally {
          completedBytes += file.size;
          setLastResults([...results]);
        }
      }

      setProgress(100);
      const allOk = results.every((r) => r.ok);
      const okCount = results.filter((r) => r.ok).length;

      if (allOk) {
        setStatus("done");
        setMessage(
          results.length === 1
            ? "Îți mulțumim! Am primit fotografia și e în siguranță."
            : `Îți mulțumim! Am primit cele ${results.length} încărcări în siguranță.`
        );
        if (inputRef.current) inputRef.current.value = "";
        setUploadItems((items) =>
          items.map((item) => ({ ...item, status: "done", progress: 100 }))
        );
        fireUploadConfetti();
        return;
      }

      const failed = results.filter((r) => !r.ok);
      const summary =
        okCount > 0
          ? `${okCount} din ${results.length} au fost încărcate. Celelalte trebuie încercate din nou.`
          : `${failed.length} din ${results.length} fișiere nu s-au încărcat`;
      const detail = failed.map((r) => r.name).join(", ");
      setStatus("error");
      setMessage(`${summary}${detail ? `: ${detail}` : ""}`);
    },
    [guestName]
  );

  const busy = status === "uploading";
  const helper = useMemo(
    () =>
      `Sunt binevenite JPEG, PNG, HEIC, MP4, MOV și alte formate uzuale. Până la ${humanBytes(MAX_FILE_BYTES)} per fișier.`,
    [],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-10 space-y-6 rounded-3xl bg-accent/80 p-7 shadow-sm ring-1 ring-primary/30 sm:p-8"
    >
      <div className="space-y-2">
        <label
          htmlFor="guestName"
          className="block text-sm font-medium text-text/80"
        >
          Numele tău <span className="text-text/50">(opțional)</span>
        </label>
        <input
          id="guestName"
          name="guestName"
          type="text"
          autoComplete="name"
          maxLength={200}
          value={guestName}
          disabled={busy}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="De ex.: Maria"
          className="w-full rounded-2xl border border-primary/40 bg-background px-4 py-3 text-base text-text shadow-sm outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/40 disabled:opacity-60"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="files"
          className="block text-sm font-medium text-text/80"
        >
          Fotografii și clipuri video
        </label>
        <input
          id="files"
          ref={inputRef}
          name="files"
          type="file"
          multiple
          accept="image/*,video/*"
          disabled={busy}
          onChange={resetStatus}
          className="block w-full cursor-pointer rounded-2xl border border-dashed border-secondary/80 bg-background/80 px-4 py-4 text-sm text-text/80 file:mr-4 file:cursor-pointer file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-text disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="text-xs text-text/60">{helper}</p>
      </div>

      {busy ? (
        <ProgressBar
          value={progress}
          label={
            progress < 8 ? "Pornim încărcarea…" : "Trimitem amintirile tale…"
          }
        />
      ) : null}

      {uploadItems.length > 0 ? (
        <ul
          className="max-h-32 space-y-3 overflow-y-auto overscroll-contain rounded-2xl pr-1"
          aria-label="Starea fișierelor selectate"
        >
          {uploadItems.map((item) => (
            <li
              key={item.key}
              className="rounded-2xl border border-primary/25 bg-background/70 p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {item.name}
                  </p>
                  <p className="text-xs text-text/55">
                    {humanBytes(item.size)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.status === "done"
                      ? "bg-secondary/50 text-text"
                      : item.status === "error"
                      ? "bg-rose-100 text-rose-900"
                      : item.status === "uploading"
                      ? "bg-primary/50 text-text"
                      : "bg-text/10 text-text/70"
                  }`}
                >
                  {uploadStatusLabel(item.status)}
                </span>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-text/10"
                aria-hidden
              >
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    item.status === "error" ? "bg-rose-400" : "bg-secondary"
                  }`}
                  style={{
                    width: `${
                      item.progress === 0 ? 0 : Math.max(4, item.progress)
                    }%`,
                  }}
                />
              </div>
              {item.error ? (
                <p className="mt-2 text-xs leading-relaxed text-rose-900">
                  Nu s-a putut încărca: {friendlyError(item.error)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-base font-semibold text-text shadow-md transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <span
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-text/30 border-t-text"
              aria-hidden
            />
            Se încarcă…
          </>
        ) : (
          "Încarcă"
        )}
      </button>

      {message ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            status === "done"
              ? "bg-secondary/50 text-text"
              : "bg-rose-100/80 text-rose-900"
          }`}
        >
          {message}
        </div>
      ) : null}

      {lastResults &&
      uploadItems.length === 0 &&
      lastResults.some((r) => !r.ok) ? (
        <ul className="space-y-1 text-xs text-text/70">
          {lastResults.map((r) =>
            !r.ok ? (
              <li key={`${r.name}-${r.error}`}>
                Nu s-a putut încărca „{r.name}”: {friendlyError(r.error)}
              </li>
            ) : null
          )}
        </ul>
      ) : null}
    </form>
  );
}

async function uploadSingleFile(options: {
  file: File;
  guestName: string;
  completedBytes: number;
  totalBytes: number;
  onOverallProgress: (value: number) => void;
  onFileProgress: (value: number) => void;
}): Promise<ServerResult[]> {
  const {
    file,
    guestName,
    completedBytes,
    totalBytes,
    onOverallProgress,
    onFileProgress,
  } = options;

  const mimeType = file.type || "application/octet-stream";

  const sessionRes = await fetch("/api/upload/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guestName: guestName.trim(),
      fileName: file.name,
      mimeType,
      size: file.size,
    }),
  });

  let sessionPayload: { uploadUrl?: string; name?: string; error?: string } =
    {};
  try {
    sessionPayload = (await sessionRes.json()) as typeof sessionPayload;
  } catch {
    return [{ ok: false, name: file.name, error: "UPLOAD_FAILED" }];
  }

  const driveName = sessionPayload.name ?? file.name;

  if (!sessionRes.ok) {
    return [
      {
        ok: false,
        name: driveName,
        error: sessionPayload.error ?? "UPLOAD_FAILED",
      },
    ];
  }

  if (!sessionPayload.uploadUrl) {
    return [{ ok: false, name: driveName, error: "UPLOAD_FAILED" }];
  }

  try {
    const uploaded = await uploadFileViaResumableUrl({
      file,
      uploadUrl: sessionPayload.uploadUrl,
      onProgress: (filePct) => {
        onFileProgress(Math.min(99, filePct));
        const loaded = (filePct / 100) * file.size;
        const pct = ((completedBytes + loaded) / totalBytes) * 100;
        onOverallProgress(Math.min(99, pct));
      },
    });
    return [{ ok: true, id: uploaded.id, name: uploaded.name }];
  } catch {
    return [{ ok: false, name: driveName, error: "UPLOAD_FAILED" }];
  }
}

function fileKey(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function updateUploadItem(
  setUploadItems: Dispatch<SetStateAction<FileUploadItem[]>>,
  key: string,
  patch: Partial<FileUploadItem>
) {
  setUploadItems((items) =>
    items.map((item) => (item.key === key ? { ...item, ...patch } : item))
  );
}

function uploadStatusLabel(status: FileUploadItem["status"]): string {
  const map: Record<FileUploadItem["status"], string> = {
    pending: "În așteptare",
    uploading: "Se încarcă",
    done: "Încărcat",
    error: "Eroare",
  };
  return map[status];
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    UNSUPPORTED_TYPE:
      "serverul nu acceptă acest tip de fișier. Încearcă JPEG sau alt format obișnuit.",
    FILE_TOO_LARGE: `fișierul depășește limita de ${humanBytes(MAX_FILE_BYTES)}.`,
    RATE_LIMITED:
      "prea multe încărcări în scurt timp. Așteaptă câteva minute și încearcă din nou.",
    UPLOAD_FAILED:
      "s-a întrerupt comunicarea cu stocarea. Încearcă cu semnal mai bun.",
    DRIVE_PERMISSION_DENIED:
      "Google Drive a refuzat accesul — verifică partajarea folderului sau proiectul OAuth.",
    DRIVE_FOLDER_NOT_FOUND:
      "ID-ul folderului e greșit sau inaccesibil. Verifică GOOGLE_DRIVE_FOLDER_ID.",
    DRIVE_API_DISABLED:
      "Activează „Google Drive API” în Console (APIs & Services → Library).",
    DRIVE_QUOTA_OR_STORAGE:
      "limită de spațiu sau cote — verifică stocarea contului Drive.",
    DRIVE_BAD_CREDENTIALS:
      "cheia OAuth sau contul serviciu e greșit — verifică variabilele din .env.",
  };
  return map[code] ?? code;
}
