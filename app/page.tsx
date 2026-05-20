import { UploadForm } from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="relative h-screen flex justify-center items-center">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
        <div className="absolute inset-0 bg-background" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "url('/background.JPG')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundAttachment: "fixed",
          }}
        />
      </div>

      <main className="relative z-0 flex w-full flex-col items-center justify-center px-7 py-14 max-sm:pt-[max(3.25rem,env(safe-area-inset-top,0px))] max-sm:pb-[max(4rem,env(safe-area-inset-bottom,0px))] max-sm:ps-[max(1.75rem,env(safe-area-inset-left,0px))] max-sm:pe-[max(1.75rem,env(safe-area-inset-right,0px))] sm:px-8 sm:py-12">
        <div className="flex w-full max-w-lg flex-col items-stretch gap-2">
          <h1 className="text-center font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-text sm:text-5xl">
            Alexandru &amp; Elisabeta
          </h1>
          <p className="text-center text-lg text-text/75">
            Încarcă fotografiile tale
          </p>
          <p className="text-center text-sm leading-relaxed text-text/60">
            Lasă aici momentele spontane, clipurile de pe ring și zâmbetele
            discrete. Le vom păstra cu drag pe toate.
          </p>

          <UploadForm />
          {/* 
        <section className="mt-14 space-y-4 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-text/55">
            Scanează pentru a deschide
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
        </section> */}
        </div>
      </main>
    </div>
  );
}
