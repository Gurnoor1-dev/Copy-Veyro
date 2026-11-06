import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, ArrowRight, RefreshCw } from "lucide-react";
import { ServerAnalyticsData, AirportController } from "../types";
import AirportDetailsModal from "./AirportDetailsModal";

interface LandingHeroProps {
  onSearch: (username: string) => void;
  isLoading: boolean;
  onExploreLive?: () => void;
}

function getFacilityBadge(type: number, name: string): string {
  switch (type) {
    case 0:
      return "GND";
    case 1:
      return "TWR";
    case 2:
      return "UNI";
    case 3:
      return "DEL";
    case 4:
      return "APP";
    case 5:
      return "DEP";
    case 6:
      return "CTR";
    case 7:
      return "ATIS";
    default: {
      const lower = name.toLowerCase();
      if (lower.includes("approach")) return "APP";
      if (lower.includes("tower")) return "TWR";
      if (lower.includes("ground")) return "GND";
      if (lower.includes("atis")) return "ATIS";
      if (lower.includes("center")) return "CTR";
      if (lower.includes("departure")) return "DEP";
      return name.slice(0, 3).toUpperCase();
    }
  }
}

function formatDuration(startTime?: string): string {
  if (!startTime) return "";
  const normalized = startTime.replace(" ", "T");
  const time = new Date(normalized).getTime();
  if (isNaN(time)) return "";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (diffMinutes < 1) return "<1m";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return `${hours}h ${mins}m`;
}

export default function LandingHero({ onSearch, isLoading, onExploreLive }: LandingHeroProps) {
  const [username, setUsername] = useState("");
  const [analytics, setAnalytics] = useState<ServerAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Staffed airspace filters
  const [atcServerFilter, setAtcServerFilter] = useState<"Expert" | "Training">("Expert");
  const [atcSearchQuery, setAtcSearchQuery] = useState("");
  const [selectedAirportIcao, setSelectedAirportIcao] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch("/api/servers/analytics");
      if (res.ok) {
        const data: ServerAnalyticsData = await res.json();
        setAnalytics(data);
        setSecondsAgo(0);
      }
    } catch (err) {
      console.warn("Analytics fetch warning:", err);
    } finally {
      setAnalyticsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(() => {
      fetchAnalytics();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSearch(username.trim());
    }
  };

  // Filtered controlled airports for the Staffed Airspace section
  const filteredAirports = useMemo(() => {
    if (!analytics?.controlledAirports) return [];
    return analytics.controlledAirports
      .map((apt) => {
        const matchingControllers = apt.controllers.filter((c) => {
          return c.serverName === atcServerFilter;
        });
        return {
          ...apt,
          controllers: matchingControllers,
        };
      })
      .filter((apt) => {
        if (apt.controllers.length === 0) return false;
        if (!atcSearchQuery.trim()) return true;
        const q = atcSearchQuery.toLowerCase();
        const matchIcao = apt.icao.toLowerCase().includes(q);
        const matchController = apt.controllers.some(
          (c) =>
            c.username.toLowerCase().includes(q) ||
            c.facilityName.toLowerCase().includes(q)
        );
        return matchIcao || matchController;
      });
  }, [analytics?.controlledAirports, atcServerFilter, atcSearchQuery]);

  const totalFilteredFrequencies = useMemo(() => {
    return filteredAirports.reduce((sum, apt) => sum + apt.controllers.length, 0);
  }, [filteredAirports]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-12 sm:py-16 space-y-10">
      {/* Search Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="h-6 w-6 rounded-md bg-black border border-black dark:border-slate-800 flex items-center justify-center p-0.5 overflow-hidden shadow-xs">
            <img
              src="/logo.png"
              alt="VEYRO"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <span className="font-bold tracking-tight text-slate-900 dark:text-white text-lg">
            VEYRO
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Infinite Flight Analytics
        </h1>

        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Look up pilot statistics, grade compliance, flight logs, and live airspace telemetry.
        </p>

        {/* Minimal Search Box */}
        <form onSubmit={handleSubmit} className="pt-4 max-w-md mx-auto">
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-xs transition-colors focus-within:border-slate-400 dark:focus-within:border-slate-600">
            <div className="pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              id="landing-search-input"
              type="text"
              autoFocus
              placeholder="Search IFC username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
            <button
              id="landing-submit-btn"
              type="submit"
              disabled={isLoading || !username.trim()}
              className="flex items-center justify-center gap-1.5 min-w-[76px] rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            >
              {isLoading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 dark:border-slate-900/30 border-t-white dark:border-t-slate-900" />
              ) : (
                <>
                  <span>Search</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </form>

        {onExploreLive && (
          <div className="pt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={onExploreLive}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Open Live Hub (Orgs, Fleets, Schedules)</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Live Airspace Section */}
      <div className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-800">
        {/* Section title & sync status */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-900 dark:text-white tracking-tight">
            Live Airspace Telemetry
          </span>

          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
            <span>{secondsAgo < 5 ? "Synced just now" : `Synced ${secondsAgo}s ago`}</span>
            <span>·</span>
            <button
              onClick={() => fetchAnalytics(true)}
              disabled={isRefreshing}
              className="hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 4-Stat Metric Row */}
        {analyticsLoading && !analytics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60"
              />
            ))}
          </div>
        ) : analytics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Active Pilots
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {analytics.totalActivePlayers.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 truncate">
                Total connected
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Airborne
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {analytics.airborneCount.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {analytics.totalActivePlayers > 0
                  ? `${Math.round((analytics.airborneCount / analytics.totalActivePlayers) * 100)}% of traffic`
                  : "In flight"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                ATC Controllers
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {analytics.totalAtcCount}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                On active frequency
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Controlled Airports
              </div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {analytics.controlledAirports.length}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Airports staffed
              </div>
            </div>
          </div>
        ) : null}

        {/* 2-Column: Server Status & Most Flown Aircraft */}
        {analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Server Status Table */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs flex flex-col justify-between">
              <div>
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Server Status
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    3 servers online
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {analytics.servers.map((server) => {
                    const percent =
                      server.maxUsers > 0
                        ? ((server.userCount / server.maxUsers) * 100).toFixed(1)
                        : "0";
                    const minGrade =
                      server.minimumGradeLevel === 2
                        ? "Grade 3+"
                        : server.minimumGradeLevel === 1
                        ? "Grade 2+"
                        : "Grade 1";

                    return (
                      <div
                        key={server.id}
                        className="px-4 py-3 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-[110px]">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {server.name}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Min. {minGrade}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono tabular-nums text-slate-900 dark:text-white font-medium">
                            {server.userCount.toLocaleString()}{" "}
                            <span className="text-slate-400 text-[11px]">
                              / {server.maxUsers.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {percent}% capacity
                          </div>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <div className="font-mono tabular-nums text-slate-900 dark:text-white font-medium">
                            {server.atcCount}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            ATC on freq
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>Total Capacity</span>
                <span className="tabular-nums">
                  {analytics.totalActivePlayers.toLocaleString()} concurrent
                </span>
              </div>
            </div>

            {/* Most Flown Aircraft */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs flex flex-col justify-between">
              <div>
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Most Flown Aircraft
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Live fleet distribution
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {analytics.topAircraft.slice(0, 5).map((aircraft, idx) => (
                    <div key={aircraft.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span className="text-slate-400 font-mono text-[11px] w-3 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {aircraft.name}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          <span className="text-slate-900 dark:text-white font-medium">
                            {aircraft.count.toLocaleString()}
                          </span>{" "}
                          <span className="text-slate-400">({aircraft.percentage}%)</span>
                        </div>
                      </div>

                      {/* Clean minimalist progress track */}
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-800 dark:bg-slate-300 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(3, aircraft.percentage))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Telemetry Footer */}
              <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>Avg Cruise: {analytics.avgSpeedKnots} kts</span>
                <span>Avg Altitude: {analytics.avgAltitudeFeet.toLocaleString()} ft</span>
              </div>
            </div>
          </div>
        )}

        {/* Redesigned Staffed Airspace Section */}
        {analytics && analytics.controlledAirports.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
            {/* Header with Server Filter & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                    Staffed Airspace
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    ({totalFilteredFrequencies} {totalFilteredFrequencies === 1 ? "frequency" : "frequencies"} active)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any airport to view live ATIS broadcast, active arrival & departure traffic flows.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Server Filter (Expert & Training only) */}
                <div className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs">
                  <button
                    onClick={() => setAtcServerFilter("Expert")}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      atcServerFilter === "Expert"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Expert
                  </button>
                  <button
                    onClick={() => setAtcServerFilter("Training")}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      atcServerFilter === "Training"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Training
                  </button>
                </div>

                {/* Filter Input */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter airport or ATC..."
                    value={atcSearchQuery}
                    onChange={(e) => setAtcSearchQuery(e.target.value)}
                    className="w-36 sm:w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Structured Airport Cards Grid */}
            {filteredAirports.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 font-mono">
                No staffed airports found for {atcServerFilter} Server.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAirports.map((airport) => {
                  return (
                    <div
                      key={airport.icao}
                      onClick={() => setSelectedAirportIcao(airport.icao)}
                      className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-3.5 flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-xs transition cursor-pointer"
                    >
                      {/* Airport Header */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60 dark:border-slate-800">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-bold font-mono tracking-wider text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                            {airport.icao}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200/80 dark:border-slate-700/80">
                            {airport.controllers.length} {airport.controllers.length === 1 ? "freq" : "freqs"}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition">
                            →
                          </span>
                        </div>
                      </div>

                      {/* Frequency Rows */}
                      <div className="divide-y divide-slate-200/50 dark:divide-slate-800/60 mt-1">
                        {airport.controllers.map((c: AirportController, idx: number) => {
                          const badge = getFacilityBadge(c.frequencyType, c.facilityName);
                          const duration = formatDuration(c.startTime);

                          return (
                            <div
                              key={`${c.userId}-${c.frequencyType}-${idx}`}
                              className="py-1.5 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Facility Code Badge with fixed width for perfect vertical alignment */}
                                <span className="w-10 text-center font-mono font-semibold text-[10px] py-0.5 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                                  {badge}
                                </span>

                                {/* Controller Name (clickable lookup) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSearch(c.username);
                                  }}
                                  className="font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 truncate cursor-pointer text-left transition hover:underline"
                                  title={`Inspect controller ${c.username}`}
                                >
                                  {c.username}
                                </button>
                              </div>

                              {/* Duration Tag (aligned on the right, EXP removed) */}
                              {duration && (
                                <div className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500 text-right">
                                  {duration}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Info Link */}
                      <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between text-[10px] font-mono text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition">
                        <span>ATIS</span>
                        <span>Inspect airport →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Airport Details Modal (ATIS, Arrivals, Departures, Active ATC) */}
      {selectedAirportIcao && (
        <AirportDetailsModal
          icao={selectedAirportIcao}
          serverName={atcServerFilter}
          onClose={() => setSelectedAirportIcao(null)}
          onSearchPilot={onSearch}
        />
      )}
    </div>
  );
}
