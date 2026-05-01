import QRCode from "qrcode";
import { headers } from "next/headers";

async function resolveHomeUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

/** Renders an inline SVG QR for the live homepage URL — perfect for printing place cards. */
export async function WeddingQrCode() {
  const url = await resolveHomeUrl();
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 216,
    color: { dark: "#4A4A4AFF", light: "#FAF8F600" },
    errorCorrectionLevel: "M",
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="rounded-[28px] bg-background p-4 shadow-md ring-1 ring-primary/30"
        // SVG is emitted by trusted qrcode generator only.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="max-w-[16rem] break-all text-center text-xs leading-relaxed text-text/65">
        {url}
      </p>
      <p className="text-center text-[11px] text-text/50">
        Sfat: invitații trebuie să folosească exact această adresă (în producție,
        setează{" "}
        <code className="rounded-md bg-accent px-1 py-px text-[10px]">
          NEXT_PUBLIC_SITE_URL
        </code>
        ).
      </p>
    </div>
  );
}
