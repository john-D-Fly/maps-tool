import { useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import FlagshipAnimation from './components/FlagshipAnimation';
import { useOverlays } from './hooks/useOverlays';
import { useMarkers } from './hooks/useMarkers';
import type { CoverageTier } from './types';
import { DEFAULT_COVERAGE_TIERS } from './types';
import CoverageSimulator from './components/CoverageSimulator';
import SeasonSimulator from './components/SeasonSimulator';
import type { SeasonSimData } from './lib/seasonGenerator';

export default function App() {
  const {
    overlays,
    selectedId,
    tileLayer,
    comparisonCenter,
    autoCenter,
    setSelectedId,
    setTileLayer,
    setAutoCenter,
    addOverlay,
    addOverlayDirect,
    setOverlayOffset,
    removeOverlay,
    updateOverlay,
    toggleVisibility,
    toggleLock,
    moveOverlay,
    clearAll,
    duplicateOverlay,
    stackAllAtCenter,
    changeCenter,
  } = useOverlays();

  const {
    nodes,
    placingMode,
    togglePlacingMode,
    addNode,
    removeNode,
    updateNode,
    toggleNodeVisibility,
    clearNodes,
    resetNodes,
  } = useMarkers();

  const [showCoverage, setShowCoverage] = useState(false);
  const [nodesHidden, setNodesHidden] = useState(false);
  const [coverageTiers, setCoverageTiers] = useState<CoverageTier[]>(DEFAULT_COVERAGE_TIERS);
  const [showDroneAnim, setShowDroneAnim] = useState(false);
  const [seasonData, setSeasonData] = useState<SeasonSimData | null>(null);

  const toggleCoverage = useCallback(() => setShowCoverage((v) => !v), []);
  const toggleTier = useCallback((id: string) => {
    setCoverageTiers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)),
    );
  }, []);

  const handleLoadSeason = useCallback((data: SeasonSimData) => {
    setSeasonData(data);
    setShowDroneAnim(true);
  }, []);

  const handleClearSeason = useCallback(() => {
    setSeasonData(null);
    setShowDroneAnim(false);
  }, []);

  const mapRef = useRef<L.Map | null>(null);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  return (
    <div className="flex h-screen w-screen bg-gray-950">
      <Sidebar
        overlays={overlays}
        selectedId={selectedId}
        tileLayer={tileLayer}
        comparisonCenter={comparisonCenter}
        autoCenter={autoCenter}
        nodes={nodes}
        placingMode={placingMode}
        onAddOverlay={addOverlay}
        onSelectOverlay={setSelectedId}
        onToggleVisibility={toggleVisibility}
        onToggleLock={toggleLock}
        onRemoveOverlay={removeOverlay}
        onDuplicateOverlay={duplicateOverlay}
        onUpdateColor={(id, color) => updateOverlay(id, { color })}
        onUpdateOpacity={(id, opacity) => updateOverlay(id, { opacity })}
        onSetTileLayer={setTileLayer}
        onClearAll={clearAll}
        onChangeCenter={changeCenter}
        onStackAll={stackAllAtCenter}
        onSetAutoCenter={setAutoCenter}
        onTogglePlacing={togglePlacingMode}
        onRemoveNode={removeNode}
        onUpdateNode={updateNode}
        onToggleNodeVisibility={toggleNodeVisibility}
        onClearNodes={clearNodes}
        onResetNodes={resetNodes}
        coverageTiers={coverageTiers}
        showCoverage={showCoverage}
        onToggleCoverage={toggleCoverage}
        onToggleTier={toggleTier}
      />
      <main className="flex-1 relative">
        <MapView
          overlays={overlays}
          selectedId={selectedId}
          tileLayer={tileLayer}
          comparisonCenter={comparisonCenter}
          autoCenter={autoCenter}
          nodes={nodes}
          placingMode={placingMode}
          onSelect={setSelectedId}
          onMove={moveOverlay}
          onMapReady={handleMapReady}
          onPlaceNode={addNode}
          coverageTiers={coverageTiers}
          showCoverage={showCoverage}
          nodesHidden={nodesHidden}
          showDroneAnim={showDroneAnim}
          droneData={seasonData}
        />
        <FlagshipAnimation
          mapRef={mapRef}
          nodes={nodes}
          addOverlayDirect={addOverlayDirect}
          setOverlayOffset={setOverlayOffset}
          updateOverlay={updateOverlay}
          removeOverlay={removeOverlay}
          clearAll={clearAll}
          setAutoCenter={setAutoCenter}
          setNodesHidden={setNodesHidden}
        />
        <CoverageSimulator
          mapRef={mapRef}
          currentNodeCount={nodes.length}
          coverageRadiusMiles={coverageTiers[0]?.radiusMiles ?? 2}
        />
        <SeasonSimulator
          onLoadSeason={handleLoadSeason}
          onClear={handleClearSeason}
          isActive={showDroneAnim && !!seasonData}
        />
      </main>
    </div>
  );
}
