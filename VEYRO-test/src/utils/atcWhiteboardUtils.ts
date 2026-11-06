// Helper functions for Approach Controller Whiteboard math and geometry

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RunwayApproachCone {
  runwayId: string;
  heading: number; // 0-360
  threshold: GeoPoint;
  conePolygon: [number, number][]; // lat, lng coordinates
  centerline: [number, number][];
}

export interface WhiteboardFix {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  altitude?: string;
  speed?: string;
  color?: string;
  isRunwayEnd?: boolean;
  runwayId?: string;
}

/**
 * Formats altitude according to aviation rules:
 * - Below FL100 (10,000 ft): standard 500 ft intervals or exact ft (e.g. 3000 -> 3000 ft, 4500 -> 4500 ft)
 * - FL100 (10,000 ft) and above: FL format (e.g. FL100, FL110, FL120). 500-ft intervals above FL100 are strictly removed / rounded to whole 1,000-ft intervals (e.g. FL105 -> FL110, 10500 -> FL110, 11500 -> FL120, 12500 -> FL130).
 */
export function formatAltitude(val?: string): string {
  if (!val) return "";
  const cleaned = val.trim();
  if (!cleaned) return "";

  // Check if starts with FL or fl
  const flMatch = cleaned.match(/^FL\s*(\d+(?:\.\d+)?)/i);
  if (flMatch) {
    let flNum = Math.round(parseFloat(flMatch[1]));
    // Remove 500 intervals above FL100 (e.g. FL105 -> FL110, FL115 -> FL120)
    if (flNum >= 100 && flNum % 10 !== 0) {
      flNum = Math.round(flNum / 10) * 10;
    }
    const padded = flNum < 100 ? String(flNum).padStart(3, "0") : String(flNum);
    return `FL${padded}`;
  }

  // Handle decimal representation like 10.5 (meaning FL105 -> FL110) or 5.5 (5500 ft)
  if (/^\d+\.\d+$/.test(cleaned)) {
    const floatVal = parseFloat(cleaned);
    if (floatVal >= 10) {
      let flNum = Math.round(floatVal * 10);
      if (flNum >= 100 && flNum % 10 !== 0) {
        flNum = Math.round(flNum / 10) * 10;
      }
      return `FL${flNum}`;
    }
  }

  // Extract digits (handles commas e.g. 10,500)
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) return cleaned;

  const num = parseInt(digitsOnly, 10);
  if (digitsOnly.length === 3) {
    // 3 digits: e.g. 080 -> FL080, 100 -> FL100, 105 -> FL110, 115 -> FL120
    let flNum = num;
    if (flNum >= 100 && flNum % 10 !== 0) {
      flNum = Math.round(flNum / 10) * 10;
    }
    const padded = flNum < 100 ? String(flNum).padStart(3, "0") : String(flNum);
    return `FL${padded}`;
  } else if (digitsOnly.length >= 4) {
    let altNum = num;
    if (altNum >= 10000) {
      // Above FL100 (10,000 ft+): remove 500 intervals (strictly round to whole 1,000s)
      if (altNum % 1000 !== 0) {
        altNum = Math.round(altNum / 1000) * 1000;
      }
      return `FL${altNum / 100}`;
    }
    if (/ft$/i.test(cleaned)) return cleaned;
    return `${altNum} ft`;
  }
  return cleaned;
}

/**
 * Formats speed according to aviation rules:
 * - Adds "kts" standard after a speed (e.g. 210 -> 210 kts, 180K -> 180 kts)
 */
export function formatSpeed(val?: string): string {
  if (!val) return "";
  const cleaned = val.trim();
  if (!cleaned) return "";
  if (/kts?$/i.test(cleaned)) {
    return cleaned;
  }
  const stripped = cleaned.replace(/k$/i, "").trim();
  return `${stripped} kts`;
}

export interface WhiteboardLine {
  id: string;
  fromFixId: string;
  toFixId: string;
  color: string;
}

export interface WhiteboardHold {
  id: string;
  fixLat: number;
  fixLng: number;
  inboundHeading: number; // 0-360
  turnDirection: "right" | "left";
  legLengthNm: number; // e.g. 4 NM
  turnRadiusNm: number; // e.g. 0.85 NM (width is 2 * turnRadiusNm)
  altitude?: string;
  speed?: string;
}

export interface TerrainRestriction {
  id: string;
  points: [number, number][]; // lat, lng polygon vertices
}

/**
 * Calculates a destination point given a start point, bearing (deg), and distance (NM).
 */
export function destinationPoint(start: GeoPoint, bearingDeg: number, distanceNm: number): GeoPoint {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const deg = (radVal: number) => (radVal * 180) / Math.PI;

  const lat1 = rad(start.lat);
  const lon1 = rad(start.lng);
  const brng = rad(bearingDeg);

  // Earth radius in Nautical Miles
  const R = 3440.065;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceNm / R) + Math.cos(lat1) * Math.sin(distanceNm / R) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distanceNm / R) * Math.cos(lat1), Math.cos(distanceNm / R) - Math.sin(lat1) * Math.sin(lat2));

  return {
    lat: deg(lat2),
    lng: deg(lon2),
  };
}

/**
 * Calculates initial bearing in degrees (0-360) from point 1 to point 2.
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return Math.round(((theta * 180) / Math.PI + 360) % 360);
}

/**
 * Computes the distance in Nautical Miles between two coordinates.
 */
export function distanceNm(p1: GeoPoint, p2: GeoPoint): number {
  const R = 3440.065;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(p2.lat - p1.lat);
  const dLon = rad(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(p1.lat)) * Math.cos(rad(p2.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes initial bearing between two coordinates (0-360°).
 */
export function initialBearing(p1: GeoPoint, p2: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(rad(p2.lng - p1.lng)) * Math.cos(rad(p2.lat));
  const x = Math.cos(rad(p1.lat)) * Math.sin(rad(p2.lat)) - Math.sin(rad(p1.lat)) * Math.cos(rad(p2.lat)) * Math.cos(rad(p2.lng - p1.lng));
  const brng = (deg(Math.atan2(y, x)) + 360) % 360;
  return Math.round(brng);
}

/**
 * Snaps a bearing (0-360°) to the nearest 10-degree heading multiple (e.g. 010°, 020°, 090°, 180°, 270°, 360°).
 */
export function snapHeadingTo10(bearingDeg: number): number {
  let rounded = Math.round(bearingDeg / 10) * 10;
  rounded = ((rounded % 360) + 360) % 360;
  return rounded === 0 ? 360 : rounded;
}

/**
 * Computes a simple, subtle approach cone for a runway (clean, red, less visible, without 30 degree clutter).
 */
export function generateRunwayApproachCone(
  runwayId: string,
  threshold: GeoPoint,
  headingDeg: number,
  coneLengthNm = 10,
  coneAngleDeg = 3.5
): RunwayApproachCone {
  const reciprocalHeading = (headingDeg + 180) % 360;

  // Far center point
  const farCenter = destinationPoint(threshold, reciprocalHeading, coneLengthNm);

  // Left and Right far cone edges
  const leftEdge = destinationPoint(threshold, (reciprocalHeading - coneAngleDeg + 360) % 360, coneLengthNm);
  const rightEdge = destinationPoint(threshold, (reciprocalHeading + coneAngleDeg) % 360, coneLengthNm);

  const conePolygon: [number, number][] = [
    [threshold.lat, threshold.lng],
    [leftEdge.lat, leftEdge.lng],
    [farCenter.lat, farCenter.lng],
    [rightEdge.lat, rightEdge.lng],
    [threshold.lat, threshold.lng],
  ];

  const centerline: [number, number][] = [
    [threshold.lat, threshold.lng],
    [farCenter.lat, farCenter.lng],
  ];

  return {
    runwayId,
    heading: headingDeg,
    threshold,
    conePolygon,
    centerline,
  };
}

/**
 * Generates coordinate polyline for a holding racetrack pattern.
 */
export function generateHoldingPattern(
  fix: GeoPoint,
  inboundHeadingDeg: number,
  turnDirection: "right" | "left",
  legLengthNm = 4,
  turnRadiusNm = 0.85
): [number, number][] {
  const points: [number, number][] = [];
  const turnSign = turnDirection === "right" ? 1 : -1;

  // Fix is the point where the inbound leg ends
  // Turn 1 center
  const turn1CenterBearing = (inboundHeadingDeg + turnSign * 90 + 360) % 360;
  const turn1Center = destinationPoint(fix, turn1CenterBearing, turnRadiusNm);

  // Turn 1 (180 deg arc)
  const steps = 14;
  const startAngle = (turn1CenterBearing + 180) % 360;
  for (let i = 0; i <= steps; i++) {
    const angle = (startAngle + turnSign * (i / steps) * 180 + 360) % 360;
    const p = destinationPoint(turn1Center, angle, turnRadiusNm);
    points.push([p.lat, p.lng]);
  }

  // Outbound leg
  const outboundStart = points[points.length - 1];
  const outboundHeading = (inboundHeadingDeg + 180) % 360;
  const outboundEndGeo = destinationPoint(
    { lat: outboundStart[0], lng: outboundStart[1] },
    outboundHeading,
    legLengthNm
  );
  points.push([outboundEndGeo.lat, outboundEndGeo.lng]);

  // Turn 2 center
  const turn2CenterBearing = (outboundHeading + turnSign * 90 + 360) % 360;
  const turn2Center = destinationPoint(outboundEndGeo, turn2CenterBearing, turnRadiusNm);

  // Turn 2 (180 deg arc)
  const startAngle2 = (turn2CenterBearing + 180) % 360;
  for (let i = 0; i <= steps; i++) {
    const angle = (startAngle2 + turnSign * (i / steps) * 180 + 360) % 360;
    const p = destinationPoint(turn2Center, angle, turnRadiusNm);
    points.push([p.lat, p.lng]);
  }

  // Close back to Fix
  points.push([fix.lat, fix.lng]);

  return points;
}

/**
 * Computes position of the Direction / Inbound Heading drag handle.
 */
export function getHoldDirectionHandle(hold: WhiteboardHold): GeoPoint {
  // 2.5 NM back along inbound course
  const oppHeading = (hold.inboundHeading + 180) % 360;
  return destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, oppHeading, 2.5);
}

/**
 * Computes position of the length drag handle for a hold (located at Turn 2 apex).
 */
export function getHoldLengthHandle(hold: WhiteboardHold): GeoPoint {
  const outboundHeading = (hold.inboundHeading + 180) % 360;
  const turnSign = hold.turnDirection === "right" ? 1 : -1;
  const perpBearing = (hold.inboundHeading + turnSign * 90 + 360) % 360;
  const centerLinePoint = destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, outboundHeading, hold.legLengthNm);
  return destinationPoint(centerLinePoint, perpBearing, hold.turnRadiusNm);
}

/**
 * Computes position of the width / size drag handle for a hold (located at the midpoint of the outbound straight leg).
 */
export function getHoldSizeHandle(hold: WhiteboardHold): GeoPoint {
  const legLen = hold.legLengthNm || 4;
  const radius = hold.turnRadiusNm || 0.85;
  const turnSign = hold.turnDirection === "right" ? 1 : -1;
  const outboundHeading = (hold.inboundHeading + 180) % 360;
  const turn1CenterBearing = (hold.inboundHeading + turnSign * 90 + 360) % 360;
  const outboundStart = destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, turn1CenterBearing, radius * 2);
  return destinationPoint(outboundStart, outboundHeading, legLen / 2);
}

export const getHoldWidthHandle = getHoldSizeHandle;

/**
 * Computes exact geometric center position of a holding pattern.
 */
export function getHoldCenterPoint(hold: WhiteboardHold): GeoPoint {
  const outboundHeading = (hold.inboundHeading + 180) % 360;
  const turnSign = hold.turnDirection === "right" ? 1 : -1;
  const perpBearing = (hold.inboundHeading + turnSign * 90 + 360) % 360;
  const midLegPoint = destinationPoint(
    { lat: hold.fixLat, lng: hold.fixLng },
    outboundHeading,
    (hold.legLengthNm || 4) / 2
  );
  return destinationPoint(midLegPoint, perpBearing, hold.turnRadiusNm || 0.85);
}

/**
 * Computes exact position of the far end apex (Turn 2 apex) of the hold,
 * which serves as the interactive resize and rotation grab handle.
 */
export function getHoldFarEndApex(hold: WhiteboardHold): GeoPoint {
  const legLen = hold.legLengthNm || 4;
  const radius = hold.turnRadiusNm || 0.85;
  const turnSign = hold.turnDirection === "right" ? 1 : -1;
  const outboundHeading = (hold.inboundHeading + 180) % 360;

  // Outbound start & end
  const turn1CenterBearing = (hold.inboundHeading + turnSign * 90 + 360) % 360;
  const outboundStart = destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, turn1CenterBearing, radius * 2);
  const outboundEnd = destinationPoint(outboundStart, outboundHeading, legLen);

  // Turn 2 center & apex
  const turn2CenterBearing = (outboundHeading + turnSign * 90 + 360) % 360;
  const turn2Center = destinationPoint(outboundEnd, turn2CenterBearing, radius);
  return destinationPoint(turn2Center, outboundHeading, radius);
}

/**
 * Returns directional arrow positions and headings along the holding pattern:
 * - Inbound straight leg (flying towards Fix at inboundHeading)
 * - Turn 1 arc (curving onto outbound course)
 * - Outbound straight leg (flying away from Fix at outboundHeading)
 * - Turn 2 arc (curving onto inbound course)
 */
export function getHoldArrowPoints(hold: WhiteboardHold): { point: GeoPoint; heading: number }[] {
  const legLen = hold.legLengthNm || 4;
  const radius = hold.turnRadiusNm || 0.85;
  const turnSign = hold.turnDirection === "right" ? 1 : -1;
  const outboundHeading = (hold.inboundHeading + 180) % 360;

  // Turn 1 center & apex (halfway through the 180° turn departing Fix)
  const turn1CenterBearing = (hold.inboundHeading + turnSign * 90 + 360) % 360;
  const turn1Center = destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, turn1CenterBearing, radius);
  const turn1Apex = destinationPoint(turn1Center, hold.inboundHeading, radius);
  const turn1TangentHeading = (hold.inboundHeading + turnSign * 90 + 360) % 360;

  // Inbound straight leg point: flies towards Fix (heading = inboundHeading)
  const inboundPt = destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, outboundHeading, legLen * 0.5);

  // Outbound straight leg point: flies away from Fix (heading = outboundHeading)
  const outboundStart = destinationPoint({ lat: hold.fixLat, lng: hold.fixLng }, turn1CenterBearing, radius * 2);
  const outboundPt = destinationPoint(outboundStart, outboundHeading, legLen * 0.5);
  const outboundEnd = destinationPoint(outboundStart, outboundHeading, legLen);

  // Turn 2 center & apex (halfway through the 180° turn returning to inbound leg)
  const turn2CenterBearing = (outboundHeading + turnSign * 90 + 360) % 360;
  const turn2Center = destinationPoint(outboundEnd, turn2CenterBearing, radius);
  const turn2Apex = destinationPoint(turn2Center, outboundHeading, radius);
  const turn2TangentHeading = (outboundHeading + turnSign * 90 + 360) % 360;

  return [
    { point: inboundPt, heading: hold.inboundHeading },
    { point: turn1Apex, heading: turn1TangentHeading },
    { point: outboundPt, heading: outboundHeading },
    { point: turn2Apex, heading: turn2TangentHeading },
  ];
}

/**
 * Computes polygon coordinates for a physical runway pavement strip outline.
 */
export function generateRunwayOutline(
  threshold: GeoPoint,
  headingDeg: number,
  lengthFt = 10000,
  widthFt = 150
): { polygon: [number, number][]; centerline: [number, number][]; farThreshold: GeoPoint } {
  const lengthNm = lengthFt / 6076.12;
  const halfWidthNm = widthFt / 2 / 6076.12;

  const rightBearing = (headingDeg + 90) % 360;
  const leftBearing = (headingDeg - 90 + 360) % 360;

  // Threshold left and right corners
  const p1 = destinationPoint(threshold, leftBearing, halfWidthNm);
  const p2 = destinationPoint(threshold, rightBearing, halfWidthNm);

  // Far end center and corners
  const farThreshold = destinationPoint(threshold, headingDeg, lengthNm);
  const p3 = destinationPoint(farThreshold, rightBearing, halfWidthNm);
  const p4 = destinationPoint(farThreshold, leftBearing, halfWidthNm);

  return {
    polygon: [
      [p1.lat, p1.lng],
      [p2.lat, p2.lng],
      [p3.lat, p3.lng],
      [p4.lat, p4.lng],
      [p1.lat, p1.lng],
    ],
    centerline: [
      [threshold.lat, threshold.lng],
      [farThreshold.lat, farThreshold.lng],
    ],
    farThreshold,
  };
}

/**
 * Traverses connected lines using BFS to find all lines belonging to the continuous route.
 */
export function getConnectedRouteLineIds(startLineId: string, lines: WhiteboardLine[]): string[] {
  const lineMap = new Map<string, WhiteboardLine>();
  lines.forEach((l) => lineMap.set(l.id, l));

  const startLine = lineMap.get(startLineId);
  if (!startLine) return [];

  // Build fix-to-lines adjacency map
  const fixToLineIds = new Map<string, string[]>();
  lines.forEach((l) => {
    if (!fixToLineIds.has(l.fromFixId)) fixToLineIds.set(l.fromFixId, []);
    if (!fixToLineIds.has(l.toFixId)) fixToLineIds.set(l.toFixId, []);
    fixToLineIds.get(l.fromFixId)!.push(l.id);
    fixToLineIds.get(l.toFixId)!.push(l.id);
  });

  const visitedLineIds = new Set<string>();
  const queue: string[] = [startLineId];
  visitedLineIds.add(startLineId);

  while (queue.length > 0) {
    const curId = queue.shift()!;
    const curLine = lineMap.get(curId);
    if (!curLine) continue;

    // Check neighbors connected via fromFixId or toFixId
    const adjacentFixes = [curLine.fromFixId, curLine.toFixId];
    for (const fixId of adjacentFixes) {
      const neighborLines = fixToLineIds.get(fixId) || [];
      for (const nLineId of neighborLines) {
        if (!visitedLineIds.has(nLineId)) {
          visitedLineIds.add(nLineId);
          queue.push(nLineId);
        }
      }
    }
  }

  return Array.from(visitedLineIds);
}

/**
 * Finds fix IDs that only belong to the deleted lines and have no remaining connected lines.
 */
export function getOrphanedFixIds(
  deletedLineIds: string[],
  allLines: WhiteboardLine[],
  allFixes: WhiteboardFix[]
): string[] {
  const deletedSet = new Set(deletedLineIds);
  const remainingLines = allLines.filter((l) => !deletedSet.has(l.id));

  // Fixes still used by remaining lines
  const usedFixIds = new Set<string>();
  remainingLines.forEach((l) => {
    usedFixIds.add(l.fromFixId);
    usedFixIds.add(l.toFixId);
  });

  // Fixes that were touched by deleted lines
  const touchedFixIds = new Set<string>();
  allLines
    .filter((l) => deletedSet.has(l.id))
    .forEach((l) => {
      touchedFixIds.add(l.fromFixId);
      touchedFixIds.add(l.toFixId);
    });

  // Orphaned fixes are those touched by deleted lines, not in usedFixIds, and NOT runway threshold fixes
  const orphaned: string[] = [];
  touchedFixIds.forEach((fixId) => {
    if (!usedFixIds.has(fixId)) {
      const fix = allFixes.find((f) => f.id === fixId);
      if (fix && !fix.isRunwayEnd) {
        orphaned.push(fixId);
      }
    }
  });

  return orphaned;
}
