import { useState, useRef, useCallback } from 'react';
import { Play, Square, Loader2, Film, SkipBack, SkipForward, Pause, Radar } from 'lucide-react';
import L from 'leaflet';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { MapOverlay, DetectionNode } from '../types';
import { NODE_COLORS } from '../types';
import { fetchBoundaryByOsmId, fetchBoundaryBySearch } from '../lib/api';
import { getCentroid, calculateArea, createUFCampusFeature, createBrickellFeature, createMarALagoTFR, createBHGTFR, createPBINoUAS } from '../lib/geo';
import { generateHexGrid } from '../lib/coverageGrid';
import {
  buildFlagshipScript, BOUNDARY_SOURCES, MARKER_SETS, SITE_COLORS,
  type StepDef, type ScriptContext, type SitePin,
} from '../lib/flagshipScript';

// ── Props ───────────────────────────────────────────────────────

interface Props {
  mapRef: React.MutableRefObject<L.Map | null>;
  nodes: DetectionNode[];
  addOverlayDirect: (
    name: string,
    feature: Feature<Polygon | MultiPolygon>,
    opts?: { color?: string; offsetLat?: number; offsetLng?: number; opacity?: number }
  ) => MapOverlay;
  setOverlayOffset: (id: string, offsetLat: number, offsetLng: number) => void;
  updateOverlay: (id: string, updates: Partial<MapOverlay>) => void;
  removeOverlay: (id: string) => void;
  clearAll: () => void;
  setAutoCenter: (v: boolean) => void;
  setNodesHidden: (v: boolean) => void;
}

type Phase = 'idle' | 'loading' | 'playing' | 'done' | 'error';

const BHG = { lat: 29.6500, lng: -82.3486 };

const LOCAL_BUILDERS: Record<string, () => Feature<Polygon | MultiPolygon>> = {
  ufCampus: () => createUFCampusFeature() as Feature<Polygon | MultiPolygon>,
  brickell: () => createBrickellFeature() as Feature<Polygon | MultiPolygon>,
  malTFR: () => createMarALagoTFR() as Feature<Polygon | MultiPolygon>,
  pbiNoUAS: () => createPBINoUAS() as Feature<Polygon | MultiPolygon>,
  bhgTFR: () => createBHGTFR() as Feature<Polygon | MultiPolygon>,
};

// ── Helpers ─────────────────────────────────────────────────────

function flyTo(map: L.Map, lat: number, lng: number, zoom: number, duration = 2): Promise<void> {
  return new Promise((resolve) => {
    map.flyTo([lat, lng], zoom, { duration });
    setTimeout(() => resolve(), duration * 1000 + 300);
  });
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function makeSiteIcon(site: SitePin): L.DivIcon {
  const c = SITE_COLORS[site.type];
  return L.divIcon({
    className: 'site-label-marker',
    html: `<div style="position:relative;width:0;height:0">
      <div class="site-label-dot" style="background:${c.bg};box-shadow:0 0 6px ${c.bg}"></div>
      <div class="site-label-text" style="background:${c.bg};color:${c.text}">${site.name}</div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// ── Component ───────────────────────────────────────────────────

export default function FlagshipAnimation({
  mapRef,
  nodes,
  addOverlayDirect,
  setOverlayOffset,
  updateOverlay,
  removeOverlay,
  clearAll,
  setAutoCenter,
  setNodesHidden,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [caption, setCaption] = useState('');
  const [subCaption, setSubCaption] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [step, setStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [coverageTooltip, setCoverageTooltip] = useState(false);
  const abortRef = useRef(false);
  const skipRef = useRef<number | null>(null);
  const pauseRef = useRef(false);
  const idsRef = useRef<Record<string, string>>({});
  const tempMarkersRef = useRef<L.Marker[]>([]);
  const coverageMarkersRef = useRef<(L.Marker | L.Circle)[]>([]);
  const stepsRef = useRef<StepDef[]>([]);
  const dataRef = useRef<Record<string, Feature<Polygon | MultiPolygon>>>({});

  const safeWait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          if (abortRef.current) { reject(new Error('aborted')); return; }
          if (skipRef.current !== null) { resolve(); return; }
          if (pauseRef.current) { setTimeout(check, 100); return; }
          if (Date.now() - start >= ms) { resolve(); return; }
          setTimeout(check, 50);
        };
        check();
      }),
    []
  );

  const checkAbort = useCallback(() => {
    if (abortRef.current) throw new Error('aborted');
  }, []);

  const animateOffset = useCallback(
    (id: string, fromLat: number, fromLng: number, toLat: number, toLng: number, duration: number): Promise<void> => {
      return new Promise((resolve) => {
        const start = performance.now();
        const FRAME_INTERVAL = 50;
        let lastUpdate = 0;
        function frame(now: number) {
          if (abortRef.current) { resolve(); return; }
          const t = Math.min((now - start) / duration, 1);
          if (t === 1 || now - lastUpdate >= FRAME_INTERVAL) {
            const e = easeInOutCubic(t);
            setOverlayOffset(id, fromLat + (toLat - fromLat) * e, fromLng + (toLng - fromLng) * e);
            lastUpdate = now;
          }
          if (t < 1) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
      });
    },
    [setOverlayOffset]
  );

  // ── Marker management ─────────────────────────────────────────

  function clearTempMarkers() {
    for (const m of tempMarkersRef.current) m.remove();
    tempMarkersRef.current = [];
  }

  function addSiteMarkers(map: L.Map, sites: SitePin[], offLat: number, offLng: number) {
    for (const site of sites) {
      const icon = makeSiteIcon(site);
      const marker = L.marker([site.lat + offLat, site.lng + offLng], { icon, interactive: false }).addTo(map);
      tempMarkersRef.current.push(marker);
    }
  }

  function addNodeMarkersToMap(map: L.Map) {
    for (const node of nodes) {
      if (!node.visible) continue;
      const icon = L.divIcon({
        className: '',
        html: `<div class="detection-node-marker">
          <div class="detection-node-ping" style="border-color:${node.color}"></div>
          <div class="detection-node-dot" style="background:${node.color};box-shadow:0 0 8px ${node.color}"></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([node.lat, node.lng], { icon, interactive: false }).addTo(map);
      tempMarkersRef.current.push(marker);
    }
  }

  function clearCoverageMarkers() {
    for (const m of coverageMarkersRef.current) m.remove();
    coverageMarkersRef.current = [];
  }

  function addCoverageNodesToMap(
    map: L.Map,
    boundary: Feature<Polygon | MultiPolygon>,
    radiusMiles: number,
    minOverlap: number,
  ) {
    const grid = generateHexGrid(boundary, radiusMiles, minOverlap);
    const { sqMi } = calculateArea(boundary);
    const count = grid.nodes.length;

    const nodeSize = count > 800 ? 3 : count > 300 ? 5 : count > 50 ? 10 : 16;
    const dotSize = Math.max(2, nodeSize - (nodeSize > 6 ? 4 : 1));
    const glow = nodeSize > 8 ? 6 : nodeSize > 4 ? 3 : 2;

    for (let i = 0; i < count; i++) {
      const pt = grid.nodes[i];
      const color = NODE_COLORS[i % NODE_COLORS.length];
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${nodeSize}px;height:${nodeSize}px;display:flex;align-items:center;justify-content:center">
          <div style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${color};box-shadow:0 0 ${glow}px ${color}"></div>
        </div>`,
        iconSize: [nodeSize, nodeSize],
        iconAnchor: [nodeSize / 2, nodeSize / 2],
      });
      const marker = L.marker([pt.lat, pt.lng], { icon, interactive: false }).addTo(map);
      coverageMarkersRef.current.push(marker);

      if (sqMi <= 200) {
        const circle = L.circle([pt.lat, pt.lng], {
          radius: radiusMiles * 1609.34,
          color: '#22c55e',
          weight: 0.5,
          opacity: 0.15,
          fillColor: '#86efac',
          fillOpacity: 0.04,
          interactive: false,
        }).addTo(map);
        coverageMarkersRef.current.push(circle);
      }
    }
  }

  // ── Overlay helpers ───────────────────────────────────────────

  function addOverlay(tag: string, name: string, feature: Feature<Polygon | MultiPolygon>, opts?: { color?: string; offsetLat?: number; offsetLng?: number; opacity?: number }) {
    const o = addOverlayDirect(name, feature, opts);
    idsRef.current[tag] = o.id;
    return o;
  }

  function removeTag(tag: string) {
    const id = idsRef.current[tag];
    if (id) { removeOverlay(id); delete idsRef.current[tag]; }
  }

  function fadeTag(tag: string, opacity: number) {
    const id = idsRef.current[tag];
    if (id) updateOverlay(id, { opacity });
  }

  // ── Pre-load all boundaries ───────────────────────────────────

  async function preloadData(): Promise<Record<string, Feature<Polygon | MultiPolygon>>> {
    const data: Record<string, Feature<Polygon | MultiPolygon>> = {};
    const t0 = performance.now();
    const entries = Object.entries(BOUNDARY_SOURCES);
    let loaded = 0;

    for (const [key, src] of entries) {
      setLoadingMsg(`${src.label}… (${loaded}/${entries.length})`);
      const t1 = performance.now();

      let feature: Feature<Polygon | MultiPolygon> | null = null;

      if (src.type === 'osm') {
        feature = await fetchBoundaryByOsmId(src.osmType, src.osmId);
      } else if (src.type === 'search') {
        feature = await fetchBoundaryBySearch(src.query);
      } else if (src.type === 'local') {
        const builder = LOCAL_BUILDERS[src.builder];
        if (builder) feature = builder();
      }

      if (!feature) throw new Error(`Failed to load ${src.label}`);
      data[key] = feature;
      loaded++;
      console.log(`[Preload] ${key}: ${Math.round(performance.now() - t1)}ms`);
    }

    console.log(`[Preload] Total: ${Math.round(performance.now() - t0)}ms for ${entries.length} boundaries`);
    return data;
  }

  // ── Instant step executor (for skip/jump — no waits or animations) ──

  async function executeStepInstant(
    map: L.Map,
    stepDef: StepDef,
    data: Record<string, Feature<Polygon | MultiPolygon>>,
    stepIndex: number,
  ) {
    setStep(stepIndex + 1);
    if (stepDef.caption !== undefined) setCaption(stepDef.caption);
    if (stepDef.sub !== undefined) setSubCaption(stepDef.sub);
    if (stepDef.hideNodes) setNodesHidden(true);
    if (stepDef.revealNodes) setNodesHidden(false);
    if (stepDef.clearMarkers) clearTempMarkers();
    if (stepDef.remove) {
      for (const tag of stepDef.remove) {
        if (tag === '_all_except_gvl') {
          for (const t of Object.keys(idsRef.current)) { if (t !== 'gvl') removeTag(t); }
        } else { removeTag(tag); }
      }
    }
    if (stepDef.fade) { for (const f of stepDef.fade) fadeTag(f.tag, f.opacity); }
    if (stepDef.add) {
      for (const a of stepDef.add) {
        const feature = data[a.key];
        if (feature) addOverlay(a.tag, a.name, feature, { color: a.color, opacity: a.opacity, offsetLat: a.offLat, offsetLng: a.offLng });
      }
    }
    if (stepDef.markers) {
      for (const m of stepDef.markers) {
        const pins = MARKER_SETS[m.set];
        if (pins) addSiteMarkers(map, pins, m.offLat, m.offLng);
      }
    }
    if (stepDef.animate) {
      for (const a of stepDef.animate) {
        const id = idsRef.current[a.tag];
        if (id) setOverlayOffset(id, a.toLat, a.toLng);
      }
    }
    if (stepDef.flyTo) map.setView([stepDef.flyTo.lat, stepDef.flyTo.lng], stepDef.flyTo.zoom);
    if (stepDef.animate?.some(a => a.concurrent)) {
      const c = stepDef.animate.find(a => a.concurrent)!.concurrent!;
      map.setView([c.lat, c.lng], c.zoom);
    }
    if (stepDef.clearCoverageNodes) clearCoverageMarkers();
    if (stepDef.showCoverageNodes) {
      const entries = Array.isArray(stepDef.showCoverageNodes)
        ? stepDef.showCoverageNodes
        : [stepDef.showCoverageNodes];
      clearCoverageMarkers();
      for (const entry of entries) {
        const boundary = data[entry.boundaryKey];
        if (boundary) addCoverageNodesToMap(map, boundary, entry.radiusMiles, entry.minOverlap);
      }
    }
    if (stepDef.showCoverageTooltip) setCoverageTooltip(true);
    if (stepDef.showNodes && nodes.length > 0) addNodeMarkersToMap(map);
  }

  // ── Generic step executor ─────────────────────────────────────

  async function executeStep(
    map: L.Map,
    stepDef: StepDef,
    data: Record<string, Feature<Polygon | MultiPolygon>>,
    stepIndex: number,
  ) {
    setStep(stepIndex + 1);

    if (stepDef.caption !== undefined) setCaption(stepDef.caption);
    if (stepDef.sub !== undefined) setSubCaption(stepDef.sub);

    if (stepDef.hideNodes) setNodesHidden(true);
    if (stepDef.revealNodes) setNodesHidden(false);

    if (stepDef.clearMarkers) clearTempMarkers();

    if (stepDef.remove) {
      for (const tag of stepDef.remove) {
        if (tag === '_all_except_gvl') {
          for (const t of Object.keys(idsRef.current)) {
            if (t !== 'gvl') removeTag(t);
          }
        } else {
          removeTag(tag);
        }
      }
    }

    if (stepDef.fade) {
      for (const f of stepDef.fade) fadeTag(f.tag, f.opacity);
    }

    if (stepDef.add) {
      for (const a of stepDef.add) {
        const feature = data[a.key];
        if (feature) {
          addOverlay(a.tag, a.name, feature, {
            color: a.color,
            opacity: a.opacity,
            offsetLat: a.offLat,
            offsetLng: a.offLng,
          });
        }
      }
    }

    if (stepDef.markers) {
      for (const m of stepDef.markers) {
        const pins = MARKER_SETS[m.set];
        if (pins) addSiteMarkers(map, pins, m.offLat, m.offLng);
      }
    }

    // Handle animations (with optional concurrent flyTo)
    if (stepDef.animate) {
      const promises: Promise<void>[] = [];
      for (const a of stepDef.animate) {
        const id = idsRef.current[a.tag];
        if (id) {
          promises.push(animateOffset(id, a.fromLat, a.fromLng, a.toLat, a.toLng, a.duration));
        }
        if (a.concurrent) {
          promises.push(flyTo(map, a.concurrent.lat, a.concurrent.lng, a.concurrent.zoom, a.concurrent.duration));
        }
      }
      if (promises.length > 0) await Promise.all(promises);
      checkAbort();
    }

    if (stepDef.flyTo && !stepDef.animate?.some((a) => a.concurrent)) {
      await flyTo(map, stepDef.flyTo.lat, stepDef.flyTo.lng, stepDef.flyTo.zoom, stepDef.flyTo.duration);
      checkAbort();
    }

    if (stepDef.clearCoverageNodes) clearCoverageMarkers();

    if (stepDef.showCoverageNodes) {
      const entries = Array.isArray(stepDef.showCoverageNodes)
        ? stepDef.showCoverageNodes
        : [stepDef.showCoverageNodes];
      clearCoverageMarkers();
      for (const entry of entries) {
        const boundary = data[entry.boundaryKey];
        if (boundary) addCoverageNodesToMap(map, boundary, entry.radiusMiles, entry.minOverlap);
      }
    }

    if (stepDef.showCoverageTooltip) setCoverageTooltip(true);

    if (stepDef.showNodes) {
      if (nodes.length > 0) {
        setCaption('Detection Network');
        setSubCaption(`${nodes.length} sensor nodes deployed across campus`);
        addNodeMarkersToMap(map);
        await flyTo(map, BHG.lat, BHG.lng, 14, 2.5);
        checkAbort();
      } else {
        setCaption('Detection Network');
        setSubCaption('Place sensor nodes on the map to see them here');
      }
    }

    if (stepDef.waitAfter) {
      await safeWait(stepDef.waitAfter);
      checkAbort();
    }
  }

  // ── Run full animation ────────────────────────────────────────

  async function runAnimation(data: Record<string, Feature<Polygon | MultiPolygon>>) {
    const map = mapRef.current;
    if (!map) return;

    setAutoCenter(false);
    clearAll();
    clearTempMarkers();
    clearCoverageMarkers();
    setCoverageTooltip(false);
    idsRef.current = {};
    setPhase('playing');

    // Build script context
    const centroids: Record<string, [number, number]> = {};
    for (const [key, feature] of Object.entries(data)) {
      centroids[key] = getCentroid(feature);
    }

    const [flLng, flLat] = centroids.florida;
    const sideOffsets: Record<string, { lat: number; lng: number }> = {};
    for (const key of ['newJersey', 'nyState']) {
      const [cLng, cLat] = centroids[key];
      sideOffsets[key] = { lat: flLat - cLat, lng: (flLng + 8) - cLng };
    }

    const ctx: ScriptContext = { bhg: BHG, centroids, sideOffsets, nodeCount: nodes.length };
    const steps = buildFlagshipScript(ctx);
    stepsRef.current = steps;
    dataRef.current = data;
    setTotalSteps(steps.length);

    try {
      let i = 0;
      while (i < steps.length) {
        if (skipRef.current !== null) {
          i = Math.max(0, Math.min(skipRef.current, steps.length - 1));
          skipRef.current = null;
          clearAll();
          clearTempMarkers();
          clearCoverageMarkers();
          setCoverageTooltip(false);
          idsRef.current = {};
          setNodesHidden(false);
          for (let j = 0; j <= i; j++) {
            await executeStepInstant(map, steps[j], data, j);
          }
          i++;
          continue;
        }
        console.log(`[Flagship] step ${i + 1}/${steps.length}`, steps[i].caption ?? '(continuation)');
        await executeStep(map, steps[i], data, i);
        i++;
      }
      setNodesHidden(false);
      setPhase('done');
    } catch (e: unknown) {
      setNodesHidden(false);
      if (e instanceof Error && e.message === 'aborted') {
        setPhase('idle');
      } else {
        throw e;
      }
    }
  }

  // ── Handlers ────────────────────────────────────────────────

  async function handlePlay() {
    abortRef.current = false;
    setErrorMsg('');
    setPhase('loading');
    try {
      const data = await preloadData();
      if (abortRef.current) return;
      await runAnimation(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Flagship animation error:', e);
      setErrorMsg(msg);
      setPhase('error');
      setCaption('');
    }
  }

  function handleStop() {
    abortRef.current = true;
    pauseRef.current = false;
    setPaused(false);
    clearTempMarkers();
    clearCoverageMarkers();
    setCoverageTooltip(false);
    setNodesHidden(false);
    setPhase('idle');
    setCaption('');
    setSubCaption('');
  }

  function handleNext() {
    skipRef.current = step; // step is 1-indexed, so this jumps to the next
  }

  function handlePrev() {
    skipRef.current = Math.max(0, step - 2); // go back one (step is 1-indexed)
  }

  function handlePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
  }

  // ── Render ──────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <button
        onClick={handlePlay}
        className="absolute top-4 right-4 z-[1000] flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-white hover:bg-gray-800/90 hover:border-white/30 transition-all shadow-2xl group"
      >
        <Film className="w-5 h-5 text-blue-400 group-hover:text-blue-300" />
        <div className="text-left">
          <div className="text-sm font-semibold">Play Flagship Demo</div>
          <div className="text-[10px] text-white/40">Cinematic CUAS comparison</div>
        </div>
      </button>
    );
  }

  if (phase === 'error') {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-red-500/30 rounded-2xl px-8 py-6 text-center shadow-2xl max-w-sm">
          <div className="text-sm text-red-400 font-medium mb-2">Animation failed</div>
          <div className="text-xs text-white/50 mb-4 break-words">{errorMsg}</div>
          <div className="flex gap-2 justify-center">
            <button onClick={handlePlay} className="px-4 py-2 text-xs rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30">Retry</button>
            <button onClick={() => { setPhase('idle'); setErrorMsg(''); }} className="px-4 py-2 text-xs rounded-lg bg-white/5 text-white/50 border border-white/10 hover:bg-white/10">Dismiss</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-white/20 rounded-2xl px-8 py-6 text-center shadow-2xl">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
          <div className="text-sm text-white font-medium mb-1">Loading boundaries…</div>
          <div className="text-xs text-white/40">{loadingMsg}</div>
          <button onClick={handleStop} className="mt-4 text-xs text-white/30 hover:text-white/60 transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {caption && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-20 pb-8 px-8">
            <div className="max-w-2xl mx-auto text-center">
              <h2 key={caption} className="text-3xl md:text-4xl font-bold text-white tracking-tight animate-fade-in">{caption}</h2>
              {subCaption && (
                <p key={subCaption} className="text-base md:text-lg text-white/60 mt-2 animate-fade-in-delay">{subCaption}</p>
              )}
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    i + 1 <= step ? 'bg-blue-400 w-4' : i + 1 === step + 1 ? 'bg-blue-400/40 w-3' : 'bg-white/15 w-2'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transport controls */}
      <div className="absolute top-4 right-4 z-[1001] flex items-center gap-1.5">
        <button
          onClick={handlePrev}
          className="p-2 rounded-lg bg-gray-900/80 backdrop-blur-md border border-white/20 text-white/70 hover:text-white hover:bg-gray-800/90 transition-all"
          title="Previous step"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handlePause}
          className={`p-2 rounded-lg backdrop-blur-md border transition-all ${
            paused
              ? 'bg-blue-600/80 border-blue-400/30 text-white'
              : 'bg-gray-900/80 border-white/20 text-white/70 hover:text-white hover:bg-gray-800/90'
          }`}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleNext}
          className="p-2 rounded-lg bg-gray-900/80 backdrop-blur-md border border-white/20 text-white/70 hover:text-white hover:bg-gray-800/90 transition-all"
          title="Next step"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900/80 backdrop-blur-md border border-white/20 text-white/70 hover:text-white hover:bg-gray-800/90 transition-all text-xs"
        >
          <Square className="w-3.5 h-3.5" />
          Stop
        </button>
      </div>

      {coverageTooltip && (
        <div className="absolute top-16 right-56 z-[1002] animate-fade-in">
          <div className="relative bg-emerald-600/90 backdrop-blur-md border border-emerald-400/40 rounded-xl px-5 py-3 shadow-2xl max-w-[220px]">
            <div className="flex items-center gap-2 mb-1">
              <Radar className="w-4 h-4 text-emerald-200" />
              <span className="text-sm font-bold text-white">Try It Yourself</span>
            </div>
            <p className="text-xs text-emerald-100/80">Simulate coverage for any area with the Coverage Simulator</p>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-emerald-600/90" />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <button
          onClick={handlePlay}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600/80 backdrop-blur-md border border-blue-400/30 text-white hover:bg-blue-500/80 transition-all shadow-xl"
        >
          <Play className="w-4 h-4" />
          Replay
        </button>
      )}
    </>
  );
}
