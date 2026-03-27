import { useState, useRef, useCallback } from 'react';
import { Radar, X, Loader2, MapPin } from 'lucide-react';
import L from 'leaflet';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { fetchBoundaryByOsmId, fetchBoundaryBySearch } from '../lib/api';
import { getBbox, calculateArea, createNUAIRCorridor } from '../lib/geo';
import { generateHexGrid } from '../lib/coverageGrid';
import { NODE_COLORS } from '../types';

const COST_PER_NODE = 5000;

interface Props {
  mapRef: React.MutableRefObject<L.Map | null>;
  currentNodeCount: number;
  coverageRadiusMiles: number;
}

interface AreaOption {
  name: string;
  osmType?: 'relation' | 'way';
  osmId?: number;
  searchQuery?: string;
  localBuilder?: () => Feature<Polygon | MultiPolygon>;
}

const AREAS: AreaOption[] = [
  // Corridors
  { name: 'NUAIR BVLOS Corridor (Rome, NY)', localBuilder: () => createNUAIRCorridor() as Feature<Polygon | MultiPolygon> },
  // Resorts / Private
  { name: 'Yellowstone Club (Big Sky, MT)', searchQuery: 'Yellowstone Club Big Sky Montana' },
  { name: 'Vail Ski Resort (Vail, CO)', searchQuery: 'Vail Ski Resort Colorado' },
  // Cities
  { name: 'Gainesville, FL', osmType: 'relation', osmId: 118870 },
  { name: 'Manhattan', osmType: 'relation', osmId: 8398124 },
  { name: 'New York City (5 boroughs)', osmType: 'relation', osmId: 175905 },
  { name: 'City of Miami', osmType: 'relation', osmId: 1216769 },
  { name: 'City of Los Angeles', osmType: 'relation', osmId: 207359 },
  { name: 'San Francisco', osmType: 'relation', osmId: 111968 },
  { name: 'Washington, DC', searchQuery: 'District of Columbia Washington' },
  { name: 'City of Chicago', searchQuery: 'City of Chicago Illinois' },
  { name: 'Bergen County, NJ', osmType: 'relation', osmId: 958930 },
  // States
  { name: 'New Jersey', osmType: 'relation', osmId: 224951 },
  { name: 'Massachusetts', osmType: 'relation', osmId: 61315 },
  { name: 'New York State', osmType: 'relation', osmId: 61320 },
  { name: 'Florida', osmType: 'relation', osmId: 162050 },
  { name: 'California', osmType: 'relation', osmId: 165475 },
];

type Phase = 'idle' | 'picking' | 'loading' | 'showing';

export default function CoverageSimulator({ mapRef, currentNodeCount, coverageRadiusMiles }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [minOverlap, setMinOverlap] = useState(2);
  const [radius, setRadius] = useState(coverageRadiusMiles);
  const [result, setResult] = useState<{ name: string; nodeCount: number; areaSqMi: number; coveragePct: number; dualCoveragePct: number; minOverlap: number } | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

  const cleanup = useCallback(() => {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.remove();
      boundaryLayerRef.current = null;
    }
  }, []);

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

      for (let i = 0; i < grid.nodes.length; i++) {
        const pt = grid.nodes[i];
        const color = NODE_COLORS[i % NODE_COLORS.length];
        const icon = L.divIcon({
          className: '',
          html: `<div class="detection-node-marker">
            <div class="detection-node-dot" style="background:${color};box-shadow:0 0 6px ${color}"></div>
          </div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([pt.lat, pt.lng], { icon, interactive: false }).addTo(map);
        markersRef.current.push(marker);

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

      setResult({ name: area.name, nodeCount: grid.samplePoints, areaSqMi: sqMi, coveragePct: grid.coveragePct, dualCoveragePct: grid.dualCoveragePct, minOverlap });
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
          <div className="space-y-1 max-h-64 overflow-y-auto">
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

  // showing
  return (
    <>
      {/* Stats panel — top left */}
      <div className="absolute top-4 left-4 z-[1001] bg-gray-900/90 backdrop-blur-md border border-white/20 rounded-xl p-4 w-64 shadow-2xl">
        <div className="text-xs text-white/40 uppercase tracking-wider mb-2 font-semibold">Coverage Estimate</div>
        <h3 className="text-lg font-bold text-white mb-3">{result?.name}</h3>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/50">Area</span>
            <span className="text-white font-mono">{result?.areaSqMi.toFixed(0)} sq mi</span>
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
            <span className="text-white/50">Single Coverage</span>
            <span className="text-white font-mono">{result?.coveragePct.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/50">{result?.minOverlap}+ Node Coverage</span>
            <span className={`font-bold font-mono ${(result?.dualCoveragePct ?? 0) >= 95 ? 'text-green-400' : 'text-amber-400'}`}>{result?.dualCoveragePct.toFixed(1)}%</span>
          </div>

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

      {/* Bottom caption */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-12 pb-5 px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              <span className="text-green-400">{result?.nodeCount.toLocaleString()}</span> nodes · <span className="text-green-400">${totalCost.toLocaleString()}</span>
            </h2>
            <p className="text-sm text-white/50 mt-1">
              {result?.dualCoveragePct.toFixed(0)}% coverage ({result?.minOverlap}+ nodes) for {result?.name}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
