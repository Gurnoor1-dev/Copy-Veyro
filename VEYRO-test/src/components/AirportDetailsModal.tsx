import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  RefreshCw,
  Copy,
  Check,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Plane,
  Radio,
  FileText,
  ClipboardCheck,
} from "lucide-react";
import { AirportDetailsData, AirportTrafficFlight } from "../types";
import IFATCPrepPanel from "./IFATCPrepPanel";

interface AirportDetailsModalProps {
  icao: string;
  serverName: "Expert" | "Training";
  onClose: () => void;
  onSearchPilot: (username: string) => void;
}

type TabType = "atis" | "arrivals" | "departures" | "atc" | "ifatc";

export default function AirportDetailsModal({
  icao,
  serverName,
  onClose,
  onSearchPilot,
}: AirportDetailsModalProps) {
  const [data, setData] = useState<AirportDetailsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("atis");
  const [flightFilter, setFlightFilter] = useState<string>("");
  const [copiedAtis, setCopiedAtis] = useState<boolean>(false);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/airport/${encodeURIComponent(icao)}/details?server=${encodeURIComponent(
          serverName
        )}`
      );
      if (!res.ok) {
        throw new Error(`Failed to load details for ${icao}`);
      }
      const json: AirportDetailsData = await res.json();
      setData(json);

      // Default to arrivals if no ATIS is available
      if (!json.atis && activeTab === "atis") {
        setActiveTab("arrivals");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load airport details");
    } finally {
      setLoading(false);
    }
  }, [icao, serverName, activeTab]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopyAtis = () => {
    if (!data?.atis) return;
    navigator.clipboard.writeText(data.atis);
    setCopiedAtis(true);
    setTimeout(() => setCopiedAtis(false), 2000);
  };

  const filteredInbounds = useMemo(() => {
    if (!data?.inbounds) return [];
    if (!flightFilter.trim()) return data.inbounds;
    const q = flightFilter.toLowerCase();
    return data.inbounds.filter(
      (f) =>
        f.callsign.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q) ||
        f.aircraftName.toLowerCase().includes(q)
    );
  }, [data?.inbounds, flightFilter]);

  const filteredOutbounds = useMemo(() => {
    if (!data?.outbounds) return [];
    if (!flightFilter.trim()) return data.outbounds;
    const q = flightFilter.toLowerCase();
    return data.outbounds.filter(
      (f) =>
        f.callsign.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q) ||
        f.aircraftName.toLowerCase().includes(q)
    );
  }, [data?.outbounds, flightFilter]);

  const renderFlightRow = (f: AirportTrafficFlight) => {
    const isGround = f.speed < 40 && f.altitude < 1500;
    const altText = isGround
      ? "On Ground"
      : f.altitude >= 18000
      ? `FL${Math.round(f.altitude / 100)}`
      : `${f.altitude.toLocaleString()} ft`;

    return (
      <div
        key={f.flightId}
        className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <Plane className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="truncate">
            <div className="font-mono font-semibold text-slate-900 dark:text-white">
              {f.callsign}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 truncate">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSearchPilot(f.username);
                }}
                className="hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer truncate"
                title={`Inspect pilot ${f.username}`}
              >
                {f.username}
              </button>
              <span>·</span>
              <span className="truncate">{f.aircraftName}</span>
            </div>
          </div>
        </div>

        <div className="text-right shrink-0 font-mono text-[11px]">
          <div className="font-medium text-slate-900 dark:text-white">
            {altText}
          </div>
          <div className="text-slate-400 text-[10px] mt-0.5">
            {isGround ? `${f.speed} kts taxi` : `${f.speed} kts groundspeed`}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-mono tracking-wider text-slate-900 dark:text-white">
                  {icao}
                </span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                  {serverName} Server
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-sm sm:max-w-md">
                {data?.airportName || `${icao} Airport`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchDetails()}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Refresh airport telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-5 pt-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab("atis")}
            className={`flex items-center gap-1.5 pb-2.5 font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "atis"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>ATIS Broadcast</span>
            {data?.atisDetails?.letter && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold">
                {data.atisDetails.letter}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("arrivals")}
            className={`flex items-center gap-1.5 pb-2.5 font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "arrivals"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            <span>Arrivals</span>
            <span className="font-mono text-[10px] text-slate-400">
              ({data?.inboundCount ?? 0})
            </span>
          </button>

          <button
            onClick={() => setActiveTab("departures")}
            className={`flex items-center gap-1.5 pb-2.5 font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "departures"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Departures</span>
            <span className="font-mono text-[10px] text-slate-400">
              ({data?.outboundCount ?? 0})
            </span>
          </button>

          <button
            onClick={() => setActiveTab("atc")}
            className={`flex items-center gap-1.5 pb-2.5 font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "atc"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Active ATC</span>
            <span className="font-mono text-[10px] text-slate-400">
              ({data?.atcFacilities?.length ?? 0})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("ifatc")}
            className={`flex items-center gap-1.5 pb-2.5 font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "ifatc"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span>IFATC Prep</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "ifatc" ? (
            <IFATCPrepPanel icao={icao} />
          ) : loading && !data ? (
            <div className="py-16 text-center space-y-2">
              <div className="h-5 w-5 border-2 border-slate-900 dark:border-white border-t-transparent animate-spin rounded-full mx-auto" />
              <p className="text-xs text-slate-400 font-mono">
                Querying airport telemetry & ATIS...
              </p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs text-red-500 font-mono">
              {error}
            </div>
          ) : (
            <>
              {/* TAB 1: ATIS */}
              {activeTab === "atis" && (
                <div className="space-y-4">
                  {data?.atis ? (
                    <>
                      {/* ATIS Key Data Points */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                            Information
                          </div>
                          <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                            {data.atisDetails?.letter || "ACTIVE"}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            {data.atisDetails?.time || "Live"}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                            Landing Runway
                          </div>
                          <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5 truncate">
                            {data.atisDetails?.landingRunways || "Variable"}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Active arrival flow
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                            Departing Runway
                          </div>
                          <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5 truncate">
                            {data.atisDetails?.departingRunways || "Variable"}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Active departure flow
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                            Altimeter / QNH
                          </div>
                          <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                            {data.atisDetails?.altimeter || "1013"}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            {data.atisDetails?.temperature
                              ? `${data.atisDetails.temperature}°C / ${data.atisDetails.dewPoint || "-"}°C`
                              : "Standard pressure"}
                          </div>
                        </div>
                      </div>

                      {/* Wind & Weather row */}
                      {data.atisDetails?.wind && (
                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3 text-xs flex items-center justify-between">
                          <div>
                            <span className="text-slate-400 text-[11px]">Wind & Visibility: </span>
                            <span className="font-mono font-medium text-slate-900 dark:text-white ml-1">
                              {data.atisDetails.wind}
                              {data.atisDetails.visibility
                                ? ` · Visibility ${data.atisDetails.visibility} nm`
                                : ""}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Remarks */}
                      {data.atisDetails?.remarks && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white font-mono text-[11px] block mb-1">
                            Remarks:
                          </span>
                          <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px] leading-relaxed">
                            {data.atisDetails.remarks}
                          </p>
                        </div>
                      )}

                      {/* Full Raw ATIS Message */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider font-mono">
                            Official ATIS Broadcast
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyAtis}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                          >
                            {copiedAtis ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-500" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy Text</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-3.5 text-slate-300 font-mono text-xs leading-relaxed select-all">
                          {data.atis}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center space-y-2">
                      <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
                      <div className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                        No ATIS Broadcast Active
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        In-game ATIS broadcasts are recorded when an ATIS frequency is staffed by an authorized Air Traffic Controller.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ARRIVALS */}
              {activeTab === "arrivals" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter callsign, pilot, or aircraft..."
                        value={flightFilter}
                        onChange={(e) => setFlightFilter(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {filteredInbounds.length} inbound
                    </span>
                  </div>

                  {filteredInbounds.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-mono">
                      {data?.inbounds.length === 0
                        ? "No active inbound flights filed for this airport."
                        : "No flights matching filter."}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      {filteredInbounds.map(renderFlightRow)}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: DEPARTURES */}
              {activeTab === "departures" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter callsign, pilot, or aircraft..."
                        value={flightFilter}
                        onChange={(e) => setFlightFilter(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {filteredOutbounds.length} outbound
                    </span>
                  </div>

                  {filteredOutbounds.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-mono">
                      {data?.outbounds.length === 0
                        ? "No active outbound flights filed for this airport."
                        : "No flights matching filter."}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                      {filteredOutbounds.map(renderFlightRow)}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: ACTIVE ATC */}
              {activeTab === "atc" && (
                <div className="space-y-2">
                  {data?.atcFacilities && data.atcFacilities.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden text-xs">
                      {data.atcFacilities.map((atc, i) => (
                        <div
                          key={i}
                          className="px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-semibold text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {atc.facilityName}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSearchPilot(atc.username);
                              }}
                              className="font-medium text-slate-900 dark:text-white hover:underline cursor-pointer"
                              title={`Inspect controller ${atc.username}`}
                            >
                              {atc.username}
                            </button>
                          </div>

                          <div className="text-right font-mono text-[11px] text-slate-400">
                            {atc.startTime ? (
                              <span>Online</span>
                            ) : (
                              <span>Active</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-slate-400 font-mono">
                      No active controllers listed for this station.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-mono text-slate-400 flex items-center justify-between">
          <span>{data?.inboundCount ?? 0} arr · {data?.outboundCount ?? 0} dep</span>
          <span>Live telemetry</span>
        </div>
      </div>
    </div>
  );
}
