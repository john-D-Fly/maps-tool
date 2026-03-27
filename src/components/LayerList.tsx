import {
  Eye, EyeOff, Lock, Unlock, Trash2, Copy, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import type { MapOverlay } from '../types';
import { formatArea, formatAreaMetric, compareAreas, fitsInside } from '../lib/geo';

interface Props {
  overlays: MapOverlay[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateOpacity: (id: string, opacity: number) => void;
}

export default function LayerList({
  overlays,
  selectedId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRemove,
  onDuplicate,
  onUpdateColor,
  onUpdateOpacity,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (overlays.length === 0) {
    return (
      <div className="text-center py-8 text-white/30">
        <p className="text-sm">No overlays yet</p>
        <p className="text-xs mt-1">Search or pick a preset above</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {overlays.map((overlay) => {
        const isSelected = overlay.id === selectedId;
        const isExpanded = expandedId === overlay.id;

        return (
          <div
            key={overlay.id}
            className={`rounded-lg border transition-all ${
              isSelected
                ? 'bg-white/10 border-blue-500/40'
                : 'bg-white/5 border-white/10 hover:bg-white/8'
            }`}
          >
            <div className="flex items-center gap-1.5 px-2 py-2">
              <button
                onClick={() => setExpandedId(isExpanded ? null : overlay.id)}
                className="text-white/30 hover:text-white/60"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              <input
                type="color"
                value={overlay.color}
                onChange={(e) => onUpdateColor(overlay.id, e.target.value)}
                className="w-4 h-4 rounded cursor-pointer border-0 p-0 bg-transparent flex-shrink-0"
              />

              <button
                onClick={() => onSelect(overlay.id)}
                className="flex-1 text-left min-w-0"
              >
                <span className="text-xs font-medium text-white/90 truncate block">
                  {overlay.name}
                </span>
                <span className="text-[10px] text-white/40">
                  {formatArea(overlay.areaSqMi)}
                </span>
              </button>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => onToggleVisibility(overlay.id)}
                  className="p-1 text-white/30 hover:text-white/70 rounded"
                  title={overlay.visible ? 'Hide' : 'Show'}
                >
                  {overlay.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => onToggleLock(overlay.id)}
                  className="p-1 text-white/30 hover:text-white/70 rounded"
                  title={overlay.locked ? 'Unlock' : 'Lock position'}
                >
                  {overlay.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => onDuplicate(overlay.id)}
                  className="p-1 text-white/30 hover:text-white/70 rounded"
                  title="Duplicate"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onRemove(overlay.id)}
                  className="p-1 text-white/30 hover:text-red-400 rounded"
                  title="Remove"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-3 pb-2.5 space-y-2 border-t border-white/5 pt-2">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-white/40">Imperial</span>
                    <div className="text-white/80 font-mono">{formatArea(overlay.areaSqMi)}</div>
                  </div>
                  <div>
                    <span className="text-white/40">Metric</span>
                    <div className="text-white/80 font-mono">{formatAreaMetric(overlay.areaSqKm)}</div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 block mb-1">
                    Opacity: {Math.round(overlay.opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overlay.opacity * 100}
                    onChange={(e) => onUpdateOpacity(overlay.id, Number(e.target.value) / 100)}
                    className="w-full h-1 accent-blue-500"
                  />
                </div>

                {overlays.length >= 2 && (
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-white/40 block">Comparisons</span>
                    {overlays
                      .filter((o) => o.id !== overlay.id)
                      .map((other) => (
                        <div key={other.id} className="text-[11px] text-white/60">
                          {compareAreas(overlay, other)}
                        </div>
                      ))}
                    {overlays
                      .filter((o) => o.id !== overlay.id && o.areaSqMi > overlay.areaSqMi)
                      .map((larger) => (
                        <div key={`fit-${larger.id}`} className="text-[11px] text-blue-300/70">
                          {fitsInside(overlay, larger)}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
