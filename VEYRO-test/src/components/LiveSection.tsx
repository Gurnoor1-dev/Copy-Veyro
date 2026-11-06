import { useState, useEffect, useMemo } from "react";
import {
  Building2,
  Plane,
  Users,
  Calendar,
  Radio,
  Compass,
  FileText,
  Key,
  RefreshCw,
  Search,
  ExternalLink,
  Plus,
  Trash2,
  ChevronRight,
  Shield,
  Clock,
  Gauge,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  UserCheck,
} from "lucide-react";
import {
  Organization,
  OrganizationMember,
  Aircraft,
  AircraftPosition,
  AircraftFlight,
  Schedule,
  PersistentOrganizationType,
  PersistentOrganizationMemberRole,
  OrganizationOperationType,
  WorldType,
  PersistentAircraftVisibility,
  AircraftPersistenceState,
  AircraftFlightStatus,
  ScheduledFlightStatus,
  PersistentFlightType,
  PersistentFlightCrewMemberRole,
} from "../types/liveV3";

interface LiveSectionProps {
  onSearchPilot?: (username: string) => void;
}

type LiveTab = "orgs" | "aircraft" | "schedules" | "members" | "servers" | "tracks" | "docs";

export default function LiveSection({ onSearchPilot }: LiveSectionProps) {
  const [activeTab, setActiveTab] = useState<LiveTab>("orgs");

  // OAuth token state
  const [oauthToken, setOauthToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("if_v3_oauth_token") || "";
    }
    return "";
  });
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState(oauthToken);

  // Organizations data
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Sub-items for selected organization
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);
  const [orgAircraft, setOrgAircraft] = useState<Aircraft[]>([]);
  const [orgSchedules, setOrgSchedules] = useState<Schedule[]>([]);
  const [loadingSubItems, setLoadingSubItems] = useState(false);

  // Selected aircraft details
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [aircraftPosition, setAircraftPosition] = useState<AircraftPosition | null>(null);
  const [aircraftFlights, setAircraftFlights] = useState<AircraftFlight[]>([]);
  const [loadingAircraftDetails, setLoadingAircraftDetails] = useState(false);

  // Global servers analytics (v2)
  const [serverAnalytics, setServerAnalytics] = useState<any>(null);
  const [loadingServers, setLoadingServers] = useState(false);

  // Oceanic tracks & NOTAMs
  const [oceanicTracks, setOceanicTracks] = useState<any[]>([]);
  const [notams, setNotams] = useState<any[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  // Schedule creation modal
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false);
  const [newScheduleForm, setNewScheduleForm] = useState({
    callsign: "",
    originIcao: "",
    destinationIcao: "",
    flightType: PersistentFlightType.Commercial,
    briefing: "",
    flightPlan: "",
    isTimeless: false,
  });

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const handleSaveToken = () => {
    const cleaned = tokenInput.trim();
    setOauthToken(cleaned);
    if (typeof window !== "undefined") {
      localStorage.setItem("if_v3_oauth_token", cleaned);
    }
    setIsTokenModalOpen(false);
    fetchOrganizations(cleaned);
  };

  const handleClearToken = () => {
    setOauthToken("");
    setTokenInput("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("if_v3_oauth_token");
    }
    setIsTokenModalOpen(false);
    fetchOrganizations("");
  };

  // Fetch Organizations
  const fetchOrganizations = async (token = oauthToken) => {
    setLoadingOrgs(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/v3/live/organizations", { headers });
      const data = await res.json();
      const list: Organization[] = data.result || [];
      setOrgs(list);
      if (list.length > 0 && (!selectedOrgId || !list.find((o) => o.id === selectedOrgId))) {
        setSelectedOrgId(list[0].id);
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
    } finally {
      setLoadingOrgs(false);
    }
  };

  // Fetch sub-items for selected organization
  useEffect(() => {
    if (!selectedOrgId) return;

    let isMounted = true;
    setLoadingSubItems(true);

    const headers: Record<string, string> = {};
    if (oauthToken) headers["Authorization"] = `Bearer ${oauthToken}`;

    Promise.all([
      fetch(`/api/v3/live/organizations/${selectedOrgId}/members`, { headers }).then((r) => r.json()),
      fetch(`/api/v3/live/organizations/${selectedOrgId}/aircraft`, { headers }).then((r) => r.json()),
      fetch(`/api/v3/live/organizations/${selectedOrgId}/schedules`, { headers }).then((r) => r.json()),
    ])
      .then(([membersRes, aircraftRes, schedulesRes]) => {
        if (!isMounted) return;
        setOrgMembers(membersRes.result || []);
        const acList: Aircraft[] = aircraftRes.result || [];
        setOrgAircraft(acList);
        setOrgSchedules(schedulesRes.result?.items || []);

        // Default select first aircraft
        if (acList.length > 0 && !selectedAircraftId) {
          setSelectedAircraftId(acList[0].id);
        }
      })
      .catch((err) => console.error("Failed to load org sub-items:", err))
      .finally(() => {
        if (isMounted) setLoadingSubItems(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedOrgId, oauthToken]);

  // Fetch aircraft position and flight logs when selected
  useEffect(() => {
    if (!selectedAircraftId) return;

    let isMounted = true;
    setLoadingAircraftDetails(true);

    const headers: Record<string, string> = {};
    if (oauthToken) headers["Authorization"] = `Bearer ${oauthToken}`;

    Promise.all([
      fetch(`/api/v3/live/aircraft/${selectedAircraftId}/position`, { headers }).then((r) => r.json()),
      fetch(`/api/v3/live/aircraft/${selectedAircraftId}/flights`, { headers }).then((r) => r.json()),
    ])
      .then(([posRes, flightsRes]) => {
        if (!isMounted) return;
        setAircraftPosition(posRes.result || null);
        setAircraftFlights(flightsRes.result?.items || []);
      })
      .catch((err) => console.error("Failed to load aircraft telemetry:", err))
      .finally(() => {
        if (isMounted) setLoadingAircraftDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAircraftId, oauthToken]);

  // Fetch initial organizations
  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Fetch v2 server analytics when tab switched
  useEffect(() => {
    if (activeTab === "servers" && !serverAnalytics) {
      setLoadingServers(true);
      fetch("/api/servers/analytics")
        .then((r) => r.json())
        .then((d) => setServerAnalytics(d))
        .catch((err) => console.error(err))
        .finally(() => setLoadingServers(false));
    }

    if (activeTab === "tracks" && oceanicTracks.length === 0) {
      setLoadingTracks(true);
      Promise.all([
        fetch("/api/live/oceanic-tracks").then((r) => r.json()),
        fetch("/api/live/notams").then((r) => r.json()),
      ])
        .then(([tracksRes, notamsRes]) => {
          setOceanicTracks(tracksRes.tracks || []);
          setNotams(notamsRes.notams || []);
        })
        .catch((err) => console.error(err))
        .finally(() => setLoadingTracks(false));
    }
  }, [activeTab]);

  // Current selected org
  const selectedOrg = useMemo(() => {
    return orgs.find((o) => o.id === selectedOrgId) || orgs[0];
  }, [orgs, selectedOrgId]);

  // Handle schedule creation
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAircraftId || !newScheduleForm.callsign) return;

    try {
      const res = await fetch(`/api/v3/live/aircraft/${selectedAircraftId}/schedules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(oauthToken ? { Authorization: `Bearer ${oauthToken}` } : {}),
        },
        body: JSON.stringify({
          ...newScheduleForm,
          organizationId: selectedOrgId,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setOrgSchedules((prev) => [data.result, ...prev]);
        setIsCreateScheduleOpen(false);
        setNewScheduleForm({
          callsign: "",
          originIcao: "",
          destinationIcao: "",
          flightType: PersistentFlightType.Commercial,
          briefing: "",
          flightPlan: "",
          isTimeless: false,
        });
      }
    } catch (err) {
      console.error("Failed to create schedule:", err);
    }
  };

  // Handle schedule deletion
  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      await fetch(`/api/v3/live/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: oauthToken ? { Authorization: `Bearer ${oauthToken}` } : {},
      });
      setOrgSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    }
  };

  // Helpers for enum labels
  const getOrgTypeLabel = (type: PersistentOrganizationType) => {
    switch (type) {
      case PersistentOrganizationType.AutoJoin:
        return "Auto Join";
      case PersistentOrganizationType.ManualJoin:
        return "Manual Join";
      case PersistentOrganizationType.ApplyToJoin:
        return "Apply To Join";
      case PersistentOrganizationType.InviteOnly:
        return "Invite Only";
      case PersistentOrganizationType.SingleMember:
        return "Single Member";
      default:
        return "Standard";
    }
  };

  const getOperationTypeLabel = (op: OrganizationOperationType) => {
    switch (op) {
      case OrganizationOperationType.Airline:
        return "Scheduled Airline";
      case OrganizationOperationType.Charter:
        return "Executive Charter";
      case OrganizationOperationType.Freight:
        return "Cargo & Freight";
      case OrganizationOperationType.Military:
        return "Military & Defense";
      case OrganizationOperationType.FlightSchool:
        return "Flight Academy";
      case OrganizationOperationType.Private:
        return "Private Operation";
      default:
        return "General";
    }
  };

  const getWorldTypeLabel = (world: WorldType) => {
    switch (world) {
      case WorldType.Expert:
        return "Expert Server";
      case WorldType.Training:
        return "Training Server";
      case WorldType.Casual:
        return "Casual Server";
      case WorldType.Solo:
        return "Solo Flight";
      case WorldType.Private:
        return "Private World";
      default:
        return "Online";
    }
  };

  const getRoleLabel = (role: PersistentOrganizationMemberRole) => {
    switch (role) {
      case PersistentOrganizationMemberRole.Owner:
        return { label: "Owner", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      case PersistentOrganizationMemberRole.Admin:
        return { label: "Admin", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
      case PersistentOrganizationMemberRole.Member:
      default:
        return { label: "Member", color: "bg-slate-700/50 text-slate-300 border-slate-600/40" };
    }
  };

  const getScheduleStatusBadge = (status: ScheduledFlightStatus) => {
    switch (status) {
      case ScheduledFlightStatus.InFlight:
        return { label: "In Flight", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
      case ScheduledFlightStatus.Boarding:
        return { label: "Boarding", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
      case ScheduledFlightStatus.TaxiingToRunway:
        return { label: "Taxiing", color: "bg-sky-500/20 text-sky-400 border-sky-500/40" };
      case ScheduledFlightStatus.Scheduled:
        return { label: "Scheduled", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" };
      case ScheduledFlightStatus.Arrived:
        return { label: "Arrived", color: "bg-slate-600/30 text-slate-300 border-slate-600/30" };
      case ScheduledFlightStatus.Delayed:
        return { label: "Delayed", color: "bg-rose-500/20 text-rose-400 border-rose-500/40" };
      default:
        return { label: "Planned", color: "bg-slate-700/40 text-slate-300 border-slate-700" };
    }
  };

  const getFlightTypeLabel = (ft: PersistentFlightType) => {
    switch (ft) {
      case PersistentFlightType.Commercial:
        return "Commercial";
      case PersistentFlightType.Cargo:
        return "Cargo";
      case PersistentFlightType.Charter:
        return "Charter";
      case PersistentFlightType.Training:
        return "Training";
      case PersistentFlightType.VIPExecutive:
        return "VIP Executive";
      case PersistentFlightType.Military:
        return "Military";
      default:
        return "General";
    }
  };

  // Filtered schedules or aircraft by search
  const filteredSchedules = useMemo(() => {
    if (!searchQuery.trim()) return orgSchedules;
    const q = searchQuery.toLowerCase();
    return orgSchedules.filter(
      (s) =>
        s.callsign.toLowerCase().includes(q) ||
        s.originIcao.toLowerCase().includes(q) ||
        s.destinationIcao.toLowerCase().includes(q) ||
        s.flightPlan?.toLowerCase().includes(q)
    );
  }, [orgSchedules, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 space-y-6">
      {/* Top Banner / Live Header */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-slate-900 via-[#0a1424] to-[#040d1a] p-5 sm:p-7 shadow-2xl backdrop-blur-md">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-emerald-400 font-bold">
                Infinite Flight Live Hub
              </span>
              <span className="rounded-full bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 text-[10px] font-mono text-sky-300">
                PublicApi v3 OAuth Preview & v2
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>Live Operations & Analytics</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Real-time organization telemetry, persistent fleet aircraft, flight schedules, member rosters, and global multiplayer statistics.
            </p>
          </div>

          {/* Quick controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={() => setIsTokenModalOpen(true)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition shadow-sm cursor-pointer ${
                oauthToken
                  ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/90"
                  : "bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700"
              }`}
            >
              <Key className="h-3.5 w-3.5 text-amber-400" />
              <span>{oauthToken ? "OAuth Token Connected" : "Connect IF OAuth Token"}</span>
            </button>

            <button
              onClick={() => fetchOrganizations()}
              disabled={loadingOrgs}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
              title="Refresh live data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingOrgs ? "animate-spin text-sky-400" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Summary KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-sky-400" /> Organizations
              </span>
              <span className="font-mono text-[10px] text-slate-500">v3 Live</span>
            </div>
            <div className="text-xl font-black text-white font-mono">{orgs.length}</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5 text-amber-400" /> Org Fleets
              </span>
              <span className="font-mono text-[10px] text-slate-500">Active</span>
            </div>
            <div className="text-xl font-black text-white font-mono">
              {orgAircraft.length || orgs.reduce((acc, o) => acc + (o.aircraftCount || 0), 0)}
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-emerald-400" /> Open Schedules
              </span>
              <span className="font-mono text-[10px] text-slate-500">Schedules</span>
            </div>
            <div className="text-xl font-black text-white font-mono">
              {orgSchedules.length || orgs.reduce((acc, o) => acc + (o.openSchedulesCount || 0), 0)}
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-400" /> Org Pilots
              </span>
              <span className="font-mono text-[10px] text-slate-500">Rosters</span>
            </div>
            <div className="text-xl font-black text-white font-mono">
              {orgMembers.length || orgs.reduce((acc, o) => acc + (o.memberCount || 0), 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setActiveTab("orgs")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "orgs"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Organizations & Fleets</span>
          </button>

          <button
            onClick={() => setActiveTab("schedules")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "schedules"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Flight Schedules ({orgSchedules.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("members")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "members"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Members & Crew ({orgMembers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("servers")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "servers"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Multiplayer Radar (v2)</span>
          </button>

          <button
            onClick={() => setActiveTab("tracks")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "tracks"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Oceanic Tracks & NOTAMs</span>
          </button>

          <button
            onClick={() => setActiveTab("docs")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "docs"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>v3 API Reference</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ORGANIZATIONS & FLEETS */}
      {activeTab === "orgs" && (
        <div className="space-y-6">
          {/* Org Selector bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {orgs.map((org) => {
              const isSelected = org.id === selectedOrgId;
              const roleInfo = getRoleLabel(org.role);
              return (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrgId(org.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition cursor-pointer shrink-0 ${
                    isSelected
                      ? "border-sky-500 bg-sky-950/40 dark:bg-sky-950/50 shadow-md ring-1 ring-sky-400/50"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-sky-400 border border-slate-700">
                    {org.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{org.name}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{getOperationTypeLabel(org.operationType)}</span>
                      <span>•</span>
                      <span>{getWorldTypeLabel(org.worldType)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Org Detail Card */}
          {selectedOrg && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedOrg.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Active Organization
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                    {selectedOrg.description || "Organization operations on Infinite Flight Live."}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                    Join: {getOrgTypeLabel(selectedOrg.type)}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                    {getWorldTypeLabel(selectedOrg.worldType)}
                  </span>
                </div>
              </div>

              {/* Fleet & Telemetry Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Aircraft List (Left column) */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Plane className="h-3.5 w-3.5 text-amber-400" />
                      Fleet Aircraft ({orgAircraft.length})
                    </h3>
                    <span className="text-[11px] text-slate-500">Ranked by Priority</span>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {orgAircraft.map((ac) => {
                      const isSelected = ac.id === selectedAircraftId;
                      return (
                        <div
                          key={ac.id}
                          onClick={() => setSelectedAircraftId(ac.id)}
                          className={`p-3 rounded-xl border transition cursor-pointer ${
                            isSelected
                              ? "border-amber-500/80 bg-amber-500/5 dark:bg-amber-950/20 ring-1 ring-amber-400/40"
                              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                              {ac.registration}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {ac.visibility === PersistentAircraftVisibility.Visible ? (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Visible
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">
                                  Hangared
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-500">#{ac.fleetRank}</span>
                            </div>
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {ac.modelName || "Airframe Model"}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {ac.liveryName || ac.aircraftId}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Aircraft Telemetry & Flight Log (Right column) */}
                <div className="lg:col-span-7 space-y-4">
                  {aircraftPosition ? (
                    <div className="rounded-xl border border-sky-500/30 bg-slate-950 p-4 shadow-md space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-sky-400" />
                          <span className="font-bold text-sm text-white">Live Aircraft Telemetry</span>
                        </div>
                        <span
                          className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full border ${
                            aircraftPosition.state === AircraftPersistenceState.InFlight
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {aircraftPosition.state === AircraftPersistenceState.InFlight ? "Airborne" : "On Ground"}
                        </span>
                      </div>

                      {/* Telemetry Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-mono">Altitude</div>
                          <div className="text-base font-bold font-mono text-white">
                            {aircraftPosition.altitude.toLocaleString()}'
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-mono">Ground Speed</div>
                          <div className="text-base font-bold font-mono text-white">
                            {Math.round(aircraftPosition.speed)} kts
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-mono">Heading</div>
                          <div className="text-base font-bold font-mono text-white">
                            {Math.round(aircraftPosition.heading)}°
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-mono">Vertical Speed</div>
                          <div className="text-base font-bold font-mono text-white">
                            {aircraftPosition.verticalSpeed} fpm
                          </div>
                        </div>
                      </div>

                      {/* Coordinates & Pilot */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 pt-1 gap-2">
                        <div className="flex items-center gap-1.5 font-mono">
                          <MapPin className="h-3.5 w-3.5 text-rose-400" />
                          <span>
                            {aircraftPosition.latitude.toFixed(4)}°, {aircraftPosition.longitude.toFixed(4)}°
                          </span>
                        </div>

                        {aircraftPosition.lastPilotUsername && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Last Pilot:</span>
                            <button
                              onClick={() => onSearchPilot && onSearchPilot(aircraftPosition.lastPilotUsername!)}
                              className="font-bold text-sky-400 hover:underline cursor-pointer"
                            >
                              @{aircraftPosition.lastPilotUsername}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-500">
                      Select an aircraft from the fleet roster to inspect its real-time telemetry.
                    </div>
                  )}

                  {/* Flight Logs */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-sky-400" />
                      Recent Flight Logs
                    </h4>

                    {aircraftFlights.length === 0 ? (
                      <div className="text-xs text-slate-500 p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                        No recorded flight logs for this airframe yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {aircraftFlights.map((flight) => (
                          <div
                            key={flight.id}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/80 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between font-mono font-bold">
                              <span className="text-sky-400 text-sm">
                                {flight.originIcao || "????"} → {flight.destinationIcao || "????"}
                              </span>
                              <span className="text-slate-300">{Math.round(flight.flightTimeMinutes)} mins</span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>Airframe total: {Math.round(flight.airframeTimeMinutes / 60)} hrs</span>
                              {flight.crew && flight.crew.length > 0 && (
                                <span>
                                  Crew: {flight.crew.map((c) => c.username).filter(Boolean).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FLIGHT SCHEDULES */}
      {activeTab === "schedules" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search schedules by callsign or airport..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <button
              onClick={() => setIsCreateScheduleOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition cursor-pointer shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Flight Schedule</span>
            </button>
          </div>

          {filteredSchedules.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 text-xs">
              No flight schedules found for this organization.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSchedules.map((schedule) => {
                const statusBadge = getScheduleStatusBadge(schedule.status);
                return (
                  <div
                    key={schedule.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-base text-slate-900 dark:text-white">
                          {schedule.callsign}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {getFlightTypeLabel(schedule.flightType)}
                        </span>
                        <button
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
                          title="Delete Schedule"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Route */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono">
                      <div>
                        <div className="text-[10px] text-slate-400">ORIGIN</div>
                        <div className="text-base font-bold text-sky-400">{schedule.originIcao}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">DESTINATION</div>
                        <div className="text-base font-bold text-emerald-400">{schedule.destinationIcao}</div>
                      </div>
                    </div>

                    {/* Flight Plan & Briefing */}
                    {schedule.flightPlan && (
                      <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300 truncate">
                        <span className="text-slate-500 mr-1.5">FPL:</span>
                        {schedule.flightPlan}
                      </div>
                    )}

                    {schedule.briefing && (
                      <p className="text-xs text-slate-400 italic">"{schedule.briefing}"</p>
                    )}

                    {/* Crew Assigned */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="text-slate-500 flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5" /> Assigned Crew:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {schedule.crew && schedule.crew.length > 0 ? (
                          schedule.crew.map((c) => (
                            <span
                              key={c.userId}
                              className="font-medium text-slate-300 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800"
                            >
                              {c.role === PersistentFlightCrewMemberRole.Captain ? "CPT" : "FO"}{" "}
                              {c.username || "Pilot"}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic">Unassigned (Open for bid)</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEMBERS & ROSTER */}
      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-400" />
              <span>{selectedOrg?.name} Organization Members ({orgMembers.length})</span>
            </h3>
            <span className="text-xs text-slate-500">Sorted by Owners, Admins, Members</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {orgMembers.map((member) => {
              const roleInfo = getRoleLabel(member.role);
              return (
                <div
                  key={member.userId}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-sky-400 border border-slate-700">
                      {member.username ? member.username.substring(0, 2).toUpperCase() : "??"}
                    </div>
                    <div>
                      <button
                        onClick={() => member.username && onSearchPilot && onSearchPilot(member.username)}
                        className="font-bold text-sm text-slate-900 dark:text-white hover:text-sky-400 text-left transition cursor-pointer"
                      >
                        {member.username || "Community Member"}
                      </button>
                      <div className="text-[11px] text-slate-400">
                        Joined {new Date(member.joinedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${roleInfo.color}`}>
                      {roleInfo.label}
                    </span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {member.activeLifts} Lifts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: MULTIPLAYER RADAR (v2) */}
      {activeTab === "servers" && (
        <div className="space-y-5">
          {loadingServers ? (
            <div className="text-center py-12 text-slate-400 text-xs animate-pulse">
              Querying live Infinite Flight servers and active controllers...
            </div>
          ) : serverAnalytics ? (
            <div className="space-y-6">
              {/* Server Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {serverAnalytics.servers?.map((srv: any) => (
                  <div
                    key={srv.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{srv.name}</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Airborne Flights</div>
                        <div className="text-lg font-black font-mono text-white">{srv.userCount || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Active ATC</div>
                        <div className="text-lg font-black font-mono text-sky-400">{srv.atcCount || 0}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active ATC Frequencies */}
              {serverAnalytics.controlledAirports && serverAnalytics.controlledAirports.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-emerald-400" />
                    Online ATC Frequencies Worldwide
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {serverAnalytics.controlledAirports.map((apt: any) => (
                      <div
                        key={apt.icao}
                        className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-sky-400 text-sm">{apt.icao}</span>
                          <div className="text-[11px] text-slate-400 truncate max-w-[150px]">
                            {apt.airportName || "Airport Facility"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {apt.frequencies?.map((f: string) => (
                            <span
                              key={f}
                              className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px]"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 5: OCEANIC TRACKS & NOTAMS */}
      {activeTab === "tracks" && (
        <div className="space-y-6">
          {loadingTracks ? (
            <div className="text-center py-12 text-slate-400 text-xs animate-pulse">
              Querying North Atlantic / Pacific Tracks & NOTAMs...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Oceanic Tracks */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-sky-400" />
                    Live Oceanic Tracks ({oceanicTracks.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">NAT & PACOTS</span>
                </div>

                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {oceanicTracks.map((track) => (
                    <div
                      key={track.name}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-sky-400">
                          Track {track.name} ({track.type || "NAT"})
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {track.direction || "Eastbound"}
                        </span>
                      </div>

                      <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300 break-words">
                        {track.route ? track.route.join(" → ") : track.rawTrack || "No route string"}
                      </div>

                      {track.validFrom && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          Valid: {new Date(track.validFrom).toLocaleTimeString()} -{" "}
                          {new Date(track.validTo).toLocaleTimeString()} UTC
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* NOTAMs */}
              <div className="lg:col-span-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  Active NOTAMs ({notams.length})
                </h3>

                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {notams.slice(0, 15).map((notam, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-amber-400">{notam.title || "NOTICE"}</span>
                        <span className="text-[10px] text-slate-500">{notam.type}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{notam.description || notam.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: V3 API REFERENCE */}
      {activeTab === "docs" && (
        <div className="space-y-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-400" />
              <span>Infinite Flight PublicApi v3 Live OAuth Preview</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Complete specification for Live organizations, aircraft, flight schedules, and member management.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
              <div className="font-mono text-xs font-bold text-sky-400">GET /live/organizations</div>
              <p className="text-xs text-slate-400">Returns active organizations the signed-in user belongs to.</p>
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Scope: live:organizations.read
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
              <div className="font-mono text-xs font-bold text-sky-400">GET /live/organizations/&#123;id&#125;/members</div>
              <p className="text-xs text-slate-400">
                Returns all members of the organization sorted by Owners, Admins, and Members. Includes active lifts applied.
              </p>
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Scope: live:members.read
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
              <div className="font-mono text-xs font-bold text-sky-400">GET /live/organizations/&#123;id&#125;/aircraft</div>
              <p className="text-xs text-slate-400">
                Returns active aircraft in the organization fleet, rank priority, and storage visibility.
              </p>
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Scope: live:aircraft.read
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
              <div className="font-mono text-xs font-bold text-sky-400">GET /live/organizations/&#123;id&#125;/schedules</div>
              <p className="text-xs text-slate-400">
                Returns the open schedules of the fleet with flight plan strings, briefing, and assigned crew members.
              </p>
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Scope: live:schedules.read
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SCHEDULE MODAL */}
      {isCreateScheduleOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl text-xs text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Calendar className="h-4 w-4 text-sky-400" />
                <span>Create Flight Schedule</span>
              </div>
              <button onClick={() => setIsCreateScheduleOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase">Callsign</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PJX421"
                  value={newScheduleForm.callsign}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, callsign: e.target.value.toUpperCase() })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 font-bold uppercase">Origin (ICAO)</label>
                  <input
                    type="text"
                    required
                    placeholder="KLAX"
                    maxLength={4}
                    value={newScheduleForm.originIcao}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, originIcao: e.target.value.toUpperCase() })}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white uppercase"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-bold uppercase">Destination (ICAO)</label>
                  <input
                    type="text"
                    required
                    placeholder="KJFK"
                    maxLength={4}
                    value={newScheduleForm.destinationIcao}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, destinationIcao: e.target.value.toUpperCase() })}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase">Flight Plan Routing (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. KLAX DAG LAS DVC KJFK"
                  value={newScheduleForm.flightPlan}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, flightPlan: e.target.value.toUpperCase() })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase">Dispatch Briefing</label>
                <textarea
                  rows={2}
                  placeholder="Operational notes, step climbs, weather..."
                  value={newScheduleForm.briefing}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, briefing: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateScheduleOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-900 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 font-bold text-white cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OAUTH TOKEN MODAL */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl text-xs text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Key className="h-4 w-4 text-amber-400" />
                <span>Infinite Flight OAuth2 Token</span>
              </div>
              <button onClick={() => setIsTokenModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-slate-400 leading-relaxed">
              To query your private organizations and fleets in real-time, paste an Infinite Flight OAuth2 Bearer token obtained from{" "}
              <code className="text-sky-400 font-mono">https://api.infiniteflight.com/auth/v2</code> with scopes{" "}
              <code className="text-amber-300 font-mono">live:organizations.read</code> and{" "}
              <code className="text-amber-300 font-mono">live:schedules.read</code>.
            </p>

            <div>
              <label className="text-[11px] text-slate-400 font-bold uppercase">Bearer Access Token</label>
              <textarea
                rows={3}
                placeholder="eyJhbGciOiJSUzI1NiIs..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full mt-1.5 p-3 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClearToken}
                className="text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                Reset to Preview Demo
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsTokenModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-900 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveToken}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 font-bold text-white cursor-pointer"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
