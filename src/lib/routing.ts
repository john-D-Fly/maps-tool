const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

export interface RouteResult {
  coords: [number, number][];
  distanceKm: number;
  durationSec: number;
}

const routeCache = new Map<string, RouteResult>();

export async function getRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<RouteResult> {
  const key = `${fromLat.toFixed(5)},${fromLng.toFixed(5)}-${toLat.toFixed(5)},${toLng.toFixed(5)}`;

  const cached = routeCache.get(key);
  if (cached) return cached;

  try {
    const url = `${OSRM_URL}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      const result: RouteResult = {
        coords,
        distanceKm: route.distance / 1000,
        durationSec: route.duration,
      };
      routeCache.set(key, result);
      return result;
    }
  } catch {
    // Fallback to straight line
  }

  const distKm = Math.sqrt(
    Math.pow((toLat - fromLat) * 111, 2) +
    Math.pow((toLng - fromLng) * 111 * Math.cos(fromLat * Math.PI / 180), 2)
  );
  const result: RouteResult = {
    coords: [[fromLat, fromLng], [toLat, toLng]],
    distanceKm: distKm,
    durationSec: distKm / 40 * 3600,
  };
  routeCache.set(key, result);
  return result;
}

export function interpolateRoute(coords: [number, number][], progress: number): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1 || progress <= 0) return coords[0];
  if (progress >= 1) return coords[coords.length - 1];

  // Calculate total distance
  let totalDist = 0;
  const segDists: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const d = Math.sqrt(
      Math.pow(coords[i][0] - coords[i - 1][0], 2) +
      Math.pow(coords[i][1] - coords[i - 1][1], 2)
    );
    segDists.push(d);
    totalDist += d;
  }

  const targetDist = totalDist * progress;
  let cumDist = 0;

  for (let i = 0; i < segDists.length; i++) {
    if (cumDist + segDists[i] >= targetDist) {
      const segProgress = (targetDist - cumDist) / segDists[i];
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * segProgress,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * segProgress,
      ];
    }
    cumDist += segDists[i];
  }

  return coords[coords.length - 1];
}
