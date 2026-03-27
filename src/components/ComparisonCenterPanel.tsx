import { useState } from 'react';
import { Crosshair, RotateCcw, ToggleLeft, ToggleRight, Search, Loader2 } from 'lucide-react';
import type { ComparisonCenter } from '../hooks/useOverlays';
import { searchPlaces } from '../lib/api';

interface Props {
  center: ComparisonCenter;
  autoCenter: boolean;
  hasOverlays: boolean;
  onChangeCenter: (center: ComparisonCenter, restackExisting: boolean) => void;
  onStackAll: () => void;
  onSetAutoCenter: (v: boolean) => void;
}

const PRESET_CENTERS: ComparisonCenter[] = [
  { lat: 29.6500, lng: -82.3486, name: 'Ben Hill Griffin Stadium' },
  { lat: 29.6516, lng: -82.3248, name: 'Gainesville, FL' },
  { lat: 38.8977, lng: -77.0365, name: 'Washington, DC' },
  { lat: 40.7128, lng: -74.0060, name: 'New York City' },
  { lat: 25.7617, lng: -80.1918, name: 'Miami, FL' },
  { lat: 28.3852, lng: -81.5639, name: 'Orlando, FL' },
  { lat: 51.5074, lng: -0.1278, name: 'London, UK' },
  { lat: 48.8566, lng: 2.3522, name: 'Paris, France' },
  { lat: 35.6762, lng: 139.6503, name: 'Tokyo, Japan' },
  { lat: 0, lng: 0, name: 'Equator (0,0)' },
];

export default function ComparisonCenterPanel({
  center,
  autoCenter,
  hasOverlays,
  onChangeCenter,
  onStackAll,
  onSetAutoCenter,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchPlaces(searchQuery);
      if (results.length > 0) {
        const r = results[0];
        onChangeCenter(
          { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name.split(',')[0] },
          hasOverlays
        );
        setSearchQuery('');
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5" />
          Comparison Center
        </h3>
        <button
          onClick={() => onSetAutoCenter(!autoCenter)}
          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors ${
            autoCenter
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-white/5 text-white/40 border border-white/10'
          }`}
          title={autoCenter ? 'Auto-center ON: new overlays snap to center' : 'Auto-center OFF: overlays stay at original location'}
        >
          {autoCenter ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
          Auto
        </button>
      </div>

      {/* Current center display */}
      <div className="bg-white/5 rounded-lg border border-white/10 px-3 py-2">
        <div className="text-xs text-white/90 font-medium">{center.name}</div>
        <div className="text-[10px] text-white/40 font-mono">
          {center.lat.toFixed(4)}°, {center.lng.toFixed(4)}°
        </div>
      </div>

      {/* Preset locations */}
      <div className="flex flex-wrap gap-1">
        {PRESET_CENTERS.map((pc) => (
          <button
            key={pc.name}
            onClick={() => onChangeCenter(pc, hasOverlays)}
            className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
              center.name === pc.name
                ? 'bg-blue-500/25 text-blue-300 border border-blue-500/40'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-transparent'
            }`}
          >
            {pc.name}
          </button>
        ))}
      </div>

      {/* Custom search */}
      <div className="flex gap-1.5">
        <div className="flex-1 flex items-center gap-2 rounded-md bg-white/5 border border-white/10 px-2 py-1.5 focus-within:border-blue-400/50">
          <Search className="w-3 h-3 text-white/30 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Custom location…"
            className="bg-transparent text-[11px] text-white placeholder-white/30 outline-none flex-1 min-w-0"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-2 py-1.5 rounded-md bg-blue-500/20 text-blue-300 text-[11px] hover:bg-blue-500/30 transition-colors disabled:opacity-40 border border-blue-500/30"
        >
          {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
        </button>
      </div>

      {/* Stack all button */}
      {hasOverlays && (
        <button
          onClick={onStackAll}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-colors text-xs font-medium"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Stack all overlays at {center.name}
        </button>
      )}
    </div>
  );
}
