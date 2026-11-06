import { useState } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  X,
  Clock,
  Database,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { FlightItem } from "../types";
import { formatMinutes } from "./ProfileHeader";

interface FlightExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  flights: FlightItem[];
  totalCount: number;
  userId?: string;
  pilotName?: string;
  onFlightsUpdated?: (newFlights: FlightItem[]) => void;
}

export default function FlightExportModal({
  isOpen,
  onClose,
  flights,
  totalCount,
  userId,
  pilotName,
  onFlightsUpdated,
}: FlightExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectiveTotalCount = totalCount || flights.length;
  const isAllLoaded = flights.length >= effectiveTotalCount;

  const generateExcel = (flightsToExport: FlightItem[], scopeLabel: string) => {
    // 1. Prepare detailed flight sessions sheet
    const flightRows = flightsToExport.map((f) => {
      const dateObj = new Date(f.created);
      const dateStr = isNaN(dateObj.getTime())
        ? f.created
        : dateObj.toISOString().slice(0, 10);
      const timeStr = isNaN(dateObj.getTime())
        ? ""
        : dateObj.toISOString().slice(11, 16) + " UTC";

      const firstLanding = f.landingStats && f.landingStats.length > 0 ? f.landingStats[0] : null;
      const fpmVal =
        firstLanding && typeof firstLanding.verticalSpeed === "number"
          ? Math.round(firstLanding.verticalSpeed * 196.85)
          : null;

      return {
        "Date (UTC)": dateStr,
        "Time (UTC)": timeStr,
        "Callsign": f.callsign || "—",
        "Aircraft": f.aircraftName || "—",
        "Livery": f.liveryName || "—",
        "Origin": f.originAirport || "—",
        "Destination": f.destinationAirport || "—",
        "Flight Time (Minutes)": f.flightTimeMinutes || 0,
        "Flight Time (Formatted)": formatMinutes(f.flightTimeMinutes || 0),
        "Landings": f.landingCount || 0,
        "Touchdown (FPM)": fpmVal !== null ? fpmVal : "—",
        "Touchdown (G-Force)": firstLanding ? firstLanding.maxGForce.toFixed(2) : "—",
        "Fuel Used (kg)": Math.round(f.fuelUsedKg || 0),
        "XP Earned": f.xp || 0,
        "Server": f.server || "Expert",
        "Flight ID": f.id,
      };
    });

    // 2. Summary Statistics Sheet
    const totalFlightMinutes = flightsToExport.reduce(
      (sum, f) => sum + (f.flightTimeMinutes || 0),
      0
    );
    const totalLandings = flightsToExport.reduce(
      (sum, f) => sum + (f.landingCount || 0),
      0
    );
    const totalXp = flightsToExport.reduce((sum, f) => sum + (f.xp || 0), 0);
    const totalFuelKg = flightsToExport.reduce(
      (sum, f) => sum + (f.fuelUsedKg || 0),
      0
    );

    const summaryRows = [
      { Metric: "Export Scope", Value: scopeLabel },
      { Metric: "Pilot Name", Value: pilotName || "Infinite Flight Pilot" },
      { Metric: "Total Flights Exported", Value: flightsToExport.length },
      {
        Metric: "Total Flight Time",
        Value: `${formatMinutes(totalFlightMinutes)} (${totalFlightMinutes} mins)`,
      },
      { Metric: "Total Landings", Value: totalLandings },
      { Metric: "Total XP Earned", Value: totalXp.toLocaleString() },
      { Metric: "Total Fuel Consumed", Value: `${Math.round(totalFuelKg).toLocaleString()} kg` },
      {
        Metric: "Average Flight Duration",
        Value:
          flightsToExport.length > 0
            ? `${Math.round((totalFlightMinutes / flightsToExport.length) * 10) / 10} mins`
            : "0 mins",
      },
      { Metric: "Export Timestamp (UTC)", Value: new Date().toISOString() },
    ];

    const wb = XLSX.utils.book_new();

    const wsFlights = XLSX.utils.json_to_sheet(flightRows);
    wsFlights["!cols"] = [
      { wch: 14 }, // Date
      { wch: 12 }, // Time
      { wch: 14 }, // Callsign
      { wch: 22 }, // Aircraft
      { wch: 24 }, // Livery
      { wch: 10 }, // Origin
      { wch: 12 }, // Destination
      { wch: 18 }, // Flight Time Mins
      { wch: 18 }, // Flight Time Formatted
      { wch: 10 }, // Landings
      { wch: 14 }, // Fuel kg
      { wch: 12 }, // XP
      { wch: 12 }, // Server
      { wch: 38 }, // ID
    ];
    XLSX.utils.book_append_sheet(wb, wsFlights, "Flight Sessions");

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary["!cols"] = [{ wch: 30 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary Statistics");

    const safeName = (pilotName || "Pilot").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `VEYRO-Flights-${safeName}-${scopeLabel.replace(/\s+/g, "_")}-${dateTag}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleExportLatest100 = () => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const latest100 = flights.slice(0, 100);
      generateExcel(latest100, "Latest 100 Flights");
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
      let allFlights = flights;

      if (!isAllLoaded && userId) {
        setExportMessage(
          `Fetching all ${effectiveTotalCount} flights from Infinite Flight API...`
        );
        const res = await fetch(`/api/user/flights/all/${userId}`);
        if (!res.ok) {
          throw new Error(`Failed to load all flights (${res.status})`);
        }
        const data = await res.json();
        if (data?.data && Array.isArray(data.data)) {
          allFlights = data.data;
          if (onFlightsUpdated) {
            onFlightsUpdated(data.data);
          }
        }
      }

      setExportMessage("Building Excel spreadsheet (.xlsx)...");
      generateExcel(allFlights, "All Flights");
      setIsExporting(false);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to export all flights.");
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
                Export Flights to Excel
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Download spreadsheet (.xlsx)
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-flight-export-modal-btn"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Would you like to export your{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              latest 100 flights
            </span>{" "}
            or{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              all flights
            </span>
            ?
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
                id="export-latest-100-flights-btn"
                onClick={handleExportLatest100}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-left hover:border-emerald-400 dark:hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition cursor-pointer group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Latest 100 Flights
                    </div>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Fast
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Export your 100 most recent flight records.
                  </div>
                </div>
              </button>

              {/* Option 2: All Flights */}
              <button
                type="button"
                id="export-all-flights-btn"
                onClick={handleExportAll}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-left hover:border-emerald-400 dark:hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition cursor-pointer group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  <Database className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      All Flights ({effectiveTotalCount} total)
                    </div>
                    <span className="rounded-full bg-slate-200/70 dark:bg-slate-700/70 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                      Complete
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isAllLoaded
                      ? `All ${flights.length} flights are already loaded.`
                      : `Fetches your full flight history (${effectiveTotalCount} flights) from Infinite Flight.`}
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
            id="cancel-flight-export-btn"
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
