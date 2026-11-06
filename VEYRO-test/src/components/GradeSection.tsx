import { useState } from "react";
import { GradeData, UserSummary, GradeRule } from "../types";
import { Check, X, ShieldAlert, TrendingUp, AlertCircle, Calendar, Award, Info, BarChart3, Users } from "lucide-react";
import GradeComparisonView from "./GradeComparisonView";

interface GradeSectionProps {
  gradeData: GradeData | null;
  user: UserSummary;
}

/**
 * Calculates human-readable advice for how to meet an unmet grade requirement.
 */
export function getRequirementGuidance(rule: GradeRule): string {
  const prop = rule.definition?.property || "";
  const userVal = rule.userValue;
  const refVal = rule.referenceValue;

  switch (prop) {
    case "TotalFlightTime": {
      const diff = Math.max(0, Math.ceil(refVal - userVal));
      return `Log ${diff} more flight hours`;
    }
    case "FlightTimeLongPeriod": {
      const diff = Math.max(0, Math.ceil(refVal - userVal));
      return `Log ${diff} more flight hours in the 90-day window`;
    }
    case "TotalLandings": {
      const diff = Math.max(0, Math.ceil(refVal - userVal));
      return `Complete ${diff} more landings`;
    }
    case "LandingCountLongPeriod": {
      const diff = Math.max(0, Math.ceil(refVal - userVal));
      return `Complete ${diff} more landings in the 90-day window`;
    }
    case "TotalXP": {
      const diff = Math.max(0, Math.ceil(refVal - userVal));
      return `Earn ${diff.toLocaleString()} more XP`;
    }
    case "ViolationsShortPeriod": {
      return `Wait: 24h rolling period without Level 1 violations`;
    }
    case "ViolationsMediumPeriod": {
      return `Wait: 7-day rolling window to clear Level 1 violations`;
    }
    case "ReportCountMediumPeriod": {
      return `Wait: 7 days for Level 3 report/ghosting to expire`;
    }
    case "Total12MonthsATCMinorReports":
    case "Total12MonthsATCMajorReports":
    case "Total12MonthsATCAllReports": {
      return `Wait: 12-month ATC violation window to clear`;
    }
    case "ViolationsByLandingShortPeriod": {
      return `Fly clean landings or wait for old violations to clear`;
    }
    default: {
      if (rule.definition?.operator === 3) {
        return `Wait for violations in this period to expire`;
      }
      if (refVal > userVal) {
        const diff = Math.ceil(refVal - userVal);
        return `Need ${diff} more to reach target (${rule.referenceValueString})`;
      }
      return `Complete required flight activity or wait for violations to expire`;
    }
  }
}

export default function GradeSection({ gradeData, user }: GradeSectionProps) {
  const [isCompareMode, setIsCompareMode] = useState(false);
  const currentGradeIndex = gradeData?.gradeIndex ?? (user.grade - 1);
  const defaultSelectedGrade = currentGradeIndex < 4 ? currentGradeIndex + 1 : currentGradeIndex;
  const [selectedGradeIndex, setSelectedGradeIndex] = useState(defaultSelectedGrade);
  const [expandedGuidance, setExpandedGuidance] = useState<Record<number, boolean>>({});
  const [expandedNextRules, setExpandedNextRules] = useState<Record<number, boolean>>({});

  const toggleGuidance = (ruleIndex: number) => {
    setExpandedGuidance((prev) => ({ ...prev, [ruleIndex]: !prev[ruleIndex] }));
  };

  const toggleNextGradeGuidance = (index: number) => {
    setExpandedNextRules((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  if (isCompareMode) {
    return (
      <GradeComparisonView
        currentUser={user}
        onClose={() => setIsCompareMode(false)}
      />
    );
  }

  if (!gradeData || !gradeData.grades || gradeData.grades.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 dark:text-slate-400">
        <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
        <p>No detailed grade requirement matrix available for this user.</p>
      </div>
    );
  }

  const grades = gradeData.grades;
  const nextGrade = grades[currentGradeIndex + 1];
  const selectedGrade = grades[selectedGradeIndex] || grades[currentGradeIndex];

  let nextGradePassedCount = 0;
  let nextGradeTotalCount = 0;
  const failingNextRules: { name: string; current: string; target: string; guidance: string }[] = [];

  if (nextGrade && nextGrade.rules) {
    nextGradeTotalCount = nextGrade.rules.length;
    nextGrade.rules.forEach((r) => {
      if (r.state === 1) {
        nextGradePassedCount++;
      } else {
        failingNextRules.push({
          name: r.definition.name,
          current: r.userValueString,
          target: r.referenceValueString,
          guidance: getRequirementGuidance(r),
        });
      }
    });
  }

  const nextGradePct = nextGradeTotalCount > 0
    ? Math.round((nextGradePassedCount / nextGradeTotalCount) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Grade Progress toward Next Grade Banner */}
      {nextGrade ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Progress toward {nextGrade.name}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {nextGradePassedCount} of {nextGradeTotalCount} criteria met ({nextGradePct}% completed)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-36 sm:w-48 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-900 dark:bg-white transition-all duration-500"
                  style={{ width: `${nextGradePct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">{nextGradePct}%</span>
            </div>
          </div>

          {/* Missing criteria callout with explicit guidance on how to reach */}
          {failingNextRules.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 p-3.5 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Remaining to unlock {nextGrade.name}:</span>
              <ul className="mt-2 space-y-2 text-xs">
                {failingNextRules.map((item, i) => (
                  <li key={i} className="flex flex-col gap-1 border-b border-slate-200/60 dark:border-slate-700/60 pb-2 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {item.name}: <span className="font-mono text-slate-500 dark:text-slate-400 font-normal">{item.current}</span> / <span className="text-slate-400 dark:text-slate-500">Target: {item.target}</span>
                        </span>
                        <button
                          type="button"
                          id={`next-grade-advice-btn-${i}`}
                          onClick={() => toggleNextGradeGuidance(i)}
                          className={`inline-flex items-center justify-center h-4.5 w-4.5 rounded-full text-[11px] font-serif font-bold italic transition cursor-pointer ${
                            expandedNextRules[i]
                              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs"
                              : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-600"
                          }`}
                          title={expandedNextRules[i] ? "Hide advice" : "How to achieve: click for advice"}
                          aria-label="How to achieve advice"
                        >
                          i
                        </button>
                      </div>
                    </div>
                    {expandedNextRules[i] && (
                      <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-normal shadow-2xs">
                        <strong className="font-semibold text-slate-900 dark:text-white">How to achieve:</strong> {item.guidance}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center gap-3">
            <Award className="h-5 w-5 text-slate-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Maximum Rank: Grade 5 Master Pilot
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All 12 Infinite Flight grade conditions are met and active.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grade Selector Tabs & Matrix */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Grade Matrix</h3>
              <button
                type="button"
                id="open-grade-comparison-btn"
                onClick={() => setIsCompareMode(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
                title="Compare stats side-by-side with another pilot"
              >
                <BarChart3 className="h-3.5 w-3.5 text-slate-500" />
                <span>Compare Stats</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Evaluation rules against official Infinite Flight requirements with achievement guidance
            </p>
          </div>

          {/* Grade selection tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {grades.map((g, idx) => {
              const isCurrent = idx === currentGradeIndex;
              const isSelected = idx === selectedGradeIndex;
              const shortName = `G${idx + 1}`;

              return (
                <button
                  key={g.index}
                  id={`grade-tab-${idx + 1}`}
                  onClick={() => setSelectedGradeIndex(idx)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition border cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-2xs"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <span className="sm:hidden">{shortName}</span>
                  <span className="hidden sm:inline">{g.name}</span>
                  {isCurrent && (
                    <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${isSelected ? "bg-white/20 dark:bg-slate-950/20 text-white dark:text-slate-950" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                      CURRENT
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Grade Table (Desktop) & Card List (Mobile) */}
        <div className="mt-3">
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                  <th className="pb-2.5 font-medium">Requirement</th>
                  <th className="pb-2.5 font-medium">Window</th>
                  <th className="pb-2.5 font-medium">Pilot Value</th>
                  <th className="pb-2.5 font-medium">Target</th>
                  <th className="pb-2.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedGrade.rules.map((rule) => {
                  const isPassed = rule.state === 1;
                  const periodDays = rule.definition.period;
                  let periodLabel = "All-Time";
                  if (periodDays < 2) periodLabel = "24h";
                  else if (periodDays <= 7) periodLabel = "7d";
                  else if (periodDays <= 90) periodLabel = "90d";
                  else if (periodDays <= 365) periodLabel = "12m";

                  const guidance = !isPassed ? getRequirementGuidance(rule) : null;

                  return (
                    <tr
                      key={rule.ruleIndex}
                      className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                        !isPassed ? "bg-rose-50/20 dark:bg-rose-950/10" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{rule.definition.name}</span>
                          {guidance && (
                            <button
                              type="button"
                              id={`guidance-btn-${rule.ruleIndex}`}
                              onClick={() => toggleGuidance(rule.ruleIndex)}
                              className={`inline-flex items-center justify-center h-4.5 w-4.5 rounded-full text-[11px] font-serif font-bold italic transition cursor-pointer ${
                                expandedGuidance[rule.ruleIndex]
                                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700"
                              }`}
                              title={
                                expandedGuidance[rule.ruleIndex]
                                  ? "Hide guidance"
                                  : "How to achieve: click for advice"
                              }
                              aria-label="How to achieve advice"
                            >
                              i
                            </button>
                          )}
                        </div>
                        {guidance && expandedGuidance[rule.ruleIndex] && (
                          <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-[11px] font-normal text-slate-700 dark:text-slate-300 shadow-2xs">
                            <div className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white mb-0.5">
                              <Info className="h-3 w-3 text-slate-400" />
                              <span>How to achieve:</span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400">{guidance}</p>
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-500 dark:text-slate-400 align-top">
                        <span className="inline-flex items-center justify-center w-16 text-center rounded bg-slate-100 dark:bg-slate-800 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                          {periodLabel}
                        </span>
                      </td>
                      <td className="py-3 pr-4 whitespace-pre-line text-slate-800 dark:text-slate-200 font-mono text-[11px] align-top">
                        {rule.userValueString}
                      </td>
                      <td className="py-3 pr-4 text-slate-500 dark:text-slate-400 font-mono text-[11px] align-top">
                        {rule.referenceValueString}
                      </td>
                      <td className="py-3 text-right align-top">
                        {isPassed ? (
                          <span className="inline-flex items-center justify-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 w-20 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            Met
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center gap-1 rounded-full border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 w-20 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                            <X className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0" />
                            Not Met
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List (sm:hidden) */}
          <div className="sm:hidden space-y-2.5 pt-1">
            {selectedGrade.rules.map((rule) => {
              const isPassed = rule.state === 1;
              const periodDays = rule.definition.period;
              let periodLabel = "All-Time";
              if (periodDays < 2) periodLabel = "24h";
              else if (periodDays <= 7) periodLabel = "7d";
              else if (periodDays <= 90) periodLabel = "90d";
              else if (periodDays <= 365) periodLabel = "12m";

              const guidance = !isPassed ? getRequirementGuidance(rule) : null;

              return (
                <div
                  key={rule.ruleIndex}
                  className={`rounded-xl border p-3 transition-colors ${
                    !isPassed
                      ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20"
                      : "border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20"
                  }`}
                >
                  {/* Top Row: Name + Window Badge & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {rule.definition.name}
                        </span>
                        <span className="inline-flex items-center justify-center w-14 text-center rounded bg-slate-200/60 dark:bg-slate-700/60 py-0.5 text-[9px] font-medium text-slate-700 dark:text-slate-300">
                          {periodLabel}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isPassed ? (
                        <span className="inline-flex items-center justify-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 w-18 py-0.5 text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          Met
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 rounded-full border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 w-18 py-0.5 text-[9.5px] font-semibold text-rose-700 dark:text-rose-300">
                          <X className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          Not Met
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Row: Current Value vs Target Requirement */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg bg-white/80 dark:bg-slate-900/70 p-2 border border-slate-200/60 dark:border-slate-800/80 text-xs">
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                        Current Value
                      </div>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-[11px] mt-0.5 whitespace-pre-line">
                        {rule.userValueString}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                        Target Requirement
                      </div>
                      <div className="font-mono text-slate-700 dark:text-slate-300 text-[11px] mt-0.5 whitespace-pre-line">
                        {rule.referenceValueString}
                      </div>
                    </div>
                  </div>

                  {/* Guidance Drawer */}
                  {guidance && (
                    <div className="mt-2.5">
                      <button
                        type="button"
                        id={`guidance-mobile-btn-${rule.ruleIndex}`}
                        onClick={() => toggleGuidance(rule.ruleIndex)}
                        className={`w-full flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition cursor-pointer border ${
                          expandedGuidance[rule.ruleIndex]
                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                            : "bg-amber-500/10 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5 shrink-0" />
                          <span>How to achieve requirement</span>
                        </div>
                        <span className="text-[10px] font-bold">
                          {expandedGuidance[rule.ruleIndex] ? "Hide" : "Show"}
                        </span>
                      </button>

                      {expandedGuidance[rule.ruleIndex] && (
                        <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-[11px] text-slate-700 dark:text-slate-300 shadow-2xs">
                          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                            {guidance}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Violations Breakdown */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-slate-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Violation Details &amp; History
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Total Violations: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{user.violations}</strong>
          </span>
        </div>

        {/* 3 Level Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Level 1 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Level 1</span>
              <span className="rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">
                System
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {user.violationCountByLevel?.level1 ?? 0}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              Speed, taxiway, aerobatics
            </p>
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-[10px]">
                <Calendar className="h-3 w-3" />
                <span>Last: {gradeData.lastLevel1ViolationDate ? new Date(gradeData.lastLevel1ViolationDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "None on record"}</span>
              </div>
            </div>
          </div>

          {/* Level 2 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Level 2</span>
              <span className="rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">
                ATC Minor
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {user.violationCountByLevel?.level2 ?? 0}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              Minor ATC infraction (Expert)
            </p>
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-[10px]">
                <Calendar className="h-3 w-3" />
                <span>Last: {gradeData.lastLevel2ViolationDate ? new Date(gradeData.lastLevel2ViolationDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "None on record"}</span>
              </div>
            </div>
          </div>

          {/* Level 3 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Level 3</span>
              <span className="rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">
                ATC Major
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {user.violationCountByLevel?.level3 ?? 0}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              Severe ATC infraction (7-day report/ban)
            </p>
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-[10px]">
                <Calendar className="h-3 w-3" />
                <span>Last: {gradeData.lastLevel3ViolationDate ? new Date(gradeData.lastLevel3ViolationDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "None on record"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
          <span>
            Total Landings: <strong className="text-slate-800 dark:text-slate-200">{user.landingCount.toLocaleString()}</strong> · Violations: <strong className="text-slate-800 dark:text-slate-200">{user.violations}</strong>
          </span>
          <span className="font-mono text-slate-600 dark:text-slate-300">
            Ratio: {user.landingCount > 0 ? (user.violations / user.landingCount).toFixed(4) : "0.0000"} violations / landing
          </span>
        </div>
      </div>
    </div>
  );
}
