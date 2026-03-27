import { useState, useCallback, useEffect } from 'react';
import type { DetectionNode } from '../types';
import { NODE_COLORS } from '../types';

const STORAGE_KEY = 'maps-detection-nodes';

const DEFAULT_NODES: DetectionNode[] = [
  { id: 'node-bhg',     name: 'Ben Hill Griffin Stadium',    lat: 29.6500, lng: -82.3486, color: NODE_COLORS[0], visible: true },
  { id: 'node-oconnell', name: 'O\'Connell Center',          lat: 29.6498, lng: -82.3514, color: NODE_COLORS[1], visible: true },
  { id: 'node-reitz',   name: 'Reitz Union',                 lat: 29.6462, lng: -82.3478, color: NODE_COLORS[2], visible: true },
  { id: 'node-libwest',  name: 'Library West',                lat: 29.6510, lng: -82.3432, color: NODE_COLORS[3], visible: true },
  { id: 'node-century',  name: 'Century Tower',               lat: 29.6491, lng: -82.3430, color: NODE_COLORS[4], visible: true },
  { id: 'node-marston',  name: 'Marston Science Library',     lat: 29.6484, lng: -82.3445, color: NODE_COLORS[5], visible: true },
  { id: 'node-turling',  name: 'Turlington Hall',             lat: 29.6490, lng: -82.3452, color: NODE_COLORS[6], visible: true },
  { id: 'node-swrec',    name: 'Southwest Rec Center',        lat: 29.6418, lng: -82.3503, color: NODE_COLORS[7], visible: true },
  { id: 'node-heavener', name: 'Heavener Hall',               lat: 29.6510, lng: -82.3462, color: NODE_COLORS[8], visible: true },
  { id: 'node-newell',   name: 'Newell Hall',                 lat: 29.6478, lng: -82.3420, color: NODE_COLORS[9], visible: true },
];

function loadFromStorage(): DetectionNode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NODES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_NODES;
  } catch {
    return DEFAULT_NODES;
  }
}

function saveToStorage(nodes: DetectionNode[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
  } catch { /* quota exceeded, ignore */ }
}

let nodeIndex = 0;

export function useMarkers() {
  const [nodes, setNodes] = useState<DetectionNode[]>(() => {
    const loaded = loadFromStorage();
    nodeIndex = loaded.length;
    return loaded;
  });
  const [placingMode, setPlacingMode] = useState(false);

  useEffect(() => {
    saveToStorage(nodes);
  }, [nodes]);

  const addNode = useCallback((lat: number, lng: number) => {
    const idx = nodeIndex++;
    const node: DetectionNode = {
      id: crypto.randomUUID(),
      name: `Node ${idx + 1}`,
      lat,
      lng,
      color: NODE_COLORS[idx % NODE_COLORS.length],
      visible: true,
    };
    setNodes((prev) => [...prev, node]);
    return node;
  }, []);

  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<DetectionNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  }, []);

  const toggleNodeVisibility = useCallback((id: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, visible: !n.visible } : n)));
  }, []);

  const clearNodes = useCallback(() => {
    setNodes([]);
    nodeIndex = 0;
  }, []);

  const resetNodes = useCallback(() => {
    setNodes(DEFAULT_NODES);
    nodeIndex = DEFAULT_NODES.length;
  }, []);

  const togglePlacingMode = useCallback(() => {
    setPlacingMode((prev) => !prev);
  }, []);

  return {
    nodes,
    placingMode,
    setPlacingMode,
    togglePlacingMode,
    addNode,
    removeNode,
    updateNode,
    toggleNodeVisibility,
    clearNodes,
    resetNodes,
  };
}
