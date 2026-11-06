import L from "leaflet";

export interface TerrariumAirportElevationOptions extends L.GridLayerOptions {
  airportCenter: { lat: number; lng: number };
  airportElevationFt: number;
  halfSizeNm?: number; // Half-width of the square in NM (default 45 NM -> 90 NM x 90 NM square)
  minSafeAltFt?: number; // Minimum Safe Altitude filter: terrain below this is dimmed/faded out
  onMaxMsaCalculated?: (maxMsaFt: number) => void;
}

function pixelToLatLng(tileX: number, tileY: number, zoom: number, px: number, py: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = ((tileX + px / 256) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + py / 256)) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

interface MsaColorBand {
  maxMsa: number;
  r: number;
  g: number;
  b: number;
}

// Hypsometric color bands indexed by Minimum Safe Altitude (MSA) matching ifatc.org standard
const MSA_COLOR_BANDS: MsaColorBand[] = [
  { maxMsa: 3000, r: 26, g: 54, b: 38 },   // Safe low plains / coast (MSA <= 3,000'): deep forest green
  { maxMsa: 5000, r: 48, g: 78, b: 40 },   // Low terrain / valleys (MSA <= 5,000'): olive green
  { maxMsa: 7000, r: 94, g: 102, b: 36 },  // Foothills (MSA <= 7,000'): muted olive mustard
  { maxMsa: 9000, r: 154, g: 122, b: 36 }, // Uplands (MSA <= 9,000'): warm amber mustard
  { maxMsa: 11000, r: 168, g: 92, b: 36 }, // Lower mountains (MSA <= 11,000'): terracotta ochre
  { maxMsa: 13000, r: 154, g: 56, b: 38 }, // Mountainous massif (MSA <= 13,000'): rust orange-red
  { maxMsa: 15000, r: 132, g: 32, b: 36 }, // Alpine massifs (MSA <= 15,000'): crimson red
  { maxMsa: 17000, r: 104, g: 20, b: 30 }, // High peaks (MSA <= 17,000'): deep burgundy
  { maxMsa: Infinity, r: 72, g: 14, b: 22 } // Extreme summits: dark wine burgundy
];

function getMsaBandIndex(msaFt: number): number {
  for (let i = 0; i < MSA_COLOR_BANDS.length; i++) {
    if (msaFt <= MSA_COLOR_BANDS[i].maxMsa) return i;
  }
  return MSA_COLOR_BANDS.length - 1;
}

/**
 * Colors raw Terrarium DEM pixels into hypsometric MSA bands with topography contour lines in between,
 * and filters strictly by Minimum Safe Altitude (MSA) so safe areas become uncolored while unsafe areas remain colored.
 */
function renderTerrainPixels(
  inData: Uint8ClampedArray,
  outData: Uint8ClampedArray,
  rowLats: number[],
  rowCosLats: number[],
  coordsZ: number,
  coordsX: number,
  center: { lat: number; lng: number },
  halfSizeNm: number,
  minSafeAltFt: number
): number {
  const n = Math.pow(2, coordsZ);

  // Pre-decode elevation and compute true Minimum Safe Altitude (MSA) for all 256x256 pixels
  const elevFt = new Float32Array(256 * 256);
  const msaFt = new Float32Array(256 * 256);

  for (let i = 0; i < 256 * 256; i++) {
    const i4 = i * 4;
    const r = inData[i4];
    const g = inData[i4 + 1];
    const b = inData[i4 + 2];
    const rawAlt = (r * 256 + g + b / 256 - 32768) * 3.28084;
    elevFt[i] = rawAlt;

    // Minimum Safe Altitude (MSA) standard aviation formula:
    // Mountainous clearance +2,000' if terrain >= 3,000' MSL, else +1,000', rounded up to nearest 500' (min 2,000')
    const clearance = rawAlt >= 3000 ? 2000 : 1000;
    msaFt[i] = Math.max(2000, Math.ceil((rawAlt + clearance) / 500) * 500);
  }

  let maxMsaInTile = 0;

  for (let py = 0; py < 256; py++) {
    const lat = rowLats[py];
    const cosLat = rowCosLats[py];
    const dLatNm = Math.abs(lat - center.lat) * 60;

    // Quick row reject if dLat exceeds square half-size
    if (dLatNm > halfSizeNm) {
      continue;
    }

    for (let px = 0; px < 256; px++) {
      const lng = ((coordsX + px / 256) / n) * 360 - 180;
      const dLngNm = Math.abs(lng - center.lng) * cosLat * 60;

      // Outside square boundary -> keep transparent
      if (dLngNm > halfSizeNm) {
        continue;
      }

      const pIdx = py * 256 + px;
      const idx = pIdx * 4;
      const pixelMsa = msaFt[pIdx];

      if (pixelMsa > maxMsaInTile) {
        maxMsaInTile = pixelMsa;
      }

      // Soft square perimeter feather at outer boundary edge (1.5 NM)
      const distFromEdgeNm = Math.min(halfSizeNm - dLatNm, halfSizeNm - dLngNm);
      const edgeAlpha = distFromEdgeNm < 1.5 ? Math.max(0, distFromEdgeNm / 1.5) : 1.0;

      // Minimum Safe Altitude Filter:
      // When minSafeAltFt > 0, an area is SAFE to vector at minSafeAltFt if its required MSA <= minSafeAltFt.
      // Safe areas become uncolored (transparent), while unsafe areas (where MSA > minSafeAltFt) remain colored!
      if (minSafeAltFt > 0 && pixelMsa <= minSafeAltFt) {
        outData[idx] = 0;
        outData[idx + 1] = 0;
        outData[idx + 2] = 0;
        outData[idx + 3] = 0;
        continue;
      }

      const bandIdx = getMsaBandIndex(pixelMsa);
      const band = MSA_COLOR_BANDS[bandIdx];

      // Topography lines in between the MSA color bands (and 1,000 ft intermediate contours)
      let isBandContour = false;
      let is1kContour = false;

      // Check right neighbor
      if (px < 255) {
        const rMsa = msaFt[pIdx + 1];
        if (getMsaBandIndex(rMsa) !== bandIdx) {
          isBandContour = true;
        } else if (Math.floor(pixelMsa / 1000) !== Math.floor(rMsa / 1000)) {
          is1kContour = true;
        }
      }

      // Check bottom neighbor
      if (!isBandContour && py < 255) {
        const bMsa = msaFt[pIdx + 256];
        if (getMsaBandIndex(bMsa) !== bandIdx) {
          isBandContour = true;
        } else if (Math.floor(pixelMsa / 1000) !== Math.floor(bMsa / 1000)) {
          is1kContour = true;
        }
      }

      if (isBandContour) {
        // Dark, crisp topography line demarcating the color band or boundary
        outData[idx] = Math.round(band.r * 0.28);
        outData[idx + 1] = Math.round(band.g * 0.28);
        outData[idx + 2] = Math.round(band.b * 0.28);
        outData[idx + 3] = Math.round(255 * edgeAlpha);
      } else if (is1kContour) {
        // Subtle 1,000 ft intermediate contour line
        outData[idx] = Math.round(band.r * 0.65);
        outData[idx + 1] = Math.round(band.g * 0.65);
        outData[idx + 2] = Math.round(band.b * 0.65);
        outData[idx + 3] = Math.round(248 * edgeAlpha);
      } else {
        outData[idx] = band.r;
        outData[idx + 1] = band.g;
        outData[idx + 2] = band.b;
        outData[idx + 3] = Math.round(242 * edgeAlpha);
      }
    }
  }

  return maxMsaInTile;
}

// Leaflet custom GridLayer: Color-coded elevation DEM layer restricted to a large square around searched airport
export const TerrariumAirportElevationLayer = L.GridLayer.extend({
  initialize: function (options: TerrariumAirportElevationOptions) {
    L.setOptions(this, {
      tileSize: 256,
      opacity: 0.68,
      maxZoom: 15,
      minZoom: 4,
      halfSizeNm: 45, // Large 90 NM x 90 NM square area
      minSafeAltFt: 0,
      ...options,
    });
  },

  setMinSafeAltFt: function (newAltFt: number) {
    this.options.minSafeAltFt = newAltFt;
    const tiles = (this as any)._tiles;
    if (!tiles) return;
    for (const key in tiles) {
      const tile = tiles[key];
      const el = tile?.el as HTMLCanvasElement;
      if (el && (el as any)._cachedData) {
        const { inData, rowLats, rowCosLats, coordsZ, coordsX, center, halfSizeNm } = (el as any)._cachedData;
        const ctx = el.getContext("2d");
        if (ctx) {
          const outImgData = ctx.createImageData(256, 256);
          renderTerrainPixels(inData, outImgData.data, rowLats, rowCosLats, coordsZ, coordsX, center, halfSizeNm, newAltFt);
          ctx.putImageData(outImgData, 0, 0);
        }
      }
    }
  },

  createTile: function (coords: L.Coords, done: (err: any, tile: HTMLElement) => void): HTMLElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.pointerEvents = "none";
    canvas.style.userSelect = "none";
    canvas.className = "pointer-events-none select-none";
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      setTimeout(() => done(null, canvas), 0);
      return canvas;
    }

    const options = this.options as TerrariumAirportElevationOptions;
    const center = options.airportCenter;
    const halfSizeNm = options.halfSizeNm || 45;
    const minSafeAltFt = options.minSafeAltFt || 0;

    // If no airport is searched/provided, keep 100% transparent
    if (!center) {
      setTimeout(() => done(null, canvas), 0);
      return canvas;
    }

    // Quick bounding box check: if entire tile is outside the airport square + margin, skip decoding
    const tileCenter = pixelToLatLng(coords.x, coords.y, coords.z, 128, 128);
    const cosTileLat = Math.cos((tileCenter.lat * Math.PI) / 180);
    const tileDLatNm = Math.abs(tileCenter.lat - center.lat) * 60;
    const tileDLngNm = Math.abs(tileCenter.lng - center.lng) * cosTileLat * 60;
    const tileDiagNm = (40075 / Math.pow(2, coords.z)) * 0.75;

    if (tileDLatNm > halfSizeNm + tileDiagNm + 2 || tileDLngNm > halfSizeNm + tileDiagNm + 2) {
      setTimeout(() => done(null, canvas), 0);
      return canvas;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const memCanvas = document.createElement("canvas");
        memCanvas.width = 256;
        memCanvas.height = 256;
        const memCtx = memCanvas.getContext("2d", { willReadFrequently: true });
        if (!memCtx) {
          done(null, canvas);
          return;
        }

        memCtx.drawImage(img, 0, 0);
        const imgData = memCtx.getImageData(0, 0, 256, 256);
        const inData = imgData.data;

        // Precompute latitude and cosLat for each of the 256 rows
        const rowLats: number[] = new Array(256);
        const rowCosLats: number[] = new Array(256);
        const n = Math.pow(2, coords.z);
        for (let py = 0; py < 256; py++) {
          const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (coords.y + py / 256)) / n)));
          rowLats[py] = (latRad * 180) / Math.PI;
          rowCosLats[py] = Math.cos(latRad);
        }

        // Cache elevation raw data for instant re-shading on Min Safe Alt changes
        (canvas as any)._cachedData = {
          inData,
          rowLats,
          rowCosLats,
          coordsZ: coords.z,
          coordsX: coords.x,
          center,
          halfSizeNm,
        };

        const outImgData = ctx.createImageData(256, 256);
        const tileMaxMsa = renderTerrainPixels(
          inData,
          outImgData.data,
          rowLats,
          rowCosLats,
          coords.z,
          coords.x,
          center,
          halfSizeNm,
          (typeof this.options.minSafeAltFt === "number" ? this.options.minSafeAltFt : minSafeAltFt) || 0
        );

        if (tileMaxMsa > 0) {
          const currentHighest = (this as any)._areaHighestMsa || 0;
          if (tileMaxMsa > currentHighest) {
            (this as any)._areaHighestMsa = tileMaxMsa;
            options.onMaxMsaCalculated?.(tileMaxMsa);
          }
        }

        ctx.putImageData(outImgData, 0, 0);
        done(null, canvas);
      } catch {
        done(null, canvas);
      }
    };

    img.onerror = () => {
      done(null, canvas);
    };

    // Load AWS Terrarium elevation DEM tile via proxy
    img.src = `/api/terrain/terrarium/${coords.z}/${coords.x}/${coords.y}.png`;

    return canvas;
  },
});

export function createTerrariumAirportLayer(options: TerrariumAirportElevationOptions): L.GridLayer {
  return new (TerrariumAirportElevationLayer as any)(options);
}
