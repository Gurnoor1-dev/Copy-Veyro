import { useState } from "react";
import { UserSummary } from "../types";
import { formatMinutes, getGradeBadgeStyle } from "./ProfileHeader";
import {
  Search,
  X,
  AlertCircle,
  Clock,
  Plane,
  Award,
  Radio,
  ArrowRight,
  RefreshCw,
  BarChart3,
  SlidersHorizontal,
} from "lucide-react";

interface GradeComparisonViewProps {
  currentUser: UserSummary;
  onClose: () => void;
}

interface StatRowDefinition {
  label: string;
  category: "Experience & Flight" | "Operations & Flights" | "Safety & Violations";
  getValue1: (u: UserSummary) => number | string;
  getValue2: (u: UserSummary) => number | string;
  display1: (u: UserSummary) => string;
  display2: (u: UserSummary) => string;
  compareMode: "higher" | "lower" | "neutral";
  unit?: string;
}

const STAT_METRICS: StatRowDefinition[] = [
  // Experience & Flight
  {
    label: "Total XP",
    category: "Experience & Flight",
    getValue1: (u) => u.xp,
    getValue2: (u) => u.xp,
    display1: (u) => u.xp.toLocaleString(),
    display2: (u) => u.xp.toLocaleString(),
    compareMode: "higher",
  },
  {
    label: "Flight Time",
    category: "Experience & Flight",
    getValue1: (u) => u.flightTimeMinutes,
    getValue2: (u) => u.flightTimeMinutes,
    display1: (u) => formatMinutes(u.flightTimeMinutes),
    display2: (u) => formatMinutes(u.flightTimeMinutes),
    compareMode: "higher",
  },
  {
    label: "Current Grade",
    category: "Experience & Flight",
    getValue1: (u) => u.grade,
    getValue2: (u) => u.grade,
    display1: (u) => `Grade ${u.grade}`,
    display2: (u) => `Grade ${u.grade}`,
    compareMode: "higher",
  },

  // Operations & Flights
  {
    label: "Total Landings",
    category: "Operations & Flights",
    getValue1: (u) => u.landingCount,
    getValue2: (u) => u.landingCount,
    display1: (u) => u.landingCount.toLocaleString(),
    display2: (u) => u.landingCount.toLocaleString(),
    compareMode: "higher",
  },
  {
    label: "Online Flights Flown",
    category: "Operations & Flights",
    getValue1: (u) => u.onlineFlights,
    getValue2: (u) => u.onlineFlights,
    display1: (u) => u.onlineFlights.toLocaleString(),
    display2: (u) => u.onlineFlights.toLocaleString(),
    compareMode: "higher",
  },
  {
    label: "ATC Operations",
    category: "Operations & Flights",
    getValue1: (u) => u.atcOperations,
    getValue2: (u) => u.atcOperations,
    display1: (u) => u.atcOperations.toLocaleString(),
    display2: (u) => u.atcOperations.toLocaleString(),
    compareMode: "higher",
  },
  {
    label: "Avg Flight Duration",
    category: "Operations & Flights",
    getValue1: (u) => (u.onlineFlights > 0 ? Math.round(u.flightTimeMinutes / u.onlineFlights) : 0),
    getValue2: (u) => (u.onlineFlights > 0 ? Math.round(u.flightTimeMinutes / u.onlineFlights) : 0),
    display1: (u) => (u.onlineFlights > 0 ? formatMinutes(Math.round(u.flightTimeMinutes / u.onlineFlights)) : "—"),
    display2: (u) => (u.onlineFlights > 0 ? formatMinutes(Math.round(u.flightTimeMinutes / u.onlineFlights)) : "—"),
    compareMode: "higher",
  },
  {
    label: "Landings per Flight",
    category: "Operations & Flights",
    getValue1: (u) => (u.onlineFlights > 0 ? Math.round((u.landingCount / u.onlineFlights) * 100) / 100 : 0),
    getValue2: (u) => (u.onlineFlights > 0 ? Math.round((u.landingCount / u.onlineFlights) * 100) / 100 : 0),
    display1: (u) => (u.onlineFlights > 0 ? `${(u.landingCount / u.onlineFlights).toFixed(2)}` : "—"),
    display2: (u) => (u.onlineFlights > 0 ? `${(u.landingCount / u.onlineFlights).toFixed(2)}` : "—"),
    compareMode: "higher",
  },

  // Safety & Violations
  {
    label: "Total Violations",
    category: "Safety & Violations",
    getValue1: (u) => u.violations,
    getValue2: (u) => u.violations,
    display1: (u) => u.violations.toLocaleString(),
    display2: (u) => u.violations.toLocaleString(),
    compareMode: "lower",
  },
  {
    label: "Level 1 Violations",
    category: "Safety & Violations",
    getValue1: (u) => u.violationCountByLevel?.level1 ?? 0,
    getValue2: (u) => u.violationCountByLevel?.level1 ?? 0,
    display1: (u) => (u.violationCountByLevel?.level1 ?? 0).toLocaleString(),
    display2: (u) => (u.violationCountByLevel?.level1 ?? 0).toLocaleString(),
    compareMode: "lower",
  },
  {
    label: "Level 2 Violations",
    category: "Safety & Violations",
    getValue1: (u) => u.violationCountByLevel?.level2 ?? 0,
    getValue2: (u) => u.violationCountByLevel?.level2 ?? 0,
    display1: (u) => (u.violationCountByLevel?.level2 ?? 0).toLocaleString(),
    display2: (u) => (u.violationCountByLevel?.level2 ?? 0).toLocaleString(),
    compareMode: "lower",
  },
  {
    label: "Level 3 Violations",
    category: "Safety & Violations",
    getValue1: (u) => u.violationCountByLevel?.level3 ?? 0,
    getValue2: (u) => u.violationCountByLevel?.level3 ?? 0,
    display1: (u) => (u.violationCountByLevel?.level3 ?? 0).toLocaleString(),
    display2: (u) => (u.violationCountByLevel?.level3 ?? 0).toLocaleString(),
    compareMode: "lower",
  },
  {
    label: "Violations per 100 Flights",
    category: "Safety & Violations",
    getValue1: (u) => (u.onlineFlights > 0 ? Math.round((u.violations / u.onlineFlights) * 1000) / 10 : 0),
    getValue2: (u) => (u.onlineFlights > 0 ? Math.round((u.violations / u.onlineFlights) * 1000) / 10 : 0),
    display1: (u) => (u.onlineFlights > 0 ? `${((u.violations / u.onlineFlights) * 100).toFixed(1)}%` : "0.0%"),
    display2: (u) => (u.onlineFlights > 0 ? `${((u.violations / u.onlineFlights) * 100).toFixed(1)}%` : "0.0%"),
    compareMode: "lower",
  },
];

export type StatOutcome = "win" | "lose" | "equal" | "neutral";

export function getStatOutcome(
  val1: number | string,
  val2: number | string,
  compareMode: "higher" | "lower" | "neutral"
): { p1Outcome: StatOutcome; p2Outcome: StatOutcome } {
  if (compareMode === "neutral") {
    return { p1Outcome: "neutral", p2Outcome: "neutral" };
  }

  const num1 = typeof val1 === "number" ? val1 : parseFloat(String(val1));
  const num2 = typeof val2 === "number" ? val2 : parseFloat(String(val2));

  if (isNaN(num1) || isNaN(num2)) {
    return { p1Outcome: "neutral", p2Outcome: "neutral" };
  }

  const diff = num1 - num2;
  // If difference is effectively zero:
  if (Math.abs(diff) < 0.0001) {
    return { p1Outcome: "equal", p2Outcome: "equal" };
  }

  if (compareMode === "higher") {
    return diff > 0
      ? { p1Outcome: "win", p2Outcome: "lose" }
      : { p1Outcome: "lose", p2Outcome: "win" };
  } else {
    // compareMode === "lower": fewer violations / lower rate is better
    return diff < 0
      ? { p1Outcome: "win", p2Outcome: "lose" }
      : { p1Outcome: "lose", p2Outcome: "win" };
  }
}

export function getStatTextColor(outcome: StatOutcome): string {
  switch (outcome) {
    case "win":
      return "text-emerald-600 dark:text-emerald-400 font-bold";
    case "lose":
      return "text-rose-600 dark:text-rose-400 font-bold";
    case "equal":
      return "text-amber-500 dark:text-amber-400 font-bold";
    default:
      return "text-slate-900 dark:text-white font-semibold";
  }
}

export default function GradeComparisonView({
  currentUser,
  onClose,
}: GradeComparisonViewProps) {
  const [secondUsername, setSecondUsername] = useState("");
  const [comparisonUser, setComparisonUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const handleSearchSecondPilot = async (searchName?: string) => {
    const nameToSearch = (searchName || secondUsername).trim();
    if (!nameToSearch) return;

    if (nameToSearch.toLowerCase() === currentUser.discourseUsername.toLowerCase()) {
      setError("Please enter a different pilot to compare with.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/user/full/${encodeURIComponent(nameToSearch)}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Pilot "${nameToSearch}" not found on Infinite Flight Community.`);
        }
        throw new Error(data.message || `Failed to load profile for "${nameToSearch}".`);
      }

      setComparisonUser(data.user);
      setSecondUsername("");
    } catch (err: any) {
      setError(err.message || "Could not fetch comparison pilot.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearComparison = () => {
    setComparisonUser(null);
    setError(null);
    setSecondUsername("");
  };

  const p1GradeStyle = getGradeBadgeStyle(currentUser.grade);
  const p2GradeStyle = comparisonUser ? getGradeBadgeStyle(comparisonUser.grade) : null;

  const categories = ["all", "Experience & Flight", "Operations & Flights", "Safety & Violations"];

  const filteredMetrics = selectedCategory === "all"
    ? STAT_METRICS
    : STAT_METRICS.filter((m) => m.category === selectedCategory);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top Banner & Pilot Search Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Pilot Statistics Comparison
              </h3>
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.2 text-[10px] font-semibold">
                Analytics
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Side-by-side flight hours, landings, operations, and violation analytics
            </p>
          </div>

          <div className="flex items-center gap-2">
            {comparisonUser && (
              <button
                type="button"
                id="change-comparison-pilot-btn"
                onClick={handleClearComparison}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Change Pilot
              </button>
            )}

            <button
              type="button"
              id="exit-comparison-mode-btn"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>Exit Comparison</span>
            </button>
          </div>
        </div>

        {/* Second Pilot Search Box if not chosen yet */}
        {!comparisonUser && (
          <div className="mt-4 space-y-3">
            <div className="max-w-lg">
              <label
                htmlFor="compare-pilot-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Compare stats against another pilot:
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="compare-pilot-input"
                    type="text"
                    value={secondUsername}
                    onChange={(e) => {
                      setSecondUsername(e.target.value);
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearchSecondPilot();
                    }}
                    placeholder="Enter pilot's IFC username..."
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-400 transition"
                  />
                </div>
                <button
                  type="button"
                  id="submit-compare-pilot-btn"
                  onClick={() => handleSearchSecondPilot()}
                  disabled={loading || !secondUsername.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {loading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  <span>Compare</span>
                </button>
              </div>

              {error && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Side-by-Side Pilot Header Profiles */}
        {comparisonUser && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current Pilot (Pilot 1) Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 relative">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden border border-slate-300 dark:border-slate-600 shrink-0">
                    {currentUser.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.discourseUsername}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-sm">
                        {currentUser.discourseUsername.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white text-sm block">
                      {currentUser.discourseUsername}
                    </span>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {currentUser.virtualOrganization || "Infinite Flight Pilot"}
                    </div>
                  </div>
                </div>

                <span
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${p1GradeStyle.bg} ${p1GradeStyle.text} ${p1GradeStyle.border}`}
                >
                  Grade {currentUser.grade}
                </span>
              </div>
            </div>

            {/* Comparison Pilot (Pilot 2) Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 relative">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden border border-slate-300 dark:border-slate-600 shrink-0">
                    {comparisonUser.avatarUrl ? (
                      <img
                        src={comparisonUser.avatarUrl}
                        alt={comparisonUser.discourseUsername}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-sm">
                        {comparisonUser.discourseUsername.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white text-sm block">
                      {comparisonUser.discourseUsername}
                    </span>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {comparisonUser.virtualOrganization || "Infinite Flight Pilot"}
                    </div>
                  </div>
                </div>

                {p2GradeStyle && (
                  <span
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${p2GradeStyle.bg} ${p2GradeStyle.text} ${p2GradeStyle.border}`}
                  >
                    Grade {comparisonUser.grade}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side-by-Side Statistics Table */}
      {comparisonUser && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs space-y-4 transition-colors">
          {/* Category Filter Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Detailed Metrics Breakdown
              </h4>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Side-by-side flight time, landings, ATC activity, and violation records
              </p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {cat === "all" ? "All Metrics" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                  <th className="pb-2.5 font-medium">Metric</th>
                  <th className="pb-2.5 font-medium">Category</th>
                  <th className="pb-2.5 font-medium text-slate-900 dark:text-white text-right pr-6">
                    {currentUser.discourseUsername}
                  </th>
                  <th className="pb-2.5 font-medium text-slate-900 dark:text-white text-right pr-6">
                    {comparisonUser.discourseUsername}
                  </th>
                  <th className="pb-2.5 font-medium text-right">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMetrics.map((stat, idx) => {
                  const val1 = stat.getValue1(currentUser);
                  const val2 = stat.getValue2(comparisonUser);
                  const { p1Outcome, p2Outcome } = getStatOutcome(val1, val2, stat.compareMode);

                  // Calculate difference if both are numbers
                  let diffLabel = "—";
                  if (typeof val1 === "number" && typeof val2 === "number") {
                    const diff = val1 - val2;
                    if (diff === 0) {
                      diffLabel = "Equal";
                    } else if (diff > 0) {
                      diffLabel = `+${diff.toLocaleString()}`;
                    } else {
                      diffLabel = `${diff.toLocaleString()}`;
                    }
                  }

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Metric Name */}
                      <td className="py-3 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        {stat.label}
                      </td>

                      {/* Category */}
                      <td className="py-3 pr-3 text-slate-400 dark:text-slate-500">
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700">
                          {stat.category}
                        </span>
                      </td>

                      {/* Pilot 1 Value */}
                      <td className="py-3 pr-6 text-right font-mono text-xs">
                        <span className={getStatTextColor(p1Outcome)}>
                          {stat.display1(currentUser)}
                        </span>
                      </td>

                      {/* Pilot 2 Value */}
                      <td className="py-3 pr-6 text-right font-mono text-xs">
                        <span className={getStatTextColor(p2Outcome)}>
                          {stat.display2(comparisonUser)}
                        </span>
                      </td>

                      {/* Difference */}
                      <td className="py-3 pl-3 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {diffLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-2.5">
            {filteredMetrics.map((stat, idx) => {
              const val1 = stat.getValue1(currentUser);
              const val2 = stat.getValue2(comparisonUser);
              const { p1Outcome, p2Outcome } = getStatOutcome(val1, val2, stat.compareMode);

              let diffLabel = "—";
              if (typeof val1 === "number" && typeof val2 === "number") {
                const diff = val1 - val2;
                if (diff === 0) {
                  diffLabel = "Equal";
                } else if (diff > 0) {
                  diffLabel = `+${diff.toLocaleString()}`;
                } else {
                  diffLabel = `${diff.toLocaleString()}`;
                }
              }

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {stat.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {stat.category}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* Pilot 1 */}
                    <div className="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold block truncate">
                        {currentUser.discourseUsername}
                      </span>
                      <span className={`font-mono block mt-0.5 truncate ${getStatTextColor(p1Outcome)}`}>
                        {stat.display1(currentUser)}
                      </span>
                    </div>

                    {/* Pilot 2 */}
                    <div className="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold block truncate">
                        {comparisonUser.discourseUsername}
                      </span>
                      <span className={`font-mono block mt-0.5 truncate ${getStatTextColor(p2Outcome)}`}>
                        {stat.display2(comparisonUser)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Variance:</span>
                    <span>{diffLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
