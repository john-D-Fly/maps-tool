export interface HeightmapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface HeightmapData {
  bounds: HeightmapBounds;
  resolutionMeters: number;
  rows: number;
  cols: number;
  elevation: number[];
  stats: {
    minElevation: number;
    maxElevation: number;
    meanElevation: number;
  };
}

export interface BuildingMaskData {
  bounds: HeightmapBounds;
  rows: number;
  cols: number;
  mask: number[][];
  buildingCellCount: number;
}

export interface ElevationGrid {
  bounds: HeightmapBounds;
  rows: number;
  cols: number;
  data: Float32Array;
  resolutionMeters: number;
  stats: { min: number; max: number; mean: number };
  buildingMask: Uint8Array | null;
}

const heightmapCache = new Map<string, HeightmapData>();
const buildingCache = new Map<string, BuildingMaskData>();

const KNOWN_STATIC_AREAS: Record<string, HeightmapBounds> = {
  'uf-campus': { north: 29.658, south: 29.636, east: -82.335, west: -82.370 },
};

export function findStaticArea(
  bounds: HeightmapBounds,
): string | null {
  for (const [name, area] of Object.entries(KNOWN_STATIC_AREAS)) {
    if (
      bounds.south >= area.south - 0.002 &&
      bounds.north <= area.north + 0.002 &&
      bounds.west >= area.west - 0.002 &&
      bounds.east <= area.east + 0.002
    ) {
      return name;
    }
  }
  return null;
}

export async function loadStaticHeightmap(name: string): Promise<HeightmapData> {
  const cached = heightmapCache.get(name);
  if (cached) return cached;

  const base = import.meta.env.BASE_URL || '/';
  const resp = await fetch(`${base}lidar/${name}.json`);
  if (!resp.ok) throw new Error(`Failed to load heightmap: ${name} (${resp.status})`);

  const data: HeightmapData = await resp.json();
  heightmapCache.set(name, data);
  return data;
}

export async function loadBuildingMask(name: string): Promise<BuildingMaskData> {
  const cached = buildingCache.get(name);
  if (cached) return cached;

  const base = import.meta.env.BASE_URL || '/';
  const resp = await fetch(`${base}lidar/${name}-buildings.json`);
  if (!resp.ok) throw new Error(`Failed to load building mask: ${name} (${resp.status})`);

  const data: BuildingMaskData = await resp.json();
  buildingCache.set(name, data);
  return data;
}

function bilinearSample(
  grid: Float32Array, rows: number, cols: number,
  rowF: number, colF: number,
): number {
  const r0 = Math.floor(rowF);
  const c0 = Math.floor(colF);
  const r1 = Math.min(r0 + 1, rows - 1);
  const c1 = Math.min(c0 + 1, cols - 1);
  const dr = rowF - r0;
  const dc = colF - c0;

  const v00 = grid[r0 * cols + c0];
  const v01 = grid[r0 * cols + c1];
  const v10 = grid[r1 * cols + c0];
  const v11 = grid[r1 * cols + c1];

  return (
    v00 * (1 - dr) * (1 - dc) +
    v01 * (1 - dr) * dc +
    v10 * dr * (1 - dc) +
    v11 * dr * dc
  );
}

export function heightmapToGrid(hm: HeightmapData, bm: BuildingMaskData | null): ElevationGrid {
  const data = new Float32Array(hm.elevation);
  let buildingMask: Uint8Array | null = null;

  if (bm) {
    buildingMask = new Uint8Array(hm.rows * hm.cols);
    for (let r = 0; r < bm.rows && r < hm.rows; r++) {
      for (let c = 0; c < bm.cols && c < hm.cols; c++) {
        buildingMask[r * hm.cols + c] = bm.mask[r]?.[c] ?? 0;
      }
    }
  }

  return {
    bounds: hm.bounds,
    rows: hm.rows,
    cols: hm.cols,
    data,
    resolutionMeters: hm.resolutionMeters,
    stats: { min: hm.stats.minElevation, max: hm.stats.maxElevation, mean: hm.stats.meanElevation },
    buildingMask,
  };
}

export function getElevationAt(grid: ElevationGrid, lat: number, lng: number): number {
  const { bounds, rows, cols, data } = grid;
  const rowF = ((bounds.north - lat) / (bounds.north - bounds.south)) * (rows - 1);
  const colF = ((lng - bounds.west) / (bounds.east - bounds.west)) * (cols - 1);

  if (rowF < 0 || rowF >= rows || colF < 0 || colF >= cols) {
    return grid.stats.mean;
  }

  return bilinearSample(data, rows, cols, rowF, colF);
}

const USGS_3DEP_URL =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/identify';

export async function fetchElevationFromAPI(lat: number, lng: number): Promise<number> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    returnGeometry: 'false',
    returnCatalogItems: 'false',
    f: 'json',
  });

  const resp = await fetch(`${USGS_3DEP_URL}?${params}`);
  if (!resp.ok) throw new Error(`3DEP API error: ${resp.status}`);

  const json = await resp.json();
  const val = json?.value;
  if (typeof val === 'string' && val !== 'NoData') return parseFloat(val);
  if (typeof val === 'number') return val;
  return 0;
}

export async function buildElevationGridFromAPI(
  bounds: HeightmapBounds,
  resolutionMeters: number,
): Promise<ElevationGrid> {
  const midLat = (bounds.north + bounds.south) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const latSpanM = (bounds.north - bounds.south) * 111320;
  const lngSpanM = (bounds.east - bounds.west) * 111320 * cosLat;
  const rows = Math.max(2, Math.round(latSpanM / resolutionMeters));
  const cols = Math.max(2, Math.round(lngSpanM / resolutionMeters));

  const capped = Math.min(rows * cols, 2500);
  const actualRows = Math.min(rows, Math.round(Math.sqrt(capped * (rows / cols))));
  const actualCols = Math.min(cols, Math.round(Math.sqrt(capped * (cols / rows))));

  const data = new Float32Array(actualRows * actualCols);
  const latStep = (bounds.north - bounds.south) / (actualRows - 1);
  const lngStep = (bounds.east - bounds.west) / (actualCols - 1);

  const batchSize = 10;
  const promises: Promise<void>[] = [];

  for (let r = 0; r < actualRows; r++) {
    for (let c = 0; c < actualCols; c++) {
      const idx = r * actualCols + c;
      const lat = bounds.north - r * latStep;
      const lng = bounds.west + c * lngStep;
      const p = fetchElevationFromAPI(lat, lng)
        .then((elev) => { data[idx] = elev; })
        .catch(() => { data[idx] = 0; });
      promises.push(p);

      if (promises.length >= batchSize) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
  }
  if (promises.length > 0) await Promise.all(promises);

  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
    sum += data[i];
  }

  return {
    bounds,
    rows: actualRows,
    cols: actualCols,
    data,
    resolutionMeters,
    stats: { min, max, mean: sum / data.length },
    buildingMask: null,
  };
}
