import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  Copy,
  Mountain,
  RadioTower,
  RefreshCw,
  Wind,
} from "lucide-react";

type SourceStatus = {
  available: boolean;
  message?: string;
};

type RunwayRecord = {
  rwy_id?: string;
  rwy_len?: number | string;
  rwy_width?: number | string;
  surface?: string;
};

type DatisRecord = {
  dataBody?: string | null;
  letter?: string | null;
  timestamp?: number | null;
};

type IFATCPrepPayload = {
  icao: string;
  airport: {
    name: string | null;
    city: string | null;
    country: string | null;
  };
  fieldElevationFt: number | null;
  ifatc: {
    patternAltitudeMslFt: number;
    transitionAltitudeMslFt: number;
  } | null;
  atisRelay: {
    transcript?: string | null;
    transcript_letter?: string | null;
    transcript_valid_time?: number | null;
    metar?: { report?: string | null; flight_rules?: string | null } | null;
    datis?: {
      atis?: DatisRecord | null;
      departure?: DatisRecord | null;
      arrival?: DatisRecord | null;
    } | null;
    official?: boolean;
    notice?: string;
    airport?: { name?: string | null };
  } | null;
  runways: RunwayRecord[] | null;
  sourceStatus: {
    conditions: SourceStatus;
    runways: SourceStatus;
  };
  updatedAt: string;
};

const panelClass =
  "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
const mutedText = "text-slate-500 dark:text-slate-400";

function displayNumber(value: number | string | undefined, suffix = "") {
  if (value === undefined || value === null || value === "") return "Not available";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString()}${suffix}` : "Not available";
}

function SourceState({ status }: { status?: SourceStatus }) {
  if (status?.available) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> Data returned</span>;
  }
  return <span className="text-[10px] text-amber-600 dark:text-amber-400">{status?.message || "Not available for this airport"}</span>;
}

export default function IFATCPrepPanel({ icao }: { icao: string }) {
  const [payload, setPayload] = useState<IFATCPrepPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const loadBriefing = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ifatc/prep/${encodeURIComponent(icao)}`, { signal });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message || body.error || "Unable to load IFATC preparation data.");
      }
      setPayload(body as IFATCPrepPayload);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load IFATC preparation data.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [icao]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBriefing(controller.signal);
    return () => controller.abort();
  }, [loadBriefing, refreshKey]);

  const atisText = useMemo(() => {
    const relay = payload?.atisRelay;
    return relay?.transcript ||
      relay?.datis?.atis?.dataBody ||
      relay?.datis?.departure?.dataBody ||
      relay?.datis?.arrival?.dataBody ||
      null;
  }, [payload]);

  const reportTimestamp = useMemo(() => {
    const relay = payload?.atisRelay;
    if (relay?.transcript_valid_time) return relay.transcript_valid_time * 1000;
    const datisTimestamp = relay?.datis?.atis?.timestamp;
    return datisTimestamp ? datisTimestamp : null;
  }, [payload]);

  const reportIsStale = reportTimestamp !== null && Date.now() - reportTimestamp > 60 * 60 * 1000;

  const copyAtis = async () => {
    if (!atisText) return;
    try {
      await navigator.clipboard.writeText(atisText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked by this browser.");
    }
  };

  const airportName = payload?.atisRelay?.airport?.name || payload?.airport?.name || `${icao} Airport`;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">IFATC Airport Prep</h3>
          </div>
          <p className={`mt-1 ${mutedText}`}>{airportName} · {icao}{payload?.airport?.city ? ` · ${payload.airport.city}` : ""}{payload?.airport?.country ? `, ${payload.airport.country}` : ""}</p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          title="Refresh airport briefing"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !payload ? (
        <div className={`${panelClass} py-12 text-center ${mutedText}`}>
          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading ATIS Relay and airport reference data…
        </div>
      ) : null}
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}

      {payload ? (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className={`${panelClass} p-3.5`}>
              <div className={`flex items-center gap-1.5 ${mutedText}`}><Mountain className="h-3.5 w-3.5" /> Field elevation</div>
              <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">{payload.fieldElevationFt === null ? "Unavailable" : `${payload.fieldElevationFt.toLocaleString()} ft`}</div>
              <p className={`mt-1 text-[10px] ${mutedText}`}>Above mean sea level (MSL)</p>
            </div>
            <div className={`${panelClass} p-3.5`}>
              <div className={`flex items-center gap-1.5 ${mutedText}`}><RadioTower className="h-3.5 w-3.5" /> Pattern altitude</div>
              <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">{payload.ifatc ? `${payload.ifatc.patternAltitudeMslFt.toLocaleString()} ft` : "Unavailable"}</div>
              <p className={`mt-1 text-[10px] ${mutedText}`}>MSL · rounded up to 100 ft</p>
            </div>
            <div className={`${panelClass} p-3.5`}>
              <div className={`flex items-center gap-1.5 ${mutedText}`}><Wind className="h-3.5 w-3.5" /> Transition altitude</div>
              <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">{payload.ifatc ? `${payload.ifatc.transitionAltitudeMslFt.toLocaleString()} ft` : "Unavailable"}</div>
              <p className={`mt-1 text-[10px] ${mutedText}`}>MSL · rounded up to 500 ft</p>
            </div>
          </section>

          <section className={`${panelClass} p-3.5 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white">Current real-world ATIS / D-ATIS</h4>
              <SourceState status={payload.sourceStatus.conditions} />
            </div>
            {atisText ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className={`font-mono font-semibold ${mutedText}`}>Information {payload.atisRelay?.transcript_letter || payload.atisRelay?.datis?.atis?.letter || "—"}</div>
                  <button type="button" onClick={copyAtis} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? "Copied" : "Copy ATIS"}
                  </button>
                </div>
                <div className="rounded-lg bg-slate-950 p-3 text-slate-200 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">{atisText}</div>
                {reportTimestamp ? <p className={`text-[10px] ${mutedText}`}>Report timestamp: {new Date(reportTimestamp).toLocaleString()} {reportIsStale ? "· May be stale — verify on frequency" : ""}</p> : <p className={`text-[10px] ${mutedText}`}>Report timestamp was not supplied by the source.</p>}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4">
                <p className="font-semibold text-slate-800 dark:text-slate-200">No current ATIS transcript returned</p>
                <p className={`mt-1 leading-relaxed ${mutedText}`}>This airport may not be supported, a report may not be available in the current reporting window, or the provider may be temporarily unavailable. The Free API cannot initiate a new phone-line capture.</p>
                {!payload.sourceStatus.conditions.available && payload.sourceStatus.conditions.message ? <p className="mt-2 text-amber-700 dark:text-amber-300">{payload.sourceStatus.conditions.message}</p> : null}
              </div>
            )}
            {payload.atisRelay?.metar?.report ? (
              <div className="space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">METAR</p>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3 font-mono text-[11px] leading-relaxed break-words text-slate-700 dark:text-slate-300">{payload.atisRelay.metar.report}</div>
              </div>
            ) : null}
          </section>

          <section className={`${panelClass} p-3.5 space-y-3`}>
            <h4 className="font-bold text-slate-900 dark:text-white">How the altitudes are calculated</h4>
            {payload.ifatc && payload.fieldElevationFt !== null ? (
              <div className="space-y-2.5">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Pattern altitude</p>
                  <p className={`mt-1 leading-relaxed ${mutedText}`}>Airport elevation + 1,500 ft, then round UP to the nearest 100 ft.</p>
                  <p className="mt-2 font-mono font-semibold text-slate-900 dark:text-white">({payload.fieldElevationFt.toLocaleString()} + 1,500), rounded up to 100 = {payload.ifatc.patternAltitudeMslFt.toLocaleString()} ft MSL</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Transition altitude</p>
                  <p className={`mt-1 leading-relaxed ${mutedText}`}>Pattern altitude + 1,000 ft, then round UP to the nearest 500 ft.</p>
                  <p className="mt-2 font-mono font-semibold text-slate-900 dark:text-white">({payload.ifatc.patternAltitudeMslFt.toLocaleString()} + 1,000), rounded up to 500 = {payload.ifatc.transitionAltitudeMslFt.toLocaleString()} ft MSL</p>
                </div>
              </div>
            ) : (
              <p className={mutedText}>Airport elevation is unavailable, so altitude values cannot be calculated.</p>
            )}
          </section>

          <section className={`${panelClass} p-3.5 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white">Runways</h4>
              <SourceState status={payload.sourceStatus.runways} />
            </div>
            {payload.runways?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Runway</th><th className="py-2 pr-3">Length</th><th className="py-2 pr-3">Width</th><th className="py-2">Surface</th></tr></thead>
                  <tbody>{payload.runways.map((runway, index) => <tr key={`${runway.rwy_id || "runway"}-${index}`} className="border-b last:border-0 border-slate-100 dark:border-slate-800"><td className="py-2 pr-3 font-mono font-semibold">{runway.rwy_id || "Not available"}</td><td className="py-2 pr-3">{displayNumber(runway.rwy_len, " ft")}</td><td className="py-2 pr-3">{displayNumber(runway.rwy_width, " ft")}</td><td className="py-2">{runway.surface || "Not available"}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className={mutedText}>No runway data was returned for this airport.</p>}
          </section>

          <div className={`flex flex-wrap items-center justify-between gap-2 text-[10px] ${mutedText}`}>
            <span>Briefing refreshed: {new Date(payload.updatedAt).toLocaleString()}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
