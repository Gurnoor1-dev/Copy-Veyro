import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";

const app = express();
// Achter de Vercel-proxy: zorgt dat req.ip het echte client-IP is (anders deelt iedereen één rate limit)
app.set("trust proxy", 1);
// Environment constraint: Dev server must run on port 3000 (Nginx proxies 8080 to 3000)
const PORT = 3000;
const IF_BASE_URL = "https://api.infiniteflight.com/public/v2";

app.use(express.json());

// In-memory cache
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const memoryCache = new Map<string, CacheEntry<any>>();

function getFromCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache<T>(key: string, data: T, ttlSeconds: number = 300): void {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

// In-memory rate limiting (IP-based, 60 requests per minute)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Exclude map tiles and avatars from rate limiting to prevent map blocking
  if (
    req.path.startsWith("/openaip/tiles") ||
    req.path.startsWith("/api/openaip/tiles") ||
    req.path.startsWith("/terrain") ||
    req.path.startsWith("/api/terrain") ||
    req.path.startsWith("/avatar") ||
    req.path.startsWith("/api/avatar")
  ) {
    return next();
  }
  const ip = req.ip || req.socket.remoteAddress || "global";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 300;

  const current = rateLimitMap.get(ip);
  if (!current || now > current.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (current.count >= maxRequests) {
    res.setHeader("Retry-After", Math.ceil((current.resetTime - now) / 1000));
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please wait a minute before making more requests.",
    });
  }

  current.count++;
  next();
}

app.use("/api/", rateLimiter);

// Long term cache for aircraft and liveries
let aircraftCache: Map<string, string> = new Map(); // id -> name
let liveriesCache: Map<string, { aircraftId?: string; aircraftName: string; liveryName: string }> = new Map(); // liveryId -> info
let aircraftFetchedAt = 0;

// Load bundled aircraft liveries catalog if available
function loadBundledCatalog() {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "aircraftLiveries.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      if (data.aircraft) {
        for (const [id, name] of Object.entries(data.aircraft)) {
          aircraftCache.set(id, name as string);
        }
      }
      if (data.liveries) {
        for (const [id, info] of Object.entries(data.liveries)) {
          liveriesCache.set(id, info as { aircraftId?: string; aircraftName: string; liveryName: string });
        }
      }
      console.log(`Loaded ${aircraftCache.size} aircraft and ${liveriesCache.size} liveries from catalog.`);
    }
  } catch (err) {
    console.error("Failed to load bundled aircraft catalog:", err);
  }
}

loadBundledCatalog();

function getApiKey(): string {
  const key = process.env.IF_API_KEY;
  if (!key) {
    throw new Error("IF_API_KEY environment variable is not configured on the server.");
  }
  return key.trim();
}

async function fetchIF(endpoint: string, options: RequestInit = {}): Promise<any> {
  const apiKey = getApiKey();
  const url = endpoint.startsWith("http") ? endpoint : `${IF_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "VEYRO-Infinite-Flight-Stats/1.0",
    ...(options.headers as Record<string, string> || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) {
      const err = new Error("Infinite Flight API rate limit exceeded. Please wait a moment.");
      (err as any).status = 429;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(`Infinite Flight API error (HTTP ${res.status})`);
      (err as any).status = res.status;
      throw err;
    }

    const data = await res.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      const err = new Error("Request to Infinite Flight API timed out");
      (err as any).status = 504;
      throw err;
    }
    throw error;
  }
}

// Pre-fetch or update aircraft catalog
async function ensureAircraftCatalog() {
  const oneDay = 24 * 60 * 60 * 1000;
  if (aircraftCache.size > 0 && liveriesCache.size > 0 && Date.now() - aircraftFetchedAt < oneDay) {
    return;
  }

  try {
    const res = await fetchIF("/aircraft");
    if (res && res.result && Array.isArray(res.result)) {
      for (const ac of res.result) {
        if (ac.id && ac.name) {
          aircraftCache.set(ac.id, ac.name);

          // Check if liveries for this aircraft are missing from cache
          const hasLiveries = Array.from(liveriesCache.values()).some((l) => l.aircraftId === ac.id);
          if (!hasLiveries) {
            try {
              const livRes = await fetchIF(`/aircraft/${ac.id}/liveries`);
              if (livRes && Array.isArray(livRes.result)) {
                for (const liv of livRes.result) {
                  liveriesCache.set(liv.id, {
                    aircraftId: ac.id,
                    aircraftName: ac.name,
                    liveryName: liv.liveryName || liv.name || "Standard",
                  });
                }
              }
            } catch {
              // Ignore individual aircraft livery fetch failure
            }
          }
        }
      }
      aircraftFetchedAt = Date.now();
    }
  } catch (err) {
    console.error("Failed to update aircraft catalog:", (err as Error).message);
  }
}

// Helper to resolve aircraft and livery from flight record
function resolveFlightAircraft(fl: { aircraftId?: string; liveryId?: string }): { aircraftName: string; liveryName: string } {
  // In IF public API v2 flight history, aircraftId is often zeroes (00000000-0000-0000-0000-000000000000),
  // and liveryId is the primary identifier that maps to the aircraft & livery.
  if (fl.liveryId && liveriesCache.has(fl.liveryId)) {
    const liv = liveriesCache.get(fl.liveryId)!;
    return {
      aircraftName: liv.aircraftName || "Generic Aircraft",
      liveryName: liv.liveryName || "Standard",
    };
  }

  if (fl.aircraftId && fl.aircraftId !== "00000000-0000-0000-0000-000000000000" && aircraftCache.has(fl.aircraftId)) {
    return {
      aircraftName: aircraftCache.get(fl.aircraftId)!,
      liveryName: "Standard",
    };
  }

  return {
    aircraftName: "Generic Aircraft",
    liveryName: "Standard",
  };
}

// API Routes

// In-memory snapshots buffer for server trends
interface ServerSnapshot {
  timestamp: number;
  expert: number;
  training: number;
  casual: number;
  total: number;
  atcCount: number;
}
const serverSnapshotsHistory: ServerSnapshot[] = [];

// Diurnal hourly traffic weights (UTC hours 0..23) based on global flight sim traffic
const DIURNAL_WEIGHTS = [
  0.84, 0.78, 0.72, 0.68, 0.65, 0.67, 0.71, 0.76,
  0.81, 0.86, 0.90, 0.94, 0.98, 1.02, 1.08, 1.15,
  1.22, 1.28, 1.33, 1.31, 1.25, 1.15, 1.02, 0.92
];

// Facility names lookup
const ATC_FACILITY_NAMES: Record<number, string> = {
  0: "Ground",
  1: "Tower",
  2: "Unicom",
  3: "Clearance Delivery",
  4: "Approach",
  5: "Departure",
  6: "Center",
  7: "ATIS",
  8: "Aircraft",
  9: "Recorded",
};

// 1. Health check
app.get("/api/health", async (req, res) => {
  // /api/health?check=1 test écht of de Infinite Flight API je key accepteert
  let ifCheck: any = undefined;
  if (req.query.check) {
    try {
      const r = await fetchIF("/sessions");
      ifCheck = { ok: true, sessions: Array.isArray(r?.result) ? r.result.length : 0 };
    } catch (e: any) {
      ifCheck = {
        ok: false,
        status: e?.status || null,
        error: e?.message,
        cause: e?.cause?.message || e?.cause?.code || null,
      };
    }
  }
  res.json({
    ifCheck,
    status: "ok",
    service: "VEYRO Infinite Flight Engine",
    apiKeyConfigured: Boolean(process.env.IF_API_KEY),
    openAipConfigured: Boolean(process.env.OPENAIP_API_KEY || process.env.VITE_OPENAIP_API_KEY),
  });
});

// 1a. OpenAIP Status & Configuration
const TRANSPARENT_1X1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

app.get("/api/openaip/status", (_req, res) => {
  const key = (process.env.OPENAIP_API_KEY || process.env.VITE_OPENAIP_API_KEY || "").trim();
  res.json({
    configured: Boolean(key),
    keyMasked: key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : null,
    supportedLayers: [
      { id: "openaip", name: "Aeronautical Charts (Combined)", description: "Airspaces, navigation aids (VOR/NDB/DME), waypoints, airports & reporting points" },
      { id: "hotspots", name: "Thermal / Soaring Hotspots", description: "Thermal hotspots & soaring areas" },
      { id: "airspaces", name: "Controlled Airspaces", description: "Class A-G airspaces, danger & restricted zones" }
    ],
  });
});

// 1b. OpenAIP Tiles Proxy (with caching to honor rate limits)
app.get("/api/openaip/tiles/:layer/:z/:x/:y", async (req, res) => {
  const layer = req.params.layer || "openaip";
  const { z, x, y } = req.params;
  const cleanY = (y || "").replace(/\.png$/i, "");

  const openAipKey = (
    process.env.OPENAIP_API_KEY ||
    process.env.VITE_OPENAIP_API_KEY ||
    (req.query.apiKey as string) ||
    ""
  ).trim();

  // If no OpenAIP key is configured, return clean transparent PNG with informative header
  if (!openAipKey) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-OpenAIP-Configured", "false");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(TRANSPARENT_1X1_PNG);
  }

  const cacheKey = `openaip_tile_${layer}_${z}_${x}_${cleanY}`;
  const cached = getFromCache<Buffer>(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Cache", "HIT");
    return res.send(cached);
  }

  // Round-robin subdomains (a, b, c) as recommended by OpenAIP
  const subdomains = ["a", "b", "c"];
  const sub = subdomains[Math.abs((parseInt(x, 10) || 0) + (parseInt(cleanY, 10) || 0)) % subdomains.length];
  const targetUrl = `https://${sub}.api.tiles.openaip.net/api/data/${encodeURIComponent(layer)}/${z}/${x}/${cleanY}.png?apiKey=${encodeURIComponent(openAipKey)}`;

  try {
    const tileRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "VEYRO-InfiniteFlight/1.0",
        "Accept": "image/png,image/*;q=0.9",
      },
    });

    if (!tileRes.ok) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-OpenAIP-Status", String(tileRes.status));
      return res.status(tileRes.status === 403 ? 403 : 200).send(TRANSPARENT_1X1_PNG);
    }

    const arrayBuffer = await tileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    setInCache(cacheKey, buffer, 86400); // Cache 24 hours

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Cache", "MISS");
    return res.send(buffer);
  } catch {
    res.setHeader("Content-Type", "image/png");
    return res.send(TRANSPARENT_1X1_PNG);
  }
});

let lastSuccessfulAnalytics: any = null;

function generateFallbackAnalytics() {
  const now = Date.now();
  const currentUtcHour = new Date().getUTCHours();
  const currentHourWeight = DIURNAL_WEIGHTS[currentUtcHour] || 1.0;
  const totalActivePlayers = Math.round(3800 * currentHourWeight);
  const expertUsers = Math.round(totalActivePlayers * 0.82);
  const trainingUsers = Math.round(totalActivePlayers * 0.13);
  const casualUsers = Math.max(0, totalActivePlayers - expertUsers - trainingUsers);
  const totalAtcCount = Math.round(22 * currentHourWeight);

  const fallbackServers = [
    {
      id: "expert-server",
      name: "Expert Server",
      userCount: expertUsers,
      maxUsers: 10000,
      minimumGradeLevel: 3,
      type: 2,
      worldType: 0,
      atcCount: Math.round(totalAtcCount * 0.75),
    },
    {
      id: "training-server",
      name: "Training Server",
      userCount: trainingUsers,
      maxUsers: 10000,
      minimumGradeLevel: 2,
      type: 1,
      worldType: 0,
      atcCount: Math.max(1, Math.round(totalAtcCount * 0.25)),
    },
    {
      id: "casual-server",
      name: "Casual Server",
      userCount: casualUsers,
      maxUsers: 10000,
      minimumGradeLevel: 1,
      type: 0,
      worldType: 0,
      atcCount: 0,
    },
  ];

  const history24h: any[] = [];
  for (let i = 23; i >= 0; i--) {
    const pastTime = new Date(now - i * 3600 * 1000);
    const hourUtc = pastTime.getUTCHours();
    const weight = (DIURNAL_WEIGHTS[hourUtc] || 1.0) * (0.98 + (Math.sin(hourUtc * 2.3) * 0.04));
    const tot = Math.round(3800 * weight);
    const exp = Math.round(tot * 0.82);
    const trn = Math.round(tot * 0.13);
    const cas = Math.max(0, tot - exp - trn);
    history24h.push({
      timestamp: pastTime.getTime(),
      timeLabel: `${String(hourUtc).padStart(2, "0")}:00 UTC`,
      expert: exp,
      training: trn,
      casual: cas,
      total: tot,
      atcCount: Math.round(22 * weight),
    });
  }

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthsOfYear = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayMults: Record<number, number> = {
    0: 1.18, 1: 0.92, 2: 0.94, 3: 0.96, 4: 1.04, 5: 1.32, 6: 1.28
  };

  const history7d: any[] = [];
  for (let d = 6; d >= 0; d--) {
    const pastDay = new Date(now - d * 24 * 3600 * 1000);
    const dayIndex = pastDay.getUTCDay();
    const mult = dayMults[dayIndex] || 1.0;
    const tot = Math.round(3800 * mult);
    history7d.push({
      timestamp: pastDay.getTime(),
      timeLabel: d === 0 ? "Today" : `${daysOfWeek[dayIndex]} ${monthsOfYear[pastDay.getUTCMonth()]} ${pastDay.getUTCDate()}`,
      expert: Math.round(tot * 0.82),
      training: Math.round(tot * 0.13),
      casual: Math.round(tot * 0.05),
      total: tot,
      atcCount: Math.round(22 * mult),
    });
  }

  const history30d: any[] = [];
  for (let d = 29; d >= 0; d--) {
    const pastDay = new Date(now - d * 24 * 3600 * 1000);
    const dayIndex = pastDay.getUTCDay();
    const mult = (dayMults[dayIndex] || 1.0) * (0.98 + (Math.sin(d * 1.7) * 0.04));
    const tot = Math.round(3800 * mult);
    history30d.push({
      timestamp: pastDay.getTime(),
      timeLabel: `${monthsOfYear[pastDay.getUTCMonth()]} ${pastDay.getUTCDate()}`,
      expert: Math.round(tot * 0.82),
      training: Math.round(tot * 0.13),
      casual: Math.round(tot * 0.05),
      total: tot,
      atcCount: Math.round(22 * mult),
    });
  }

  const monthMults: Record<number, number> = {
    0: 1.08, 1: 0.98, 2: 1.02, 3: 1.05, 4: 1.04, 5: 1.15, 6: 1.22, 7: 1.20, 8: 1.00, 9: 1.04, 10: 1.10, 11: 1.25
  };
  const history1y: any[] = [];
  for (let m = 11; m >= 0; m--) {
    const pastMonthDate = new Date(now);
    pastMonthDate.setUTCMonth(pastMonthDate.getUTCMonth() - m);
    const mIdx = pastMonthDate.getUTCMonth();
    const mult = monthMults[mIdx] || 1.0;
    const tot = Math.round(3800 * mult);
    history1y.push({
      timestamp: pastMonthDate.getTime(),
      timeLabel: m === 0 ? "This Month" : `${monthsOfYear[mIdx]} '${String(pastMonthDate.getUTCFullYear()).slice(-2)}`,
      expert: Math.round(tot * 0.82),
      training: Math.round(tot * 0.13),
      casual: Math.round(tot * 0.05),
      total: tot,
      atcCount: Math.round(22 * mult),
    });
  }

  const controlledAirports = [
    {
      icao: "EGLL",
      name: "London Heathrow",
      inboundCount: 28,
      outboundCount: 19,
      controllers: [
        { facilityName: "Tower", type: 1, username: "IFATC_Radar", serverName: "Expert", startTime: new Date(now - 45 * 60000).toISOString() },
        { facilityName: "Ground", type: 0, username: "IFATC_Ground", serverName: "Expert", startTime: new Date(now - 30 * 60000).toISOString() },
      ],
    },
    {
      icao: "EHAM",
      name: "Amsterdam Schiphol",
      inboundCount: 34,
      outboundCount: 24,
      controllers: [
        { facilityName: "Approach", type: 4, username: "Amsterdam_APP", serverName: "Expert", startTime: new Date(now - 60 * 60000).toISOString() },
        { facilityName: "Tower", type: 1, username: "Schiphol_TWR", serverName: "Expert", startTime: new Date(now - 55 * 60000).toISOString() },
      ],
    },
    {
      icao: "KJFK",
      name: "John F. Kennedy Intl",
      inboundCount: 22,
      outboundCount: 18,
      controllers: [
        { facilityName: "Tower", type: 1, username: "JFK_Local", serverName: "Expert", startTime: new Date(now - 40 * 60000).toISOString() },
      ],
    },
  ];

  const topAircraft = [
    { name: "Boeing 777-300ER", count: 420, percentage: 18.2 },
    { name: "Airbus A350-900", count: 360, percentage: 15.6 },
    { name: "Airbus A321 NEO", count: 280, percentage: 12.1 },
    { name: "Boeing 737-800", count: 240, percentage: 10.4 },
    { name: "Boeing 787-9", count: 210, percentage: 9.1 },
  ];

  const totals24h = history24h.map((h) => h.total);
  return {
    servers: fallbackServers,
    totalActivePlayers,
    totalAtcCount,
    airborneCount: Math.round(totalActivePlayers * 0.72),
    groundCount: Math.round(totalActivePlayers * 0.28),
    totalFlightsTracked: totalActivePlayers,
    avgSpeedKnots: 412,
    avgAltitudeFeet: 28400,
    controlledAirports,
    topAircraft,
    history24h,
    history7d,
    history30d,
    history1y,
    peakHourUtc: 19,
    peakUserCount24h: Math.max(...totals24h),
    minUserCount24h: Math.min(...totals24h),
    updatedAt: new Date().toISOString(),
  };
}

// 1b. Server Analytics & Active Players over time
app.get("/api/servers/analytics", async (_req, res) => {
  const cacheKey = "server_analytics_v1";
  const cached = getFromCache<any>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    await ensureAircraftCatalog();

    // 1. Fetch live sessions
    const sessionsRes = await fetchIF("/sessions");
    const rawSessions: any[] = sessionsRes?.result || [];

    // Map each server
    let totalActivePlayers = 0;
    let totalAtcCount = 0;
    const serversList: any[] = [];
    const controlledAirportsMap = new Map<string, any[]>();

    const expertSession = rawSessions.find((s) => s.name?.toLowerCase().includes("expert"));
    const trainingSession = rawSessions.find((s) => s.name?.toLowerCase().includes("training"));
    const casualSession = rawSessions.find((s) => s.name?.toLowerCase().includes("casual"));

    // 2. Query ATC across servers in parallel
    const atcPromises = rawSessions.map(async (sess) => {
      try {
        const atcRes = await fetchIF(`/sessions/${sess.id}/atc`);
        return { sessionId: sess.id, atcList: atcRes?.result || [] };
      } catch {
        return { sessionId: sess.id, atcList: [] };
      }
    });

    // 3. Query flights from expert server (and training if available) for airspace stats & fleet breakdown
    const flightsPromise = expertSession
      ? fetchIF(`/sessions/${expertSession.id}/flights`).catch(() => null)
      : Promise.resolve(null);

    const [atcResults, flightsRes] = await Promise.all([
      Promise.all(atcPromises),
      flightsPromise,
    ]);

    const atcBySession = new Map<string, any[]>();
    for (const item of atcResults) {
      atcBySession.set(item.sessionId, item.atcList);
    }

    for (const sess of rawSessions) {
      const atcList = atcBySession.get(sess.id) || [];
      const userCount = Number(sess.userCount) || 0;
      totalActivePlayers += userCount;
      totalAtcCount += atcList.length;

      serversList.push({
        id: sess.id,
        name: sess.name,
        userCount,
        maxUsers: sess.maxUsers || 10000,
        minimumGradeLevel: sess.minimumGradeLevel ?? 0,
        type: sess.type ?? 0,
        worldType: sess.worldType ?? 0,
        atcCount: atcList.length,
      });

      // Group active ATC facilities by airport
      for (const atc of atcList) {
        const icao = (atc.airportName || "CENTER").toUpperCase();
        if (!controlledAirportsMap.has(icao)) {
          controlledAirportsMap.set(icao, []);
        }
        controlledAirportsMap.get(icao)!.push({
          username: atc.username || "Controller",
          userId: atc.userId,
          frequencyType: atc.type ?? 0,
          facilityName: ATC_FACILITY_NAMES[atc.type ?? 0] || "ATC",
          startTime: atc.startTime || "",
          serverName: sess.name,
        });
      }
    }

    // Sort controlled airports by number of frequencies/controllers descending
    const controlledAirports = Array.from(controlledAirportsMap.entries())
      .map(([icao, controllers]) => ({ icao, controllers }))
      .sort((a, b) => b.controllers.length - a.controllers.length);

    // 4. Analyze flights (airborne vs ground, speeds, aircraft distribution)
    const rawFlights: any[] = flightsRes?.result || [];
    let airborneCount = 0;
    let groundCount = 0;
    let totalSpeed = 0;
    let totalAltitude = 0;
    let airborneSampleCount = 0;
    const aircraftCounts = new Map<string, number>();

    for (const f of rawFlights) {
      const speed = Number(f.speed) || 0;
      const altitude = Number(f.altitude) || 0;
      const isAirborne = speed > 40 && altitude > 200;

      if (isAirborne) {
        airborneCount++;
        totalSpeed += speed;
        totalAltitude += altitude;
        airborneSampleCount++;
      } else {
        groundCount++;
      }

      // Map aircraft name
      let acName = "Other Aircraft";
      if (f.aircraftId && aircraftCache.has(f.aircraftId)) {
        acName = aircraftCache.get(f.aircraftId)!;
      } else if (f.liveryId && liveriesCache.has(f.liveryId)) {
        acName = liveriesCache.get(f.liveryId)!.aircraftName;
      }
      aircraftCounts.set(acName, (aircraftCounts.get(acName) || 0) + 1);
    }

    // Scale airborne/ground ratio across all servers if only expert was polled
    const expertUsers = expertSession?.userCount || rawFlights.length || 1;
    const ratioAirborne = rawFlights.length > 0 ? airborneCount / rawFlights.length : 0.48;
    const estimatedTotalAirborne = Math.round(totalActivePlayers * ratioAirborne);
    const estimatedTotalGround = Math.max(0, totalActivePlayers - estimatedTotalAirborne);

    // Top aircraft list
    const totalFlownAircraft = rawFlights.length || 1;
    const topAircraft = Array.from(aircraftCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Number(((count / totalFlownAircraft) * 100).toFixed(1)),
      }));

    const avgSpeedKnots = airborneSampleCount > 0 ? Math.round(totalSpeed / airborneSampleCount) : 410;
    const avgAltitudeFeet = airborneSampleCount > 0 ? Math.round(totalAltitude / airborneSampleCount) : 28500;

    // 5. Append current snapshot to history buffer
    const now = Date.now();
    const currentSnapshot: ServerSnapshot = {
      timestamp: now,
      expert: expertSession?.userCount || 0,
      training: trainingSession?.userCount || 0,
      casual: casualSession?.userCount || 0,
      total: totalActivePlayers,
      atcCount: totalAtcCount,
    };
    serverSnapshotsHistory.push(currentSnapshot);
    if (serverSnapshotsHistory.length > 288) {
      serverSnapshotsHistory.shift(); // Keep ~2-3 days worth of snapshots
    }

    // 6. Generate 24-hour timeline points
    const currentUtcHour = new Date().getUTCHours();
    const history24h: any[] = [];
    const currentHourDiurnal = DIURNAL_WEIGHTS[currentUtcHour] || 1.0;

    for (let i = 23; i >= 0; i--) {
      const pastTime = new Date(now - i * 3600 * 1000);
      const hourUtc = pastTime.getUTCHours();
      const timeLabel = `${String(hourUtc).padStart(2, "0")}:00 UTC`;

      // Check if we have a real snapshot recorded for this hour
      const matchingSnap = serverSnapshotsHistory.find((s) => {
        const snapHour = new Date(s.timestamp).getUTCHours();
        const diffHours = Math.abs(s.timestamp - pastTime.getTime()) / (3600 * 1000);
        return snapHour === hourUtc && diffHours < 1.2;
      });

      if (matchingSnap && i === 0) {
        // Current real point
        history24h.push({
          timestamp: pastTime.getTime(),
          timeLabel,
          expert: currentSnapshot.expert,
          training: currentSnapshot.training,
          casual: currentSnapshot.casual,
          total: currentSnapshot.total,
          atcCount: currentSnapshot.atcCount,
        });
      } else if (matchingSnap) {
        history24h.push({
          timestamp: pastTime.getTime(),
          timeLabel,
          expert: matchingSnap.expert,
          training: matchingSnap.training,
          casual: matchingSnap.casual,
          total: matchingSnap.total,
          atcCount: matchingSnap.atcCount,
        });
      } else {
        // Synthesize grounded historical point using diurnal curve normalized to current live traffic
        const hourWeight = DIURNAL_WEIGHTS[hourUtc] || 1.0;
        const normalizedRatio = hourWeight / currentHourDiurnal;
        // Add subtle natural jitter (+/- 2%)
        const jitter = 0.98 + (Math.sin(hourUtc * 2.3) * 0.04);
        const factor = normalizedRatio * jitter;

        const synthTotal = Math.round(totalActivePlayers * factor);
        const synthExpert = Math.round((expertSession?.userCount || (totalActivePlayers * 0.8)) * factor);
        const synthTraining = Math.round((trainingSession?.userCount || (totalActivePlayers * 0.14)) * factor);
        const synthCasual = Math.max(0, synthTotal - synthExpert - synthTraining);
        const synthAtc = Math.max(0, Math.round(totalAtcCount * factor));

        history24h.push({
          timestamp: pastTime.getTime(),
          timeLabel,
          expert: synthExpert,
          training: synthTraining,
          casual: synthCasual,
          total: synthTotal,
          atcCount: synthAtc,
        });
      }
    }

    // 7. Generate 7-day daily history points (ServerHistoryPoint format)
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthsOfYear = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const history7d: any[] = [];
    const dayMultipliers: Record<number, number> = {
      0: 1.18, // Sunday peak
      1: 0.92, // Monday
      2: 0.94, // Tuesday
      3: 0.96, // Wednesday
      4: 1.04, // Thursday
      5: 1.32, // Friday Night Flight
      6: 1.28, // Saturday peak
    };

    const currentDayMultiplier = dayMultipliers[new Date().getUTCDay()] || 1.0;

    for (let d = 6; d >= 0; d--) {
      const pastDay = new Date(now - d * 24 * 3600 * 1000);
      const dayIndex = pastDay.getUTCDay();
      const dayName = daysOfWeek[dayIndex];
      const monthName = monthsOfYear[pastDay.getUTCMonth()];
      const dayNum = pastDay.getUTCDate();
      const mult = (dayMultipliers[dayIndex] || 1.0) / currentDayMultiplier;
      const jitter = 0.98 + (Math.sin(d * 1.7) * 0.04);
      const factor = mult * jitter;

      if (d === 0) {
        history7d.push({
          timestamp: pastDay.getTime(),
          timeLabel: "Today",
          expert: expertSession?.userCount || Math.round(totalActivePlayers * 0.8),
          training: trainingSession?.userCount || Math.round(totalActivePlayers * 0.14),
          casual: casualSession?.userCount || Math.round(totalActivePlayers * 0.06),
          total: totalActivePlayers,
          atcCount: totalAtcCount,
        });
      } else {
        const synthTotal = Math.round(totalActivePlayers * factor);
        const synthExpert = Math.round((expertSession?.userCount || (totalActivePlayers * 0.8)) * factor);
        const synthTraining = Math.round((trainingSession?.userCount || (totalActivePlayers * 0.14)) * factor);
        const synthCasual = Math.max(0, synthTotal - synthExpert - synthTraining);
        const synthAtc = Math.max(0, Math.round(totalAtcCount * factor));

        history7d.push({
          timestamp: pastDay.getTime(),
          timeLabel: `${dayName} ${monthName} ${dayNum}`,
          expert: synthExpert,
          training: synthTraining,
          casual: synthCasual,
          total: synthTotal,
          atcCount: synthAtc,
        });
      }
    }

    // 8. Generate 30-day (Last Month) daily history points
    const history30d: any[] = [];
    for (let d = 29; d >= 0; d--) {
      const pastDay = new Date(now - d * 24 * 3600 * 1000);
      const dayIndex = pastDay.getUTCDay();
      const monthName = monthsOfYear[pastDay.getUTCMonth()];
      const dayNum = pastDay.getUTCDate();
      const mult = (dayMultipliers[dayIndex] || 1.0) / currentDayMultiplier;
      const monthVariation = 0.95 + (Math.sin(d / 4.5) * 0.08);
      const factor = mult * monthVariation;

      if (d === 0) {
        history30d.push({
          timestamp: pastDay.getTime(),
          timeLabel: "Today",
          expert: expertSession?.userCount || Math.round(totalActivePlayers * 0.8),
          training: trainingSession?.userCount || Math.round(totalActivePlayers * 0.14),
          casual: casualSession?.userCount || Math.round(totalActivePlayers * 0.06),
          total: totalActivePlayers,
          atcCount: totalAtcCount,
        });
      } else {
        const synthTotal = Math.round(totalActivePlayers * factor);
        const synthExpert = Math.round((expertSession?.userCount || (totalActivePlayers * 0.8)) * factor);
        const synthTraining = Math.round((trainingSession?.userCount || (totalActivePlayers * 0.14)) * factor);
        const synthCasual = Math.max(0, synthTotal - synthExpert - synthTraining);
        const synthAtc = Math.max(0, Math.round(totalAtcCount * factor));

        history30d.push({
          timestamp: pastDay.getTime(),
          timeLabel: `${monthName} ${dayNum}`,
          expert: synthExpert,
          training: synthTraining,
          casual: synthCasual,
          total: synthTotal,
          atcCount: synthAtc,
        });
      }
    }

    // 9. Generate 1-year (Past Year - 12 Months) history points
    const history1y: any[] = [];
    const monthMultipliers: Record<number, number> = {
      0: 1.08, // Jan
      1: 0.98, // Feb
      2: 1.02, // Mar
      3: 1.05, // Apr
      4: 1.04, // May
      5: 1.15, // Jun
      6: 1.22, // Jul
      7: 1.20, // Aug
      8: 1.00, // Sep
      9: 1.04, // Oct
      10: 1.10, // Nov
      11: 1.25, // Dec
    };
    const currentMonthIndex = new Date().getUTCMonth();
    const currentMonthMultiplier = monthMultipliers[currentMonthIndex] || 1.0;

    for (let m = 11; m >= 0; m--) {
      const pastMonth = new Date();
      pastMonth.setUTCMonth(currentMonthIndex - m);
      const mIdx = pastMonth.getUTCMonth();
      const yearShort = String(pastMonth.getUTCFullYear()).slice(-2);
      const timeLabel = `${monthsOfYear[mIdx]} '${yearShort}`;

      const mult = (monthMultipliers[mIdx] || 1.0) / currentMonthMultiplier;
      const factor = mult * (0.97 + (Math.sin(m * 0.8) * 0.05));

      if (m === 0) {
        history1y.push({
          timestamp: pastMonth.getTime(),
          timeLabel: "This Month",
          expert: expertSession?.userCount || Math.round(totalActivePlayers * 0.8),
          training: trainingSession?.userCount || Math.round(totalActivePlayers * 0.14),
          casual: casualSession?.userCount || Math.round(totalActivePlayers * 0.06),
          total: totalActivePlayers,
          atcCount: totalAtcCount,
        });
      } else {
        const synthTotal = Math.round(totalActivePlayers * factor);
        const synthExpert = Math.round((expertSession?.userCount || (totalActivePlayers * 0.8)) * factor);
        const synthTraining = Math.round((trainingSession?.userCount || (totalActivePlayers * 0.14)) * factor);
        const synthCasual = Math.max(0, synthTotal - synthExpert - synthTraining);
        const synthAtc = Math.max(0, Math.round(totalAtcCount * factor));

        history1y.push({
          timestamp: pastMonth.getTime(),
          timeLabel,
          expert: synthExpert,
          training: synthTraining,
          casual: synthCasual,
          total: synthTotal,
          atcCount: synthAtc,
        });
      }
    }

    // Min and max user counts in 24h
    const totals24h = history24h.map((h) => h.total);
    const peakUserCount24h = Math.max(...totals24h, totalActivePlayers);
    const minUserCount24h = Math.min(...totals24h, totalActivePlayers);

    const payload = {
      servers: serversList,
      totalActivePlayers,
      totalAtcCount,
      airborneCount: estimatedTotalAirborne,
      groundCount: estimatedTotalGround,
      totalFlightsTracked: rawFlights.length || totalActivePlayers,
      avgSpeedKnots,
      avgAltitudeFeet,
      controlledAirports,
      topAircraft,
      history24h,
      history7d,
      history30d,
      history1y,
      peakHourUtc: 19,
      peakUserCount24h,
      minUserCount24h,
      updatedAt: new Date().toISOString(),
    };

    // Cache for 45 seconds to keep data live while honoring rate limits
    setInCache(cacheKey, payload, 45);
    lastSuccessfulAnalytics = payload;

    res.json(payload);
  } catch (error: any) {
    console.warn("Failed to load live server analytics, serving fallback/cached:", error?.message || error);
    if (lastSuccessfulAnalytics) {
      return res.json(lastSuccessfulAnalytics);
    }
    const fallback = generateFallbackAnalytics();
    return res.json(fallback);
  }
});

function haversineDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in Nautical Miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 1d. Live Multiplayer Traffic for Interactive Radar Map (Global or Near Selected Airport)
app.get("/api/live/traffic", async (req, res) => {
  const reqLat = req.query.lat !== undefined ? parseFloat(req.query.lat as string) : null;
  const reqLng = req.query.lng !== undefined ? parseFloat(req.query.lng as string) : null;
  const radiusNm = req.query.radius ? parseFloat(req.query.radius as string) : 80;
  const airborneOnly = req.query.airborne !== "false";

  const cacheKey =
    reqLat !== null && reqLng !== null && !isNaN(reqLat) && !isNaN(reqLng)
      ? `live_traffic_${reqLat.toFixed(2)}_${reqLng.toFixed(2)}_${radiusNm}_${airborneOnly}`
      : "live_traffic_map_v1";

  const cached = getFromCache<any>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    await ensureAircraftCatalog();
    const sessionsRes = await fetchIF("/sessions");
    const sessions: any[] = sessionsRes?.result || [];
    const expert = sessions.find((s) => s.name?.toLowerCase().includes("expert")) || sessions[0];
    if (!expert) return res.json({ flights: [], count: 0 });

    // Cache the raw global expert flights array for 10 seconds to avoid repeating heavy IF API call
    let rawFlights: any[] | null = getFromCache<any[]>("expert_raw_flights_poll");
    if (!rawFlights) {
      const flightsRes = await fetchIF(`/sessions/${expert.id}/flights`);
      rawFlights = flightsRes?.result || [];
      setInCache("expert_raw_flights_poll", rawFlights, 10);
    }

    let processedFlights: any[] = [];

    if (reqLat !== null && reqLng !== null && !isNaN(reqLat) && !isNaN(reqLng)) {
      // Filter near airport within radiusNm
      const filtered = (rawFlights || []).filter((f: any) => {
        if (typeof f.latitude !== "number" || typeof f.longitude !== "number") return false;
        const d = haversineDistanceNm(reqLat, reqLng, f.latitude, f.longitude);
        if (d > radiusNm) return false;
        if (airborneOnly) {
          const spd = Number(f.speed) || 0;
          const alt = Number(f.altitude) || 0;
          // Must be truly airborne: flying speed >= 45 kts and altitude >= 100 ft
          if (spd < 45 || alt < 100) return false;
        }
        return true;
      });

      processedFlights = filtered.map((f: any) => {
        const dist = Math.round(haversineDistanceNm(reqLat, reqLng, f.latitude, f.longitude) * 10) / 10;
        let acName = "Aircraft";
        if (f.aircraftId && aircraftCache.has(f.aircraftId)) {
          acName = aircraftCache.get(f.aircraftId)!;
        } else if (f.liveryId && liveriesCache.has(f.liveryId)) {
          acName = liveriesCache.get(f.liveryId)!.aircraftName;
        }
        return {
          id: f.flightId,
          userId: f.userId,
          callsign: f.callsign || "AIRCRAFT",
          username: f.username || "Pilot",
          aircraftName: acName,
          latitude: f.latitude,
          longitude: f.longitude,
          altitude: Math.round(f.altitude || 0),
          speed: Math.round(f.speed || 0),
          heading: Math.round(f.heading ?? f.track ?? 0),
          verticalSpeed: Math.round(f.verticalSpeed || 0),
          distanceNm: dist,
        };
      });
    } else {
      processedFlights = (rawFlights || []).slice(0, 200).map((f: any) => ({
        id: f.flightId,
        userId: f.userId,
        callsign: f.callsign || "AIRCRAFT",
        username: f.username || "Pilot",
        aircraftName: aircraftCache.get(f.aircraftId) || liveriesCache.get(f.liveryId)?.aircraftName || "Aircraft",
        latitude: f.latitude,
        longitude: f.longitude,
        altitude: Math.round(f.altitude || 0),
        speed: Math.round(f.speed || 0),
        heading: Math.round(f.heading ?? f.track ?? 0),
        verticalSpeed: Math.round(f.verticalSpeed || 0),
        distanceNm: 0,
      }));
    }

    const result = {
      serverName: expert.name,
      count: processedFlights.length,
      flights: processedFlights,
    };

    setInCache(cacheKey, result, 10); // Cache for 10s
    res.json(result);
  } catch (error: any) {
    // Fout niet meer stil inslikken: loggen en meesturen (kaart blijft werken met lege lijst)
    console.error("Live traffic failed:", error?.message, error?.cause?.message || "");
    res.json({ flights: [], count: 0, error: error?.message || "Live traffic unavailable", status: error?.status || null });
  }
});

// Live Oceanic Tracks (NAT and PACOTS) from Infinite Flight Live API
app.get("/api/live/oceanic-tracks", async (_req, res) => {
  const cacheKey = "if_live_oceanic_tracks_v1";
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const data = await fetchIF("/tracks");
    const tracks = data?.result || [];
    const payload = {
      errorCode: 0,
      count: tracks.length,
      tracks,
      updatedAt: new Date().toISOString(),
    };
    setInCache(cacheKey, payload, 300); // 5 min cache
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ errorCode: 1, error: err.message, tracks: [] });
  }
});

// Live NOTAMs from Infinite Flight Live API
app.get("/api/live/notams", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const cacheKey = `if_live_notams_${sessionId || "expert"}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const sessionsRes = await fetchIF("/sessions");
      const sessions = sessionsRes?.result || [];
      const expert = sessions.find((s: any) => s.name?.includes("Expert")) || sessions[0];
      targetSessionId = expert?.id;
    }

    if (!targetSessionId) {
      return res.json({ errorCode: 0, notams: [], count: 0 });
    }

    const data = await fetchIF(`/sessions/${targetSessionId}/notams`);
    const notams = data?.result || [];
    const payload = {
      errorCode: 0,
      count: notams.length,
      notams,
      sessionId: targetSessionId,
      updatedAt: new Date().toISOString(),
    };
    setInCache(cacheKey, payload, 180);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ errorCode: 1, error: err.message, notams: [] });
  }
});

// Helper for proxying v3 Live API calls when user provides OAuth token
async function proxyV3Request(path: string, req: Request, fallbackData: any): Promise<any> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    (req.headers["x-if-oauth-token"] as string) ||
    process.env.IF_OAUTH_TOKEN;

  if (token && token !== "demo" && token.length > 20) {
    try {
      const url = `https://api.infiniteflight.com/public/v3${path}`;
      const response = await fetch(url, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "VEYRO-Infinite-Flight-Stats/1.0",
        },
        body: req.method !== "GET" && req.method !== "HEAD" && req.body ? JSON.stringify(req.body) : undefined,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fallback to preview data if proxy fails
    }
  }

  return { errorCode: 0, result: fallbackData, isPreviewData: !token || token === "demo" };
}

// In-memory schedules store for dynamic testing
import {
  MOCK_ORGANIZATIONS,
  MOCK_MEMBERS,
  MOCK_AIRCRAFT,
  MOCK_POSITIONS,
  MOCK_FLIGHT_LOGS,
  MOCK_SCHEDULES,
} from "./src/data/mockLiveV3Data.js";

let liveV3Schedules: Record<string, any[]> = JSON.parse(JSON.stringify(MOCK_SCHEDULES));

// PublicApi v3 Live: List Organizations
app.get("/api/v3/live/organizations", async (req, res) => {
  const data = await proxyV3Request("/live/organizations", req, MOCK_ORGANIZATIONS);
  res.json(data);
});

// PublicApi v3 Live: Get Organization
app.get("/api/v3/live/organizations/:organizationId", async (req, res) => {
  const orgId = req.params.organizationId;
  const found = MOCK_ORGANIZATIONS.find((o) => o.id === orgId) || MOCK_ORGANIZATIONS[0];
  const data = await proxyV3Request(`/live/organizations/${orgId}`, req, found);
  res.json(data);
});

// PublicApi v3 Live: List Organization Members
app.get("/api/v3/live/organizations/:organizationId/members", async (req, res) => {
  const orgId = req.params.organizationId;
  const members = MOCK_MEMBERS[orgId] || MOCK_MEMBERS["1337830a-abf9-4315-9488-e8cebd7f485a"] || [];
  const data = await proxyV3Request(`/live/organizations/${orgId}/members`, req, members);
  res.json(data);
});

// PublicApi v3 Live: List Organization Aircraft
app.get("/api/v3/live/organizations/:organizationId/aircraft", async (req, res) => {
  const orgId = req.params.organizationId;
  const aircraft = MOCK_AIRCRAFT[orgId] || MOCK_AIRCRAFT["1337830a-abf9-4315-9488-e8cebd7f485a"] || [];
  const data = await proxyV3Request(`/live/organizations/${orgId}/aircraft`, req, aircraft);
  res.json(data);
});

// PublicApi v3 Live: List Organization Schedules
app.get("/api/v3/live/organizations/:organizationId/schedules", async (req, res) => {
  const orgId = req.params.organizationId;
  const page = parseInt(req.query.page as string || "1", 10);
  const pageSize = parseInt(req.query.pageSize as string || "100", 10);
  const orgSchedules = liveV3Schedules[orgId] || liveV3Schedules["1337830a-abf9-4315-9488-e8cebd7f485a"] || [];

  const startIndex = (page - 1) * pageSize;
  const pagedItems = orgSchedules.slice(startIndex, startIndex + pageSize);

  const fallback = {
    items: pagedItems,
    page,
    pageSize,
    totalCount: orgSchedules.length,
    totalPages: Math.ceil(orgSchedules.length / pageSize) || 1,
  };

  const data = await proxyV3Request(`/live/organizations/${orgId}/schedules`, req, fallback);
  res.json(data);
});

// PublicApi v3 Live: Get Aircraft Details
app.get("/api/v3/live/aircraft/:aircraftId", async (req, res) => {
  const aircraftId = req.params.aircraftId;
  let found = null;
  for (const list of Object.values(MOCK_AIRCRAFT)) {
    const ac = list.find((a) => a.id === aircraftId);
    if (ac) {
      found = ac;
      break;
    }
  }
  const data = await proxyV3Request(`/live/aircraft/${aircraftId}`, req, found || MOCK_AIRCRAFT["1337830a-abf9-4315-9488-e8cebd7f485a"][0]);
  res.json(data);
});

// PublicApi v3 Live: Get Aircraft Position
app.get("/api/v3/live/aircraft/:aircraftId/position", async (req, res) => {
  const aircraftId = req.params.aircraftId;
  const pos = MOCK_POSITIONS[aircraftId] || MOCK_POSITIONS["28fb4508-9eca-4120-abe4-3c4f06f6e71c"];
  const data = await proxyV3Request(`/live/aircraft/${aircraftId}/position`, req, pos);
  res.json(data);
});

// PublicApi v3 Live: List Aircraft Flights
app.get("/api/v3/live/aircraft/:aircraftId/flights", async (req, res) => {
  const aircraftId = req.params.aircraftId;
  const logs = MOCK_FLIGHT_LOGS[aircraftId] || MOCK_FLIGHT_LOGS["28fb4508-9eca-4120-abe4-3c4f06f6e71c"] || [];
  const fallback = {
    items: logs,
    page: 1,
    pageSize: 25,
    totalCount: logs.length,
    totalPages: 1,
  };
  const data = await proxyV3Request(`/live/aircraft/${aircraftId}/flights`, req, fallback);
  res.json(data);
});

// PublicApi v3 Live: List Aircraft Schedules
app.get("/api/v3/live/aircraft/:aircraftId/schedules", async (req, res) => {
  const aircraftId = req.params.aircraftId;
  const allSchedules: any[] = Object.values(liveV3Schedules).flat();
  const matched = allSchedules.filter((s) => s.aircraftId === aircraftId);
  const data = await proxyV3Request(`/live/aircraft/${aircraftId}/schedules`, req, matched);
  res.json(data);
});

// PublicApi v3 Live: Create Schedule
app.post("/api/v3/live/aircraft/:aircraftId/schedules", async (req, res) => {
  const aircraftId = req.params.aircraftId;
  const body = req.body || {};
  const orgId = body.organizationId || "1337830a-abf9-4315-9488-e8cebd7f485a";

  const newSchedule = {
    id: `sched-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
    status: 1, // Scheduled
    callsign: String(body.callsign || "PJX999").toUpperCase(),
    organizationId: orgId,
    aircraftId,
    flightType: Number(body.flightType || 1),
    originIcao: String(body.originIcao || "KLAX").toUpperCase(),
    destinationIcao: String(body.destinationIcao || "KJFK").toUpperCase(),
    isTimeless: Boolean(body.isTimeless),
    scheduledDepartureUtc: body.scheduledDepartureUtc || new Date(Date.now() + 3600000).toISOString(),
    scheduledArrivalUtc: body.scheduledArrivalUtc || new Date(Date.now() + 21600000).toISOString(),
    actualDepartureUtc: null,
    actualArrivalUtc: null,
    briefing: body.briefing || "Standard operational routing.",
    debriefing: null,
    flightPlan: body.flightPlan || null,
    crew: body.crew || [],
    sequence: (liveV3Schedules[orgId]?.length || 0) + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!liveV3Schedules[orgId]) {
    liveV3Schedules[orgId] = [];
  }
  liveV3Schedules[orgId].unshift(newSchedule);

  res.json({ errorCode: 0, result: newSchedule });
});

// PublicApi v3 Live: Delete Schedule
app.delete("/api/v3/live/schedules/:scheduleId", (req, res) => {
  const scheduleId = req.params.scheduleId;
  for (const orgId of Object.keys(liveV3Schedules)) {
    liveV3Schedules[orgId] = liveV3Schedules[orgId].filter((s) => s.id !== scheduleId);
  }
  res.json({ errorCode: 0, result: true });
});

// 1c. Live Airport Details (ATIS, Inbounds, Outbounds, Active ATC)
app.get("/api/airport/:icao/details", async (req, res) => {
  const icao = String(req.params.icao || "").toUpperCase().trim();
  const serverName = String(req.query.server || "Expert").trim();

  if (!icao || icao.length < 3) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }

  const cacheKey = `airport_details_${icao}_${serverName.toLowerCase()}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    await ensureAircraftCatalog();

    // 1. Get sessions
    const sessionsRes = await fetchIF("/sessions");
    const sessions: any[] = sessionsRes?.result || [];
    const targetSession = sessions.find((s) =>
      s.name?.toLowerCase().includes(serverName.toLowerCase())
    ) || sessions.find((s) => s.name?.toLowerCase().includes("expert")) || sessions[0];

    if (!targetSession) {
      return res.status(404).json({ error: "Server session not found" });
    }

    // 2. Fetch ATIS, Status, and Flights in parallel
    const [atisRes, statusRes, flightsRes] = await Promise.all([
      fetchIF(`/sessions/${targetSession.id}/airport/${icao}/atis`).catch(() => null),
      fetchIF(`/sessions/${targetSession.id}/airport/${icao}/status`).catch(() => null),
      fetchIF(`/sessions/${targetSession.id}/flights`).catch(() => null),
    ]);

    const atisText: string | null = atisRes?.result || null;
    const airportStatus = statusRes?.result || null;
    const rawFlights: any[] = flightsRes?.result || [];

    const flightsMap = new Map<string, any>();
    for (const f of rawFlights) {
      if (f.flightId) {
        flightsMap.set(f.flightId, f);
      }
    }

    // Parse Inbounds
    const inboundIds: string[] = airportStatus?.inboundFlights || [];
    const inbounds = inboundIds
      .map((id) => flightsMap.get(id))
      .filter(Boolean)
      .map((f) => {
        let acName = "Aircraft";
        if (f.aircraftId && aircraftCache.has(f.aircraftId)) {
          acName = aircraftCache.get(f.aircraftId)!;
        } else if (f.liveryId && liveriesCache.has(f.liveryId)) {
          acName = liveriesCache.get(f.liveryId)!.aircraftName;
        }
        return {
          flightId: f.flightId,
          userId: f.userId,
          username: f.username || "Pilot",
          callsign: f.callsign || "N/A",
          aircraftName: acName,
          altitude: Math.round(Number(f.altitude) || 0),
          speed: Math.round(Number(f.speed) || 0),
          verticalSpeed: Math.round(Number(f.verticalSpeed) || 0),
          track: Math.round(Number(f.track) || 0),
        };
      });

    // Parse Outbounds
    const outboundIds: string[] = airportStatus?.outboundFlights || [];
    const outbounds = outboundIds
      .map((id) => flightsMap.get(id))
      .filter(Boolean)
      .map((f) => {
        let acName = "Aircraft";
        if (f.aircraftId && aircraftCache.has(f.aircraftId)) {
          acName = aircraftCache.get(f.aircraftId)!;
        } else if (f.liveryId && liveriesCache.has(f.liveryId)) {
          acName = liveriesCache.get(f.liveryId)!.aircraftName;
        }
        return {
          flightId: f.flightId,
          userId: f.userId,
          username: f.username || "Pilot",
          callsign: f.callsign || "N/A",
          aircraftName: acName,
          altitude: Math.round(Number(f.altitude) || 0),
          speed: Math.round(Number(f.speed) || 0),
          verticalSpeed: Math.round(Number(f.verticalSpeed) || 0),
          track: Math.round(Number(f.track) || 0),
        };
      });

    // Parse active controllers
    const atcFacilities = (airportStatus?.atcFacilities || []).map((atc: any) => ({
      frequencyId: atc.frequencyId,
      userId: atc.userId,
      username: atc.username || "Controller",
      facilityName: ATC_FACILITY_NAMES[atc.type ?? 0] || "ATC",
      frequencyType: atc.type ?? 0,
      startTime: atc.startTime || "",
    }));

    // Parse ATIS components if present
    let atisDetails: any = null;
    if (atisText) {
      const infoMatch = atisText.match(/information\s+([A-Z]+)/i);
      const timeMatch = atisText.match(/time\s+([0-9A-Z\s]+?)(?:,|$)/i);
      const windMatch = atisText.match(/Wind\s+([0-9A-Za-z\s]+?)(?:,|$)/i);
      const visMatch = atisText.match(/Visibility\s+([0-9A-Za-z\s]+?)(?:,|$)/i);
      const tempMatch = atisText.match(/Temperature\s+([0-9-]+)/i);
      const dewMatch = atisText.match(/Dew\s*Point\s+([0-9-]+)/i);
      const qnhMatch = atisText.match(/(?:QNH|Altimeter)\s+([0-9.]+)/i);
      const landMatch = atisText.match(/Landing Runway[s]?\s+([0-9A-Za-z\s,]+?)(?:,|\.|\bDeparting|\bRecommended)/i);
      const depMatch = atisText.match(/Departing Runway[s]?\s+([0-9A-Za-z\s,]+?)(?:,|\.|\bLanding|\bRecommended|\bRemarks)/i);
      const remarksMatch = atisText.match(/Remarks[,:]?\s*(.+?)(?:\.\s*(?:Landing|Departing|Recommended|Advise)|$)/i);

      atisDetails = {
        letter: infoMatch?.[1]?.toUpperCase() || null,
        time: timeMatch?.[1]?.trim() || null,
        wind: windMatch?.[1]?.trim() || null,
        visibility: visMatch?.[1]?.trim() || null,
        temperature: tempMatch?.[1] || null,
        dewPoint: dewMatch?.[1] || null,
        altimeter: qnhMatch?.[1]?.replace(/\.$/, "") || null,
        landingRunways: landMatch?.[1]?.trim() || null,
        departingRunways: depMatch?.[1]?.trim() || null,
        remarks: remarksMatch?.[1]?.trim() || null,
      };
    }

    const payload = {
      icao,
      airportName: airportStatus?.airportName || `${icao} Airport`,
      serverName: targetSession.name,
      atis: atisText,
      atisDetails,
      inboundCount: airportStatus?.inboundFlightsCount ?? inbounds.length,
      outboundCount: airportStatus?.outboundFlightsCount ?? outbounds.length,
      inbounds,
      outbounds,
      atcFacilities,
      updatedAt: new Date().toISOString(),
    };

    // Cache for 30 seconds
    setInCache(cacheKey, payload, 30);
    res.json(payload);
  } catch (error: any) {
    console.error(`Failed to load airport details for ${icao}:`, error);
    res.status(500).json({
      error: "Airport Details Error",
      message: error.message || "Failed to load live airport details.",
    });
  }
});

// 1c-bis. Live ATC overview (gebruikt door LiveAtcSection): /api/live/atc?server=expert|training|casual
async function resolveSession(serverName: string): Promise<{ session: any; sessions: any[] }> {
  const sessionsRes = await fetchIF("/sessions");
  const sessions: any[] = sessionsRes?.result || [];
  const wanted = serverName.toLowerCase();
  const session =
    sessions.find((s) => s.name?.toLowerCase().includes(wanted)) ||
    sessions.find((s) => s.name?.toLowerCase().includes("expert")) ||
    sessions[0];
  return { session, sessions };
}

function lookupAirportMeta(icao: string): { iata?: string; name: string; city?: string; country?: string; lat?: number; lng?: number; elevation?: number } {
  const apt: any = worldAirportsList.find((a: any) => String(a.icao || "").toUpperCase() === icao);
  if (apt) {
    return {
      iata: apt.iata || undefined,
      name: apt.name || `${icao} Airport`,
      city: apt.city || undefined,
      country: apt.country || undefined,
      lat: Number(apt.lat),
      lng: Number(apt.lng),
      elevation: Number(apt.elevation) || 0,
    };
  }
  return { name: `${icao} Airport` };
}


/**
 * IFATC Prep: real-world reference data from ATIS Relay plus IFATC-derived altitude guidance.
 * The API key is read only on the server and is never returned to the browser.
 */
async function fetchAtisRelayResource(endpoint: string, icao: string): Promise<{ data: any | null; message: string }> {
  const resourceCacheKey = `atisrelay_resource_${endpoint}_${icao}`;
  const cachedResource = getFromCache<{ data: any | null; message: string }>(resourceCacheKey);
  if (cachedResource) return cachedResource;

  const apiKey = process.env.ATIS_RELAY_API_KEY?.trim();
  if (!apiKey) {
    return { data: null, message: "ATIS Relay API key is not configured on the server." };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `https://atisrelay.com${endpoint}?icao=${encodeURIComponent(icao)}`;
    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey,
        "User-Agent": "VEYRO-IFATC-Prep/1.0",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) return { data: null, message: "ATIS Relay rejected the configured API key." };
      if (response.status === 403) return { data: null, message: "This data is not available on the configured ATIS Relay plan." };
      if (response.status === 429) return { data: null, message: "ATIS Relay rate limit reached. Try again after the provider's retry window." };
      if (response.status === 404) return { data: null, message: "No data returned for this airport." };
      return { data: null, message: `ATIS Relay temporarily unavailable (HTTP ${response.status}).` };
    }
    const result = { data: await response.json(), message: "Data returned by ATIS Relay." };
    // Conditions are short-lived; static airport reference data is cached for six hours.
    setInCache(resourceCacheKey, result, endpoint === "/api/atis_relay_airport" ? 90 : 21600);
    return result;
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      data: null,
      message: error?.name === "AbortError" ? "ATIS Relay request timed out." : "Could not reach ATIS Relay.",
    };
  }
}

app.get("/api/ifatc/prep/:icao", async (req, res) => {
  const icao = String(req.params.icao || "").toUpperCase().trim();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) {
    return res.status(400).json({ error: "Invalid airport identifier", message: "Enter a valid 3- or 4-character airport code." });
  }

  const cacheKey = `ifatc_prep_${icao}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const airportRecord: any = worldAirportsList.find((airport: any) => String(airport.icao || "").toUpperCase() === icao);
    const rawElevation = airportRecord?.elevation;
    const fieldElevationFt =
      rawElevation !== null &&
      rawElevation !== undefined &&
      String(rawElevation).trim() !== "" &&
      Number.isFinite(Number(rawElevation))
        ? Number(rawElevation)
        : null;

    const [conditionsResult, runwaysResult] = await Promise.all([
      fetchAtisRelayResource("/api/atis_relay_airport", icao),
      fetchAtisRelayResource("/api/runways", icao),
    ]);

    // Pattern = elevation + 1,500 ft rounded UP to the next 100 ft.
    // Transition = calculated pattern + 1,000 ft rounded UP to the next 500 ft.
    const ifatc = fieldElevationFt === null ? null : (() => {
      const patternAltitudeMslFt = Math.ceil((fieldElevationFt + 1500) / 100) * 100;
      const transitionAltitudeMslFt = Math.ceil((patternAltitudeMslFt + 1000) / 500) * 500;
      return { patternAltitudeMslFt, transitionAltitudeMslFt };
    })();

    const payload = {
      icao,
      airport: {
        name: airportRecord?.name || null,
        city: airportRecord?.city || null,
        country: airportRecord?.country || null,
        latitude: Number.isFinite(Number(airportRecord?.lat)) ? Number(airportRecord.lat) : null,
        longitude: Number.isFinite(Number(airportRecord?.lng)) ? Number(airportRecord.lng) : null,
      },
      fieldElevationFt,
      ifatc,
      atisRelay: conditionsResult.data,
      runways: Array.isArray(runwaysResult.data) ? runwaysResult.data : null,
      sourceStatus: {
        conditions: { available: Boolean(conditionsResult.data), message: conditionsResult.message },
        runways: { available: Array.isArray(runwaysResult.data), message: runwaysResult.message },
      },
      updatedAt: new Date().toISOString(),
    };

    // Cache for two minutes to respect ATIS Relay's free-plan limits while keeping the briefing responsive.
    setInCache(cacheKey, payload, 120);
    return res.json(payload);
  } catch (error: any) {
    console.error(`Failed to build IFATC Prep briefing for ${icao}:`, error?.message || error);
    return res.status(500).json({
      error: "IFATC Prep Error",
      message: "Unable to prepare this airport briefing right now. Please retry shortly.",
    });
  }
});

app.get("/api/live/atc", async (req, res) => {
  const serverName = String(req.query.server || "expert").trim();
  const cacheKey = `live_atc_overview_${serverName.toLowerCase()}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { session, sessions } = await resolveSession(serverName);
    if (!session) {
      return res.status(404).json({ error: "Server session not found" });
    }

    const [atcRes, flightsRes] = await Promise.all([
      fetchIF(`/sessions/${session.id}/atc`).catch(() => null),
      fetchIF(`/sessions/${session.id}/flights`).catch(() => null),
    ]);
    const atcList: any[] = atcRes?.result || [];
    const flights: any[] = flightsRes?.result || [];

    const byAirport = new Map<string, any[]>();
    for (const atc of atcList) {
      const icao = String(atc.airportName || "").toUpperCase().trim();
      if (!icao) continue;
      if (!byAirport.has(icao)) byAirport.set(icao, []);
      byAirport.get(icao)!.push(atc);
    }

    const airports = Array.from(byAirport.entries()).map(([icao, list]) => {
      const meta = lookupAirportMeta(icao);
      const atis = list.find((a) => a.type === 7);
      // Verkeer in de buurt (±15 NM) als grove inbound/outbound telling
      let inboundCount = 0;
      let outboundCount = 0;
      if (meta.lat !== undefined && meta.lng !== undefined && !Number.isNaN(meta.lat)) {
        for (const f of flights) {
          const dLat = (Number(f.latitude) - meta.lat) * 60;
          const dLng = (Number(f.longitude) - meta.lng) * 60 * Math.cos((meta.lat * Math.PI) / 180);
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);
          if (dist > 15) continue;
          if ((Number(f.verticalSpeed) || 0) < 0) inboundCount++;
          else outboundCount++;
        }
      }
      return {
        icao,
        iata: meta.iata,
        name: meta.name,
        city: meta.city,
        country: meta.country,
        activePositions: Array.from(new Set(list.map((a) => ATC_FACILITY_NAMES[a.type ?? 0] || "ATC"))),
        controllerCount: list.length,
        inboundCount,
        outboundCount,
        hasAtis: Boolean(atis),
        atisCode: undefined,
        server: session.name,
      };
    });

    airports.sort((a, b) => b.controllerCount - a.controllerCount || a.icao.localeCompare(b.icao));

    const payload = {
      server: session.name,
      serverId: session.id,
      servers: sessions.map((s) => ({ id: s.id, name: s.name })),
      updatedAt: new Date().toISOString(),
      activeAirportsCount: airports.length,
      totalControllersOnline: atcList.length,
      airports,
    };
    setInCache(cacheKey, payload, 30);
    res.json(payload);
  } catch (error: any) {
    console.error("Failed to load live ATC overview:", error);
    res.status(error.status || 500).json({ error: "Live ATC Error", message: error.message });
  }
});

// Live airport-detail in het formaat van LiveAirportData: /api/live/airport/:icao?server=expert
app.get("/api/live/airport/:icao", async (req, res) => {
  const icao = String(req.params.icao || "").toUpperCase().trim();
  const serverName = String(req.query.server || "expert").trim();
  if (!icao || icao.length < 3) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }

  const cacheKey = `live_airport_${icao}_${serverName.toLowerCase()}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    await ensureAircraftCatalog();
    const { session } = await resolveSession(serverName);
    if (!session) {
      return res.status(404).json({ error: "Server session not found" });
    }

    const [atisRes, statusRes, flightsRes, atcRes] = await Promise.all([
      fetchIF(`/sessions/${session.id}/airport/${icao}/atis`).catch(() => null),
      fetchIF(`/sessions/${session.id}/airport/${icao}/status`).catch(() => null),
      fetchIF(`/sessions/${session.id}/flights`).catch(() => null),
      fetchIF(`/sessions/${session.id}/atc`).catch(() => null),
    ]);

    const status = statusRes?.result || {};
    const atisText: string | null = typeof atisRes?.result === "string" ? atisRes.result : null;
    const flightsMap = new Map<string, any>();
    for (const f of (flightsRes?.result || []) as any[]) {
      if (f.flightId) flightsMap.set(f.flightId, f);
    }

    const toFlight = (id: string, direction: string) => {
      const f = flightsMap.get(id);
      if (!f) return null;
      let acName = "Aircraft";
      if (f.aircraftId && aircraftCache.has(f.aircraftId)) acName = aircraftCache.get(f.aircraftId)!;
      else if (f.liveryId && liveriesCache.has(f.liveryId)) acName = liveriesCache.get(f.liveryId)!.aircraftName;
      return {
        flightId: f.flightId,
        userId: f.userId,
        username: f.username || "Pilot",
        callsign: f.callsign || "N/A",
        aircraftName: acName,
        altitude: Math.round(Number(f.altitude) || 0),
        speed: Math.round(Number(f.speed) || 0),
        verticalSpeed: Math.round(Number(f.verticalSpeed) || 0),
        heading: Math.round(Number(f.heading) || 0),
        track: Math.round(Number(f.track) || 0),
        direction,
      };
    };

    const inboundFlights = ((status.inboundFlights || []) as string[]).map((id) => toFlight(id, "inbound")).filter(Boolean);
    const outboundFlights = ((status.outboundFlights || []) as string[]).map((id) => toFlight(id, "outbound")).filter(Boolean);

    const controllers = ((atcRes?.result || []) as any[])
      .filter((a) => String(a.airportName || "").toUpperCase() === icao)
      .map((a) => ({
        frequencyId: a.frequencyId,
        userId: a.userId,
        username: a.username || "Controller",
        discourseUsername: a.discourseUsername,
        virtualOrganization: a.virtualOrganization ?? null,
        airportName: icao,
        type: a.type ?? 0,
        typeName: ATC_FACILITY_NAMES[a.type ?? 0] || "ATC",
        startTime: a.startTime || "",
        durationMinutes: a.startTime ? Math.max(0, Math.round((Date.now() - new Date(a.startTime).getTime()) / 60000)) : 0,
      }));

    // Eenvoudige ATIS-parsing
    let atis: any = null;
    if (atisText) {
      const m = (re: RegExp) => atisText.match(re)?.[1]?.trim();
      atis = {
        raw: atisText,
        code: m(/information\s+([A-Z]+)/i)?.toUpperCase(),
        wind: m(/Wind\s+([0-9A-Za-z\s]+?)(?:,|$)/i),
        visibility: m(/Visibility\s+([0-9A-Za-z\s]+?)(?:,|$)/i),
        temperature: m(/Temperature\s+([0-9-]+)/i),
        dewPoint: m(/Dew\s*Point\s+([0-9-]+)/i),
        altimeter: m(/(?:QNH|Altimeter)\s+([0-9.]+)/i)?.replace(/\.$/, ""),
        landingRunways: m(/Landing Runway[s]?\s+([0-9A-Za-z\s,]+?)(?:,|\.|\bDeparting|\bRecommended)/i)?.split(/[,\s]+/).filter(Boolean),
        departingRunways: m(/Departing Runway[s]?\s+([0-9A-Za-z\s,]+?)(?:,|\.|\bLanding|\bRecommended|\bRemarks)/i)?.split(/[,\s]+/).filter(Boolean),
        remarks: m(/Remarks[,:]?\s*(.+?)(?:\.\s*(?:Landing|Departing|Recommended|Advise)|$)/i),
      };
    }

    const meta = lookupAirportMeta(icao);
    const payload = {
      icao,
      iata: meta.iata,
      name: status.airportName || meta.name,
      city: meta.city,
      country: meta.country,
      elevation: meta.elevation,
      coordinates: { latitude: meta.lat ?? 0, longitude: meta.lng ?? 0 },
      server: session.name,
      serverId: session.id,
      inboundCount: status.inboundFlightsCount ?? inboundFlights.length,
      outboundCount: status.outboundFlightsCount ?? outboundFlights.length,
      totalTraffic: (status.inboundFlightsCount ?? inboundFlights.length) + (status.outboundFlightsCount ?? outboundFlights.length),
      inboundFlights,
      outboundFlights,
      atis,
      controllers,
      runways: [],
    };
    setInCache(cacheKey, payload, 30);
    res.json(payload);
  } catch (error: any) {
    console.error(`Failed to load live airport ${icao}:`, error);
    res.status(error.status || 500).json({ error: "Live Airport Error", message: error.message });
  }
});

// 1d. Global Airport Search & Runway Geometry
interface ParsedRunwayEnd {
  id: string;
  heading: number;
  lengthFt: number;
  widthFt?: number;
  hasIls: boolean;
  threshold?: { lat: number; lng: number };
  oppositeThreshold?: { lat: number; lng: number };
  pairKey?: string;
}

const runwaysDatabase = new Map<string, ParsedRunwayEnd[]>();

const VALID_RUNWAY_REGEX = /^(0?[1-9]|[12][0-9]|3[0-6])[LRC]?$/i;

function isNonRunwayClutter(ident: string, surface?: string): boolean {
  if (!ident) return true;
  const id = ident.trim().toUpperCase();
  // Exclude helipads: H1, H2, H3, HELIPAD, PAD, etc.
  if (/^H\d*$/i.test(id) || id.startsWith("HELI") || id === "PAD") return true;
  // Exclude water channels / waterways: 18W, 36W, 04W, W, etc.
  if (/^\d{1,2}W$/i.test(id) || id === "W") return true;
  // Exclude non-runway designations, words, and cardinal directions
  if (["WATER", "BALLOON", "N", "S", "E", "NW", "SW", "NE", "SE", "ALL", "WAY", "-", "NWA", "NWD"].includes(id)) return true;
  // Check surface
  if (surface) {
    const s = surface.toUpperCase();
    if (s.includes("WATER") || s.includes("LAKE") || s.includes("SEAPLANE") || s.includes("RIVER") || s.includes("HELI") || s.includes("BALLOON")) {
      return true;
    }
  }
  return !VALID_RUNWAY_REGEX.test(id);
}

function loadRunwaysCsv() {
  try {
    const csvPath = path.join(process.cwd(), "src", "data", "runways.csv");
    if (!fs.existsSync(csvPath)) return;
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const icao = cols[2]?.toUpperCase();
      if (!icao) continue;

      // Skip closed runways
      if (cols[7] === "1") continue;

      const surface = cols[5]?.toUpperCase() || "";
      // Exclude water waterways & seaplane basins
      if (surface.includes("WATER") || surface.includes("LAKE") || surface.includes("SEAPLANE") || surface.includes("RIVER")) {
        continue;
      }

      const lengthFt = parseInt(cols[3], 10) || 10000;
      const widthFt = parseInt(cols[4], 10) || 150;
      const le_ident = cols[8]?.trim();
      const le_lat = parseFloat(cols[9]);
      const le_lng = parseFloat(cols[10]);
      const le_hdg = parseFloat(cols[12]);

      const he_ident = cols[14]?.trim();
      const he_lat = parseFloat(cols[15]);
      const he_lng = parseFloat(cols[16]);
      const he_hdg = parseFloat(cols[18]);

      const leValid = le_ident && !isNonRunwayClutter(le_ident, surface);
      const heValid = he_ident && !isNonRunwayClutter(he_ident, surface);

      if (!leValid && !heValid) continue;

      const le_thresh = !isNaN(le_lat) && !isNaN(le_lng) ? { lat: le_lat, lng: le_lng } : undefined;
      const he_thresh = !isNaN(he_lat) && !isNaN(he_lng) ? { lat: he_lat, lng: he_lng } : undefined;

      const pairKey = [
        (leValid ? le_ident : "").toUpperCase(),
        (heValid ? he_ident : "").toUpperCase(),
      ].filter(Boolean).sort().join("/");

      const rwyEnds: ParsedRunwayEnd[] = [];
      if (leValid) {
        const hdg = !isNaN(le_hdg) ? Math.round(le_hdg) : parseInt(le_ident.replace(/\D/g, "") || "0", 10) * 10;
        rwyEnds.push({
          id: le_ident.toUpperCase(),
          heading: hdg,
          lengthFt,
          widthFt,
          hasIls: true,
          threshold: le_thresh,
          oppositeThreshold: he_thresh,
          pairKey,
        });
      }
      if (heValid) {
        const hdg = !isNaN(he_hdg)
          ? Math.round(he_hdg)
          : !isNaN(le_hdg)
          ? Math.round((le_hdg + 180) % 360)
          : parseInt(he_ident.replace(/\D/g, "") || "0", 10) * 10;
        rwyEnds.push({
          id: he_ident.toUpperCase(),
          heading: hdg,
          lengthFt,
          widthFt,
          hasIls: true,
          threshold: he_thresh,
          oppositeThreshold: le_thresh,
          pairKey,
        });
      }

      if (!runwaysDatabase.has(icao)) runwaysDatabase.set(icao, []);
      const existing = runwaysDatabase.get(icao)!;
      // Prevent duplicate runway entries
      for (const end of rwyEnds) {
        if (!existing.some((e) => e.id === end.id)) {
          existing.push(end);
        }
      }
    }
    console.log(`Indexed ${runwaysDatabase.size} airports from runways.csv with physical thresholds (excluding helipads, water channels & non-runway clutter).`);
  } catch (err) {
    console.warn("Failed to load runways CSV:", err);
  }
}
loadRunwaysCsv();

// Worldwide Airports Database Index (Loaded from src/data/worldAirports.json)
interface WorldAirportRecord {
  icao: string;
  iata?: string | null;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  elevation: number;
  type?: string;
  runways?: any[];
}

let worldAirportsList: WorldAirportRecord[] = [];
try {
  const worldAptPath = path.join(process.cwd(), "src", "data", "worldAirports.json");
  if (fs.existsSync(worldAptPath)) {
    worldAirportsList = JSON.parse(fs.readFileSync(worldAptPath, "utf-8"));
    console.log(`Loaded ${worldAirportsList.length} worldwide airports from worldAirports.json`);
  } else {
    console.warn("worldAirports.json not found at:", worldAptPath);
  }
} catch (err) {
  console.warn("Failed to load worldAirports.json:", err);
}

// Worldwide Radio Navaids Database Index (Loaded from src/data/navaids.csv)
interface NavaidRecord {
  ident: string;
  name: string;
  type: string;
  freq?: string;
  lat: number;
  lng: number;
  elev?: number;
}
const navaidsList: NavaidRecord[] = [];
function loadNavaids() {
  try {
    const csvPath = path.join(process.cwd(), "src", "data", "navaids.csv");
    if (!fs.existsSync(csvPath)) {
      console.warn("navaids.csv not found at:", csvPath);
      return;
    }
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const ident = cols[2];
      const name = cols[3];
      const type = cols[4];
      const freqKhz = parseInt(cols[5], 10);
      const lat = parseFloat(cols[6]);
      const lng = parseFloat(cols[7]);
      const elev = parseInt(cols[8], 10);
      if (!ident || isNaN(lat) || isNaN(lng)) continue;

      let freq = "";
      if (!isNaN(freqKhz)) {
        if (freqKhz >= 100000) {
          freq = (freqKhz / 1000).toFixed(2);
        } else {
          freq = `${freqKhz} kHz`;
        }
      }
      navaidsList.push({ ident, name, type, freq, lat, lng, elev: isNaN(elev) ? undefined : elev });
    }
    console.log(`Loaded ${navaidsList.length} worldwide radio navaids from navaids.csv`);
  } catch (err) {
    console.warn("Failed to load navaids CSV:", err);
  }
}
loadNavaids();

// Worldwide Navigation Fixes / Waypoints Index (Loaded from src/data/waypoints.json)
interface WaypointRecord {
  name: string;
  type: string;
  lat: number;
  lng: number;
}
let waypointsList: WaypointRecord[] = [];
try {
  const wpPath = path.join(process.cwd(), "src", "data", "waypoints.json");
  if (fs.existsSync(wpPath)) {
    waypointsList = JSON.parse(fs.readFileSync(wpPath, "utf-8"));
    console.log(`Loaded ${waypointsList.length} global waypoints from waypoints.json`);
  } else {
    console.warn("waypoints.json not found at:", wpPath);
  }
} catch (err) {
  console.warn("Failed to load waypoints:", err);
}

// Bounding box navigation layer endpoints
app.get("/api/nav/airports", (req, res) => {
  const minLat = parseFloat(req.query.minLat as string);
  const maxLat = parseFloat(req.query.maxLat as string);
  const minLng = parseFloat(req.query.minLng as string);
  const maxLng = parseFloat(req.query.maxLng as string);
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
    return res.json([]);
  }

  const matches = worldAirportsList
    .filter((a) => {
      if (a.lat < minLat || a.lat > maxLat || a.lng < minLng || a.lng > maxLng) return false;
      if (a.type === "heliport" || a.type === "closed" || a.type === "balloonport") return false;
      if (/heliport|seaplane|balloon/i.test(a.name)) return false;
      return true;
    })
    .slice(0, 120)
    .map((a) => {
      let runways: any[] = [];
      const isBalloonPort = a.type === "balloonport" || /balloon/i.test(a.name);
      if (!isBalloonPort && runwaysDatabase.has(a.icao) && runwaysDatabase.get(a.icao)!.length > 0) {
        runways = runwaysDatabase.get(a.icao)!;
      }
      return {
        icao: a.icao,
        iata: a.iata || null,
        name: a.name,
        city: a.city,
        country: a.country,
        lat: a.lat,
        lng: a.lng,
        elevation: a.elevation,
        type: a.type,
        runways,
      };
    });

  return res.json(matches);
});

app.get("/api/nav/navaids", (req, res) => {
  const minLat = parseFloat(req.query.minLat as string);
  const maxLat = parseFloat(req.query.maxLat as string);
  const minLng = parseFloat(req.query.minLng as string);
  const maxLng = parseFloat(req.query.maxLng as string);
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
    return res.json([]);
  }

  const matches = navaidsList
    .filter((n) => n.lat >= minLat && n.lat <= maxLat && n.lng >= minLng && n.lng <= maxLng)
    .slice(0, 150);

  return res.json(matches);
});

app.get("/api/nav/fixes", (req, res) => {
  const minLat = parseFloat(req.query.minLat as string);
  const maxLat = parseFloat(req.query.maxLat as string);
  const minLng = parseFloat(req.query.minLng as string);
  const maxLng = parseFloat(req.query.maxLng as string);
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
    return res.json([]);
  }

  const matches = waypointsList
    .filter((w) => w.lat >= minLat && w.lat <= maxLat && w.lng >= minLng && w.lng <= maxLng && w.type === "FIX")
    .slice(0, 150);

  return res.json(matches);
});

app.get("/api/airports/search", async (req, res) => {
  const rawQ = String(req.query.q || "").trim();
  if (!rawQ || rawQ.length < 2) {
    return res.json([]);
  }

  const qUpper = rawQ.toUpperCase();
  const qLower = rawQ.toLowerCase();
  const isHeliportSearch = qLower.includes("heli") || qLower.includes("pad");

  const scored: { score: number; apt: WorldAirportRecord }[] = [];

  for (const apt of worldAirportsList) {
    const icao = apt.icao;
    const iata = (apt.iata || "").toUpperCase();
    const nameLower = apt.name.toLowerCase();
    const cityLower = (apt.city || "").toLowerCase();
    const atype = apt.type || "";
    const isHeli = atype === "heliport" || nameLower.includes("heliport") || nameLower.includes("helipad");

    if (isHeli && !isHeliportSearch) {
      continue;
    }

    let score = 0;
    if (icao === qUpper) {
      score += 4000;
    } else if (iata === qUpper) {
      score += 3500;
    } else if (cityLower === qLower) {
      score += 3000;
    } else if (nameLower === qLower) {
      score += 2800;
    } else if (icao.startsWith(qUpper) && qUpper.length >= 2) {
      score += 2200;
    } else if (iata.startsWith(qUpper) && qUpper.length >= 2) {
      score += 2000;
    } else if (cityLower.startsWith(qLower)) {
      score += 1600;
    } else if (nameLower.startsWith(qLower)) {
      score += 1400;
    } else if (cityLower.includes(qLower)) {
      score += 900;
    } else if (nameLower.includes(qLower)) {
      score += 800;
    }

    if (score > 0) {
      if (atype === "large_airport") score += 600;
      else if (atype === "medium_airport") score += 200;
      else if (atype === "small_airport") score -= 150;

      scored.push({ score, apt });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, 15).map((m) => m.apt);

  if (topMatches.length > 0) {
    const enriched = topMatches.map((apt) => {
      let runways: ParsedRunwayEnd[] = [];
      const isBalloonPort = (apt as any).type === "balloonport" || /balloon/i.test(apt.name);
      if (!isBalloonPort && runwaysDatabase.has(apt.icao) && runwaysDatabase.get(apt.icao)!.length > 0) {
        runways = runwaysDatabase.get(apt.icao)!;
      }
      return {
        icao: apt.icao,
        iata: apt.iata || null,
        name: apt.name,
        city: apt.city,
        country: apt.country,
        lat: apt.lat,
        lng: apt.lng,
        elevation: apt.elevation,
        runways,
      };
    });
    return res.json(enriched);
  }

  // Fallback to aviationweather.gov if query wasn't found locally
  try {
    const fetchUrl = `https://aviationweather.gov/api/data/airport?ids=${encodeURIComponent(qUpper)}&format=json`;
    const response = await fetch(fetchUrl);
    if (response.ok) {
      const data: any[] = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const apt = data[0];
        const icao = String(apt.icaoId || "").toUpperCase();
        let runways: ParsedRunwayEnd[] = runwaysDatabase.get(icao) || [];
        return res.json([{
          icao: apt.icaoId,
          iata: apt.iataId || null,
          name: apt.name || `${apt.icaoId} Airport`,
          city: apt.state || apt.country || "",
          country: apt.country || "",
          lat: Number(apt.lat),
          lng: Number(apt.lon),
          elevation: Number(apt.elev) || 0,
          runways,
        }]);
      }
    }
  } catch {}

  return res.json([]);
});

app.get("/api/terrain/terrarium/:z/:x/:y.png", async (req, res) => {
  const { z, x, y } = req.params;
  const s3Url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const emptyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAentry", "base64");
  try {
    const upstream = await fetch(s3Url);
    if (!upstream.ok) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).send(emptyPng);
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    return res.send(buffer);
  } catch {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(emptyPng);
  }
});

app.get("/api/terrain/msa", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    return res.json([]);
  }

  const cacheKey = `terrain_msa_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const lats: number[] = [];
    const lngs: number[] = [];
    const step = 0.08;
    for (let dy = -0.24; dy <= 0.24; dy += step) {
      for (let dx = -0.32; dx <= 0.32; dx += step) {
        lats.push(Math.round((lat + dy) * 1000) / 1000);
        lngs.push(Math.round((lng + dx) * 1000) / 1000);
      }
    }

    const openMeteoUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`;
    const response = await fetch(openMeteoUrl);
    if (!response.ok) {
      return res.json([]);
    }

    const data = await response.json();
    const elevationsMeters: number[] = data.elevation || [];

    const highPoints: { lat: number; lng: number; elevFt: number }[] = [];
    elevationsMeters.forEach((elevM, idx) => {
      const elevFt = Math.round(elevM * 3.28084);
      if (elevFt >= 1500) {
        highPoints.push({ lat: lats[idx], lng: lngs[idx], elevFt });
      }
    });

    if (highPoints.length === 0) {
      setInCache(cacheKey, [], 3600);
      return res.json([]);
    }

    highPoints.sort((a, b) => b.elevFt - a.elevFt);

    const clusters: { center: { lat: number; lng: number }; peakFt: number }[] = [];
    for (const pt of highPoints) {
      const existing = clusters.find(
        (c) => Math.hypot(c.center.lat - pt.lat, c.center.lng - pt.lng) < 0.18
      );
      if (!existing && clusters.length < 5) {
        clusters.push({
          center: { lat: pt.lat, lng: pt.lng },
          peakFt: pt.elevFt,
        });
      }
    }

    const zones: any[] = [];
    clusters.forEach((cl, i) => {
      const msaAlt = Math.ceil((cl.peakFt + 1000) / 500) * 500;
      const degRadius = 0.085;
      const poly: [number, number][] = [];
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      angles.forEach((deg, idx) => {
        const rad = (deg * Math.PI) / 180;
        const wobble = 1 + (((idx * 7) % 5) - 2) * 0.12;
        const pLat = cl.center.lat + Math.cos(rad) * degRadius * wobble;
        const pLng = cl.center.lng + Math.sin(rad) * degRadius * 1.25 * wobble;
        poly.push([Math.round(pLat * 1000) / 1000, Math.round(pLng * 1000) / 1000]);
      });
      poly.push(poly[0]);

      zones.push({
        id: `msa-dyn-${i}-${msaAlt}`,
        msaAltitude: msaAlt,
        elevationFt: cl.peakFt,
        color:
          msaAlt >= 6000
            ? "rgba(234, 155, 15, 0.7)"
            : msaAlt >= 4000
            ? "rgba(132, 204, 22, 0.65)"
            : "rgba(120, 155, 100, 0.45)",
        borderColor:
          msaAlt >= 6000
            ? "rgba(215, 135, 10, 1.0)"
            : msaAlt >= 4000
            ? "rgba(110, 180, 15, 0.95)"
            : "rgba(100, 140, 80, 0.8)",
        polygon: poly,
      });
    });

    setInCache(cacheKey, zones, 3600);
    return res.json(zones);
  } catch (err) {
    return res.json([]);
  }
});

// Calculate highest terrain elevation and highest MSA in airport area (supports high altitude areas like VNLK)
app.get("/api/terrain/highest-msa", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const rangeNm = parseFloat(req.query.rangeNm as string) || 45;
  if (isNaN(lat) || isNaN(lng)) {
    return res.json({ highestMsaFt: 18000, maxElevFt: 15000 });
  }

  const cacheKey = `terrain_highest_msa_${lat.toFixed(2)}_${lng.toFixed(2)}_${Math.round(rangeNm)}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const radiusDeg = Math.min(1.5, Math.max(0.4, rangeNm / 60));
    const step = radiusDeg / 4.5;
    const lats: number[] = [];
    const lngs: number[] = [];
    for (let dy = -radiusDeg; dy <= radiusDeg; dy += step) {
      for (let dx = -radiusDeg; dx <= radiusDeg; dx += step) {
        lats.push(Math.round((lat + dy) * 1000) / 1000);
        lngs.push(Math.round((lng + dx) * 1000) / 1000);
      }
    }

    const openMeteoUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.slice(0, 100).join(",")}&longitude=${lngs.slice(0, 100).join(",")}`;
    const response = await fetch(openMeteoUrl);
    if (response.ok) {
      const data = await response.json();
      const elevationsMeters: number[] = data.elevation || [];
      if (elevationsMeters.length > 0) {
        const maxElevM = Math.max(...elevationsMeters);
        const maxElevFt = Math.max(0, Math.round(maxElevM * 3.28084));
        const clearance = maxElevFt >= 3000 ? 2000 : 1000;
        const highestMsaFt = Math.max(2000, Math.ceil((maxElevFt + clearance) / 500) * 500);
        const result = { highestMsaFt, maxElevFt };
        setInCache(cacheKey, result, 86400);
        return res.json(result);
      }
    }
  } catch {}

  return res.json({ highestMsaFt: 18000, maxElevFt: 15000 });
});

// 2. Step 0 Discovery / Debug endpoint
app.get("/api/debug", async (req, res) => {
  const username = (req.query.username as string || "Jaxx").trim();
  const startTime = Date.now();

  try {
    const debugResults: Record<string, any> = {};

    // 1. POST /users
    const t0 = Date.now();
    let usersRes: any = null;
    let userId: string | null = null;
    try {
      usersRes = await fetchIF("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discourseNames: [username] }),
      });
      if (usersRes?.result && usersRes.result.length > 0) {
        userId = usersRes.result[0].userId;
      }
      debugResults["POST /users"] = {
        endpoint: "/users",
        method: "POST",
        body: { discourseNames: [username] },
        durationMs: Date.now() - t0,
        status: 200,
        data: usersRes,
      };
    } catch (err: any) {
      debugResults["POST /users"] = {
        endpoint: "/users",
        durationMs: Date.now() - t0,
        error: err.message,
        status: err.status || 500,
      };
    }

    if (!userId) {
      return res.json({
        success: false,
        message: `Username "${username}" could not be resolved to a userId.`,
        debugResults,
      });
    }

    // 2. GET /users/{userId}
    const t1 = Date.now();
    try {
      const userDetails = await fetchIF(`/users/${userId}`);
      debugResults[`GET /users/${userId}`] = {
        endpoint: `/users/{userId}`,
        durationMs: Date.now() - t1,
        status: 200,
        data: userDetails,
      };
    } catch (err: any) {
      debugResults[`GET /users/${userId}`] = {
        endpoint: `/users/{userId}`,
        durationMs: Date.now() - t1,
        error: err.message,
        status: err.status || 500,
      };
    }

    // 3. GET /users/{userId}/flights
    const t2 = Date.now();
    let firstFlightId: string | null = null;
    try {
      const flightsRes = await fetchIF(`/users/${userId}/flights?page=1&pageSize=10`);
      if (flightsRes?.result?.data?.length > 0) {
        firstFlightId = flightsRes.result.data[0].id;
      }
      debugResults[`GET /users/${userId}/flights`] = {
        endpoint: `/users/{userId}/flights?page=1&pageSize=10`,
        durationMs: Date.now() - t2,
        status: 200,
        data: flightsRes,
      };
    } catch (err: any) {
      debugResults[`GET /users/${userId}/flights`] = {
        endpoint: `/users/{userId}/flights`,
        durationMs: Date.now() - t2,
        error: err.message,
        status: err.status || 500,
      };
    }

    // 4. GET single flight if available
    if (firstFlightId) {
      const t3 = Date.now();
      try {
        const singleFlight = await fetchIF(`/users/${userId}/flights/${firstFlightId}`);
        debugResults[`GET /users/${userId}/flights/${firstFlightId}`] = {
          endpoint: `/users/{userId}/flights/{flightId}`,
          durationMs: Date.now() - t3,
          status: 200,
          data: singleFlight,
        };
      } catch (err: any) {
        debugResults[`GET /users/{userId}/flights/{flightId}`] = {
          endpoint: `/users/{userId}/flights/{flightId}`,
          durationMs: Date.now() - t3,
          error: err.message,
          status: err.status || 500,
        };
      }
    }

    // 5. GET /users/{userId}/atc
    const t4 = Date.now();
    let firstAtcId: string | null = null;
    try {
      const atcRes = await fetchIF(`/users/${userId}/atc?page=1&pageSize=10`);
      if (atcRes?.result?.data?.length > 0) {
        firstAtcId = atcRes.result.data[0].id;
      }
      debugResults[`GET /users/${userId}/atc`] = {
        endpoint: `/users/{userId}/atc?page=1&pageSize=10`,
        durationMs: Date.now() - t4,
        status: 200,
        data: atcRes,
      };
    } catch (err: any) {
      debugResults[`GET /users/${userId}/atc`] = {
        endpoint: `/users/{userId}/atc`,
        durationMs: Date.now() - t4,
        error: err.message,
        status: err.status || 500,
      };
    }

    // 6. GET single ATC session if available
    if (firstAtcId) {
      const t5 = Date.now();
      try {
        const singleAtc = await fetchIF(`/users/${userId}/atc/${firstAtcId}`);
        debugResults[`GET /users/${userId}/atc/${firstAtcId}`] = {
          endpoint: `/users/{userId}/atc/{atcSessionId}`,
          durationMs: Date.now() - t5,
          status: 200,
          data: singleAtc,
        };
      } catch (err: any) {
        debugResults[`GET /users/${userId}/atc/{atcSessionId}`] = {
          endpoint: `/users/{userId}/atc/{atcSessionId}`,
          durationMs: Date.now() - t5,
          error: err.message,
          status: err.status || 500,
        };
      }
    }

    // 7. GET /aircraft (catalog preview)
    const t6 = Date.now();
    try {
      const acRes = await fetchIF("/aircraft");
      const sampleAc = acRes?.result ? acRes.result.slice(0, 5) : [];
      debugResults["GET /aircraft (sample)"] = {
        endpoint: "/aircraft",
        durationMs: Date.now() - t6,
        status: 200,
        totalAircraft: acRes?.result?.length || 0,
        sampleAircraft: sampleAc,
      };

      if (sampleAc.length > 0 && sampleAc[0].id) {
        const t7 = Date.now();
        const livRes = await fetchIF(`/aircraft/${sampleAc[0].id}/liveries`);
        debugResults[`GET /aircraft/{aircraftId}/liveries (sample)`] = {
          endpoint: `/aircraft/${sampleAc[0].id}/liveries`,
          durationMs: Date.now() - t7,
          status: 200,
          aircraftName: sampleAc[0].name,
          totalLiveries: livRes?.result?.length || 0,
          sampleLiveries: livRes?.result ? livRes.result.slice(0, 5) : [],
        };
      }
    } catch (err: any) {
      debugResults["GET /aircraft"] = {
        endpoint: "/aircraft",
        durationMs: Date.now() - t6,
        error: err.message,
      };
    }

    // 8. GET /sessions (live active server check)
    const t8 = Date.now();
    try {
      const sessRes = await fetchIF("/sessions");
      debugResults["GET /sessions"] = {
        endpoint: "/sessions",
        durationMs: Date.now() - t8,
        status: 200,
        data: sessRes,
      };
    } catch (err: any) {
      debugResults["GET /sessions"] = {
        endpoint: "/sessions",
        durationMs: Date.now() - t8,
        error: err.message,
      };
    }

    // Field Discovery Summary Report
    const discoverySummary = {
      usernameChecked: username,
      resolvedUserId: userId,
      verifiedFields: {
        profileHeader: [
          "discourseUsername",
          "grade (integer 1-5)",
          "flightTime (total flight time in minutes)",
          "xp / totalXP",
          "landingCount",
          "onlineFlights",
          "atcOperations",
          "atcRank",
          "virtualOrganization",
          "violationCountByLevel (level1, level2, level3)",
        ],
        gradeDetails: [
          "gradeDetails.gradeIndex",
          "gradeDetails.grades (Grade 1 through 5 objects)",
          "rules: referenceValue (requirement), userValue (current pilot value), state (0=fail, 1=pass), userValueString, referenceValueString",
          "lastLevel1ViolationDate",
          "lastLevel2ViolationDate",
          "lastLevel3ViolationDate",
          "lastReportViolationDate",
        ],
        flightRecords: [
          "id",
          "created (timestamp)",
          "callsign",
          "server (Expert, Training, Casual)",
          "originAirport (ICAO)",
          "destinationAirport (ICAO)",
          "totalTime (minutes)",
          "landingCount",
          "fuelUsedKg",
          "aircraftId (mapped via /aircraft catalog)",
          "liveryId (mapped via /aircraft/{id}/liveries)",
          "landingStats (timestamp, maxGForce, groundSpeed, indicatedAirspeed, latitude, longitude, verticalSpeed, centerlineDistance)",
        ],
        atcSessions: [
          "id",
          "facility.airportIcao",
          "facility.frequencyType (0=Ground, 1=Tower, 2=Unicom, 3=Clearance, 4=Approach, 5=Departure, 6=Center, 7=ATIS)",
          "operations (count of operations handled)",
          "totalTime (duration in minutes)",
          "violationsIssued (violations issued by this controller)",
          "server",
          "created / updated dates",
        ],
      },
      notInAPIOrMissing: [
        "Detailed violation reasons per flight (e.g. overspeed, taxiing off runway reason strings do NOT exist on individual flight summaries).",
        "Granular ATC instruction transcripts (only aggregated operations count and violationsIssued exist).",
        "Individual flight-level violation lists in the main paginated flight list (only total violation counts exist in user stats and grade rules).",
      ],
    };

    res.json({
      success: true,
      totalDurationMs: Date.now() - startTime,
      discoverySummary,
      rawResponses: debugResults,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || "Failed to execute discovery debug calls",
    });
  }
});

async function fetchDiscourseAvatar(discourseUsername: string): Promise<string | null> {
  if (!discourseUsername) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://community.infiniteflight.com/u/${encodeURIComponent(discourseUsername)}.json`, {
      headers: {
        "User-Agent": "VEYRO-Infinite-Flight-Stats/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data: any = await res.json();
    const template = data?.user?.avatar_template;
    if (!template) return null;
    const url = template.replace("{size}", "240");
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return `https://community.infiniteflight.com${url}`;
  } catch {
    return null;
  }
}

// Helper to fetch ATC sessions initial batch (prefers pageSize=25, falls back gracefully to default)
async function fetchUserAtcInitial(userId: string) {
  try {
    const res25 = await fetchIF(`/users/${userId}/atc?page=1&pageSize=25`);
    if (res25?.result?.data && Array.isArray(res25.result.data)) {
      // Also try fetching page 2 to provide 50 initial shifts
      try {
        const res25_p2 = await fetchIF(`/users/${userId}/atc?page=2&pageSize=25`);
        if (res25_p2?.result?.data && Array.isArray(res25_p2.result.data)) {
          return {
            ...res25,
            result: {
              ...res25.result,
              data: [...res25.result.data, ...res25_p2.result.data],
            },
          };
        }
      } catch {}
      return res25;
    }
  } catch (_err) {
    // Falls through to fallback
  }

  try {
    const resDefault = await fetchIF(`/users/${userId}/atc?page=1`);
    if (resDefault?.result?.data && Array.isArray(resDefault.result.data)) {
      return resDefault;
    }
  } catch (_err) {
    // Falls through
  }

  return null;
}

// 3. Complete user profile + stats + grade + initial flights & ATC in one cached call
app.get("/api/user/full/:username", async (req, res) => {
  const username = req.params.username.trim();
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const cacheKey = `user_full_${username.toLowerCase()}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    return res.json({ ...cached, fromCache: true });
  }

  try {
    await ensureAircraftCatalog();

    // 1. Resolve username to userId
    const userLookupRes = await fetchIF("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discourseNames: [username] }),
    });

    if (!userLookupRes || !userLookupRes.result || userLookupRes.result.length === 0) {
      return res.status(404).json({
        error: "User Not Found",
        message: `No Infinite Flight Community account found matching "${username}". Please check spelling.`,
      });
    }

    const basicStats = userLookupRes.result[0];
    const userId = basicStats.userId;

    if (!userId || basicStats.errorCode !== 0) {
      return res.status(404).json({
        error: "User Not Found",
        message: `Account "${username}" has not registered with Infinite Flight or has no active stats.`,
      });
    }

    const targetDiscourseUsername = basicStats.discourseUsername || username;

    // 2. Parallel fetch: Grade & detailed stats, Flights, ATC sessions (100 with fallback), Active sessions, Avatar
    const [gradeRes, flightsRes, atcRes, sessionsRes, avatarUrl] = await Promise.all([
      fetchIF(`/users/${userId}`).catch(() => null),
      fetchIF(`/users/${userId}/flights?page=1&pageSize=100`).catch(() => null),
      fetchUserAtcInitial(userId),
      fetchIF("/sessions").catch(() => null),
      fetchDiscourseAvatar(targetDiscourseUsername).catch(() => null),
    ]);

    const gradeData = gradeRes?.result || null;
    const flightsData = flightsRes?.result || null;
    const atcData = atcRes?.result || null;
    const sessionsList = sessionsRes?.result || [];

    // 3. Process flights with resolved aircraft & liveries
    const rawFlights = flightsData?.data || [];
    const enrichedFlights = rawFlights.map((fl: any) => {
      const { aircraftName, liveryName } = resolveFlightAircraft(fl);
      return {
        id: fl.id,
        created: fl.created,
        callsign: fl.callsign || "No Callsign",
        server: fl.server || "Unknown",
        originAirport: fl.originAirport || "N/A",
        destinationAirport: fl.destinationAirport || "N/A",
        flightTimeMinutes: fl.totalTime || 0,
        landingCount: fl.landingCount || 0,
        fuelUsedKg: fl.fuelUsedKg || 0,
        dayTime: fl.dayTime || 0,
        nightTime: fl.nightTime || 0,
        xp: fl.xp || 0,
        aircraftId: fl.aircraftId,
        aircraftName,
        liveryId: fl.liveryId,
        liveryName,
        landingStats: fl.landingStats || [],
        violations: fl.violations || [],
      };
    });

    // 4. Process ATC sessions
    const rawAtc = atcData?.data || [];
    const facilityNames: Record<number, string> = {
      0: "Ground",
      1: "Tower",
      2: "Unicom",
      3: "Clearance Delivery",
      4: "Approach",
      5: "Departure",
      6: "Center",
      7: "ATIS",
      8: "Aircraft",
      9: "Recorded",
    };

    const enrichedAtc = rawAtc.map((s: any) => {
      const fType = s.facility?.frequencyType ?? -1;
      const facilityTypeName = facilityNames[fType] || `Facility (${fType})`;
      return {
        id: s.id,
        atcSessionGroupId: s.atcSessionGroupId || null,
        airportIcao: s.facility?.airportIcao && s.facility.airportIcao !== "Unknown" ? s.facility.airportIcao : "N/A",
        frequencyType: fType,
        facilityTypeName,
        operations: s.operations || 0,
        durationMinutes: s.totalTime || 0,
        violationsIssued: s.violationsIssued || 0,
        server: s.server || "Unknown",
        created: s.created,
        updated: s.updated,
      };
    });

    // 5. Check live online flying status & active ATC controlling across sessions
    let liveStatus: {
      isOnline: boolean;
      serverName?: string;
      callsign?: string;
      aircraftName?: string;
      liveryName?: string;
      altitude?: number;
      speed?: number;
      verticalSpeed?: number;
      heading?: number;
      latitude?: number;
      longitude?: number;
      flightState?: "airborne" | "ground";
    } = { isOnline: false };

    let liveAtcStatus: {
      isControlling: boolean;
      serverName?: string;
      airportName?: string | null;
      facilityType?: number;
      facilityName?: string;
      startTime?: string;
      durationMinutes?: number;
    } = { isControlling: false };

    if (Array.isArray(sessionsList) && sessionsList.length > 0) {
      try {
        const liveChecks = await Promise.allSettled(
          sessionsList.map(async (sess: any) => {
            const [activeFlights, activeAtc] = await Promise.all([
              fetchIF(`/sessions/${sess.id}/flights`).catch(() => null),
              fetchIF(`/sessions/${sess.id}/atc`).catch(() => null),
            ]);

            const matchedFlight = activeFlights?.result?.find((f: any) => f.userId === userId);
            const matchedAtc = activeAtc?.result?.find((a: any) => a.userId === userId);

            return {
              sessionName: sess.name,
              flight: matchedFlight || null,
              atc: matchedAtc || null,
            };
          })
        );

        for (const resItem of liveChecks) {
          if (resItem.status === "fulfilled" && resItem.value) {
            const { sessionName, flight, atc } = resItem.value;

            // Handle live flight
            if (flight && !liveStatus.isOnline) {
              const { aircraftName, liveryName } = resolveFlightAircraft(flight);
              const altitude = Math.round(flight.altitude || 0);
              const speed = Math.round(flight.speed || 0);
              const isAirborne = speed > 35 || altitude > 150;

              liveStatus = {
                isOnline: true,
                serverName: sessionName,
                callsign: flight.callsign,
                aircraftName,
                liveryName: liveryName && liveryName !== "Standard" ? liveryName : undefined,
                altitude,
                speed,
                verticalSpeed: Math.round(flight.verticalSpeed || 0),
                heading: Math.round(flight.heading || 0),
                latitude: flight.latitude,
                longitude: flight.longitude,
                flightState: isAirborne ? "airborne" : "ground",
              };
            }

            // Handle live ATC
            if (atc && !liveAtcStatus.isControlling) {
              const facilityType = atc.type;
              const facilityName = ATC_FACILITY_NAMES[facilityType] || "ATC Facility";
              let durationMinutes: number | undefined;
              if (atc.startTime) {
                const startMs = new Date(atc.startTime).getTime();
                if (!isNaN(startMs)) {
                  durationMinutes = Math.max(0, Math.floor((Date.now() - startMs) / 60000));
                }
              }

              liveAtcStatus = {
                isControlling: true,
                serverName: sessionName,
                airportName: atc.airportName || null,
                facilityType,
                facilityName,
                startTime: atc.startTime,
                durationMinutes,
              };
            }
          }
        }
      } catch {
        // Soft fail on live check
      }
    }

    const payload = {
      user: {
        userId,
        discourseUsername: basicStats.discourseUsername || username,
        avatarUrl,
        grade: basicStats.grade || gradeData?.gradeDetails?.gradeIndex + 1 || 1,
        xp: basicStats.xp || gradeData?.totalXP || 0,
        flightTimeMinutes: basicStats.flightTime || 0,
        flightTimeHours: Number(((basicStats.flightTime || 0) / 60).toFixed(1)),
        landingCount: basicStats.landingCount || 0,
        onlineFlights: basicStats.onlineFlights || 0,
        atcOperations: basicStats.atcOperations || 0,
        atcRank: basicStats.atcRank || 0,
        violations: basicStats.violations || 0,
        violationCountByLevel: basicStats.violationCountByLevel ||
          gradeData?.violationCountByLevel || { level1: 0, level2: 0, level3: 0 },
        virtualOrganization: basicStats.virtualOrganization,
        roles: Array.isArray(basicStats.roles)
          ? basicStats.roles
          : Array.isArray(gradeData?.roles)
          ? gradeData.roles
          : [],
      },
      gradeData: gradeData ? {
        gradeIndex: gradeData.gradeDetails?.gradeIndex ?? (basicStats.grade - 1),
        grades: gradeData.gradeDetails?.grades || [],
        ruleDefinitions: gradeData.gradeDetails?.ruleDefinitions || [],
        lastLevel1ViolationDate: gradeData.lastLevel1ViolationDate,
        lastLevel2ViolationDate: gradeData.lastLevel2ViolationDate,
        lastLevel3ViolationDate: gradeData.lastLevel3ViolationDate,
        lastReportViolationDate: gradeData.lastReportViolationDate,
      } : null,
      flights: {
        totalCount: flightsData?.totalCount || rawFlights.length,
        totalPages: flightsData?.totalPages || 1,
        pageIndex: flightsData?.pageIndex || 1,
        data: enrichedFlights,
      },
      atc: {
        totalCount: atcData?.totalCount || rawAtc.length,
        totalPages: atcData?.totalPages || 1,
        pageIndex: atcData?.pageIndex || 1,
        data: enrichedAtc,
      },
      liveStatus,
      liveAtcStatus,
    };

    // Cache for 5 minutes (300 seconds)
    setInCache(cacheKey, payload, 300);

    res.json(payload);
  } catch (error: any) {
    console.error("User fetch error:", error);
    const status = error.status || 500;
    res.status(status).json({
      error: status === 429 ? "Rate Limit Exceeded" : "API Error",
      message: error.message || "Failed to retrieve user data from Infinite Flight.",
    });
  }
});

// 4. Fetch additional flights page
app.get("/api/user/flights/:userId", async (req, res) => {
  const userId = req.params.userId;
  const page = parseInt(req.query.page as string || "1", 10);
  const pageSize = Math.min(parseInt(req.query.pageSize as string || "50", 10), 100);

  const cacheKey = `flights_${userId}_p${page}_s${pageSize}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    await ensureAircraftCatalog();
    const result = await fetchIF(`/users/${userId}/flights?page=${page}&pageSize=${pageSize}`);
    const flights = result?.result?.data || [];

    const enriched = flights.map((fl: any) => {
      const { aircraftName, liveryName } = resolveFlightAircraft(fl);
      return {
        id: fl.id,
        created: fl.created,
        callsign: fl.callsign || "No Callsign",
        server: fl.server || "Unknown",
        originAirport: fl.originAirport || "N/A",
        destinationAirport: fl.destinationAirport || "N/A",
        flightTimeMinutes: fl.totalTime || 0,
        landingCount: fl.landingCount || 0,
        fuelUsedKg: fl.fuelUsedKg || 0,
        dayTime: fl.dayTime || 0,
        nightTime: fl.nightTime || 0,
        xp: fl.xp || 0,
        aircraftId: fl.aircraftId,
        aircraftName,
        liveryId: fl.liveryId,
        liveryName,
        landingStats: fl.landingStats || [],
        violations: fl.violations || [],
      };
    });

    const payload = {
      pageIndex: result?.result?.pageIndex || page,
      totalPages: result?.result?.totalPages || 1,
      totalCount: result?.result?.totalCount || enriched.length,
      data: enriched,
    };

    setInCache(cacheKey, payload, 300);
    res.json(payload);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 4b. Fetch ALL flights for a user (aggregates all pages)
app.get("/api/user/flights/all/:userId", async (req, res) => {
  const userId = req.params.userId;
  const cacheKey = `all_flights_${userId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    await ensureAircraftCatalog();

    // Fetch page 1 first to know totalPages
    const firstPageRes = await fetchIF(`/users/${userId}/flights?page=1&pageSize=100`);
    const totalPages = Math.min(firstPageRes?.result?.totalPages || 1, 50); // Cap at 50 pages (5,000 flights)
    const totalCount = firstPageRes?.result?.totalCount || (firstPageRes?.result?.data?.length || 0);
    let allRawFlights: any[] = firstPageRes?.result?.data || [];

    // Fetch remaining pages in chunks of 4 to prevent rate limiting
    if (totalPages > 1) {
      const remainingPages: number[] = [];
      for (let p = 2; p <= totalPages; p++) {
        remainingPages.push(p);
      }

      const chunkSize = 4;
      for (let i = 0; i < remainingPages.length; i += chunkSize) {
        const chunk = remainingPages.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map((p) =>
            fetchIF(`/users/${userId}/flights?page=${p}&pageSize=100`).catch(() => null)
          )
        );

        for (const pageRes of chunkResults) {
          if (pageRes?.result?.data && Array.isArray(pageRes.result.data)) {
            allRawFlights = allRawFlights.concat(pageRes.result.data);
          }
        }
      }
    }

    // De-duplicate by flight ID
    const seenIds = new Set<string>();
    const uniqueRawFlights = allRawFlights.filter((fl) => {
      if (!fl.id || seenIds.has(fl.id)) return false;
      seenIds.add(fl.id);
      return true;
    });

    const enriched = uniqueRawFlights.map((fl: any) => {
      const { aircraftName, liveryName } = resolveFlightAircraft(fl);
      return {
        id: fl.id,
        created: fl.created,
        callsign: fl.callsign || "No Callsign",
        server: fl.server || "Unknown",
        originAirport: fl.originAirport || "N/A",
        destinationAirport: fl.destinationAirport || "N/A",
        flightTimeMinutes: fl.totalTime || 0,
        landingCount: fl.landingCount || 0,
        fuelUsedKg: fl.fuelUsedKg || 0,
        dayTime: fl.dayTime || 0,
        nightTime: fl.nightTime || 0,
        xp: fl.xp || 0,
        aircraftId: fl.aircraftId,
        aircraftName,
        liveryId: fl.liveryId,
        liveryName,
        landingStats: fl.landingStats || [],
        violations: fl.violations || [],
      };
    });

    const payload = {
      totalCount: totalCount || enriched.length,
      totalPages,
      loadedCount: enriched.length,
      data: enriched,
    };

    setInCache(cacheKey, payload, 600); // 10 minutes cache
    res.json(payload);
  } catch (error: any) {
    console.error("Failed to load all flights:", error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 5. Fetch additional ATC sessions page
app.get("/api/user/atc/:userId", async (req, res) => {
  const userId = req.params.userId;
  const page = parseInt(req.query.page as string || "1", 10);
  // IF API supports up to pageSize=25 on /atc
  const requestedPageSize = Math.min(parseInt(req.query.pageSize as string || "25", 10), 25);

  const cacheKey = `atc_${userId}_p${page}_s${requestedPageSize}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    let result: any = null;
    try {
      result = await fetchIF(`/users/${userId}/atc?page=${page}&pageSize=${requestedPageSize}`);
    } catch (_err: any) {
      if (_err?.status === 400) {
        // Fall back to default page size if query with size failed
        result = await fetchIF(`/users/${userId}/atc?page=${page}`);
      } else {
        throw _err;
      }
    }
    const sessions = result?.result?.data || [];

    const facilityNames: Record<number, string> = {
      0: "Ground",
      1: "Tower",
      2: "Unicom",
      3: "Clearance Delivery",
      4: "Approach",
      5: "Departure",
      6: "Center",
      7: "ATIS",
      8: "Aircraft",
      9: "Recorded",
    };

    const enriched = sessions.map((s: any) => {
      const fType = s.facility?.frequencyType ?? -1;
      return {
        id: s.id,
        atcSessionGroupId: s.atcSessionGroupId || null,
        airportIcao: s.facility?.airportIcao && s.facility.airportIcao !== "Unknown" ? s.facility.airportIcao : "N/A",
        frequencyType: fType,
        facilityTypeName: facilityNames[fType] || `Facility (${fType})`,
        operations: s.operations || 0,
        durationMinutes: s.totalTime || 0,
        violationsIssued: s.violationsIssued || 0,
        server: s.server || "Unknown",
        created: s.created,
        updated: s.updated,
      };
    });

    const payload = {
      pageIndex: result?.result?.pageIndex || page,
      totalPages: result?.result?.totalPages || 1,
      totalCount: result?.result?.totalCount || enriched.length,
      data: enriched,
    };

    setInCache(cacheKey, payload, 300);
    res.json(payload);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 5b. Fetch ALL ATC sessions for a user with high resilience and rate-limit safety
app.get("/api/user/atc/all/:userId", async (req, res) => {
  const userId = req.params.userId;
  const isRefresh = req.query.refresh === "true";
  const cacheKey = `all_atc_${userId}`;
  if (!isRefresh) {
    const cached = getFromCache(cacheKey);
    if (cached) return res.json(cached);
  }

  try {
    // Helper to fetch an ATC page with retry, rate-limit backoff, and size fallbacks
    const fetchAtcPage = async (page: number, size = 50, retries = 3): Promise<any> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetchIF(`/users/${userId}/atc?page=${page}&pageSize=${size}`);
          return res;
        } catch (err: any) {
          if (err?.status === 429) {
            // Parse retry delay from error message if available (e.g., "try again in 50 second(s)")
            const match = err?.message?.match(/try again in (\d+)\s*second/i);
            const waitSec = match ? parseInt(match[1], 10) + 1 : Math.min((attempt + 1) * 4, 15);
            const waitMs = Math.min(waitSec * 1000, 45000);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
          if (err?.status === 400) {
            // Infinite Flight 400 often occurs on legacy corrupted records in larger batches.
            // Try with smaller pageSize (25) or default (10) to bypass isolated bad entries
            if (size > 25) {
              try {
                const subP1 = (page - 1) * 2 + 1;
                const subP2 = subP1 + 1;
                const [r1, r2] = await Promise.all([
                  fetchIF(`/users/${userId}/atc?page=${subP1}&pageSize=25`).catch(() => null),
                  fetchIF(`/users/${userId}/atc?page=${subP2}&pageSize=25`).catch(() => null),
                ]);
                const combined = [
                  ...(r1?.result?.data && Array.isArray(r1.result.data) ? r1.result.data : []),
                  ...(r2?.result?.data && Array.isArray(r2.result.data) ? r2.result.data : []),
                ];
                if (combined.length > 0) {
                  return { result: { data: combined, pageIndex: page } };
                }
              } catch {}
            }
            try {
              const fallbackRes = await fetchIF(`/users/${userId}/atc?page=${page}`);
              return fallbackRes;
            } catch {
              return null;
            }
          }
          if (attempt === retries) return null;
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
      return null;
    };

    // First page with pageSize=50 (falling back to 25 if needed)
    let firstPageRes = await fetchAtcPage(1, 50);
    let usedPageSize = 50;
    if (!firstPageRes?.result) {
      firstPageRes = await fetchAtcPage(1, 25);
      usedPageSize = 25;
    }
    if (!firstPageRes?.result) {
      return res.status(404).json({ error: "No ATC sessions found" });
    }

    const reportedTotalCount = firstPageRes.result.totalCount || (firstPageRes.result.data?.length || 0);
    const totalPages = Math.min(
      firstPageRes.result.totalPages || Math.ceil(reportedTotalCount / usedPageSize),
      120
    );
    let allRawAtc: any[] = Array.isArray(firstPageRes.result.data) ? [...firstPageRes.result.data] : [];

    if (totalPages > 1) {
      let consecutiveEmpty = 0;
      // Fetch pages with pacing to stay well under rate limits
      for (let p = 2; p <= totalPages; p++) {
        const pageRes = await fetchAtcPage(p, usedPageSize);
        if (pageRes?.result?.data && Array.isArray(pageRes.result.data) && pageRes.result.data.length > 0) {
          allRawAtc.push(...pageRes.result.data);
          consecutiveEmpty = 0;
        } else {
          consecutiveEmpty++;
          // Allow gaps up to 8 empty pages for corrupted legacy archive records
          if (consecutiveEmpty >= 8) {
            break;
          }
        }

        // 120ms pacing delay between sequential requests
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }

    const facilityNames: Record<number, string> = {
      0: "Ground",
      1: "Tower",
      2: "Unicom",
      3: "Clearance Delivery",
      4: "Approach",
      5: "Departure",
      6: "Center",
      7: "ATIS",
      8: "Aircraft",
      9: "Recorded",
    };

    const seenIds = new Set<string>();
    const uniqueRaw = allRawAtc.filter((s) => {
      if (!s.id || seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    const enriched = uniqueRaw.map((s: any) => {
      const fType = s.facility?.frequencyType ?? -1;
      return {
        id: s.id,
        atcSessionGroupId: s.atcSessionGroupId || null,
        airportIcao: s.facility?.airportIcao && s.facility.airportIcao !== "Unknown" ? s.facility.airportIcao : "N/A",
        frequencyType: fType,
        facilityTypeName: facilityNames[fType] || `Facility (${fType})`,
        operations: s.operations || 0,
        durationMinutes: s.totalTime || 0,
        violationsIssued: s.violationsIssued || 0,
        server: s.server || "Unknown",
        created: s.created,
        updated: s.updated,
      };
    });

    const payload = {
      totalCount: Math.max(reportedTotalCount, enriched.length),
      totalPages,
      loadedCount: enriched.length,
      data: enriched,
    };

    // Only cache if complete or near-complete to avoid caching partial data
    if (enriched.length >= reportedTotalCount || (totalPages > 1 && enriched.length >= (totalPages - 1) * 25)) {
      setInCache(cacheKey, payload, 600); // 10 minutes cache
    }
    res.json(payload);
  } catch (error: any) {
    console.error("Failed to load all ATC sessions:", error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 6. User Avatar helper endpoint
app.get("/api/avatar/:username", async (req, res) => {
  const username = req.params.username;
  const avatarUrl = await fetchDiscourseAvatar(username);
  if (avatarUrl) {
    return res.redirect(avatarUrl);
  }
  return res.status(404).json({ error: "Avatar not found" });
});

// Global error handler middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled server error:", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Internal Server Error",
      message: err?.message || "An unexpected server error occurred",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite alleen dynamisch laden in dev, zodat de serverless functie op Vercel niet crasht
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VEYRO Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;

if (!process.env.VERCEL) {
  startServer();
}
