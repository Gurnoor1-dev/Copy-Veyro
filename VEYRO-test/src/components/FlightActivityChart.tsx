import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";
import { FlightItem } from "../types";
import { formatMinutes } from "./ProfileHeader";
import {
  TrendingUp,
  Clock,
  Plane,
  Gauge,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Sparkles,
} from "lucide-react";

interface FlightActivityChartProps {
  flights: FlightItem[];
}

type MetricType = "hours" | "count" | "landings" | "cumulative";
type GroupingType = "daily" | "weekly" | "monthly" | "flight";

interface ChartDataPoint {
  key: string;
  label: string;
  subLabel: string;
  timestamp: number;
  hours: number;
  minutes: number;
  count: number;
  landings: number;
  cumulativeHours: number;
  topAircraft?: string;
  aircraftMap: Record<string, number>;
}

export default function FlightActivityChart({ flights }: FlightActivityChartProps) {
  const [metric, setMetric] = useState<MetricType>("hours");
  const [grouping, setGrouping] = useState<GroupingType>("daily");
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Process and sort flights chronologically (oldest to newest for timeline visualization)
  const chronologicalFlights = useMemo(() => {
    return [...flights].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );
  }, [flights]);

  // Effective grouping is now always explicit (no auto interval)
  const effectiveGrouping = grouping;

  // Aggregate flight data into timeline chart points
  const chartData = useMemo(() => {
    if (chronologicalFlights.length === 0) return [];

    const bucketMap = new Map<string, ChartDataPoint>();

    for (let i = 0; i < chronologicalFlights.length; i++) {
      const flight = chronologicalFlights[i];
      const d = new Date(flight.created);
      let bucketKey = "";
      let label = "";
      let subLabel = "";

      if (effectiveGrouping === "flight") {
        bucketKey = flight.id || `flight-${i}`;
        label = `#${i + 1}`;
        subLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (effectiveGrouping === "daily") {
        bucketKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        subLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      } else if (effectiveGrouping === "weekly") {
        // Group by Monday of the week
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        bucketKey = monday.toISOString().slice(0, 10);
        label = `Wk ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        subLabel = monday.toLocaleDateString("en-US", { year: "numeric" });
      } else {
        // Monthly
        bucketKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        subLabel = d.toLocaleDateString("en-US", { month: "long" });
      }

      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          key: bucketKey,
          label,
          subLabel,
          timestamp: d.getTime(),
          hours: 0,
          minutes: 0,
          count: 0,
          landings: 0,
          cumulativeHours: 0,
          aircraftMap: {},
        });
      }

      const point = bucketMap.get(bucketKey)!;
      const mins = flight.flightTimeMinutes || 0;
      point.minutes += mins;
      point.hours = Math.round((point.minutes / 60) * 10) / 10;
      point.count += 1;
      point.landings += flight.landingCount || 0;

      const acName = flight.aircraftName || "Unknown Aircraft";
      point.aircraftMap[acName] = (point.aircraftMap[acName] || 0) + 1;
    }

    const points = Array.from(bucketMap.values());

    // Compute cumulative hours and find top aircraft for each bucket
    let runningCumulativeMinutes = 0;
    points.forEach((pt) => {
      runningCumulativeMinutes += pt.minutes;
      pt.cumulativeHours = Math.round((runningCumulativeMinutes / 60) * 10) / 10;

      // Find top aircraft
      let bestCount = 0;
      let topAc = "";
      Object.entries(pt.aircraftMap).forEach(([name, c]) => {
        if (c > bestCount) {
          bestCount = c;
          topAc = name;
        }
      });
      pt.topAircraft = topAc;
    });

    return points;
  }, [chronologicalFlights, effectiveGrouping]);

  // Summary KPIs based on current dataset
  const kpis = useMemo(() => {
    let totalMinutes = 0;
    let totalLandings = 0;
    let peakValue = 0;
    let peakLabel = "";

    chartData.forEach((pt) => {
      totalMinutes += pt.minutes;
      totalLandings += pt.landings;

      const val =
        metric === "hours"
          ? pt.hours
          : metric === "count"
          ? pt.count
          : metric === "landings"
          ? pt.landings
          : pt.cumulativeHours;

      if (val > peakValue) {
        peakValue = val;
        peakLabel = pt.label;
      }
    });

    const flightCount = chronologicalFlights.length;
    const avgMinutes = flightCount > 0 ? Math.round(totalMinutes / flightCount) : 0;

    return {
      totalHoursStr: formatMinutes(totalMinutes),
      totalFlights: flightCount,
      totalLandings,
      avgDurationStr: formatMinutes(avgMinutes),
      peakValue,
      peakLabel,
    };
  }, [chartData, chronologicalFlights, metric]);

  // Color config for chosen metric
  const metricColor = useMemo(() => {
    switch (metric) {
      case "hours":
        return {
          stroke: "#0ea5e9", // Sky 500
          fill: "rgba(14, 165, 233, 0.12)",
          label: "Flight Hours",
          unit: "hrs",
        };
      case "count":
        return {
          stroke: "#6366f1", // Indigo 500
          fill: "rgba(99, 102, 241, 0.12)",
          label: "Flights Flown",
          unit: "flights",
        };
      case "landings":
        return {
          stroke: "#10b981", // Emerald 500
          fill: "rgba(16, 185, 129, 0.12)",
          label: "Landings",
          unit: "landings",
        };
      case "cumulative":
        return {
          stroke: "#f59e0b", // Amber 500
          fill: "rgba(245, 158, 11, 0.12)",
          label: "Cumulative Hours",
          unit: "total hrs",
        };
    }
  }, [metric]);

  if (flights.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-xs text-slate-400">
        No flight activity available to chart.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition-colors overflow-hidden">
      {/* Chart Top Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Flight Activity Trends
                </h3>
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                  {chartData.length} {effectiveGrouping === "monthly" ? "Months" : effectiveGrouping === "weekly" ? "Weeks" : effectiveGrouping === "daily" ? "Days" : "Flights"}
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Historical flight hours, frequency, and cumulative volume over time
              </p>
            </div>
          </div>

          {/* Metric Selector Pills & Grouping Dropdown */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Metric Mode Pills */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-0.5">
              <button
                type="button"
                id="chart-metric-hours"
                onClick={() => setMetric("hours")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  metric === "hours"
                    ? "bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Hours
              </button>

              <button
                type="button"
                id="chart-metric-count"
                onClick={() => setMetric("count")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  metric === "count"
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Flights
              </button>

              <button
                type="button"
                id="chart-metric-landings"
                onClick={() => setMetric("landings")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  metric === "landings"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Landings
              </button>

              <button
                type="button"
                id="chart-metric-cumulative"
                onClick={() => setMetric("cumulative")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  metric === "cumulative"
                    ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-semibold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Cumulative
              </button>
            </div>

            {/* Time Grouping Select */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-300">
              <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
              <select
                id="chart-grouping-select"
                value={grouping}
                onChange={(e) => setGrouping(e.target.value as GroupingType)}
                className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer text-slate-800 dark:text-slate-200"
              >
                <option value="daily" className="dark:bg-slate-800">Interval: Daily</option>
                <option value="weekly" className="dark:bg-slate-800">Interval: Weekly</option>
                <option value="monthly" className="dark:bg-slate-800">Interval: Monthly</option>
                <option value="flight" className="dark:bg-slate-800">Interval: Per Flight</option>
              </select>
            </div>

            {/* Collapse toggle (tablet & desktop) */}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center justify-center p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              title={isCollapsed ? "Expand chart" : "Collapse chart"}
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Quick KPI summary row */}
        {!isCollapsed && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 block">
                Plotted Time
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                {kpis.totalHoursStr}
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 block">
                Flights / Landings
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                {kpis.totalFlights} flt • {kpis.totalLandings} ldg
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 block">
                Avg Flight Time
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                {kpis.avgDurationStr}
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 block">
                Peak {metricColor.label}
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block truncate">
                {kpis.peakValue} {metricColor.unit} ({kpis.peakLabel})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Graph Area */}
      {!isCollapsed && (
        <div className="p-4 sm:p-5 pt-3">
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metricColor.stroke} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={metricColor.stroke} stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#cbd5e1"
                  strokeOpacity={0.35}
                />

                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#94a3b8", strokeOpacity: 0.3 }}
                  dy={6}
                />

                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    if (metric === "hours" || metric === "cumulative") return `${val}h`;
                    return `${val}`;
                  }}
                  dx={-4}
                />

                <Tooltip content={<CustomTooltip metric={metric} metricColor={metricColor} />} />

                <Area
                  type="monotone"
                  dataKey={
                    metric === "hours"
                      ? "hours"
                      : metric === "count"
                      ? "count"
                      : metric === "landings"
                      ? "landings"
                      : "cumulativeHours"
                  }
                  stroke={metricColor.stroke}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#metricGradient)"
                  dot={chartData.length <= 35 ? { r: 3, fill: metricColor.stroke, strokeWidth: 1.5, stroke: "#ffffff" } : false}
                  activeDot={{
                    r: 6,
                    fill: metricColor.stroke,
                    stroke: "#ffffff",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1">
            <span>Historical order: oldest → newest</span>
            <span>Hover or tap data points for detailed session breakdown</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom Recharts Tooltip with aeronautical detail
function CustomTooltip({
  active,
  payload,
  label,
  metric,
  metricColor,
}: any) {
  if (!active || !payload || !payload.length) return null;

  const data: ChartDataPoint = payload[0].payload;
  if (!data) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md text-slate-100 text-xs z-50 min-w-[190px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <span className="font-bold text-white text-xs">{data.label}</span>
        {data.subLabel && (
          <span className="text-[10px] text-slate-400">{data.subLabel}</span>
        )}
      </div>

      <div className="space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: metricColor.stroke }}
            />
            {metricColor.label}:
          </span>
          <span className="font-bold text-white">
            {metric === "hours"
              ? formatMinutes(data.minutes)
              : metric === "cumulative"
              ? `${data.cumulativeHours} hrs`
              : metric === "count"
              ? `${data.count} flights`
              : `${data.landings} landings`}
          </span>
        </div>

        {metric !== "hours" && (
          <div className="flex items-center justify-between gap-3 text-slate-300">
            <span className="text-slate-400">Duration:</span>
            <span>{formatMinutes(data.minutes)}</span>
          </div>
        )}

        {metric !== "count" && (
          <div className="flex items-center justify-between gap-3 text-slate-300">
            <span className="text-slate-400">Flights:</span>
            <span>{data.count}</span>
          </div>
        )}

        {metric !== "landings" && (
          <div className="flex items-center justify-between gap-3 text-slate-300">
            <span className="text-slate-400">Landings:</span>
            <span>{data.landings}</span>
          </div>
        )}

        {data.topAircraft && (
          <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 font-sans truncate max-w-[210px]">
            Primary: <span className="text-slate-200">{data.topAircraft}</span>
          </div>
        )}
      </div>
    </div>
  );
}
