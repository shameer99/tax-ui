const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number, showSign = false): string {
  const formatted = currencyFormatter.format(Math.abs(amount));
  if (showSign) {
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  }
  return amount < 0 ? `-${formatted}` : formatted;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatPercentChange(current: number, previous: number): string {
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const value = abs / 1_000_000;
    return `${sign}$${value.toFixed(value >= 10 ? 1 : 2)}M`;
  }
  if (abs >= 1_000) {
    const value = abs / 1_000;
    return `${sign}$${value.toFixed(value >= 100 ? 0 : 0)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatCurrencyCents(amount: number, suffix?: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  let decimals: number;
  if (abs >= 1) {
    decimals = 2;
  } else if (abs >= 0.01) {
    decimals = 2;
  } else {
    decimals = 3;
  }

  const formatted = `${sign}$${abs.toFixed(decimals)}`;
  return suffix ? `${formatted}/${suffix}` : formatted;
}
