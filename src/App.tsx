import { useRef, useState, useCallback, useEffect } from 'react';
import L from 'leaflet';
import { PanelLeftOpen } from 'lucide-react';
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
import type { ViewshedResult } from './lib/viewshed';
import { useAuth } from './hooks/useAuth';
import PrivatePage from './components/PrivatePage';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export default function App() {
  const { authenticated, hasPassword, verify, logout } = useAuth();
  const [view, setView] = useState<'map' | 'private'>('map');
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [isMobile]);

  const handleOpenPrivate = useCallback(() => setView('private'), []);
  const handleBackToMap = useCallback(() => setView('map'), []);

  if (view === 'private' && authenticated) {
    return <PrivatePage onBack={handleBackToMap} />;
  }

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
  const [viewshedData, setViewshedData] = useState<ViewshedResult | null>(null);

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
      <div
        className={`transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-80 min-w-[20rem]' : 'w-0 min-w-0'
        } overflow-hidden flex-shrink-0`}
      >
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
          authAuthenticated={authenticated}
          authHasPassword={hasPassword}
          onAuthVerify={verify}
          onAuthLogout={logout}
          onOpenPrivate={handleOpenPrivate}
          onCollapse={() => setSidebarOpen(false)}
        />
      </div>

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-[1000] p-2 rounded-lg bg-gray-900/90 backdrop-blur-md border border-white/20 text-white/70 hover:text-white hover:bg-gray-800/90 transition-all shadow-xl"
          title="Open panel"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

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
          viewshedData={viewshedData}
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
          onViewshedChange={setViewshedData}
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
