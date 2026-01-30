import { useMemo, useState } from "react";
import type { TaxReturn } from "../lib/schema";
import { formatCompact, formatCurrencyCents } from "../lib/format";
import { Sparkline } from "./Sparkline";

type TimeUnit = "daily" | "hourly" | "minute" | "second";

const TIME_UNIT_LABELS: Record<TimeUnit, string> = {
  daily: "Daily",
  hourly: "Hourly",
  minute: "Minute",
  second: "Second",
};

const TIME_UNIT_SUFFIXES: Record<TimeUnit, string> = {
  daily: "day",
  hourly: "hr",
  minute: "min",
  second: "sec",
};

interface Props {
  returns: Record<number, TaxReturn>;
}

function getTotalTax(data: TaxReturn): number {
  return data.federal.tax + data.states.reduce((sum, s) => sum + s.tax, 0);
}

function getNetIncome(data: TaxReturn): number {
  return data.income.total - getTotalTax(data);
}

function getDailyTake(data: TaxReturn): number {
  return Math.round(getNetIncome(data) / 365);
}

function getHourlyTake(data: TaxReturn): number {
  return getNetIncome(data) / 2080; // 40 hrs × 52 weeks
}

function convertToTimeUnit(hourlyRate: number, unit: TimeUnit): number {
  switch (unit) {
    case "daily":
      return hourlyRate * 8;
    case "hourly":
      return hourlyRate;
    case "minute":
      return hourlyRate / 60;
    case "second":
      return hourlyRate / 3600;
  }
}

function formatTimeUnitValue(amount: number, unit: TimeUnit): string {
  if (unit === "daily") {
    return formatCompact(Math.round(amount));
  }
  if (unit === "hourly") {
    return formatCompact(Math.round(amount));
  }
  return formatCurrencyCents(amount, TIME_UNIT_SUFFIXES[unit]);
}

export function SummaryStats({ returns }: Props) {
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("daily");

  const years = useMemo(
    () => Object.keys(returns).map(Number).sort((a, b) => a - b),
    [returns]
  );

  const stats = useMemo(() => {
    if (years.length === 0) return null;

    const allReturns = years
      .map((year) => returns[year])
      .filter((r): r is TaxReturn => r !== undefined);

    if (allReturns.length === 0) return null;

    // Sum across all years
    const totalIncome = allReturns.reduce((sum, r) => sum + r.income.total, 0);
    const totalTaxes = allReturns.reduce((sum, r) => sum + getTotalTax(r), 0);
    const netIncome = totalIncome - totalTaxes;

    // Hourly rates for time unit calculations
    const hourlyRates = allReturns.map((r) => getHourlyTake(r));
    const avgHourlyRate =
      hourlyRates.reduce((sum, h) => sum + h, 0) / hourlyRates.length;

    // Per-year values for sparklines (daily for display)
    const dailyTakes = allReturns.map((r) => getDailyTake(r));
    const incomePerYear = allReturns.map((r) => r.income.total);
    const taxesPerYear = allReturns.map((r) => getTotalTax(r));
    const netPerYear = allReturns.map((r) => getNetIncome(r));

    return {
      stats: [
        { label: "Total Income", value: totalIncome, sparkline: incomePerYear },
        { label: "Taxes Paid", value: totalTaxes, sparkline: taxesPerYear },
        { label: "Net Income", value: netIncome, sparkline: netPerYear },
      ],
      avgHourlyRate,
      dailySparkline: dailyTakes,
    };
  }, [returns, years]);

  if (!stats) {
    return null;
  }

  const timeUnitValue = convertToTimeUnit(stats.avgHourlyRate, timeUnit);
  const timeUnitLabel =
    timeUnit === "daily" ? "Daily Take" : `${TIME_UNIT_LABELS[timeUnit]} Take`;

  const yearRange =
    years.length > 1
      ? `${years[0]}–${years[years.length - 1]}`
      : years[0]?.toString() ?? "";

  return (
    <div className="p-6 pb-0 font-mono flex-shrink-0">
      <div className="border border-[var(--color-border)] grid grid-cols-4">
        {stats.stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`p-4 ${i > 0 ? "border-l border-[var(--color-border)]" : ""}`}
          >
            <Sparkline
              values={stat.sparkline}
              width={80}
              height={24}
              className="text-[var(--color-muted)] mb-2"
            />
            <div className="text-2xl font-bold tabular-nums">
              {formatCompact(stat.value)}
            </div>
            <div className="text-xs text-[var(--color-muted)] mt-1">
              {stat.label}
            </div>
          </div>
        ))}
        <div className="p-4 border-l border-[var(--color-border)]">
          <Sparkline
            values={stats.dailySparkline}
            width={80}
            height={24}
            className="text-[var(--color-muted)] mb-2"
          />
          <div className="text-2xl font-bold tabular-nums">
            {formatTimeUnitValue(timeUnitValue, timeUnit)}
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-1 flex items-center gap-1">
            <span>{timeUnitLabel}</span>
            {timeUnit === "hourly" && (
              <span
                className="cursor-help"
                title="Based on 2,080 working hours per year (40 hrs × 52 weeks)"
              >
                ?
              </span>
            )}
          </div>
          <div className="flex gap-0.5 mt-2">
            {(["daily", "hourly", "minute", "second"] as TimeUnit[]).map(
              (unit) => (
                <button
                  key={unit}
                  onClick={() => setTimeUnit(unit)}
                  className={`px-1.5 py-0.5 text-[10px] border transition-colors ${
                    timeUnit === unit
                      ? "border-[var(--color-foreground)] bg-[var(--color-foreground)] text-[var(--color-background)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-muted)]"
                  }`}
                >
                  {unit.charAt(0).toUpperCase()}
                </button>
              )
            )}
          </div>
        </div>
      </div>
      <div className="text-right text-xs text-[var(--color-muted)] mt-1">
        {yearRange}
      </div>
    </div>
  );
}
