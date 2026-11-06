import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { toPng, toBlob } from "html-to-image";
import {
  CheckCircle2,
  Download,
  Copy,
  Check,
  X,
  Share2,
  Zap,
  Calendar,
} from "lucide-react";
import { ConsolidatedAtcGroup } from "./AtcSection";
import { AtcSessionItem, getIfatcRankName } from "../types";
import { formatMinutes } from "./ProfileHeader";
import { VeyroLogoSvg } from "../VeyroLogoSvg";

interface AtcSessionCardModalProps {
  session: ConsolidatedAtcGroup | AtcSessionItem | null;
  controllerName?: string;
  atcRank: number;
  onClose: () => void;
}

export default function AtcSessionCardModal({
  session,
  controllerName,
  atcRank,
  onClose,
}: AtcSessionCardModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const exportCardRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [cardHeight, setCardHeight] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Keep onscreen card format strictly consistent on all devices by proportionally scaling the canonical 500px card
  useLayoutEffect(() => {
    const updateSize = () => {
      if (containerRef.current && cardRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const targetWidth = 500;
        const newScale = Math.min(1, containerWidth / targetWidth);
        setScale(newScale);
        setCardHeight(cardRef.current.offsetHeight);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    const ro = new ResizeObserver(() => {
      updateSize();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    if (cardRef.current) ro.observe(cardRef.current);

    return () => {
      window.removeEventListener("resize", updateSize);
      ro.disconnect();
    };
  }, [session]);

  if (!session) return null;

  // Normalize fields whether ConsolidatedAtcGroup or AtcSessionItem
  const isGroup = "subSessions" in session;
  const airportIcao = session.airportIcao;
  const server = session.server || "Expert";
  const created = session.created;
  const durationMinutes = session.durationMinutes;
  const operations = isGroup ? (session as ConsolidatedAtcGroup).totalOperations : (session as AtcSessionItem).operations;
  const violations = isGroup ? (session as ConsolidatedAtcGroup).totalViolations : (session as AtcSessionItem).violationsIssued;
  const facilityTitle = isGroup ? (session as ConsolidatedAtcGroup).facilitySummary : (session as AtcSessionItem).facilityTypeName;
  const subSessions = isGroup ? (session as ConsolidatedAtcGroup).subSessions : [session as AtcSessionItem];

  const isRadar = /approach|departure|center|radar/i.test(facilityTitle);
  const isAtisOnly = /atis/i.test(facilityTitle) && subSessions.length <= 1;
  const isCombined = isGroup && (session as ConsolidatedAtcGroup).isLocal && subSessions.length > 1;
  const isSoloGroundTower = !isCombined && !isRadar && /ground|tower/i.test(facilityTitle);

  const accentText = isRadar
    ? "text-purple-400"
    : isSoloGroundTower
    ? "text-blue-400"
    : "text-orange-400";
  const accentPill = isRadar
    ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
    : isSoloGroundTower
    ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
    : "bg-orange-500/10 border-orange-500/30 text-orange-300";

  const isExpert = /expert/i.test(server);
  const isTraining = /training/i.test(server);
  const serverBadgeStyle = isExpert
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : isTraining
    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
    : "border-purple-500/30 bg-purple-500/10 text-purple-400";
  const serverDotColor = isExpert
    ? "bg-emerald-400"
    : isTraining
    ? "bg-amber-400"
    : "bg-purple-400";

  const opsPerHour = durationMinutes > 0 ? Math.round((operations / durationMinutes) * 60) : operations;

  const dateObj = new Date(created);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const rankLabel = getIfatcRankName(atcRank);

  // Capture helper using the dedicated offscreen unscaled 500px node
  const getCaptureNode = (): HTMLDivElement | null => {
    return exportCardRef.current || cardRef.current;
  };

  const handleDownloadImage = async () => {
    const node = getCaptureNode();
    if (!node) return;
    try {
      setDownloading(true);

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0f172a",
        width: 500,
        height: node.offsetHeight,
      });

      const link = document.createElement("a");
      link.download = `VEYRO-SessionCard-${airportIcao}-${controllerName || "Session"}-${dateObj.toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      setCopyFeedback("Session card saved as PNG!");
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.error("Failed to generate image:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyImage = async () => {
    const node = getCaptureNode();
    if (!node) return;
    try {
      setDownloading(true);

      const blob = await toBlob(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0f172a",
        width: 500,
        height: node.offsetHeight,
      });

      if (blob && navigator.clipboard && "write" in navigator.clipboard) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
          }),
        ]);
        setCopied(true);
        setCopyFeedback("Session card copied to clipboard!");
        setTimeout(() => {
          setCopied(false);
          setCopyFeedback(null);
        }, 2500);
      } else {
        await handleDownloadImage();
      }
    } catch (err) {
      console.warn("Clipboard copy unsupported or restricted, downloading image instead:", err);
      await handleDownloadImage();
    } finally {
      setDownloading(false);
    }
  };

  // Reusable card body for both the responsive on-screen preview and the pristine 500px export card
  const renderCardBody = (isExport: boolean) => (
    <>
      {/* Subtle radar circular backdrop decorative line */}
      <div
        className={`absolute -right-16 -top-16 h-56 w-56 rounded-full border pointer-events-none ${
          isRadar ? "border-purple-500/10" : isSoloGroundTower ? "border-blue-500/10" : "border-orange-500/10"
        }`}
      />
      <div
        className={`absolute -right-6 -top-6 h-36 w-36 rounded-full border pointer-events-none ${
          isRadar ? "border-purple-500/15" : isSoloGroundTower ? "border-blue-500/15" : "border-orange-500/15"
        }`}
      />
      <div
        className={`absolute -right-2 -top-2 h-16 w-16 rounded-full border pointer-events-none ${
          isRadar ? "border-purple-500/20" : isSoloGroundTower ? "border-blue-500/20" : "border-orange-500/20"
        }`}
      />

      {/* Card Header: VEYRO Branding + Server */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-700/80 bg-black overflow-hidden p-1 shrink-0 text-white">
            <VeyroLogoSvg className="h-full w-full text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 whitespace-nowrap leading-none">
              <span className="text-sm font-black tracking-wider text-white">VEYRO</span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                • ATC SESSION CARD
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap mt-1 leading-none">
              Infinite Flight Controller Log
            </div>
          </div>
        </div>

        <div className="flex items-center shrink-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${serverBadgeStyle}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${serverDotColor} ${isExport ? "" : "animate-pulse"}`} />
            <span>{server}</span>
          </span>
        </div>
      </div>

      {/* Airport & Facility Hero */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider whitespace-nowrap">
            Airport & Facility
          </div>
          <div className="text-3xl font-black text-white font-mono mt-0.5 tracking-normal whitespace-nowrap">
            {airportIcao}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold border whitespace-nowrap inline-block ${
                isRadar
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : isSoloGroundTower
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                  : "bg-orange-500/20 text-orange-300 border-orange-500/40"
              }`}
            >
              {facilityTitle}
            </span>
            {isRadar ? (
              <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider whitespace-nowrap">
                Radar
              </span>
            ) : (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                  isSoloGroundTower ? "text-blue-400" : "text-orange-400"
                }`}
              >
                Local
              </span>
            )}
          </div>
        </div>

        {/* Controller Pill */}
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider whitespace-nowrap">
            Air Traffic Controller
          </div>
          <div className="text-base font-bold text-white mt-0.5 truncate max-w-[190px] whitespace-nowrap">
            {controllerName || "IFATC Pilot"}
          </div>
          <div className="inline-flex items-center gap-1 mt-1 rounded-full bg-slate-800/90 border border-slate-700 px-2.5 py-0.5 text-[10px] text-slate-300 font-medium whitespace-nowrap shrink-0">
            <span>{rankLabel}</span>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            Operations
          </div>
          <div className="text-2xl font-black text-white mt-1 font-mono tracking-normal">
            {isAtisOnly ? "—" : operations}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">
            {isAtisOnly ? "broadcast only" : "aircraft handled"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            Duration
          </div>
          <div className="text-2xl font-black text-white mt-1 font-mono tracking-normal">
            {formatMinutes(durationMinutes)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">on frequency</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            Pace
          </div>
          <div
            className={`text-2xl font-black mt-1 font-mono tracking-normal ${
              isAtisOnly
                ? "text-slate-400"
                : isRadar
                ? "text-purple-400"
                : isSoloGroundTower
                ? "text-blue-400"
                : "text-orange-400"
            }`}
          >
            {isAtisOnly ? "—" : opsPerHour}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">
            {isAtisOnly ? "continuous broadcast" : "ops / hour"}
          </div>
        </div>
      </div>

      {/* Combined Frequencies Breakdown if multiple */}
      {subSessions.length > 1 && (
        <div className="mt-3.5 rounded-xl border border-slate-800 bg-slate-800/30 p-3 text-xs">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 whitespace-nowrap">
            <Zap className={`h-3 w-3 shrink-0 ${accentText}`} />
            <span>Frequencies Handled</span>
          </div>
          <div className="space-y-1.5">
            {subSessions.map((sub, idx) => {
              const subIsRadar = /approach|departure|center|radar/i.test(sub.facilityTypeName);
              const subIsSolo = /ground|tower/i.test(sub.facilityTypeName);
              const subIsAtis = /atis/i.test(sub.facilityTypeName) || sub.frequencyType === 7 || sub.frequencyType === 3;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[11px] text-slate-300 border-b border-slate-800/60 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span
                    className={`font-medium whitespace-nowrap ${
                      subIsRadar
                        ? "text-purple-300"
                        : subIsAtis
                        ? "text-slate-400"
                        : subIsSolo
                        ? "text-blue-300"
                        : "text-orange-300"
                    }`}
                  >
                    {sub.facilityTypeName}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px] whitespace-nowrap shrink-0">
                    {subIsAtis ? "Broadcast" : `${sub.operations} ops`} • {formatMinutes(sub.durationMinutes)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card Footer: Timestamp & Clean Record Badge */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>{formattedDate}</span>
          <span className="text-slate-600 px-0.5">•</span>
          <span>{formattedTime}</span>
        </div>

        <div className="flex items-center gap-1 text-[11px] whitespace-nowrap shrink-0">
          {violations === 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Clean Session (0 Violations)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
              <span>{violations} Report{violations === 1 ? "" : "s"} Issued</span>
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      {/* Canonical 500px Offscreen Export Card (Guarantees perfect 1:1 image generation on all screen sizes) */}
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: "500px",
          height: "auto",
          pointerEvents: "none",
          opacity: 1,
          zIndex: -9999,
        }}
        aria-hidden="true"
      >
        <div
          ref={exportCardRef}
          style={{
            width: 500,
            minWidth: 500,
            maxWidth: 500,
            boxSizing: "border-box",
          }}
          className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-xl relative overflow-hidden text-slate-100"
        >
          {renderCardBody(true)}
        </div>
      </div>

      <div
        className="relative w-full max-w-[556px] rounded-2xl bg-slate-900 border border-slate-700/60 p-4 sm:p-6 shadow-2xl text-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top bar */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 flex items-center justify-center rounded-md bg-black border border-slate-700/80 overflow-hidden p-0.5 text-white shrink-0">
              <VeyroLogoSvg className="h-full w-full text-white" />
            </div>
            <h3 className="text-sm font-semibold text-white">VEYRO Session Card</h3>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${accentPill}`}>
              Infinite Flight ATC
            </span>
          </div>
          <button
            id="close-atc-card-modal-btn"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Card Viewport / Scaler Container */}
        <div
          ref={containerRef}
          className="w-full flex justify-center items-center overflow-hidden py-0.5"
        >
          <div
            style={{
              width: 500 * scale,
              height: cardHeight > 0 ? cardHeight * scale : undefined,
              position: "relative",
              flexShrink: 0,
            }}
          >
            {/* The Responsive Capturable Image Card - Fixed 500px width with proportional scale */}
            <div
              ref={cardRef}
              id="atc-share-card"
              style={{
                width: 500,
                minWidth: 500,
                maxWidth: 500,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                boxSizing: "border-box",
              }}
              className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-xl relative overflow-hidden text-slate-100 select-none"
            >
              {renderCardBody(false)}
            </div>
          </div>
        </div>

        {/* Action Buttons for downloading and copying */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Share2 className="h-3.5 w-3.5 text-sky-400" />
            <span>Share it with friends!</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="copy-atc-card-btn"
              type="button"
              onClick={handleCopyImage}
              disabled={downloading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Image</span>
                </>
              )}
            </button>

            <button
              id="download-atc-card-btn"
              type="button"
              onClick={handleDownloadImage}
              disabled={downloading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {downloading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PNG</span>
                </>
              )}
            </button>
          </div>
        </div>

        {copyFeedback && (
          <div className="mt-2 text-center text-xs text-emerald-400 font-medium animate-fadeIn">
            {copyFeedback}
          </div>
        )}
      </div>
    </div>
  );
}
