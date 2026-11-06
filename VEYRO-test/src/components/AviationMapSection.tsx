import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toPng, toBlob } from "html-to-image";
import {
  Search,
  PenTool,
  RotateCcw,
  Ban,
  Trash2,
  X,
  Plus,
  Undo2,
  Redo2,
  Share2,
  Download,
  Copy,
  Check,
  Upload,
  Mountain,
  AlertTriangle,
  Scissors,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Save,
  SlidersHorizontal,
  Tablet,
  Monitor,
  ArrowLeft,
  Focus,
} from "lucide-react";
import {
  WhiteboardFix,
  WhiteboardLine,
  WhiteboardHold,
  TerrainRestriction,
  generateRunwayApproachCone,
  generateHoldingPattern,
  getHoldDirectionHandle,
  getHoldLengthHandle,
  getHoldWidthHandle,
  getHoldSizeHandle,
  getHoldCenterPoint,
  getHoldArrowPoints,
  getHoldFarEndApex,
  distanceNm,
  initialBearing,
  snapHeadingTo10,
  formatAltitude,
  formatSpeed,
  destinationPoint,
  generateRunwayOutline,
  getConnectedRouteLineIds,
  getOrphanedFixIds,
} from "../utils/atcWhiteboardUtils";
import { WhiteboardAirport } from "../utils/airportsWhiteboardData";
import { createTerrariumAirportLayer } from "../utils/terrariumMsaLayer";
import { sampleElevationAndMsa } from "../utils/elevationSampler";

// Standard line colors (exactly 4 colors)
const LINE_COLORS = [
  { name: "Red", hex: "#ef4444" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Green", hex: "#10b981" },
];

interface WhiteboardSnapshot {
  fixes: WhiteboardFix[];
  lines: WhiteboardLine[];
  holds: WhiteboardHold[];
  terrainRestrictions: TerrainRestriction[];
}

interface CustomTerrainData {
  imageUrl: string;
  name: string;
  bounds: [[number, number], [number, number]];
  opacity: number;
}

interface AviationMapSectionProps {
  onSearchPilot?: (username: string) => void;
  onClose?: () => void;
}

export default function AviationMapSection({ onSearchPilot, onClose }: AviationMapSectionProps = {}) {
  // Tablet & Desktop only requirement (minimum 768px screen width)
  const [isTabletOrDesktop, setIsTabletOrDesktop] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });

  useEffect(() => {
    const checkWidth = () => {
      setIsTabletOrDesktop(window.innerWidth >= 768);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer groups
  const terrainTileLayerRef = useRef<L.TileLayer | null>(null);
  const terrariumAirportLayerRef = useRef<L.GridLayer | null>(null);
  const airportAreaCircleRef = useRef<L.Circle | null>(null);
  const customTerrainOverlayRef = useRef<L.ImageOverlay | null>(null);
  const conesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const whiteboardLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const drawingLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const linePreviewLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const airportsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const navaidsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const fixesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const measureLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const liveTrafficLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const trafficTrailsRef = useRef<Map<string, [number, number][]>>(new Map());
  const polylineRefs = useRef<Map<string, L.Polyline>>(new Map());
  const isDraggingMarkerRef = useRef<boolean>(false);
  const cursorMsaInfoRef = useRef<{ elevationFt: number; msaFt: number } | null>(null);

  // Collapsable Toolkit
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);

  // Prompt dismiss state
  const [isPromptDismissed, setIsPromptDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("veyro_map_prompt_dismissed") === "true";
    } catch {
      return false;
    }
  });

  // LocalStorage Persistence
  const initialSaved = (() => {
    try {
      const raw = localStorage.getItem("veyro_map_annotations_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
          lines: Array.isArray(parsed.lines) ? parsed.lines : [],
          holds: Array.isArray(parsed.holds) ? parsed.holds : [],
          terrainRestrictions: Array.isArray(parsed.terrainRestrictions) ? parsed.terrainRestrictions : [],
          airport: parsed.airport && typeof parsed.airport === "object" ? (parsed.airport as WhiteboardAirport) : null,
          mapCenter: Array.isArray(parsed.mapCenter) && parsed.mapCenter.length === 2 ? (parsed.mapCenter as [number, number]) : null,
          mapZoom: typeof parsed.mapZoom === "number" ? parsed.mapZoom : null,
          terrainOpacity: typeof parsed.terrainOpacity === "number" ? parsed.terrainOpacity : 0.85,
          terrainRangeNm: typeof parsed.terrainRangeNm === "number" ? parsed.terrainRangeNm : 45,
          minSafeAltFt: typeof parsed.minSafeAltFt === "number" ? parsed.minSafeAltFt : 0,
          showTerrainLayer: Boolean(parsed.showTerrainLayer),
        };
      }
    } catch (err) {
      console.error("Failed to load map data from storage", err);
    }
    return null;
  })();

  // Airport Search & Selection
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<WhiteboardAirport[]>([]);
  const [currentAirport, setCurrentAirport] = useState<WhiteboardAirport | null>(initialSaved?.airport || null);

  // Active Tool & Colors
  const [activeTool, setActiveTool] = useState<"none" | "line" | "hold" | "terrain" | "eraser">("line");
  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  const [selectedColor, setSelectedColor] = useState("#ef4444");

  // User Whiteboard Items
  const [fixes, setFixes] = useState<WhiteboardFix[]>(initialSaved?.fixes || []);
  const [lines, setLines] = useState<WhiteboardLine[]>(initialSaved?.lines || []);
  const [holds, setHolds] = useState<WhiteboardHold[]>(initialSaved?.holds || []);
  const [terrainRestrictions, setTerrainRestrictions] = useState<TerrainRestriction[]>(initialSaved?.terrainRestrictions || []);
  const [saveFeedback, setSaveFeedback] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Terrain Data States
  const [showTerrainLayer, setShowTerrainLayer] = useState(initialSaved?.showTerrainLayer || false);
  const [terrainMode, setTerrainMode] = useState<"relief" | "topo">("relief");
  const [isTopoInverted, setIsTopoInverted] = useState(true);
  const [terrainOpacity, setTerrainOpacity] = useState(initialSaved?.terrainOpacity ?? 0.85);
  const [terrainRangeNm, setTerrainRangeNm] = useState<number>(initialSaved?.terrainRangeNm ?? 45);
  const [minSafeAltFt, setMinSafeAltFt] = useState<number>(initialSaved?.minSafeAltFt ?? 0);
  const [areaMaxMsa, setAreaMaxMsa] = useState<number>(18000);
  const [showTerrainModal, setShowTerrainModal] = useState(false);
  const [customTerrain, setCustomTerrain] = useState<CustomTerrainData | null>(null);
  const [showWhiteboardIntro, setShowWhiteboardIntro] = useState<boolean>(true);
  const [airportConfirmTarget, setAirportConfirmTarget] = useState<WhiteboardAirport | null>(null);

  const handleConfirmAirportSwitch = (apt: WhiteboardAirport) => {
    selectAirport(apt);
    if (Array.isArray(apt.runways)) {
      const validIds = apt.runways
        .filter((r) => r && r.id && /^(0?[1-9]|[12][0-9]|3[0-6])[LRC]?$/i.test(r.id.trim()))
        .map((r) => r.id);
      setEnabledGsRunways(validIds);
    }
    setAirportConfirmTarget(null);
  };

  // Minimalist Down-Left Navigation & Measuring State
  const [showAirports, setShowAirports] = useState(false);
  const [showFixes, setShowFixes] = useState(false);
  const [showNavaids, setShowNavaids] = useState(false);
  const [enabledGsRunways, setEnabledGsRunways] = useState<string[]>([]);
  const [showGsMenu, setShowGsMenu] = useState(false);
  const toggleGsRunway = useCallback((rwyId: string) => {
    setEnabledGsRunways((prev) =>
      prev.includes(rwyId) ? prev.filter((id) => id !== rwyId) : [...prev, rwyId]
    );
  }, []);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureUnit, setMeasureUnit] = useState<"nm" | "km">("nm");
  const [measureState, setMeasureState] = useState<{
    start: { lat: number; lng: number } | null;
    current: { lat: number; lng: number } | null;
    isLocked: boolean;
  }>({ start: null, current: null, isLocked: false });
  const measureStateRef = useRef<{
    start: { lat: number; lng: number } | null;
    current: { lat: number; lng: number } | null;
    isLocked: boolean;
  }>({ start: null, current: null, isLocked: false });

  const isMeasuringRef = useRef(isMeasuring);
  useEffect(() => {
    isMeasuringRef.current = isMeasuring;
  }, [isMeasuring]);

  useEffect(() => {
    if (activeTool !== "none") {
      setIsMeasuring(false);
    }
  }, [activeTool]);

  const handleMeasurePoint = (pt: { lat: number; lng: number }) => {
    if (!measureStateRef.current.start || measureStateRef.current.isLocked) {
      // Set first point / start fresh measurement (clears previous measurement)
      const next = { start: pt, current: pt, isLocked: false };
      measureStateRef.current = next;
      setMeasureState(next);
    } else {
      // Click again locks it in place!
      const next = { start: measureStateRef.current.start, current: pt, isLocked: true };
      measureStateRef.current = next;
      setMeasureState(next);
    }
  };

  // Dynamically calculate and fetch the highest MSA in the airport area (e.g. up to 32,000'+ at VNLK)
  useEffect(() => {
    if (!currentAirport) {
      setAreaMaxMsa(18000);
      return;
    }

    let isMounted = true;
    // Immediate smart estimate based on airport elevation
    const initialEstimate =
      currentAirport.elevation > 7000
        ? Math.max(30000, Math.ceil((currentAirport.elevation + 22000) / 1000) * 1000)
        : currentAirport.elevation > 4000
        ? Math.max(16000, Math.ceil((currentAirport.elevation + 10000) / 1000) * 1000)
        : 18000;
    setAreaMaxMsa(initialEstimate);

    // Fetch highest area elevation and true MSA from server
    fetch(`/api/terrain/highest-msa?lat=${currentAirport.lat}&lng=${currentAirport.lng}&rangeNm=${terrainRangeNm || 45}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data?.highestMsaFt) return;
        setAreaMaxMsa((prev) => Math.max(prev, data.highestMsaFt));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentAirport, terrainRangeNm]);

  // Auto-save whiteboard data to localStorage
  const saveToStorage = useCallback(
    (
      currentFixes = fixes,
      currentLines = lines,
      currentHolds = holds,
      currentTRs = terrainRestrictions,
      airport = currentAirport,
      opacity = terrainOpacity,
      rangeNm = terrainRangeNm,
      minSafeAlt = minSafeAltFt,
      showTerrain = showTerrainLayer
    ) => {
      try {
        const center = mapRef.current ? [mapRef.current.getCenter().lat, mapRef.current.getCenter().lng] : initialSaved?.mapCenter;
        const zoom = mapRef.current ? mapRef.current.getZoom() : initialSaved?.mapZoom;
        localStorage.setItem(
          "veyro_map_annotations_v2",
          JSON.stringify({
            fixes: currentFixes,
            lines: currentLines,
            holds: currentHolds,
            terrainRestrictions: currentTRs,
            airport,
            mapCenter: center,
            mapZoom: zoom,
            terrainOpacity: opacity,
            terrainRangeNm: rangeNm,
            minSafeAltFt: minSafeAlt,
            showTerrainLayer: showTerrain,
            updatedAt: Date.now(),
          })
        );
      } catch (err) {
        console.error("Failed to save map data", err);
      }
    },
    [fixes, lines, holds, terrainRestrictions, currentAirport, terrainOpacity, terrainRangeNm, minSafeAltFt, showTerrainLayer, initialSaved]
  );

  useEffect(() => {
    saveToStorage(fixes, lines, holds, terrainRestrictions, currentAirport, terrainOpacity, terrainRangeNm, minSafeAltFt, showTerrainLayer);
  }, [fixes, lines, holds, terrainRestrictions, currentAirport, terrainOpacity, terrainRangeNm, minSafeAltFt, showTerrainLayer, saveToStorage]);

  // Save on page exit or unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveToStorage();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      saveToStorage();
    };
  }, [saveToStorage]);

  const handleManualSave = () => {
    saveToStorage(fixes, lines, holds, terrainRestrictions, currentAirport, terrainOpacity, terrainRangeNm, minSafeAltFt, showTerrainLayer);
    setSaveFeedback(true);
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSaveFeedback(false), 2600);
  };

  // Undo / Redo History Stack
  const [history, setHistory] = useState<WhiteboardSnapshot[]>([
    {
      fixes: initialSaved?.fixes || [],
      lines: initialSaved?.lines || [],
      holds: initialSaved?.holds || [],
      terrainRestrictions: initialSaved?.terrainRestrictions || [],
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Push Snapshot to History
  const pushHistorySnapshot = useCallback(
    (newFixes: WhiteboardFix[], newLines: WhiteboardLine[], newHolds: WhiteboardHold[], newTRs: TerrainRestriction[]) => {
      setHistory((prev) => {
        const nextHistory = prev.slice(0, historyIndex + 1);
        return [...nextHistory, { fixes: newFixes, lines: newLines, holds: newHolds, terrainRestrictions: newTRs }];
      });
      setHistoryIndex((prev) => prev + 1);
      saveToStorage(newFixes, newLines, newHolds, newTRs);
    },
    [historyIndex, saveToStorage]
  );

  // Line Drag & Release + Heading Snap State (Snapping to x0° headings is standard)
  const [snapHeading, setSnapHeading] = useState<boolean>(true);
  const snapHeadingRef = useRef<boolean>(true);
  useEffect(() => {
    snapHeadingRef.current = snapHeading;
  }, [snapHeading]);

  interface LineDragPreview {
    startLatLng: { lat: number; lng: number };
    startFixId: string | null;
    isNewPointCreated?: boolean;
    currentLatLng: { lat: number; lng: number };
    rawHeading: number;
    snappedHeading: number;
    isSnappedHeading: boolean;
    distanceNm: number;
    targetSnapFixId: string | null;
  }

  const [lineDragState, setLineDragState] = useState<LineDragPreview | null>(null);
  const lineDragStateRef = useRef<LineDragPreview | null>(null);
  const isDrawingLineRef = useRef<boolean>(false);
  const isRightDraggingFixRef = useRef<{
    fixId: string;
    startScreenX: number;
    startScreenY: number;
    startLatLng: { lat: number; lng: number };
    currentLatLng: { lat: number; lng: number };
    hasMoved: boolean;
  } | null>(null);
  const justMovedPointWithRightClickRef = useRef<boolean>(false);

  // Sync refs for event handlers to avoid stale closures
  const fixesRef = useRef(fixes);
  useEffect(() => { fixesRef.current = fixes; }, [fixes]);
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  const holdsRef = useRef(holds);
  useEffect(() => { holdsRef.current = holds; }, [holds]);
  const terrainRestrictionsRef = useRef(terrainRestrictions);
  useEffect(() => { terrainRestrictionsRef.current = terrainRestrictions; }, [terrainRestrictions]);
  const selectedColorRef = useRef(selectedColor);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);

  // In-progress line & polygon drawing
  const [drawingStartFixId, setDrawingStartFixId] = useState<string | null>(null);
  const [inProgressPolygon, setInProgressPolygon] = useState<[number, number][]>([]);

  // Undo Action
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const snap = history[prevIndex];
      setFixes(snap.fixes);
      setLines(snap.lines);
      setHolds(snap.holds);
      setTerrainRestrictions(snap.terrainRestrictions);
      setHistoryIndex(prevIndex);
      setDrawingStartFixId(null);
      setContextFix(null);
      setContextLine(null);
      setSelectedHold(null);
    }
  }, [history, historyIndex]);

  // Redo Action
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const snap = history[nextIndex];
      setFixes(snap.fixes);
      setLines(snap.lines);
      setHolds(snap.holds);
      setTerrainRestrictions(snap.terrainRestrictions);
      setHistoryIndex(nextIndex);
      setDrawingStartFixId(null);
      setContextFix(null);
      setContextLine(null);
      setSelectedHold(null);
    }
  }, [history, historyIndex]);

  // Cleanly cancel and reset any in-progress line drawing
  const cancelActiveLineDrawing = useCallback(() => {
    const drag = lineDragStateRef.current;
    isDrawingLineRef.current = false;
    lineDragStateRef.current = null;
    setLineDragState(null);
    setDrawingStartFixId(null);
    linePreviewLayerGroupRef.current?.clearLayers();

    // If an initial node was created specifically for this aborted line, remove that orphaned node
    if (drag && drag.isNewPointCreated && drag.startFixId) {
      const createdId = drag.startFixId;
      const isConnected = linesRef.current.some(
        (l) => l.fromFixId === createdId || l.toFixId === createdId
      );
      if (!isConnected) {
        const nextFixes = fixesRef.current.filter((f) => f.id !== createdId);
        fixesRef.current = nextFixes;
        setFixes(nextFixes);
      }
    }
  }, []);

  // Automatically cancel in-progress line drawing whenever tool is changed or toggled off
  useEffect(() => {
    if (activeTool !== "line") {
      cancelActiveLineDrawing();
    }
  }, [activeTool, cancelActiveLineDrawing]);

  // Keyboard shortcut listener (Ctrl+Z / Cmd+Z for Undo, Ctrl+Y / Cmd+Shift+Z for Redo, Esc to cancel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Escape") {
        if (isDrawingLineRef.current || lineDragStateRef.current) {
          cancelActiveLineDrawing();
        } else if (drawingStartFixId) {
          setDrawingStartFixId(null);
        } else if (activeTool !== "none") {
          setActiveTool("none");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, drawingStartFixId, activeTool, cancelActiveLineDrawing]);

  // Context Menu / Editor states
  const [contextFix, setContextFix] = useState<{ fix: WhiteboardFix; x: number; y: number } | null>(null);
  const [contextLine, setContextLine] = useState<{
    lineId: string;
    connectedCount: number;
    nodeCount: number;
    x: number;
    y: number;
  } | null>(null);
  const [selectedHold, setSelectedHold] = useState<WhiteboardHold | null>(null);

  // Modals
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<"share" | "import">("share");
  const [confirmDeleteLinesOpen, setConfirmDeleteLinesOpen] = useState(false);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  // Share & Export states
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [imageExportSuccess, setImageExportSuccess] = useState(false);
  const [imageExportError, setImageExportError] = useState<string | null>(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const [exportDownloadFilename, setExportDownloadFilename] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const dismissPromptNotice = () => {
    setIsPromptDismissed(true);
    try {
      localStorage.setItem("veyro_map_prompt_dismissed", "true");
    } catch {}
  };

  const loadPlanData = useCallback(
    (data: any) => {
      if (data.airport) {
        setCurrentAirport(data.airport);
        setSearchQuery(`${data.airport.icao} - ${data.airport.name}`);
        if (mapRef.current) {
          mapRef.current.flyTo([data.airport.lat, data.airport.lng], 12);
        }
      }
      const newFixes = Array.isArray(data.fixes) ? data.fixes : [];
      const newLines = Array.isArray(data.lines) ? data.lines : [];
      const newHolds = Array.isArray(data.holds) ? data.holds : [];
      const newTRs = Array.isArray(data.terrainRestrictions) ? data.terrainRestrictions : [];

      setFixes(newFixes);
      setLines(newLines);
      setHolds(newHolds);
      setTerrainRestrictions(newTRs);
      pushHistorySnapshot(newFixes, newLines, newHolds, newTRs);
    },
    [pushHistorySnapshot]
  );

  // Check URL hash for shared handover plan (#plan=...)
  useEffect(() => {
    const checkHashPlan = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#plan=")) {
        try {
          const raw = hash.replace("#plan=", "").trim();
          const jsonStr = decodeURIComponent(escape(atob(raw)));
          const parsed = JSON.parse(jsonStr);
          loadPlanData(parsed);
        } catch (e) {
          console.warn("Could not load handover plan from URL hash", e);
        }
      }
    };
    checkHashPlan();
    window.addEventListener("hashchange", checkHashPlan);
    return () => window.removeEventListener("hashchange", checkHashPlan);
  }, [loadPlanData]);

  const getHandoverUrl = () => {
    const planData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      airport: currentAirport,
      fixes,
      lines,
      holds,
      terrainRestrictions,
    };
    const jsonStr = JSON.stringify(planData);
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return `${window.location.origin}/#plan=${base64}`;
  };

  const handleCopyLink = () => {
    const url = getHandoverUrl();
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyJson = () => {
    const planData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      airport: currentAirport,
      fixes,
      lines,
      holds,
      terrainRestrictions,
    };
    navigator.clipboard.writeText(JSON.stringify(planData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadFile = () => {
    const planData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      airport: currentAirport,
      fixes,
      lines,
      holds,
      terrainRestrictions,
    };
    const blob = new Blob([JSON.stringify(planData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ATC_Plan_${currentAirport?.icao || "Scope"}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Automatically center and fit the entire ATC plan in view
  const centerPlanOnMap = useCallback(() => {
    if (!mapRef.current) return;
    const planCoords: [number, number][] = [];

    // 1. All whiteboard fixes
    fixes.forEach((f) => {
      if (typeof f.lat === "number" && typeof f.lng === "number" && !isNaN(f.lat) && !isNaN(f.lng)) {
        planCoords.push([f.lat, f.lng]);
      }
    });

    // 2. All whiteboard holds (anchor fix + all generated racetrack boundary points)
    holds.forEach((h) => {
      if (typeof h.fixLat === "number" && typeof h.fixLng === "number" && !isNaN(h.fixLat) && !isNaN(h.fixLng)) {
        planCoords.push([h.fixLat, h.fixLng]);
        try {
          const racetrack = generateHoldingPattern(
            { lat: h.fixLat, lng: h.fixLng },
            h.inboundHeading,
            h.turnDirection,
            h.legLengthNm,
            h.turnRadiusNm
          );
          if (Array.isArray(racetrack)) {
            racetrack.forEach((pt) => {
              if (Array.isArray(pt) && !isNaN(pt[0]) && !isNaN(pt[1])) {
                planCoords.push([pt[0], pt[1]]);
              }
            });
          }
        } catch {}
      }
    });

    // 3. Custom terrain restriction polygons
    terrainRestrictions.forEach((r) => {
      if (Array.isArray(r.points)) {
        r.points.forEach((pt) => {
          if (Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1])) {
            planCoords.push([pt[0], pt[1]]);
          }
        });
      }
    });

    // 4. Active searched airport & runway layout/approach cones
    if (currentAirport && typeof currentAirport.lat === "number" && typeof currentAirport.lng === "number") {
      planCoords.push([currentAirport.lat, currentAirport.lng]);
      if (Array.isArray(currentAirport.runways)) {
        currentAirport.runways.forEach((rwy: any) => {
          if (typeof rwy.latitude === "number" && typeof rwy.longitude === "number") {
            planCoords.push([rwy.latitude, rwy.longitude]);
            try {
              const cone = generateRunwayApproachCone(rwy.id, { lat: rwy.latitude, lng: rwy.longitude }, rwy.heading, 10, 3.2);
              if (Array.isArray(cone.conePolygon)) {
                cone.conePolygon.forEach((pt) => {
                  if (Array.isArray(pt) && !isNaN(pt[0]) && !isNaN(pt[1])) {
                    planCoords.push([pt[0], pt[1]]);
                  }
                });
              }
            } catch {}
          }
        });
      }
    }

    if (planCoords.length > 0) {
      const bounds = L.latLngBounds(planCoords);
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, {
          padding: [80, 80],
          maxZoom: 13,
          animate: false,
        });
        mapRef.current.invalidateSize();
      }
    } else if (currentAirport) {
      mapRef.current.setView([currentAirport.lat, currentAirport.lng], 11, { animate: false });
      mapRef.current.invalidateSize();
    }
  }, [fixes, holds, terrainRestrictions, currentAirport]);

  // Option 1: High-resolution PNG image export of the plan with automatic centering
  const handleExportImage = async () => {
    if (!mapContainerRef.current || !mapRef.current) return;
    setIsExportingImage(true);
    setImageExportError(null);

    // 1. Automatically center the entire plan so the whole plan is visible in the PNG
    centerPlanOnMap();

    // 2. Close any open popups on the map
    try {
      mapRef.current.closePopup();
    } catch {}

    // 3. Deselect active selections & cancel in-progress drawing tools
    setSelectedHold(null);
    setContextLine(null);
    setContextFix(null);
    setActiveTool("none");

    const container = mapContainerRef.current;
    container.classList.add("exporting-png");

    try {
      // 4. Pause to let Leaflet update tile layers and re-render vector geometry with UI handles hidden
      await new Promise((resolve) => setTimeout(resolve, 450));

      const filterFn = (node: any) => {
        if (!node) return true;
        if (node.nodeType && node.nodeType !== Node.ELEMENT_NODE) return true;
        const el = node as HTMLElement;

        // 1. Hold dimension and editing handles (end handle, side handle, anchor handle, and handle tooltips)
        if (
          el.classList?.contains("hold-end-handle") ||
          el.classList?.contains("hold-side-handle") ||
          el.classList?.contains("hold-anchor-marker") ||
          el.classList?.contains("hold-tooltip-pill") ||
          el.classList?.contains("hold-resize-handle") ||
          el.classList?.contains("ui-control-handle") ||
          el.closest?.(".hold-end-handle, .hold-side-handle, .hold-anchor-marker, .hold-tooltip-pill, .hold-resize-handle, .ui-control-handle")
        ) {
          return false;
        }

        // 2. Leaflet UI controls (zoom buttons, attribution text, etc.)
        if (
          el.classList?.contains("leaflet-control-container") ||
          el.classList?.contains("leaflet-control") ||
          el.classList?.contains("leaflet-control-zoom") ||
          el.classList?.contains("leaflet-control-attribution") ||
          el.closest?.(".leaflet-control-container, .leaflet-control")
        ) {
          return false;
        }

        // 3. Popups and tooltips
        if (
          el.classList?.contains("leaflet-popup") ||
          el.classList?.contains("leaflet-popup-pane") ||
          el.classList?.contains("leaflet-tooltip") ||
          el.classList?.contains("leaflet-tooltip-pane") ||
          el.closest?.(".leaflet-popup, .leaflet-popup-pane, .leaflet-tooltip, .leaflet-tooltip-pane")
        ) {
          return false;
        }

        // 4. Temporary UI badges & drawing guides
        if (
          el.classList?.contains("whiteboard-live-drag-badge") ||
          el.classList?.contains("measure-dist-horizontal-badge") ||
          el.classList?.contains("area-in-progress-marker") ||
          el.closest?.(".whiteboard-live-drag-badge, .measure-dist-horizontal-badge, .area-in-progress-marker")
        ) {
          return false;
        }

        // 5. Generic no-export elements
        if (
          el.classList?.contains("no-export") ||
          el.hasAttribute?.("data-no-export") ||
          el.closest?.(".no-export, [data-no-export]")
        ) {
          return false;
        }

        return true;
      };

      const exportOptions = {
        cacheBust: false,
        skipFonts: true,
        pixelRatio: 2,
        backgroundColor: "#020617",
        imagePlaceholder: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAentry",
        filter: filterFn,
      };

      let blob: Blob | null = null;
      try {
        blob = await toBlob(container, exportOptions);
      } catch (err1) {
        console.warn("Retrying PNG export at 1x scale:", err1);
        try {
          blob = await toBlob(container, { ...exportOptions, pixelRatio: 1 });
        } catch (err2) {
          console.warn("Falling back to toPng dataUrl:", err2);
          const dataUrl = await toPng(container, { ...exportOptions, pixelRatio: 1 });
          const byteCharacters = atob(dataUrl.split(",")[1]);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          blob = new Blob([byteArray], { type: "image/png" });
        }
      }

      if (!blob) {
        throw new Error("Could not generate image blob");
      }

      const filename = `ATC_Plan_${currentAirport?.icao || "Scope"}_${new Date().toISOString().slice(0, 10)}.png`;
      const blobUrl = URL.createObjectURL(blob);
      setExportDownloadUrl(blobUrl);
      setExportDownloadFilename(filename);

      // Trigger standard browser download via appended body anchor
      const link = document.createElement("a");
      link.style.position = "fixed";
      link.style.top = "-9999px";
      link.style.left = "-9999px";
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
      }, 1000);

      setImageExportSuccess(true);
      setTimeout(() => setImageExportSuccess(false), 5000);
    } catch (err: any) {
      console.error("Error exporting map image:", err);
      setImageExportError("Could not generate image. Please try again.");
    } finally {
      container.classList.remove("exporting-png");
      setIsExportingImage(false);
    }
  };

  const handleApplyImportText = (text: string) => {
    setImportError(null);
    const trimmed = text.trim();
    try {
      if (trimmed.includes("#plan=")) {
        const b64 = trimmed.split("#plan=")[1].split("&")[0];
        const jsonStr = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(jsonStr);
        loadPlanData(data);
        setShowShareModal(false);
        setImportText("");
        return;
      }

      try {
        const decoded = decodeURIComponent(escape(atob(trimmed)));
        const data = JSON.parse(decoded);
        loadPlanData(data);
        setShowShareModal(false);
        setImportText("");
        return;
      } catch {}

      const data = JSON.parse(trimmed);
      loadPlanData(data);
      setShowShareModal(false);
      setImportText("");
    } catch {
      setImportError("Invalid plan format. Please verify the link or JSON code.");
    }
  };

  // Initialize Map with Robust Zoom Boundaries and Clean Standard Basemap
  useEffect(() => {
    if (!isTabletOrDesktop || !mapContainerRef.current) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    if (!mapRef.current) {
      const initialCenter: [number, number] = initialSaved?.mapCenter
        ? initialSaved.mapCenter
        : initialSaved?.airport
        ? [initialSaved.airport.lat, initialSaved.airport.lng]
        : [25, 0];
      const initialZoom = initialSaved?.mapZoom
        ? initialSaved.mapZoom
        : initialSaved?.airport
        ? 11
        : 3;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 2,
        maxBounds: [
          [-85, -200],
          [85, 200],
        ],
        maxBoundsViscosity: 0.85,
        attributionControl: true,
        zoomControl: false,
        worldCopyJump: true,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Clean Esri World Dark Gray Base with crossOrigin anonymous
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, USGS',
          maxZoom: 18,
          minZoom: 2,
          bounds: [
            [-85.0511, -180],
            [85.0511, 180],
          ],
          noWrap: false,
          crossOrigin: "anonymous",
          className: "radar-dark-tiles",
        }
      ).addTo(map);

      // Custom pane for AWS Terrarium MSA layer (zIndex 250: below vector overlays 400 and markers 600)
      if (!map.getPane("msaTerrariumPane")) {
        const pane = map.createPane("msaTerrariumPane");
        pane.style.zIndex = "250";
        pane.style.pointerEvents = "none";
      }

      if (!map.getPane("whiteboardPreviewPane")) {
        const previewPane = map.createPane("whiteboardPreviewPane");
        previewPane.style.zIndex = "650";
        previewPane.style.pointerEvents = "none";
      }

      // Layer groups
      conesLayerGroupRef.current = L.layerGroup().addTo(map);
      whiteboardLayerGroupRef.current = L.layerGroup().addTo(map);
      drawingLayerGroupRef.current = L.layerGroup().addTo(map);
      linePreviewLayerGroupRef.current = L.layerGroup().addTo(map);
      airportsLayerGroupRef.current = L.layerGroup().addTo(map);
      navaidsLayerGroupRef.current = L.layerGroup().addTo(map);
      fixesLayerGroupRef.current = L.layerGroup().addTo(map);
      measureLayerGroupRef.current = L.layerGroup().addTo(map);
      liveTrafficLayerGroupRef.current = L.layerGroup().addTo(map);

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    }

    const handleResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      liveTrafficLayerGroupRef.current?.clearLayers();
      trafficTrailsRef.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isTabletOrDesktop]);

  // Airport Terminal Area Elevation Terrain Handler (Only active around searched airport, colored as terrain rises)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (terrariumAirportLayerRef.current) {
      terrariumAirportLayerRef.current.remove();
      terrariumAirportLayerRef.current = null;
    }
    if (airportAreaCircleRef.current) {
      airportAreaCircleRef.current.remove();
      airportAreaCircleRef.current = null;
    }

    if (showTerrainLayer && currentAirport) {
      const halfSizeNm = terrainRangeNm;
      const airportLayer = createTerrariumAirportLayer({
        airportCenter: { lat: currentAirport.lat, lng: currentAirport.lng },
        airportElevationFt: currentAirport.elevation,
        halfSizeNm,
        opacity: terrainOpacity,
        minSafeAltFt,
        pane: "msaTerrariumPane",
        onMaxMsaCalculated: (maxMsaFt) => {
          setAreaMaxMsa((prev) => Math.max(prev, maxMsaFt));
        },
      });

      airportLayer.addTo(map);
      terrariumAirportLayerRef.current = airportLayer;

      // Subtle dashed square boundary perimeter around searched airport (matching reference image)
      const dLatDeg = halfSizeNm / 60;
      const dLngDeg = halfSizeNm / (60 * Math.cos((currentAirport.lat * Math.PI) / 180));
      const bounds: L.LatLngBoundsExpression = [
        [currentAirport.lat - dLatDeg, currentAirport.lng - dLngDeg],
        [currentAirport.lat + dLatDeg, currentAirport.lng + dLngDeg],
      ];
      airportAreaCircleRef.current = (L.rectangle(bounds, {
        color: "#38bdf8",
        weight: 1.5,
        dashArray: "6, 6",
        fill: false,
        opacity: 0.45,
        interactive: false,
      }) as any).addTo(map);
    }
  }, [showTerrainLayer, currentAirport, terrainRangeNm]);

  // Real-time smooth transparency / opacity update for terrain layer without rebuilding
  useEffect(() => {
    if (terrariumAirportLayerRef.current) {
      (terrariumAirportLayerRef.current as any).setOpacity?.(terrainOpacity);
    }
    const pane = mapRef.current?.getPane("msaTerrariumPane");
    if (pane) {
      pane.style.opacity = String(terrainOpacity);
    }
  }, [terrainOpacity]);

  // Real-time smooth Minimum Safe Altitude (MSA) filter update without rebuilding
  useEffect(() => {
    if (terrariumAirportLayerRef.current) {
      (terrariumAirportLayerRef.current as any).setMinSafeAltFt?.(minSafeAltFt);
    }
  }, [minSafeAltFt]);

  // Custom Imported Terrain Overlay Handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (customTerrainOverlayRef.current) {
      customTerrainOverlayRef.current.remove();
      customTerrainOverlayRef.current = null;
    }

    if (customTerrain && customTerrain.imageUrl) {
      customTerrainOverlayRef.current = L.imageOverlay(customTerrain.imageUrl, customTerrain.bounds, {
        opacity: customTerrain.opacity,
        interactive: false,
        className: "custom-terrain-dark-overlay",
      }).addTo(map);
    }
  }, [customTerrain]);

  // Airport Search Handler
  const handleAirportSearch = async (val: string) => {
    setSearchQuery(val);
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/airports/search?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Live external terrain elevation & MSA lookup on hover (Matching user reference screenshots)
  const [cursorMsaInfo, setCursorMsaInfo] = useState<{ elevationFt: number; msaFt: number } | null>(null);
  const [cursorScreenPos, setCursorScreenPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let rafId: number | null = null;

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      // Do not run hover sampling while user is actively drawing, placing holds/terrain, erasing, or dragging
      if (!showTerrainLayer || !currentAirport || activeTool !== "none" || isDraggingMarkerRef.current) {
        if (cursorScreenPos !== null) setCursorScreenPos(null);
        return;
      }

      const { lat, lng } = e.latlng;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const dLatNm = Math.abs(lat - currentAirport.lat) * 60;
      const dLngNm = Math.abs(lng - currentAirport.lng) * cosLat * 60;

      if (dLatNm > terrainRangeNm + 0.5 || dLngNm > terrainRangeNm + 0.5) {
        if (cursorScreenPos !== null) setCursorScreenPos(null);
        return;
      }

      const newX = e.containerPoint.x;
      const newY = e.containerPoint.y;

      // Throttle screen pos update via requestAnimationFrame
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          setCursorScreenPos({ x: newX, y: newY });
          rafId = null;
        });
      }

      // Live sampling from external DEM data with change-detection to prevent redundant React renders
      const sample = sampleElevationAndMsa(lat, lng, 10, () => {
        const updated = sampleElevationAndMsa(lat, lng, 10);
        if (updated) {
          if (!cursorMsaInfoRef.current || cursorMsaInfoRef.current.elevationFt !== updated.elevationFt || cursorMsaInfoRef.current.msaFt !== updated.msaFt) {
            cursorMsaInfoRef.current = updated;
            setCursorMsaInfo(updated);
          }
        }
      });

      if (sample) {
        if (!cursorMsaInfoRef.current || cursorMsaInfoRef.current.elevationFt !== sample.elevationFt || cursorMsaInfoRef.current.msaFt !== sample.msaFt) {
          cursorMsaInfoRef.current = sample;
          setCursorMsaInfo(sample);
        }
      } else {
        const base = Math.ceil((currentAirport.elevation + 1500) / 500) * 500;
        const fallback = {
          elevationFt: currentAirport.elevation,
          msaFt: Math.max(2000, base),
        };
        if (!cursorMsaInfoRef.current || cursorMsaInfoRef.current.elevationFt !== fallback.elevationFt || cursorMsaInfoRef.current.msaFt !== fallback.msaFt) {
          cursorMsaInfoRef.current = fallback;
          setCursorMsaInfo(fallback);
        }
      }
    };

    const onMouseOut = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setCursorScreenPos(null);
    };

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseOut);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseOut);
    };
  }, [showTerrainLayer, currentAirport, terrainRangeNm, activeTool]);

  const selectAirport = (airport: WhiteboardAirport) => {
    setCurrentAirport(airport);
    setEnabledGsRunways([]); // G/S alts off by default for new airport
    setShowGsMenu(false);
    setSearchQuery(`${airport.icao} - ${airport.name}`);
    setSearchResults([]);

    // Remove any runway fixes (user requested no runway fixes)
    setFixes((prev) => {
      const cleanFixes = prev.filter((f) => !f.isRunwayEnd);
      pushHistorySnapshot(cleanFixes, lines, holds, terrainRestrictions);
      return cleanFixes;
    });

    if (mapRef.current) {
      mapRef.current.flyTo([airport.lat, airport.lng], 12, { duration: 1.5 });
    }
  };

  // 1. Render Runway Outlines and Approach Cones (ONLY SHOW RUNWAY, NO NUMBERS / NO LABELS)
  useEffect(() => {
    const map = mapRef.current;
    const group = conesLayerGroupRef.current;
    if (!group || !map) return;

    const renderRunwayAndCones = () => {
      group.clearLayers();

      if (!currentAirport || !currentAirport.runways || currentAirport.runways.length === 0) {
        return;
      }

      // Exclude balloon ports from having runways
      if (/balloon/i.test(currentAirport.name || "") || (currentAirport as any).type === "balloonport") {
        return;
      }

      const VALID_RWY_REGEX = /^(0?[1-9]|[12][0-9]|3[0-6])[LRC]?$/i;
      const isNonRunway = (id: string) => {
        const clean = id.trim().toUpperCase();
        if (/^H\d*$/i.test(clean) || clean.startsWith("HELI") || clean === "PAD") return true;
        if (/^\d{1,2}W$/i.test(clean) || clean === "W") return true;
        if (["WATER", "BALLOON", "N", "S", "E", "NW", "SW", "NE", "SE", "ALL", "WAY", "-", "NWA", "NWD"].includes(clean)) return true;
        return !VALID_RWY_REGEX.test(clean);
      };

      const validRunways = currentAirport.runways.filter((r) => r && r.id && !isNonRunway(r.id));
      if (validRunways.length === 0) return;

      const drawnPhysicalPavements = new Set<string>();

      validRunways.forEach((rwy) => {
        const thresholdPoint =
          rwy.threshold ||
          destinationPoint(
            { lat: currentAirport.lat, lng: currentAirport.lng },
            (rwy.heading + 180) % 360,
            ((rwy.lengthFt || 9000) / 2) / 6076.12
          );

        // Determine reciprocal runway identifier (e.g. 28L <-> 10R, 09 <-> 27)
        const cleanId = rwy.id.trim().toUpperCase();
        const match = cleanId.match(/^(\d{1,2})([LRC])?$/i);
        let recipId = "";
        if (match) {
          const num = parseInt(match[1], 10);
          const letter = match[2] || "";
          const recipNum = num > 18 ? num - 18 : num + 18;
          const recipLetter = letter === "L" ? "R" : letter === "R" ? "L" : letter;
          recipId = `${recipNum.toString().padStart(2, "0")}${recipLetter}`;
        }
        const canonicalPhysicalKey = (rwy as any).pairKey || [cleanId, recipId].filter(Boolean).sort().join("/");

        // Only draw the physical runway pavement polygon and dashed centerline ONCE per physical strip
        if (!drawnPhysicalPavements.has(canonicalPhysicalKey)) {
          drawnPhysicalPavements.add(canonicalPhysicalKey);

          const reciprocalRwy = validRunways.find((r) => r.id.toUpperCase() === recipId || (rwy as any).reciprocalId === r.id);
          const oppositeThresholdPoint = (rwy as any).oppositeThreshold || reciprocalRwy?.threshold;

          let pavementPolygon: [number, number][];
          let centerlineCoords: [number, number][];

          if (rwy.threshold && oppositeThresholdPoint) {
            // Surveyed threshold endpoints: draw directly between thresholds without projection drift
            const p1 = rwy.threshold;
            const p2 = oppositeThresholdPoint;
            const halfWidthNm = ((rwy.widthFt || 150) / 2) / 6076.12;
            const bearing = initialBearing(p1, p2);
            const leftBearing = (bearing - 90 + 360) % 360;
            const rightBearing = (bearing + 90) % 360;

            const c1 = destinationPoint(p1, leftBearing, halfWidthNm);
            const c2 = destinationPoint(p1, rightBearing, halfWidthNm);
            const c3 = destinationPoint(p2, rightBearing, halfWidthNm);
            const c4 = destinationPoint(p2, leftBearing, halfWidthNm);

            pavementPolygon = [
              [c1.lat, c1.lng],
              [c2.lat, c2.lng],
              [c3.lat, c3.lng],
              [c4.lat, c4.lng],
              [c1.lat, c1.lng],
            ];
            centerlineCoords = [
              [p1.lat, p1.lng],
              [p2.lat, p2.lng],
            ];
          } else {
            // Single threshold or computed threshold outline
            const outline = generateRunwayOutline(
              thresholdPoint,
              rwy.heading,
              rwy.lengthFt || 10000,
              rwy.widthFt || 150
            );
            pavementPolygon = outline.polygon;
            centerlineCoords = outline.centerline;
          }

          // Runway Pavement Strip (Solid Dark Pavement with Slate Outline)
          const pavement = L.polygon(pavementPolygon, {
            color: "#94a3b8",
            weight: 1.8,
            fillColor: "#0f172a",
            fillOpacity: 0.95,
            className: "runway-pavement-strip",
          });
          group.addLayer(pavement);

          // Runway Centerline (Crisp dashed white line) - EXACTLY ONE per physical strip
          const rwyCenterline = L.polyline(centerlineCoords, {
            color: "#f8fafc",
            weight: 1.5,
            opacity: 0.85,
            dashArray: "4, 6",
          });
          group.addLayer(rwyCenterline);
        }

        // Glideslope calculation (standard 3.0° or 5.5° for steep approaches like EGLC)
        const gsAngle = currentAirport.icao === "EGLC" ? 5.5 : 3.0;
        const ftPerNm = Math.tan((gsAngle * Math.PI) / 180) * 6076.1154;
        const airportElev = currentAirport.elevation || 0;
        const reciprocalHeading = (rwy.heading + 180) % 360;

        // Check if G/S is enabled specifically for this runway
        const isRwyGsEnabled = enabledGsRunways.includes(rwy.id);
        const isGsVisible = isRwyGsEnabled && map.getZoom() >= 10;

        // 1. Approach Cone (10 NM) - Always stays visible
        const cone = generateRunwayApproachCone(rwy.id, thresholdPoint, rwy.heading, 10, 3.2);

        const conePolygon = L.polygon(cone.conePolygon, {
          color: "#ef4444",
          weight: 1.2,
          opacity: isRwyGsEnabled ? 0.65 : 0.45,
          fillColor: "#ef4444",
          fillOpacity: isRwyGsEnabled ? 0.08 : 0.03,
          dashArray: "3, 3",
          className: "cursor-pointer",
        });

        // Clicking the approach cone toggles G/S for this runway when not drawing or measuring
        conePolygon.on("click", (e) => {
          if (activeToolRef.current === "none" && !isMeasuringRef.current) {
            L.DomEvent.stopPropagation(e);
            toggleGsRunway(rwy.id);
          }
        });

        group.addLayer(conePolygon);

        // 2. Approach Centerline & G/S Altitude Dots
        if (isGsVisible) {
          // Extended Centerline: extends beyond 10 NM cone out to ~16.5 NM
          const maxExtDistNm = (5000 / ftPerNm) + 0.6; // ~16.3 NM
          const farCenterlinePt = destinationPoint(thresholdPoint, reciprocalHeading, maxExtDistNm);
          const extendedCenterline = L.polyline(
            [
              [thresholdPoint.lat, thresholdPoint.lng],
              [farCenterlinePt.lat, farCenterlinePt.lng],
            ],
            {
              color: "#ef4444",
              weight: 1.2,
              opacity: 0.65,
              interactive: false,
            }
          );
          group.addLayer(extendedCenterline);

          // 3. Hoverable circular dots along extended centerline at 500 ft altitude steps
          const heightCaps = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];

          heightCaps.forEach((hAboveAirport) => {
            const distNm = hAboveAirport / ftPerNm;
            const dotPt = destinationPoint(thresholdPoint, reciprocalHeading, distNm);
            const mslAlt = Math.round(airportElev + hAboveAirport);
            const distFormatted = `${(Math.round(distNm * 10) / 10).toFixed(1)} nm`;
            const altFormatted = `${mslAlt.toLocaleString()}'`;

            const dotMarker = L.circleMarker([dotPt.lat, dotPt.lng], {
              radius: 3.5,
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.95,
              weight: 1.5,
              interactive: true,
            });

            const tooltipHtml = `
              <div class="glideslope-dot-card font-sans text-xs leading-snug select-none">
                <div class="font-semibold text-slate-900">${rwy.id}</div>
                <div class="font-medium text-slate-800">${altFormatted}</div>
                <div class="text-slate-500">${distFormatted}</div>
              </div>
            `;

            dotMarker.bindTooltip(tooltipHtml, {
              direction: "right",
              offset: [8, 0],
              className: "glideslope-dot-tooltip",
              opacity: 0.98,
            });

            group.addLayer(dotMarker);
          });
        } else {
          // When G/S is toggled off or zoomed out: render standard 10 NM cone centerline
          const centerline = L.polyline(cone.centerline, {
            color: "#ef4444",
            weight: 1.2,
            opacity: 0.55,
            interactive: false,
          });
          group.addLayer(centerline);
        }
      });
    };

    renderRunwayAndCones();
    map.on("zoomend", renderRunwayAndCones);

    return () => {
      map.off("zoomend", renderRunwayAndCones);
      group.clearLayers();
    };
  }, [currentAirport, enabledGsRunways, toggleGsRunway]);

  // Live Airborne Traffic near selected airport from Expert Server
  useEffect(() => {
    const map = mapRef.current;
    const group = liveTrafficLayerGroupRef.current;
    if (!map || !group) return;

    if (!currentAirport) {
      group.clearLayers();
      trafficTrailsRef.current.clear();
      return;
    }

    let isMounted = true;
    let abortController = new AbortController();

    const fetchAndRenderTraffic = async () => {
      try {
        const res = await fetch(
          `/api/live/traffic?lat=${currentAirport.lat}&lng=${currentAirport.lng}&radius=80&airborne=true`,
          { signal: abortController.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const flights: any[] = Array.isArray(data.flights) ? data.flights : [];
        const currentFlightIds = new Set(flights.map((f) => f.id));

        // Purge expired flight trails
        for (const [id] of trafficTrailsRef.current.entries()) {
          if (!currentFlightIds.has(id)) {
            trafficTrailsRef.current.delete(id);
          }
        }

        group.clearLayers();

        flights.forEach((f) => {
          if (typeof f.latitude !== "number" || typeof f.longitude !== "number") return;

          // 1. Maintain position history for flight trail
          const prevTrail = trafficTrailsRef.current.get(f.id) || [];
          const lastPt = prevTrail[prevTrail.length - 1];
          let updatedTrail = [...prevTrail];
          if (!lastPt || Math.hypot(lastPt[0] - f.latitude, lastPt[1] - f.longitude) > 0.0003) {
            updatedTrail.push([f.latitude, f.longitude]);
            if (updatedTrail.length > 5) updatedTrail.shift();
            trafficTrailsRef.current.set(f.id, updatedTrail);
          }

          // 2. Very vaguely visible trail of the aircraft
          if (updatedTrail.length >= 2) {
            const histLine = L.polyline(updatedTrail, {
              color: "#38bdf8",
              weight: 1.2,
              opacity: 0.22,
              dashArray: "2, 4",
              interactive: false,
            });
            group.addLayer(histLine);
          }

          // Subtle reverse decay trail opposite to heading so even newly appearing targets have a visible trail
          const headingDeg = Number(f.heading) || 0;
          const trailLenNm = Math.max(0.4, Math.min(1.2, ((Number(f.speed) || 250) / 450) * 0.9));
          const trailBack = destinationPoint(
            { lat: f.latitude, lng: f.longitude },
            (headingDeg + 180 + 360) % 360,
            trailLenNm
          );
          const decayLine = L.polyline(
            [
              [trailBack.lat, trailBack.lng],
              [f.latitude, f.longitude],
            ],
            {
              color: "#38bdf8",
              weight: 1.2,
              opacity: 0.16,
              dashArray: "3, 3",
              interactive: false,
            }
          );
          group.addLayer(decayLine);

          // 3. Aircraft symbol: simply a square dot with a line to which direction it's flying
          const size = 36;
          const center = 18;
          const rad = (headingDeg * Math.PI) / 180;
          const lineLen = 16;
          const x2 = center + Math.sin(rad) * lineLen;
          const y2 = center - Math.cos(rad) * lineLen;

          const iconHtml = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow: visible; display: block;">
              <line x1="${center}" y1="${center}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
              <rect x="${center - 2.5}" y="${center - 2.5}" width="5" height="5" fill="#38bdf8" stroke="#020617" stroke-width="0.8" />
            </svg>
          `;

          const icon = L.divIcon({
            html: iconHtml,
            className: "radar-traffic-marker",
            iconSize: [size, size],
            iconAnchor: [center, center],
          });

          const marker = L.marker([f.latitude, f.longitude], {
            icon,
            zIndexOffset: 320,
            interactive: true,
          });

          // 4. Hover info: aircraft type, speed, alt, distance from airport (nm), heading
          const altStr = `${(Number(f.altitude) || 0).toLocaleString()} ft`;
          const spdStr = `${Number(f.speed) || 0} kts`;
          const distStr = `${f.distanceNm} NM`;
          const hdgStr = `${Math.round(headingDeg).toString().padStart(3, "0")}°`;
          const acStr = f.aircraftName || "Aircraft";

          const tooltipHtml = `
            <div class="space-y-0.5 text-[11px] font-mono leading-tight select-none">
              <div class="font-bold text-sky-300 tracking-wide">${acStr}</div>
              <div class="text-slate-300">Speed: <span class="text-white font-medium">${spdStr}</span></div>
              <div class="text-slate-300">Alt: <span class="text-white font-medium">${altStr}</span></div>
              <div class="text-slate-300">Dist: <span class="text-white font-medium">${distStr}</span></div>
              <div class="text-slate-300">Hdg: <span class="text-white font-medium">${hdgStr}</span></div>
            </div>
          `;

          marker.bindTooltip(tooltipHtml, {
            direction: "top",
            offset: [0, -8],
            className: "radar-traffic-tooltip",
            opacity: 0.95,
            sticky: false,
          });

          group.addLayer(marker);
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Could not fetch live airborne traffic:", err);
        }
      }
    };

    fetchAndRenderTraffic();
    const interval = setInterval(fetchAndRenderTraffic, 10000);

    return () => {
      isMounted = false;
      abortController.abort();
      clearInterval(interval);
      group.clearLayers();
    };
  }, [currentAirport]);

  // Drag-and-Release Line Drawing Handlers
  const startLineDrag = useCallback(
    (point: { lat: number; lng: number }, fixId: string | null = null, isNewPointCreated: boolean = false) => {
      isDrawingLineRef.current = true;
      const initial: LineDragPreview = {
        startLatLng: point,
        startFixId: fixId,
        isNewPointCreated,
        currentLatLng: point,
        rawHeading: 360,
        snappedHeading: 360,
        isSnappedHeading: true,
        distanceNm: 0,
        targetSnapFixId: null,
      };
      lineDragStateRef.current = initial;
      setLineDragState(initial);
    },
    []
  );

  const handleLineMouseMove = useCallback((latlng: { lat: number; lng: number }, shiftPressed: boolean = false) => {
    if (!isDrawingLineRef.current || !lineDragStateRef.current) return;
    const start = lineDragStateRef.current.startLatLng;
    const map = mapRef.current;
    let curLatLng = { lat: latlng.lat, lng: latlng.lng };
    let targetSnapFixId: string | null = null;

    // 1. Check fix node snap (within 24px of another fix)
    if (map) {
      const mousePt = map.latLngToContainerPoint([latlng.lat, latlng.lng]);
      for (const f of fixesRef.current) {
        if (f.id === lineDragStateRef.current.startFixId) continue;
        const fixPt = map.latLngToContainerPoint([f.lat, f.lng]);
        if (mousePt.distanceTo(fixPt) < 24) {
          curLatLng = { lat: f.lat, lng: f.lng };
          targetSnapFixId = f.id;
          break;
        }
      }
    }

    const rawBearing = initialBearing(start, curLatLng);
    const rawDist = distanceNm(start, curLatLng);
    let normalizedHeading = (rawBearing % 360) === 0 ? 360 : (rawBearing % 360);
    const snapped10 = snapHeadingTo10(normalizedHeading);

    // 2. Heading snap to x0° radials is standard
    const isSnapping = snapHeadingRef.current !== false || shiftPressed;
    const shouldSnapHeading = !targetSnapFixId && isSnapping && rawDist > 0.05;
    if (shouldSnapHeading) {
      normalizedHeading = snapped10;
      curLatLng = destinationPoint(start, snapped10, rawDist);
    }

    const finalDist = distanceNm(start, curLatLng);

    const next: LineDragPreview = {
      startLatLng: start,
      startFixId: lineDragStateRef.current.startFixId,
      isNewPointCreated: Boolean(lineDragStateRef.current.isNewPointCreated),
      currentLatLng: curLatLng,
      rawHeading: normalizedHeading,
      snappedHeading: snapped10,
      isSnappedHeading: shouldSnapHeading,
      distanceNm: finalDist,
      targetSnapFixId,
    };
    lineDragStateRef.current = next;
    setLineDragState(next);
  }, []);

  const lastLineClickTimeRef = useRef<number>(0);

  const handleLineClickPoint = useCallback(
    (pt: { lat: number; lng: number }, clickedFixId: string | null = null) => {
      const now = Date.now();
      if (now - lastLineClickTimeRef.current < 120) return;
      lastLineClickTimeRef.current = now;

      if (!isDrawingLineRef.current || !lineDragStateRef.current) {
        // STEP 1: Set first point / start fresh line (click & release sets 1st point)
        let startFixId = clickedFixId;
        let startLatLng = pt;
        let isNewPointCreated = false;

        // Check if click was near an existing fix (within 24px)
        if (!startFixId && mapRef.current) {
          const clickPoint = mapRef.current.latLngToContainerPoint([pt.lat, pt.lng]);
          for (const f of fixesRef.current) {
            const fixPt = mapRef.current.latLngToContainerPoint([f.lat, f.lng]);
            if (clickPoint.distanceTo(fixPt) < 24) {
              startFixId = f.id;
              startLatLng = { lat: f.lat, lng: f.lng };
              break;
            }
          }
        }

        if (!startFixId) {
          // Put the first point down immediately
          const newFix: WhiteboardFix = {
            id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            lat: pt.lat,
            lng: pt.lng,
            color: selectedColorRef.current,
          };
          const nextFixes = [...fixesRef.current, newFix];
          fixesRef.current = nextFixes;
          setFixes(nextFixes);
          startFixId = newFix.id;
          startLatLng = { lat: newFix.lat, lng: newFix.lng };
          isNewPointCreated = true;
        }

        startLineDrag(startLatLng, startFixId, isNewPointCreated);
      } else {
        // STEP 2: Click again locks it in place! (like measuring lines work)
        const drag = lineDragStateRef.current;
        if (!drag || !drag.startFixId) {
          isDrawingLineRef.current = false;
          lineDragStateRef.current = null;
          setLineDragState(null);
          return;
        }

        let toId = clickedFixId || drag.targetSnapFixId;

        // Check if click was near an existing fix
        if (!toId && mapRef.current) {
          const clickPoint = mapRef.current.latLngToContainerPoint([pt.lat, pt.lng]);
          for (const f of fixesRef.current) {
            if (f.id === drag.startFixId) continue;
            const fixPt = mapRef.current.latLngToContainerPoint([f.lat, f.lng]);
            if (clickPoint.distanceTo(fixPt) < 24) {
              toId = f.id;
              break;
            }
          }
        }

        let nextFixes = [...fixesRef.current];

        if (!toId) {
          const targetPt = drag.currentLatLng || pt;
          const newEnd: WhiteboardFix = {
            id: `fix-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
            lat: targetPt.lat,
            lng: targetPt.lng,
            color: selectedColorRef.current,
          };
          toId = newEnd.id;
          nextFixes.push(newEnd);
        }

        if (drag.startFixId !== toId) {
          const newLine: WhiteboardLine = {
            id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromFixId: drag.startFixId,
            toFixId: toId,
            color: selectedColorRef.current,
          };
          const nextLines = [...linesRef.current, newLine];
          setFixes(nextFixes);
          setLines(nextLines);
          pushHistorySnapshot(nextFixes, nextLines, holdsRef.current, terrainRestrictionsRef.current);
        } else if (drag.isNewPointCreated) {
          pushHistorySnapshot(nextFixes, linesRef.current, holdsRef.current, terrainRestrictionsRef.current);
        }

        isDrawingLineRef.current = false;
        lineDragStateRef.current = null;
        setLineDragState(null);
      }
    },
    [startLineDrag, pushHistorySnapshot]
  );

  const finishLineDrag = useCallback(() => {
    if (!isDrawingLineRef.current) return;
    const drag = lineDragStateRef.current;
    if (drag && drag.distanceNm >= 0.05) {
      handleLineClickPoint(drag.currentLatLng, drag.targetSnapFixId);
    }
  }, [handleLineClickPoint]);

  // 2. Render Whiteboard Items (Fixes with Draggable Position, NO runway numbers)
  useEffect(() => {
    const group = whiteboardLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();
    polylineRefs.current.clear();

    const fixMap = new Map<string, WhiteboardFix>();
    fixes.forEach((f) => fixMap.set(f.id, f));

    // Render Clean Vector Lines
    lines.forEach((ln) => {
      const from = fixMap.get(ln.fromFixId);
      const to = fixMap.get(ln.toFixId);
      if (!from || !to) return;

      const polyline = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: ln.color || "#ef4444",
          weight: 3.5,
          opacity: 0.95,
          className: "whiteboard-vector-line cursor-pointer",
        }
      );

      polylineRefs.current.set(ln.id, polyline);

      const handleLineClick = (e: L.LeafletMouseEvent) => {
        if (activeTool === "line" || activeTool === "hold" || activeTool === "terrain") {
          return;
        }
        L.DomEvent.stopPropagation(e);
        const me = e.originalEvent as MouseEvent;

        if (activeTool === "eraser") {
          const connectedIds = getConnectedRouteLineIds(ln.id, lines);
          const orphanedFixes = getOrphanedFixIds(connectedIds, lines, fixes);
          const updatedLines = lines.filter((l) => !connectedIds.includes(l.id));
          const updatedFixes = fixes.filter((f) => !orphanedFixes.includes(f.id));
          setLines(updatedLines);
          setFixes(updatedFixes);
          pushHistorySnapshot(updatedFixes, updatedLines, holds, terrainRestrictions);
          return;
        }

        const connectedIds = getConnectedRouteLineIds(ln.id, lines);
        const orphanedFixes = getOrphanedFixIds(connectedIds, lines, fixes);
        setContextLine({
          lineId: ln.id,
          connectedCount: connectedIds.length,
          nodeCount: orphanedFixes.length + 1,
          x: me.clientX,
          y: me.clientY,
        });
      };

      polyline.on("click", handleLineClick);
      polyline.on("contextmenu", (e) => {
        const me = e.originalEvent as MouseEvent;
        if (me) {
          L.DomEvent.preventDefault(me);
          L.DomEvent.stopPropagation(me);
        }
        handleLineClick(e);
      });

      polyline.on("mouseover", () => {
        polyline.setStyle({ weight: 5, opacity: 1 });
      });
      polyline.on("mouseout", () => {
        polyline.setStyle({ weight: 3.5, opacity: 0.95 });
      });

      group.addLayer(polyline);
    });

    // Render Fixes (NO runway numbers or names, just clean fixes)
    fixes.forEach((fix) => {
      const hasTags = Boolean(fix.altitude || fix.speed);
      const dotColor = fix.isRunwayEnd ? "#38bdf8" : fix.color || selectedColor || "#ef4444";

      const formattedAlt = formatAltitude(fix.altitude);
      const formattedSpd = formatSpeed(fix.speed);

      // Clean minimalistic dot (with comfortable grab hit target)
      const fixHtml = `
        <div class="relative flex flex-col items-center cursor-grab active:cursor-grabbing select-none group" title="Fix (drag to move, click to connect)">
          <div class="absolute -top-2 -left-2 w-7 h-7 rounded-full cursor-grab active:cursor-grabbing z-10"></div>
          <div class="h-2.5 w-2.5 rounded-full border border-black/80 flex items-center justify-center group-hover:scale-125 transition-transform" style="background-color: ${dotColor}; box-shadow: 0 0 5px ${dotColor}aa;">
            <div class="h-0.5 w-0.5 rounded-full bg-slate-950"></div>
          </div>

          ${
            hasTags
              ? `
            <div class="absolute top-3.5 flex flex-col items-center whitespace-nowrap pointer-events-none">
              ${
                formattedAlt
                  ? `<span class="font-mono font-bold text-xs sm:text-sm text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)] leading-tight">${formattedAlt}</span>`
                  : ""
              }
              ${
                formattedSpd
                  ? `<span class="font-mono font-bold text-xs sm:text-sm text-emerald-400 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] leading-tight">${formattedSpd}</span>`
                  : ""
              }
            </div>
          `
              : ""
          }
        </div>
      `;

      const icon = L.divIcon({
        html: fixHtml,
        className: "whiteboard-fix-icon",
        iconAnchor: [5, 5],
      });

      const marker = L.marker([fix.lat, fix.lng], {
        icon,
        draggable: true, // Left-click & touch drag moves points! Click connects lines!
        zIndexOffset: fix.isRunwayEnd ? 340 : 300,
      });

      let liveLat = fix.lat;
      let liveLng = fix.lng;

      // Leaflet drag events for moving existing points (mouse and touch)
      marker.on("dragstart", () => {
        isDraggingMarkerRef.current = true;
        if (isDrawingLineRef.current) {
          isDrawingLineRef.current = false;
          setLineDragState(null);
          lineDragStateRef.current = null;
        }
        const markerEl = marker.getElement();
        if (markerEl) {
          markerEl.classList.add("cursor-grabbing");
        }
      });

      marker.on("drag", (e) => {
        const newPos = (e as any).target.getLatLng();
        liveLat = newPos.lat;
        liveLng = newPos.lng;

        // Dynamically stretch and update connected polylines in real time
        linesRef.current.forEach((ln) => {
          if (ln.fromFixId === fix.id || ln.toFixId === fix.id) {
            const poly = polylineRefs.current.get(ln.id);
            if (poly) {
              const otherFix = fixesRef.current.find(
                (f) => f.id === (ln.fromFixId === fix.id ? ln.toFixId : ln.fromFixId)
              );
              if (otherFix) {
                const fromPt: [number, number] =
                  ln.fromFixId === fix.id ? [liveLat, liveLng] : [otherFix.lat, otherFix.lng];
                const toPt: [number, number] =
                  ln.toFixId === fix.id ? [liveLat, liveLng] : [otherFix.lat, otherFix.lng];
                poly.setLatLngs([fromPt, toPt]);
              }
            }
          }
        });
      });

      marker.on("dragend", () => {
        isDraggingMarkerRef.current = false;
        justMovedPointWithRightClickRef.current = true;
        setTimeout(() => {
          justMovedPointWithRightClickRef.current = false;
        }, 250);

        const markerEl = marker.getElement();
        if (markerEl) {
          markerEl.classList.remove("cursor-grabbing");
        }

        const updatedFixes = fixesRef.current.map((f) =>
          f.id === fix.id ? { ...f, lat: liveLat, lng: liveLng } : f
        );
        fixesRef.current = updatedFixes;
        setFixes(updatedFixes);

        // Update any holds anchored at this fix
        const updatedHolds = holdsRef.current.map((h) =>
          Math.hypot(h.fixLat - fix.lat, h.fixLng - fix.lng) < 0.0002
            ? { ...h, fixLat: liveLat, fixLng: liveLng }
            : h
        );
        holdsRef.current = updatedHolds;
        setHolds(updatedHolds);

        pushHistorySnapshot(updatedFixes, linesRef.current, updatedHolds, terrainRestrictionsRef.current);
      });

      marker.on("mousedown", (e) => {
        if (isDraggingMarkerRef.current || selectedHold) {
          return;
        }

        const originalEv = e.originalEvent as MouseEvent | undefined;
        if (!originalEv) return;

        // RIGHT-CLICK: Also support moving point with right-click drag!
        if (originalEv.button === 2) {
          L.DomEvent.stopPropagation(e as any);
          L.DomEvent.preventDefault(originalEv);

          const startX = originalEv.clientX;
          const startY = originalEv.clientY;
          let hasMoved = false;

          isDraggingMarkerRef.current = true;
          isRightDraggingFixRef.current = {
            fixId: fix.id,
            startScreenX: startX,
            startScreenY: startY,
            startLatLng: { lat: fix.lat, lng: fix.lng },
            currentLatLng: { lat: fix.lat, lng: fix.lng },
            hasMoved: false,
          };

          const markerEl = marker.getElement();
          if (markerEl) {
            markerEl.classList.add("cursor-grabbing");
          }

          const onRightMouseMove = (moveEv: MouseEvent) => {
            const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);
            if (dist > 3) {
              hasMoved = true;
              if (isRightDraggingFixRef.current) {
                isRightDraggingFixRef.current.hasMoved = true;
              }
              const mapInst = mapRef.current;
              if (mapInst) {
                try {
                  const newLatLng = mapInst.mouseEventToLatLng(moveEv);
                  liveLat = newLatLng.lat;
                  liveLng = newLatLng.lng;
                  marker.setLatLng([liveLat, liveLng]);

                  // Update connected lines dynamically in real-time
                  linesRef.current.forEach((ln) => {
                    if (ln.fromFixId === fix.id || ln.toFixId === fix.id) {
                      const poly = polylineRefs.current.get(ln.id);
                      if (poly) {
                        const otherFix = fixesRef.current.find(
                          (f) => f.id === (ln.fromFixId === fix.id ? ln.toFixId : ln.fromFixId)
                        );
                        if (otherFix) {
                          const fromPt: [number, number] =
                            ln.fromFixId === fix.id ? [liveLat, liveLng] : [otherFix.lat, otherFix.lng];
                          const toPt: [number, number] =
                            ln.toFixId === fix.id ? [liveLat, liveLng] : [otherFix.lat, otherFix.lng];
                          poly.setLatLngs([fromPt, toPt]);
                        }
                      }
                    }
                  });
                } catch {}
              }
            }
          };

          const onRightMouseUp = (upEv: MouseEvent) => {
            window.removeEventListener("mousemove", onRightMouseMove);
            window.removeEventListener("mouseup", onRightMouseUp);
            isDraggingMarkerRef.current = false;
            isRightDraggingFixRef.current = null;

            if (markerEl) {
              markerEl.classList.remove("cursor-grabbing");
            }

            if (hasMoved) {
              justMovedPointWithRightClickRef.current = true;
              setTimeout(() => {
                justMovedPointWithRightClickRef.current = false;
              }, 250);

              const updatedFixes = fixesRef.current.map((f) =>
                f.id === fix.id ? { ...f, lat: liveLat, lng: liveLng } : f
              );
              fixesRef.current = updatedFixes;
              setFixes(updatedFixes);

              // Update any holds anchored at this fix
              const updatedHolds = holdsRef.current.map((h) =>
                Math.hypot(h.fixLat - fix.lat, h.fixLng - fix.lng) < 0.0002
                  ? { ...h, fixLat: liveLat, fixLng: liveLng }
                  : h
              );
              holdsRef.current = updatedHolds;
              setHolds(updatedHolds);

              pushHistorySnapshot(updatedFixes, linesRef.current, updatedHolds, terrainRestrictionsRef.current);
            }
          };

          window.addEventListener("mousemove", onRightMouseMove);
          window.addEventListener("mouseup", onRightMouseUp);
          return;
        }
      });

      marker.on("click", (e) => {
        if (isDraggingMarkerRef.current || justMovedPointWithRightClickRef.current) return;
        if (activeTool === "terrain") return;
        L.DomEvent.stopPropagation(e);

        if (activeTool === "eraser") {
          const updatedFixes = fixes.filter((f) => f.id !== fix.id);
          const updatedLines = lines.filter((l) => l.fromFixId !== fix.id && l.toFixId !== fix.id);
          setFixes(updatedFixes);
          setLines(updatedLines);
          pushHistorySnapshot(updatedFixes, updatedLines, holds, terrainRestrictions);
          return;
        }

        if (activeTool === "hold") {
          const incomingLine = lines.find((l) => l.toFixId === fix.id);
          let inbound = 270;
          if (incomingLine) {
            const fromFix = fixes.find((f) => f.id === incomingLine.fromFixId);
            if (fromFix) {
              inbound = Math.round(initialBearing({ lat: fromFix.lat, lng: fromFix.lng }, { lat: fix.lat, lng: fix.lng }));
            }
          }
          const newHold: WhiteboardHold = {
            id: `hold-${Date.now()}`,
            fixLat: fix.lat,
            fixLng: fix.lng,
            inboundHeading: inbound,
            turnDirection: "right",
            legLengthNm: 4.0,
            turnRadiusNm: 1.5,
          };
          const updatedHolds = [...holds, newHold];
          setHolds(updatedHolds);
          pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
          setSelectedHold(newHold);
          setActiveTool("none");
          setDrawingStartFixId(null);
          isDrawingLineRef.current = false;
          return;
        }

        // Line tool is standard: Left-click connects line or starts new line!
        if (activeTool === "line") {
          handleLineClickPoint({ lat: fix.lat, lng: fix.lng }, fix.id);
          return;
        }

        // Left clicked without dragging when activeTool is "none"
        const me = e.originalEvent as MouseEvent;
        if (me && !isDrawingLineRef.current) {
          setContextFix({ fix, x: me.clientX, y: me.clientY });
        }
      });

      marker.on("contextmenu", (e) => {
        const me = e.originalEvent as MouseEvent;
        if (me) {
          L.DomEvent.preventDefault(me);
          L.DomEvent.stopPropagation(me);
          if (justMovedPointWithRightClickRef.current) return;
          setContextFix({ fix, x: me.clientX, y: me.clientY });
        }
      });

      group.addLayer(marker);
    });

    // Render Holds
    holds.forEach((hold) => {
      let liveLat = hold.fixLat;
      let liveLng = hold.fixLng;
      let liveHeading = hold.inboundHeading;
      let liveLength = hold.legLengthNm || 4;
      let liveRadius = hold.turnRadiusNm || 0.85;

      const initialRacetrack = generateHoldingPattern(
        { lat: liveLat, lng: liveLng },
        liveHeading,
        hold.turnDirection,
        liveLength,
        liveRadius
      );

      const holdPolyline = L.polygon(initialRacetrack, {
        color: "#f59e0b",
        weight: 2.2,
        fillColor: "#fbbf24",
        fillOpacity: 0.08,
        dashArray: "4, 4",
      });
      holdPolyline.on("click", (e) => {
        if (activeTool === "line" || activeTool === "hold" || activeTool === "terrain") {
          return;
        }
        L.DomEvent.stopPropagation(e);
        if (activeTool === "eraser") {
          const updated = holds.filter((h) => h.id !== hold.id);
          setHolds(updated);
          pushHistorySnapshot(fixes, lines, updated, terrainRestrictions);
          return;
        }
        setSelectedHold(hold);
      });
      holdPolyline.on("contextmenu", (e) => {
        const me = e.originalEvent as MouseEvent;
        if (me) {
          L.DomEvent.preventDefault(me);
          L.DomEvent.stopPropagation(me);
        }
        if (activeTool === "eraser") {
          const updated = holds.filter((h) => h.id !== hold.id);
          setHolds(updated);
          pushHistorySnapshot(fixes, lines, updated, terrainRestrictions);
          return;
        }
        setSelectedHold(hold);
      });
      group.addLayer(holdPolyline);

      // Show altitude ONLY if filled by user, positioned in the center of the hold
      let holdCenterAltMarker: L.Marker | null = null;
      const formattedHoldAlt = formatAltitude(hold.altitude);
      if (formattedHoldAlt) {
        const centerPt = getHoldCenterPoint({
          ...hold,
          fixLat: liveLat,
          fixLng: liveLng,
          inboundHeading: liveHeading,
          legLengthNm: liveLength,
          turnRadiusNm: liveRadius,
        });

        const holdCenterAltIcon = L.divIcon({
          html: `
            <div class="pointer-events-none -translate-x-1/2 -translate-y-1/2 font-mono font-bold text-xs text-amber-300 text-center whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] select-none">
              ${formattedHoldAlt}
            </div>
          `,
          className: "hold-center-alt-badge bg-transparent border-0 pointer-events-none",
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        holdCenterAltMarker = L.marker([centerPt.lat, centerPt.lng], { icon: holdCenterAltIcon, zIndexOffset: 260, interactive: false });
        group.addLayer(holdCenterAltMarker);
      }

      // Far End Grab Handle (Turn 2 apex - adjusted by grabbing this end to shorten/lengthen or rotate)
      const initialFarEnd = getHoldFarEndApex({
        ...hold,
        fixLat: liveLat,
        fixLng: liveLng,
        inboundHeading: liveHeading,
        legLengthNm: liveLength,
        turnRadiusNm: liveRadius,
      });

      const holdEndIcon = L.divIcon({
        html: `
          <div class="relative group cursor-grab active:cursor-grabbing flex items-center justify-center -translate-x-1/2 -translate-y-1/2" title="Hold End: Grab to shorten/lengthen hold and rotate direction">
            <div class="absolute -inset-1 rounded-full bg-amber-400/30 group-hover:bg-amber-400/60 blur-[1px] transition-colors"></div>
            <div class="relative h-5 w-5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.9)] flex items-center justify-center text-slate-950 group-hover:scale-110 transition-transform">
              <div class="h-1.5 w-1.5 rounded-full bg-slate-950"></div>
            </div>
          </div>
        `,
        className: "hold-end-handle ui-control-handle",
        iconAnchor: [0, 0],
      });

      const holdEndMarker = L.marker([initialFarEnd.lat, initialFarEnd.lng], {
        icon: holdEndIcon,
        draggable: true,
        zIndexOffset: 380,
      });

      // 3. Side Size Handle (midpoint of outbound leg - drag to adjust hold width / turn radius)
      const initialSide = getHoldSizeHandle({
        ...hold,
        fixLat: liveLat,
        fixLng: liveLng,
        inboundHeading: liveHeading,
        legLengthNm: liveLength,
        turnRadiusNm: liveRadius,
      });

      const holdSideIcon = L.divIcon({
        html: `
          <div class="relative group cursor-grab active:cursor-grabbing flex items-center justify-center -translate-x-1/2 -translate-y-1/2" title="Hold Size: Drag to adjust width/size">
            <div class="absolute -inset-1 rounded-full bg-amber-400/30 group-hover:bg-amber-400/60 blur-[1px] transition-colors"></div>
            <div class="relative h-5 w-5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.9)] flex items-center justify-center text-slate-950 group-hover:scale-110 transition-transform">
              <div class="h-1.5 w-1.5 rounded-full bg-slate-950"></div>
            </div>
          </div>
        `,
        className: "hold-side-handle ui-control-handle",
        iconAnchor: [0, 0],
      });

      const holdSideMarker = L.marker([initialSide.lat, initialSide.lng], {
        icon: holdSideIcon,
        draggable: true,
        zIndexOffset: 375,
      });

      // Synchronous live updates across polyline and center badge
      const updateLiveRacetrack = () => {
        const newCoords = generateHoldingPattern(
          { lat: liveLat, lng: liveLng },
          liveHeading,
          hold.turnDirection,
          liveLength,
          liveRadius
        );
        holdPolyline.setLatLngs(newCoords);

        // Update center altitude badge if present
        if (holdCenterAltMarker) {
          const newCenter = getHoldCenterPoint({
            ...hold,
            fixLat: liveLat,
            fixLng: liveLng,
            inboundHeading: liveHeading,
            legLengthNm: liveLength,
            turnRadiusNm: liveRadius,
          });
          holdCenterAltMarker.setLatLng([newCenter.lat, newCenter.lng]);
        }
      };

      // 1. Fix Anchor Marker (Drag to change position / click to edit)
      const holdAnchorIcon = L.divIcon({
        html: `
          <div class="h-4 w-4 rounded-full bg-amber-400 border-2 border-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.9)] cursor-grab active:cursor-grabbing hover:scale-115 transition-transform" title="Hold Fix: Drag to move position, click to edit"></div>
        `,
        className: "hold-anchor-marker ui-control-handle",
        iconAnchor: [8, 8],
      });
      const holdAnchorMarker = L.marker([liveLat, liveLng], {
        icon: holdAnchorIcon,
        draggable: true,
        zIndexOffset: 360,
      });

      holdAnchorMarker.on("mousedown", (e) => {
        L.DomEvent.stopPropagation(e);
        isDrawingLineRef.current = false;
        if (activeTool === "line") {
          setActiveTool("none");
        }
        setSelectedHold(hold);
      });

      holdAnchorMarker.on("dragstart", () => {
        isDraggingMarkerRef.current = true;
        isDrawingLineRef.current = false;
      });

      holdAnchorMarker.on("drag", (e) => {
        const newPos = (e as any).target.getLatLng();
        liveLat = newPos.lat;
        liveLng = newPos.lng;
        updateLiveRacetrack();

        // Move the far end handle along with the hold
        const newFarEnd = getHoldFarEndApex({
          ...hold,
          fixLat: liveLat,
          fixLng: liveLng,
          inboundHeading: liveHeading,
          legLengthNm: liveLength,
          turnRadiusNm: liveRadius,
        });
        holdEndMarker.setLatLng([newFarEnd.lat, newFarEnd.lng]);

        // Move the side size handle along with the hold
        const newSidePos = getHoldSizeHandle({
          ...hold,
          fixLat: liveLat,
          fixLng: liveLng,
          inboundHeading: liveHeading,
          legLengthNm: liveLength,
          turnRadiusNm: liveRadius,
        });
        holdSideMarker.setLatLng([newSidePos.lat, newSidePos.lng]);
      });

      holdAnchorMarker.on("dragend", () => {
        isDraggingMarkerRef.current = false;
        const updatedHolds = holds.map((h) =>
          h.id === hold.id ? { ...h, fixLat: liveLat, fixLng: liveLng } : h
        );
        setHolds(updatedHolds);
        pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
      });

      holdAnchorMarker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === "eraser") {
          const updated = holds.filter((h) => h.id !== hold.id);
          setHolds(updated);
          pushHistorySnapshot(fixes, lines, updated, terrainRestrictions);
          return;
        }
        if (activeTool === "line") {
          setActiveTool("none");
        }
        setSelectedHold(hold);
      });
      group.addLayer(holdAnchorMarker);

      // 2. Far End Handle (Drag to shorten/lengthen or rotate direction)
      holdEndMarker.bindTooltip(`Hold Length ${liveLength.toFixed(1)} NM · Inb ${liveHeading}°`, {
        permanent: false,
        direction: "top",
        offset: [0, -18],
        className: "hold-tooltip-pill",
      });

      holdEndMarker.on("mousedown", (e) => {
        L.DomEvent.stopPropagation(e);
        isDrawingLineRef.current = false;
        if (activeTool === "line") {
          setActiveTool("none");
        }
        setSelectedHold(hold);
      });

      holdEndMarker.on("dragstart", () => {
        isDraggingMarkerRef.current = true;
        isDrawingLineRef.current = false;
      });

      holdEndMarker.on("drag", (e) => {
        const draggedPos = (e as any).target.getLatLng();

        // Calculate distance from Fix: controls leg length
        const distNm = distanceNm({ lat: liveLat, lng: liveLng }, { lat: draggedPos.lat, lng: draggedPos.lng });
        const calculatedLength = Math.max(1.5, Math.min(20, Math.round((distNm - liveRadius * 2) * 10) / 10));
        liveLength = calculatedLength;

        // Calculate bearing from Fix to dragged position: far end is outbound direction, inbound is opposite
        const rawBearing = initialBearing({ lat: liveLat, lng: liveLng }, { lat: draggedPos.lat, lng: draggedPos.lng });
        const newHeading = Math.round((rawBearing + 180) % 360);
        liveHeading = newHeading;

        updateLiveRacetrack();

        // Update side size handle position
        const newSidePos = getHoldSizeHandle({
          ...hold,
          fixLat: liveLat,
          fixLng: liveLng,
          inboundHeading: liveHeading,
          legLengthNm: liveLength,
          turnRadiusNm: liveRadius,
        });
        holdSideMarker.setLatLng([newSidePos.lat, newSidePos.lng]);

        (holdEndMarker as any).setTooltipContent?.(`Hold Length ${liveLength.toFixed(1)} NM · Inb ${liveHeading}°`);
        holdEndMarker.openTooltip();
      });

      holdEndMarker.on("dragend", () => {
        isDraggingMarkerRef.current = false;
        holdEndMarker.closeTooltip();
        const updatedHolds = holds.map((h) =>
          h.id === hold.id
            ? {
                ...h,
                inboundHeading: liveHeading,
                legLengthNm: liveLength,
              }
            : h
        );
        setHolds(updatedHolds);
        if (selectedHold?.id === hold.id) {
          setSelectedHold((prev) => (prev ? { ...prev, inboundHeading: liveHeading, legLengthNm: liveLength } : null));
        }
        pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
      });

      holdEndMarker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === "eraser") {
          const updated = holds.filter((h) => h.id !== hold.id);
          setHolds(updated);
          pushHistorySnapshot(fixes, lines, updated, terrainRestrictions);
          return;
        }
        if (activeTool === "line") {
          setActiveTool("none");
        }
        setSelectedHold(hold);
      });

      group.addLayer(holdEndMarker);

      // 3. Side Size Handle (Drag to widen/narrow the hold size / turn radius)
      holdSideMarker.bindTooltip(`Hold Size ${(liveRadius * 2).toFixed(1)} NM`, {
        permanent: false,
        direction: "top",
        offset: [0, -18],
        className: "hold-tooltip-pill",
      });

      holdSideMarker.on("mousedown", (e) => {
        L.DomEvent.stopPropagation(e);
        isDrawingLineRef.current = false;
        if (activeTool === "line") {
          setActiveTool("none");
        }
        setSelectedHold(hold);
      });

      holdSideMarker.on("dragstart", () => {
        isDraggingMarkerRef.current = true;
        isDrawingLineRef.current = false;
      });

      holdSideMarker.on("drag", (e) => {
        const draggedPos = (e as any).target.getLatLng();

        // Calculate perpendicular distance from Fix along outbound heading to find racetrack width
        const distNm = distanceNm({ lat: liveLat, lng: liveLng }, { lat: draggedPos.lat, lng: draggedPos.lng });
        const bearing = initialBearing({ lat: liveLat, lng: liveLng }, { lat: draggedPos.lat, lng: draggedPos.lng });
        const outboundHeading = (liveHeading + 180) % 360;
        const angleDiff = ((bearing - outboundHeading + 540) % 360) - 180;
        const perpDistNm = Math.abs(distNm * Math.sin((angleDiff * Math.PI) / 180));

        // Racetrack width is 2 * radius -> radius = width / 2
        const calculatedRadius = Math.max(0.4, Math.min(5.0, Math.round((perpDistNm / 2) * 10) / 10));
        liveRadius = calculatedRadius;

        updateLiveRacetrack();

        // Update far end handle position since radius changes apex location
        const newFarEnd = getHoldFarEndApex({
          ...hold,
          fixLat: liveLat,
          fixLng: liveLng,
          inboundHeading: liveHeading,
          legLengthNm: liveLength,
          turnRadiusNm: liveRadius,
        });
        holdEndMarker.setLatLng([newFarEnd.lat, newFarEnd.lng]);

        (holdSideMarker as any).setTooltipContent?.(`Hold Size ${(liveRadius * 2).toFixed(1)} NM · Rad ${liveRadius.toFixed(1)} NM`);
        holdSideMarker.openTooltip();
      });

      holdSideMarker.on("dragend", () => {
        isDraggingMarkerRef.current = false;
        holdSideMarker.closeTooltip();
        const updatedHolds = holds.map((h) =>
          h.id === hold.id
            ? {
                ...h,
                turnRadiusNm: liveRadius,
              }
            : h
        );
        setHolds(updatedHolds);
        if (selectedHold?.id === hold.id) {
          setSelectedHold((prev) => (prev ? { ...prev, turnRadiusNm: liveRadius } : null));
        }
        pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
      });

      holdSideMarker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === "eraser") {
          const updated = holds.filter((h) => h.id !== hold.id);
          setHolds(updated);
          pushHistorySnapshot(fixes, lines, updated, terrainRestrictions);
          return;
        }
        if (activeTool === "line") {
          setActiveTool("none");
        }
        setSelectedHold(hold);
      });

      group.addLayer(holdSideMarker);
    });

    // Render User-Drawn Restricted Airspaces
    terrainRestrictions.forEach((tr) => {
      const polygon = L.polygon(tr.points, {
        color: "#ef4444",
        weight: 1.8,
        fillColor: "#ef4444",
        fillOpacity: 0.18,
        dashArray: "5, 4",
      });

      polygon.bindPopup(`
        <div class="p-1 text-xs font-sans">
          <div class="font-bold text-red-500 uppercase tracking-wide">Area</div>
          <button id="del-tr-${tr.id}" class="mt-2 text-red-400 hover:text-red-300 text-[11px] cursor-pointer">Delete Area</button>
        </div>
      `);

      polygon.on("popupopen", () => {
        const btn = document.getElementById(`del-tr-${tr.id}`);
        if (btn) {
          btn.onclick = () => {
            const updatedTRs = terrainRestrictions.filter((item) => item.id !== tr.id);
            setTerrainRestrictions(updatedTRs);
            pushHistorySnapshot(fixes, lines, holds, updatedTRs);
          };
        }
      });

      group.addLayer(polygon);
    });
  }, [fixes, lines, holds, terrainRestrictions, activeTool, drawingStartFixId, selectedColor, selectedHold, pushHistorySnapshot]);

  // In-Progress Drawing Layer for Terrain Restrictions
  useEffect(() => {
    const group = drawingLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (inProgressPolygon.length > 0) {
      inProgressPolygon.forEach((pt) => {
        const ptIcon = L.divIcon({
          html: `<div class="h-2.5 w-2.5 rounded-full bg-red-500 border border-white"></div>`,
          className: "area-in-progress-marker ui-control-handle",
          iconAnchor: [5, 5],
        });
        group.addLayer(L.marker(pt, { icon: ptIcon }));
      });

      const poly = L.polyline(inProgressPolygon, { color: "#ef4444", weight: 2, dashArray: "4, 4" });
      group.addLayer(poly);
    }
  }, [inProgressPolygon]);

  // Helper to add any clicked Navaid or Fix point into the active approach plan / route
  const addNavPointToPlan = (name: string, lat: number, lng: number) => {
    let targetFix: WhiteboardFix | undefined = fixes.find(
      (f) =>
        (f.name && f.name.toUpperCase() === name.toUpperCase()) ||
        (Math.abs(f.lat - lat) < 0.0002 && Math.abs(f.lng - lng) < 0.0002)
    );

    let updatedFixes = fixes;
    if (!targetFix) {
      targetFix = {
        id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        lat,
        lng,
        color: selectedColor || "#ef4444",
      };
      updatedFixes = [...fixes, targetFix];
      setFixes(updatedFixes);
    }

    const assignedFix = targetFix;

    // Connect line from active drawing start fix (or last fix) to this point
    let updatedLines = lines;
    const prevFixId = drawingStartFixId || (fixes.length > 0 ? fixes[fixes.length - 1].id : null);
    if (prevFixId && prevFixId !== assignedFix.id) {
      const newLine: WhiteboardLine = {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromFixId: prevFixId,
        toFixId: assignedFix.id,
        color: selectedColor || "#ef4444",
      };
      updatedLines = [...lines, newLine];
      setLines(updatedLines);
    }

    setDrawingStartFixId(assignedFix.id);
    pushHistorySnapshot(updatedFixes, updatedLines, holds, terrainRestrictions);
  };

  // Fetch and render toggled navigation layers (Airports, Fixes, Navaids)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateNavLayers = () => {
      const bounds = map.getBounds();
      const minLat = bounds.getSouth();
      const maxLat = bounds.getNorth();
      const minLng = bounds.getWest();
      const maxLng = bounds.getEast();
      const query = `minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}`;
      const zoom = map.getZoom();

      // 1. Airports: Only appear at a zoom close enough (zoom >= 8)
      if (showAirports && zoom >= 8) {
        fetch(`/api/nav/airports?${query}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data: any[]) => {
            const group = airportsLayerGroupRef.current;
            if (!group) return;
            group.clearLayers();
            data.forEach((apt) => {
              const icon = L.divIcon({
                className: "nav-airport-marker",
                html: `<div class="flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group">
                  <div class="w-3 h-3 rounded-full border border-slate-400 bg-slate-950 flex items-center justify-center shadow-md transition-transform hover:scale-125">
                    <div class="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                  </div>
                  <span class="font-mono text-[10px] font-bold text-white bg-slate-950/95 px-1.5 py-0.5 rounded border border-slate-700 leading-none shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">${apt.icao} · ${apt.name}</span>
                </div>`,
                iconSize: [0, 0],
              });
              const marker = L.marker([apt.lat, apt.lng], { icon });
              marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (isMeasuringRef.current) {
                  handleMeasurePoint({ lat: apt.lat, lng: apt.lng });
                  return;
                }
                if (activeTool === "line") {
                  handleLineClickPoint({ lat: apt.lat, lng: apt.lng });
                  return;
                }
                setAirportConfirmTarget({
                  icao: apt.icao,
                  iata: apt.iata,
                  name: apt.name,
                  city: apt.city,
                  country: apt.country,
                  lat: apt.lat,
                  lng: apt.lng,
                  elevation: apt.elevation || 0,
                  runways: apt.runways || [],
                });
              });
              group.addLayer(marker);
            });
          })
          .catch(() => {});
      } else {
        airportsLayerGroupRef.current?.clearLayers();
      }

      // 2. Navaids: Simply a dot, only shows name when hovered on, clickable to add to plan (zoom >= 8)
      if (showNavaids && zoom >= 8) {
        fetch(`/api/nav/navaids?${query}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data: any[]) => {
            const group = navaidsLayerGroupRef.current;
            if (!group) return;
            group.clearLayers();
            data.forEach((nav) => {
              const marker = L.circleMarker([nav.lat, nav.lng], {
                radius: 3.5,
                color: "#94a3b8",
                fillColor: "#cbd5e1",
                fillOpacity: 0.9,
                weight: 1,
                className: "navaid-dot cursor-pointer",
              });
              // Navaids should simply be a dot and only show its name when hovered on
              const navName = nav.name || nav.ident;
              marker.bindTooltip(navName, {
                direction: "top",
                offset: [0, -4],
                className: "radar-tooltip",
              });
              marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (isMeasuringRef.current) {
                  handleMeasurePoint({ lat: nav.lat, lng: nav.lng });
                  return;
                }
                if (activeTool === "line") {
                  handleLineClickPoint({ lat: nav.lat, lng: nav.lng });
                  return;
                }
                addNavPointToPlan(navName, nav.lat, nav.lng);
              });
              group.addLayer(marker);
            });
          })
          .catch(() => {});
      } else {
        navaidsLayerGroupRef.current?.clearLayers();
      }

      // 3. Fixes: Simply a dot, only shows name when hovered on, clickable to add to plan (zoom >= 8)
      if (showFixes && zoom >= 8) {
        fetch(`/api/nav/fixes?${query}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data: any[]) => {
            const group = fixesLayerGroupRef.current;
            if (!group) return;
            group.clearLayers();
            data.forEach((fix) => {
              const marker = L.circleMarker([fix.lat, fix.lng], {
                radius: 3,
                color: "#64748b",
                fillColor: "#94a3b8",
                fillOpacity: 0.85,
                weight: 1,
                className: "fix-dot cursor-pointer",
              });
              // Fixes should also only show name when hovered over and be able to be added to a plan
              marker.bindTooltip(fix.name, {
                direction: "top",
                offset: [0, -3],
                className: "radar-tooltip",
              });
              marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (isMeasuringRef.current) {
                  handleMeasurePoint({ lat: fix.lat, lng: fix.lng });
                  return;
                }
                if (activeTool === "line") {
                  handleLineClickPoint({ lat: fix.lat, lng: fix.lng });
                  return;
                }
                addNavPointToPlan(fix.name, fix.lat, fix.lng);
              });
              group.addLayer(marker);
            });
          })
          .catch(() => {});
      } else {
        fixesLayerGroupRef.current?.clearLayers();
      }
    };

    updateNavLayers();
    map.on("moveend", updateNavLayers);
    map.on("zoomend", updateNavLayers);
    return () => {
      map.off("moveend", updateNavLayers);
      map.off("zoomend", updateNavLayers);
    };
  }, [showAirports, showNavaids, showFixes, fixes, lines, selectedColor, drawingStartFixId]);

  // Measuring Tool Map Listeners
  // Workflow: Click & release sets 1st point -> move mouse to view distance -> click again locks in place
  // Starting a new measurement makes previous one disappear -> distance is always shown horizontally
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isMeasuring) {
      const reset = { start: null, current: null, isLocked: false };
      measureStateRef.current = reset;
      setMeasureState(reset);
      measureLayerGroupRef.current?.clearLayers();
      map.getContainer().style.cursor = "";
      return;
    }

    map.getContainer().style.cursor = "crosshair";

    const onMapClick = (e: L.LeafletMouseEvent) => {
      handleMeasurePoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (measureStateRef.current.start && !measureStateRef.current.isLocked) {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
        const next = { ...measureStateRef.current, current: pt };
        measureStateRef.current = next;
        setMeasureState(next);
      }
    };

    map.on("click", onMapClick);
    map.on("mousemove", onMouseMove);

    return () => {
      map.off("click", onMapClick);
      map.off("mousemove", onMouseMove);
      map.getContainer().style.cursor = "";
    };
  }, [isMeasuring]);

  // Render active distance measurement on map (distance always shown horizontally)
  useEffect(() => {
    const group = measureLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!measureState.start || !measureState.current || !isMeasuring) return;

    const { start, current } = measureState;

    // Start point (solid red dot)
    const startDot = L.circleMarker([start.lat, start.lng], {
      radius: 4.5,
      color: "#ef4444",
      fillColor: "#ef4444",
      fillOpacity: 1,
      weight: 1.5,
      interactive: false,
    });
    group.addLayer(startDot);

    // End point (solid red dot)
    const endDot = L.circleMarker([current.lat, current.lng], {
      radius: 4.5,
      color: "#ef4444",
      fillColor: "#ef4444",
      fillOpacity: 1,
      weight: 1.5,
      interactive: false,
    });
    group.addLayer(endDot);

    // Red dashed polyline connecting them
    const line = L.polyline(
      [
        [start.lat, start.lng],
        [current.lat, current.lng],
      ],
      {
        color: "#ef4444",
        weight: 2,
        dashArray: "5, 5",
        interactive: false,
      }
    );
    group.addLayer(line);

    // Distance calculation
    const distNm = distanceNm(start, current);
    const distText =
      measureUnit === "km"
        ? `${(distNm * 1.852).toFixed(1)} km`
        : `${distNm.toFixed(1)} nm`;

    // Midpoint position
    const midLat = (start.lat + current.lat) / 2;
    const midLng = (start.lng + current.lng) / 2;

    // Distance is ALWAYS shown horizontally (no rotation angle!)
    const textIcon = L.divIcon({
      className: "measure-dist-horizontal-badge bg-transparent border-0",
      html: `<div style="white-space: nowrap; pointer-events: none; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; font-weight: 700; color: #ef4444; text-shadow: 0 1px 4px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.95); transform: translate(-50%, -130%); user-select: none;">${distText}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const labelMarker = L.marker([midLat, midLng], {
      icon: textIcon,
      interactive: false,
    });
    group.addLayer(labelMarker);
  }, [measureState, measureUnit, isMeasuring]);

  // Enable / disable map dragging when line tool is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeTool === "line") {
      map.dragging.disable();
      map.getContainer().style.cursor = "crosshair";
    } else if (!isMeasuring) {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    }
  }, [activeTool, isMeasuring]);

  // Map Drag-and-Release for Lines, and Click for Holds / Terrain
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let mouseDownPos: { x: number; y: number } | null = null;
    let hasDraggedDistance = false;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (isMeasuring || isDraggingMarkerRef.current || justMovedPointWithRightClickRef.current) return;
      const originalEv = e.originalEvent as MouseEvent | undefined;
      if (originalEv) {
        if (originalEv.button !== 0) return;
        const target = originalEv.target as HTMLElement | null;
        if (target && target.closest(".hold-end-handle, .hold-side-handle, .hold-anchor-marker, .hold-tooltip-pill, .whiteboard-fix-icon")) {
          return;
        }
        mouseDownPos = { x: originalEv.clientX, y: originalEv.clientY };
      }
      hasDraggedDistance = false;

      if (selectedHold) {
        setSelectedHold(null);
        return;
      }
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (activeTool === "line" && isDrawingLineRef.current) {
        if (mouseDownPos && e.originalEvent) {
          const dist = Math.hypot(
            (e.originalEvent as MouseEvent).clientX - mouseDownPos.x,
            (e.originalEvent as MouseEvent).clientY - mouseDownPos.y
          );
          if (dist > 15) {
            hasDraggedDistance = true;
          }
        }
        const shift = Boolean((e.originalEvent as MouseEvent)?.shiftKey);
        handleLineMouseMove({ lat: e.latlng.lat, lng: e.latlng.lng }, shift);
      }
    };

    const onMouseUp = () => {
      if (isDraggingMarkerRef.current || justMovedPointWithRightClickRef.current) {
        mouseDownPos = null;
        hasDraggedDistance = false;
        return;
      }
      if (activeTool === "line" && isDrawingLineRef.current && hasDraggedDistance) {
        // Continuous drag-and-release gesture: lock 2nd point immediately
        finishLineDrag();
      }
      mouseDownPos = null;
      hasDraggedDistance = false;
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      if (activeTool === "line" && isDrawingLineRef.current && map) {
        if (mouseDownPos) {
          const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
          if (dist > 15) {
            hasDraggedDistance = true;
          }
        }
        try {
          const latlng = map.mouseEventToLatLng(e);
          handleLineMouseMove({ lat: latlng.lat, lng: latlng.lng }, e.shiftKey);
        } catch {}
      }
    };

    const onWindowMouseUp = () => {
      if (isDraggingMarkerRef.current || justMovedPointWithRightClickRef.current) {
        mouseDownPos = null;
        hasDraggedDistance = false;
        return;
      }
      if (activeTool === "line" && isDrawingLineRef.current && hasDraggedDistance) {
        finishLineDrag();
      }
      mouseDownPos = null;
      hasDraggedDistance = false;
    };

    // Touch support for mobile and tablets (Smooth drag-and-release & tap-to-tap drawing)
    let touchStartPos: { x: number; y: number } | null = null;
    let hasMovedTouch = false;

    const onTouchStart = (e: TouchEvent) => {
      if (activeTool !== "line" || isMeasuring || e.touches.length !== 1) return;
      if (isDraggingMarkerRef.current || justMovedPointWithRightClickRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest(".hold-end-handle, .hold-side-handle, .hold-anchor-marker, .hold-tooltip-pill, .whiteboard-fix-icon")) {
        return;
      }
      if (selectedHold) {
        setSelectedHold(null);
        return;
      }
      try {
        const touch = e.touches[0];
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        hasMovedTouch = false;
        const latlng = map.mouseEventToLatLng(touch as any);

        if (!isDrawingLineRef.current) {
          let foundFixId: string | null = null;
          const containerPt = map.latLngToContainerPoint([latlng.lat, latlng.lng]);
          for (const f of fixesRef.current) {
            const fixPt = map.latLngToContainerPoint([f.lat, f.lng]);
            if (containerPt.distanceTo(fixPt) < 32) {
              foundFixId = f.id;
              break;
            }
          }
          if (foundFixId) {
            const fix = fixesRef.current.find(f => f.id === foundFixId)!;
            startLineDrag({ lat: fix.lat, lng: fix.lng }, foundFixId, false);
          } else {
            const newFix: WhiteboardFix = {
              id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              lat: latlng.lat,
              lng: latlng.lng,
              color: selectedColorRef.current,
            };
            const nextFixes = [...fixesRef.current, newFix];
            setFixes(nextFixes);
            startLineDrag({ lat: latlng.lat, lng: latlng.lng }, newFix.id, true);
          }
        } else {
          handleLineClickPoint({ lat: latlng.lat, lng: latlng.lng });
        }
      } catch {}
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeTool === "line" && isDrawingLineRef.current && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        if (touchStartPos) {
          const dist = Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y);
          if (dist > 10) {
            hasMovedTouch = true;
          }
        }
        try {
          const latlng = map.mouseEventToLatLng(touch as any);
          handleLineMouseMove({ lat: latlng.lat, lng: latlng.lng });
        } catch {}
      }
    };

    const onTouchEnd = () => {
      if (activeTool === "line" && isDrawingLineRef.current && hasMovedTouch) {
        finishLineDrag();
      }
      touchStartPos = null;
      hasMovedTouch = false;
    };

    // Map Click: sets 1st point, then click again locks 2nd point in place (like measuring lines work!)
    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (isMeasuring || isDraggingMarkerRef.current || justMovedPointWithRightClickRef.current) return;
      const originalEv = e.originalEvent as MouseEvent | undefined;
      if (originalEv && originalEv.button !== 0) return;

      if (selectedHold) {
        setSelectedHold(null);
        return;
      }

      const lat = e.latlng.lat;
      const lng = e.latlng.lng;

      if (activeTool === "line") {
        handleLineClickPoint({ lat, lng });
      } else if (activeTool === "hold") {
        const newHold: WhiteboardHold = {
          id: `hold-${Date.now()}`,
          fixLat: lat,
          fixLng: lng,
          inboundHeading: 270,
          turnDirection: "right",
          legLengthNm: 4,
          turnRadiusNm: 0.85,
        };
        const updatedHolds = [...holdsRef.current, newHold];
        setHolds(updatedHolds);
        pushHistorySnapshot(fixesRef.current, linesRef.current, updatedHolds, terrainRestrictionsRef.current);
        setSelectedHold(newHold);
        setActiveTool("none");
      } else if (activeTool === "terrain") {
        setInProgressPolygon((prev) => [...prev, [lat, lng]]);
      }
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    map.on("click", onMapClick);
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);

    const mapContainer = map.getContainer();
    mapContainer.addEventListener("touchstart", onTouchStart, { passive: true });
    mapContainer.addEventListener("touchmove", onTouchMove, { passive: false });
    mapContainer.addEventListener("touchend", onTouchEnd, { passive: true });
    mapContainer.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.off("click", onMapClick);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);

      mapContainer.removeEventListener("touchstart", onTouchStart);
      mapContainer.removeEventListener("touchmove", onTouchMove);
      mapContainer.removeEventListener("touchend", onTouchEnd);
      mapContainer.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [activeTool, isMeasuring, selectedHold, handleLineClickPoint, handleLineMouseMove, finishLineDrag, pushHistorySnapshot]);

  // Render Live Dashed Preview Line with Heading & Distance Badge while dragging
  useEffect(() => {
    const group = linePreviewLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!lineDragState || lineDragState.distanceNm < 0.02) return;

    const {
      startLatLng,
      currentLatLng,
      rawHeading,
      snappedHeading,
      isSnappedHeading,
      distanceNm: dNm,
      targetSnapFixId,
    } = lineDragState;

    const paneOption = { pane: "whiteboardPreviewPane" };

    // 1. Dark high-contrast glow casing underneath for maximum readability
    const casingLine = L.polyline(
      [
        [startLatLng.lat, startLatLng.lng],
        [currentLatLng.lat, currentLatLng.lng],
      ],
      {
        color: "#020617",
        weight: 6,
        opacity: 0.65,
        interactive: false,
        ...paneOption,
      }
    );
    group.addLayer(casingLine);

    // 2. Animated dashed polyline showing the line shape while dragging
    const dashedLine = L.polyline(
      [
        [startLatLng.lat, startLatLng.lng],
        [currentLatLng.lat, currentLatLng.lng],
      ],
      {
        color: selectedColor || "#ef4444",
        weight: 3.5,
        dashArray: "8, 6",
        opacity: 1,
        interactive: false,
        className: "whiteboard-drag-preview-line pointer-events-none",
        ...paneOption,
      }
    );
    group.addLayer(dashedLine);

    // 3. Start point ring
    const startMarker = L.circleMarker([startLatLng.lat, startLatLng.lng], {
      radius: 5,
      color: "#ffffff",
      fillColor: selectedColor || "#ef4444",
      fillOpacity: 1,
      weight: 2,
      interactive: false,
      ...paneOption,
    });
    group.addLayer(startMarker);

    // 4. End point marker (highlighted in cyan if node snapped)
    const isNodeSnap = Boolean(targetSnapFixId);
    const endMarker = L.circleMarker([currentLatLng.lat, currentLatLng.lng], {
      radius: isNodeSnap ? 7.5 : 5,
      color: isNodeSnap ? "#38bdf8" : "#ffffff",
      fillColor: isNodeSnap ? "#0284c7" : selectedColor || "#ef4444",
      fillOpacity: 1,
      weight: isNodeSnap ? 3 : 2,
      interactive: false,
      ...paneOption,
    });
    group.addLayer(endMarker);

    // 5. Live floating heading (unboxed, clean text without distance)
    const midLat = (startLatLng.lat + currentLatLng.lat) / 2;
    const midLng = (startLatLng.lng + currentLatLng.lng) / 2;
    const hdgVal = isSnappedHeading ? snappedHeading : rawHeading;
    const hdgFormatted = String(hdgVal).padStart(3, "0") + "°";

    const badgeHtml = `
      <div style="transform: translate(-50%, -50%); text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.95);" class="text-xs font-mono font-bold pointer-events-none select-none whitespace-nowrap">
        <span style="color: ${selectedColor || '#ffffff'};">HDG ${hdgFormatted}</span>
      </div>
    `;

    const badgeIcon = L.divIcon({
      html: badgeHtml,
      className: "whiteboard-live-drag-badge bg-transparent border-0 pointer-events-none",
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    group.addLayer(L.marker([midLat, midLng], { icon: badgeIcon, interactive: false, ...paneOption }));
  }, [lineDragState, selectedColor, snapHeading]);

  // Finish Terrain Restriction
  const finishTerrainRestriction = () => {
    if (inProgressPolygon.length >= 3) {
      const newTr: TerrainRestriction = {
        id: `tr-${Date.now()}`,
        points: [...inProgressPolygon, inProgressPolygon[0]],
      };
      const updatedTRs = [...terrainRestrictions, newTr];
      setTerrainRestrictions(updatedTRs);
      pushHistorySnapshot(fixes, lines, holds, updatedTRs);
    }
    setInProgressPolygon([]);
    setActiveTool("none");
  };

  // Delete All Lines (confirmed)
  const handleDeleteAllLines = () => {
    cancelActiveLineDrawing();
    if (activeTool === "line") {
      setActiveTool("none");
    }
    setLines([]);
    setDrawingStartFixId(null);
    setContextLine(null);
    pushHistorySnapshot(fixes, [], holds, terrainRestrictions);
    setConfirmDeleteLinesOpen(false);
  };

  // Clear Whiteboard (confirmed)
  const handleClearWhiteboardConfirmed = () => {
    cancelActiveLineDrawing();
    setActiveTool("none");
    setFixes([]);
    setLines([]);
    setHolds([]);
    setTerrainRestrictions([]);
    setDrawingStartFixId(null);
    setInProgressPolygon([]);
    setContextFix(null);
    setContextLine(null);
    setSelectedHold(null);
    try {
      localStorage.removeItem("veyro_map_annotations_v2");
    } catch {}
    pushHistorySnapshot([], [], [], []);
    setConfirmClearAllOpen(false);
  };

  // Delete Single Route Chain in 1 Click
  const handleDeleteRoute = (lineId: string) => {
    const connectedIds = getConnectedRouteLineIds(lineId, lines);
    const orphanedFixes = getOrphanedFixIds(connectedIds, lines, fixes);
    const updatedLines = lines.filter((l) => !connectedIds.includes(l.id));
    const updatedFixes = fixes.filter((f) => !orphanedFixes.includes(f.id));

    setLines(updatedLines);
    setFixes(updatedFixes);
    if (drawingStartFixId && orphanedFixes.includes(drawingStartFixId)) {
      setDrawingStartFixId(null);
    }
    pushHistorySnapshot(updatedFixes, updatedLines, holds, terrainRestrictions);
    setContextLine(null);
  };

  // Delete Single Segment
  const handleDeleteLineSegment = (lineId: string) => {
    const orphanedFixes = getOrphanedFixIds([lineId], lines, fixes);
    const updatedLines = lines.filter((l) => l.id !== lineId);
    const updatedFixes = fixes.filter((f) => !orphanedFixes.includes(f.id));

    setLines(updatedLines);
    setFixes(updatedFixes);
    pushHistorySnapshot(updatedFixes, updatedLines, holds, terrainRestrictions);
    setContextLine(null);
  };

  // On mobile screens (< 768px), display clear requirement for tablet/desktop
  if (!isTabletOrDesktop) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#090d16] text-slate-100 p-6 select-none">
        <div className="max-w-md w-full text-center space-y-6 bg-slate-900/95 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {/* Radar / Device illustration */}
          <div className="relative mx-auto w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.15)]">
            <Tablet className="h-9 w-9 text-amber-400" />
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
              <Monitor className="h-4 w-4 text-sky-300" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold tracking-wide uppercase">
              Tablet & Desktop Only
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Radar Scope Requires a Larger Screen
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              The Approach Controller Whiteboard is designed exclusively for tablet and desktop displays (minimum 768px). Please open on an iPad, tablet, or desktop computer to view the map, draw radar vectors, and manage holding patterns.
            </p>
          </div>

          {/* Device requirements cards */}
          <div className="grid grid-cols-2 gap-2.5 text-left">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Tablet className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>Tablets & iPads</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">Touch vector drawing, holding patterns, and airport terminal cones.</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Monitor className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span>Desktop & Laptops</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">High-resolution radar scope with mouse precision and terrain relief.</p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-lg flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Return to Pilot Search</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative z-10 isolate overflow-hidden bg-slate-950 select-none">
      {/* CLEAN & MINIMALISTIC COLLAPSABLE TOOLKIT */}
      <div className="absolute top-3 left-3 right-3 z-[30] pointer-events-none flex items-start justify-between gap-2">
        {/* Left: Airport Search */}
        <div className="relative pointer-events-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleAirportSearch(e.target.value)}
              placeholder="Search airport..."
              className="h-7 w-48 sm:w-56 rounded-md border border-slate-800/90 bg-slate-950/85 pl-7 pr-2 text-xs text-white placeholder:text-slate-500 shadow-sm backdrop-blur-md focus:outline-none focus:border-slate-600 focus:bg-slate-950 transition-colors"
            />
            {isSearching && (
              <span className="absolute right-2 top-1.5 text-[10px] text-slate-400 font-mono animate-pulse">...</span>
            )}

            {/* Airport Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-8 left-0 w-56 max-h-56 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/95 shadow-xl backdrop-blur-md z-[40] divide-y divide-slate-800/60">
                {searchResults.map((apt) => (
                  <button
                    key={`${apt.icao}-${apt.lat}`}
                    onClick={() => selectAirport(apt)}
                    className="w-full px-2.5 py-1.5 text-left hover:bg-slate-900 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                  >
                    <div className="min-w-0 pr-1">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-bold text-white group-hover:text-slate-200">{apt.icao}</span>
                        {apt.iata && (
                          <span className="text-[11px] text-slate-400">({apt.iata})</span>
                        )}
                        {apt.city && apt.city !== apt.name && (
                          <span className="text-[11px] text-slate-400 truncate max-w-[100px] font-sans">
                            · {apt.city}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-0.5 leading-tight">{apt.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Clean, Minimalistic & Collapsable Toolbar with Simple Slider Below */}
        <div className="flex flex-col items-end gap-1.5 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/95 border border-slate-800 p-1 rounded-lg shadow-md backdrop-blur-md">
            {/* Collapsed State Minimal Button */}
            {isToolbarCollapsed ? (
              <button
                onClick={() => setIsToolbarCollapsed(false)}
                className="px-2.5 py-1 text-xs text-slate-300 hover:text-white flex items-center gap-1 font-medium cursor-pointer transition-colors"
                title="Expand toolkit"
              >
                <span>Tools</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ) : (
              <>
                {/* Undo & Redo */}
                <div className="flex items-center">
                  <button
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      historyIndex > 0 ? "text-slate-300 hover:text-white" : "text-slate-600 cursor-not-allowed"
                    }`}
                    title="Undo"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      historyIndex < history.length - 1 ? "text-slate-300 hover:text-white" : "text-slate-600 cursor-not-allowed"
                    }`}
                    title="Redo"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-800" />

                {/* Vector Line */}
                <button
                  onClick={() => {
                    cancelActiveLineDrawing();
                    setActiveTool(activeTool === "line" ? "none" : "line");
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    activeTool === "line" ? "bg-red-600 text-white" : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                  title="Vector line"
                >
                  <PenTool className="h-3 w-3" />
                  <span>Line</span>
                </button>

                {/* Line Color Dots */}
                {activeTool === "line" && (
                  <div className="flex items-center gap-1 px-1">
                    {LINE_COLORS.map((col) => (
                      <button
                        key={col.hex}
                        onClick={() => setSelectedColor(col.hex)}
                        style={{ backgroundColor: col.hex }}
                        className={`h-3 w-3 rounded-full cursor-pointer transition-transform ${
                          selectedColor === col.hex ? "scale-125 ring-1 ring-white" : "opacity-70 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Hold */}
                <button
                  onClick={() => setActiveTool(activeTool === "hold" ? "none" : "hold")}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    activeTool === "hold" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                  title="Holding pattern"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Hold</span>
                </button>

                {/* Terrain MSA Toggle */}
                <button
                  onClick={() => setShowTerrainLayer(!showTerrainLayer)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    showTerrainLayer ? "bg-emerald-600 text-white font-semibold shadow-xs" : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                  title="Toggle hypsometric terrain elevation & live MSA hover"
                >
                  <Mountain className="h-3 w-3" />
                  <span>Terrain</span>
                </button>

                {/* Area Perimeter (formerly Restricted Airspace) */}
                <button
                  onClick={() => {
                    if (activeTool === "terrain") {
                      finishTerrainRestriction();
                    } else {
                      setActiveTool("terrain");
                      setInProgressPolygon([]);
                    }
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    activeTool === "terrain" ? "bg-red-600 text-white font-semibold" : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                  title="Draw area perimeter"
                >
                  <Ban className="h-3 w-3" />
                  <span>Area</span>
                </button>

                {/* Eraser */}
                <button
                  onClick={() => setActiveTool(activeTool === "eraser" ? "none" : "eraser")}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    activeTool === "eraser" ? "bg-rose-600 text-white" : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                  title="Eraser tool"
                >
                  <Scissors className="h-3 w-3" />
                  <span>Erase</span>
                </button>

                {/* Clear */}
                {(lines.length > 0 || fixes.length > 0 || holds.length > 0 || terrainRestrictions.length > 0) && (
                  <button
                    onClick={() => setConfirmClearAllOpen(true)}
                    className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                    title="Clear lines and items"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                <div className="h-4 w-px bg-slate-800" />

                {/* Center / Fit Plan */}
                <button
                  onClick={centerPlanOnMap}
                  className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Center & fit entire plan in view"
                >
                  <Focus className="h-3.5 w-3.5" />
                </button>

                {/* Save changes */}
                <button
                  onClick={handleManualSave}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
                    saveFeedback
                      ? "bg-emerald-500 text-white font-bold ring-2 ring-emerald-300 shadow-md"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30"
                  }`}
                  title="Save all changes to browser storage so exiting doesn't clear them"
                >
                  {saveFeedback ? (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                      <span>Saved! {lastSavedTime ? `(${lastSavedTime})` : ""}</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </>
                  )}
                </button>

                {/* Share */}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  title="Share plan"
                >
                  <Share2 className="h-3 w-3" />
                  <span>Share</span>
                </button>

                {/* Collapse Toolbar Button */}
                <button
                  onClick={() => setIsToolbarCollapsed(true)}
                  className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer ml-0.5"
                  title="Collapse toolbar"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Simple Slider below toolbar for min safe alt - range 0 to highest MSA in area */}
          {showTerrainLayer && (
            <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/95 border border-slate-800 px-3 py-1.5 rounded-lg shadow-md backdrop-blur-md text-xs text-slate-300">
              <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                Min Safe Alt:
              </span>
              <input
                type="range"
                min="0"
                max={areaMaxMsa}
                step="500"
                value={minSafeAltFt}
                onChange={(e) => setMinSafeAltFt(parseInt(e.target.value, 10))}
                className="w-28 sm:w-36 accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                title={`Min Safe Altitude (0 to ${areaMaxMsa.toLocaleString()} ft)`}
              />
              <span className="font-mono text-[11px] font-bold text-amber-400 min-w-[36px] text-right">
                {minSafeAltFt === 0 ? "Off" : `${minSafeAltFt.toLocaleString()}'`}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                / {areaMaxMsa.toLocaleString()}'
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas with Standard Radar Scope Filter and Dark Terrain Relief */}
      <div
        ref={mapContainerRef}
        className="h-full w-full z-0 select-none [&_.radar-dark-tiles]:brightness-[0.82] [&_.radar-dark-tiles]:contrast-[1.05] [&_.radar-dark-tiles]:saturate-[0.75] [&_.terrain-dark-relief]:filter-[grayscale(1)_invert(1)_brightness(0.78)_contrast(1.4)] [&_.terrain-dark-relief]:mix-blend-screen [&_.opentopo-dark-tiles]:invert [&_.opentopo-dark-tiles]:hue-rotate-180 [&_.opentopo-dark-tiles]:brightness-[0.80] [&_.opentopo-dark-tiles]:contrast-[1.12] [&_.opentopo-natural-tiles]:opacity-95 [&_.custom-terrain-dark-overlay]:grayscale [&_.custom-terrain-dark-overlay]:brightness-[0.6] [&_.custom-terrain-dark-overlay]:mix-blend-overlay [&_.leaflet-msaTerrariumPane-pane]:pointer-events-none [&_.leaflet-msaTerrariumPane-pane_*]:pointer-events-none"
      />

      {/* Live Hover Precise Terrain Elevation + MSA Badge */}
      {showTerrainLayer &&
        currentAirport &&
        cursorScreenPos &&
        cursorMsaInfo &&
        activeTool === "none" && (
        <div
          className="absolute z-[40] pointer-events-none rounded-md border border-slate-800 bg-slate-950/90 px-2.5 py-1 shadow-xl backdrop-blur-md font-mono text-xs select-none whitespace-nowrap flex items-center gap-2"
          style={{
            left: `${cursorScreenPos.x + 14}px`,
            top: `${cursorScreenPos.y - 32}px`,
          }}
        >
          <span className="font-bold text-white">
            {cursorMsaInfo.elevationFt.toLocaleString()}'
          </span>
          <span className="text-slate-500">|</span>
          <span className="font-bold text-white">
            MSA {cursorMsaInfo.msaFt.toLocaleString()}'
          </span>
        </div>
      )}

      {/* Top-Left Live Precise Elevation + MSA Display */}
      {showTerrainLayer && currentAirport && (
        <div className="absolute top-12 left-3 z-[25] rounded-md border border-slate-800 bg-slate-950/90 px-2.5 py-1 shadow-xl backdrop-blur-md font-mono text-xs select-none pointer-events-none flex items-center gap-2">
          <span className="font-bold text-white">
            {cursorMsaInfo
              ? `${cursorMsaInfo.elevationFt.toLocaleString()}'`
              : `${currentAirport.elevation.toLocaleString()}'`}
          </span>
          <span className="text-slate-500">|</span>
          <span className="font-bold text-white">
            MSA{" "}
            {cursorMsaInfo
              ? `${cursorMsaInfo.msaFt.toLocaleString()}'`
              : `${Math.max(2000, Math.ceil((currentAirport.elevation + 1500) / 500) * 500).toLocaleString()}'`}
          </span>
        </div>
      )}

      {/* Dismissable Airport Prompt Banner */}
      {!currentAirport && !isPromptDismissed && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[25] rounded-lg border border-sky-500/30 bg-slate-950/90 px-3 py-1.5 text-xs text-sky-200 shadow-xl backdrop-blur-md flex items-center gap-2.5">
          <span>Search any airport in the search bar above to display runway approach cones.</span>
          <button
            onClick={dismissPromptNotice}
            className="p-0.5 rounded text-sky-400 hover:text-white cursor-pointer"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}


      {/* Eraser Tool Active Notice */}
      {activeTool === "eraser" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[25] rounded-lg border border-rose-500/50 bg-slate-950/95 px-3 py-1.5 text-xs text-rose-200 shadow-xl backdrop-blur-md flex items-center gap-2.5">
          <span>Click any line on the map to delete its route.</span>
          <button
            onClick={() => setActiveTool("none")}
            className="rounded px-1.5 py-0.5 bg-slate-800 text-slate-200 text-[11px] cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {/* Area Guide */}
      {activeTool === "terrain" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[25] rounded-lg border border-red-500/50 bg-slate-950/95 px-3 py-1.5 text-xs text-red-200 shadow-xl backdrop-blur-md flex items-center gap-2.5">
          <span>Area perimeter: {inProgressPolygon.length} points</span>
          {inProgressPolygon.length >= 3 && (
            <button
              onClick={finishTerrainRestriction}
              className="rounded bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 text-xs font-semibold cursor-pointer"
            >
              Finish Area
            </button>
          )}
          <button
            onClick={() => {
              setInProgressPolygon([]);
              setActiveTool("none");
            }}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* LINE CONTEXT MENU */}
      {contextLine && (
        <div
          className="fixed z-[999999] w-64 rounded-lg border border-slate-700 bg-slate-950/98 p-3 shadow-2xl backdrop-blur-xl text-xs space-y-2.5 text-slate-200"
          style={{
            top: Math.min(window.innerHeight - 200, contextLine.y),
            left: Math.min(window.innerWidth - 260, contextLine.x),
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-semibold text-slate-200">Line Options</span>
            <button onClick={() => setContextLine(null)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Snap 10° Toggle when line is selected */}
          <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-2.5 py-2 rounded-md">
            <div>
              <div className="font-medium text-white">10° Heading Snap</div>
              <div className="text-[10px] text-slate-400">Snap line bearings to x0° radials</div>
            </div>
            <button
              type="button"
              onClick={() => setSnapHeading((v) => !v)}
              className={`px-2.5 py-1 rounded font-semibold text-xs transition-all cursor-pointer ${
                snapHeading
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {snapHeading ? "ON" : "OFF"}
            </button>
          </div>

          <div className="space-y-1 pt-1 border-t border-slate-800/80">
            <button
              onClick={() => handleDeleteRoute(contextLine.lineId)}
              className="w-full text-left px-2 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-rose-200 text-xs font-semibold flex items-center justify-between cursor-pointer"
            >
              <span>Delete Route</span>
              <span className="text-[10px] font-mono opacity-80">{contextLine.connectedCount} lines</span>
            </button>

            <button
              onClick={() => handleDeleteLineSegment(contextLine.lineId)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-between cursor-pointer"
            >
              <span>Delete Segment</span>
              <span className="text-[10px] text-slate-500 font-mono">1 line</span>
            </button>
          </div>
        </div>
      )}

      {/* FIX CONTEXT MENU (Cleaned Altitude & Speed without labels) */}
      {contextFix && (
        <div
          className="fixed z-[999999] w-60 rounded-lg border border-slate-700 bg-slate-950/98 p-3 shadow-2xl backdrop-blur-xl text-xs space-y-2 text-slate-200"
          style={{
            top: Math.min(window.innerHeight - 180, contextFix.y),
            left: Math.min(window.innerWidth - 260, contextFix.x),
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-semibold text-slate-200">Fix Settings</span>
            <button onClick={() => setContextFix(null)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white uppercase font-bold tracking-wide">Altitude</label>
              <input
                type="text"
                placeholder="e.g. 080 or 3000"
                value={contextFix.fix.altitude || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedFixes = fixes.map((f) => (f.id === contextFix.fix.id ? { ...f, altitude: val } : f));
                  setFixes(updatedFixes);
                  setContextFix((prev) => (prev ? { ...prev, fix: { ...prev.fix, altitude: val } } : null));
                }}
                onBlur={(e) => {
                  const formatted = formatAltitude(e.target.value);
                  const updatedFixes = fixes.map((f) =>
                    f.id === contextFix.fix.id ? { ...f, altitude: formatted } : f
                  );
                  setFixes(updatedFixes);
                  setContextFix((prev) => (prev ? { ...prev, fix: { ...prev.fix, altitude: formatted } } : null));
                  pushHistorySnapshot(updatedFixes, lines, holds, terrainRestrictions);
                }}
                className="w-full h-7 rounded border border-slate-700 bg-slate-900 px-2 font-mono text-xs text-white font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] text-emerald-400 uppercase font-bold tracking-wide">Speed</label>
              <input
                type="text"
                placeholder="e.g. 210"
                value={contextFix.fix.speed || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedFixes = fixes.map((f) => (f.id === contextFix.fix.id ? { ...f, speed: val } : f));
                  setFixes(updatedFixes);
                  setContextFix((prev) => (prev ? { ...prev, fix: { ...prev.fix, speed: val } } : null));
                }}
                onBlur={(e) => {
                  const formatted = formatSpeed(e.target.value);
                  const updatedFixes = fixes.map((f) =>
                    f.id === contextFix.fix.id ? { ...f, speed: formatted } : f
                  );
                  setFixes(updatedFixes);
                  setContextFix((prev) => (prev ? { ...prev, fix: { ...prev.fix, speed: formatted } } : null));
                  pushHistorySnapshot(updatedFixes, lines, holds, terrainRestrictions);
                }}
                className="w-full h-7 rounded border border-slate-700 bg-slate-900 px-2 font-mono text-xs text-emerald-400 font-bold"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setActiveTool("line");
                  setDrawingStartFixId(contextFix.fix.id);
                  setContextFix(null);
                }}
                className="inline-flex items-center gap-1 rounded bg-sky-600 hover:bg-sky-500 text-white px-2 py-1 text-[11px] font-medium cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>Next leg</span>
              </button>

              <button
                onClick={() => {
                  const incomingLine = lines.find((l) => l.toFixId === contextFix.fix.id);
                  let inbound = 270;
                  if (incomingLine) {
                    const fromFix = fixes.find((f) => f.id === incomingLine.fromFixId);
                    if (fromFix) {
                      inbound = Math.round(initialBearing({ lat: fromFix.lat, lng: fromFix.lng }, { lat: contextFix.fix.lat, lng: contextFix.fix.lng }));
                    }
                  }
                  const newHold: WhiteboardHold = {
                    id: `hold-${Date.now()}`,
                    fixLat: contextFix.fix.lat,
                    fixLng: contextFix.fix.lng,
                    inboundHeading: inbound,
                    turnDirection: "right",
                    legLengthNm: 4.0,
                    turnRadiusNm: 1.5,
                  };
                  const updatedHolds = [...holds, newHold];
                  setHolds(updatedHolds);
                  pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
                  setSelectedHold(newHold);
                  setContextFix(null);
                  setActiveTool("none");
                  setDrawingStartFixId(null);
                  isDrawingLineRef.current = false;
                }}
                className="inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 text-[11px] font-medium cursor-pointer"
                title="Create holding pattern anchored to this fix"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Hold</span>
              </button>
            </div>

            <button
              onClick={() => {
                const updatedFixes = fixes.filter((f) => f.id !== contextFix.fix.id);
                const updatedLines = lines.filter(
                  (l) => l.fromFixId !== contextFix.fix.id && l.toFixId !== contextFix.fix.id
                );
                setFixes(updatedFixes);
                setLines(updatedLines);
                pushHistorySnapshot(updatedFixes, updatedLines, holds, terrainRestrictions);
                setContextFix(null);
              }}
              className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Minimalist Down-Left Navigation & Measuring Controls (no colors, no symbols) */}
      <div className="absolute bottom-4 left-4 z-[30] flex items-center gap-1.5 bg-slate-950/90 border border-slate-800/80 px-2 py-1.5 rounded-lg shadow-2xl backdrop-blur-md text-[11px] font-mono select-none">
        <button
          type="button"
          onClick={() => setShowAirports((v) => !v)}
          className={`px-2 py-1 rounded transition-colors cursor-pointer ${
            showAirports
              ? "bg-slate-800 text-white font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Toggle Airports"
        >
          Airports
        </button>

        <button
          type="button"
          onClick={() => setShowFixes((v) => !v)}
          className={`px-2 py-1 rounded transition-colors cursor-pointer ${
            showFixes
              ? "bg-slate-800 text-white font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Toggle Fixes"
        >
          Fixes
        </button>

        <button
          type="button"
          onClick={() => setShowNavaids((v) => !v)}
          className={`px-2 py-1 rounded transition-colors cursor-pointer ${
            showNavaids
              ? "bg-slate-800 text-white font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Toggle Navaids"
        >
          Navaids
        </button>

        <div className="h-3.5 w-px bg-slate-800 mx-0.5" />

        <button
          type="button"
          onClick={() => {
            setIsMeasuring((v) => {
              const next = !v;
              if (next) setActiveTool("none");
              return next;
            });
          }}
          className={`px-2 py-1 rounded transition-colors cursor-pointer ${
            isMeasuring
              ? "bg-slate-800 text-white font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Click to set start point, move to view distance, click again to lock"
        >
          Measure
        </button>

        <div className="flex items-center rounded bg-slate-900 border border-slate-800 overflow-hidden text-[10px]">
          <button
            type="button"
            onClick={() => setMeasureUnit("nm")}
            className={`px-1.5 py-0.5 transition-colors cursor-pointer ${
              measureUnit === "nm"
                ? "bg-slate-700 text-white font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Nautical Miles"
          >
            NM
          </button>
          <button
            type="button"
            onClick={() => setMeasureUnit("km")}
            className={`px-1.5 py-0.5 transition-colors cursor-pointer ${
              measureUnit === "km"
                ? "bg-slate-700 text-white font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Kilometers"
          >
            KM
          </button>
        </div>

        <div className="h-3.5 w-px bg-slate-800 mx-0.5" />

        {activeTool === "line" && (
          <>
            <button
              type="button"
              onClick={() => setSnapHeading((v) => !v)}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                snapHeading
                  ? "bg-slate-800 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Toggle 10° heading snap when drawing lines"
            >
              Snap 10°
            </button>
            <div className="h-3.5 w-px bg-slate-800 mx-0.5" />
          </>
        )}

        {/* Glideslope Altitudes Toggle Button & Runway Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowGsMenu((v) => !v)}
            className={`px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              enabledGsRunways.length > 0
                ? "bg-red-600 text-white font-semibold shadow-xs"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle Glideslope Altitudes per Runway"
          >
            <span>G/S</span>
            {enabledGsRunways.length > 0 && (
              <span className="text-[10px] bg-slate-950/60 text-white px-1 py-0.2 rounded-full font-bold">
                {enabledGsRunways.length}
              </span>
            )}
          </button>

          {/* Runway Popover Menu */}
          {showGsMenu && (
            <div className="absolute bottom-9 left-0 z-50 w-56 rounded-lg border border-slate-700 bg-slate-950/98 p-2.5 shadow-2xl backdrop-blur-xl text-xs space-y-2 text-slate-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-red-400">G/S Runways</span>
                  {currentAirport && (
                    <span className="text-[10px] text-slate-400 font-mono">({currentAirport.icao})</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowGsMenu(false)}
                  className="text-slate-400 hover:text-white cursor-pointer p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {!currentAirport || !Array.isArray(currentAirport.runways) || currentAirport.runways.length === 0 ? (
                <div className="text-[11px] text-slate-400 py-1">
                  Search or select an airport to toggle runway glideslopes.
                </div>
              ) : (
                <>
                  <div className="text-[10px] text-slate-400">
                    Select runways to show G/S dots & line:
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                    {currentAirport.runways
                      .filter((r) => r && r.id && /^(0?[1-9]|[12][0-9]|3[0-6])[LRC]?$/i.test(r.id.trim()))
                      .map((rwy) => {
                        const isActive = enabledGsRunways.includes(rwy.id);
                        return (
                          <button
                            key={rwy.id}
                            type="button"
                            onClick={() => toggleGsRunway(rwy.id)}
                            className={`px-2 py-1.5 rounded font-mono text-xs font-bold transition-all cursor-pointer text-center ${
                              isActive
                                ? "bg-red-600 text-white shadow-xs"
                                : "bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                            }`}
                          >
                            {rwy.id}
                          </button>
                        );
                      })}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = (currentAirport.runways || [])
                          .filter((r) => r && r.id && /^(0?[1-9]|[12][0-9]|3[0-6])[LRC]?$/i.test(r.id.trim()))
                          .map((r) => r.id);
                        setEnabledGsRunways(allIds);
                      }}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnabledGsRunways([])}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* HOLD SETTINGS POPUP - ONLY ALT AND LEFT OR RIGHT */}
      {selectedHold && (
        <div className="absolute bottom-16 left-4 z-[35] w-60 rounded-lg border border-slate-700 bg-slate-950/98 p-3 shadow-2xl backdrop-blur-xl text-xs space-y-2.5 text-slate-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-semibold text-amber-400">Hold</span>
            <button onClick={() => setSelectedHold(null)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 1. Altitude */}
          <div className="space-y-1">
            <label className="text-[10px] text-white uppercase font-bold tracking-wide">Altitude (optional)</label>
            <input
              type="text"
              placeholder="e.g. 5000 or FL110"
              value={selectedHold.altitude || ""}
              onChange={(e) => {
                const val = e.target.value;
                const updatedHolds = holds.map((h) => (h.id === selectedHold.id ? { ...h, altitude: val } : h));
                setHolds(updatedHolds);
                setSelectedHold((prev) => (prev ? { ...prev, altitude: val } : null));
              }}
              onBlur={(e) => {
                const formatted = formatAltitude(e.target.value);
                const updatedHolds = holds.map((h) =>
                  h.id === selectedHold.id ? { ...h, altitude: formatted } : h
                );
                setHolds(updatedHolds);
                setSelectedHold((prev) => (prev ? { ...prev, altitude: formatted } : null));
                pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
              }}
              className="w-full h-7 rounded border border-slate-700 bg-slate-900 px-2 font-mono text-xs text-white font-bold"
            />
          </div>

          {/* 2. Left or Right Turn */}
          <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
            <label className="text-[10px] text-slate-300 uppercase font-bold tracking-wide">Turn Direction</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const updatedHolds = holds.map((h) =>
                    h.id === selectedHold.id ? { ...h, turnDirection: "right" as const } : h
                  );
                  setHolds(updatedHolds);
                  setSelectedHold((prev) => (prev ? { ...prev, turnDirection: "right" } : null));
                  pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
                }}
                className={`py-1.5 px-2 rounded font-medium text-xs transition-colors cursor-pointer text-center ${
                  selectedHold.turnDirection === "right"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                    : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                Right
              </button>

              <button
                type="button"
                onClick={() => {
                  const updatedHolds = holds.map((h) =>
                    h.id === selectedHold.id ? { ...h, turnDirection: "left" as const } : h
                  );
                  setHolds(updatedHolds);
                  setSelectedHold((prev) => (prev ? { ...prev, turnDirection: "left" } : null));
                  pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
                }}
                className={`py-1.5 px-2 rounded font-medium text-xs transition-colors cursor-pointer text-center ${
                  selectedHold.turnDirection === "left"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                    : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                Left
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <button
              onClick={() => setSelectedHold(null)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Done
            </button>
            <button
              onClick={() => {
                const updatedHolds = holds.filter((h) => h.id !== selectedHold.id);
                setHolds(updatedHolds);
                pushHistorySnapshot(fixes, lines, updatedHolds, terrainRestrictions);
                setSelectedHold(null);
              }}
              className="text-red-400 hover:text-red-300 text-xs font-semibold cursor-pointer"
            >
              Delete Hold
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE ALL LINES MODAL */}
      {confirmDeleteLinesOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-rose-600/40 bg-slate-950 p-5 shadow-2xl text-xs text-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Delete All Lines?</span>
            </div>
            <p className="text-slate-300">
              Are you sure you want to delete all <span className="font-bold text-white">{lines.length}</span> lines?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setConfirmDeleteLinesOpen(false)}
                className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllLines}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Delete Lines
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR WHITEBOARD MODAL */}
      {confirmClearAllOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-red-600/50 bg-slate-950 p-5 shadow-2xl text-xs text-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
              <Trash2 className="h-4 w-4" />
              <span>Clear Whiteboard?</span>
            </div>
            <p className="text-slate-300">
              This will remove all fixes, lines, holds, and areas.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setConfirmClearAllOpen(false)}
                className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearWhiteboardConfirmed}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ONE GENERAL SHARE MODAL */}
      {showShareModal && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-5 shadow-2xl text-xs text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Share2 className="h-4 w-4 text-sky-400" />
                <span>Share ATC Plan</span>
              </div>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex rounded bg-slate-900 p-0.5 border border-slate-800">
              <button
                onClick={() => setShareTab("share")}
                className={`flex-1 py-1 rounded text-xs font-semibold cursor-pointer ${
                  shareTab === "share" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Share / Export
              </button>
              <button
                onClick={() => setShareTab("import")}
                className={`flex-1 py-1 rounded text-xs font-semibold cursor-pointer ${
                  shareTab === "import" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Import Plan
              </button>
            </div>

            {shareTab === "share" ? (
              <div className="space-y-3.5">
                {/* Option 1: Image Export */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 space-y-2">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Option 1: Export Plan as Image (PNG)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Download a clean high-resolution image of your radar scope and flight paths.
                  </p>
                  <button
                    onClick={handleExportImage}
                    disabled={isExportingImage}
                    className="w-full h-8 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isExportingImage ? (
                      <span>Rendering...</span>
                    ) : imageExportSuccess ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Downloaded!
                      </span>
                    ) : (
                      <span>Download Image (PNG)</span>
                    )}
                  </button>
                  {exportDownloadUrl && (
                    <div className="pt-0.5 text-center">
                      <a
                        href={exportDownloadUrl}
                        download={exportDownloadFilename}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="h-3 w-3" />
                        Download didn't start? Click here to save PNG
                      </a>
                    </div>
                  )}
                  {imageExportError && <div className="text-[11px] text-red-400">{imageExportError}</div>}
                </div>

                {/* Option 2: Edit Link */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 space-y-2">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Copy className="h-3.5 w-3.5 text-sky-400" />
                    <span>Option 2: Share Link to Edit Together</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Anyone with this link can view and edit this plan on their scope.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={getHandoverUrl()}
                      className="w-full h-7 rounded border border-slate-700 bg-slate-950 px-2 font-mono text-[11px] text-slate-300 truncate focus:outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="h-7 px-3 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedLink ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                {/* JSON Backup */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[11px]">
                  <button
                    onClick={handleCopyJson}
                    className="flex-1 py-1 rounded border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {copiedJson ? "Code Copied" : "Copy JSON"}
                  </button>
                  <button
                    onClick={handleDownloadFile}
                    className="flex-1 py-1 rounded border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
                  >
                    Download .JSON
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  rows={4}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste link or JSON code here..."
                  className="w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-[11px] text-white placeholder:text-slate-500 focus:outline-none"
                />
                {importError && <div className="text-[11px] text-red-400">{importError}</div>}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (!importText.trim()) return;
                      handleApplyImportText(importText);
                    }}
                    className="h-7 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                  >
                    Load Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ATC Whiteboard Intro Pop-up Modal using SAVEME3.png */}
      {showWhiteboardIntro && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden text-slate-200">
            {/* Full-width Image Banner */}
            <div className="relative w-full h-44 bg-slate-900 overflow-hidden border-b border-slate-800">
              <img
                src="/SAVEME3.png"
                alt="ATC Whiteboard Guide"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setShowWhiteboardIntro(false);
                  try {
                    localStorage.setItem("veyro_whiteboard_intro_dismissed", "true");
                  } catch {}
                }}
                className="absolute top-3 right-3 p-1 rounded-full bg-slate-950/80 hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer backdrop-blur-md border border-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">ATC Whiteboard Guide</h2>
                <p className="text-xs text-slate-400 mt-0.5">Interactive airspace routing and approach planning</p>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed font-mono">
                <div className="flex gap-2.5">
                  <span className="text-slate-500 font-bold shrink-0">01</span>
                  <div><strong className="text-white font-sans font-semibold">Drawing & Snap:</strong> Drag between fixes to create routes. When the line tool is active, use the snap toggle in the toolbar to enable 10° heading snapping.</div>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-slate-500 font-bold shrink-0">02</span>
                  <div><strong className="text-white font-sans font-semibold">Holds & Fixes:</strong> Right-click or select fixes to anchor holding patterns, modify altitudes, or edit routing segments.</div>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-slate-500 font-bold shrink-0">03</span>
                  <div><strong className="text-white font-sans font-semibold">Measure & Terrain:</strong> Measure distances in NM/KM and toggle MSA elevation profiles.</div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowWhiteboardIntro(false);
                    try {
                      localStorage.setItem("veyro_whiteboard_intro_dismissed", "true");
                    } catch {}
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 font-medium text-white text-xs cursor-pointer transition-colors border border-slate-700"
                >
                  Continue to Map
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Airport Switch Confirmation Modal */}
      {airportConfirmTarget && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
          <div className="relative w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-white text-sm">Switch Airport & ILS</span>
              <button
                type="button"
                onClick={() => setAirportConfirmTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed font-mono">
              Do you want to show ILS runways and approach glideslopes for <strong className="text-white font-sans font-bold">{airportConfirmTarget.name} ({airportConfirmTarget.icao})</strong>?
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setAirportConfirmTarget(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer border border-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAirportSwitch(airportConfirmTarget)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer border border-slate-700 shadow-xs"
              >
                Yes, Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
