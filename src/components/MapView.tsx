import { useRef, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Circle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { MapOverlay, TileLayerOption, DetectionNode, CoverageTier } from '../types';
import { TILE_LAYERS } from '../types';
import { translateFeature, getCentroid, formatArea } from '../lib/geo';
import type { ComparisonCenter } from '../hooks/useOverlays';
import CoverageOverlay from './CoverageOverlay';
import ViewshedOverlay from './ViewshedOverlay';
import DroneAnimation, { type AnimData } from './DroneAnimation';
import type { ViewshedResult } from '../lib/viewshed';

function MapRefCallback({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMapReady(map); }, [map, onMapReady]);
  return null;
}

const centerIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:20px;height:20px;
    border:2px solid rgba(59,130,246,0.8);
    border-radius:50%;
    background:rgba(59,130,246,0.15);
    display:flex;align-items:center;justify-content:center;
  "><div style="width:4px;height:4px;border-radius:50%;background:rgba(59,130,246,0.9)"></div></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function makeOverlayLabel(name: string, areaSqMi: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'overlay-label',
    html: `<div class="overlay-label-inner">
      <span class="overlay-label-name" style="color:${color}">${name}</span>
      <span class="overlay-label-area">${formatArea(areaSqMi)}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function makeNodeIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="detection-node-marker">
      <div class="detection-node-dot" style="background:${color};box-shadow:0 0 8px ${color}"></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const ONE_MILE_METERS = 1609.34;

interface Props {
  overlays: MapOverlay[];
  selectedId: string | null;
  tileLayer: TileLayerOption;
  comparisonCenter: ComparisonCenter;
  autoCenter: boolean;
  nodes: DetectionNode[];
  placingMode: boolean;
  coverageTiers: CoverageTier[];
  showCoverage: boolean;
  nodesHidden?: boolean;
  showDroneAnim?: boolean;
  droneData?: unknown;
  viewshedData?: ViewshedResult | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, dLat: number, dLng: number) => void;
  onMapReady?: (map: L.Map) => void;
  onPlaceNode?: (lat: number, lng: number) => void;
}

function TileLayerSwitcher({ tileLayer }: { tileLayer: TileLayerOption }) {
  const config = TILE_LAYERS[tileLayer];
  return <TileLayer key={tileLayer} url={config.url} attribution={config.attribution} />;
}

function OverlayLabel({ overlay }: { overlay: MapOverlay }) {
  const translated = useMemo(
    () => translateFeature(overlay.feature, overlay.offsetLat, overlay.offsetLng),
    [overlay.feature, overlay.offsetLat, overlay.offsetLng]
  );

  const [cLng, cLat] = useMemo(() => getCentroid(translated), [translated]);

  const icon = useMemo(
    () => makeOverlayLabel(overlay.name, overlay.areaSqMi, overlay.color),
    [overlay.name, overlay.areaSqMi, overlay.color]
  );

  if (!overlay.visible) return null;

  return (
    <Marker
      position={[cLat, cLng]}
      icon={icon}
      interactive={false}
    />
  );
}

function DetectionNodeMarker({ node }: { node: DetectionNode }) {
  const icon = useMemo(() => makeNodeIcon(node.color), [node.color]);

  if (!node.visible) return null;

  return (
    <>
      <Circle
        center={[node.lat, node.lng]}
        radius={ONE_MILE_METERS}
        pathOptions={{
          color: node.color,
          weight: 1.5,
          opacity: 0,
          fillColor: node.color,
          fillOpacity: 0,
          className: 'node-pulse-ring',
        }}
      />
      <Marker position={[node.lat, node.lng]} icon={icon}>
        <Tooltip direction="top" offset={[0, -16]} opacity={0.95} permanent={false}>
          <span style={{ fontWeight: 600, fontSize: 12 }}>{node.name}</span>
          <br />
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            {node.lat.toFixed(5)}, {node.lng.toFixed(5)}
          </span>
        </Tooltip>
      </Marker>
    </>
  );
}

function DraggableOverlay({
  overlay,
  isSelected,
  onSelect,
  onMove,
}: {
  overlay: MapOverlay;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (dLat: number, dLng: number) => void;
}) {
  const map = useMap();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const dragging = useRef(false);
  const lastLatLng = useRef<L.LatLng | null>(null);

  const translated = useMemo(
    () => translateFeature(overlay.feature, overlay.offsetLat, overlay.offsetLng),
    [overlay.feature, overlay.offsetLat, overlay.offsetLng]
  );

  useMapEvents({
    mousemove(e) {
      if (!dragging.current || !lastLatLng.current || overlay.locked) return;
      const dLat = e.latlng.lat - lastLatLng.current.lat;
      const dLng = e.latlng.lng - lastLatLng.current.lng;
      lastLatLng.current = e.latlng;
      onMove(dLat, dLng);
    },
    mouseup() {
      if (dragging.current) {
        dragging.current = false;
        lastLatLng.current = null;
        map.dragging.enable();
        map.getContainer().classList.remove('dragging-overlay');
      }
    },
  });

  if (!overlay.visible) return null;

  const weight = isSelected ? 3 : 2;
  const fillOpacity = overlay.opacity;
  const className = isSelected ? 'cutout-overlay cutout-selected' : 'cutout-overlay';

  return (
    <GeoJSON
      key={`${overlay.id}-${overlay.offsetLat}-${overlay.offsetLng}-${overlay.color}-${overlay.opacity}-${isSelected}`}
      ref={(el) => { geoJsonRef.current = el; }}
      data={translated}
      style={{
        color: 'rgba(255,255,255,0.7)',
        weight,
        fillColor: overlay.color,
        fillOpacity,
        className,
      }}
      eventHandlers={{
        click(e) {
          L.DomEvent.stopPropagation(e.originalEvent);
          onSelect();
        },
        mousedown(e) {
          if (overlay.locked) return;
          L.DomEvent.stopPropagation(e.originalEvent);
          dragging.current = true;
          lastLatLng.current = e.latlng;
          map.dragging.disable();
          map.getContainer().classList.add('dragging-overlay');
          onSelect();
        },
      }}
    >
    </GeoJSON>
  );
}

function ClickHandler({
  placingMode,
  onPlaceNode,
  onDeselect,
}: {
  placingMode: boolean;
  onPlaceNode?: (lat: number, lng: number) => void;
  onDeselect: () => void;
}) {
  useMapEvents({
    click(e) {
      if (placingMode && onPlaceNode) {
        onPlaceNode(e.latlng.lat, e.latlng.lng);
      } else {
        onDeselect();
      }
    },
  });
  return null;
}

function PlacingModeIndicator({ active }: { active: boolean }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (active) {
      container.classList.add('placing-mode');
    } else {
      container.classList.remove('placing-mode');
    }
    return () => container.classList.remove('placing-mode');
  }, [active, map]);

  return null;
}

export default function MapView({
  overlays,
  selectedId,
  tileLayer,
  comparisonCenter,
  autoCenter,
  nodes,
  placingMode,
  coverageTiers,
  showCoverage,
  nodesHidden,
  showDroneAnim,
  droneData,
  viewshedData,
  onSelect,
  onMove,
  onMapReady,
  onPlaceNode,
}: Props) {
  return (
    <MapContainer
      center={[comparisonCenter.lat, comparisonCenter.lng]}
      zoom={5}
      minZoom={2}
      maxZoom={18}
      zoomControl={false}
      worldCopyJump={true}
      style={{ height: '100%', width: '100%' }}
    >
      {onMapReady && <MapRefCallback onMapReady={onMapReady} />}
      <TileLayerSwitcher tileLayer={tileLayer} />
      <ClickHandler
        placingMode={placingMode}
        onPlaceNode={onPlaceNode}
        onDeselect={() => onSelect(null)}
      />
      <PlacingModeIndicator active={placingMode} />

      {autoCenter && (
        <Marker position={[comparisonCenter.lat, comparisonCenter.lng]} icon={centerIcon}>
          <Tooltip direction="top" offset={[0, -12]} opacity={0.9} permanent={false}>
            <span className="text-xs font-medium">{comparisonCenter.name}</span>
          </Tooltip>
        </Marker>
      )}

      {overlays.map((overlay) => (
        <DraggableOverlay
          key={overlay.id}
          overlay={overlay}
          isSelected={overlay.id === selectedId}
          onSelect={() => onSelect(overlay.id)}
          onMove={(dLat, dLng) => onMove(overlay.id, dLat, dLng)}
        />
      ))}

      {overlays.map((overlay) => (
        <OverlayLabel key={`label-${overlay.id}`} overlay={overlay} />
      ))}

      {showCoverage && !nodesHidden && (
        <CoverageOverlay nodes={nodes} tiers={coverageTiers} />
      )}

      <ViewshedOverlay viewshed={viewshedData ?? null} visible={!!viewshedData} />

      {!nodesHidden && nodes.map((node) => (
        <DetectionNodeMarker key={node.id} node={node} />
      ))}

      <DroneAnimation visible={!!showDroneAnim} externalData={droneData as AnimData | undefined} />
    </MapContainer>
  );
}
