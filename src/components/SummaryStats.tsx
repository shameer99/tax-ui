import { useMemo, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import type { TaxReturn } from "../lib/schema";
import { formatCompact } from "../lib/format";
import { getTotalTax, getNetIncome, getEffectiveRate } from "../lib/tax-calculations";
import { type TimeUnit, TIME_UNIT_LABELS, convertToTimeUnit, formatTimeUnitValueCompact } from "../lib/time-units";
import { Sparkline } from "./Sparkline";

interface Props {
  returns: Record<number, TaxReturn>;
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
    const avgEffectiveRate = allReturns.reduce((sum, r) => sum + getEffectiveRate(r), 0) / allReturns.length;

    // Hourly rate (2,080 working hours per year: 40 hrs × 52 weeks)
    const hourlyRates = allReturns.map((r) => getNetIncome(r) / 2080);
    const avgHourlyRate = hourlyRates.reduce((sum, h) => sum + h, 0) / hourlyRates.length;

    // Per-year values for sparklines
    const incomePerYear = allReturns.map((r) => r.income.total);
    const taxesPerYear = allReturns.map((r) => getTotalTax(r));
    const effectivePerYear = allReturns.map((r) => getEffectiveRate(r));
    const netPerYear = allReturns.map((r) => getNetIncome(r));

    return {
      income: { value: totalIncome, sparkline: incomePerYear },
      taxes: { value: totalTaxes, sparkline: taxesPerYear },
      effective: { value: avgEffectiveRate, sparkline: effectivePerYear },
      net: { value: netIncome, sparkline: netPerYear },
      avgHourlyRate,
    };
  }, [returns, years]);

  if (!stats) {
    return null;
  }

  const timeUnitValue = convertToTimeUnit(stats.avgHourlyRate, timeUnit);

  return (
    <div className="px-6 py-6 flex-shrink-0 border-b border-[var(--color-border)]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">Income</div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCompact(stats.income.value)}
            </span>
            <Sparkline
              values={stats.income.sparkline}
              width={48}
              height={20}
              className="text-[var(--color-chart)]"
            />
          </div>
        </div>

        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">Taxes</div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCompact(stats.taxes.value)}
            </span>
            <Sparkline
              values={stats.taxes.sparkline}
              width={48}
              height={20}
              className="text-[var(--color-chart)]"
            />
          </div>
        </div>

        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">Net</div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCompact(stats.net.value)}
            </span>
            <Sparkline
              values={stats.net.sparkline}
              width={48}
              height={20}
              className="text-[var(--color-chart)]"
            />
          </div>
        </div>

        <div>
          <Menu.Root>
            <Menu.Trigger className="text-xs text-[var(--color-text-muted)] mb-1 flex items-center gap-1 hover:text-[var(--color-text)] cursor-pointer">
              {TIME_UNIT_LABELS[timeUnit]}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} className="z-50">
                <Menu.Popup className="menu-popup bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 py-1.5 min-w-[130px] text-sm">
                  {(["daily", "hourly", "minute", "second"] as TimeUnit[]).map((unit) => (
                    <Menu.Item
                      key={unit}
                      onClick={() => setTimeUnit(unit)}
                      className={`menu-item mx-1.5 px-2.5 py-1.5 cursor-pointer rounded-lg outline-none select-none ${
                        timeUnit === unit ? "text-[var(--color-text)] font-medium" : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      {TIME_UNIT_LABELS[unit]}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {formatTimeUnitValueCompact(timeUnitValue, timeUnit)}
          </div>
        </div>
      </div>
    </div>
  );
}
