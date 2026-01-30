import { formatCurrency } from "../lib/format";

interface Props {
  netIncome: number;
}

export function SleepingEarnings({ netIncome }: Props) {
  // Spread income across all hours, calculate portion during sleep
  // 8 hours sleep / 24 hours = 1/3 of income
  const sleepingEarnings = Math.round(netIncome / 3);

  return (
    <div className="px-6 py-4 text-center font-mono">
      <p className="text-sm text-[var(--color-muted)]">
        You earned{" "}
        <span className="font-bold text-[var(--color-foreground)]">
          {formatCurrency(sleepingEarnings)}
        </span>{" "}
        while sleeping
      </p>
    </div>
  );
}
