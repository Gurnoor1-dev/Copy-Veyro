import { useState, useMemo } from "react";
import { FlightItem } from "../types";
import {
  Plane,
  Clock,
  Fuel,
  ArrowUpDown,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Gauge,
  Zap,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Layers,
  Info,
  FileSpreadsheet,
} from "lucide-react";
import { formatMinutes } from "./ProfileHeader";
import FlightExportModal from "./FlightExportModal";
import FlightActivityChart from "./FlightActivityChart";

interface FlightsSectionProps {
  flights: FlightItem[];
  totalFlightCount: number;
  userId?: string;
  onFlightsUpdated?: (newFlights: FlightItem[]) => void;
}

type TimeRange = "30d" | "12m" | "all";
type ServerFilter = "all" | "Expert" | "Training" | "Casual";
type FpmFilter = "all" | "recorded" | "soft" | "firm";
type SortField = "date" | "time" | "landings" | "landingFpm";
type SortOrder = "asc" | "desc";
type PageSize = 25 | 50 | 100 | "all";

// Helper to extract vertical speed in FPM magnitude
const getFlightFpm = (flight: FlightItem): number | null => {
  if (flight.landingStats && flight.landingStats.length > 0) {
    const vs = flight.landingStats[0].verticalSpeed;
    if (typeof vs === "number" && !isNaN(vs)) {
      return Math.abs(Math.round(vs * 196.85));
    }
  }
  return null;
};

export default function FlightsSection({
  flights,
  totalFlightCount,
  userId,
  onFlightsUpdated,
}: FlightsSectionProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [serverFilter, setServerFilter] = useState<ServerFilter>("all");
  const [fpmFilter, setFpmFilter] = useState<FpmFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFlight, setSelectedFlight] = useState<FlightItem | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Async load state
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showApiInfo, setShowApiInfo] = useState(false);

  const isAllLoaded = flights.length >= totalFlightCount;

  // Load all flights from the backend
  const handleLoadAll = async () => {
    if (!userId || isLoadingAll || isAllLoaded) return;
    setIsLoadingAll(true);
    setLoadError(null);

    try {
      const res = await fetch(`/api/user/flights/all/${userId}`);
      if (!res.ok) {
        throw new Error(`Failed to load all flights (${res.status})`);
      }
      const data = await res.json();
      if (data?.data && Array.isArray(data.data)) {
        if (onFlightsUpdated) {
          onFlightsUpdated(data.data);
        }
      }
    } catch (err: any) {
      setLoadError(err.message || "Could not fetch all flights. Please try again.");
    } finally {
      setIsLoadingAll(false);
    }
  };

  // Load next page (+100)
  const handleLoadNext = async () => {
    if (!userId || isLoadingNext || isAllLoaded) return;
    setIsLoadingNext(true);
    setLoadError(null);

    try {
      const nextPage = Math.floor(flights.length / 100) + 1;
      const res = await fetch(`/api/user/flights/${userId}?page=${nextPage}&pageSize=100`);
      if (!res.ok) {
        throw new Error(`Failed to fetch page ${nextPage}`);
      }
      const data = await res.json();
      if (data?.data && Array.isArray(data.data)) {
        const seen = new Set(flights.map((f) => f.id));
        const newItems = data.data.filter((f: FlightItem) => !seen.has(f.id));
        const updated = [...flights, ...newItems];
        if (onFlightsUpdated) {
          onFlightsUpdated(updated);
        }
      }
    } catch (err: any) {
      setLoadError(err.message || "Failed to load additional flights.");
    } finally {
      setIsLoadingNext(false);
    }
  };

  // Filter flights by time range, server, and search query
  const filteredFlights = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;

    return flights.filter((flight) => {
      const flightTime = new Date(flight.created).getTime();

      // Time filter
      if (timeRange === "30d" && flightTime < thirtyDaysAgo) return false;
      if (timeRange === "12m" && flightTime < twelveMonthsAgo) return false;

      // Server filter
      if (serverFilter !== "all" && flight.server !== serverFilter) return false;

      // Landing FPM filter
      if (fpmFilter !== "all") {
        const fpm = getFlightFpm(flight);
        if (fpmFilter === "recorded" && fpm === null) return false;
        if (fpmFilter === "soft" && (fpm === null || fpm > 200)) return false;
        if (fpmFilter === "firm" && (fpm === null || fpm < 400)) return false;
      }

      // Search query filter (Airport, callsign, aircraft)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const origin = (flight.originAirport || "").toLowerCase();
        const dest = (flight.destinationAirport || "").toLowerCase();
        const cs = (flight.callsign || "").toLowerCase();
        const ac = (flight.aircraftName || "").toLowerCase();
        if (!origin.includes(q) && !dest.includes(q) && !cs.includes(q) && !ac.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [flights, timeRange, serverFilter, fpmFilter, searchQuery]);

  // Sort flights
  const sortedFlights = useMemo(() => {
    return [...filteredFlights].sort((a, b) => {
      if (sortField === "landingFpm") {
        const fpmA = getFlightFpm(a);
        const fpmB = getFlightFpm(b);
        if (fpmA === null && fpmB === null) return 0;
        if (fpmA === null) return 1;
        if (fpmB === null) return -1;
        const diff = fpmA - fpmB;
        return sortOrder === "asc" ? diff : -diff;
      }

      let comparison = 0;
      if (sortField === "date") {
        comparison = new Date(a.created).getTime() - new Date(b.created).getTime();
      } else if (sortField === "time") {
        comparison = a.flightTimeMinutes - b.flightTimeMinutes;
      } else if (sortField === "landings") {
        comparison = a.landingCount - b.landingCount;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredFlights, sortField, sortOrder]);

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize === "all") return 1;
    return Math.max(1, Math.ceil(sortedFlights.length / pageSize));
  }, [sortedFlights.length, pageSize]);

  // Reset page when filters or pageSize change
  const currentSafePage = Math.min(currentPage, totalPages);

  const paginatedFlights = useMemo(() => {
    if (pageSize === "all") return sortedFlights;
    const start = (currentSafePage - 1) * pageSize;
    return sortedFlights.slice(start, start + pageSize);
  }, [sortedFlights, currentSafePage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      // For landingFpm, default to ascending (softest / butter landing first)
      setSortOrder(field === "landingFpm" ? "asc" : "desc");
    }
  };

  const activeFilterCount =
    (timeRange !== "all" ? 1 : 0) +
    (serverFilter !== "all" ? 1 : 0) +
    (fpmFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Flight Activity Line Graph Trends (hidden on mobile, visible on tablet and desktop) */}
      <div className="hidden md:block">
        <FlightActivityChart flights={filteredFlights} />
      </div>

      {/* Controls & Filter Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              id="flight-search-input"
              type="text"
              placeholder="Search airport ICAO, aircraft, callsign..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-9 pr-8 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Actions & Sorting */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              id="toggle-filters-btn"
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                filtersOpen || activeFilterCount > 0
                  ? "border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-slate-700 dark:bg-slate-300 px-1.5 py-0.2 text-[10px] text-white dark:text-slate-950 font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Quick Sort Buttons */}
            <div className="grid grid-cols-2 sm:flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 text-xs">
              <button
                id="sort-by-date"
                type="button"
                onClick={() => handleSort("date")}
                className={`flex items-center justify-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 sm:py-1 transition cursor-pointer ${
                  sortField === "date"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Date</span>
                {sortField === "date" && (
                  <span className="text-[10px]">{sortOrder === "desc" ? "↓" : "↑"}</span>
                )}
              </button>

              <button
                id="sort-by-time"
                type="button"
                onClick={() => handleSort("time")}
                className={`flex items-center justify-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 sm:py-1 transition cursor-pointer ${
                  sortField === "time"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Duration</span>
                {sortField === "time" && (
                  <span className="text-[10px]">{sortOrder === "desc" ? "↓" : "↑"}</span>
                )}
              </button>

              <button
                id="sort-by-landings"
                type="button"
                onClick={() => handleSort("landings")}
                className={`flex items-center justify-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 sm:py-1 transition cursor-pointer ${
                  sortField === "landings"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>Landings</span>
                {sortField === "landings" && (
                  <span className="text-[10px]">{sortOrder === "desc" ? "↓" : "↑"}</span>
                )}
              </button>

              <button
                id="sort-by-landing-fpm"
                type="button"
                onClick={() => handleSort("landingFpm")}
                className={`flex items-center justify-center gap-1 rounded-lg px-2 sm:px-2.5 py-1.5 sm:py-1 transition cursor-pointer whitespace-nowrap ${
                  sortField === "landingFpm"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                title="Sort by touchdown vertical speed (FPM)"
              >
                <span>Landing FPM</span>
                {sortField === "landingFpm" && (
                  <span className="text-[10px] font-mono">
                    {sortOrder === "asc" ? "↑ Soft" : "↓ Firm"}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Filter Subpanel */}
        {filtersOpen && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              {/* Time period filter */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-500 font-medium">Window:</span>
                {(["all", "30d", "12m"] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    id={`filter-range-${range}`}
                    type="button"
                    onClick={() => {
                      setTimeRange(range);
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      timeRange === range
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold shadow-2xs"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {range === "all" ? "All Time" : range === "30d" ? "Last 30 Days" : "Last 12 Months"}
                  </button>
                ))}
              </div>

              {/* Server filter */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-500 font-medium">Server:</span>
                {(["all", "Expert", "Training", "Casual"] as ServerFilter[]).map((srv) => (
                  <button
                    key={srv}
                    id={`filter-server-${srv}`}
                    type="button"
                    onClick={() => {
                      setServerFilter(srv);
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      serverFilter === srv
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold shadow-2xs"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {srv === "all" ? "All Servers" : srv}
                  </button>
                ))}
              </div>
            </div>

            {/* Landing FPM filter */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-50 dark:border-slate-800/60">
              <span className="text-slate-400 dark:text-slate-500 font-medium">Landing FPM:</span>
              {(
                [
                  { id: "all", label: "All Flights" },
                  { id: "recorded", label: "With FPM" },
                  { id: "soft", label: "Soft (< 200 fpm)" },
                  { id: "firm", label: "Firm (> 400 fpm)" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  id={`filter-fpm-${id}`}
                  type="button"
                  onClick={() => {
                    setFpmFilter(id);
                    setCurrentPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                    fpmFilter === id
                      ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold shadow-2xs"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Flight History - Minimalist Card List */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs space-y-4 transition-colors">
        {/* Header & Page Size Selection */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Flight History</h3>
              <button
                type="button"
                id="export-flights-excel-btn"
                onClick={() => setShowExportModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer shadow-2xs"
                title="Export flights"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Showing {sortedFlights.length} matching flight{sortedFlights.length === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={() => setShowApiInfo(!showApiInfo)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors cursor-pointer"
                title="View API limit details"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            {showApiInfo && (
              <div className="mt-2 rounded-xl border border-sky-100 dark:border-sky-950/40 bg-sky-50/50 dark:bg-sky-950/30 p-3 text-xs text-sky-800 dark:text-sky-300 relative">
                <p className="leading-relaxed pr-6">
                  The API loads up to 100 flights initially. If you want to load and search all historical flights, you can scroll down and click the "Load All Flights" button.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const target = document.getElementById("load-more-container");
                    if (target) {
                      target.scrollIntoView({ behavior: "smooth" });
                    } else {
                      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                    }
                  }}
                  className="mt-1.5 text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Go to load controls</span>
                  <span>→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowApiInfo(false)}
                  className="absolute top-2 right-2 text-sky-400 hover:text-sky-600 dark:hover:text-sky-200 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Page Size Options: Show 25, 50, 100, All */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 dark:text-slate-500 text-[11px]">Show:</span>
            {([25, 50, 100, "all"] as PageSize[]).map((size) => (
              <button
                key={String(size)}
                id={`page-size-${size}`}
                onClick={() => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  pageSize === size
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 shadow-2xs font-semibold"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {size === "all" ? "All" : size}
              </button>
            ))}
          </div>
        </div>


        {/* Flight Cards List */}
        {paginatedFlights.length > 0 ? (
          <div className="space-y-2.5">
            {paginatedFlights.map((flight) => {
              const dateStr = new Date(flight.created).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              const serverBadge =
                flight.server === "Expert"
                  ? "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                  : flight.server === "Training"
                  ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500";

              const hasLandingTelemetry = flight.landingStats && flight.landingStats.length > 0;
              const firstLanding = hasLandingTelemetry ? flight.landingStats[0] : null;

              return (
                <div
                  key={flight.id}
                  onClick={() => setSelectedFlight(flight)}
                  className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 transition hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-xs cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    {/* Route & Server */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        <span>{flight.originAirport || "????"}</span>
                        <span className="text-slate-300 dark:text-slate-600 font-normal">→</span>
                        <span>{flight.destinationAirport || "????"}</span>
                      </div>
                      <span className={`rounded px-1.5 py-0.2 text-[9px] sm:text-[10px] border ${serverBadge}`}>
                        {flight.server}
                      </span>
                    </div>

                    {/* Date */}
                    <span className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                      {dateStr}
                    </span>
                  </div>

                  {/* Flight Info & Metrics */}
                  <div className="mt-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 text-xs">
                    {/* Aircraft & Livery & Callsign */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs">{flight.callsign}</span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium truncate text-xs">{flight.aircraftName}</span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {flight.liveryName}
                      </div>
                    </div>

                    {/* Key Metrics: Responsive 2-col on mobile, flex on desktop */}
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-4 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] sm:text-xs">{formatMinutes(flight.flightTimeMinutes)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Plane className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] sm:text-xs">{flight.landingCount} {flight.landingCount === 1 ? "landing" : "landings"}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Fuel className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] sm:text-xs">{Math.round(flight.fuelUsedKg).toLocaleString()} kg</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] sm:text-xs">{flight.xp.toLocaleString()} XP</span>
                      </div>
                    </div>
                  </div>

                  {/* Touchdown indicator if available */}
                  {firstLanding && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-300 font-mono">
                        <span>Touchdown:</span>
                        <span className={`font-semibold ${sortField === "landingFpm" ? "text-slate-950 dark:text-white font-bold" : "text-slate-900 dark:text-white"}`}>
                          {Math.round(firstLanding.verticalSpeed * 196.85)} fpm
                        </span>
                        <span>·</span>
                        <span>{firstLanding.maxGForce.toFixed(2)} G</span>
                        {firstLanding.groundSpeed > 0 && (
                          <>
                            <span>·</span>
                            <span>{Math.round(firstLanding.groundSpeed * 1.943844)} kts GS</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-8 text-center text-xs text-slate-400 dark:text-slate-500">
            No flights found matching the selected criteria.
          </div>
        )}

        {/* Load More Banner at bottom of flight list */}
        {!isAllLoaded && (
          <div id="load-more-container" className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Initial 100 flights loaded ({totalFlightCount - flights.length} remaining)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Infinite Flight divides flight logs into batches. Load all flights to search and analyze your complete career.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="load-next-flights-btn"
                type="button"
                disabled={isLoadingNext || isLoadingAll}
                onClick={handleLoadNext}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {isLoadingNext ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span>+100 More</span>
              </button>

              <button
                id="load-all-flights-btn"
                type="button"
                disabled={isLoadingAll || isLoadingNext}
                onClick={handleLoadAll}
                className="rounded-xl bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                {isLoadingAll ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading all ({totalFlightCount})...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>Load All Flights ({totalFlightCount})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {loadError && (
          <div className="mt-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Pagination Controls */}
        {pageSize !== "all" && totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-400 dark:text-slate-500 text-[11px]">
              Page {currentSafePage} of {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentSafePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentSafePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touchdown Telemetry Inspection Modal (opened by clicking any flight card) */}
      {selectedFlight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-slate-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Flight &amp; Touchdown Telemetry
                </h3>
              </div>
              <button
                onClick={() => setSelectedFlight(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <span className="text-slate-400 dark:text-slate-500 text-[11px]">Route</span>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 font-mono">
                  {selectedFlight.originAirport} → {selectedFlight.destinationAirport}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <span className="text-slate-400 dark:text-slate-500 text-[11px]">Aircraft</span>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                  {selectedFlight.aircraftName}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">{selectedFlight.liveryName}</div>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <span className="text-slate-400 dark:text-slate-500 text-[11px]">Duration &amp; XP</span>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                  {formatMinutes(selectedFlight.flightTimeMinutes)} ({selectedFlight.xp.toLocaleString()} XP)
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <span className="text-slate-400 dark:text-slate-500 text-[11px]">Fuel Burned</span>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                  {Math.round(selectedFlight.fuelUsedKg).toLocaleString()} kg
                </div>
              </div>
            </div>

            {/* Landing Telemetry stats */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Touchdown Reports ({selectedFlight.landingStats?.length || 0})
              </h4>

              {selectedFlight.landingStats && selectedFlight.landingStats.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedFlight.landingStats.map((stat, idx) => {
                    const gForce = stat.maxGForce.toFixed(2);
                    const vsFpm = Math.round(stat.verticalSpeed * 196.85);
                    const isSmooth = stat.maxGForce < 1.7;

                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-1.5 mb-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">Touchdown #{idx + 1}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                              isSmooth
                                ? "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                : "border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            }`}
                          >
                            {isSmooth ? "Smooth Landing" : "Firm Landing"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block text-[10px]">G-Force</span>
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">{gForce} G</span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Vertical Speed</span>
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">{vsFpm} fpm</span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Ground Speed</span>
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">{Math.round(stat.groundSpeed * 1.943844)} kts</span>
                            {stat.indicatedAirspeed ? (
                              <span className="text-slate-400 dark:text-slate-500 block text-[10px]">
                                {Math.round(stat.indicatedAirspeed)} kts IAS
                              </span>
                            ) : null}
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Centerline Dev</span>
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">{stat.centerlineDistance.toFixed(1)} m</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                  No touchdown telemetry recorded for this flight.
                </div>
              )}
            </div>

            <div className="mt-5 text-right">
              <button
                onClick={() => setSelectedFlight(null)}
                className="rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flight Export Modal */}
      <FlightExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        flights={flights}
        totalCount={totalFlightCount}
        userId={userId}
        onFlightsUpdated={onFlightsUpdated}
      />
    </div>
  );
}
