// Real-time external elevation & MSA sampler using AWS Terrarium DEM tiles
const tileCanvasCache = new Map<string, ImageData>();
const pendingTileFetches = new Set<string>();

export function latLngToTilePixel(lat: number, lng: number, zoom: number = 10) {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  const px = Math.min(255, Math.max(0, Math.floor((x - tileX) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((y - tileY) * 256)));
  return { tileX, tileY, px, py, zoom };
}

export function sampleElevationAndMsa(
  lat: number,
  lng: number,
  zoom: number = 10,
  onLoaded?: () => void
): { elevationFt: number; msaFt: number } | null {
  const { tileX, tileY, px, py } = latLngToTilePixel(lat, lng, zoom);
  const key = `${zoom}/${tileX}/${tileY}`;

  const imgData = tileCanvasCache.get(key);
  if (!imgData) {
    if (!pendingTileFetches.has(key)) {
      pendingTileFetches.add(key);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, 256, 256);
            tileCanvasCache.set(key, data);
            if (onLoaded) onLoaded();
          }
        } catch {}
      };
      img.src = `/api/terrain/terrarium/${zoom}/${tileX}/${tileY}.png`;
    }
    return null;
  }

  const idx = (py * 256 + px) * 4;
  const r = imgData.data[idx];
  const g = imgData.data[idx + 1];
  const b = imgData.data[idx + 2];

  // Terrarium elevation decode formula:
  // elevation_m = (R * 256 + G + B / 256) - 32768
  const elevM = r * 256 + g + b / 256 - 32768;
  const elevFt = Math.max(0, Math.round(elevM * 3.28084));

  // Minimum Safe Altitude (MSA) calculation:
  // Mountainous obstacle clearance 2000 ft if terrain >= 3000 ft MSL, else 1000 ft, rounded up to nearest 500 ft
  const clearance = elevFt >= 3000 ? 2000 : 1000;
  const msaFt = Math.max(2000, Math.ceil((elevFt + clearance) / 500) * 500);

  return { elevationFt: elevFt, msaFt };
}
