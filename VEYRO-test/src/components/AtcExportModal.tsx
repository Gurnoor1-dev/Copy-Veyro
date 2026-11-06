import { useState } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  X,
  Clock,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
} from "lucide-react";
import { AtcSessionItem, getIfatcRankName } from "../types";
import { formatMinutes } from "./ProfileHeader";

interface AtcExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: AtcSessionItem[];
  totalCount: number;
  userId?: string;
  controllerName?: string;
  atcRank?: number;
  onSessionsUpdated?: (newSessions: AtcSessionItem[]) => void;
}

export default function AtcExportModal({
  isOpen,
  onClose,
  sessions,
  totalCount,
  userId,
  controllerName,
  atcRank,
  onSessionsUpdated,
}: AtcExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectiveTotalCount = totalCount || sessions.length;
  const isAllLoaded = sessions.length >= effectiveTotalCount;

  const generateExcel = (sessionsToExport: AtcSessionItem[], scopeLabel: string) => {
    // 1. Prepare detailed sessions sheet
    const sessionRows = sessionsToExport.map((s) => {
      const dateObj = new Date(s.created);
      const dateStr = isNaN(dateObj.getTime())
        ? s.created
        : dateObj.toISOString().slice(0, 10);
      const timeStr = isNaN(dateObj.getTime())
        ? ""
        : dateObj.toISOString().slice(11, 16) + " UTC";

      const pace =
        s.durationMinutes > 0
          ? Math.round((s.operations / s.durationMinutes) * 60)
          : s.operations;

      return {
        "Date (UTC)": dateStr,
        "Time (UTC)": timeStr,
        "Airport (ICAO)": s.airportIcao || "—",
        "Facility": s.facilityTypeName || "Local",
        "Server": s.server || "Expert",
        "Duration (Minutes)": s.durationMinutes || 0,
        "Duration (Formatted)": formatMinutes(s.durationMinutes || 0),
        "Operations Handled": s.operations || 0,
        "Pace (Ops/Hr)": pace,
        "Reports Issued": s.violationsIssued || 0,
        "Session Status":
          (s.violationsIssued || 0) === 0 ? "Clean Session" : "Reports Issued",
        "Session ID": s.id,
      };
    });

    // 2. Prepare high-level summary statistics sheet
    const totalOps = sessionsToExport.reduce((sum, s) => sum + (s.operations || 0), 0);
    const totalMins = sessionsToExport.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const totalViolations = sessionsToExport.reduce(
      (sum, s) => sum + (s.violationsIssued || 0),
      0
    );
    const cleanSessions = sessionsToExport.filter(
      (s) => (s.violationsIssued || 0) === 0
    ).length;
    const cleanRate =
      sessionsToExport.length > 0
        ? Math.round((cleanSessions / sessionsToExport.length) * 100)
        : 100;

    const summaryRows = [
      { Metric: "Export Scope", Value: scopeLabel },
      { Metric: "Air Traffic Controller", Value: controllerName || "IFATC Pilot" },
      { Metric: "IFATC Rank", Value: atcRank !== undefined ? getIfatcRankName(atcRank) : "Controller" },
      { Metric: "Total Sessions Exported", Value: sessionsToExport.length },
      { Metric: "Total Operations in Export", Value: totalOps },
      { Metric: "Total Controlling Time", Value: `${formatMinutes(totalMins)} (${totalMins} minutes)` },
      {
        Metric: "Average Ops per Session",
        Value:
          sessionsToExport.length > 0
            ? Math.round((totalOps / sessionsToExport.length) * 10) / 10
            : 0,
      },
      { Metric: "Clean Sessions Rate", Value: `${cleanRate}% (${cleanSessions} of ${sessionsToExport.length})` },
      { Metric: "Total Violations/Reports Issued", Value: totalViolations },
      { Metric: "Export Timestamp (UTC)", Value: new Date().toISOString() },
    ];

    // Build workbook
    const wb = XLSX.utils.book_new();

    const wsSessions = XLSX.utils.json_to_sheet(sessionRows);
    wsSessions["!cols"] = [
      { wch: 14 }, // Date
      { wch: 12 }, // Time
      { wch: 14 }, // Airport
      { wch: 18 }, // Facility
      { wch: 14 }, // Server
      { wch: 18 }, // Duration Mins
      { wch: 18 }, // Duration Formatted
      { wch: 18 }, // Operations
      { wch: 14 }, // Pace
      { wch: 16 }, // Reports
      { wch: 16 }, // Status
      { wch: 38 }, // ID
    ];
    XLSX.utils.book_append_sheet(wb, wsSessions, "ATC Sessions");

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary["!cols"] = [{ wch: 30 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary Statistics");

    // Generate and download file
    const safeName = (controllerName || "Controller").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `VEYRO-ATC-${safeName}-${scopeLabel.replace(/\s+/g, "_")}-${dateTag}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleExportLatest100 = () => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const latest100 = sessions.slice(0, 100);
      generateExcel(latest100, "Latest 100 Sessions");
      setIsExporting(false);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate Excel file.");
      setIsExporting(false);
    }
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    setErrorMessage(null);

    try {
      let allSessions = sessions;

      // If not all sessions are loaded in memory yet, fetch complete archive
      if (!isAllLoaded && userId) {
        setExportMessage(
          `Fetching all ${effectiveTotalCount} ATC sessions from Infinite Flight...`
        );
        const res = await fetch(`/api/user/atc/all/${userId}`);
        if (!res.ok) {
          throw new Error(`Failed to load all ATC sessions (${res.status})`);
        }
        const data = await res.json();
        if (data?.data && Array.isArray(data.data)) {
          allSessions = data.data;
          if (onSessionsUpdated) {
            onSessionsUpdated(data.data);
          }
        }
      }

      setExportMessage("Building Excel spreadsheet (.xlsx)...");
      generateExcel(allSessions, "All Sessions");
      setIsExporting(false);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to fetch and export all sessions.");
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={() => {
        if (!isExporting) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl text-slate-900 dark:text-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Export Sessions to Excel
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Download spreadsheet (.xlsx)
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-export-modal-btn"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content / Question */}
        <div className="mt-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Would you like to export your <span className="font-semibold text-slate-900 dark:text-white">latest 100 sessions</span> or <span className="font-semibold text-slate-900 dark:text-white">all sessions</span>?
          </p>

          {isExporting ? (
            <div className="my-6 flex flex-col items-center justify-center py-4 text-center">
              <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {exportMessage || "Generating your Excel file..."}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Please keep this window open while the export finishes.
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {/* Option 1: Latest 100 */}
              <button
                type="button"
                id="export-latest-100-btn"
                onClick={handleExportLatest100}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-left hover:border-emerald-400 dark:hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition cursor-pointer group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Latest 100 Sessions
                    </div>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Fast
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Export only your 100 most recent controlling records.
                  </div>
                </div>
              </button>

              {/* Option 2: All Sessions */}
              <button
                type="button"
                id="export-all-sessions-btn"
                onClick={handleExportAll}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-left hover:border-emerald-400 dark:hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition cursor-pointer group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  <Database className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      All Sessions ({effectiveTotalCount} total)
                    </div>
                    <span className="rounded-full bg-slate-200/70 dark:bg-slate-700/70 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                      Complete
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isAllLoaded
                      ? `All ${sessions.length} sessions are already loaded in memory.`
                      : `Fetches your entire historical record (${effectiveTotalCount} sessions) from Infinite Flight.`}
                  </div>
                </div>
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-2.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            id="cancel-export-btn"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
