import { Eye, EyeOff, Trash2, MapPin, MousePointerClick, RotateCcw, Download } from 'lucide-react';
import type { DetectionNode } from '../types';

interface Props {
  nodes: DetectionNode[];
  placingMode: boolean;
  onTogglePlacing: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<DetectionNode>) => void;
  onToggleVisibility: (id: string) => void;
  onClear: () => void;
  onReset: () => void;
}

export default function MarkerList({
  nodes,
  placingMode,
  onTogglePlacing,
  onRemove,
  onUpdate,
  onToggleVisibility,
  onClear,
  onReset,
}: Props) {
  return (
    <div>
      {/* Place mode toggle */}
      <button
        onClick={onTogglePlacing}
        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-all mb-3 ${
          placingMode
            ? 'bg-green-500/20 border border-green-500/40 text-green-300 animate-pulse'
            : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
        }`}
      >
        <MousePointerClick className="w-4 h-4" />
        {placingMode ? 'Click map to place node… (click again to stop)' : 'Place Detection Node'}
      </button>

      {/* Node list */}
      {nodes.length === 0 ? (
        <div className="text-center py-4 text-white/30">
          <MapPin className="w-5 h-5 mx-auto mb-1 opacity-50" />
          <p className="text-[11px]">No detection nodes placed</p>
          <button
            onClick={onReset}
            className="text-[11px] text-blue-400/60 hover:text-blue-300 transition-colors mt-1"
          >
            Load UF campus defaults
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {nodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-gray-950"
                style={{ backgroundColor: node.color }}
              />
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={node.name}
                  onChange={(e) => onUpdate(node.id, { name: e.target.value })}
                  className="bg-transparent text-xs text-white/90 font-medium outline-none w-full focus:text-white"
                />
                <div className="text-[10px] text-white/30 font-mono">
                  {node.lat.toFixed(5)}, {node.lng.toFixed(5)}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => onToggleVisibility(node.id)}
                  className="p-1 text-white/30 hover:text-white/70 rounded"
                >
                  {node.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => onRemove(node.id)}
                  className="p-1 text-white/30 hover:text-red-400 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {nodes.length > 0 && (
            <div className="space-y-1 mt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={onReset}
                  className="flex-1 flex items-center justify-center gap-1 text-[11px] text-white/30 hover:text-blue-300 transition-colors py-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset defaults
                </button>
                <button
                  onClick={onClear}
                  className="flex-1 text-[11px] text-white/30 hover:text-red-400 transition-colors py-1"
                >
                  Clear all
                </button>
              </div>
              <button
                onClick={() => {
                  const json = JSON.stringify(nodes, null, 2);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'detection-nodes.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="w-full flex items-center justify-center gap-1 text-[11px] text-white/30 hover:text-green-300 transition-colors py-1"
              >
                <Download className="w-3 h-3" />
                Export nodes JSON
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
