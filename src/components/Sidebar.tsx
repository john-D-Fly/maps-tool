import { useState } from 'react';
import {
  Layers, Sparkles, ChevronDown, ChevronRight, Trash2, Globe2, Radio, Shield, PanelLeftClose,
} from 'lucide-react';
import type { MapOverlay, TileLayerOption, DetectionNode, CoverageTier } from '../types';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { ComparisonCenter } from '../hooks/useOverlays';
import SearchBar from './SearchBar';
import PresetGrid from './PresetGrid';
import LayerList from './LayerList';
import MarkerList from './MarkerList';
import ComparisonPanel from './ComparisonPanel';
import ComparisonCenterPanel from './ComparisonCenterPanel';
import TileSelector from './TileSelector';
import ExportButton from './ExportButton';
import CoveragePanel from './CoveragePanel';
import PasswordGate from './PasswordGate';

interface Props {
  overlays: MapOverlay[];
  selectedId: string | null;
  tileLayer: TileLayerOption;
  comparisonCenter: ComparisonCenter;
  autoCenter: boolean;
  nodes: DetectionNode[];
  placingMode: boolean;
  onAddOverlay: (name: string, feature: Feature<Polygon | MultiPolygon>) => void;
  onSelectOverlay: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRemoveOverlay: (id: string) => void;
  onDuplicateOverlay: (id: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateOpacity: (id: string, opacity: number) => void;
  onSetTileLayer: (layer: TileLayerOption) => void;
  onClearAll: () => void;
  onChangeCenter: (center: ComparisonCenter, restackExisting: boolean) => void;
  onStackAll: () => void;
  onSetAutoCenter: (v: boolean) => void;
  onTogglePlacing: () => void;
  onRemoveNode: (id: string) => void;
  onUpdateNode: (id: string, updates: Partial<DetectionNode>) => void;
  onToggleNodeVisibility: (id: string) => void;
  onClearNodes: () => void;
  onResetNodes: () => void;
  coverageTiers: CoverageTier[];
  showCoverage: boolean;
  onToggleCoverage: () => void;
  onToggleTier: (id: string) => void;
  authAuthenticated: boolean;
  authHasPassword: boolean;
  onAuthVerify: (password: string) => Promise<boolean>;
  onAuthLogout: () => void;
  onOpenPrivate: () => void;
  onCollapse: () => void;
}

export default function Sidebar({
  overlays,
  selectedId,
  tileLayer,
  comparisonCenter,
  autoCenter,
  nodes,
  placingMode,
  onAddOverlay,
  onSelectOverlay,
  onToggleVisibility,
  onToggleLock,
  onRemoveOverlay,
  onDuplicateOverlay,
  onUpdateColor,
  onUpdateOpacity,
  onSetTileLayer,
  onClearAll,
  onChangeCenter,
  onStackAll,
  onSetAutoCenter,
  onTogglePlacing,
  onRemoveNode,
  onUpdateNode,
  onToggleNodeVisibility,
  onClearNodes,
  onResetNodes,
  coverageTiers,
  showCoverage,
  onToggleCoverage,
  onToggleTier,
  authAuthenticated,
  authHasPassword,
  onAuthVerify,
  onAuthLogout,
  onOpenPrivate,
  onCollapse,
}: Props) {
  const [presetsOpen, setPresetsOpen] = useState(true);
  const [nodesOpen, setNodesOpen] = useState(true);
  const [coverageOpen, setCoverageOpen] = useState(true);

  return (
    <aside className="w-80 h-full bg-gray-950/95 backdrop-blur-xl border-r border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Globe2 className="w-5 h-5 text-blue-400" />
          <h1 className="text-base font-bold text-white tracking-tight">MAPS</h1>
          <span className="text-[10px] text-white/30 ml-auto mr-1">v1.0</span>
          <PasswordGate
            authenticated={authAuthenticated}
            hasPassword={authHasPassword}
            onVerify={onAuthVerify}
            onLogout={onAuthLogout}
            onOpenPrivate={onOpenPrivate}
          />
          <button
            onClick={onCollapse}
            className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
            title="Collapse panel"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <SearchBar onAdd={onAddOverlay} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Comparison Center */}
        <div className="border-b border-white/10 px-4 py-4">
          <ComparisonCenterPanel
            center={comparisonCenter}
            autoCenter={autoCenter}
            hasOverlays={overlays.length > 0}
            onChangeCenter={onChangeCenter}
            onStackAll={onStackAll}
            onSetAutoCenter={onSetAutoCenter}
          />
        </div>

        {/* Detection Nodes */}
        <div className="border-b border-white/10">
          <button
            onClick={() => setNodesOpen(!nodesOpen)}
            className="flex items-center gap-2 w-full px-4 py-3 text-xs font-semibold text-white/60 uppercase tracking-wider hover:text-white/80 transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-green-400" />
            Detection Nodes
            <span className="text-[10px] text-white/30 ml-1">{nodes.length}</span>
            {placingMode && (
              <span className="ml-auto text-[9px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full">
                PLACING
              </span>
            )}
            <span className={placingMode ? '' : 'ml-auto'}>
              {nodesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          </button>
          {nodesOpen && (
            <div className="px-4 pb-4">
              <MarkerList
                nodes={nodes}
                placingMode={placingMode}
                onTogglePlacing={onTogglePlacing}
                onRemove={onRemoveNode}
                onUpdate={onUpdateNode}
                onToggleVisibility={onToggleNodeVisibility}
                onClear={onClearNodes}
                onReset={onResetNodes}
              />
            </div>
          )}
        </div>

        {/* Coverage Map */}
        <div className="border-b border-white/10">
          <button
            onClick={() => setCoverageOpen(!coverageOpen)}
            className="flex items-center gap-2 w-full px-4 py-3 text-xs font-semibold text-white/60 uppercase tracking-wider hover:text-white/80 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Altitude Coverage
            {showCoverage && (
              <span className="ml-auto mr-1 text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                ACTIVE
              </span>
            )}
            <span className={showCoverage ? '' : 'ml-auto'}>
              {coverageOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          </button>
          {coverageOpen && (
            <div className="px-4 pb-4">
              <CoveragePanel
                tiers={coverageTiers}
                showCoverage={showCoverage}
                onToggleCoverage={onToggleCoverage}
                onToggleTier={onToggleTier}
              />
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="border-b border-white/10">
          <button
            onClick={() => setPresetsOpen(!presetsOpen)}
            className="flex items-center gap-2 w-full px-4 py-3 text-xs font-semibold text-white/60 uppercase tracking-wider hover:text-white/80 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Quick Add
            <span className="ml-auto">
              {presetsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          </button>
          {presetsOpen && (
            <div className="px-4 pb-4">
              <PresetGrid
                onAdd={onAddOverlay}
                existingNames={overlays.map((o) => o.originalName)}
              />
            </div>
          )}
        </div>

        {/* Layers */}
        <div className="border-b border-white/10">
          <div className="flex items-center gap-2 px-4 py-3">
            <Layers className="w-3.5 h-3.5 text-white/60" />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Layers
            </span>
            <span className="text-[10px] text-white/30 ml-1">{overlays.length}</span>
            {overlays.length > 0 && (
              <button
                onClick={onClearAll}
                className="ml-auto text-white/30 hover:text-red-400 transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="px-4 pb-4">
            <LayerList
              overlays={overlays}
              selectedId={selectedId}
              onSelect={onSelectOverlay}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onRemove={onRemoveOverlay}
              onDuplicate={onDuplicateOverlay}
              onUpdateColor={onUpdateColor}
              onUpdateOpacity={onUpdateOpacity}
            />
          </div>
        </div>

        {/* Comparison */}
        {overlays.length >= 2 && (
          <div className="border-b border-white/10 px-4 py-4">
            <ComparisonPanel overlays={overlays} />
          </div>
        )}

        {/* Export + Map Style */}
        <div className="px-4 py-4 space-y-3">
          <TileSelector current={tileLayer} onChange={onSetTileLayer} />
          <ExportButton overlays={overlays} />
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 text-center">
        <p className="text-[10px] text-white/20">
          Overlays auto-stack at comparison center · Click map to place detection nodes
        </p>
      </div>
    </aside>
  );
}
