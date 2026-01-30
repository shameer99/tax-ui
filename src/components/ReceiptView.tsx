import { useState } from "react";
import type { TaxReturn } from "../lib/schema";
import { formatPercent, formatCurrency, formatCurrencyCents } from "../lib/format";
import { Row, RateRow } from "./Row";
import { Separator, DoubleSeparator, SectionHeader } from "./Section";
import { SleepingEarnings } from "./SleepingEarnings";
import { TaxFreedomDay } from "./TaxFreedomDay";

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
  data: TaxReturn;
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
  if (unit === "daily" || unit === "hourly") {
    return formatCurrency(Math.round(amount));
  }
  return formatCurrencyCents(amount, TIME_UNIT_SUFFIXES[unit]);
}

function getEffectiveRate(data: TaxReturn): number {
  if (data.rates?.combined?.effective) {
    return data.rates.combined.effective / 100;
  }
  const totalTax = data.federal.tax + data.states.reduce((sum, s) => sum + s.tax, 0);
  return totalTax / data.income.total;
}

export function ReceiptView({ data }: Props) {
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("daily");

  const totalTax = data.federal.tax + data.states.reduce((sum, s) => sum + s.tax, 0);
  const netIncome = data.income.total - totalTax;
  const grossMonthly = Math.round(data.income.total / 12);
  const netMonthly = Math.round(netIncome / 12);
  const hourlyRate = netIncome / 2080; // 40 hrs × 52 weeks
  const timeUnitValue = convertToTimeUnit(hourlyRate, timeUnit);
  const effectiveRate = getEffectiveRate(data);

  return (
    <div className="max-w-md mx-auto px-6 py-12 font-mono text-sm">
      <header className="mb-2">
        <h1 className="text-lg font-bold tracking-tight">{data.year} TAX RETURN</h1>
        <p className="text-[var(--color-muted)] text-xs">{data.name}</p>
      </header>

      <SectionHeader>INCOME</SectionHeader>
      <Separator />
      {data.income.items.map((item, i) => (
        <Row key={i} label={item.label} amount={item.amount} />
      ))}
      <Separator />
      <Row label="Total income" amount={data.income.total} isTotal />

      <SectionHeader>FEDERAL</SectionHeader>
      <Separator />
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
          <Separator />
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

      <SectionHeader>NET POSITION</SectionHeader>
      <Separator />
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
          <SectionHeader>TAX RATES</SectionHeader>
          <Separator />
          <div className="flex justify-between py-0.5 text-[var(--color-muted)] text-xs">
            <span className="w-32" />
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

      <SectionHeader>MONTHLY BREAKDOWN</SectionHeader>
      <Separator />
      <Row label="Gross monthly" amount={grossMonthly} />
      <Row label="Net monthly (after tax)" amount={netMonthly} />

      <div className="flex justify-between py-1">
        <span className="flex items-center gap-1">
          {TIME_UNIT_LABELS[timeUnit]} take-home
          {timeUnit === "hourly" && (
            <span
              className="text-[10px] text-[var(--color-muted)] cursor-help"
              title="Based on 2,080 working hours per year (40 hrs × 52 weeks)"
            >
              ?
            </span>
          )}
        </span>
        <span className="tabular-nums">
          {formatTimeUnitValue(timeUnitValue, timeUnit)}
        </span>
      </div>

      <div className="flex gap-1 mt-1 mb-4">
        {(["daily", "hourly", "minute", "second"] as TimeUnit[]).map((unit) => (
          <button
            key={unit}
            onClick={() => setTimeUnit(unit)}
            className={`px-2 py-0.5 text-xs border transition-colors ${
              timeUnit === unit
                ? "border-[var(--color-foreground)] bg-[var(--color-foreground)] text-[var(--color-background)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-muted)]"
            }`}
          >
            {unit.charAt(0).toUpperCase()}
          </button>
        ))}
      </div>

      <SleepingEarnings netIncome={netIncome} />

      <TaxFreedomDay years={[{ year: data.year, effectiveRate }]} />

      <footer className="mt-12 pt-4 border-t border-[var(--color-border)] text-[var(--color-muted)] text-xs text-center">
        Tax Year {data.year} · Filed {data.year + 1}
      </footer>
    </div>
  );
}
