import { useState, useMemo, useEffect } from "react";
import { AtcSessionItem, getIfatcRankName } from "../types";
import {
  Radio,
  Clock,
  Award,
  Navigation,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Layers,
  Info,
  Camera,
  Search,
  X,
  Download,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  SlidersHorizontal,
  FileSpreadsheet,
} from "lucide-react";
import { formatMinutes } from "./ProfileHeader";
import AtcSessionCardModal from "./AtcSessionCardModal";
import AtcExportModal from "./AtcExportModal";

export type AtcSortOption =
  | "date-desc"
  | "date-asc"
  | "violations-desc"
  | "violations-asc"
  | "ops-desc"
  | "ops-asc"
  | "duration-desc"
  | "duration-asc";

interface AtcSectionProps {
  sessions: AtcSessionItem[];
  totalAtcOperations: number;
  atcRank: number;
  controllerName?: string;
  totalAtcCount?: number;
  userId?: string;
  onSessionsUpdated?: (newSessions: AtcSessionItem[]) => void;
}

export interface ConsolidatedAtcGroup {
  groupId: string;
  airportIcao: string;
  server: string;
  created: string;
  durationMinutes: number;
  totalOperations: number;
  totalViolations: number;
  isLocal: boolean;
  isRadar: boolean;
  facilitySummary: string;
  subSessions: AtcSessionItem[];
}

export function isRadarFacility(facilityName: string, frequencyType?: number): boolean {
  if (frequencyType !== undefined && [4, 5, 6].includes(frequencyType)) return true;
  return /approach|departure|center|radar/i.test(facilityName);
}

export function isLocalFacility(facilityName: string, isLocal?: boolean, frequencyType?: number): boolean {
  if (isLocal) return true;
  if (frequencyType !== undefined && [0, 1, 3, 7].includes(frequencyType)) return true;
  return /local|tower|ground|atis|clearance/i.test(facilityName);
}

export function isAtisFacility(facilityName: string, frequencyType?: number): boolean {
  if (frequencyType === 7 || frequencyType === 3) return true;
  return /atis/i.test(facilityName);
}

export function isSoloGroundOrTower(facilityName: string, isCombinedLocal?: boolean, frequencyType?: number): boolean {
  if (isCombinedLocal) return false;
  if (frequencyType === 0 || frequencyType === 1) return true;
  const lower = facilityName.toLowerCase();
  if ((lower.includes("ground") || lower.includes("tower")) && !lower.includes("local (") && !lower.includes(",")) {
    return true;
  }
  return false;
}

export function getFacilityBadgeClass(facilityName: string, isLocal?: boolean, frequencyType?: number, isCombinedLocal?: boolean): string {
  if (isRadarFacility(facilityName, frequencyType)) {
    return "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800";
  }
  if (isSoloGroundOrTower(facilityName, isCombinedLocal, frequencyType)) {
    return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
  }
  if (isLocalFacility(facilityName, isLocal, frequencyType)) {
    return "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800";
  }
  if (isAtisFacility(facilityName, frequencyType)) {
    return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700";
  }
  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700";
}

export type AtcPageSize = 25 | 50 | 100 | "all";

export default function AtcSection({
  sessions,
  totalAtcOperations,
  atcRank,
  controllerName,
  totalAtcCount,
  userId,
  onSessionsUpdated,
}: AtcSectionProps) {
  const [selectedFacility, setSelectedFacility] = useState<string>("all");
  const [searchAirportIcao, setSearchAirportIcao] = useState<string>("");
  const [sortOption, setSortOption] = useState<AtcSortOption>("date-desc");
  const [groupByLocal, setGroupByLocal] = useState<boolean>(true);
  const [pageSize, setPageSize] = useState<AtcPageSize>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedFlatSessions, setExpandedFlatSessions] = useState<Record<string, boolean>>({});
  const [selectedSessionForCard, setSelectedSessionForCard] = useState<
    ConsolidatedAtcGroup | AtcSessionItem | null
  >(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const effectiveSessions = sessions;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchAirportIcao, selectedFacility, sortOption, groupByLocal, pageSize]);

  // Async load state for ATC
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedCountInfo, setLoadedCountInfo] = useState<string | null>(null);
  const [isMaxApiLoaded, setIsMaxApiLoaded] = useState(false);

  const effectiveTotalCount = totalAtcCount || sessions.length;
  // Truly loaded if count matches or all accessible records from API have been retrieved
  const isAllLoaded = sessions.length >= effectiveTotalCount || isMaxApiLoaded;

  const scrollToBottom = () => {
    const el = document.getElementById("atc-bottom-section") || document.getElementById("load-all-atc-btn");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  };

  const handleLoadAll = async () => {
    if (!userId || isLoadingAll) return;
    setIsLoadingAll(true);
    setLoadError(null);
    setLoadedCountInfo(null);

    const initialLength = sessions.length;

    try {
      // 1. Fetch from server endpoint with fresh data
      let currentList = [...sessions];
      try {
        const res = await fetch(`/api/user/atc/all/${userId}?refresh=true`);
        if (res.ok) {
          const data = await res.json();
          if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
            const seen = new Set(currentList.map((s) => s.id));
            let newItemsAdded = 0;
            for (const item of data.data) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                currentList.push(item);
                newItemsAdded++;
              }
            }
            if (newItemsAdded > 0 && onSessionsUpdated) {
              onSessionsUpdated([...currentList]);
            }
          }
        }
      } catch (_backendErr) {
        // Fall through to progressive page fetch below
      }

      // 2. If still missing sessions, scan remaining pages directly in batches
      if (currentList.length < effectiveTotalCount) {
        const totalPages = Math.min(Math.ceil(effectiveTotalCount / 25), 100);
        let p = Math.floor(currentList.length / 25) + 1;
        let consecutiveEmpty = 0;

        while (p <= totalPages && currentList.length < effectiveTotalCount && consecutiveEmpty < 8) {
          try {
            const pageRes = await fetch(`/api/user/atc/${userId}?page=${p}&pageSize=25`);
            if (!pageRes.ok) {
              consecutiveEmpty++;
              p++;
              continue;
            }
            const pageData = await pageRes.json();
            const items = pageData?.data;
            if (Array.isArray(items) && items.length > 0) {
              const seen = new Set(currentList.map((s) => s.id));
              let added = 0;
              for (const it of items) {
                if (!seen.has(it.id)) {
                  seen.add(it.id);
                  currentList.push(it);
                  added++;
                }
              }
              if (added > 0) {
                consecutiveEmpty = 0;
                if (onSessionsUpdated) {
                  onSessionsUpdated([...currentList]);
                }
              } else {
                consecutiveEmpty++;
              }
            } else {
              consecutiveEmpty++;
            }
          } catch {
            consecutiveEmpty++;
          }
          p++;
        }
      }

      if (currentList.length < effectiveTotalCount) {
        setIsMaxApiLoaded(true);
        if (currentList.length > initialLength) {
          setLoadedCountInfo(`Loaded ${currentList.length} shifts (all records currently accessible from Infinite Flight).`);
        } else {
          setLoadedCountInfo(`All ${currentList.length} shifts accessible from Infinite Flight have been loaded.`);
        }
      } else {
        setIsMaxApiLoaded(true);
        setLoadedCountInfo(`All ${currentList.length} shifts loaded.`);
      }
    } catch (err: any) {
      setLoadError(err.message || "Could not fetch all ATC sessions.");
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleLoadNext = async () => {
    if (!userId || isLoadingNext || isAllLoaded) return;
    setIsLoadingNext(true);
    setLoadError(null);

    try {
      const nextPage = Math.floor(sessions.length / 25) + 1;
      const res = await fetch(`/api/user/atc/${userId}?page=${nextPage}&pageSize=25`);
      if (!res.ok) {
        setIsMaxApiLoaded(true);
        setLoadedCountInfo(`All ${sessions.length} shifts accessible from Infinite Flight have been loaded.`);
        return;
      }
      const data = await res.json();
      if (data?.data && Array.isArray(data.data)) {
        const seen = new Set(sessions.map((s) => s.id));
        const newItems = data.data.filter((s: AtcSessionItem) => !seen.has(s.id));
        if (newItems.length > 0) {
          const updated = [...sessions, ...newItems];
          if (onSessionsUpdated) {
            onSessionsUpdated(updated);
          }
        } else {
          setIsMaxApiLoaded(true);
          setLoadedCountInfo(`All ${sessions.length} shifts accessible from Infinite Flight have been loaded.`);
        }
      } else {
        setIsMaxApiLoaded(true);
        setLoadedCountInfo(`All ${sessions.length} shifts accessible from Infinite Flight have been loaded.`);
      }
    } catch (err: any) {
      setIsMaxApiLoaded(true);
      setLoadedCountInfo(`All ${sessions.length} shifts accessible from Infinite Flight have been loaded.`);
    } finally {
      setIsLoadingNext(false);
    }
  };

  // Default to collapsed; expanding one also expands the other as requested
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState<boolean>(false);

  const toggleGroupExpand = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFlatExpand = (id: string) => {
    setExpandedFlatSessions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Group sessions by atcSessionGroupId or by airport + time proximity
  const groupedSessions = useMemo<ConsolidatedAtcGroup[]>(() => {
    const groupMap: Record<string, AtcSessionItem[]> = {};

    effectiveSessions.forEach((s) => {
      let key = s.atcSessionGroupId;
      if (!key) {
        // Fallback: group by airport + server + approx 10-min window
        const d = new Date(s.created).getTime();
        const bucket = Math.floor(d / (10 * 60 * 1000));
        key = `${s.airportIcao}_${s.server}_${bucket}`;
      }
      if (!groupMap[key]) {
        groupMap[key] = [];
      }
      groupMap[key].push(s);
    });

    return Object.entries(groupMap).map(([groupId, items]) => {
      const airportIcao = items[0].airportIcao;
      const server = items[0].server;
      const created = items[0].created;

      // Operations sum
      const totalOperations = items.reduce((acc, it) => acc + it.operations, 0);
      // Violations / Reports: Infinite Flight attaches the session shift's total violations to each
      // concurrent frequency entry (e.g. Ground and Tower both get 1). We take the max across
      // concurrent frequencies to prevent duplicate counting.
      const totalViolations = Math.max(0, ...items.map((it) => it.violationsIssued || 0));

      // Duration: sessions in a group ran concurrently, so take max duration
      const durationMinutes = Math.max(...items.map((it) => it.durationMinutes));

      // Check frequency types
      const fTypes = new Set(items.map((it) => it.frequencyType));
      const hasTower = fTypes.has(1);
      const hasGround = fTypes.has(0);
      const hasAtis = fTypes.has(7);

      let isLocal = false;
      let facilitySummary = items[0].facilityTypeName;

      if ((hasTower && hasGround) || (hasTower && hasAtis) || (hasGround && hasAtis)) {
        isLocal = true;
        const parts: string[] = [];
        if (hasTower) parts.push("Tower");
        if (hasGround) parts.push("Ground");
        if (hasAtis) parts.push("ATIS");
        facilitySummary = parts.join(", ");
      } else if (items.length > 1) {
        facilitySummary = items.map((it) => it.facilityTypeName).join(" + ");
      }

      const isRadar = !isLocal && (
        items.some((it) => [4, 5, 6].includes(it.frequencyType)) ||
        /approach|departure|center|radar/i.test(facilitySummary)
      );

      return {
        groupId,
        airportIcao,
        server,
        created,
        durationMinutes,
        totalOperations,
        totalViolations,
        isLocal,
        isRadar,
        facilitySummary,
        subSessions: items,
      };
    }).sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }, [effectiveSessions]);

  // Overall unique controlling time (using grouped durations to avoid double-counting local shifts)
  const totalControllingMins = useMemo(() => {
    return groupedSessions.reduce((acc, g) => acc + g.durationMinutes, 0);
  }, [groupedSessions]);

  const totalViolationsIssued = useMemo(() => {
    return groupedSessions.reduce((acc, g) => acc + g.totalViolations, 0);
  }, [groupedSessions]);

  // Operations from the loaded sessions (last 100 sessions, or all if loaded)
  const sessionOperations = useMemo(() => {
    return effectiveSessions.reduce((acc, s) => acc + (s.operations || 0), 0);
  }, [effectiveSessions]);

  // Operations to violations ratio calculated over the same session scope
  const opsToViolationsRatio = useMemo(() => {
    if (sessionOperations <= 0) return null;
    if (totalViolationsIssued === 0) return "clean" as const;
    return sessionOperations / totalViolationsIssued;
  }, [sessionOperations, totalViolationsIssued]);

  // Facility breakdown counts
  const facilityBreakdown = useMemo(() => {
    const map: Record<string, { count: number; operations: number; duration: number }> = {};

    effectiveSessions.forEach((s) => {
      const type = s.facilityTypeName;
      if (!map[type]) {
        map[type] = { count: 0, operations: 0, duration: 0 };
      }
      map[type].count += 1;
      map[type].operations += s.operations;
      map[type].duration += s.durationMinutes;
    });

    return Object.entries(map).sort((a, b) => b[1].operations - a[1].operations);
  }, [effectiveSessions]);

  // Top controlled airports
  const topAirports = useMemo(() => {
    const map: Record<string, { count: number; operations: number; duration: number }> = {};

    groupedSessions.forEach((s) => {
      const icao = s.airportIcao && s.airportIcao !== "Unknown" ? s.airportIcao : "N/A";
      if (!map[icao]) {
        map[icao] = { count: 0, operations: 0, duration: 0 };
      }
      map[icao].count += 1;
      map[icao].operations += s.totalOperations;
      map[icao].duration += s.durationMinutes;
    });

    return Object.entries(map)
      .sort((a, b) => b[1].operations - a[1].operations)
      .slice(0, 6);
  }, [groupedSessions]);

  const handleSortToggle = (field: "date" | "duration" | "ops" | "violations") => {
    setSortOption((prev) => {
      if (field === "date") {
        return prev === "date-desc" ? "date-asc" : "date-desc";
      }
      if (field === "violations") {
        return prev === "violations-desc" ? "violations-asc" : "violations-desc";
      }
      if (field === "ops") {
        return prev === "ops-desc" ? "ops-asc" : "ops-desc";
      }
      if (field === "duration") {
        return prev === "duration-desc" ? "duration-asc" : "duration-desc";
      }
      return "date-desc";
    });
  };

  const renderSortHeader = (label: string, field: "date" | "duration" | "ops" | "violations", className: string = "") => {
    const isCurrentField =
      field === "ops"
        ? sortOption.startsWith("ops")
        : field === "duration"
        ? sortOption.startsWith("duration")
        : sortOption.startsWith(field);
    const isDesc = sortOption.endsWith("-desc");

    return (
      <button
        type="button"
        onClick={() => handleSortToggle(field)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer group text-left select-none ${
          isCurrentField ? "text-sky-600 dark:text-sky-400 font-semibold" : ""
        } ${className}`}
        title={`Sort by ${label} (${isCurrentField && isDesc ? "low to high" : "high to low"})`}
      >
        <span>{label}</span>
        {isCurrentField ? (
          isDesc ? (
            <ArrowDown className="h-3 w-3 text-sky-500 shrink-0" />
          ) : (
            <ArrowUp className="h-3 w-3 text-sky-500 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 shrink-0 opacity-60" />
        )}
      </button>
    );
  };

  // Filtered grouped sessions (by facility, violations, and ICAO search, sorted by sortOption)
  const filteredGrouped = useMemo(() => {
    let result = groupedSessions;

    if (selectedFacility === "local") {
      result = result.filter((g) => g.isLocal);
    } else if (selectedFacility !== "all") {
      result = result.filter((g) =>
        g.subSessions.some((s) => s.facilityTypeName === selectedFacility)
      );
    }

    if (searchAirportIcao.trim()) {
      const q = searchAirportIcao.trim().toLowerCase();
      result = result.filter((g) => g.airportIcao.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      switch (sortOption) {
        case "violations-desc": {
          const diff = b.totalViolations - a.totalViolations;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "violations-asc": {
          const diff = a.totalViolations - b.totalViolations;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "ops-desc": {
          const diff = b.totalOperations - a.totalOperations;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "ops-asc": {
          const diff = a.totalOperations - b.totalOperations;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "duration-desc": {
          const diff = b.durationMinutes - a.durationMinutes;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "duration-asc": {
          const diff = a.durationMinutes - b.durationMinutes;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "date-asc": {
          return new Date(a.created).getTime() - new Date(b.created).getTime();
        }
        case "date-desc":
        default: {
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
      }
    });
  }, [groupedSessions, selectedFacility, searchAirportIcao, sortOption]);

  // Filtered flat sessions
  const filteredFlatSessions = useMemo(() => {
    let result = effectiveSessions;

    if (selectedFacility === "local") {
      result = result.filter((s) => isLocalFacility(s.facilityTypeName, false, s.frequencyType));
    } else if (selectedFacility !== "all") {
      result = result.filter((s) => s.facilityTypeName === selectedFacility);
    }

    if (searchAirportIcao.trim()) {
      const q = searchAirportIcao.trim().toLowerCase();
      result = result.filter((s) => s.airportIcao.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      const aVio = a.violationsIssued || 0;
      const bVio = b.violationsIssued || 0;
      const aOps = a.operations || 0;
      const bOps = b.operations || 0;

      switch (sortOption) {
        case "violations-desc": {
          const diff = bVio - aVio;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "violations-asc": {
          const diff = aVio - bVio;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "ops-desc": {
          const diff = bOps - aOps;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "ops-asc": {
          const diff = aOps - bOps;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "duration-desc": {
          const diff = b.durationMinutes - a.durationMinutes;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "duration-asc": {
          const diff = a.durationMinutes - b.durationMinutes;
          if (diff !== 0) return diff;
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
        case "date-asc": {
          return new Date(a.created).getTime() - new Date(b.created).getTime();
        }
        case "date-desc":
        default: {
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
      }
    });
  }, [effectiveSessions, selectedFacility, searchAirportIcao, sortOption]);

  // Active filtered list count based on groupByLocal
  const activeTotalItems = groupByLocal ? filteredGrouped.length : filteredFlatSessions.length;

  const totalPages = useMemo(() => {
    if (pageSize === "all") return 1;
    return Math.max(1, Math.ceil(activeTotalItems / pageSize));
  }, [activeTotalItems, pageSize]);

  const safeCurrentPage = Math.min(currentPage, totalPages);

  // Paginated slices for performance and clean viewing
  const paginatedGrouped = useMemo(() => {
    if (pageSize === "all") return filteredGrouped;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredGrouped.slice(start, start + pageSize);
  }, [filteredGrouped, safeCurrentPage, pageSize]);

  const paginatedFlatSessions = useMemo(() => {
    if (pageSize === "all") return filteredFlatSessions;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredFlatSessions.slice(start, start + pageSize);
  }, [filteredFlatSessions, safeCurrentPage, pageSize]);

  const pageStartIndex =
    activeTotalItems === 0 ? 0 : (safeCurrentPage - 1) * (pageSize === "all" ? activeTotalItems : pageSize) + 1;
  const pageEndIndex = pageSize === "all" ? activeTotalItems : Math.min(safeCurrentPage * pageSize, activeTotalItems);

  return (
    <div className="space-y-6">
      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs transition-colors">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Award className="h-3.5 w-3.5 text-slate-400" />
            <span>Total Operations</span>
          </div>
          <div className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
            {totalAtcOperations.toLocaleString()}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {groupedSessions.length} sessions ({sessions.length} frequencies)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>Controlling Time</span>
            </div>
            <div className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
              {formatMinutes(totalControllingMins)}
            </div>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            {isAllLoaded ? (
              <span>Calculated from all {sessions.length} sessions</span>
            ) : (
              <span>
                From the past 100 sessions. To see for all sessions,{" "}
                <button
                  type="button"
                  id="redirect-controlling-time-bottom-btn"
                  onClick={scrollToBottom}
                  className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer inline-flex items-center gap-0.5"
                >
                  <span>go to bottom</span>
                  <ArrowDown className="h-3 w-3 inline shrink-0" />
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs transition-colors">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Radio className="h-3.5 w-3.5 text-slate-400" />
            <span>IFATC Rank</span>
          </div>
          <div className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
            {getIfatcRankName(atcRank)} {atcRank > 0 ? `(Rank ${atcRank})` : ""}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            Infinite Flight Controller
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
              <span>Violations Issued</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {totalViolationsIssued}
              </span>
              {opsToViolationsRatio === "clean" ? (
                <span
                  className="text-xs font-normal text-slate-400 dark:text-slate-500"
                  title={`Clean: 0 violations across ${sessionOperations.toLocaleString()} ops`}
                >
                  (0 in {sessionOperations.toLocaleString()} ops)
                </span>
              ) : opsToViolationsRatio !== null ? (
                <span
                  className="text-xs font-normal text-slate-400 dark:text-slate-500"
                  title={`Ratio: 1 violation per ${opsToViolationsRatio >= 10 ? Math.round(opsToViolationsRatio).toLocaleString() : opsToViolationsRatio.toFixed(1)} operations`}
                >
                  (1 : {opsToViolationsRatio >= 10 ? Math.round(opsToViolationsRatio).toLocaleString() : opsToViolationsRatio.toFixed(1)} ops)
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            {isAllLoaded ? (
              <span>Calculated from all {sessions.length} sessions</span>
            ) : (
              <span>
                From the past 100 sessions. To see for all sessions,{" "}
                <button
                  type="button"
                  id="redirect-violations-issued-bottom-btn"
                  onClick={scrollToBottom}
                  className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer inline-flex items-center gap-0.5"
                >
                  <span>go to bottom</span>
                  <ArrowDown className="h-3 w-3 inline shrink-0" />
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Facilities Breakdown & Top Airports (Starts Collapsed, Numbers Removed) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Facility Distribution */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <button
            type="button"
            id="toggle-frequencies-breakdown-btn"
            onClick={() => setIsBreakdownExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between text-left group transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Frequencies Controlled
              </h4>
            </div>
            <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200">
              <span className="text-[11px] font-medium">{isBreakdownExpanded ? "Collapse" : "Expand"}</span>
              {isBreakdownExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </button>

          {isBreakdownExpanded && (
            <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800 pt-3 animate-fadeIn overflow-x-auto">
              {facilityBreakdown.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="pb-2 font-semibold">Facility</th>
                      <th className="pb-2 font-semibold text-center">Sessions</th>
                      <th className="pb-2 font-semibold text-right">Duration</th>
                      <th className="pb-2 font-semibold text-right">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40 text-xs">
                    {facilityBreakdown.map(([facilityName, stats]) => {
                      const isRadar = isRadarFacility(facilityName);
                      const isSolo = isSoloGroundOrTower(facilityName);
                      const isLocal = isLocalFacility(facilityName);
                      const isAtis = isAtisFacility(facilityName);
                      return (
                        <tr
                          key={facilityName}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                        >
                          <td className="py-2.5 pr-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isRadar
                                    ? "bg-purple-500 ring-2 ring-purple-200 dark:ring-purple-900"
                                    : isSolo
                                    ? "bg-blue-500 ring-2 ring-blue-200 dark:ring-blue-900"
                                    : isLocal
                                    ? "bg-orange-500 ring-2 ring-orange-200 dark:ring-orange-900"
                                    : "bg-slate-400"
                                }`}
                              />
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                                <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-none">
                                  {facilityName}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[9px] font-medium inline-block shrink-0 ${
                                    isRadar
                                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300"
                                      : isSolo
                                      ? "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300"
                                      : isLocal
                                      ? "bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                  }`}
                                >
                                  {isRadar ? "Radar" : isSolo ? (facilityName.toLowerCase().includes("ground") ? "Ground" : "Tower") : isAtis ? "ATIS" : isLocal ? "Tower / Ground" : "Other"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center text-slate-600 dark:text-slate-400 font-mono">
                            {stats.count}
                          </td>
                          <td className="py-2.5 text-right text-slate-500 dark:text-slate-400 font-mono">
                            {formatMinutes(stats.duration)}
                          </td>
                          <td className="py-2.5 text-right font-semibold text-slate-950 dark:text-white font-mono">
                            {isAtis ? (
                              <span className="text-slate-400 dark:text-slate-500 font-normal font-sans text-[10px]">Broadcast</span>
                            ) : (
                              stats.operations.toLocaleString()
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  No frequency data available
                </div>
              )}
            </div>
          )}
        </div>

        {/* Most Controlled Airports (Starts Collapsed, Numbers Removed) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <button
            type="button"
            id="toggle-top-airports-btn"
            onClick={() => setIsBreakdownExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between text-left group transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Top Airports Controlled
              </h4>
            </div>
            <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200">
              <span className="text-[11px] font-medium">{isBreakdownExpanded ? "Collapse" : "Expand"}</span>
              {isBreakdownExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </button>

          {isBreakdownExpanded && (
            <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800 pt-3 animate-fadeIn overflow-x-auto">
              {topAirports.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                      <th className="pb-2 font-semibold">Airport</th>
                      <th className="pb-2 font-semibold text-center">Sessions</th>
                      <th className="pb-2 font-semibold text-right">Duration</th>
                      <th className="pb-2 font-semibold text-right">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40 text-xs">
                    {topAirports.map(([icao, stats]) => (
                      <tr
                        key={icao}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="py-2.5">
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-bold text-slate-800 dark:text-slate-200 font-mono text-[11px] border border-slate-200 dark:border-slate-700">
                            {icao}
                          </span>
                        </td>
                        <td className="py-2.5 text-center text-slate-600 dark:text-slate-400 font-mono">
                          {stats.count}
                        </td>
                        <td className="py-2.5 text-right text-slate-500 dark:text-slate-400 font-mono">
                          {formatMinutes(stats.duration)}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-950 dark:text-white font-mono">
                          {stats.operations.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  No airport history recorded
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ATC Sessions Table with Local Control Grouping and Search */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id="atc-sessions-heading" className="text-base font-bold text-slate-900 dark:text-white">ATC Sessions Log</h3>
              <button
                type="button"
                id="export-atc-excel-btn"
                onClick={() => setShowExportModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer shadow-2xs"
                title="Export sessions to Excel (.xlsx)"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export to Excel</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Click any session to open and download the official VEYRO Session Card.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-2 text-xs w-full lg:w-auto">
            {/* Search Airport ICAO */}
            <div className="relative w-full sm:w-36">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                id="search-atc-airport-input"
                type="text"
                placeholder="Airport ICAO"
                value={searchAirportIcao}
                onChange={(e) => setSearchAirportIcao(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-7 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none"
              />
              {searchAirportIcao && (
                <button
                  type="button"
                  onClick={() => setSearchAirportIcao("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Toggle Local Grouping (Desktop only) */}
            <button
              type="button"
              id="toggle-atc-view-mode-btn"
              onClick={() => setGroupByLocal(!groupByLocal)}
              className="hidden sm:inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer text-center whitespace-nowrap"
            >
              {groupByLocal ? "View Flat List" : "Group Sessions"}
            </button>

            {/* Facility Filter */}
            <select
              id="atc-facility-select"
              value={selectedFacility}
              onChange={(e) => setSelectedFacility(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Facilities</option>
              <option value="local">Tower, Ground, ATIS</option>
              {facilityBreakdown.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {/* Sort Dropdown (Desktop only) */}
            <div className="hidden sm:flex items-center gap-1.5">
              <select
                id="atc-sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as AtcSortOption)}
                aria-label="Sort ATC Sessions"
                className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none cursor-pointer font-medium"
              >
                <option value="date-desc">Date: Newest First</option>
                <option value="date-asc">Date: Oldest First</option>
                <option value="violations-desc">Violations: Most to Least</option>
                <option value="violations-asc">Violations: Least to Most</option>
                <option value="ops-desc">Ops: Most to Least</option>
                <option value="ops-asc">Ops: Least to Most</option>
                <option value="duration-desc">Time: Most to Least</option>
                <option value="duration-asc">Time: Least to Most</option>
              </select>
            </div>

            {(selectedFacility !== "all" || searchAirportIcao || sortOption !== "date-desc") && (
              <button
                type="button"
                id="reset-atc-filters-btn"
                onClick={() => {
                  setSelectedFacility("all");
                  setSearchAirportIcao("");
                  setSortOption("date-desc");
                }}
                title="Reset filters & sorting"
                className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 px-2 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Grouped View */}
        {groupByLocal ? (
          <div>
            {/* Mobile Card Layout (sm:hidden) */}
            <div className="sm:hidden space-y-2.5 mt-3">
              {filteredGrouped.length > 0 ? (
                paginatedGrouped.map((group) => {
                  const dateStr = new Date(group.created).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const isExpanded = !!expandedGroups[group.groupId];
                  const isGroupAtisOnly = /atis/i.test(group.facilitySummary) && group.subSessions.length <= 1;

                  return (
                    <div
                      key={group.groupId}
                      className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs transition-colors"
                    >
                      {/* Main Mobile Card Row */}
                      <div
                        onClick={() => toggleGroupExpand(group.groupId)}
                        className="p-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-2.5"
                      >
                        {/* Airport + Role Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-bold text-slate-800 dark:text-slate-200 text-xs font-mono border border-slate-200/60 dark:border-slate-700">
                              {group.airportIcao}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${getFacilityBadgeClass(
                                group.facilitySummary,
                                group.isLocal,
                                undefined,
                                group.isLocal && group.subSessions.length > 1
                              )}`}
                            >
                              {group.facilitySummary}
                            </span>
                            {group.subSessions.length > 1 && (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                ({group.subSessions.length} freqs)
                              </span>
                            )}
                          </div>
                          <span className="p-1 rounded-md text-slate-400 shrink-0">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        </div>

                        {/* Date / Server & Metrics */}
                        <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{dateStr}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">{group.server}</div>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Time</div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">{formatMinutes(group.durationMinutes)}</div>
                            </div>
                            <div className="border-l border-slate-200 dark:border-slate-800 pl-3">
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Ops</div>
                              {isGroupAtisOnly ? (
                                <div className="font-mono text-slate-400 dark:text-slate-500">—</div>
                              ) : (
                                <div className="font-bold text-slate-900 dark:text-white">{group.totalOperations}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Mobile Expanded Detail */}
                      {isExpanded && (
                        <div className="bg-slate-50/90 dark:bg-slate-800/60 px-3.5 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 animate-fadeIn text-xs">
                          {group.subSessions.length > 1 ? (
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Layers className="h-3 w-3 text-slate-500" />
                                <span>Frequencies Handled</span>
                              </div>
                              <div className="space-y-1">
                                {group.subSessions.map((sub, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-900 p-2 text-xs border border-slate-200/70 dark:border-slate-700/80 shadow-2xs"
                                  >
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${getFacilityBadgeClass(
                                        sub.facilityTypeName,
                                        false,
                                        sub.frequencyType,
                                        false
                                      )}`}
                                    >
                                      {sub.facilityTypeName}
                                    </span>
                                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                      <span>{formatMinutes(sub.durationMinutes)}</span>
                                      {isAtisFacility(sub.facilityTypeName, sub.frequencyType) ? (
                                        <span className="text-slate-400 font-mono text-[11px]">Broadcast</span>
                                      ) : (
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                          {sub.operations} ops
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300">
                                <div>
                                  <span className="text-slate-400">Shift Reports: </span>
                                  <span
                                    className={`font-semibold ${
                                      group.totalViolations > 0
                                        ? "text-rose-600 dark:text-rose-400"
                                        : "text-slate-800 dark:text-slate-100"
                                    }`}
                                  >
                                    {group.totalViolations === 0
                                      ? "0 (Clean Shift)"
                                      : `${group.totalViolations} report${group.totalViolations === 1 ? "" : "s"}`}
                                  </span>
                                </div>
                                <span className="text-slate-300 dark:text-slate-600">•</span>
                                <div>
                                  <span className="text-slate-400">Pace: </span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    {group.durationMinutes > 0
                                      ? Math.round((group.totalOperations / group.durationMinutes) * 60)
                                      : group.totalOperations}{" "}
                                    ops/hr
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                              <div>
                                <span className="text-slate-400">Reports Issued: </span>
                                <span
                                  className={`font-semibold ${
                                    group.totalViolations > 0
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-slate-800 dark:text-slate-100"
                                  }`}
                                >
                                  {group.totalViolations === 0
                                    ? "0 (Clean Session)"
                                    : `${group.totalViolations} report${group.totalViolations === 1 ? "" : "s"}`}
                                </span>
                              </div>
                              <span className="text-slate-300 dark:text-slate-600">•</span>
                              <div>
                                <span className="text-slate-400">Pace: </span>
                                {isAtisFacility(group.facilitySummary) ? (
                                  <span className="text-slate-500 font-medium">Broadcast</span>
                                ) : (
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    {group.durationMinutes > 0
                                      ? Math.round((group.totalOperations / group.durationMinutes) * 60)
                                      : group.totalOperations}{" "}
                                    ops/hr
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Action Button */}
                          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">VEYRO Session Card:</span>
                            <button
                              type="button"
                              id={`open-session-card-mobile-${group.groupId}`}
                              onClick={() => setSelectedSessionForCard(group)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-2xs hover:bg-slate-800 dark:hover:bg-white transition cursor-pointer"
                            >
                              <Camera className="h-3.5 w-3.5 text-sky-400 dark:text-sky-600" />
                              <span>Card</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  {searchAirportIcao
                    ? `No ATC sessions found matching airport "${searchAirportIcao}".`
                    : "No ATC sessions match the selected filter."}
                </div>
              )}
            </div>

            {/* Desktop Table View (hidden sm:block) */}
            <div className="hidden sm:block mt-3 overflow-x-auto">
              <div className="min-w-[650px]">
                {/* Aligned Header */}
                <div className="grid grid-cols-[105px_70px_1fr_85px_90px_75px_75px_32px] items-center gap-2 px-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-medium text-xs">
                  <div>{renderSortHeader("Date", "date")}</div>
                  <div>Airport</div>
                  <div>Session Role</div>
                  <div>Server</div>
                  <div>{renderSortHeader("Duration", "duration")}</div>
                  <div>{renderSortHeader("Ops", "ops")}</div>
                  <div>{renderSortHeader("Violations", "violations")}</div>
                  <div></div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-1">
                  {filteredGrouped.length > 0 ? (
                    paginatedGrouped.map((group) => {
                      const dateStr = new Date(group.created).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      const isExpanded = !!expandedGroups[group.groupId];
                      const isGroupAtisOnly = /atis/i.test(group.facilitySummary) && group.subSessions.length <= 1;

                      return (
                        <div key={group.groupId} className="group transition-colors">
                          <div
                            onClick={() => toggleGroupExpand(group.groupId)}
                            className={`grid grid-cols-[105px_70px_1fr_85px_90px_75px_75px_32px] w-full items-center gap-2 py-2.5 px-3 transition-colors cursor-pointer rounded-lg ${
                              isExpanded
                                ? "bg-slate-50 dark:bg-slate-800/80 font-medium"
                                : "hover:bg-slate-50/90 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            {/* Date */}
                            <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">{dateStr}</span>

                            {/* Airport */}
                            <div>
                              <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-bold text-slate-800 dark:text-slate-200 text-[11px] font-mono border border-slate-200/60 dark:border-slate-700">
                                {group.airportIcao}
                              </span>
                            </div>

                            {/* Session Role Badge */}
                            <div className="flex items-center gap-1.5 pr-2 overflow-hidden">
                              <span
                                className={`rounded px-2 py-0.5 text-[11px] font-medium truncate ${getFacilityBadgeClass(
                                  group.facilitySummary,
                                  group.isLocal,
                                  undefined,
                                  group.isLocal && group.subSessions.length > 1
                                )}`}
                              >
                                {group.facilitySummary}
                              </span>
                              {group.subSessions.length > 1 && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                  ({group.subSessions.length})
                                </span>
                              )}
                            </div>

                            {/* Server */}
                            <span className="text-slate-400 dark:text-slate-400 truncate text-xs">{group.server}</span>

                            {/* Duration */}
                            <span className="text-slate-700 dark:text-slate-200 font-medium text-xs whitespace-nowrap">
                              {formatMinutes(group.durationMinutes)}
                            </span>

                            {/* Ops */}
                            <div>
                              {isGroupAtisOnly ? (
                                <span className="text-slate-400 dark:text-slate-500 font-mono text-xs" title="ATIS broadcast frequency">
                                  —
                                </span>
                              ) : (
                                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                  {group.totalOperations} ops
                                </span>
                              )}
                            </div>

                            {/* Violations */}
                            <span className="text-slate-500 dark:text-slate-400 text-xs">
                              {group.totalViolations}
                            </span>

                            {/* Expand Chevron */}
                            <div className="text-right flex items-center justify-end text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">
                              <span className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Expanded details with YEVRO Session Card action */}
                          {isExpanded && (
                            <div className="bg-slate-50/90 dark:bg-slate-800/60 px-4 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 rounded-b-lg animate-fadeIn text-xs">
                              {group.subSessions.length > 1 ? (
                                <div className="space-y-2">
                                  <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers className="h-3 w-3 text-slate-500" />
                                    <span>Frequencies Handled in this Shift</span>
                                  </div>
                                  <div className="space-y-1">
                                    {group.subSessions.map((sub, idx) => {
                                      return (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-900 p-2 text-xs border border-slate-200/70 dark:border-slate-700/80 shadow-2xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${getFacilityBadgeClass(
                                                sub.facilityTypeName,
                                                false,
                                                sub.frequencyType,
                                                false
                                              )}`}
                                            >
                                              {sub.facilityTypeName}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                            <span>{formatMinutes(sub.durationMinutes)}</span>
                                            {isAtisFacility(sub.facilityTypeName, sub.frequencyType) ? (
                                              <span className="text-slate-400 font-mono text-[11px]">Broadcast</span>
                                            ) : (
                                              <span className="font-semibold text-slate-900 dark:text-white">
                                                {sub.operations} ops
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600 dark:text-slate-300">
                                    <div>
                                      <span className="text-slate-400">Shift Reports: </span>
                                      <span
                                        className={`font-semibold ${
                                          group.totalViolations > 0
                                            ? "text-rose-600 dark:text-rose-400"
                                            : "text-slate-800 dark:text-slate-100"
                                        }`}
                                      >
                                        {group.totalViolations === 0
                                          ? "0 (Clean Shift)"
                                          : `${group.totalViolations} report${group.totalViolations === 1 ? "" : "s"}`}
                                      </span>
                                    </div>
                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                    <div>
                                      <span className="text-slate-400">Combined Pace: </span>
                                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                                        {group.durationMinutes > 0
                                          ? Math.round((group.totalOperations / group.durationMinutes) * 60)
                                          : group.totalOperations}{" "}
                                        ops/hr
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Facility:</span>
                                    <span
                                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${getFacilityBadgeClass(
                                        group.facilitySummary,
                                        group.isLocal,
                                        undefined,
                                        false
                                      )}`}
                                    >
                                      {group.facilitySummary}
                                    </span>
                                  </div>
                                  <span className="text-slate-300 dark:text-slate-600">•</span>
                                  <div>
                                    <span className="text-slate-400">Reports Issued: </span>
                                    <span
                                      className={`font-semibold ${
                                        group.totalViolations > 0
                                          ? "text-rose-600 dark:text-rose-400"
                                          : "text-slate-800 dark:text-slate-100"
                                      }`}
                                    >
                                      {group.totalViolations === 0
                                        ? "0 (Clean Session)"
                                        : `${group.totalViolations} report${group.totalViolations === 1 ? "" : "s"}`}
                                    </span>
                                  </div>
                                  <span className="text-slate-300 dark:text-slate-600">•</span>
                                  <div>
                                    <span className="text-slate-400">Pace: </span>
                                    {isAtisFacility(group.facilitySummary) ? (
                                      <span className="text-slate-500 font-medium">Broadcast frequency</span>
                                    ) : (
                                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                                        {group.durationMinutes > 0
                                          ? Math.round((group.totalOperations / group.durationMinutes) * 60)
                                          : group.totalOperations}{" "}
                                        ops/hr
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* YEVRO Session Card Action Button */}
                              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between flex-wrap gap-2">
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                  <Camera className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Create shareable card for screenshots & downloads:</span>
                                </div>
                                <button
                                  type="button"
                                  id={`open-session-card-${group.groupId}`}
                                  onClick={() => setSelectedSessionForCard(group)}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-2xs hover:bg-slate-800 dark:hover:bg-white transition cursor-pointer"
                                >
                                  <Camera className="h-3.5 w-3.5 text-sky-400 dark:text-sky-600" />
                                  <span>VEYRO Session Card</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      {searchAirportIcao
                        ? `No ATC sessions found matching airport "${searchAirportIcao}".`
                        : "No ATC sessions match the selected filter."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Flat list view */
          <div>
            {/* Mobile Flat Cards (sm:hidden) */}
            <div className="sm:hidden space-y-2.5 mt-3">
              {filteredFlatSessions.length > 0 ? (
                paginatedFlatSessions.map((s) => {
                  const dateStr = new Date(s.created).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const isFlatExpanded = !!expandedFlatSessions[s.id];
                  const isAtis = isAtisFacility(s.facilityTypeName, s.frequencyType);

                  return (
                    <div
                      key={s.id}
                      className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs transition-colors"
                    >
                      {/* Main Mobile Flat Card Row */}
                      <div
                        onClick={() => toggleFlatExpand(s.id)}
                        className="p-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-2.5"
                      >
                        {/* Airport + Facility Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 border border-slate-200/60 dark:border-slate-700">
                              {s.airportIcao}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${getFacilityBadgeClass(
                                s.facilityTypeName,
                                false,
                                s.frequencyType,
                                false
                              )}`}
                            >
                              {s.facilityTypeName}
                            </span>
                          </div>
                          <span className="p-1 rounded-md text-slate-400 shrink-0">
                            {isFlatExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        </div>

                        {/* Date / Server & Time / Ops / Violations */}
                        <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{dateStr}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">{s.server}</div>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Time</div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">{formatMinutes(s.durationMinutes)}</div>
                            </div>
                            <div className="border-l border-slate-200 dark:border-slate-800 pl-3">
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Ops</div>
                              {isAtis ? (
                                <div className="font-mono text-slate-400 dark:text-slate-500">—</div>
                              ) : (
                                <div className="font-bold text-slate-900 dark:text-white">{s.operations}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded flat detail */}
                      {isFlatExpanded && (
                        <div className="bg-slate-50/90 dark:bg-slate-800/60 px-3.5 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2 animate-fadeIn text-xs">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                              <span className="text-slate-400">Pace:</span>
                              {isAtis ? (
                                <span className="text-slate-500 font-medium">Broadcast</span>
                              ) : (
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {s.durationMinutes > 0
                                    ? Math.round((s.operations / s.durationMinutes) * 60)
                                    : s.operations}{" "}
                                  ops/hr
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              id={`flat-session-card-mobile-${s.id}`}
                              onClick={() => setSelectedSessionForCard(s)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-2xs hover:bg-slate-800 dark:hover:bg-white transition cursor-pointer"
                            >
                              <Camera className="h-3.5 w-3.5 text-sky-400 dark:text-sky-600" />
                              <span>Card</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  {searchAirportIcao
                    ? `No ATC sessions found matching airport "${searchAirportIcao}".`
                    : "No ATC sessions match the selected filter."}
                </div>
              )}
            </div>

            {/* Desktop Flat Table View (hidden sm:block) */}
            <div className="hidden sm:block mt-3 overflow-x-auto">
              <div className="min-w-[650px]">
                {/* Aligned Flat Header */}
                <div className="grid grid-cols-[105px_70px_1fr_85px_90px_75px_75px_32px] items-center gap-2 px-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-medium text-xs">
                  <div>{renderSortHeader("Date", "date")}</div>
                  <div>Airport</div>
                  <div>Facility</div>
                  <div>Server</div>
                  <div>{renderSortHeader("Duration", "duration")}</div>
                  <div>{renderSortHeader("Ops", "ops")}</div>
                  <div>{renderSortHeader("Violations", "violations")}</div>
                  <div></div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-1">
                  {filteredFlatSessions.length > 0 ? (
                    paginatedFlatSessions.map((s) => {
                      const dateStr = new Date(s.created).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      const isFlatExpanded = !!expandedFlatSessions[s.id];
                      const isAtis = isAtisFacility(s.facilityTypeName, s.frequencyType);

                      return (
                        <div key={s.id} className="group transition-colors">
                          <div
                            onClick={() => toggleFlatExpand(s.id)}
                            className={`grid grid-cols-[105px_70px_1fr_85px_90px_75px_75px_32px] w-full items-center gap-2 py-2.5 px-3 transition-colors cursor-pointer rounded-lg ${
                              isFlatExpanded
                                ? "bg-slate-50 dark:bg-slate-800/80 font-medium"
                                : "hover:bg-slate-50/90 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            <span className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{dateStr}</span>
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-[11px] rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 border border-slate-200/60 dark:border-slate-700">
                                {s.airportIcao}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span
                                className={`rounded px-2 py-0.5 text-[11px] font-medium truncate ${getFacilityBadgeClass(
                                  s.facilityTypeName,
                                  false,
                                  s.frequencyType,
                                  false
                                )}`}
                              >
                                {s.facilityTypeName}
                              </span>
                            </div>
                            <span className="text-slate-400 dark:text-slate-400 text-xs truncate">{s.server}</span>
                            <span className="text-slate-700 dark:text-slate-200 font-medium text-xs whitespace-nowrap">
                              {formatMinutes(s.durationMinutes)}
                            </span>
                            <div>
                              {isAtis ? (
                                <span className="text-slate-400 dark:text-slate-500 font-mono text-xs" title="ATIS broadcast frequency">
                                  —
                                </span>
                              ) : (
                                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                  {s.operations} ops
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 dark:text-slate-400 text-xs">{s.violationsIssued}</span>
                            <div className="text-right flex items-center justify-end text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">
                              <span className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition">
                                {isFlatExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Flat expanded detail */}
                          {isFlatExpanded && (
                            <div className="bg-slate-50/90 dark:bg-slate-800/60 px-4 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2 rounded-b-lg animate-fadeIn">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                  <span className="text-slate-400">Operations Pace:</span>
                                  {isAtis ? (
                                    <span className="text-slate-500 font-medium">Broadcast frequency</span>
                                  ) : (
                                    <span className="font-semibold text-slate-900 dark:text-white">
                                      {s.durationMinutes > 0
                                        ? Math.round((s.operations / s.durationMinutes) * 60)
                                        : s.operations}{" "}
                                      ops/hr
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  id={`flat-session-card-${s.id}`}
                                  onClick={() => setSelectedSessionForCard(s)}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-2xs hover:bg-slate-800 dark:hover:bg-white transition cursor-pointer"
                                >
                                  <Camera className="h-3.5 w-3.5 text-sky-400 dark:text-sky-600" />
                                  <span>VEYRO Session Card</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      {searchAirportIcao
                        ? `No ATC sessions found matching airport "${searchAirportIcao}".`
                        : "No ATC sessions match the selected filter."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pagination Controls at Bottom of Table - Styled after image.png */}
        {activeTotalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            {/* Left side: Collapsible select dropdown [ 50 ▾ ]  1-50 of 209 */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2.5">
                <div className="relative inline-flex items-center">
                  <select
                    id="atc-page-size-select"
                    value={String(pageSize)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPageSize(val === "all" ? "all" : (Number(val) as AtcPageSize));
                      setCurrentPage(1);
                    }}
                    aria-label="Rows per page"
                    className="appearance-none rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-7 py-1 text-xs sm:text-sm font-bold text-slate-900 dark:text-white shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="all">All</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-700 dark:text-slate-300 stroke-[2.5]" />
                </div>

                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  {pageStartIndex}-{pageEndIndex} of {activeTotalItems.toLocaleString()}
                </span>
              </div>

              {/* Mobile page count badge if multi-page */}
              {pageSize !== "all" && totalPages > 1 && (
                <span className="sm:hidden font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Pg {safeCurrentPage}/{totalPages}
                </span>
              )}
            </div>

            {/* Right side: Previous / Page Numbers / Next */}
            {pageSize !== "all" && totalPages > 1 && (
              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  id="atc-prev-page-btn"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    document.getElementById("atc-sessions-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition shadow-2xs"
                >
                  Previous
                </button>

                <span className="hidden sm:inline-block px-2 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap text-center">
                  Page <span className="font-bold text-slate-900 dark:text-white">{safeCurrentPage}</span> of {totalPages}
                </span>

                <button
                  type="button"
                  id="atc-next-page-btn"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    document.getElementById("atc-sessions-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition shadow-2xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Load More Banner at bottom of ATC list */}
        <div id="atc-bottom-section">
          {!isAllLoaded && (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {sessions.length} of {effectiveTotalCount} ATC shifts loaded ({Math.max(0, effectiveTotalCount - sessions.length)} remaining)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {loadedCountInfo || "Load all shifts to analyze your complete controlling history."}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="load-next-atc-btn"
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
                  <span>+More</span>
                </button>

                <button
                  id="load-all-atc-btn"
                  type="button"
                  disabled={isLoadingAll || isLoadingNext}
                  onClick={handleLoadAll}
                  className="rounded-xl bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  {isLoadingAll ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Loading all shifts...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="h-3.5 w-3.5" />
                      <span>{loadedCountInfo ? "Refresh / Retry" : "Load All Shifts"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {loadedCountInfo && isAllLoaded && (
            <div className="mt-2 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/30 p-3 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-500" />
              <span>{loadedCountInfo}</span>
            </div>
          )}

          {loadError && (
            <div className="mt-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              Sessions with simultaneous Tower, Ground, or ATIS open at the same airfield are automatically grouped into single Local shifts with concurrent duration tracking.
            </span>
          </div>
        </div>
      </div>

      {/* Shareable YEVRO Session Card Modal */}
      <AtcSessionCardModal
        session={selectedSessionForCard}
        controllerName={controllerName}
        atcRank={atcRank}
        onClose={() => setSelectedSessionForCard(null)}
      />

      {/* Excel Export Selection Modal */}
      <AtcExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        sessions={effectiveSessions}
        totalCount={effectiveTotalCount}
        userId={userId}
        controllerName={controllerName}
        atcRank={atcRank}
        onSessionsUpdated={onSessionsUpdated}
      />
    </div>
  );
}
