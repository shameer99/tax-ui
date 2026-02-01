import React, { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import type { TaxReturn } from "../lib/schema";
import { formatCurrency, formatPercent, formatCompact } from "../lib/format";
import { getTotalTax } from "../lib/tax-calculations";
import { type TimeUnit, TIME_UNIT_LABELS, convertToTimeUnit, formatTimeUnitValueCompact } from "../lib/time-units";

interface Props {
  data: TaxReturn;
}

function CategoryHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={2} className="pt-6 pb-2">
        <span className="text-xs text-[var(--color-text-muted)]">{children}</span>
      </td>
    </tr>
  );
}

function DataRow({ label, amount, isMuted, showSign }: { label: string; amount: number; isMuted?: boolean; showSign?: boolean }) {
  return (
    <tr className={isMuted ? "text-[var(--color-text-muted)]" : ""}>
      <td className="py-1.5 text-sm">{label}</td>
      <td className="py-1.5 text-sm text-right tabular-nums">
        {showSign && amount >= 0 ? "+" : ""}{formatCurrency(amount)}
      </td>
    </tr>
  );
}

function TotalRow({ label, amount, showSign }: { label: string; amount: number; showSign?: boolean }) {
  return (
    <tr className="font-medium border-t border-[var(--color-border)]">
      <td className="py-2 text-sm">{label}</td>
      <td className="py-2 text-sm text-right tabular-nums">
        {showSign && amount >= 0 ? "+" : ""}{formatCurrency(amount)}
      </td>
    </tr>
  );
}

function RatesSection({ rates, stateName }: { rates: TaxReturn["rates"]; stateName?: string }) {
  if (!rates) return null;
  return (
    <>
      <CategoryHeader>Tax Rates</CategoryHeader>
      <tr>
        <td className="py-1 text-xs text-[var(--color-text-muted)]" />
        <td className="py-1 text-xs text-[var(--color-text-muted)] text-right">
          <span className="inline-block w-16">Marginal</span>
          <span className="inline-block w-16">Effective</span>
        </td>
      </tr>
      <tr>
        <td className="py-1.5 text-sm">Federal</td>
        <td className="py-1.5 text-sm text-right tabular-nums">
          <span className="inline-block w-16">{formatPercent(rates.federal.marginal)}</span>
          <span className="inline-block w-16">{formatPercent(rates.federal.effective)}</span>
        </td>
      </tr>
      {rates.state && (
        <tr>
          <td className="py-1.5 text-sm">{stateName || "State"}</td>
          <td className="py-1.5 text-sm text-right tabular-nums">
            <span className="inline-block w-16">{formatPercent(rates.state.marginal)}</span>
            <span className="inline-block w-16">{formatPercent(rates.state.effective)}</span>
          </td>
        </tr>
      )}
      {rates.combined && (
        <tr className="border-t border-[var(--color-border)]">
          <td className="py-2 text-sm font-medium">Combined</td>
          <td className="py-2 text-sm text-right tabular-nums font-medium">
            <span className="inline-block w-16">{formatPercent(rates.combined.marginal)}</span>
            <span className="inline-block w-16">{formatPercent(rates.combined.effective)}</span>
          </td>
        </tr>
      )}
    </>
  );
}

export function ReceiptView({ data }: Props) {
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("daily");

  const totalTax = getTotalTax(data);
  const netIncome = data.income.total - totalTax;
  const grossMonthly = Math.round(data.income.total / 12);
  const netMonthly = Math.round(netIncome / 12);
  const hourlyRate = netIncome / 2080;
  const timeUnitValue = convertToTimeUnit(hourlyRate, timeUnit);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Stats Header */}
      <div className="px-6 py-6 flex-shrink-0 border-b border-[var(--color-border)]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Income */}
          <div>
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Income</div>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCompact(data.income.total)}
            </div>
          </div>

          {/* Taxes */}
          <div>
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Taxes</div>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCompact(totalTax)}
            </div>
          </div>

          {/* Net */}
          <div>
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Net</div>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatCompact(netIncome)}
            </div>
          </div>

          {/* Time unit selector */}
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

      {/* Content Table */}
      <div className="px-6 py-4">
        <table className="w-full">
          <tbody>
            <CategoryHeader>Monthly Breakdown</CategoryHeader>
            <DataRow label="Gross monthly" amount={grossMonthly} />
            <DataRow label="Net monthly" amount={netMonthly} />

            <CategoryHeader>Income</CategoryHeader>
            {data.income.items.map((item, i) => (
              <DataRow key={i} label={item.label} amount={item.amount} />
            ))}
            <TotalRow label="Total income" amount={data.income.total} />

            <CategoryHeader>Federal</CategoryHeader>
            <DataRow label="Adjusted gross income" amount={data.federal.agi} />
            {data.federal.deductions.map((item, i) => (
              <DataRow key={i} label={item.label} amount={item.amount} isMuted />
            ))}
            <DataRow label="Taxable income" amount={data.federal.taxableIncome} />
            <DataRow label="Tax" amount={data.federal.tax} />
            {data.federal.credits.map((item, i) => (
              <DataRow key={i} label={item.label} amount={item.amount} isMuted />
            ))}
            {data.federal.payments.map((item, i) => (
              <DataRow key={i} label={item.label} amount={item.amount} isMuted />
            ))}
            <TotalRow
              label={data.federal.refundOrOwed >= 0 ? "Refund" : "Owed"}
              amount={data.federal.refundOrOwed}
              showSign
            />

            {data.states.map((state, i) => (
              <React.Fragment key={i}>
                <CategoryHeader>{state.name.toUpperCase()}</CategoryHeader>
                <DataRow label="Adjusted gross income" amount={state.agi} />
                {state.deductions.map((item, j) => (
                  <DataRow key={j} label={item.label} amount={item.amount} isMuted />
                ))}
                <DataRow label="Taxable income" amount={state.taxableIncome} />
                <DataRow label="Tax" amount={state.tax} />
                {state.adjustments.map((item, j) => (
                  <DataRow key={j} label={item.label} amount={item.amount} />
                ))}
                {state.payments.map((item, j) => (
                  <DataRow key={j} label={item.label} amount={item.amount} isMuted />
                ))}
                <TotalRow
                  label={state.refundOrOwed >= 0 ? "Refund" : "Owed"}
                  amount={state.refundOrOwed}
                  showSign
                />
              </React.Fragment>
            ))}

            <CategoryHeader>Net Position</CategoryHeader>
            <DataRow
              label={`Federal ${data.summary.federalAmount >= 0 ? "refund" : "owed"}`}
              amount={data.summary.federalAmount}
              showSign
            />
            {data.summary.stateAmounts.map((item, i) => (
              <DataRow
                key={i}
                label={`${item.state} ${item.amount >= 0 ? "refund" : "owed"}`}
                amount={item.amount}
                showSign
              />
            ))}
            <TotalRow label="Net" amount={data.summary.netPosition} showSign />

            <RatesSection rates={data.rates} stateName={data.states[0]?.name} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
