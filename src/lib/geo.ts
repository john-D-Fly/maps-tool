import area from '@turf/area';
import centroid from '@turf/centroid';
import bbox from '@turf/bbox';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { MapOverlay } from '../types';
import { OVERLAY_COLORS } from '../types';

const SQ_M_TO_SQ_KM = 1e-6;
const SQ_KM_TO_SQ_MI = 0.386102;

let colorIndex = 0;

export function nextColor(): string {
  const color = OVERLAY_COLORS[colorIndex % OVERLAY_COLORS.length];
  colorIndex++;
  return color;
}

export function resetColorIndex() {
  colorIndex = 0;
}

export function calculateArea(feature: Feature<Polygon | MultiPolygon>): { sqKm: number; sqMi: number } {
  const sqM = area(feature);
  const sqKm = sqM * SQ_M_TO_SQ_KM;
  const sqMi = sqKm * SQ_KM_TO_SQ_MI;
  return { sqKm, sqMi };
}

export function getCentroid(feature: Feature<Polygon | MultiPolygon>): [number, number] {
  const c = centroid(feature);
  return c.geometry.coordinates as [number, number];
}

export function getBbox(feature: Feature<Polygon | MultiPolygon>): [number, number, number, number] {
  return bbox(feature) as [number, number, number, number];
}

function reprojectCoords(
  coords: Position[],
  dLat: number,
  dLng: number,
  origCentroidLat: number,
): Position[] {
  const newCentroidLat = origCentroidLat + dLat;
  const lngScale = Math.cos((origCentroidLat * Math.PI) / 180) /
                   Math.cos((newCentroidLat * Math.PI) / 180);

  const centroidLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;

  return coords.map(([lng, lat, ...rest]) => {
    const adjustedLng = centroidLng + (lng - centroidLng) * lngScale + dLng;
    return [adjustedLng, lat + dLat, ...rest];
  });
}

export function translateFeature(
  feature: Feature<Polygon | MultiPolygon>,
  dLat: number,
  dLng: number
): Feature<Polygon | MultiPolygon> {
  if (dLat === 0 && dLng === 0) return feature;

  const [, origLat] = getCentroid(feature);
  const geom = feature.geometry;

  if (geom.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...geom,
        coordinates: geom.coordinates.map((ring) =>
          reprojectCoords(ring, dLat, dLng, origLat)
        ),
      },
    };
  }

  return {
    ...feature,
    geometry: {
      ...geom,
      coordinates: geom.coordinates.map((polygon) =>
        polygon.map((ring) => reprojectCoords(ring, dLat, dLng, origLat))
      ),
    },
  };
}

export function formatArea(sqMi: number): string {
  if (sqMi < 0.01) return `${(sqMi * 640).toFixed(1)} acres`;
  if (sqMi < 1) return `${sqMi.toFixed(2)} sq mi`;
  if (sqMi < 100) return `${sqMi.toFixed(1)} sq mi`;
  if (sqMi < 10000) return `${Math.round(sqMi).toLocaleString()} sq mi`;
  return `${(sqMi / 1000).toFixed(1)}K sq mi`;
}

export function formatAreaMetric(sqKm: number): string {
  if (sqKm < 1) return `${(sqKm * 100).toFixed(1)} hectares`;
  if (sqKm < 100) return `${sqKm.toFixed(1)} sq km`;
  if (sqKm < 10000) return `${Math.round(sqKm).toLocaleString()} sq km`;
  return `${(sqKm / 1000).toFixed(1)}K sq km`;
}

export function createOverlay(
  name: string,
  feature: Feature<Polygon | MultiPolygon>,
  color?: string
): MapOverlay {
  const { sqKm, sqMi } = calculateArea(feature);

  return {
    id: crypto.randomUUID(),
    name,
    originalName: name,
    feature,
    color: color ?? nextColor(),
    visible: true,
    locked: false,
    opacity: 0.55,
    areaSqKm: sqKm,
    areaSqMi: sqMi,
    offsetLat: 0,
    offsetLng: 0,
  };
}

export function createUFCampusFeature(): Feature<Polygon> {
  const north = 29.6520;
  const south = 29.6355;
  const west = -82.3700;
  const east = -82.3265;
  return {
    type: 'Feature',
    properties: { name: 'University of Florida Campus' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ]],
    },
  };
}

function circlePolygon(lat: number, lng: number, radiusKm: number, points = 64): Feature<Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusKm / 111) * Math.sin(angle);
    const dLng = (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    coords.push([lng + dLng, lat + dLat]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export function createMarALagoTFR(): Feature<Polygon> {
  const f = circlePolygon(26.6774, -80.0369, 18.52);
  f.properties = { name: 'Mar-a-Lago TFR (10 NM)' };
  return f;
}

export function createBHGTFR(): Feature<Polygon> {
  const f = circlePolygon(29.6500, -82.3486, 5.556);
  f.properties = { name: 'Ben Hill Griffin TFR (3 NM)' };
  return f;
}

export function createPBINoUAS(): Feature<Polygon> {
  const f = circlePolygon(26.6832, -80.0956, 9.26);
  f.properties = { name: 'PBI 5 NM No-UAS Zone' };
  return f;
}

export function createNUAIRCorridor(): Feature<Polygon> {
  // NUAIR BVLOS corridor: Griffiss Intl Airport (Rome, NY) extending ~50mi
  // Approximately 50 miles long, 4 miles wide
  return {
    type: 'Feature',
    properties: { name: 'NUAIR BVLOS Corridor' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-75.430, 43.250],  // NW corner near Griffiss
        [-75.380, 43.260],  // N edge
        [-75.280, 43.270],  // NE along corridor
        [-75.150, 43.275],
        [-75.020, 43.280],
        [-74.880, 43.278],
        [-74.750, 43.270],  // Far NE end
        [-74.750, 43.240],  // SE corner
        [-74.880, 43.248],
        [-75.020, 43.250],
        [-75.150, 43.245],
        [-75.280, 43.240],
        [-75.380, 43.230],
        [-75.430, 43.220],  // SW corner
        [-75.430, 43.250],  // Close ring
      ]],
    },
  };
}

export function createBrickellFeature(): Feature<Polygon> {
  const north = 25.768;
  const south = 25.755;
  const west = -80.200;
  const east = -80.188;
  return {
    type: 'Feature',
    properties: { name: 'Brickell, Miami' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ]],
    },
  };
}

export function createUFCampusBoundary(): Feature<Polygon> {
  // Matches the preprocessed LiDAR heightmap extent
  const north = 29.658;
  const south = 29.636;
  const west = -82.370;
  const east = -82.335;
  return {
    type: 'Feature',
    properties: { name: 'UF Campus' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ]],
    },
  };
}

export function compareAreas(a: MapOverlay, b: MapOverlay): string {
  const ratio = a.areaSqMi / b.areaSqMi;
  if (ratio > 1) {
    return `${a.name} is ${ratio.toFixed(1)}× larger than ${b.name}`;
  }
  return `${a.name} is ${(1 / ratio).toFixed(1)}× smaller than ${b.name}`;
}

export function fitsInside(small: MapOverlay, large: MapOverlay): string {
  const count = Math.floor(large.areaSqMi / small.areaSqMi);
  return `${count.toLocaleString()} copies of ${small.name} fit inside ${large.name}`;
}
