import { ArrowLeftRight, Maximize2 } from 'lucide-react';
import type { MapOverlay } from '../types';
import { formatArea, compareAreas, fitsInside } from '../lib/geo';

interface Props {
  overlays: MapOverlay[];
}

export default function ComparisonPanel({ overlays }: Props) {
  if (overlays.length < 2) return null;

  const sorted = [...overlays].sort((a, b) => b.areaSqMi - a.areaSqMi);
  const largest = sorted[0];
  const smallest = sorted[sorted.length - 1];

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
        <ArrowLeftRight className="w-3.5 h-3.5" />
        Quick Compare
      </h3>

      <div className="bg-white/5 rounded-lg border border-white/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: largest.color }}
          />
          <span className="text-xs text-white/70">
            <strong className="text-white/90">{largest.name}</strong>{' '}
            is the largest at {formatArea(largest.areaSqMi)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: smallest.color }}
          />
          <span className="text-xs text-white/70">
            <strong className="text-white/90">{smallest.name}</strong>{' '}
            is the smallest at {formatArea(smallest.areaSqMi)}
          </span>
        </div>

        <div className="border-t border-white/10 pt-2">
          <div className="text-xs text-blue-300/80">
            {fitsInside(smallest, largest)}
          </div>
          <div className="text-xs text-white/50 mt-0.5">
            {compareAreas(largest, smallest)}
          </div>
        </div>
      </div>

      {sorted.length > 2 && (
        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
          <h4 className="text-[11px] text-white/50 mb-2 flex items-center gap-1">
            <Maximize2 className="w-3 h-3" />
            Size ranking
          </h4>
          <div className="space-y-1.5">
            {sorted.map((overlay, i) => {
              const pct = (overlay.areaSqMi / largest.areaSqMi) * 100;
              return (
                <div key={overlay.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30 w-3 text-right">{i + 1}</span>
                  <div
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: overlay.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/80 truncate">{overlay.name}</span>
                      <span className="text-[10px] text-white/40 flex-shrink-0">
                        {formatArea(overlay.areaSqMi)}
                      </span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full mt-0.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: overlay.color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
