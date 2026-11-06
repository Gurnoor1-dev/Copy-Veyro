export interface RunwayThreshold {
  id: string; // e.g. "28R"
  heading: number; // magnetic heading, e.g. 284
  trueHeading: number;
  lengthFt: number;
  widthFt: number;
  elevationFt: number;
  hasIls: boolean;
  ilsFrequency?: string;
  ilsCourse?: number;
  lat: number;
  lon: number;
  displacedThresholdFt?: number;
  glideslopeAngle?: number; // default 3.0
}

export interface NavFix {
  id: string; // e.g. "LAM", "BIG", "HON"
  name: string;
  type: "FIX" | "VOR" | "NDB" | "WAYPOINT";
  lat: number;
  lon: number;
  frequency?: string;
  elevationFt?: number;
}

export interface MsaSector {
  id: string;
  fromRadial: number; // magnetic bearing from airport/navaid
  toRadial: number;
  radiusNm: number; // usually 25 NM
  minAltitudeFt: number; // e.g. 2500, 3500, 5200
  label: string; // e.g. "090° - 180° / 25NM"
}

export interface TerrainContour {
  elevationFt: number;
  color: string;
  // approximate polygon coordinates [lat, lon][]
  polygon: [number, number][];
}

export interface StarRoute {
  id: string;
  name: string; // e.g. "LOGAN 2A", "BIG 1E"
  runwayId?: string;
  waypoints: {
    fixId: string;
    name: string;
    lat: number;
    lon: number;
    altitudeRestriction?: string; // e.g. "FL080+", "5000A"
    speedRestriction?: string; // e.g. "220K"
  }[];
}

export interface AirportApproachData {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  elevationFt: number;
  lat: number;
  lon: number;
  magVar: number; // variation, e.g. -1.5 for W
  runways: RunwayThreshold[];
  fixes: NavFix[];
  msaSectors: MsaSector[];
  terrainContours: TerrainContour[];
  stars: StarRoute[];
}

export interface HoldingPattern {
  id: string;
  name: string;
  fixId: string;
  fixName: string;
  lat: number;
  lon: number;
  inboundTrack: number; // degrees magnetic
  turnDirection: "left" | "right";
  legLengthNm: number; // e.g. 4.0 NM (or 1.0 min)
  minAltitudeFt: number;
  maxAltitudeFt: number;
  speedKts: number; // e.g. 210
  notes?: string;
}

export interface VectorPoint {
  id: string;
  lat: number;
  lon: number;
  sequence: number;
  altitudeFt?: number;
  altitudeMode?: "at" | "at_or_above" | "at_or_below" | "window";
  speedKts?: number;
  heading?: number; // assigned heading if vectoring
  pointType: "entry" | "downwind" | "base" | "intercept" | "cleared_approach" | "missed" | "holding" | "general";
  instructionNote?: string; // e.g. "Turn right heading 250, descend 4000, 210kts"
  clearanceNote?: string; // e.g. "Cleared ILS Rwy 28R approach"
}

export interface ApproachRoutePlan {
  id: string;
  name: string; // e.g. "North Arrivals (via BNN / CHT)", "South Arrivals (via BIG)"
  color: string;
  arrivalDirection: "North" | "South" | "East" | "West" | "Omni";
  entryFixId?: string;
  initialAltitudeFt: number;
  downwindAltitudeFt: number;
  baseAltitudeFt: number;
  finalAltitudeFt: number;
  interceptAngleDeg: number; // e.g. 30 deg
  waypoints: VectorPoint[];
  isActive: boolean;
  notes: string;
}

export interface CompleteApproachPlan {
  id: string;
  airportIcao: string;
  title: string;
  activeRunwayId: string;
  windHeading: number;
  windSpeedKts: number;
  transitionLevel: string; // e.g. "FL070"
  transitionAltitude: number; // e.g. 6000
  initialAltitudeFt: number;
  downwindAltitudeFt: number;
  baseAltitudeFt: number;
  finalAltitudeFt: number;
  maxVectorDeviationDeg: number; // default 30 (e.g. max 30 deg intercept to localizer)
  routes: ApproachRoutePlan[];
  holds: HoldingPattern[];
  globalNotes: string;
  safetyChecklist: {
    terrainMsaChecked: boolean;
    interceptAngleChecked: boolean;
    descentGradientsChecked: boolean;
    speedSequenceChecked: boolean;
    goAroundPlanned: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
