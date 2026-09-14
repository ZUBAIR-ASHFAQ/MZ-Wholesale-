import { formatMoney } from "../../../lib/utils.ts";
import type { DashboardSalesTrendPoint } from "../api/dashboard.api.ts";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 250;
const CHART_LEFT = 22;
const CHART_RIGHT = 18;
const CHART_TOP = 18;
const CHART_BOTTOM = 42;

/** Formats one YYYY-MM-DD trend date without browser-timezone drift. */
function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/** Renders the seven-day confirmed-sales trend without adding a chart dependency. */
export function DashboardSalesChart({
  points,
}: {
  points: DashboardSalesTrendPoint[];
}): React.JSX.Element {
  const amounts = points.map((point) => Number(point.totalSalesAmount));
  const finiteAmounts = amounts.map((amount) =>
    Number.isFinite(amount) ? amount : 0,
  );
  const maxAmount = Math.max(1, ...finiteAmounts);
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const baselineY = CHART_TOP + plotHeight;
  const coordinates = points.map((point, index) => ({
    point,
    x: CHART_LEFT + xStep * index,
    y: CHART_TOP + plotHeight - (finiteAmounts[index] / maxAmount) * plotHeight,
  }));
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPath = coordinates.length
    ? `M ${coordinates[0].x} ${baselineY} L ${coordinates
        .map(({ x, y }) => `${x} ${y}`)
        .join(" L ")} L ${coordinates[coordinates.length - 1].x} ${baselineY} Z`
    : "";

  return (
    <section className="management-card dashboard-chart-card">
      <div className="dashboard-section-heading dashboard-chart-heading">
        <div>
          <h2>Sales trend</h2>
          <p>
            Confirmed sales for the 7 days ending on the selected business date.
          </p>
        </div>
        <span className="dashboard-chart-badge">7 days</span>
      </div>

      <div className="dashboard-chart-wrap">
        <svg
          aria-label="Seven day confirmed sales trend"
          className="dashboard-sales-chart"
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = CHART_TOP + plotHeight * (1 - ratio);
            return (
              <line
                className="dashboard-chart-grid-line"
                key={ratio}
                x1={CHART_LEFT}
                x2={CHART_WIDTH - CHART_RIGHT}
                y1={y}
                y2={y}
              />
            );
          })}

          {areaPath ? <path className="dashboard-chart-area" d={areaPath} /> : null}
          {linePoints ? (
            <polyline className="dashboard-chart-line" points={linePoints} />
          ) : null}

          {coordinates.map(({ point, x, y }) => (
            <g key={point.date}>
              <circle className="dashboard-chart-point" cx={x} cy={y} r="4.5">
                <title>
                  {shortDate(point.date)}: {formatMoney(point.totalSalesAmount)} · {" "}
                  {point.invoiceCount} invoices
                </title>
              </circle>
              <text
                className="dashboard-chart-date-label"
                textAnchor="middle"
                x={x}
                y={CHART_HEIGHT - 13}
              >
                {shortDate(point.date)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
