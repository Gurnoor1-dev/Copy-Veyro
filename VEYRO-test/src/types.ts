export interface ViolationCountByLevel {
  level1: number;
  level2: number;
  level3: number;
}

export interface UserSummary {
  userId: string;
  discourseUsername: string;
  avatarUrl?: string | null;
  grade: number;
  xp: number;
  flightTimeMinutes: number;
  flightTimeHours: number;
  landingCount: number;
  onlineFlights: number;
  atcOperations: number;
  atcRank: number;
  violations: number;
  violationCountByLevel: ViolationCountByLevel;
  virtualOrganization: string | null;
  roles: number[];
}

export interface RuleDefinition {
  name: string;
  property: string;
  operator: number;
  period: number;
  order: number;
  group: number;
}

export interface GradeRule {
  ruleIndex: number;
  referenceValue: number;
  userValue: number;
  state: number; // 0 = fail, 1 = pass
  userValueString: string;
  referenceValueString: string;
  definition: RuleDefinition;
}

export interface GradeInfo {
  index: number;
  name: string;
  state: number; // 0 = not achieved, 1 = achieved
  rules: GradeRule[];
}

export interface GradeData {
  gradeIndex: number;
  grades: GradeInfo[];
  ruleDefinitions: RuleDefinition[];
  lastLevel1ViolationDate: string | null;
  lastLevel2ViolationDate: string | null;
  lastLevel3ViolationDate: string | null;
  lastReportViolationDate: string | null;
}

export interface LandingStat {
  timestamp: string;
  maxGForce: number;
  groundSpeed: number;
  indicatedAirspeed: number;
  latitude: number;
  longitude: number;
  centerlineDistance: number;
  verticalSpeed: number;
  distanceFrom1kftMarker: number;
  groundRollDistance: number;
  timeSinceLastLanding: number;
}

export interface FlightItem {
  id: string;
  created: string;
  callsign: string;
  server: string;
  originAirport: string;
  destinationAirport: string;
  flightTimeMinutes: number;
  landingCount: number;
  fuelUsedKg: number;
  dayTime: number;
  nightTime: number;
  xp: number;
  aircraftId: string;
  aircraftName: string;
  liveryId: string;
  liveryName: string;
  landingStats: LandingStat[];
  violations?: any[];
}

export interface AtcSessionItem {
  id: string;
  atcSessionGroupId?: string | null;
  airportIcao: string;
  frequencyType: number;
  facilityTypeName: string;
  operations: number;
  durationMinutes: number;
  violationsIssued: number;
  server: string;
  created: string;
  updated: string;
}

export interface LiveFlightStatus {
  isOnline: boolean;
  serverName?: string;
  callsign?: string;
  aircraftName?: string;
  liveryName?: string;
  altitude?: number;
  speed?: number;
  verticalSpeed?: number;
  heading?: number;
  latitude?: number;
  longitude?: number;
  flightState?: "airborne" | "ground";
}

export interface LiveAtcStatus {
  isControlling: boolean;
  serverName?: string;
  airportName?: string | null;
  facilityType?: number;
  facilityName?: string;
  startTime?: string;
  durationMinutes?: number;
}

export interface FullUserPayload {
  fromCache?: boolean;
  user: UserSummary;
  gradeData: GradeData | null;
  flights: {
    totalCount: number;
    totalPages: number;
    pageIndex: number;
    data: FlightItem[];
  };
  atc: {
    totalCount: number;
    totalPages: number;
    pageIndex: number;
    data: AtcSessionItem[];
  };
  liveStatus: LiveFlightStatus;
  liveAtcStatus?: LiveAtcStatus;
}

export interface DiscoverySummary {
  usernameChecked: string;
  resolvedUserId: string | null;
  verifiedFields: {
    profileHeader: string[];
    gradeDetails: string[];
    flightRecords: string[];
    atcSessions: string[];
  };
  notInAPIOrMissing: string[];
}

export interface DebugResponse {
  success: boolean;
  totalDurationMs: number;
  discoverySummary: DiscoverySummary;
  rawResponses: Record<string, any>;
  message?: string;
}

export function getIfatcRankName(rank: number): string {
  switch (rank) {
    case 0:
      return "Observer";
    case 1:
      return "ATC Trainee";
    case 2:
      return "ATC Apprentice";
    case 3:
      return "ATC Specialist";
    case 4:
      return "ATC Officer";
    case 5:
      return "ATC Supervisor";
    case 6:
      return "ATC Recruiter";
    case 7:
      return "ATC Manager";
    default:
      return rank > 7 ? `ATC Rank (${rank})` : "Observer";
  }
}

export interface UserRoleInfo {
  id: number;
  name: string;
  badgeClass: string;
  dotClass: string;
  type: "staff" | "mod" | "ifatc" | "other";
}

export function getUserRoleInfo(roleId: number): UserRoleInfo {
  switch (roleId) {
    case 1:
      return {
        id: 1,
        name: "Infinite Flight Staff",
        badgeClass: "bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30",
        dotClass: "bg-blue-500",
        type: "staff",
      };
    case 2:
      return {
        id: 2,
        name: "Moderator",
        badgeClass: "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30",
        dotClass: "bg-purple-500",
        type: "mod",
      };
    case 64:
      return {
        id: 64,
        name: "IFATC Member",
        badgeClass: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        dotClass: "bg-emerald-500",
        type: "ifatc",
      };
    default:
      return {
        id: roleId,
        name: `Role #${roleId}`,
        badgeClass: "bg-slate-500/10 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/30",
        dotClass: "bg-slate-500",
        type: "other",
      };
  }
}

export function getUserRolesList(roles: number[] = []): UserRoleInfo[] {
  if (!Array.isArray(roles)) return [];
  const allowedRoles = [1, 2, 64];
  const validRoles = roles.filter((r) => allowedRoles.includes(r));
  if (validRoles.length === 0) return [];
  validRoles.sort((a, b) => a - b);
  return [getUserRoleInfo(validRoles[0])];
}

export interface ServerItem {
  id: string;
  name: string;
  userCount: number;
  maxUsers: number;
  minimumGradeLevel: number;
  type: number;
  worldType: number;
  atcCount: number;
}

export interface AirportController {
  username: string;
  userId: string;
  frequencyType: number;
  facilityName: string;
  startTime: string;
  serverName?: string;
}

export interface ControlledAirport {
  icao: string;
  controllers: AirportController[];
}

export interface AirportTrafficFlight {
  flightId: string;
  userId: string;
  username: string;
  callsign: string;
  aircraftName: string;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  track: number;
}

export interface AirportAtisDetails {
  letter: string | null;
  time: string | null;
  wind: string | null;
  visibility: string | null;
  temperature: string | null;
  dewPoint: string | null;
  altimeter: string | null;
  landingRunways: string | null;
  departingRunways: string | null;
  remarks: string | null;
}

export interface AirportDetailsData {
  icao: string;
  airportName: string;
  serverName: string;
  atis: string | null;
  atisDetails: AirportAtisDetails | null;
  inboundCount: number;
  outboundCount: number;
  inbounds: AirportTrafficFlight[];
  outbounds: AirportTrafficFlight[];
  atcFacilities: AirportController[];
  updatedAt: string;
}

export interface TopAircraftItem {
  name: string;
  count: number;
  percentage: number;
}

export interface ServerHistoryPoint {
  timestamp: number;
  timeLabel: string;
  expert: number;
  training: number;
  casual: number;
  total: number;
  atcCount: number;
}

export interface WeeklyHistoryPoint {
  dateLabel: string;
  peakPlayers: number;
  avgPlayers: number;
  flightsEstimated: number;
}

export interface ServerAnalyticsData {
  servers: ServerItem[];
  totalActivePlayers: number;
  totalAtcCount: number;
  airborneCount: number;
  groundCount: number;
  totalFlightsTracked: number;
  avgSpeedKnots: number;
  avgAltitudeFeet: number;
  controlledAirports: ControlledAirport[];
  topAircraft: TopAircraftItem[];
  history24h: ServerHistoryPoint[];
  history7d: ServerHistoryPoint[];
  history30d: ServerHistoryPoint[];
  history1y: ServerHistoryPoint[];
  peakHourUtc: number;
  peakUserCount24h: number;
  minUserCount24h: number;
  updatedAt: string;
}

