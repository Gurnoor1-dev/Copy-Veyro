import { useState, useEffect } from "react";
import {
  LiveAtcOverviewResponse,
  LiveAirportData,
} from "../types/liveAtc";
import { KNOWN_AIRPORTS } from "../data/airportsData";
import {
  Radio,
  Plane,
  RefreshCw,
  Search,
  X,
  ExternalLink,
  PlaneLanding,
  PlaneTakeoff,
  ArrowUpRight,
} from "lucide-react";

interface LiveAtcSectionProps {
  onSelectPilot: (username: string) => void;
}

export default function LiveAtcSection({ onSelectPilot }: LiveAtcSectionProps) {
  const [overview, setOverview] = useState<LiveAtcOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("expert");

  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [airportDetail, setAirportDetail] = useState<LiveAirportData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<"status" | "controllers" | "traffic" | "runways">("status");
  const [trafficDirection, setTrafficDirection] = useState<"inbound" | "outbound">("inbound");

  const fetchOverview = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/live/atc?server=${encodeURIComponent(selectedServer)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data: LiveAtcOverviewResponse = await res.json();
      setOverview(data);

      if (!selectedIcao && data.airports.length > 0 && typeof window !== "undefined" && window.innerWidth >= 1024) {
        handleSelectAirport(data.airports[0].icao);
      }
    } catch (_err) {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(() => fetchOverview(true), 45000);
    return () => clearInterval(interval);
  }, [selectedServer]);

  const handleSelectAirport = async (icao: string) => {
    setSelectedIcao(icao);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/live/airport/${encodeURIComponent(icao)}?server=${encodeURIComponent(selectedServer)}`);
      if (!res.ok) throw new Error("Could not load airport");
      const data: LiveAirportData = await res.json();
      const known = KNOWN_AIRPORTS[icao.toUpperCase()];
      data.runways = known?.runways || data.runways || [];
      setAirportDetail(data);
    } catch (_err) {
      // non-fatal
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredAirports = (overview?.airports || []).filter((ap) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ap.icao.toLowerCase().includes(q) ||
      (ap.iata && ap.iata.toLowerCase().includes(q)) ||
      ap.name.toLowerCase().includes(q) ||
      (ap.city && ap.city.toLowerCase().includes(q))
    );
  });

  return (
    <section className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* Compact, clean header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-slate-100 dark:border-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Live Air Traffic Control
              </h2>
              {overview && (
                <span className="text-xs text-slate-400 font-mono">
                  ({overview.activeAirportsCount} active airports · {overview.totalControllersOnline} frequencies)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Active towers, approach radar, ATIS information, and airport arrivals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs bg-slate-50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setSelectedServer("expert")}
                className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition ${
                  selectedServer === "expert"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Expert
              </button>
              <button
                type="button"
                onClick={() => setSelectedServer("training")}
                className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition ${
                  selectedServer === "training"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Training
              </button>
            </div>

            <button
              type="button"
              id="refresh-live-atc-btn"
              onClick={() => fetchOverview(true)}
              disabled={refreshing || loading}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* 2-Column Minimalist Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-6 items-start">
          {/* Airport List (Left 4 cols) */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                id="search-live-airports-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by ICAO or city..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5 pl-8 pr-7 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-slate-600 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
                ))}
              </div>
            ) : filteredAirports.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg">
                No active airports found.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                {filteredAirports.map((ap) => {
                  const isSelected = selectedIcao === ap.icao;
                  return (
                    <button
                      key={ap.icao}
                      type="button"
                      onClick={() => handleSelectAirport(ap.icao)}
                      className={`w-full text-left rounded-lg p-2.5 border transition cursor-pointer text-xs ${
                        isSelected
                          ? "border-slate-900 dark:border-slate-200 bg-slate-50 dark:bg-slate-900 font-medium"
                          : "border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {ap.icao}
                          </span>
                          {ap.iata && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              /{ap.iata}
                            </span>
                          )}
                          {ap.hasAtis && (
                            <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-1 py-0.2 text-[9px] font-mono text-emerald-700 dark:text-emerald-300">
                              ATIS{ap.atisCode ? ` ${ap.atisCode}` : ""}
                            </span>
                          )}
                        </div>

                        <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          {ap.controllerCount} ATC
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="truncate max-w-[170px]">{ap.name}</span>
                        <span className="font-mono text-[10px] shrink-0">
                          <span className="text-emerald-600 dark:text-emerald-400">↓{ap.inboundCount}</span>
                          <span className="mx-1 text-slate-300 dark:text-slate-700">·</span>
                          <span className="text-rose-600 dark:text-rose-400">↑{ap.outboundCount}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Airport Details Panel (Right 8 cols) */}
          <div className="lg:col-span-8 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-5 bg-white dark:bg-slate-950">
            {!selectedIcao ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Select an airport on the left to view active ATC frequencies, ATIS broadcast, and traffic.
              </div>
            ) : loadingDetail && !airportDetail ? (
              <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Loading airport data...</span>
              </div>
            ) : airportDetail ? (
              <div className="space-y-4">
                {/* Airport Mini Header */}
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-3 border-b border-slate-100 dark:border-slate-900">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xl font-bold text-slate-900 dark:text-white">
                      {airportDetail.icao}
                    </span>
                    {airportDetail.iata && (
                      <span className="font-mono text-xs text-slate-400">({airportDetail.iata})</span>
                    )}
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {airportDetail.name}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono">
                    {[airportDetail.city, airportDetail.country].filter(Boolean).join(", ")}
                    {airportDetail.elevation !== undefined && ` · ${airportDetail.elevation} ft`}
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-900 pb-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab("status")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer font-medium ${
                      activeTab === "status"
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    Status & ATIS
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("controllers")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer font-medium flex items-center gap-1 ${
                      activeTab === "controllers"
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span>Controllers</span>
                    <span className="font-mono text-[10px]">({airportDetail.controllers.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("traffic")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer font-medium flex items-center gap-1 ${
                      activeTab === "traffic"
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span>Traffic</span>
                    <span className="font-mono text-[10px]">({airportDetail.totalTraffic})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("runways")}
                    className={`px-2.5 py-1 rounded transition cursor-pointer font-medium flex items-center gap-1 ${
                      activeTab === "runways"
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span>Runways</span>
                    {airportDetail.runways?.length > 0 && (
                      <span className="font-mono text-[10px]">({airportDetail.runways.length})</span>
                    )}
                  </button>
                </div>

                {/* TAB 1: STATUS & ATIS */}
                {activeTab === "status" && (
                  <div className="space-y-3.5">
                    {/* Compact Metrics Row with tasteful subtle green/red accents */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                        <span className="text-[10px] text-slate-400 block uppercase">Inbounds</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ↓{airportDetail.inboundCount}
                          </span>
                          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-mono">arr</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                        <span className="text-[10px] text-slate-400 block uppercase">Outbounds</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-base font-mono font-bold text-rose-600 dark:text-rose-400">
                            ↑{airportDetail.outboundCount}
                          </span>
                          <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 font-mono">dep</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                        <span className="text-[10px] text-slate-400 block uppercase">Frequencies</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {airportDetail.controllers.length}
                          </span>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </div>
                      </div>
                      <div className="p-2.5 rounded border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                        <span className="text-[10px] text-slate-400 block uppercase">ATIS Code</span>
                        <span className="text-base font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                          {airportDetail.atis?.code ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">INFO {airportDetail.atis.code}</span>
                          ) : airportDetail.atis ? (
                            <span className="text-emerald-600 dark:text-emerald-400">ACTIVE</span>
                          ) : (
                            <span className="text-slate-400">NONE</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* ATIS Clean Card */}
                    {airportDetail.atis ? (
                      <div className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-500 font-mono text-[11px]">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                            ATIS Information {airportDetail.atis.code || ""}
                          </span>
                          <span>{airportDetail.atis.timeZulu || ""}</span>
                        </div>

                        <p className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800 leading-relaxed select-all">
                          {airportDetail.atis.raw}
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                          {airportDetail.atis.wind && (
                            <div>
                              <span className="text-slate-400 block font-sans text-[10px]">Wind</span>
                              <span className="text-slate-800 dark:text-slate-200 font-semibold">{airportDetail.atis.wind}</span>
                            </div>
                          )}
                          {airportDetail.atis.altimeter && (
                            <div>
                              <span className="text-slate-400 block font-sans text-[10px]">Altimeter</span>
                              <span className="text-slate-800 dark:text-slate-200 font-semibold">{airportDetail.atis.altimeter}</span>
                            </div>
                          )}
                          {airportDetail.atis.landingRunways && (
                            <div>
                              <span className="text-slate-400 block font-sans text-[10px]">Landing</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {airportDetail.atis.landingRunways.join(", ")}
                              </span>
                            </div>
                          )}
                          {airportDetail.atis.departingRunways && (
                            <div>
                              <span className="text-slate-400 block font-sans text-[10px]">Departing</span>
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                {airportDetail.atis.departingRunways.join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                        No active ATIS broadcast recorded for {airportDetail.icao}.
                      </div>
                    )}

                    {/* Active Frequencies Table */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Active Frequencies
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab("controllers")}
                          className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                        >
                          View table →
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px]">
                              <th className="py-2 px-3 font-semibold">Position</th>
                              <th className="py-2 px-3 font-semibold">Controller</th>
                              <th className="py-2 px-3 font-semibold text-right">Time Online</th>
                              <th className="py-2 px-3 font-semibold text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {airportDetail.controllers.map((ctrl) => (
                              <tr key={ctrl.frequencyId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                                <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                                  {ctrl.typeName}
                                </td>
                                <td className="py-2 px-3">
                                  <button
                                    type="button"
                                    onClick={() => onSelectPilot(ctrl.discourseUsername || ctrl.username)}
                                    className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-2 transition cursor-pointer font-medium"
                                  >
                                    {ctrl.discourseUsername || ctrl.username}
                                  </button>
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-500 text-[11px]">
                                  {ctrl.durationMinutes}m
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    ONLINE
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: CONTROLLERS TABLE */}
                {activeTab === "controllers" && (
                  <div>
                    {airportDetail.controllers.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded">
                        No controllers currently active.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px]">
                              <th className="py-2.5 px-3 font-semibold">Position</th>
                              <th className="py-2.5 px-3 font-semibold">Controller</th>
                              <th className="py-2.5 px-3 font-semibold">Organization</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Online</th>
                              <th className="py-2.5 px-3 font-semibold text-right">ATC Ops</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {airportDetail.controllers.map((ctrl) => (
                              <tr
                                key={ctrl.frequencyId}
                                className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                                  <div className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                    <span>{ctrl.typeName}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <button
                                    type="button"
                                    onClick={() => onSelectPilot(ctrl.discourseUsername || ctrl.username)}
                                    className="font-semibold text-slate-900 dark:text-white hover:underline underline-offset-2 transition cursor-pointer"
                                  >
                                    {ctrl.discourseUsername || ctrl.username}
                                  </button>
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                                  {ctrl.virtualOrganization || "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                                  {ctrl.durationMinutes}m
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-900 dark:text-white font-medium text-[11px]">
                                  {ctrl.controllerAtcOperations !== undefined
                                    ? ctrl.controllerAtcOperations.toLocaleString()
                                    : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => onSelectPilot(ctrl.discourseUsername || ctrl.username)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                  >
                                    <span>Profile</span>
                                    <ArrowUpRight className="h-3 w-3 text-slate-400" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: TRAFFIC TABLE */}
                {activeTab === "traffic" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setTrafficDirection("inbound")}
                        className={`px-2.5 py-1 rounded cursor-pointer transition font-medium flex items-center gap-1.5 ${
                          trafficDirection === "inbound"
                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                            : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <span className="text-emerald-500 font-mono">↓</span>
                        <span>Inbounds ({airportDetail.inboundFlights.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrafficDirection("outbound")}
                        className={`px-2.5 py-1 rounded cursor-pointer transition font-medium flex items-center gap-1.5 ${
                          trafficDirection === "outbound"
                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                            : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <span className="text-rose-500 font-mono">↑</span>
                        <span>Outbounds ({airportDetail.outboundFlights.length})</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px]">
                            <th className="py-2.5 px-3 font-semibold">Callsign</th>
                            <th className="py-2.5 px-3 font-semibold">Pilot</th>
                            <th className="py-2.5 px-3 font-semibold">Aircraft</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Altitude</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Speed</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Distance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {(trafficDirection === "inbound" ? airportDetail.inboundFlights : airportDetail.outboundFlights).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                                No {trafficDirection} traffic tracked at this time.
                              </td>
                            </tr>
                          ) : (
                            (trafficDirection === "inbound" ? airportDetail.inboundFlights : airportDetail.outboundFlights).map((fl) => (
                              <tr
                                key={fl.flightId}
                                className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                              >
                                <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[11px] font-mono ${trafficDirection === "inbound" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                      {trafficDirection === "inbound" ? "↓" : "↑"}
                                    </span>
                                    <span>{fl.callsign}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <button
                                    type="button"
                                    onClick={() => onSelectPilot(fl.username)}
                                    className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-2 transition cursor-pointer"
                                  >
                                    {fl.username}
                                  </button>
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px] max-w-[180px] truncate">
                                  {fl.aircraftName}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                  {fl.altitude.toLocaleString()} ft
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                  {fl.speed} kts
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500">
                                  {fl.distanceNm !== undefined ? `${fl.distanceNm} NM` : "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 4: RUNWAYS TABLE */}
                {activeTab === "runways" && (
                  <div>
                    {airportDetail.runways.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded">
                        Standard operational runways for {airportDetail.icao}.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px]">
                              <th className="py-2.5 px-3 font-semibold">Runway</th>
                              <th className="py-2.5 px-3 font-semibold">Operation</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Length</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Width</th>
                              <th className="py-2.5 px-3 font-semibold">Surface</th>
                              <th className="py-2.5 px-3 font-semibold text-right">ILS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {airportDetail.runways.map((rwy) => {
                              const isLanding = airportDetail.atis?.landingRunways?.some((r) => rwy.ident.includes(r.trim()));
                              const isDeparting = airportDetail.atis?.departingRunways?.some((r) => rwy.ident.includes(r.trim()));

                              return (
                                <tr
                                  key={rwy.ident}
                                  className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                                >
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                                    RWY {rwy.ident}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-1 font-mono text-[10px]">
                                      {isLanding && (
                                        <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 font-semibold text-emerald-700 dark:text-emerald-400">
                                          LANDING
                                        </span>
                                      )}
                                      {isDeparting && (
                                        <span className="rounded bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-1.5 py-0.2 font-semibold text-rose-700 dark:text-rose-400">
                                          DEPARTING
                                        </span>
                                      )}
                                      {!isLanding && !isDeparting && (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                    {rwy.lengthFt ? `${rwy.lengthFt.toLocaleString()} ft` : "—"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                    {rwy.widthFt ? `${rwy.widthFt} ft` : "—"}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                                    {rwy.surface || "Paved"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {rwy.ils ? (
                                      <span className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                        ILS
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono text-[10px]">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
