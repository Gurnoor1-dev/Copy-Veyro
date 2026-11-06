export interface WhiteboardAirport {
  icao: string;
  iata?: string | null;
  name: string;
  city?: string;
  country?: string;
  lat: number;
  lng: number;
  elevation: number;
  runways: {
    id: string; // e.g. "27L", "09R", "18R"
    heading: number; // 0-360
    hasIls: boolean;
    lengthFt?: number;
    widthFt?: number;
    threshold?: { lat: number; lng: number };
  }[];
}

export const POPULAR_APPROACH_AIRPORTS: Record<string, WhiteboardAirport> = {
  EHAM: {
    icao: "EHAM",
    name: "Amsterdam Airport Schiphol",
    lat: 52.3086,
    lng: 4.7639,
    elevation: -11,
    runways: [
      { id: "18R", heading: 183, hasIls: true },
      { id: "36L", heading: 3, hasIls: true },
      { id: "06", heading: 58, hasIls: true },
      { id: "24", heading: 238, hasIls: true },
      { id: "09", heading: 87, hasIls: true },
      { id: "27", heading: 267, hasIls: true },
      { id: "18C", heading: 183, hasIls: true },
      { id: "36C", heading: 3, hasIls: true },
      { id: "18L", heading: 183, hasIls: true },
      { id: "36R", heading: 3, hasIls: true },
    ],
  },
  EGLL: {
    icao: "EGLL",
    name: "London Heathrow Airport",
    lat: 51.4700,
    lng: -0.4543,
    elevation: 83,
    runways: [
      { id: "27R", heading: 271, hasIls: true },
      { id: "27L", heading: 271, hasIls: true },
      { id: "09L", heading: 91, hasIls: true },
      { id: "09R", heading: 91, hasIls: true },
    ],
  },
  KJFK: {
    icao: "KJFK",
    name: "John F. Kennedy Intl",
    lat: 40.6413,
    lng: -73.7781,
    elevation: 13,
    runways: [
      { id: "04L", heading: 44, hasIls: true },
      { id: "22R", heading: 224, hasIls: true },
      { id: "04R", heading: 44, hasIls: true },
      { id: "22L", heading: 224, hasIls: true },
      { id: "13L", heading: 134, hasIls: true },
      { id: "31R", heading: 314, hasIls: true },
      { id: "13R", heading: 134, hasIls: true },
      { id: "31L", heading: 314, hasIls: true },
    ],
  },
  KLAX: {
    icao: "KLAX",
    name: "Los Angeles Intl",
    lat: 33.9425,
    lng: -118.4081,
    elevation: 126,
    runways: [
      { id: "24R", heading: 251, hasIls: true },
      { id: "24L", heading: 251, hasIls: true },
      { id: "25R", heading: 251, hasIls: true },
      { id: "25L", heading: 251, hasIls: true },
      { id: "06L", heading: 71, hasIls: true },
      { id: "06R", heading: 71, hasIls: true },
      { id: "07L", heading: 71, hasIls: true },
      { id: "07R", heading: 71, hasIls: true },
    ],
  },
  EDDF: {
    icao: "EDDF",
    name: "Frankfurt Main Airport",
    lat: 50.0379,
    lng: 8.5622,
    elevation: 364,
    runways: [
      { id: "07R", heading: 69, hasIls: true },
      { id: "25L", heading: 249, hasIls: true },
      { id: "07C", heading: 69, hasIls: true },
      { id: "25C", heading: 249, hasIls: true },
      { id: "07L", heading: 69, hasIls: true },
      { id: "25R", heading: 249, hasIls: true },
      { id: "18", heading: 179, hasIls: false },
    ],
  },
  LFPG: {
    icao: "LFPG",
    name: "Paris Charles de Gaulle",
    lat: 49.0097,
    lng: 2.5479,
    elevation: 392,
    runways: [
      { id: "08L", heading: 86, hasIls: true },
      { id: "26R", heading: 266, hasIls: true },
      { id: "08R", heading: 86, hasIls: true },
      { id: "26L", heading: 266, hasIls: true },
      { id: "09L", heading: 86, hasIls: true },
      { id: "27R", heading: 266, hasIls: true },
      { id: "09R", heading: 86, hasIls: true },
      { id: "27L", heading: 266, hasIls: true },
    ],
  },
  OMDB: {
    icao: "OMDB",
    name: "Dubai International Airport",
    lat: 25.2528,
    lng: 55.3644,
    elevation: 62,
    runways: [
      { id: "12L", heading: 120, hasIls: true },
      { id: "30R", heading: 300, hasIls: true },
      { id: "12R", heading: 120, hasIls: true },
      { id: "30L", heading: 300, hasIls: true },
    ],
  },
  WSSS: {
    icao: "WSSS",
    name: "Singapore Changi Airport",
    lat: 1.3644,
    lng: 103.9915,
    elevation: 22,
    runways: [
      { id: "02L", heading: 23, hasIls: true },
      { id: "20R", heading: 203, hasIls: true },
      { id: "02C", heading: 23, hasIls: true },
      { id: "20C", heading: 203, hasIls: true },
      { id: "02R", heading: 23, hasIls: true },
      { id: "20L", heading: 203, hasIls: true },
    ],
  },
  KSFO: {
    icao: "KSFO",
    name: "San Francisco Intl",
    lat: 37.6188,
    lng: -122.375,
    elevation: 13,
    runways: [
      { id: "28R", heading: 284, hasIls: true },
      { id: "28L", heading: 284, hasIls: true },
      { id: "10L", heading: 104, hasIls: false },
      { id: "10R", heading: 104, hasIls: false },
      { id: "01L", heading: 14, hasIls: false },
      { id: "19R", heading: 194, hasIls: true },
      { id: "01R", heading: 14, hasIls: false },
      { id: "19L", heading: 194, hasIls: true },
    ],
  },
  KORD: {
    icao: "KORD",
    name: "Chicago O'Hare Intl",
    lat: 41.9742,
    lng: -87.9073,
    elevation: 672,
    runways: [
      { id: "10L", heading: 98, hasIls: true },
      { id: "28R", heading: 278, hasIls: true },
      { id: "10C", heading: 98, hasIls: true },
      { id: "28C", heading: 278, hasIls: true },
      { id: "09L", heading: 98, hasIls: true },
      { id: "27R", heading: 278, hasIls: true },
      { id: "04R", heading: 42, hasIls: true },
      { id: "22L", heading: 222, hasIls: true },
    ],
  },
  KATL: {
    icao: "KATL",
    name: "Hartsfield-Jackson Atlanta",
    lat: 33.6407,
    lng: -84.4277,
    elevation: 1026,
    runways: [
      { id: "08L", heading: 86, hasIls: true },
      { id: "26R", heading: 266, hasIls: true },
      { id: "08R", heading: 86, hasIls: true },
      { id: "26L", heading: 266, hasIls: true },
      { id: "09L", heading: 86, hasIls: true },
      { id: "27R", heading: 266, hasIls: true },
      { id: "09R", heading: 86, hasIls: true },
      { id: "27L", heading: 266, hasIls: true },
    ],
  },
  YSSY: {
    icao: "YSSY",
    name: "Sydney Kingsford Smith Intl",
    lat: -33.9461,
    lng: 151.1772,
    elevation: 21,
    runways: [
      { id: "16R", heading: 155, hasIls: true },
      { id: "34L", heading: 335, hasIls: true },
      { id: "16L", heading: 155, hasIls: true },
      { id: "34R", heading: 335, hasIls: true },
      { id: "07", heading: 68, hasIls: true },
      { id: "25", heading: 248, hasIls: true },
    ],
  },
};
