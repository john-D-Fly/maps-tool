import { useState, useRef, useCallback } from 'react';
import { Radar, X, Loader2, MapPin, Mountain, Check, ShieldCheck, Radio } from 'lucide-react';
import L from 'leaflet';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { fetchBoundaryByOsmId, fetchBoundaryBySearch } from '../lib/api';
import { getBbox, calculateArea, createNUAIRCorridor, createUFCampusBoundary } from '../lib/geo';
import { generateHexGrid } from '../lib/coverageGrid';
import { NODE_COLORS } from '../types';
import type { ProductTier, PricingModel, ProductConfig } from '../types';
import { PRODUCTS } from '../types';
import {
  findStaticArea,
  loadStaticHeightmap,
  loadBuildingMask,
  heightmapToGrid,
  buildElevationGridFromAPI,
  type ElevationGrid,
  type HeightmapBounds,
} from '../lib/elevationService';
import { computeViewshed, type ViewshedResult } from '../lib/viewshed';

const DEFAULT_SENSOR_HEIGHT_FT = 30;
const DEFAULT_TARGET_ALT_FT = 100;
const CONFIDENCE_OVERLAP: Record<number, number> = { 0: 2, 1: 3, 2: 4, 3: 5 };

interface Props {
  mapRef: React.MutableRefObject<L.Map | null>;
  currentNodeCount: number;
  coverageRadiusMiles: number;
  onViewshedChange?: (vs: ViewshedResult | null) => void;
}

interface AreaOption {
  name: string;
  osmType?: 'relation' | 'way';
  osmId?: number;
  searchQuery?: string;
  localBuilder?: () => Feature<Polygon | MultiPolygon>;
}

const AREAS: AreaOption[] = [
  { name: 'NUAIR BVLOS Corridor (Rome, NY)', localBuilder: () => createNUAIRCorridor() as Feature<Polygon | MultiPolygon> },
  { name: 'Yellowstone Club (Big Sky, MT)', searchQuery: 'Yellowstone Club Big Sky Montana' },
  { name: 'Vail Ski Resort (Vail, CO)', searchQuery: 'Vail Ski Resort Colorado' },
  { name: 'UF Campus (Gainesville, FL)', localBuilder: () => createUFCampusBoundary() as Feature<Polygon | MultiPolygon> },
  { name: 'Gainesville, FL', osmType: 'relation', osmId: 118870 },
  { name: 'Manhattan', osmType: 'relation', osmId: 8398124 },
  { name: 'New York City (5 boroughs)', osmType: 'relation', osmId: 175905 },
  { name: 'City of Miami', osmType: 'relation', osmId: 1216769 },
  { name: 'City of Los Angeles', osmType: 'relation', osmId: 207359 },
  { name: 'San Francisco', osmType: 'relation', osmId: 111968 },
  { name: 'Washington, DC', searchQuery: 'District of Columbia Washington' },
  { name: 'City of Chicago', searchQuery: 'City of Chicago Illinois' },
  { name: 'Bergen County, NJ', osmType: 'relation', osmId: 958930 },
  { name: 'New Jersey', osmType: 'relation', osmId: 224951 },
  { name: 'Massachusetts', osmType: 'relation', osmId: 61315 },
  { name: 'New York State', osmType: 'relation', osmId: 61320 },
  { name: 'Florida', osmType: 'relation', osmId: 162050 },
  { name: 'California', osmType: 'relation', osmId: 165475 },
];

type Phase = 'idle' | 'picking' | 'loading' | 'showing';

interface SimResult {
  name: string;
  nodeCount: number;
  areaSqMi: number;
  coveragePct: number;
  dualCoveragePct: number;
  minOverlap: number;
  product: ProductConfig;
  pricingModel: PricingModel;
  confidence: number;
  lidarEnabled: boolean;
  lidarCoveragePct?: number;
  lidarOverlapPct?: number;
  elevationStats?: { min: number; max: number; mean: number };
  buildingCount?: number;
  viewshed?: ViewshedResult;
}

function ProductSelector({ selected, onSelect }: { selected: ProductTier; onSelect: (t: ProductTier) => void }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-white/40 font-semibold uppercase tracking-wider">Product</div>
      <div className="space-y-2">
        {PRODUCTS.map((p) => {
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                active
                  ? 'border-green-500 bg-green-500/8 shadow-[0_0_0_1px_rgba(34,197,94,0.2)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  {p.id === 'remote-id' ? (
                    <Radio className={`w-4.5 h-4.5 mt-0.5 ${active ? 'text-green-400' : 'text-white/30'}`} />
                  ) : (
                    <ShieldCheck className={`w-4.5 h-4.5 mt-0.5 ${active ? 'text-green-400' : 'text-white/30'}`} />
                  )}
                  <div>
                    <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-white/70'}`}>
                      {p.name}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${active ? 'text-white/50' : 'text-white/30'}`}>
                      {p.tagline}
                    </div>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                  active ? 'border-green-500 bg-green-500' : 'border-white/20'
                }`}>
                  {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
              </div>
              <div className={`mt-2.5 flex items-baseline gap-1 ${active ? 'text-green-400' : 'text-white/40'}`}>
                <span className="text-lg font-bold font-mono">
                  ${p.pricing.subscription.annual.toLocaleString()}
                </span>
                <span className="text-[10px]">/yr subscription</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfidenceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labels = ['Less overlap', 'Standard', 'High overlap', 'Maximum'];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-white/40 font-semibold uppercase tracking-wider">Coverage Confidence</div>
        <span className="text-[10px] text-green-400 font-semibold">{CONFIDENCE_OVERLAP[value]}x overlap</span>
      </div>
      <input
        type="range" min={0} max={3} step={1} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full h-1.5 accent-green-500 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-white/30 px-0.5">
        {labels.map((l) => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}

export default function CoverageSimulator({ mapRef, currentNodeCount, onViewshedChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductTier>('remote-id');
  const [confidence, setConfidence] = useState(1);
  const [pricingModel, setPricingModel] = useState<PricingModel>('subscription');
  const [lidarEnabled, setLidarEnabled] = useState(false);
  const [sensorHeight, setSensorHeight] = useState(DEFAULT_SENSOR_HEIGHT_FT);
  const [targetAlt, setTargetAlt] = useState(DEFAULT_TARGET_ALT_FT);
  const [result, setResult] = useState<SimResult | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

  const product = PRODUCTS.find((p) => p.id === selectedProduct)!;
  const radius = product.radiusMiles;
  const minOverlap = CONFIDENCE_OVERLAP[confidence] ?? 2;

  const cleanup = useCallback(() => {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.remove();
      boundaryLayerRef.current = null;
    }
    onViewshedChange?.(null);
  }, [onViewshedChange]);

  async function runLidarAnalysis(
    grid: ReturnType<typeof generateHexGrid>,
    bboxBounds: HeightmapBounds,
  ): Promise<{ elevGrid: ElevationGrid; vsResult: ViewshedResult }> {
    const staticName = findStaticArea(bboxBounds);
    let elevGrid: ElevationGrid;

    if (staticName) {
      setLoadingMsg('Loading preprocessed LiDAR heightmap\u2026');
      const hm = await loadStaticHeightmap(staticName);
      let bm = null;
      try { bm = await loadBuildingMask(staticName); } catch { /* optional */ }
      elevGrid = heightmapToGrid(hm, bm);
    } else {
      setLoadingMsg('Fetching elevation data from USGS 3DEP\u2026');
      elevGrid = await buildElevationGridFromAPI(bboxBounds, 30);
    }

    setLoadingMsg('Computing line-of-sight viewshed\u2026');
    await new Promise((r) => setTimeout(r, 50));

    const nodePositions = grid.nodes.map((n) => ({ lat: n.lat, lng: n.lng }));
    const vsResult = computeViewshed(
      nodePositions, elevGrid, sensorHeight, targetAlt,
      radius, minOverlap, elevGrid.rows, elevGrid.cols,
    );
    return { elevGrid, vsResult };
  }

  async function handleSelect(area: AreaOption) {
    const map = mapRef.current;
    if (!map) return;

    setPhase('loading');
    setLoadingMsg(`Loading ${area.name}\u2026`);

    try {
      let feature: Feature<Polygon | MultiPolygon> | null = null;
      if (area.localBuilder) {
        feature = area.localBuilder();
      } else if (area.osmType && area.osmId) {
        feature = await fetchBoundaryByOsmId(area.osmType, area.osmId);
      } else if (area.searchQuery) {
        feature = await fetchBoundaryBySearch(area.searchQuery);
      }
      if (!feature) { setPhase('picking'); return; }

      setLoadingMsg('Generating coverage grid\u2026');
      const grid = generateHexGrid(feature, radius, minOverlap);
      const { sqMi } = calculateArea(feature);

      cleanup();

      const [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat] = getBbox(feature);
      map.fitBounds([[bboxMinLat, bboxMinLng], [bboxMaxLat, bboxMaxLng]], { padding: [40, 40], duration: 2 });

      const layer = L.geoJSON(feature, {
        style: { color: '#c084fc', weight: 2, fillColor: '#c084fc', fillOpacity: 0.08 },
      }).addTo(map);
      boundaryLayerRef.current = layer;

      const count = grid.nodes.length;
      const nodeSize = count > 800 ? 3 : count > 300 ? 5 : count > 50 ? 10 : 16;
      const dotSize = Math.max(2, nodeSize - (nodeSize > 6 ? 4 : 1));
      const glow = nodeSize > 8 ? 6 : nodeSize > 4 ? 3 : 2;
      const showCircles = sqMi <= 200 && !lidarEnabled;

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
        markersRef.current.push(marker);

        if (showCircles) {
          const circle = L.circle([pt.lat, pt.lng], {
            radius: radius * 1609.34,
            color: '#22c55e', weight: 0.5, opacity: 0.2,
            fillColor: '#86efac', fillOpacity: 0.06, interactive: false,
          }).addTo(map);
          markersRef.current.push(circle as unknown as L.Marker);
        }
      }

      const simResult: SimResult = {
        name: area.name,
        nodeCount: grid.samplePoints,
        areaSqMi: sqMi,
        coveragePct: grid.coveragePct,
        dualCoveragePct: grid.dualCoveragePct,
        minOverlap,
        product,
        pricingModel,
        confidence,
        lidarEnabled,
      };

      if (lidarEnabled) {
        try {
          const bboxBounds: HeightmapBounds = {
            north: bboxMaxLat, south: bboxMinLat,
            east: bboxMaxLng, west: bboxMinLng,
          };
          const { elevGrid, vsResult } = await runLidarAnalysis(grid, bboxBounds);
          simResult.lidarCoveragePct = vsResult.coveragePct;
          simResult.lidarOverlapPct = vsResult.overlapPct;
          simResult.elevationStats = elevGrid.stats;
          simResult.viewshed = vsResult;
          if (elevGrid.buildingMask) {
            let bc = 0;
            for (let i = 0; i < elevGrid.buildingMask.length; i++) {
              if (elevGrid.buildingMask[i]) bc++;
            }
            simResult.buildingCount = bc;
          }
          onViewshedChange?.(vsResult);
        } catch (err) {
          console.warn('LiDAR analysis failed, falling back to geometric:', err);
          simResult.lidarEnabled = false;
        }
      }

      setResult(simResult);
      setPhase('showing');
    } catch {
      setPhase('picking');
    }
  }

  function handleClose() { cleanup(); setPhase('idle'); setResult(null); }
  function handleBack() { cleanup(); setResult(null); setPhase('picking'); }

  // ── Idle: launcher button ──────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('picking')}
        className="absolute top-4 right-56 z-[1000] flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-white hover:bg-gray-800/90 hover:border-white/30 transition-all shadow-2xl group"
      >
        <Radar className="w-5 h-5 text-green-400 group-hover:text-green-300" />
        <div className="text-left">
          <div className="text-sm font-semibold">Coverage Estimator</div>
          <div className="text-[10px] text-white/40">Estimate nodes & pricing for an area</div>
        </div>
      </button>
    );
  }

  // ── Loading spinner ────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-white/20 rounded-2xl px-8 py-6 text-center shadow-2xl">
          <Loader2 className="w-8 h-8 text-green-400 animate-spin mx-auto mb-3" />
          <div className="text-sm text-white font-medium">{loadingMsg}</div>
        </div>
      </div>
    );
  }

  // ── Picking: product toggle + confidence + area list ───────────────
  if (phase === 'picking') {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-white/20 rounded-2xl shadow-2xl w-[380px] max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Radar className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-bold text-white">Coverage Estimator</h3>
            </div>
            <button onClick={handleClose} className="text-white/30 hover:text-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
            {/* Product selector */}
            <ProductSelector selected={selectedProduct} onSelect={setSelectedProduct} />

            {/* Confidence slider */}
            <ConfidenceSlider value={confidence} onChange={setConfidence} />

            {/* LiDAR toggle */}
            <div>
              <button
                onClick={() => setLidarEnabled(!lidarEnabled)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-xs ${
                  lidarEnabled
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white/70 hover:bg-white/[0.06]'
                }`}
              >
                <Mountain className="w-4 h-4 flex-shrink-0" />
                <div className="text-left flex-1">
                  <div className="font-semibold">LiDAR Viewshed</div>
                  <div className={`text-[10px] ${lidarEnabled ? 'text-cyan-400/60' : 'text-white/30'}`}>
                    Line-of-sight with terrain + buildings
                  </div>
                </div>
                <div className={`w-8 h-4.5 rounded-full relative transition-colors ${lidarEnabled ? 'bg-cyan-500' : 'bg-white/20'}`}>
                  <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${lidarEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </button>
              {lidarEnabled && (
                <div className="mt-2 space-y-2 px-1">
                  <div className="flex items-center gap-3">
                    <label className="text-[11px] text-cyan-400/60 w-14">Sensor</label>
                    <input type="range" min={10} max={100} step={5} value={sensorHeight}
                      onChange={(e) => setSensorHeight(+e.target.value)}
                      className="flex-1 h-1 accent-cyan-500" />
                    <span className="text-xs text-cyan-400 font-bold font-mono w-12 text-right">{sensorHeight} ft</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[11px] text-cyan-400/60 w-14">Target</label>
                    <input type="range" min={50} max={400} step={25} value={targetAlt}
                      onChange={(e) => setTargetAlt(+e.target.value)}
                      className="flex-1 h-1 accent-cyan-500" />
                    <span className="text-xs text-cyan-400 font-bold font-mono w-12 text-right">{targetAlt} ft</span>
                  </div>
                </div>
              )}
            </div>

            {/* Area picker */}
            <div>
              <div className="text-[11px] text-white/40 font-semibold uppercase tracking-wider mb-2">Select Area</div>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {AREAS.map((area) => (
                  <button
                    key={area.name}
                    onClick={() => handleSelect(area)}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors text-xs"
                  >
                    <MapPin className="w-3 h-3 inline mr-2 opacity-40" />
                    {area.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Showing: results with pricing ──────────────────────────────────
  const pricing = result!.product.pricing[pricingModel];
  const totalNetworkUpfront = (result?.nodeCount ?? 0) * pricing.upfront;
  const totalNetworkAnnual = (result?.nodeCount ?? 0) * pricing.annual;
  const totalNetwork2Year = (result?.nodeCount ?? 0) * pricing.twoYearTotal;
  const costPerSqMi = result && result.areaSqMi > 0 ? totalNetwork2Year / result.areaSqMi : 0;

  const displayCoverage = result?.lidarEnabled && result.lidarCoveragePct != null
    ? result.lidarCoveragePct : result?.coveragePct ?? 0;
  const displayOverlap = result?.lidarEnabled && result.lidarOverlapPct != null
    ? result.lidarOverlapPct : result?.dualCoveragePct ?? 0;

  return (
    <>
      <div className="absolute top-4 left-4 z-[1001] bg-gray-900/90 backdrop-blur-md border border-white/20 rounded-xl p-4 w-80 shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="text-xs text-white/40 uppercase tracking-wider mb-1 font-semibold">Coverage Estimate</div>
        <h3 className="text-lg font-bold text-white mb-1">{result?.name}</h3>
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
            result?.product.id === 'enhanced-detection'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'bg-green-500/20 text-green-300 border border-green-500/30'
          }`}>
            {result?.product.name}
          </span>
          <span className="text-[10px] text-white/30">{radius} mi range</span>
        </div>

        {result?.lidarEnabled && (
          <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Mountain className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-cyan-300 font-semibold">LiDAR Viewshed Active</span>
          </div>
        )}

        {/* Coverage stats */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/50">Area</span>
            <span className="text-white font-mono">{result?.areaSqMi.toFixed(result.areaSqMi < 1 ? 2 : 0)} sq mi</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/50">Nodes Required</span>
            <span className="text-green-400 font-bold font-mono">{result?.nodeCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/50">Coverage Radius</span>
            <span className="text-white font-mono">{radius} mi / node</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/50">Overlap Target</span>
            <span className="text-white font-mono">{result?.minOverlap}x nodes</span>
          </div>

          {result?.lidarEnabled ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Viewshed Coverage</span>
                <span className="text-cyan-400 font-bold font-mono">{displayCoverage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">{result?.minOverlap}+ Node LoS</span>
                <span className={`font-bold font-mono ${displayOverlap >= 95 ? 'text-green-400' : displayOverlap >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                  {displayOverlap.toFixed(1)}%
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Single Coverage</span>
                <span className="text-white font-mono">{displayCoverage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">{result?.minOverlap}+ Node Coverage</span>
                <span className={`font-bold font-mono ${displayOverlap >= 95 ? 'text-green-400' : 'text-amber-400'}`}>
                  {displayOverlap.toFixed(1)}%
                </span>
              </div>
            </>
          )}
        </div>

        {/* Terrain stats (LiDAR) */}
        {result?.elevationStats && (
          <div className="border-t border-white/10 pt-2 mt-3">
            <div className="text-[10px] text-cyan-400/50 uppercase tracking-wider mb-1">Terrain Profile</div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Elevation Range</span>
              <span className="text-white font-mono">
                {result.elevationStats.min.toFixed(0)}&ndash;{result.elevationStats.max.toFixed(0)} m
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-white/50">Mean Elevation</span>
              <span className="text-white font-mono">{result.elevationStats.mean.toFixed(1)} m</span>
            </div>
            {result.buildingCount != null && result.buildingCount > 0 && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-white/50">Building Cells</span>
                <span className="text-white font-mono">{result.buildingCount.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Pricing section */}
        <div className="border-t border-white/10 pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Pricing per Node</div>
          </div>

          {/* Pricing model toggle */}
          <div className="flex rounded-lg bg-white/[0.05] border border-white/10 p-0.5 mb-3">
            {(['subscription', 'capex'] as const).map((model) => (
              <button
                key={model}
                onClick={() => setPricingModel(model)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  pricingModel === model
                    ? 'bg-green-500/20 text-green-300 shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {model === 'subscription' ? 'Subscription' : 'CapEx'}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Upfront / node</span>
              <span className="text-white font-mono">${pricing.upfront.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Annual / node</span>
              <span className="text-white font-mono">${pricing.annual.toLocaleString()}</span>
            </div>
            {pricing.contractYears > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Contract</span>
                <span className="text-white/70 font-mono">{pricing.contractYears}-year min</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Hardware Ownership</span>
              <span className={`font-mono ${pricing.hardwareOwnership ? 'text-green-400' : 'text-white/30'}`}>
                {pricing.hardwareOwnership ? 'Customer' : 'Decentrafly'}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Obsolescence Risk</span>
              <span className={`font-mono ${pricing.obsolescenceRisk ? 'text-amber-400' : 'text-green-400'}`}>
                {pricing.obsolescenceRisk ? 'Customer' : 'None'}
              </span>
            </div>
          </div>
        </div>

        {/* Network totals */}
        <div className="border-t border-white/10 pt-3 mt-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">Network Totals</div>
          <div className="space-y-1.5">
            {pricing.upfront > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Total Upfront</span>
                <span className="text-white font-mono">${totalNetworkUpfront.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Total Annual</span>
              <span className="text-white font-mono">${totalNetworkAnnual.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">2-Year Total</span>
              <span className="text-green-400 font-bold font-mono text-sm">${totalNetwork2Year.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Cost / sq mi (2yr)</span>
              <span className="text-white font-mono">${Math.round(costPerSqMi).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Comparison to Gainesville */}
        {currentNodeCount > 0 && result && (
          <div className="border-t border-white/10 pt-3 mt-3">
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">vs Gainesville Network</div>
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Your Nodes</span>
              <span className="text-white font-mono">{currentNodeCount}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-white/50">Scale Factor</span>
              <span className="text-amber-400 font-bold font-mono">{Math.ceil(result.nodeCount / currentNodeCount)}x</span>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleBack}
            className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/70 hover:text-white hover:bg-white/15 transition-colors text-[11px]"
          >
            Try another
          </button>
          <button
            onClick={handleClose}
            className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800/80 border border-white/10 text-white/50 hover:text-white hover:bg-gray-700/80 transition-colors text-[11px]"
          >
            Close
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-12 pb-5 px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              <span className="text-green-400">{result?.nodeCount.toLocaleString()}</span> nodes &middot;{' '}
              <span className="text-green-400">${totalNetwork2Year.toLocaleString()}</span>
              <span className="text-sm text-white/50 font-normal ml-1">/ 2yr</span>
            </h2>
            <p className="text-sm text-white/50 mt-1">
              {result?.product.name} &middot; {displayOverlap.toFixed(0)}% {result?.lidarEnabled ? 'LoS ' : ''}coverage ({result?.minOverlap}x overlap) &middot; {result?.name}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
