import { useState, useCallback } from 'react';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { MapOverlay, TileLayerOption } from '../types';
import { createOverlay, getCentroid } from '../lib/geo';

export interface ComparisonCenter {
  lat: number;
  lng: number;
  name: string;
}

const DEFAULT_CENTER: ComparisonCenter = {
  lat: 29.6500,
  lng: -82.3486,
  name: 'Ben Hill Griffin Stadium',
};

function calcOffsetToCenter(
  feature: Feature<Polygon | MultiPolygon>,
  center: ComparisonCenter
): { offsetLat: number; offsetLng: number } {
  const [cLng, cLat] = getCentroid(feature);
  return {
    offsetLat: center.lat - cLat,
    offsetLng: center.lng - cLng,
  };
}

export function useOverlays() {
  const [overlays, setOverlays] = useState<MapOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tileLayer, setTileLayer] = useState<TileLayerOption>('dark');
  const [comparisonCenter, setComparisonCenter] = useState<ComparisonCenter>(DEFAULT_CENTER);
  const [autoCenter, setAutoCenter] = useState(true);

  const addOverlayWithCenter = useCallback(
    (name: string, feature: Feature<Polygon | MultiPolygon>, color?: string) => {
      const overlay = createOverlay(name, feature, color);
      if (autoCenter) {
        const { offsetLat, offsetLng } = calcOffsetToCenter(feature, comparisonCenter);
        overlay.offsetLat = offsetLat;
        overlay.offsetLng = offsetLng;
      }
      setOverlays((prev) => [...prev, overlay]);
      setSelectedId(overlay.id);
      return overlay;
    },
    [autoCenter, comparisonCenter]
  );

  // Direct add: explicit offset, no auto-center. Used by animations.
  const addOverlayDirect = useCallback(
    (
      name: string,
      feature: Feature<Polygon | MultiPolygon>,
      opts?: { color?: string; offsetLat?: number; offsetLng?: number; opacity?: number }
    ): MapOverlay => {
      const overlay = createOverlay(name, feature, opts?.color);
      if (opts?.offsetLat !== undefined) overlay.offsetLat = opts.offsetLat;
      if (opts?.offsetLng !== undefined) overlay.offsetLng = opts.offsetLng;
      if (opts?.opacity !== undefined) overlay.opacity = opts.opacity;
      setOverlays((prev) => [...prev, overlay]);
      return overlay;
    },
    []
  );

  // Set absolute offset on an overlay. Used by animations.
  const setOverlayOffset = useCallback(
    (id: string, offsetLat: number, offsetLng: number) => {
      setOverlays((prev) =>
        prev.map((o) => (o.id === id ? { ...o, offsetLat, offsetLng } : o))
      );
    },
    []
  );

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const updateOverlay = useCallback((id: string, updates: Partial<MapOverlay>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o)));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, locked: !o.locked } : o)));
  }, []);

  const moveOverlay = useCallback((id: string, dLat: number, dLng: number) => {
    setOverlays((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, offsetLat: o.offsetLat + dLat, offsetLng: o.offsetLng + dLng }
          : o
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    setOverlays([]);
    setSelectedId(null);
  }, []);

  const duplicateOverlay = useCallback((id: string) => {
    setOverlays((prev) => {
      const source = prev.find((o) => o.id === id);
      if (!source) return prev;
      const copy = createOverlay(`${source.originalName} (copy)`, source.feature);
      copy.offsetLat = source.offsetLat + 2;
      copy.offsetLng = source.offsetLng + 2;
      return [...prev, copy];
    });
  }, []);

  const stackAllAtCenter = useCallback(
    (center?: ComparisonCenter) => {
      const target = center ?? comparisonCenter;
      setOverlays((prev) =>
        prev.map((o) => {
          const { offsetLat, offsetLng } = calcOffsetToCenter(o.feature, target);
          return { ...o, offsetLat, offsetLng };
        })
      );
      if (center) setComparisonCenter(center);
    },
    [comparisonCenter]
  );

  const changeCenter = useCallback(
    (center: ComparisonCenter, restackExisting: boolean) => {
      setComparisonCenter(center);
      if (restackExisting) {
        setOverlays((prev) =>
          prev.map((o) => {
            const { offsetLat, offsetLng } = calcOffsetToCenter(o.feature, center);
            return { ...o, offsetLat, offsetLng };
          })
        );
      }
    },
    []
  );

  return {
    overlays,
    selectedId,
    tileLayer,
    comparisonCenter,
    autoCenter,
    setSelectedId,
    setTileLayer,
    setAutoCenter,
    addOverlay: addOverlayWithCenter,
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
  };
}
