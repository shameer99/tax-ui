import { BrailleSpinner } from "./BrailleSpinner";

interface Props {
  filename: string;
  year: number | null;
  status: "extracting-year" | "parsing";
  percent?: number;
  phase?: string;
}

export function LoadingView({ filename, year, status, percent, phase }: Props) {
  const statusText =
    phase ?? (status === "extracting-year" ? "Extracting year..." : "Parsing tax return...");

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-(--color-bg-muted)">
          <BrailleSpinner className="text-2xl text-(--color-text-muted)" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-(--color-text)">
          {year ? `${year} Tax Return` : "Processing"}
        </h2>
        <p className="mb-1 max-w-xs truncate px-4 text-sm text-(--color-text-secondary)">
          {filename}
        </p>
        <p className="animate-pulse-soft text-xs text-(--color-text-muted)">{statusText}</p>
        {typeof percent === "number" && (
          <p className="mt-2 text-xs font-medium text-(--color-text-secondary)">
            {Math.round(percent)}%
          </p>
        )}
      </div>
    </div>
  );
}
