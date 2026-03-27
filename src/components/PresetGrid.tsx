import { useState } from 'react';
import {
  Loader2, MapPin, Building2, Flag, Mountain, Landmark,
  Shield, Trophy,
} from 'lucide-react';
import { PRESET_PLACES } from '../lib/presets';
import { fetchBoundaryByOsmId, fetchBoundaryBySearch } from '../lib/api';
import type { PresetPlace } from '../types';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

interface Props {
  onAdd: (name: string, feature: Feature<Polygon | MultiPolygon>) => void;
  existingNames: string[];
}

const CATEGORY_ICONS: Record<PresetPlace['category'], typeof Building2> = {
  cuas: Shield,
  stadium: Trophy,
  landmark: Mountain,
  city: Building2,
  state: Landmark,
  country: Flag,
  region: MapPin,
};

const CATEGORY_LABELS: Record<PresetPlace['category'], string> = {
  cuas: 'CUAS',
  stadium: 'Stadium',
  landmark: 'Landmark',
  city: 'City',
  state: 'State',
  country: 'Country',
  region: 'Region',
};

const CATEGORY_ORDER: PresetPlace['category'][] = [
  'cuas', 'stadium', 'landmark', 'city', 'state', 'country',
];

export default function PresetGrid({ onAdd, existingNames }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PresetPlace['category'] | 'all'>('cuas');
  const [error, setError] = useState<string | null>(null);

  const filtered = filter === 'all'
    ? PRESET_PLACES
    : PRESET_PLACES.filter((p) => p.category === filter);

  async function handleClick(preset: PresetPlace) {
    if (preset.geojson) {
      onAdd(preset.name, preset.geojson);
      return;
    }

    setLoadingId(preset.name);
    setError(null);
    try {
      let feature: Feature<Polygon | MultiPolygon> | null = null;

      if (preset.osmId && preset.osmType) {
        feature = await fetchBoundaryByOsmId(preset.osmType, preset.osmId);
      }

      if (!feature && preset.searchQuery) {
        feature = await fetchBoundaryBySearch(preset.searchQuery);
      }

      if (!feature) {
        setError(`No boundary data for ${preset.name}`);
        return;
      }

      onAdd(preset.name, feature);
    } catch {
      setError(`Failed to load ${preset.name}`);
    } finally {
      setLoadingId(null);
    }
  }

  const isLoaded = (name: string) => existingNames.includes(name);

  return (
    <div>
      <div className="flex gap-1 mb-3 flex-wrap">
        {(['all', ...CATEGORY_ORDER] as const).map((cat) => {
          const count = cat === 'all'
            ? PRESET_PLACES.length
            : PRESET_PLACES.filter((p) => p.category === cat).length;
          if (cat !== 'all' && count === 0) return null;

          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                filter === cat
                  ? cat === 'cuas'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                    : cat === 'stadium'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-transparent'
              }`}
            >
              {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
        {filtered.map((preset) => {
          const Icon = CATEGORY_ICONS[preset.category];
          const loaded = isLoaded(preset.name);
          const isLoading = loadingId === preset.name;

          return (
            <button
              key={preset.name}
              onClick={() => handleClick(preset)}
              disabled={isLoading}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all ${
                loaded
                  ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                  : preset.category === 'cuas'
                  ? 'bg-red-500/5 border border-red-500/10 text-white/70 hover:bg-red-500/10 hover:text-white hover:border-red-500/20'
                  : preset.category === 'stadium'
                  ? 'bg-amber-500/5 border border-amber-500/10 text-white/70 hover:bg-amber-500/10 hover:text-white hover:border-amber-500/20'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20'
              } disabled:opacity-50`}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-blue-400" />
              ) : (
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${
                  preset.category === 'cuas' ? 'text-red-400/60' :
                  preset.category === 'stadium' ? 'text-amber-400/60' :
                  'opacity-60'
                }`} />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{preset.name}</div>
                {preset.description && (
                  <div className="text-[10px] opacity-50">{preset.description}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
