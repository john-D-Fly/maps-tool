import { useState, useRef, useCallback } from 'react';
import { Radar, X, Loader2, MapPin, Mountain } from 'lucide-react';
import L from 'leaflet';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { fetchBoundaryByOsmId, fetchBoundaryBySearch } from '../lib/api';
import { getBbox, calculateArea, createNUAIRCorridor, createUFCampusBoundary } from '../lib/geo';
import { generateHexGrid } from '../lib/coverageGrid';
import { NODE_COLORS } from '../types';
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

const COST_PER_NODE = 5000;
const DEFAULT_SENSOR_HEIGHT_FT = 30;
const DEFAULT_TARGET_ALT_FT = 100;

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
  lidarEnabled: boolean;
  lidarCoveragePct?: number;
  lidarOverlapPct?: number;
  elevationStats?: { min: number; max: number; mean: number };
  buildingCount?: number;
  viewshed?: ViewshedResult;
}

export default function CoverageSimulator({ mapRef, currentNodeCount, coverageRadiusMiles, onViewshedChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [minOverlap, setMinOverlap] = useState(2);
  const [radius, setRadius] = useState(coverageRadiusMiles);
  const [lidarEnabled, setLidarEnabled] = useState(false);
  const [sensorHeight, setSensorHeight] = useState(DEFAULT_SENSOR_HEIGHT_FT);
  const [targetAlt, setTargetAlt] = useState(DEFAULT_TARGET_ALT_FT);
  const [result, setResult] = useState<SimResult | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

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
      setLoadingMsg('Loading preprocessed LiDAR heightmap…');
      const hm = await loadStaticHeightmap(staticName);
      let bm = null;
      try { bm = await loadBuildingMask(staticName); } catch { /* optional */ }
      elevGrid = heightmapToGrid(hm, bm);
    } else {
      setLoadingMsg('Fetching elevation data from USGS 3DEP…');
      elevGrid = await buildElevationGridFromAPI(bboxBounds, 30);
    }

    setLoadingMsg('Computing line-of-sight viewshed…');
    await new Promise((r) => setTimeout(r, 50));

    const nodePositions = grid.nodes.map((n) => ({ lat: n.lat, lng: n.lng }));
    const vsResult = computeViewshed(
      nodePositions,
      elevGrid,
      sensorHeight,
      targetAlt,
      radius,
      minOverlap,
      elevGrid.rows,
      elevGrid.cols,
    );

    return { elevGrid, vsResult };
  }

  async function handleSelect(area: AreaOption) {
    const map = mapRef.current;
    if (!map) return;

    setPhase('loading');
    setLoadingMsg(`Loading ${area.name}…`);

    try {
      let feature: Feature<Polygon | MultiPolygon> | null = null;

      if (area.localBuilder) {
        feature = area.localBuilder();
      } else if (area.osmType && area.osmId) {
        feature = await fetchBoundaryByOsmId(area.osmType, area.osmId);
      } else if (area.searchQuery) {
        feature = await fetchBoundaryBySearch(area.searchQuery);
      }

      if (!feature) {
        setPhase('picking');
        return;
      }

      setLoadingMsg('Generating coverage grid…');

      const grid = generateHexGrid(feature, radius, minOverlap);
      const { sqMi } = calculateArea(feature);

      cleanup();

      const [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat] = getBbox(feature);
      map.fitBounds([[bboxMinLat, bboxMinLng], [bboxMaxLat, bboxMaxLng]], { padding: [40, 40], duration: 2 });

      const layer = L.geoJSON(feature, {
        style: {
          color: '#c084fc',
          weight: 2,
          fillColor: '#c084fc',
          fillOpacity: 0.08,
        },
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
            color: '#22c55e',
            weight: 0.5,
            opacity: 0.2,
            fillColor: '#86efac',
            fillOpacity: 0.06,
            interactive: false,
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

  function handleClose() {
    cleanup();
    setPhase('idle');
    setResult(null);
  }

  function handleBack() {
    cleanup();
    setResult(null);
    setPhase('picking');
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('picking')}
        className="absolute top-4 right-56 z-[1000] flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-white hover:bg-gray-800/90 hover:border-white/30 transition-all shadow-2xl group"
      >
        <Radar className="w-5 h-5 text-green-400 group-hover:text-green-300" />
        <div className="text-left">
          <div className="text-sm font-semibold">Coverage Simulator</div>
          <div className="text-[10px] text-white/40">How many nodes to cover an area?</div>
        </div>
      </button>
    );
  }

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

  if (phase === 'picking') {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-white/20 rounded-2xl px-6 py-5 shadow-2xl w-80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radar className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-bold text-white">Coverage Simulator</h3>
            </div>
            <button onClick={handleClose} className="text-white/30 hover:text-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-white/50 mb-3">
            {radius}-mile radius per node. 95% of area covered by at least {minOverlap} nodes.
          </p>
          <div className="space-y-2 mb-3 px-1">
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-white/50 w-14">Radius</label>
              <input
                type="range" min={0.5} max={10} step={0.5} value={radius}
                onChange={(e) => setRadius(+e.target.value)}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-xs text-blue-400 font-bold font-mono w-12 text-right">{radius} mi</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-white/50 w-14">Overlap</label>
              <input
                type="range" min={2} max={5} step={1} value={minOverlap}
                onChange={(e) => setMinOverlap(+e.target.value)}
                className="flex-1 h-1 accent-green-500"
              />
              <span className="text-xs text-green-400 font-bold font-mono w-12 text-right">{minOverlap}× nodes</span>
            </div>
          </div>

          {/* LiDAR toggle */}
          <div className="border-t border-white/10 pt-3 mb-3">
            <button
              onClick={() => setLidarEnabled(!lidarEnabled)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-xs ${
                lidarEnabled
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70 hover:bg-white/8'
              }`}
            >
              <Mountain className="w-4 h-4 flex-shrink-0" />
              <div className="text-left flex-1">
                <div className="font-semibold">LiDAR Viewshed</div>
                <div className={`text-[10px] ${lidarEnabled ? 'text-cyan-400/60' : 'text-white/30'}`}>
                  Line-of-sight with terrain + buildings
                </div>
              </div>
              <div className={`w-8 h-4.5 rounded-full relative transition-colors ${
                lidarEnabled ? 'bg-cyan-500' : 'bg-white/20'
              }`}>
                <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                  lidarEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
            </button>

            {lidarEnabled && (
              <div className="mt-2 space-y-2 px-1">
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-cyan-400/60 w-14">Sensor</label>
                  <input
                    type="range" min={10} max={100} step={5} value={sensorHeight}
                    onChange={(e) => setSensorHeight(+e.target.value)}
                    className="flex-1 h-1 accent-cyan-500"
                  />
                  <span className="text-xs text-cyan-400 font-bold font-mono w-12 text-right">{sensorHeight} ft</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-cyan-400/60 w-14">Target</label>
                  <input
                    type="range" min={50} max={400} step={25} value={targetAlt}
                    onChange={(e) => setTargetAlt(+e.target.value)}
                    className="flex-1 h-1 accent-cyan-500"
                  />
                  <span className="text-xs text-cyan-400 font-bold font-mono w-12 text-right">{targetAlt} ft</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1 max-h-52 overflow-y-auto">
            {AREAS.map((area) => (
              <button
                key={area.name}
                onClick={() => handleSelect(area)}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs"
              >
                <MapPin className="w-3 h-3 inline mr-2 opacity-40" />
                {area.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalCost = (result?.nodeCount ?? 0) * COST_PER_NODE;
  const costPerSqMi = result && result.areaSqMi > 0 ? totalCost / result.areaSqMi : 0;
  const gvilCost = currentNodeCount * COST_PER_NODE;

  const displayCoverage = result?.lidarEnabled && result.lidarCoveragePct != null
    ? result.lidarCoveragePct : result?.coveragePct ?? 0;
  const displayOverlap = result?.lidarEnabled && result.lidarOverlapPct != null
    ? result.lidarOverlapPct : result?.dualCoveragePct ?? 0;

  return (
    <>
      <div className="absolute top-4 left-4 z-[1001] bg-gray-900/90 backdrop-blur-md border border-white/20 rounded-xl p-4 w-72 shadow-2xl">
        <div className="text-xs text-white/40 uppercase tracking-wider mb-2 font-semibold">Coverage Estimate</div>
        <h3 className="text-lg font-bold text-white mb-3">{result?.name}</h3>

        {result?.lidarEnabled && (
          <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Mountain className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-cyan-300 font-semibold">LiDAR Viewshed Active</span>
          </div>
        )}

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
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Flat-Earth Estimate</span>
                <span className="text-white/30 font-mono line-through">{result.coveragePct.toFixed(1)}%</span>
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

          {result?.elevationStats && (
            <div className="border-t border-white/10 pt-2 mt-2">
              <div className="text-[10px] text-cyan-400/50 uppercase tracking-wider mb-1">Terrain Profile</div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Elevation Range</span>
                <span className="text-white font-mono">
                  {result.elevationStats.min.toFixed(0)}–{result.elevationStats.max.toFixed(0)} m
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

          <div className="border-t border-white/10 pt-2 mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/50">Cost per Node</span>
              <span className="text-white font-mono">${COST_PER_NODE.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-white/50">Total Network Cost</span>
              <span className="text-green-400 font-bold font-mono">${totalCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-white/50">Cost / sq mi</span>
              <span className="text-white font-mono">${Math.round(costPerSqMi).toLocaleString()}</span>
            </div>
          </div>

          {currentNodeCount > 0 && result && (
            <div className="border-t border-white/10 pt-2 mt-2">
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">vs Gainesville Network</div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Your Nodes</span>
                <span className="text-white font-mono">{currentNodeCount}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-white/50">Your Cost</span>
                <span className="text-white font-mono">${gvilCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-white/50">Scale Factor</span>
                <span className="text-amber-400 font-bold font-mono">{Math.ceil(result.nodeCount / currentNodeCount)}×</span>
              </div>
            </div>
          )}
        </div>

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

      <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-12 pb-5 px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              <span className="text-green-400">{result?.nodeCount.toLocaleString()}</span> nodes · <span className="text-green-400">${totalCost.toLocaleString()}</span>
            </h2>
            <p className="text-sm text-white/50 mt-1">
              {displayOverlap.toFixed(0)}% {result?.lidarEnabled ? 'LoS' : ''} coverage ({result?.minOverlap}+ nodes) for {result?.name}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
