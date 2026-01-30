import { useMemo } from "react";
import type { TaxReturn } from "../lib/schema";
import { ReceiptView } from "./ReceiptView";
import { SleepingEarnings } from "./SleepingEarnings";
import { SummaryStats } from "./SummaryStats";
import { SummaryTable } from "./SummaryTable";
import { TaxFreedomDay } from "./TaxFreedomDay";

interface ReceiptProps {
  view: "receipt";
  data: TaxReturn;
  title: string;
}

interface SummaryProps {
  view: "summary";
  returns: Record<number, TaxReturn>;
}

type Props = ReceiptProps | SummaryProps;

function getTotalTax(data: TaxReturn): number {
  return data.federal.tax + data.states.reduce((sum, s) => sum + s.tax, 0);
}

function getNetIncome(data: TaxReturn): number {
  return data.income.total - getTotalTax(data);
}

function getEffectiveRate(data: TaxReturn): number {
  if (data.rates?.combined?.effective) {
    return data.rates.combined.effective / 100;
  }
  return getTotalTax(data) / data.income.total;
}

export function MainPanel(props: Props) {
  const title = props.view === "summary" ? "Summary" : props.title;

  const summaryData = useMemo(() => {
    if (props.view !== "summary") return null;
    const years = Object.keys(props.returns).map(Number).sort((a, b) => a - b);
    const allReturns = years.map((year) => props.returns[year]).filter((r): r is TaxReturn => r !== undefined);

    const totalNetIncome = allReturns.reduce((sum, r) => sum + getNetIncome(r), 0);

    const taxFreedomYears = years
      .map((year) => {
        const r = props.returns[year];
        if (!r) return null;
        return { year, effectiveRate: getEffectiveRate(r) };
      })
      .filter((x): x is { year: number; effectiveRate: number } => x !== null);

    return { totalNetIncome, taxFreedomYears };
  }, [props]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="px-6 py-3 border-b border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-bold">{title}</h2>
        {props.view === "receipt" && (
          <span className="text-xs text-[var(--color-muted)]">Compare to</span>
        )}
      </header>

      {props.view === "summary" && summaryData ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <SummaryStats returns={props.returns} />
          <SleepingEarnings netIncome={summaryData.totalNetIncome} />
          <TaxFreedomDay years={summaryData.taxFreedomYears} />
          <div className="flex-1 overflow-auto">
            <SummaryTable returns={props.returns} />
          </div>
        </div>
      ) : props.view === "receipt" ? (
        <div className="flex-1 overflow-y-auto">
          <ReceiptView data={props.data} />
        </div>
      ) : null}
    </div>
  );
}
