import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import type { TaxReturn } from "../lib/schema";
import { formatPercent } from "../lib/format";
import { getTotalTax, getEffectiveRate } from "../lib/tax-calculations";
import { type TimeUnit, TIME_UNIT_LABELS, convertToTimeUnit, formatTimeUnitValue } from "../lib/time-units";
import { Row, RateRow } from "./Row";
import { Separator, DoubleSeparator, SectionHeader } from "./Section";

interface Props {
  data: TaxReturn;
}

export function ReceiptView({ data }: Props) {
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("daily");

  const totalTax = getTotalTax(data);
  const netIncome = data.income.total - totalTax;
  const grossMonthly = Math.round(data.income.total / 12);
  const netMonthly = Math.round(netIncome / 12);
  const hourlyRate = netIncome / 2080;
  const timeUnitValue = convertToTimeUnit(hourlyRate, timeUnit);
  const effectiveRate = getEffectiveRate(data);

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 pb-4 border-b border-[var(--color-border)]">
        <div>
          <h1 className="text-xl font-medium">{data.year}</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Tax Return</p>
        </div>
        <div className="text-right text-sm text-[var(--color-text-muted)]">
          {data.name}
        </div>
      </div>

      {/* Content */}
      <div>
        <SectionHeader>Monthly Breakdown</SectionHeader>
        <Row label="Gross monthly" amount={grossMonthly} />
        <Row label="Net monthly" amount={netMonthly} />

        {/* Time unit */}
        <div className="flex justify-between items-center py-1.5 text-sm">
          <Menu.Root>
            <Menu.Trigger className="flex items-center gap-1 hover:text-[var(--color-text-muted)] cursor-pointer">
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
          <span className="tabular-nums">{formatTimeUnitValue(timeUnitValue, timeUnit)}</span>
        </div>

        <SectionHeader>Income</SectionHeader>
        {data.income.items.map((item, i) => (
          <Row key={i} label={item.label} amount={item.amount} />
        ))}
        <Separator />
        <Row label="Total income" amount={data.income.total} isTotal />

        <SectionHeader>Federal</SectionHeader>
        <Row label="Adjusted gross income" amount={data.federal.agi} />
        {data.federal.deductions.map((item, i) => (
          <Row key={i} label={item.label} amount={item.amount} isMuted />
        ))}
        <Separator />
        <Row label="Taxable income" amount={data.federal.taxableIncome} />
        <Row label="Tax" amount={data.federal.tax} />
        {data.federal.credits.map((item, i) => (
          <Row key={i} label={item.label} amount={item.amount} isMuted />
        ))}
        {data.federal.payments.map((item, i) => (
          <Row key={i} label={item.label} amount={item.amount} isMuted />
        ))}
        <Separator />
        <Row
          label={data.federal.refundOrOwed >= 0 ? "Refund" : "Owed"}
          amount={data.federal.refundOrOwed}
          isTotal
          showSign
        />

        {data.states.map((state, i) => (
          <section key={i}>
            <SectionHeader>{state.name.toUpperCase()}</SectionHeader>
            <Row label="Adjusted gross income" amount={state.agi} />
            {state.deductions.map((item, j) => (
              <Row key={j} label={item.label} amount={item.amount} isMuted />
            ))}
            <Separator />
            <Row label="Taxable income" amount={state.taxableIncome} />
            <Row label="Tax" amount={state.tax} />
            {state.adjustments.map((item, j) => (
              <Row key={j} label={item.label} amount={item.amount} />
            ))}
            {state.payments.map((item, j) => (
              <Row key={j} label={item.label} amount={item.amount} isMuted />
            ))}
            <Separator />
            <Row
              label={state.refundOrOwed >= 0 ? "Refund" : "Owed"}
              amount={state.refundOrOwed}
              isTotal
              showSign
            />
          </section>
        ))}

        <SectionHeader>Net Position</SectionHeader>
        <Row
          label={`Federal ${data.summary.federalAmount >= 0 ? "refund" : "owed"}`}
          amount={data.summary.federalAmount}
          showSign
        />
        {data.summary.stateAmounts.map((item, i) => (
          <Row
            key={i}
            label={`${item.state} ${item.amount >= 0 ? "refund" : "owed"}`}
            amount={item.amount}
            showSign
          />
        ))}
        <DoubleSeparator />
        <Row label="Net" amount={data.summary.netPosition} isTotal showSign />

        {data.rates && (
          <>
            <SectionHeader>Tax Rates</SectionHeader>
            <div className="flex justify-between items-center py-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="flex-1" />
              <span className="w-20 text-right">Marginal</span>
              <span className="w-20 text-right">Effective</span>
            </div>
            <RateRow
              label="Federal"
              marginal={formatPercent(data.rates.federal.marginal)}
              effective={formatPercent(data.rates.federal.effective)}
            />
            {data.rates.state && (
              <RateRow
                label={data.states[0]?.name || "State"}
                marginal={formatPercent(data.rates.state.marginal)}
                effective={formatPercent(data.rates.state.effective)}
              />
            )}
            {data.rates.combined && (
              <>
                <Separator />
                <RateRow
                  label="Combined"
                  marginal={formatPercent(data.rates.combined.marginal)}
                  effective={formatPercent(data.rates.combined.effective)}
                />
              </>
            )}
          </>
        )}

      </div>

    </div>
  );
}
