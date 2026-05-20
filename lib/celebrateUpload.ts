import confetti from "canvas-confetti";

/** Sage, cream, blush — matches app/globals.css wedding palette */
const COLORS = ["#a3be9f", "#dae6da", "#f5e6d3", "#e8c4c4", "#ffffff"];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Short celebratory burst after a successful upload batch. */
export function fireUploadConfetti(): void {
  if (prefersReducedMotion()) return;

  const base = {
    colors: COLORS,
    disableForReducedMotion: true,
    ticks: 200,
    gravity: 0.9,
    scalar: 0.95,
  };

  void confetti({
    ...base,
    particleCount: 80,
    spread: 72,
    startVelocity: 38,
    origin: { x: 0.5, y: 0.55 },
  });

  window.setTimeout(() => {
    void confetti({
      ...base,
      particleCount: 36,
      spread: 100,
      startVelocity: 26,
      origin: { x: 0.2, y: 0.65 },
    });
    void confetti({
      ...base,
      particleCount: 36,
      spread: 100,
      startVelocity: 26,
      origin: { x: 0.8, y: 0.65 },
    });
  }, 180);
}
