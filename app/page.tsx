import { Suspense } from "react";

import { UploadForm } from "@/components/UploadForm";
import { WeddingQrCode } from "@/components/WeddingQrCode";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-accent/30 to-background">
      <main className="mx-auto flex max-w-lg flex-col px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <h1 className="mt-2 text-center font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-text sm:text-5xl">
          Alex &amp; Eli
        </h1>
        <p className="mt-4 text-center text-lg text-text/75">
          Upload your photos
        </p>
        <p className="mt-2 text-center text-sm leading-relaxed text-text/60">
          Drop the candid moments, dance-floor clips, and quiet smiles here. We
          will treasure every single one.
        </p>

        <UploadForm />

        <section className="mt-14 space-y-4 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-text/55">
            Scan to open
          </h2>
          <div className="flex justify-center">
            <Suspense
              fallback={
                <div className="h-56 w-56 animate-pulse rounded-[28px] bg-accent/70 shadow-inner" />
              }
            >
              <WeddingQrCode />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
