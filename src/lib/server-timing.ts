/**
 * Client-side reader for Server-Timing API.
 * Observes resource timing entries and logs server timing data to the console in dev.
 * See: https://web.dev/articles/custom-metrics#server-timing-api
 */
export function observeServerTiming(): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};

  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const nav = entry as PerformanceResourceTiming & {
        serverTiming?: Array<{ name: string; duration: number; description?: string }>;
      };
      const timings = nav.serverTiming;
      if (!timings?.length) continue;

      const metrics = timings
        .filter((t) => t.duration !== undefined)
        .map((t) =>
          t.description
            ? `${t.name}: ${t.duration.toFixed(0)}ms (${t.description})`
            : `${t.name}: ${t.duration.toFixed(0)}ms`,
        )
        .join(", ");
      if (metrics) {
        const url = new URL(nav.name);
        console.log(`[Server-Timing] ${url.pathname} — ${metrics}`);
      }
    }
  });

  po.observe({ type: "resource", buffered: true });

  return () => po.disconnect();
}
