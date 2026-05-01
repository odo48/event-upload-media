type ProgressBarProps = {
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className="w-full space-y-2">
      {label ? (
        <p className="text-sm text-text/70" id="upload-progress-label">
          {label}
        </p>
      ) : null}
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-secondary/60 shadow-inner"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby={label ? "upload-progress-label" : undefined}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
