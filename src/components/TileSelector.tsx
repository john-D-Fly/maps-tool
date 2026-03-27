import { Map as MapIcon } from 'lucide-react';
import type { TileLayerOption } from '../types';
import { TILE_LAYERS } from '../types';

interface Props {
  current: TileLayerOption;
  onChange: (layer: TileLayerOption) => void;
}

export default function TileSelector({ current, onChange }: Props) {
  const options = Object.entries(TILE_LAYERS) as [TileLayerOption, (typeof TILE_LAYERS)[TileLayerOption]][];

  return (
    <div className="flex items-center gap-1.5">
      <MapIcon className="w-3.5 h-3.5 text-white/40" />
      {options.map(([key, val]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
            current === key
              ? 'bg-white/15 text-white border border-white/20'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
          }`}
        >
          {val.name}
        </button>
      ))}
    </div>
  );
}
