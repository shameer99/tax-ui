import { useMemo } from "react";
import { getTaxFreedomDay, getTodayDayOfYear } from "../lib/tax-freedom";

interface YearData {
  year: number;
  effectiveRate: number;
}

interface Props {
  years: YearData[];
}

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function TaxFreedomDay({ years }: Props) {
  const todayDayOfYear = useMemo(() => getTodayDayOfYear(), []);

  const markers = useMemo(
    () =>
      years
        .map(({ year, effectiveRate }) => ({
          year,
          ...getTaxFreedomDay(effectiveRate),
        }))
        .sort((a, b) => a.dayOfYear - b.dayOfYear),
    [years]
  );

  if (markers.length === 0) return null;

  const avgDayOfYear = Math.round(
    markers.reduce((sum, m) => sum + m.dayOfYear, 0) / markers.length
  );

  return (
    <div className="px-6 py-4 font-mono">
      <div className="relative">
        <div className="h-8 flex rounded overflow-hidden border border-[var(--color-border)]">
          <div
            className="bg-red-500/20 transition-all"
            style={{ width: `${(avgDayOfYear / 365) * 100}%` }}
          />
          <div className="flex-1 bg-green-500/20" />
        </div>

        {/* Today marker */}
        <div
          className="absolute top-0 h-8 w-px bg-[var(--color-foreground)]"
          style={{ left: `${(todayDayOfYear / 365) * 100}%` }}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-[var(--color-muted)] whitespace-nowrap">
            Today
          </div>
        </div>

        {/* Tax freedom day marker(s) */}
        {markers.map((marker, i) => (
          <div
            key={marker.year}
            className="absolute top-0 h-8 w-0.5 bg-white"
            style={{
              left: `${(marker.dayOfYear / 365) * 100}%`,
            }}
          >
            <div
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap"
              style={{
                transform: `translateX(-50%) translateY(${(i % 2) * 12}px)`,
              }}
            >
              <span className="font-bold">{marker.year}</span>
            </div>
          </div>
        ))}

        {/* Month labels */}
        <div className="flex justify-between mt-1 text-[10px] text-[var(--color-muted)]">
          {MONTH_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>

      <div
        className="mt-8 text-xs text-[var(--color-muted)] text-center cursor-help"
        title="Tax Freedom Day represents when you've earned enough to pay your total tax bill for the year. Before this date, you're effectively working to pay taxes; after it, you keep what you earn."
      >
        Tax Freedom Day:{" "}
        <span className="font-bold text-[var(--color-foreground)]">
          {markers.length === 1
            ? markers[0]?.date
            : `${markers[0]?.date} – ${markers[markers.length - 1]?.date}`}
        </span>
      </div>
    </div>
  );
}
