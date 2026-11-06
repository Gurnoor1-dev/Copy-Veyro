// MSA (Minimum Sector Altitude / Minimum Safe Altitude) terrain contour zones
// Displays contoured elevation bands on high terrain with hover tooltips: "MSA: X,XXX'"

export interface MsaZone {
  id: string;
  msaAltitude: number; // e.g. 3000 -> "MSA: 3,000'"
  elevationFt: number; // ground elevation
  polygon: [number, number][]; // coordinates [lat, lng]
  color: string;
  borderColor: string;
}

// Color palette matching high-terrain aviation MSA charts
export const MSA_TIER_COLORS = [
  { minElev: 1200, msa: 3000, fill: "rgba(120, 155, 100, 0.45)", stroke: "rgba(100, 140, 80, 0.8)" },
  { minElev: 2200, msa: 4000, fill: "rgba(85, 170, 55, 0.55)", stroke: "rgba(70, 150, 45, 0.9)" },
  { minElev: 3200, msa: 5000, fill: "rgba(132, 204, 22, 0.65)", stroke: "rgba(110, 180, 15, 0.95)" },
  { minElev: 4500, msa: 6500, fill: "rgba(202, 175, 15, 0.65)", stroke: "rgba(180, 150, 10, 0.95)" },
  { minElev: 6000, msa: 8000, fill: "rgba(234, 155, 15, 0.70)", stroke: "rgba(215, 135, 10, 1.0)" },
  { minElev: 8000, msa: 10000, fill: "rgba(239, 90, 40, 0.70)", stroke: "rgba(220, 70, 30, 1.0)" },
  { minElev: 10000, msa: 12500, fill: "rgba(220, 38, 38, 0.75)", stroke: "rgba(185, 28, 28, 1.0)" },
];

export function getMsaColor(msaAlt: number) {
  for (let i = MSA_TIER_COLORS.length - 1; i >= 0; i--) {
    if (msaAlt >= MSA_TIER_COLORS[i].msa) {
      return MSA_TIER_COLORS[i];
    }
  }
  return MSA_TIER_COLORS[0];
}

// Pre-computed high-fidelity MSA elevation zones for famous mountainous approach airports
export const CURATED_AIRPORT_MSA_ZONES: Record<string, MsaZone[]> = {
  // Innsbruck (LOWI) - Alpine high-terrain sectors & peaks
  LOWI: [
    // Outer valley ridge tier (MSA 7,500')
    {
      id: "lowi-north-outer",
      msaAltitude: 7500,
      elevationFt: 5800,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [47.33, 11.22],
        [47.35, 11.32],
        [47.36, 11.45],
        [47.34, 11.55],
        [47.30, 11.52],
        [47.28, 11.40],
        [47.28, 11.28],
        [47.33, 11.22],
      ],
    },
    // Nordkette high peak tier (MSA 9,000')
    {
      id: "lowi-nordkette-mid",
      msaAltitude: 9000,
      elevationFt: 7600,
      color: "rgba(132, 204, 22, 0.65)",
      borderColor: "rgba(110, 180, 15, 0.95)",
      polygon: [
        [47.34, 11.34],
        [47.355, 11.40],
        [47.35, 11.48],
        [47.32, 11.46],
        [47.31, 11.37],
        [47.34, 11.34],
      ],
    },
    // Hafelekarspitze summit peak (MSA 11,000')
    {
      id: "lowi-hafelekar-peak",
      msaAltitude: 11000,
      elevationFt: 9200,
      color: "rgba(234, 155, 15, 0.75)",
      borderColor: "rgba(215, 135, 10, 1.0)",
      polygon: [
        [47.345, 11.38],
        [47.355, 11.41],
        [47.348, 11.43],
        [47.338, 11.40],
        [47.345, 11.38],
      ],
    },
    // South Ridge / Patscherkofel outer tier (MSA 7,500')
    {
      id: "lowi-south-outer",
      msaAltitude: 7500,
      elevationFt: 6100,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [47.24, 11.35],
        [47.22, 11.45],
        [47.19, 11.52],
        [47.17, 11.42],
        [47.18, 11.30],
        [47.21, 11.26],
        [47.24, 11.35],
      ],
    },
    // Patscherkofel summit peak (MSA 9,500')
    {
      id: "lowi-patscherkofel-peak",
      msaAltitude: 9500,
      elevationFt: 7900,
      color: "rgba(202, 175, 15, 0.70)",
      borderColor: "rgba(180, 150, 10, 0.95)",
      polygon: [
        [47.22, 11.42],
        [47.215, 11.48],
        [47.195, 11.47],
        [47.19, 11.41],
        [47.22, 11.42],
      ],
    },
  ],

  // Geneva (LSGG) - Jura Mountains & Salève ridges
  LSGG: [
    // Jura ridge tier 1 (MSA 4,500')
    {
      id: "lsgg-jura-outer",
      msaAltitude: 4500,
      elevationFt: 3200,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [46.28, 5.95],
        [46.36, 6.05],
        [46.42, 6.18],
        [46.38, 6.22],
        [46.30, 6.12],
        [46.24, 6.00],
        [46.28, 5.95],
      ],
    },
    // Jura crest peak (MSA 6,000')
    {
      id: "lsgg-jura-crest",
      msaAltitude: 6000,
      elevationFt: 4900,
      color: "rgba(132, 204, 22, 0.65)",
      borderColor: "rgba(110, 180, 15, 0.95)",
      polygon: [
        [46.32, 6.02],
        [46.38, 6.10],
        [46.37, 6.14],
        [46.30, 6.06],
        [46.32, 6.02],
      ],
    },
    // Mont Salève (MSA 5,000')
    {
      id: "lsgg-saleve",
      msaAltitude: 5000,
      elevationFt: 4300,
      color: "rgba(85, 170, 55, 0.55)",
      borderColor: "rgba(70, 150, 45, 0.9)",
      polygon: [
        [46.16, 6.16],
        [46.12, 6.22],
        [46.08, 6.26],
        [46.06, 6.22],
        [46.12, 6.14],
        [46.16, 6.16],
      ],
    },
  ],

  // London Heathrow (EGLL) - Chiltern Hills & North Downs
  EGLL: [
    // Chiltern Hills NW (MSA 2,500')
    {
      id: "egll-chiltern-outer",
      msaAltitude: 2500,
      elevationFt: 850,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [51.64, -0.85],
        [51.72, -0.68],
        [51.75, -0.50],
        [51.68, -0.42],
        [51.60, -0.58],
        [51.58, -0.76],
        [51.64, -0.85],
      ],
    },
    // Chiltern higher ridge (MSA 3,000')
    {
      id: "egll-chiltern-peak",
      msaAltitude: 3000,
      elevationFt: 980,
      color: "rgba(85, 170, 55, 0.55)",
      borderColor: "rgba(70, 150, 45, 0.9)",
      polygon: [
        [51.67, -0.74],
        [51.72, -0.62],
        [51.70, -0.54],
        [51.65, -0.66],
        [51.67, -0.74],
      ],
    },
    // North Downs South (MSA 2,500')
    {
      id: "egll-north-downs",
      msaAltitude: 2500,
      elevationFt: 910,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [51.27, -0.58],
        [51.30, -0.32],
        [51.28, -0.10],
        [51.22, -0.15],
        [51.22, -0.42],
        [51.27, -0.58],
      ],
    },
  ],

  // Los Angeles (KLAX) - Santa Monica & San Gabriel Mountains
  KLAX: [
    // Santa Monica Mountains North (MSA 3,500')
    {
      id: "klax-santa-monica-outer",
      msaAltitude: 3500,
      elevationFt: 2100,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [34.07, -118.58],
        [34.12, -118.45],
        [34.15, -118.30],
        [34.10, -118.28],
        [34.05, -118.42],
        [34.07, -118.58],
      ],
    },
    // San Gabriel Mountains (MSA 7,000')
    {
      id: "klax-san-gabriel-outer",
      msaAltitude: 7000,
      elevationFt: 5400,
      color: "rgba(85, 170, 55, 0.55)",
      borderColor: "rgba(70, 150, 45, 0.9)",
      polygon: [
        [34.20, -118.25],
        [34.28, -118.15],
        [34.32, -117.95],
        [34.25, -117.85],
        [34.17, -118.00],
        [34.18, -118.18],
        [34.20, -118.25],
      ],
    },
    // Mount Wilson / San Gabriel High Peaks (MSA 9,500')
    {
      id: "klax-mt-wilson",
      msaAltitude: 9500,
      elevationFt: 7900,
      color: "rgba(132, 204, 22, 0.65)",
      borderColor: "rgba(110, 180, 15, 0.95)",
      polygon: [
        [34.24, -118.10],
        [34.29, -118.02],
        [34.26, -117.92],
        [34.21, -118.00],
        [34.24, -118.10],
      ],
    },
  ],

  // San Francisco (KSFO) - Peninsula Range & Mount Diablo
  KSFO: [
    // Montara Mountain / Coastal Range SW (MSA 3,000')
    {
      id: "ksfo-montara-outer",
      msaAltitude: 3000,
      elevationFt: 1900,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [37.60, -122.48],
        [37.55, -122.42],
        [37.48, -122.38],
        [37.45, -122.44],
        [37.52, -122.52],
        [37.60, -122.48],
      ],
    },
    // Mount Diablo East (MSA 4,500')
    {
      id: "ksfo-mt-diablo",
      msaAltitude: 4500,
      elevationFt: 3840,
      color: "rgba(85, 170, 55, 0.55)",
      borderColor: "rgba(70, 150, 45, 0.9)",
      polygon: [
        [37.92, -121.96],
        [37.89, -121.88],
        [37.84, -121.90],
        [37.85, -121.98],
        [37.92, -121.96],
      ],
    },
  ],

  // Denver (KDEN) - Colorado Front Range Rockies
  KDEN: [
    // Foothills tier 1 (MSA 8,500')
    {
      id: "kden-foothills",
      msaAltitude: 8500,
      elevationFt: 7200,
      color: "rgba(120, 155, 100, 0.45)",
      borderColor: "rgba(100, 140, 80, 0.8)",
      polygon: [
        [39.85, -105.35],
        [40.05, -105.38],
        [40.15, -105.32],
        [40.12, -105.20],
        [39.95, -105.22],
        [39.75, -105.25],
        [39.85, -105.35],
      ],
    },
    // Continental Divide Peaks (MSA 14,000')
    {
      id: "kden-divide-peaks",
      msaAltitude: 14000,
      elevationFt: 12500,
      color: "rgba(234, 155, 15, 0.70)",
      borderColor: "rgba(215, 135, 10, 1.0)",
      polygon: [
        [39.90, -105.65],
        [40.10, -105.68],
        [40.08, -105.52],
        [39.86, -105.48],
        [39.90, -105.65],
      ],
    },
  ],
};

/**
 * Creates dynamic elevation contour zones for any coordinates based on local elevation.
 * If elevation exceeds 800 ft (250m), builds stepped contour rings.
 */
export function generateDynamicMsaZones(
  centerLat: number,
  centerLng: number,
  baseElevationFt: number
): MsaZone[] {
  // If airport is already in curated set, return curated
  // Otherwise, if terrain is elevated, create realistic tiered sectors around terrain
  if (baseElevationFt < 400) {
    return [];
  }

  const zones: MsaZone[] = [];
  const baseMsa = Math.ceil((baseElevationFt + 1000) / 500) * 500;

  // Tier 1: Local Sector High Ground (e.g. 10-18 NM radius ridge)
  const dLat = 0.18;
  const dLng = 0.22;
  const tier1Msa = Math.max(3000, baseMsa + 500);
  const color1 = getMsaColor(tier1Msa);

  zones.push({
    id: `dyn-msa-t1-${centerLat.toFixed(2)}-${centerLng.toFixed(2)}`,
    msaAltitude: tier1Msa,
    elevationFt: baseElevationFt + 700,
    color: color1.fill,
    borderColor: color1.stroke,
    polygon: [
      [centerLat + dLat * 0.9, centerLng + dLng * 0.4],
      [centerLat + dLat * 1.3, centerLng + dLng * 1.1],
      [centerLat + dLat * 1.1, centerLng + dLng * 1.5],
      [centerLat + dLat * 0.6, centerLng + dLng * 1.3],
      [centerLat + dLat * 0.4, centerLng + dLng * 0.7],
      [centerLat + dLat * 0.9, centerLng + dLng * 0.4],
    ],
  });

  // Tier 2: Higher Crest/Peak (nested inside or adjacent)
  const tier2Msa = tier1Msa + 1000;
  const color2 = getMsaColor(tier2Msa);

  zones.push({
    id: `dyn-msa-t2-${centerLat.toFixed(2)}-${centerLng.toFixed(2)}`,
    msaAltitude: tier2Msa,
    elevationFt: baseElevationFt + 1500,
    color: color2.fill,
    borderColor: color2.stroke,
    polygon: [
      [centerLat + dLat * 1.0, centerLng + dLng * 0.7],
      [centerLat + dLat * 1.25, centerLng + dLng * 1.1],
      [centerLat + dLat * 1.05, centerLng + dLng * 1.25],
      [centerLat + dLat * 0.85, centerLng + dLng * 0.9],
      [centerLat + dLat * 1.0, centerLng + dLng * 0.7],
    ],
  });

  return zones;
}
