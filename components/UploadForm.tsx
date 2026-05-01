"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";

import { ProgressBar } from "@/components/ProgressBar";

type ServerResult =
  | { ok: true; id: string; name: string }
  | { ok: false; name: string; error: string };

const MAX_CLIENT_BYTES = 200 * 1024 * 1024;

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [guestName, setGuestName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<ServerResult[] | null>(null);

  const resetStatus = useCallback(() => {
    setStatus("idle");
    setMessage(null);
    setProgress(0);
    setLastResults(null);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const input = inputRef.current;
      const list = input?.files;
      if (!list || list.length === 0) {
        setStatus("error");
        setMessage("Choose at least one photo or video to share.");
        return;
      }

      const files = Array.from(list);
      for (const file of files) {
        if (file.size > MAX_CLIENT_BYTES) {
          setStatus("error");
          setMessage(
            `"${file.name}" is too large. Each file must be under ${humanBytes(
              MAX_CLIENT_BYTES
            )}.`
          );
          return;
        }
      }

      const formData = new FormData();
      // Put guest name first so the server parses it before file parts.
      formData.append("guestName", guestName.trim());
      for (const file of files) {
        formData.append("files", file, file.name);
      }

      setStatus("uploading");
      setMessage(null);
      setProgress(0);
      setLastResults(null);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) {
          setProgress(50);
          return;
        }
        const pct = (evt.loaded / evt.total) * 100;
        setProgress(pct);
      };

      xhr.onerror = () => {
        setStatus("error");
        setMessage("Network error. Check your connection and try again.");
        setProgress(0);
      };

      xhr.onload = () => {
        setProgress(100);
        let payload: unknown;
        try {
          payload = JSON.parse(xhr.responseText || "{}");
        } catch {
          setStatus("error");
          setMessage("Unexpected server response. Please try again.");
          return;
        }

        if (xhr.status === 429) {
          setStatus("error");
          setMessage("Too many uploads right now. Please wait a few minutes.");
          return;
        }

        if (
          xhr.status >= 400 &&
          typeof payload === "object" &&
          payload &&
          "error" in payload
        ) {
          const body = payload as { error?: string; detail?: string };
          setStatus("error");

          const map: Record<string, string> = {
            FILE_TOO_LARGE:
              "A file exceeded the limit. Keep each clip under 200MB.",
            RATE_LIMITED: "Slow down a touch — try again shortly.",
            NO_FILES: "Add at least one file before uploading.",
          };

          setMessage(map[body.error ?? ""] ?? body.detail ?? "Upload failed.");
          return;
        }

        if (typeof payload === "object" && payload && "results" in payload) {
          const results = (payload as { results: ServerResult[] }).results;
          setLastResults(results);
          const allOk = results.every((r) => r.ok);
          const okCount = results.filter((r) => r.ok).length;

          if (allOk && xhr.status < 400) {
            setStatus("done");
            setMessage(
              results.length === 1
                ? "Thank you! Your upload is tucked away safely."
                : `Thank you! ${results.length} uploads landed safely.`
            );
            inputRef.current!.value = "";
            return;
          }

          const failed = results.filter((r) => !r.ok);
          const summary =
            okCount > 0
              ? `${okCount} of ${results.length} uploaded. The rest need another try.`
              : `${failed.length}/${results.length} file(s) need another try`;
          const detail = failed.map((r) => r.name).join(", ");
          setStatus("error");
          setMessage(`${summary}${detail ? `: ${detail}` : ""}`);
          return;
        }

        setStatus("error");
        setMessage("Upload failed. Please try again.");
      };

      xhr.send(formData);
    },
    [guestName]
  );

  const busy = status === "uploading";
  const helper = useMemo(
    () =>
      "JPEG, PNG, HEIC, MP4, MOV, and other common phone formats are welcome.",
    []
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-10 space-y-6 rounded-3xl bg-accent/80 p-6 shadow-sm ring-1 ring-primary/30 sm:p-8"
    >
      <div className="space-y-2">
        <label
          htmlFor="guestName"
          className="block text-sm font-medium text-text/80"
        >
          Your name <span className="text-text/50">(optional)</span>
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
          placeholder="e.g. Raluca"
          className="w-full rounded-2xl border border-primary/40 bg-background px-4 py-3 text-base text-text shadow-sm outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/40 disabled:opacity-60"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="files"
          className="block text-sm font-medium text-text/80"
        >
          Photos &amp; videos
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
          label={progress < 8 ? "Starting upload…" : "Sending your memories…"}
        />
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
            Uploading…
          </>
        ) : (
          "Upload"
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

      {lastResults && lastResults.some((r) => !r.ok) ? (
        <ul className="space-y-1 text-xs text-text/70">
          {lastResults.map((r) =>
            !r.ok ? (
              <li key={`${r.name}-${r.error}`}>
                Could not upload {r.name}: {friendlyError(r.error)}
              </li>
            ) : null
          )}
        </ul>
      ) : null}
    </form>
  );
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    UNSUPPORTED_TYPE:
      "this format is blocked on the server. Try another clip or HEIC/JPEG.",
    FILE_TOO_LARGE: "this file tipped past our 200MB limit.",
    UPLOAD_FAILED:
      "the cloud handshake hiccuped. Retry once you have stronger signal.",
    DRIVE_PERMISSION_DENIED:
      "Google Drive refused access — share your upload folder with the service account email (Editor) or check the OAuth project.",
    DRIVE_FOLDER_NOT_FOUND:
      "Drive folder ID is wrong or inaccessible. Double-check GOOGLE_DRIVE_FOLDER_ID.",
    DRIVE_API_DISABLED:
      "Enable Google Drive API for your Cloud project (APIs & Services → Library).",
    DRIVE_QUOTA_OR_STORAGE:
      "Quota or storage limit hit (folder owner or Drive storage).",
    DRIVE_BAD_CREDENTIALS:
      "Service account key or email is wrong — check GOOGLE_PRIVATE_KEY (with \\n) and GOOGLE_CLIENT_EMAIL.",
  };
  return map[code] ?? code;
}
