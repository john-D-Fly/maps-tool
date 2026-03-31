import type { ElevationGrid } from './elevationService';
import { getElevationAt } from './elevationService';

const FEET_TO_METERS = 0.3048;

export interface ViewshedResult {
  rows: number;
  cols: number;
  north: number;
  south: number;
  east: number;
  west: number;
  /** Per-cell count of how many nodes can see this cell */
  visibilityCount: Uint8Array;
  /** Total cells in the analysis area */
  totalCells: number;
  /** Cells visible by at least 1 node */
  visibleCells: number;
  /** Cells visible by at least N nodes (where N = overlap target) */
  overlapCells: number;
  coveragePct: number;
  overlapPct: number;
  overlapTarget: number;
}

interface NodePosition {
  lat: number;
  lng: number;
}

/**
 * Cast rays from a single observer across the elevation grid.
 * Uses the "maximum horizon angle" approach: along each radial,
 * track the steepest upward angle seen so far. A cell is visible
 * if the angle to the target altitude at that cell exceeds the
 * current maximum horizon angle.
 */
function singleNodeViewshed(
  node: NodePosition,
  grid: ElevationGrid,
  sensorHeightFt: number,
  targetAltFt: number,
  radiusMeters: number,
  outRows: number,
  outCols: number,
  outBounds: { north: number; south: number; east: number; west: number },
): Uint8Array {
  const visible = new Uint8Array(outRows * outCols);

  const groundElev = getElevationAt(grid, node.lat, node.lng);
  const sensorElev = groundElev + sensorHeightFt * FEET_TO_METERS;

  const midLat = (outBounds.north + outBounds.south) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;

  const cellLatStep = (outBounds.north - outBounds.south) / outRows;
  const cellLngStep = (outBounds.east - outBounds.west) / outCols;

  const numRays = 720;
  const angleStep = (2 * Math.PI) / numRays;
  const stepM = grid.resolutionMeters * 0.7;
  const maxSteps = Math.ceil(radiusMeters / stepM);

  for (let ray = 0; ray < numRays; ray++) {
    const angle = ray * angleStep;
    const dLatM = Math.cos(angle) * stepM;
    const dLngM = Math.sin(angle) * stepM;
    const dLat = dLatM / mPerDegLat;
    const dLng = dLngM / mPerDegLng;

    let maxAngle = -Infinity;
    let curLat = node.lat;
    let curLng = node.lng;

    for (let s = 1; s <= maxSteps; s++) {
      curLat += dLat;
      curLng += dLng;

      if (
        curLat < outBounds.south || curLat > outBounds.north ||
        curLng < outBounds.west || curLng > outBounds.east
      ) break;

      const distM = s * stepM;
      if (distM > radiusMeters) break;

      const terrainElev = getElevationAt(grid, curLat, curLng);
      const terrainAngle = Math.atan2(terrainElev - sensorElev, distM);

      if (terrainAngle > maxAngle) {
        maxAngle = terrainAngle;
      }

      const targetElev = terrainElev + targetAltFt * FEET_TO_METERS;
      const targetAngle = Math.atan2(targetElev - sensorElev, distM);

      if (targetAngle >= maxAngle) {
        const row = Math.floor((outBounds.north - curLat) / cellLatStep);
        const col = Math.floor((curLng - outBounds.west) / cellLngStep);
        if (row >= 0 && row < outRows && col >= 0 && col < outCols) {
          visible[row * outCols + col] = 1;
        }
      }
    }
  }

  return visible;
}

export function computeViewshed(
  nodes: NodePosition[],
  grid: ElevationGrid,
  sensorHeightFt: number,
  targetAltFt: number,
  radiusMiles: number,
  overlapTarget: number,
  analysisRows?: number,
  analysisCols?: number,
): ViewshedResult {
  const radiusMeters = radiusMiles * 1609.34;

  const bounds = { ...grid.bounds };
  const rows = analysisRows ?? grid.rows;
  const cols = analysisCols ?? grid.cols;

  const visibilityCount = new Uint8Array(rows * cols);

  for (const node of nodes) {
    const single = singleNodeViewshed(
      node, grid, sensorHeightFt, targetAltFt,
      radiusMeters, rows, cols, bounds,
    );
    for (let i = 0; i < single.length; i++) {
      if (single[i] && visibilityCount[i] < 255) {
        visibilityCount[i]++;
      }
    }
  }

  let visibleCells = 0;
  let overlapCells = 0;
  const totalCells = rows * cols;

  for (let i = 0; i < totalCells; i++) {
    if (visibilityCount[i] >= 1) visibleCells++;
    if (visibilityCount[i] >= overlapTarget) overlapCells++;
  }

  return {
    rows,
    cols,
    north: bounds.north,
    south: bounds.south,
    east: bounds.east,
    west: bounds.west,
    visibilityCount,
    totalCells,
    visibleCells,
    overlapCells,
    coveragePct: totalCells > 0 ? (visibleCells / totalCells) * 100 : 0,
    overlapPct: totalCells > 0 ? (overlapCells / totalCells) * 100 : 0,
    overlapTarget,
  };
}
