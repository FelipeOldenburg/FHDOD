import { formatNumber } from "./components";
import type { DashboardData } from "../models/types";

export function Evolution({ items }: { items: DashboardData["monthly"] }) {
  const safeItems = Array.isArray(items) ? items : [];
  const max = Math.max(1, ...safeItems.map((item) => item.count));
  const magnitude = 10 ** Math.floor(Math.log10(max / 6));
  const step = Math.max(1, magnitude * ([1, 2, 5, 10].find((value) => value * magnitude >= max / 6) ?? 10));
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => top - index * step);
  return (
    <div
      className="evolution-chart"
      role="img"
      aria-label={safeItems
        .map((item) => `${item.label}: ${item.count} respostas`)
        .join(", ")}
    >
      {safeItems.some((item) => item.count) ? (
        <>
          <div className="chart-scale" aria-hidden="true">
            {ticks.map((tick) => <span key={tick}>{formatNumber(tick)}</span>)}
          </div>
          <div className="chart-columns">
            {safeItems.map((item, index) => (
              <div className="chart-column" key={item.month}>
                <div className="bar-track">
                  <span
                    className={`chart-bar ${index === safeItems.length - 1 ? "current" : ""}`}
                    style={{ height: `${(item.count / top) * 100}%` }}
                    title={`${item.count} respostas`}
                  >
                    <span>{formatNumber(item.count)}</span>
                  </span>
                </div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="chart-empty">As respostas aparecerão aqui.</p>
      )}
    </div>
  );
}
