/**
 * Infinite Flight PublicApi v3 OAuth Preview Types & Enums
 * Grounded in official documentation:
 * https://infiniteflight.com/guide/developer-reference/live-api/v3-oauth-live-preview
 */

export enum PersistentOrganizationType {
  AutoJoin = 0,
  ManualJoin = 1,
  ApplyToJoin = 2,
  InviteOnly = 3,
  SingleMember = 4,
}

export enum PersistentOrganizationMemberRole {
  Member = 0,
  Admin = 1,
  Owner = 2,
}

export enum OrganizationOperationType {
  Undefined = 0,
  Airline = 1,
  Charter = 2,
  Freight = 3,
  Military = 4,
  FlightSchool = 5,
  Private = 6,
}

export enum WorldType {
  Solo = 0,
  Casual = 1,
  Training = 2,
  Expert = 3,
  Private = 4,
}

export enum PersistentOrganizationRecordStatus {
  Active = 0,
  Suspended = 1,
  Deleted = 2,
}

export enum PersistentAircraftRecordStatus {
  Active = 0,
  Deleted = 1,
}

export enum PersistentAircraftVisibility {
  Unknown = 0,
  Visible = 1,
  Hangared = 2,
}

export enum AircraftPersistenceState {
  Unknown = 0,
  OnGround = 1,
  InFlight = 2,
  Cancelled = 3,
  Stopped = 4,
  Maintenance = 5,
}

export enum AircraftFlightStatus {
  Active = 0,
  Completed = 1,
  Cancelled = 2,
}

export enum ScheduledFlightStatus {
  Unknown = 0,
  Scheduled = 1,
  Boarding = 2,
  Boarded = 3,
  TaxiingToRunway = 4,
  InFlight = 6,
  Diverted = 7,
  Delayed = 8,
  Cancelled = 9,
  TaxiingToParking = 10,
  Arrived = 11,
}

export enum PersistentFlightType {
  None = 0,
  Commercial = 1,
  Charter = 2,
  Cargo = 3,
  Training = 4,
  TestFlight = 5,
  MedicalEmergency = 6,
  Military = 7,
  VIPExecutive = 8,
  HumanitarianRelief = 9,
  GeneralAviation = 10,
  Airshow = 11,
  Other = 12,
}

export enum PersistentFlightCrewMemberRole {
  Captain = 0,
  FirstOfficer = 1,
}

export interface Organization {
  id: string; // uuid
  name: string;
  type: PersistentOrganizationType;
  operationType: OrganizationOperationType;
  worldType: WorldType;
  status: PersistentOrganizationRecordStatus;
  description: string | null;
  role: PersistentOrganizationMemberRole;
  logoUrl?: string;
  memberCount?: number;
  aircraftCount?: number;
  openSchedulesCount?: number;
}

export interface OrganizationMember {
  userId: string; // uuid
  username: string | null;
  role: PersistentOrganizationMemberRole;
  joinedAt: string; // ISO date-time
  activeLifts: number;
  avatarUrl?: string;
}

export interface Aircraft {
  id: string; // Persistent organization aircraft ID
  aircraftId: string; // Infinite Flight aircraft or livery content identifier
  organizationId: string;
  registration: string;
  status: PersistentAircraftRecordStatus;
  visibility: PersistentAircraftVisibility;
  fleetPriority: number | null;
  fleetRank: number;
  isFleetActiveSlot: boolean;
  createdAt: string; // ISO date-time
  modelName?: string;
  liveryName?: string;
}

export interface AircraftPosition {
  id: string;
  state: AircraftPersistenceState;
  isOnGround: boolean;
  latitude: number;
  longitude: number;
  altitude: number; // feet
  heading: number; // 0-360
  speed: number; // knots
  verticalSpeed: number; // fpm
  lastPilotId: string | null;
  lastPilotUsername: string | null;
  updatedAt: string; // ISO date-time
}

export interface AircraftFlightCrewMember {
  userId: string;
  username: string | null;
}

export interface PilotFlightTime {
  userId: string;
  username: string | null;
  flightTimeSeconds: number;
  startSeconds: number;
  endSeconds: number | null;
}

export interface AircraftFlight {
  id: string;
  aircraftId: string;
  organizationId: string;
  callsign: string;
  originIcao: string | null;
  destinationIcao: string | null;
  actualDepartureUtc: string | null;
  actualArrivalUtc: string | null;
  status: AircraftFlightStatus;
  flightTimeMinutes: number;
  airframeTimeMinutes: number;
  crew: AircraftFlightCrewMember[];
  pilotFlightTimes: PilotFlightTime[];
}

export interface ScheduleCrewMember {
  userId: string;
  username: string | null;
  role: PersistentFlightCrewMemberRole;
}

export interface Schedule {
  id: string;
  status: ScheduledFlightStatus;
  callsign: string;
  organizationId: string;
  aircraftId: string;
  flightType: PersistentFlightType;
  originIcao: string;
  destinationIcao: string;
  isTimeless: boolean;
  scheduledDepartureUtc: string;
  scheduledArrivalUtc: string;
  actualDepartureUtc: string | null;
  actualArrivalUtc: string | null;
  briefing: string | null;
  debriefing: string | null;
  flightPlan: string | null;
  crew: ScheduleCrewMember[];
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
