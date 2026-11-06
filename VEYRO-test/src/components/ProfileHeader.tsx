import { useState } from "react";
import { UserSummary, LiveFlightStatus, LiveAtcStatus, getIfatcRankName, getUserRolesList } from "../types";
import { Clock, Award, Radio, Headphones, Zap, AlertCircle, Plane, User as UserIcon, ExternalLink } from "lucide-react";

interface ProfileHeaderProps {
  user: UserSummary;
  liveStatus: LiveFlightStatus;
  liveAtcStatus?: LiveAtcStatus;
}

export function formatMinutes(mins: number): string {
  const hours = Math.floor(mins / 60);
  const remainingMins = Math.round(mins % 60);
  return `${hours.toLocaleString()}h ${remainingMins}m`;
}

export function getGradeBadgeStyle(grade: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (grade) {
    case 5:
      return {
        bg: "bg-purple-50 dark:bg-purple-950/40",
        text: "text-purple-700 dark:text-purple-300",
        border: "border-purple-200 dark:border-purple-800",
        label: "Grade 5",
      };
    case 4:
      return {
        bg: "bg-rose-50 dark:bg-rose-950/40",
        text: "text-rose-700 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-800",
        label: "Grade 4",
      };
    case 3:
      return {
        bg: "bg-amber-50 dark:bg-amber-950/40",
        text: "text-amber-800 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800",
        label: "Grade 3",
      };
    case 2:
      return {
        bg: "bg-slate-100 dark:bg-slate-800",
        text: "text-slate-700 dark:text-slate-300",
        border: "border-slate-200 dark:border-slate-700",
        label: "Grade 2",
      };
    case 1:
    default:
      return {
        bg: "bg-orange-50 dark:bg-orange-950/40",
        text: "text-orange-700 dark:text-orange-300",
        border: "border-orange-200 dark:border-orange-800",
        label: "Grade 1",
      };
  }
}

function getFacilityBadge(type?: number): { code: string; label: string } {
  switch (type) {
    case 0:
      return { code: "GND", label: "Ground" };
    case 1:
      return { code: "TWR", label: "Tower" };
    case 2:
      return { code: "UNICOM", label: "Unicom" };
    case 3:
      return { code: "DEL", label: "Clearance Delivery" };
    case 4:
      return { code: "APP", label: "Approach" };
    case 5:
      return { code: "DEP", label: "Departure" };
    case 6:
      return { code: "CTR", label: "Center" };
    case 7:
      return { code: "ATIS", label: "ATIS" };
    default:
      return { code: "ATC", label: "ATC" };
  }
}

export default function ProfileHeader({
  user,
  liveStatus,
  liveAtcStatus,
}: ProfileHeaderProps) {
  const gradeStyle = getGradeBadgeStyle(user.grade);
  const userRoles = getUserRolesList(user.roles);
  const [avatarError, setAvatarError] = useState(false);

  const isIfatcUser = (user.roles || []).includes(64) || user.atcRank > 0;
  const voClean = (user.virtualOrganization || "").trim().toUpperCase();
  const isIfatcOrg = voClean === "IFATC" || voClean === "INFINITE FLIGHT ATC" || voClean.includes("IFATC");
  const showVirtualOrg = Boolean(user.virtualOrganization && !(isIfatcUser && isIfatcOrg));

  const initialAvatarSrc = user.avatarUrl || `/api/avatar/${encodeURIComponent(user.discourseUsername)}`;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs transition-colors">
      {/* Top row: Avatar + Username + Flight Status */}
      <div className="flex flex-col gap-3.5 sm:gap-4 md:flex-row md:items-center md:justify-between">
        {/* Pilot Identity */}
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          {/* IFC Profile Picture with Fallback */}
          <div className="relative shrink-0">
            {!avatarError ? (
              <img
                src={initialAvatarSrc}
                alt={user.discourseUsername}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl object-cover border border-slate-200/80 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-2xs"
              />
            ) : (
              <div
                className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border ${gradeStyle.border} ${gradeStyle.bg}`}
              >
                <div className="text-center">
                  <span className="block text-[8px] sm:text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    Grade
                  </span>
                  <span className={`text-lg sm:text-xl font-bold ${gradeStyle.text}`}>
                    {user.grade}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pilot details */}
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {user.discourseUsername}
              </h2>
              <a
                href={`https://community.infiniteflight.com/u/${encodeURIComponent(user.discourseUsername)}/summary`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="View Infinite Flight Community profile"
                aria-label="View Infinite Flight Community profile"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {/* Badges & Meta */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${gradeStyle.border} ${gradeStyle.bg} ${gradeStyle.text}`}
              >
                {gradeStyle.label}
              </span>
              {userRoles.map((role) => (
                <span
                  key={role.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${role.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${role.dotClass}`} />
                  <span>{role.name}</span>
                </span>
              ))}
              {showVirtualOrg && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/70 px-2.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 dark:text-slate-500 font-normal"></span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{user.virtualOrganization}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Radar Flight & ATC Controlling Status */}
        <div className="w-full sm:w-auto">
          {/* If controlling, show only the controlling widget */}
          {liveAtcStatus?.isControlling ? (
            <div
              className="flex items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/5 dark:bg-sky-500/10 px-3.5 py-2.5 shadow-2xs transition-all"
            >
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <Headphones className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
                </span>
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">
                    Controlling
                  </span>
                  <span className="font-mono text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-500/15 px-1.5 py-0.2 rounded">
                    {getFacilityBadge(liveAtcStatus.facilityType).code}
                  </span>
                  {liveAtcStatus.serverName && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      • {liveAtcStatus.serverName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px] sm:max-w-[220px]">
                    {liveAtcStatus.airportName
                      ? `${liveAtcStatus.airportName} ${liveAtcStatus.facilityName || getFacilityBadge(liveAtcStatus.facilityType).label}`
                      : liveAtcStatus.facilityName || getFacilityBadge(liveAtcStatus.facilityType).label}
                  </span>
                  {liveAtcStatus.durationMinutes !== undefined && (
                    <span className="text-slate-400 dark:text-slate-500">
                      • {liveAtcStatus.durationMinutes > 0 ? `${liveAtcStatus.durationMinutes}m active` : "Just opened"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : liveStatus.isOnline ? (
            /* Otherwise show airborne flight widget if flying */
            <div
              className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-500/10 px-3.5 py-2.5 shadow-2xs transition-all"
            >
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Plane className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">
                    {liveStatus.flightState === "ground" ? "On Ground" : "Airborne"}
                  </span>
                  {liveStatus.callsign && (
                    <span className="font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-1.5 py-0.2 rounded">
                      {liveStatus.callsign}
                    </span>
                  )}
                  {liveStatus.serverName && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      • {liveStatus.serverName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {liveStatus.aircraftName && (
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[160px] sm:max-w-[200px]">
                      {liveStatus.aircraftName}
                    </span>
                  )}
                  {liveStatus.altitude !== undefined && (
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      • {liveStatus.altitude >= 18000 ? `FL${Math.round(liveStatus.altitude / 100)}` : `${liveStatus.altitude.toLocaleString()} ft`}
                    </span>
                  )}
                  {liveStatus.speed !== undefined && (
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      • {liveStatus.speed} kts
                    </span>
                  )}
                  {liveStatus.heading !== undefined && (
                    <span className="font-mono text-slate-400 dark:text-slate-500 hidden sm:inline">
                      • {String(liveStatus.heading).padStart(3, "0")}°
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Otherwise show original on ground / offline status */
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-600 shrink-0" />
              <span>Status: <strong className="text-slate-700 dark:text-slate-300 font-medium">On Ground / Offline</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Clean Metric Row */}
      <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-5 pt-4 sm:pt-6 border-t border-slate-100 dark:border-slate-800">
        {/* Total Flight Time */}
        <div className="rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-2.5 sm:p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate">Flight Time</span>
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            {formatMinutes(user.flightTimeMinutes)}
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {Number((user.flightTimeMinutes / 1440).toFixed(1)).toLocaleString()} days
          </div>
        </div>

        {/* Total XP */}
        <div className="rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-2.5 sm:p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Zap className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate">Total XP</span>
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            {user.xp.toLocaleString()}
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {user.onlineFlights.toLocaleString()} flights
          </div>
        </div>

        {/* Landings */}
        <div className="rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-2.5 sm:p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Plane className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate">Landings</span>
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            {user.landingCount.toLocaleString()}
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate">
            Touchdowns
          </div>
        </div>

        {/* ATC Operations */}
        <div className="rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-2.5 sm:p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Award className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate">ATC Operations</span>
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            {user.atcOperations.toLocaleString()}
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {getIfatcRankName(user.atcRank)} {user.atcRank > 0 ? `(Rank ${user.atcRank})` : ""}
          </div>
        </div>

        {/* Violations */}
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-2.5 sm:p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <AlertCircle className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="truncate">Violations</span>
          </div>
          <div className={`mt-1 text-base sm:text-lg font-bold ${user.violations > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"} truncate`}>
            {user.violations}
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 flex gap-2 font-mono">
            <span>L1:{user.violationCountByLevel?.level1 ?? 0}</span>
            <span>L2:{user.violationCountByLevel?.level2 ?? 0}</span>
            <span>L3:{user.violationCountByLevel?.level3 ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
