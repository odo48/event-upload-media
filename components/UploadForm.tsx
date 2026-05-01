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
    "idle",
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
        setMessage("Alege cel puțin o fotografie sau un clip video.");
        return;
      }

      const files = Array.from(list);
      for (const file of files) {
        if (file.size > MAX_CLIENT_BYTES) {
          setStatus("error");
          setMessage(
            `„${file.name}” este prea mare. Fiecare fișier trebuie să fie sub ${humanBytes(MAX_CLIENT_BYTES)}.`,
          );
          return;
        }
      }

      const formData = new FormData();
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
        setMessage(
          "Problemă de rețea. Verifică conexiunea și încearcă din nou.",
        );
        setProgress(0);
      };

      xhr.onload = () => {
        setProgress(100);
        let payload: unknown;
        try {
          payload = JSON.parse(xhr.responseText || "{}");
        } catch {
          setStatus("error");
          setMessage("Răspuns neașteptat de la server. Încearcă din nou.");
          return;
        }

        if (xhr.status === 429) {
          setStatus("error");
          setMessage(
            "Prea multe încărcări acum — așteaptă câteva minute și încearcă din nou.",
          );
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
              "Un fișier depășește limita permisă. Maximum 200 MB per fișier.",
            RATE_LIMITED:
              "Prea multe încărcări în scurt timp — încearcă din nou puțin mai târziu.",
            NO_FILES:
              "Adaugă cel puțin un fișier înainte să apeși Încarcă.",
          };

          setMessage(
            map[body.error ?? ""] ??
              body.detail ??
              "Încărcarea nu a reușit.",
          );
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
                ? "Îți mulțumim! Am primit fotografia și e în siguranță."
                : `Îți mulțumim! Am primit cele ${results.length} încărcări în siguranță.`,
            );
            inputRef.current!.value = "";
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
          return;
        }

        setStatus("error");
        setMessage("Încărcarea nu a reușit. Încearcă din nou.");
      };

      xhr.send(formData);
    },
    [guestName],
  );

  const busy = status === "uploading";
  const helper = useMemo(
    () =>
      "Sunt binevenite JPEG, PNG, HEIC, MP4, MOV și alte formate uzuale de pe telefon.",
    [],
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
            progress < 8
              ? "Pornim încărcarea…"
              : "Trimitem amintirile tale…"
          }
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

      {lastResults && lastResults.some((r) => !r.ok) ? (
        <ul className="space-y-1 text-xs text-text/70">
          {lastResults.map((r) =>
            !r.ok ? (
              <li key={`${r.name}-${r.error}`}>
                Nu s-a putut încărca „{r.name}”:{" "}
                {friendlyError(r.error)}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </form>
  );
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    UNSUPPORTED_TYPE:
      "serverul nu acceptă acest tip de fișier. Încearcă JPEG sau alt format obișnuit.",
    FILE_TOO_LARGE:
      "fișierul depășește limita de 200 MB.",
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
