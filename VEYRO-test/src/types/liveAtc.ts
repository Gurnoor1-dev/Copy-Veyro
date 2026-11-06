export interface LiveAirportATC {
  frequencyId: string;
  userId: string;
  username: string;
  discourseUsername?: string;
  virtualOrganization?: string | null;
  airportName: string; // ICAO
  type: number; // 0=Ground, 1=Tower, 2=Unicom, 3=Clearance, 4=Approach, 5=Departure, 6=Center, 7=ATIS
  typeName: string;
  startTime: string; // ISO / UTC string
  durationMinutes: number;
  controllerGrade?: number;
  controllerAtcOperations?: number;
}

export interface LiveAirportTrafficFlight {
  flightId: string;
  userId: string;
  username: string;
  callsign: string;
  aircraftName?: string;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  heading: number;
  track?: number;
  distanceNm?: number;
  direction?: string;
}

export interface AirportRunwayInfo {
  ident: string;
  lengthFt?: number;
  widthFt?: number;
  surface?: string;
  heading?: number;
  ils?: boolean;
}

export interface LiveAirportData {
  icao: string;
  iata?: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  elevation?: number;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  server: string;
  serverId: string;
  has3dBuildings?: boolean;
  hasJetbridges?: boolean;
  hasTaxiwayRouting?: boolean;

  // Status & Traffic
  inboundCount: number;
  outboundCount: number;
  totalTraffic: number;
  inboundFlights: LiveAirportTrafficFlight[];
  outboundFlights: LiveAirportTrafficFlight[];

  // ATIS
  atis: {
    raw: string | null;
    code?: string;
    wind?: string;
    visibility?: string;
    temperature?: string;
    dewPoint?: string;
    altimeter?: string;
    landingRunways?: string[];
    departingRunways?: string[];
    remarks?: string;
    timeZulu?: string;
  } | null;

  // Controllers Online
  controllers: LiveAirportATC[];

  // Runways
  runways: AirportRunwayInfo[];
}

export interface LiveAtcSummaryAirport {
  icao: string;
  iata?: string;
  name: string;
  city?: string;
  country?: string;
  activePositions: string[];
  controllerCount: number;
  inboundCount: number;
  outboundCount: number;
  hasAtis: boolean;
  atisCode?: string;
  server: string;
}

export interface LiveAtcOverviewResponse {
  server: string;
  serverId: string;
  servers: { id: string; name: string }[];
  updatedAt: string;
  activeAirportsCount: number;
  totalControllersOnline: number;
  airports: LiveAtcSummaryAirport[];
}
