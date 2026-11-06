import { CompleteApproachPlan } from "../types/approachPlan";

export const DEFAULT_EGLL_PLAN: CompleteApproachPlan = {
  id: "plan-egll-default",
  airportIcao: "EGLL",
  title: "EGLL Westherly Ops - Rwy 27R Single/Dual Approach",
  activeRunwayId: "27R",
  windHeading: 260,
  windSpeedKts: 12,
  transitionLevel: "FL070",
  transitionAltitude: 6000,
  initialAltitudeFt: 7000,
  downwindAltitudeFt: 5000,
  baseAltitudeFt: 4000,
  finalAltitudeFt: 3000,
  maxVectorDeviationDeg: 30, // 30° max intercept
  safetyChecklist: {
    terrainMsaChecked: true,
    interceptAngleChecked: true,
    descentGradientsChecked: true,
    speedSequenceChecked: true,
    goAroundPlanned: true,
  },
  globalNotes: "Hold Lambourne/Biggin if queue exceeds 4 aircraft. Maintain 210kt downwind, 180kt base, 160kt to 4 DME. Intercept glideslope at or below 3,000 ft at 30° maximum angle (heading 240° or 300°).",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  holds: [
    {
      id: "hold-lam",
      name: "Lambourne (LAM)",
      fixId: "LAM",
      fixName: "Lambourne VOR (115.60)",
      lat: 51.6450,
      lon: 0.1511,
      inboundTrack: 271,
      turnDirection: "right",
      legLengthNm: 4.0,
      minAltitudeFt: 7000,
      maxAltitudeFt: 14000,
      speedKts: 220,
      notes: "Standard stack hold for North/East arrivals. Release on vector hdg 240°."
    },
    {
      id: "hold-big",
      name: "Biggin (BIG)",
      fixId: "BIG",
      fixName: "Biggin VOR (115.10)",
      lat: 51.3308,
      lon: 0.0328,
      inboundTrack: 305,
      turnDirection: "left",
      legLengthNm: 4.0,
      minAltitudeFt: 7000,
      maxAltitudeFt: 14000,
      speedKts: 220,
      notes: "Standard stack hold for South arrivals. Release on vector hdg 320°."
    }
  ],
  routes: [
    {
      id: "route-north",
      name: "North Inbound Sequence (LAM / BNN)",
      color: "#3b82f6", // Blue
      arrivalDirection: "North",
      entryFixId: "LAM",
      initialAltitudeFt: 7000,
      downwindAltitudeFt: 5000,
      baseAltitudeFt: 4000,
      finalAltitudeFt: 3000,
      interceptAngleDeg: 30,
      isActive: true,
      notes: "Vector out of LAM on heading 240, descend 5000 ft, speed 210 kts. Turn base leg hdg 180 descending 4000 ft.",
      waypoints: [
        {
          id: "pt-n1",
          sequence: 1,
          lat: 51.6450,
          lon: 0.1511,
          altitudeFt: 7000,
          altitudeMode: "at",
          speedKts: 220,
          heading: 240,
          pointType: "entry",
          instructionNote: "Leave LAM heading 240, descend 6000 ft, 220 kts."
        },
        {
          id: "pt-n2",
          sequence: 2,
          lat: 51.5800,
          lon: -0.0500,
          altitudeFt: 5000,
          altitudeMode: "at",
          speedKts: 210,
          heading: 240,
          pointType: "downwind",
          instructionNote: "Continue downwind heading 240, descend 5000 ft, reduce 210 kts."
        },
        {
          id: "pt-n3",
          sequence: 3,
          lat: 51.5600,
          lon: -0.1500,
          altitudeFt: 4000,
          altitudeMode: "at",
          speedKts: 180,
          heading: 180,
          pointType: "base",
          instructionNote: "Turn left base heading 180, descend 4000 ft, reduce 180 kts."
        },
        {
          id: "pt-n4",
          sequence: 4,
          lat: 51.5150,
          lon: -0.2100,
          altitudeFt: 3000,
          altitudeMode: "at",
          speedKts: 170,
          heading: 240,
          pointType: "intercept",
          instructionNote: "Turn right heading 240 to intercept localizer. Closing angle 30°."
        },
        {
          id: "pt-n5",
          sequence: 5,
          lat: 51.4775,
          lon: -0.2100,
          altitudeFt: 3000,
          altitudeMode: "at",
          speedKts: 160,
          heading: 271,
          pointType: "cleared_approach",
          clearanceNote: "Cleared ILS Runway 27R approach. Maintain 160kts to 4 DME."
        }
      ]
    },
    {
      id: "route-south",
      name: "South Inbound Sequence (BIG)",
      color: "#10b981", // Emerald
      arrivalDirection: "South",
      entryFixId: "BIG",
      initialAltitudeFt: 7000,
      downwindAltitudeFt: 5000,
      baseAltitudeFt: 4000,
      finalAltitudeFt: 3000,
      interceptAngleDeg: 30,
      isActive: true,
      notes: "Vector out of BIG on heading 310, descend 5000 ft, speed 210 kts. Turn right base heading 360, descend 4000 ft. Closing heading 300°.",
      waypoints: [
        {
          id: "pt-s1",
          sequence: 1,
          lat: 51.3308,
          lon: 0.0328,
          altitudeFt: 7000,
          altitudeMode: "at",
          speedKts: 220,
          heading: 310,
          pointType: "entry",
          instructionNote: "Leave BIG heading 310, descend 6000 ft, 220 kts."
        },
        {
          id: "pt-s2",
          sequence: 2,
          lat: 51.3800,
          lon: -0.0600,
          altitudeFt: 5000,
          altitudeMode: "at",
          speedKts: 210,
          heading: 310,
          pointType: "downwind",
          instructionNote: "Continue south downwind heading 310, descend 5000 ft, reduce 210 kts."
        },
        {
          id: "pt-s3",
          sequence: 3,
          lat: 51.4100,
          lon: -0.1600,
          altitudeFt: 4000,
          altitudeMode: "at",
          speedKts: 180,
          heading: 360,
          pointType: "base",
          instructionNote: "Turn right base heading 360, descend 4000 ft, reduce 180 kts."
        },
        {
          id: "pt-s4",
          sequence: 4,
          lat: 51.4400,
          lon: -0.2100,
          altitudeFt: 3000,
          altitudeMode: "at",
          speedKts: 170,
          heading: 300,
          pointType: "intercept",
          instructionNote: "Turn left heading 300 to intercept localizer. Closing angle 29°."
        },
        {
          id: "pt-s5",
          sequence: 5,
          lat: 51.4650,
          lon: -0.2100,
          altitudeFt: 3000,
          altitudeMode: "at",
          speedKts: 160,
          heading: 271,
          pointType: "cleared_approach",
          clearanceNote: "Cleared ILS Runway 27L approach. Maintain 160kts to 4 DME."
        }
      ]
    }
  ]
};

export const DEFAULT_KSFO_PLAN: CompleteApproachPlan = {
  id: "plan-ksfo-default",
  airportIcao: "KSFO",
  title: "KSFO West Flow - Dual ILS/Visual 28L/28R Sequence",
  activeRunwayId: "28R",
  windHeading: 290,
  windSpeedKts: 16,
  transitionLevel: "FL180",
  transitionAltitude: 18000,
  initialAltitudeFt: 8000,
  downwindAltitudeFt: 6000,
  baseAltitudeFt: 4000,
  finalAltitudeFt: 3100,
  maxVectorDeviationDeg: 30,
  safetyChecklist: {
    terrainMsaChecked: true,
    interceptAngleChecked: true,
    descentGradientsChecked: true,
    speedSequenceChecked: true,
    goAroundPlanned: true,
  },
  globalNotes: "Watch Montara mountain (1900 ft SW) and San Bruno ridge (1314 ft N). Stay over bay waters when descending below 4,000 ft. Downwind east of San Mateo bridge at 6,000 ft.",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  holds: [
    {
      id: "hold-duddu",
      name: "Point Reyes (DUDDU)",
      fixId: "DUDDU",
      fixName: "DUDDU Fix",
      lat: 38.0800,
      lon: -122.8700,
      inboundTrack: 140,
      turnDirection: "right",
      legLengthNm: 5.0,
      minAltitudeFt: 10000,
      maxAltitudeFt: 16000,
      speedKts: 230,
      notes: "Primary holding fix for North Pacific & domestic northwest stream."
    },
    {
      id: "hold-archi",
      name: "ARCHI Stack",
      fixId: "ARCHI",
      fixName: "ARCHI Fix",
      lat: 37.5230,
      lon: -122.1850,
      inboundTrack: 284,
      turnDirection: "left",
      legLengthNm: 4.0,
      minAltitudeFt: 5000,
      maxAltitudeFt: 9000,
      speedKts: 210,
      notes: "Bay hold prior to final intercept. Watch Oakland departure traffic."
    }
  ],
  routes: [
    {
      id: "route-bdega",
      name: "North Stream via BODEGA / BRIXX",
      color: "#f59e0b", // Amber
      arrivalDirection: "North",
      entryFixId: "BRIXX",
      initialAltitudeFt: 8000,
      downwindAltitudeFt: 6000,
      baseAltitudeFt: 4000,
      finalAltitudeFt: 3100,
      interceptAngleDeg: 30,
      isActive: true,
      notes: "Cross BRIXX at 7000, downwind east bay 6000 ft, vector across bay 150 heading to base.",
      waypoints: [
        {
          id: "sfo-pt1",
          sequence: 1,
          lat: 37.7410,
          lon: -122.0950,
          altitudeFt: 7000,
          altitudeMode: "at",
          speedKts: 210,
          heading: 140,
          pointType: "entry",
          instructionNote: "Cross BRIXX at 7000 ft, 210 kts."
        },
        {
          id: "sfo-pt2",
          sequence: 2,
          lat: 37.6000,
          lon: -122.0500,
          altitudeFt: 6000,
          altitudeMode: "at",
          speedKts: 200,
          heading: 140,
          pointType: "downwind",
          instructionNote: "Fly downwind heading 140, descend to 6000 ft."
        },
        {
          id: "sfo-pt3",
          sequence: 3,
          lat: 37.4700,
          lon: -122.1000,
          altitudeFt: 4000,
          altitudeMode: "at",
          speedKts: 180,
          heading: 230,
          pointType: "base",
          instructionNote: "Turn right base heading 230, descend to 4000 ft, reduce 180 kts."
        },
        {
          id: "sfo-pt4",
          sequence: 4,
          lat: 37.5200,
          lon: -122.1800,
          altitudeFt: 3100,
          altitudeMode: "at",
          speedKts: 170,
          heading: 255,
          pointType: "intercept",
          instructionNote: "Turn right heading 255 to intercept 28R localizer (29° angle)."
        },
        {
          id: "sfo-pt5",
          sequence: 5,
          lat: 37.5680,
          lon: -122.2530,
          altitudeFt: 3100,
          altitudeMode: "at",
          speedKts: 160,
          heading: 284,
          pointType: "cleared_approach",
          clearanceNote: "Cleared ILS Runway 28R approach. Maintain 160 kts to AXMUL."
        }
      ]
    }
  ]
};
