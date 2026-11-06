export interface CommonAirportDetails {
  name: string;
  city: string;
  country: string;
  elevation: number;
  runways: {
    ident: string;
    lengthFt: number;
    widthFt: number;
    surface: string;
    heading: number;
    ils: boolean;
  }[];
}

export const KNOWN_AIRPORTS: Record<string, CommonAirportDetails> = {
  YSSY: {
    name: "Sydney Kingsford Smith Intl",
    city: "Sydney",
    country: "Australia",
    elevation: 21,
    runways: [
      { ident: "16R/34L", lengthFt: 12999, widthFt: 148, surface: "Asphalt", heading: 155, ils: true },
      { ident: "16L/34R", lengthFt: 7999, widthFt: 148, surface: "Asphalt", heading: 155, ils: true },
      { ident: "07/25", lengthFt: 8297, widthFt: 148, surface: "Asphalt", heading: 68, ils: true },
    ],
  },
  EGLL: {
    name: "London Heathrow Airport",
    city: "London",
    country: "United Kingdom",
    elevation: 83,
    runways: [
      { ident: "09L/27R", lengthFt: 12802, widthFt: 164, surface: "Asphalt", heading: 90, ils: true },
      { ident: "09R/27L", lengthFt: 12008, widthFt: 164, surface: "Asphalt", heading: 90, ils: true },
    ],
  },
  EHAM: {
    name: "Amsterdam Airport Schiphol",
    city: "Amsterdam",
    country: "Netherlands",
    elevation: -11,
    runways: [
      { ident: "18R/36L", lengthFt: 12467, widthFt: 148, surface: "Asphalt", heading: 183, ils: true },
      { ident: "06/24", lengthFt: 11483, widthFt: 148, surface: "Asphalt", heading: 58, ils: true },
      { ident: "09/27", lengthFt: 11332, widthFt: 148, surface: "Asphalt", heading: 87, ils: true },
      { ident: "18L/36R", lengthFt: 11155, widthFt: 148, surface: "Asphalt", heading: 183, ils: true },
      { ident: "18C/36C", lengthFt: 10827, widthFt: 148, surface: "Asphalt", heading: 183, ils: true },
      { ident: "04/22", lengthFt: 6608, widthFt: 148, surface: "Asphalt", heading: 41, ils: false },
    ],
  },
  OTHH: {
    name: "Hamad International Airport",
    city: "Doha",
    country: "Qatar",
    elevation: 12,
    runways: [
      { ident: "16L/34R", lengthFt: 15912, widthFt: 197, surface: "Asphalt", heading: 160, ils: true },
      { ident: "16R/34L", lengthFt: 13944, widthFt: 197, surface: "Asphalt", heading: 160, ils: true },
    ],
  },
  KJFK: {
    name: "John F. Kennedy Intl",
    city: "New York",
    country: "United States",
    elevation: 13,
    runways: [
      { ident: "04L/22R", lengthFt: 12079, widthFt: 150, surface: "Asphalt", heading: 44, ils: true },
      { ident: "04R/22L", lengthFt: 8400, widthFt: 150, surface: "Asphalt", heading: 44, ils: true },
      { ident: "13L/31R", lengthFt: 10000, widthFt: 150, surface: "Concrete", heading: 134, ils: true },
      { ident: "13R/31L", lengthFt: 14511, widthFt: 200, surface: "Concrete", heading: 134, ils: true },
    ],
  },
  KLAX: {
    name: "Los Angeles International",
    city: "Los Angeles",
    country: "United States",
    elevation: 128,
    runways: [
      { ident: "06L/24R", lengthFt: 8926, widthFt: 150, surface: "Concrete", heading: 71, ils: true },
      { ident: "06R/24L", lengthFt: 10285, widthFt: 150, surface: "Concrete", heading: 71, ils: true },
      { ident: "07L/25R", lengthFt: 12091, widthFt: 150, surface: "Concrete", heading: 71, ils: true },
      { ident: "07R/25L", lengthFt: 11095, widthFt: 200, surface: "Concrete", heading: 71, ils: true },
    ],
  },
  KORD: {
    name: "Chicago O'Hare International",
    city: "Chicago",
    country: "United States",
    elevation: 672,
    runways: [
      { ident: "10L/28R", lengthFt: 13000, widthFt: 150, surface: "Asphalt", heading: 98, ils: true },
      { ident: "10C/28C", lengthFt: 10800, widthFt: 200, surface: "Concrete", heading: 98, ils: true },
      { ident: "10R/28R", lengthFt: 7500, widthFt: 150, surface: "Concrete", heading: 98, ils: true },
      { ident: "09L/27R", lengthFt: 7500, widthFt: 150, surface: "Concrete", heading: 98, ils: true },
      { ident: "09C/27C", lengthFt: 11245, widthFt: 200, surface: "Concrete", heading: 98, ils: true },
      { ident: "04R/22L", lengthFt: 8075, widthFt: 150, surface: "Asphalt", heading: 43, ils: true },
    ],
  },
  EDDF: {
    name: "Frankfurt Airport",
    city: "Frankfurt",
    country: "Germany",
    elevation: 364,
    runways: [
      { ident: "07C/25C", lengthFt: 13123, widthFt: 197, surface: "Asphalt", heading: 69, ils: true },
      { ident: "07R/25L", lengthFt: 13123, widthFt: 148, surface: "Asphalt", heading: 69, ils: true },
      { ident: "07L/25R", lengthFt: 9186, widthFt: 148, surface: "Concrete", heading: 69, ils: true },
      { ident: "18", lengthFt: 13123, widthFt: 148, surface: "Concrete", heading: 179, ils: false },
    ],
  },
  LFPG: {
    name: "Charles de Gaulle Airport",
    city: "Paris",
    country: "France",
    elevation: 392,
    runways: [
      { ident: "08L/26R", lengthFt: 13829, widthFt: 148, surface: "Asphalt", heading: 86, ils: true },
      { ident: "08R/26L", lengthFt: 8858, widthFt: 148, surface: "Asphalt", heading: 86, ils: true },
      { ident: "09L/27R", lengthFt: 8858, widthFt: 148, surface: "Asphalt", heading: 86, ils: true },
      { ident: "09R/27L", lengthFt: 13779, widthFt: 148, surface: "Asphalt", heading: 86, ils: true },
    ],
  },
  OMDB: {
    name: "Dubai International",
    city: "Dubai",
    country: "United Arab Emirates",
    elevation: 62,
    runways: [
      { ident: "12L/30R", lengthFt: 14599, widthFt: 197, surface: "Asphalt", heading: 120, ils: true },
      { ident: "12R/30L", lengthFt: 14599, widthFt: 197, surface: "Asphalt", heading: 120, ils: true },
    ],
  },
  WSSS: {
    name: "Singapore Changi Airport",
    city: "Singapore",
    country: "Singapore",
    elevation: 22,
    runways: [
      { ident: "02L/20R", lengthFt: 13123, widthFt: 197, surface: "Asphalt", heading: 23, ils: true },
      { ident: "02C/20C", lengthFt: 13123, widthFt: 197, surface: "Asphalt", heading: 23, ils: true },
      { ident: "02R/20L", lengthFt: 13123, widthFt: 197, surface: "Asphalt", heading: 23, ils: true },
    ],
  },
  VHHH: {
    name: "Hong Kong International",
    city: "Hong Kong",
    country: "Hong Kong",
    elevation: 28,
    runways: [
      { ident: "07L/25R", lengthFt: 12467, widthFt: 197, surface: "Asphalt", heading: 73, ils: true },
      { ident: "07C/25C", lengthFt: 12467, widthFt: 197, surface: "Asphalt", heading: 73, ils: true },
      { ident: "07R/25L", lengthFt: 12467, widthFt: 197, surface: "Asphalt", heading: 73, ils: true },
    ],
  },
  RJTT: {
    name: "Tokyo Haneda Airport",
    city: "Tokyo",
    country: "Japan",
    elevation: 35,
    runways: [
      { ident: "16R/34L", lengthFt: 9842, widthFt: 197, surface: "Asphalt", heading: 157, ils: true },
      { ident: "16L/34R", lengthFt: 11024, widthFt: 197, surface: "Asphalt", heading: 157, ils: true },
      { ident: "04/22", lengthFt: 8202, widthFt: 197, surface: "Asphalt", heading: 40, ils: true },
      { ident: "05/23", lengthFt: 8202, widthFt: 197, surface: "Asphalt", heading: 47, ils: true },
    ],
  },
  YBBN: {
    name: "Brisbane Airport",
    city: "Brisbane",
    country: "Australia",
    elevation: 13,
    runways: [
      { ident: "01R/19L", lengthFt: 11483, widthFt: 148, surface: "Asphalt", heading: 14, ils: true },
      { ident: "01L/19R", lengthFt: 10827, widthFt: 148, surface: "Asphalt", heading: 14, ils: true },
    ],
  },
  NZAA: {
    name: "Auckland International Airport",
    city: "Auckland",
    country: "New Zealand",
    elevation: 23,
    runways: [
      { ident: "05R/23L", lengthFt: 11925, widthFt: 148, surface: "Concrete", heading: 50, ils: true },
      { ident: "05L/23R", lengthFt: 7070, widthFt: 148, surface: "Concrete", heading: 50, ils: false },
    ],
  },
  NZCH: {
    name: "Christchurch International",
    city: "Christchurch",
    country: "New Zealand",
    elevation: 123,
    runways: [
      { ident: "02/20", lengthFt: 10787, widthFt: 148, surface: "Asphalt", heading: 21, ils: true },
      { ident: "11/29", lengthFt: 5741, widthFt: 148, surface: "Asphalt", heading: 110, ils: false },
    ],
  },
  OERK: {
    name: "King Khalid International",
    city: "Riyadh",
    country: "Saudi Arabia",
    elevation: 2049,
    runways: [
      { ident: "15R/33L", lengthFt: 13780, widthFt: 197, surface: "Asphalt", heading: 153, ils: true },
      { ident: "15L/33R", lengthFt: 13780, widthFt: 197, surface: "Asphalt", heading: 153, ils: true },
    ],
  },
  LTFM: {
    name: "Istanbul Airport",
    city: "Istanbul",
    country: "Turkey",
    elevation: 325,
    runways: [
      { ident: "16R/34L", lengthFt: 12303, widthFt: 197, surface: "Asphalt", heading: 161, ils: true },
      { ident: "16L/34R", lengthFt: 12303, widthFt: 197, surface: "Asphalt", heading: 161, ils: true },
      { ident: "17R/35L", lengthFt: 13451, widthFt: 197, surface: "Asphalt", heading: 161, ils: true },
      { ident: "17L/35R", lengthFt: 13451, widthFt: 197, surface: "Asphalt", heading: 161, ils: true },
      { ident: "18/36", lengthFt: 10039, widthFt: 197, surface: "Asphalt", heading: 161, ils: true },
    ],
  },
  KSFO: {
    name: "San Francisco International",
    city: "San Francisco",
    country: "United States",
    elevation: 13,
    runways: [
      { ident: "10L/28R", lengthFt: 11870, widthFt: 200, surface: "Asphalt", heading: 107, ils: true },
      { ident: "10R/28L", lengthFt: 11381, widthFt: 200, surface: "Asphalt", heading: 107, ils: true },
      { ident: "01L/19R", lengthFt: 7650, widthFt: 200, surface: "Asphalt", heading: 14, ils: true },
      { ident: "01R/19L", lengthFt: 8650, widthFt: 200, surface: "Asphalt", heading: 14, ils: true },
    ],
  },
  KATL: {
    name: "Hartsfield-Jackson Atlanta Intl",
    city: "Atlanta",
    country: "United States",
    elevation: 1026,
    runways: [
      { ident: "08L/26R", lengthFt: 9000, widthFt: 150, surface: "Concrete", heading: 92, ils: true },
      { ident: "08R/26L", lengthFt: 10000, widthFt: 150, surface: "Concrete", heading: 92, ils: true },
      { ident: "09L/27R", lengthFt: 12390, widthFt: 150, surface: "Concrete", heading: 92, ils: true },
      { ident: "09R/27L", lengthFt: 9000, widthFt: 150, surface: "Concrete", heading: 92, ils: true },
      { ident: "10/28", lengthFt: 9000, widthFt: 150, surface: "Concrete", heading: 92, ils: true },
    ],
  },
};
