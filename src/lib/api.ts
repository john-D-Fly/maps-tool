import type { Feature, Polygon, MultiPolygon, FeatureCollection } from 'geojson';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  type: string;
  class: string;
  geojson?: Feature['geometry'];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastNominatimCall = 0;

async function throttledNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimCall;
  if (timeSinceLast < 1100) {
    await delay(1100 - timeSinceLast);
  }
  lastNominatimCall = Date.now();
  return fn();
}

export async function searchPlaces(query: string): Promise<NominatimResult[]> {
  return throttledNominatim(async () => {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      polygon_geojson: '1',
      limit: '8',
    });

    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { 'User-Agent': 'MAPS-Comparison-Tool/1.0' },
    });

    if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
    return res.json();
  });
}

const BOUNDARY_CACHE_PREFIX = 'maps-boundary-';

function getCachedBoundary(cacheKey: string): Feature<Polygon | MultiPolygon> | null {
  try {
    const raw = localStorage.getItem(BOUNDARY_CACHE_PREFIX + cacheKey);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt cache, ignore */ }
  return null;
}

function setCachedBoundary(cacheKey: string, feature: Feature<Polygon | MultiPolygon>) {
  try {
    localStorage.setItem(BOUNDARY_CACHE_PREFIX + cacheKey, JSON.stringify(feature));
  } catch { /* quota exceeded, ignore */ }
}

export async function fetchBoundaryByOsmId(
  osmType: 'relation' | 'way' | 'node',
  osmId: number
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const cacheKey = `${osmType}-${osmId}`;
  const cached = getCachedBoundary(cacheKey);
  if (cached) return cached;

  const typePrefix = osmType === 'relation' ? 'R' : osmType === 'way' ? 'W' : 'N';

  return throttledNominatim(async () => {
    const params = new URLSearchParams({
      osm_ids: `${typePrefix}${osmId}`,
      format: 'json',
      polygon_geojson: '1',
    });

    const res = await fetch(`${NOMINATIM_URL}/lookup?${params}`, {
      headers: { 'User-Agent': 'MAPS-Comparison-Tool/1.0' },
    });

    if (!res.ok) throw new Error(`Nominatim lookup failed: ${res.status}`);
    const results: NominatimResult[] = await res.json();

    if (results.length === 0 || !results[0].geojson) return null;

    const geom = results[0].geojson;
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return null;

    const feature: Feature<Polygon | MultiPolygon> = {
      type: 'Feature',
      properties: { name: results[0].display_name },
      geometry: geom as Polygon | MultiPolygon,
    };
    setCachedBoundary(cacheKey, feature);
    return feature;
  });
}

export async function fetchBoundaryOverpass(
  osmId: number
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const query = `
    [out:json][timeout:30];
    relation(${osmId});
    out geom;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) throw new Error(`Overpass query failed: ${res.status}`);
  const data = await res.json();

  if (!data.elements || data.elements.length === 0) return null;

  const relation = data.elements[0];
  if (!relation.members) return null;

  const outerRings: [number, number][][] = [];
  for (const member of relation.members) {
    if (member.type === 'way' && member.role === 'outer' && member.geometry) {
      const ring: [number, number][] = member.geometry.map(
        (pt: { lat: number; lon: number }) => [pt.lon, pt.lat]
      );
      outerRings.push(ring);
    }
  }

  if (outerRings.length === 0) return null;

  const mergedRings = mergeRings(outerRings);

  if (mergedRings.length === 1) {
    return {
      type: 'Feature',
      properties: { name: relation.tags?.name ?? `Relation ${osmId}` },
      geometry: { type: 'Polygon', coordinates: [mergedRings[0]] },
    };
  }

  return {
    type: 'Feature',
    properties: { name: relation.tags?.name ?? `Relation ${osmId}` },
    geometry: {
      type: 'MultiPolygon',
      coordinates: mergedRings.map((ring) => [ring]),
    },
  };
}

function mergeRings(rings: [number, number][][]): [number, number][][] {
  if (rings.length <= 1) return rings;

  const merged: [number, number][][] = [];
  const used = new Set<number>();

  for (let i = 0; i < rings.length; i++) {
    if (used.has(i)) continue;

    let current = [...rings[i]];
    used.add(i);
    let changed = true;

    while (changed) {
      changed = false;
      for (let j = 0; j < rings.length; j++) {
        if (used.has(j)) continue;

        const ring = rings[j];
        const currentEnd = current[current.length - 1];
        const ringStart = ring[0];
        const ringEnd = ring[ring.length - 1];

        if (closeEnough(currentEnd, ringStart)) {
          current = current.concat(ring.slice(1));
          used.add(j);
          changed = true;
        } else if (closeEnough(currentEnd, ringEnd)) {
          current = current.concat([...ring].reverse().slice(1));
          used.add(j);
          changed = true;
        }
      }
    }

    merged.push(current);
  }

  for (let i = 0; i < rings.length; i++) {
    if (!used.has(i)) merged.push(rings[i]);
  }

  return merged;
}

function closeEnough(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 0.0001 && Math.abs(a[1] - b[1]) < 0.0001;
}

export async function fetchBoundaryBySearch(
  query: string
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const cacheKey = `search-${query}`;
  const cached = getCachedBoundary(cacheKey);
  if (cached) return cached;

  const results = await searchPlaces(query);
  if (results.length === 0) return null;

  for (const result of results) {
    const geom = result.geojson;
    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
      const feature: Feature<Polygon | MultiPolygon> = {
        type: 'Feature',
        properties: { name: result.display_name },
        geometry: geom as Polygon | MultiPolygon,
      };
      setCachedBoundary(cacheKey, feature);
      return feature;
    }
  }

  const firstRelation = results.find((r) => r.osm_type === 'relation');
  if (firstRelation) {
    const feature = await fetchBoundaryOverpass(firstRelation.osm_id);
    if (feature) setCachedBoundary(cacheKey, feature);
    return feature;
  }

  return null;
}

export async function resolveGeojson(
  nominatimResult: NominatimResult
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const geom = nominatimResult.geojson;
  if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
    return {
      type: 'Feature',
      properties: { name: nominatimResult.display_name },
      geometry: geom as Polygon | MultiPolygon,
    };
  }

  if (nominatimResult.osm_type === 'relation') {
    return fetchBoundaryOverpass(nominatimResult.osm_id);
  }

  return null;
}

export function exportGeoJSON(features: Feature[]): string {
  const fc: FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  return JSON.stringify(fc, null, 2);
}
