import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { getRoute, interpolateRoute } from '../lib/routing';

/* ── Types ──────────────────────────────────────────────────────── */
interface DronePoint {
  0: number; 1: number; 2: number; 3: string; 4: string; 5: string;
  6: number | null; 7: number | null; 8: number;
}

interface TfrDef {
  center: [number, number]; radius_nm: number;
  start_unix: number; end_unix: number; label: string;
}

interface EventStats {
  total_pts: number; operations: number; airborne: number;
  emergency: number; first_activity: string; last_activity: string;
  duration_hrs: number; in_tfr: number; in_tfr_pct: number;
  alt_max: number | null; speed_max: number | null;
  speed_avg: number | null; alt_avg: number | null;
  kickoff_et: string;
}

interface GameEvent {
  date: string; name: string; center: [number, number];
  tfr: TfrDef | null; stats?: EventStats;
}

export interface AnimData {
  drones: Record<string, DronePoint[]>;
  activity_windows: [number, number][];
  time_range: [number, number];
  events: GameEvent[];
  op_flags?: Record<string, { campus: boolean; gnv_5nm: boolean; flagged: boolean }>;
  overlays?: {
    gnv_airport?: { lat: number; lon: number; radius_nm: number };
    uf_campus?: [number, number][];
  };
}

/* ── Constants ──────────────────────────────────────────────────── */
const PALETTE = [
  '#ff6b35','#00d4aa','#ff4081','#448aff','#ffab00','#7c4dff',
  '#00e5ff','#76ff03','#ff1744','#651fff','#00bfa5','#ffd740',
  '#536dfe','#e040fb','#00c853','#ff9100','#304ffe','#64ffda',
];
const TRAIL_SEC = 60;

const NM_TO_M = 1852;

// Default response parameters (user-adjustable via sliders)
const DEF_DETECT_SEC = 15;
const DEF_ROUTE_SEC = 45;
const DEF_LOCATE_MIN = 5;
const DEF_NUM_OFFICERS = 10;
const LEO_GAMEDAY_SPEED_KMH = 32;  // ~20 mph in gameday traffic
const DFR_SPEED_KMH = 60;           // direct flight response

interface OfficerState {
  id: number;
  baseLat: number;
  baseLng: number;
  currentLat: number;
  currentLng: number;
  assignedDrone: string | null;
  status: 'patrol' | 'enroute' | 'arrived';
}

interface DroneResponse {
  firstSeen: number;
  detectDone: number;
  routeDone: number;
  locateDone: number;
  officerId: number | null;
  pilotLat: number;
  pilotLng: number;
  distKm: number;
  intercepted: boolean;
  routePath: [number, number][] | null;
  routeLoading: boolean;
}

function gaussRandom(mean: number, std: number): number {
  const u1 = Math.random(), u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function initOfficers(n: number): OfficerState[] {
  const BHG_LAT = 29.6500, BHG_LNG = -82.3486;
  const officers: OfficerState[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI;
    const r = 0.008 + Math.random() * 0.005;
    const lat = BHG_LAT + r * Math.sin(angle);
    const lng = BHG_LNG + r * Math.cos(angle);
    officers.push({ id: i, baseLat: lat, baseLng: lng, currentLat: lat, currentLng: lng, assignedDrone: null, status: 'patrol' });
  }
  return officers;
}
const Q_REAL_MIN = 45;
const GAME_SEGS = [
  { l: 'Q1', d: Q_REAL_MIN, q: true }, { l: 'Brk', d: 3, q: false },
  { l: 'Q2', d: Q_REAL_MIN, q: true }, { l: 'Half', d: 20, q: false },
  { l: 'Q3', d: Q_REAL_MIN, q: true }, { l: 'Brk', d: 3, q: false },
  { l: 'Q4', d: Q_REAL_MIN, q: true },
];
const GAME_DUR_MIN = GAME_SEGS.reduce((s, g) => s + g.d, 0);

function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function fmtET(unix: number) {
  const d = new Date(unix * 1000);
  const et = new Date(d.getTime() - 4 * 3600_000);
  const h = et.getUTCHours(), m = et.getUTCMinutes(), s = et.getUTCSeconds();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDateET(unix: number) {
  const d = new Date(unix * 1000);
  const et = new Date(d.getTime() - 4 * 3600_000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[et.getUTCMonth()]} ${et.getUTCDate()}, ${et.getUTCFullYear()}`;
}

function dateKeyET(unix: number) {
  const d = new Date(unix * 1000);
  const et = new Date(d.getTime() - 4 * 3600_000);
  return `${et.getUTCFullYear()}-${String(et.getUTCMonth() + 1).padStart(2, '0')}-${String(et.getUTCDate()).padStart(2, '0')}`;
}

function fmtCountdown(sec: number) {
  const a = Math.abs(sec), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor(a % 60)).padStart(2, '0')}s`;
}

/* ── Component ──────────────────────────────────────────────────── */
export default function DroneAnimation({ visible, externalData }: { visible: boolean; externalData?: AnimData | null }) {
  const map = useMap();
  const [data, setData] = useState<AnimData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [showPilots, setShowPilots] = useState(true);
  const [autoSkip, setAutoSkip] = useState(true);
  const [detectSec, setDetectSec] = useState(DEF_DETECT_SEC);
  const [routeSec, setRouteSec] = useState(DEF_ROUTE_SEC);
  const [locateMin, setLocateMin] = useState(DEF_LOCATE_MIN);
  const [numOfficers, setNumOfficers] = useState(DEF_NUM_OFFICERS);
  const [useDFR, setUseDFR] = useState(false);
  const tRef = useRef(0);
  const lastFrame = useRef(0);
  const rafRef = useRef(0);

  // Leaflet layer groups (drone data only — static overlays handled by main map)
  const droneLayerRef = useRef(L.layerGroup());
  const trailLayerRef = useRef(L.layerGroup());
  const pilotLayerRef = useRef(L.layerGroup());
  const historyLayerRef = useRef(L.layerGroup());
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const lastPanKey = useRef('');
  const currentWindowRef = useRef(-1);
  const droneHistoryRef = useRef<Record<string, [number, number][]>>({});
  const responseRef = useRef<Record<string, DroneResponse>>({});
  const officersRef = useRef<OfficerState[]>(initOfficers(DEF_NUM_OFFICERS));
  const officerLayerRef = useRef(L.layerGroup());
  const timelineElRef = useRef<HTMLDivElement | null>(null);

  /* ── Load data (from file or external) ── */
  useEffect(() => {
    if (externalData) {
      setData(externalData);
      tRef.current = externalData.time_range[0];
      return;
    }
    fetch(`${import.meta.env.BASE_URL}clean/animation_data.json`)
      .then((r) => r.json())
      .then((d: AnimData) => {
        setData(d);
        tRef.current = d.time_range[0];
      })
      .catch(console.error);
  }, [externalData]);

  /* ── Build indices ── */
  const { droneIndex, colorMap, opFlags, windows } = useMemo(() => {
    if (!data) return { droneIndex: {} as Record<string, { times: number[]; pts: DronePoint[] }>, colorMap: {} as Record<string, string>, opFlags: {} as Record<string, any>, windows: [] as [number, number][] };
    const di: Record<string, { times: number[]; pts: DronePoint[] }> = {};
    const cm: Record<string, string> = {};
    for (const [id, pts] of Object.entries(data.drones)) {
      cm[id] = hashColor(id);
      di[id] = { times: pts.map((p) => p[0]), pts };
    }
    return { droneIndex: di, colorMap: cm, opFlags: data.op_flags || {}, windows: data.activity_windows || [] };
  }, [data]);

  /* Static overlays (GNV ring, UF campus, TFR) are handled by the main map */

  /* ── Add/remove dynamic layers ── */
  useEffect(() => {
    if (!visible) {
      droneLayerRef.current.remove();
      trailLayerRef.current.remove();
      pilotLayerRef.current.remove();
      historyLayerRef.current.remove();
      return;
    }
    historyLayerRef.current.addTo(map);
    droneLayerRef.current.addTo(map);
    trailLayerRef.current.addTo(map);
    pilotLayerRef.current.addTo(map);
    officerLayerRef.current.addTo(map);
    return () => {
      droneLayerRef.current.remove();
      trailLayerRef.current.remove();
      pilotLayerRef.current.remove();
      historyLayerRef.current.remove();
      officerLayerRef.current.remove();
    };
  }, [visible, map]);

  /* ── Render one frame ── */
  const renderFrame = useCallback((t: number) => {
    if (!data) return;
    const drones = droneLayerRef.current;
    const trails = trailLayerRef.current;
    const pilots = pilotLayerRef.current;
    drones.clearLayers();
    trails.clearLayers();
    pilots.clearLayers();

    // Detect game window changes — clear history + response tracks when a new game starts
    const wi = windows.findIndex(([ws, we]) => t >= ws - 300 && t <= we + 300);
    if (wi !== currentWindowRef.current) {
      currentWindowRef.current = wi;
      historyLayerRef.current.clearLayers();
      droneHistoryRef.current = {};
      responseRef.current = {};
      officersRef.current = initOfficers(numOfficers);
    }

    const gnv = data.overlays?.gnv_airport;
    let visCount = 0, emergCount = 0;
    const visLats: number[] = [], visLons: number[] = [];

    for (const [id, idx] of Object.entries(droneIndex)) {
      const { times, pts } = idx;
      let lo = 0, hi = times.length - 1, best = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (times[mid] <= t) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      if (best < 0) continue;
      const pt = pts[best];
      if (t - pt[0] > 120) continue;

      visCount++;
      const lat = pt[1], lon = pt[2];
      visLats.push(lat); visLons.push(lon);
      const st = pt[8];
      const isEmerg = st === 9;
      if (isEmerg) emergCount++;
      const resp = responseRef.current[id];
      const intercepted = resp?.intercepted ?? false;
      const color = intercepted ? '#ff0000' : isEmerg ? '#ff0000' : st === 0 ? '#888' : colorMap[id];
      const r = intercepted ? 5 : isEmerg ? 8 : 6;
      const opacity = intercepted ? 0.4 : 0.9;

      if (intercepted) continue;

      L.circleMarker([lat, lon], { radius: r, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: opacity, className: '' })
        .bindPopup(`<b style="color:${colorMap[id]}">${id.slice(0, 8)}</b><br>State: ${intercepted ? '<b style="color:red">INTERCEPTED</b>' : isEmerg ? '<b style="color:red">EMERGENCY</b>' : st === 0 ? 'grounded' : 'airborne'}<br>Alt: ${pt[3]} m AGL<br>Speed: ${pt[4]} m/s`)
        .addTo(drones);

      // Accumulate persistent history for this drone in this game window
      if (!droneHistoryRef.current[id]) droneHistoryRef.current[id] = [];
      const hist = droneHistoryRef.current[id];
      if (hist.length === 0 || hist[hist.length - 1][0] !== lat || hist[hist.length - 1][1] !== lon) {
        hist.push([lat, lon]);
        if (hist.length >= 3) {
          L.polyline(hist.slice(-3) as L.LatLngExpression[], {
            color: colorMap[id], weight: 1.5, opacity: 0.2, interactive: false,
          }).addTo(historyLayerRef.current);
        }
      }

      // Active trail (last 60s)
      const tStart = t - TRAIL_SEC;
      let ts = best;
      while (ts > 0 && times[ts - 1] >= tStart) ts--;
      if (best - ts >= 1) {
        const coords: L.LatLngExpression[] = [];
        for (let i = ts; i <= best; i++) coords.push([pts[i][1], pts[i][2]]);
        L.polyline(coords, { color, weight: 2.5, opacity: 0.6, interactive: false }).addTo(trails);
      }

      // Pilot — use setView-pinned marker to prevent drift
      if (showPilots && pt[6] != null && pt[7] != null) {
        const olat = pt[6], olon = pt[7]!;
        const flags = opFlags[id] || {};
        const droneInGnv = gnv ? L.latLng(lat, lon).distanceTo(L.latLng(gnv.lat, gnv.lon)) / NM_TO_M <= gnv.radius_nm : false;
        const flagged = flags.flagged || droneInGnv;
        const pc = flagged ? '#ff0000' : '#ffdd00';

        L.circleMarker([olat, olon], { radius: flagged ? 6 : 4, color: pc, weight: flagged ? 2.5 : 1.5, fillColor: pc, fillOpacity: 0.8 })
          .bindPopup(`<b style="color:${pc}">PIC${flagged ? ' ⚠' : ''}</b><br>Drone: ${id.slice(0, 8)}<br>${flagged ? '<span style="color:red">Airspace flag</span>' : 'Clear'}`)
          .addTo(pilots);
        L.polyline([[olat, olon], [lat, lon]], { color: flagged ? '#ff4444' : color, weight: 1, opacity: 0.4, dashArray: '4 4', interactive: false }).addTo(pilots);
      }
    }

    // ── Officer response simulation ──
    officerLayerRef.current.clearLayers();
    const responses = responseRef.current;
    const officers = officersRef.current;
    const std95 = 1.96;

    for (const [id, idx] of Object.entries(droneIndex)) {
      const { times, pts } = idx;
      let lo2 = 0, hi2 = times.length - 1, best2 = -1;
      while (lo2 <= hi2) { const mid = (lo2 + hi2) >> 1; if (times[mid] <= t) { best2 = mid; lo2 = mid + 1; } else hi2 = mid - 1; }
      if (best2 < 0) continue;
      const pt2 = pts[best2];
      if (t - pt2[0] > 120) { delete responses[id]; continue; }

      if (!responses[id]) {
        const pilotLat = pt2[6] ?? pt2[1] + (Math.random() - 0.5) * 0.01;
        const pilotLng = pt2[7] ?? pt2[2] + (Math.random() - 0.5) * 0.01;
        const straightDistKm = Math.sqrt(Math.pow((pt2[1] - pilotLat) * 111, 2) + Math.pow((pt2[2] - pilotLng) * 111 * Math.cos(pt2[1] * Math.PI / 180), 2));

        const dSec = Math.max(1, gaussRandom(detectSec, detectSec / std95));
        const rSec = Math.max(1, gaussRandom(routeSec, routeSec / std95));

        // Assign nearest available officer
        let bestOfficer: OfficerState | null = null;
        let bestDist = Infinity;
        for (const off of officers) {
          if (off.assignedDrone) continue;
          const d = Math.sqrt(Math.pow((off.currentLat - pilotLat) * 111, 2) + Math.pow((off.currentLng - pilotLng) * 111 * Math.cos(off.currentLat * Math.PI / 180), 2));
          if (d < bestDist) { bestDist = d; bestOfficer = off; }
        }
        if (bestOfficer) bestOfficer.assignedDrone = id;

        const speedKmh = useDFR ? DFR_SPEED_KMH : LEO_GAMEDAY_SPEED_KMH;
        const travelMin = straightDistKm / (speedKmh / 60);
        const lMin = Math.max(0.5, gaussRandom(locateMin + travelMin, locateMin / std95));

        const detectDone = t + dSec;
        const routeDone = detectDone + rSec;
        const locateDone = routeDone + lMin * 60;

        responses[id] = {
          firstSeen: t, detectDone, routeDone, locateDone,
          officerId: bestOfficer?.id ?? null,
          pilotLat, pilotLng, distKm: straightDistKm, intercepted: false,
          routePath: null, routeLoading: false,
        };

        // Fetch road route asynchronously (LEO mode only)
        if (!useDFR && bestOfficer) {
          const respRef = responses[id];
          respRef.routeLoading = true;
          getRoute(bestOfficer.baseLat, bestOfficer.baseLng, pilotLat, pilotLng).then((route) => {
            respRef.routePath = route.coords;
            respRef.distKm = route.distanceKm;
            // Recalculate locate time based on actual road distance
            const realTravelMin = route.distanceKm / (LEO_GAMEDAY_SPEED_KMH / 60);
            const realLMin = Math.max(0.5, locateMin + realTravelMin);
            respRef.locateDone = respRef.routeDone + realLMin * 60;
            respRef.routeLoading = false;
          });
        }
      }
    }

    // Update officers and render
    for (const off of officers) {
      const resp = off.assignedDrone ? responses[off.assignedDrone] : null;

      if (resp && !resp.intercepted && t >= resp.routeDone) {
        off.status = 'enroute';
        const duration = resp.locateDone - resp.routeDone;
        const progress = Math.min(1, (t - resp.routeDone) / Math.max(1, duration));

        if (resp.routePath && resp.routePath.length > 1 && !useDFR) {
          // Follow road route
          const pos = interpolateRoute(resp.routePath, progress);
          off.currentLat = pos[0];
          off.currentLng = pos[1];
        } else {
          // Straight line (DFR mode or no route yet)
          off.currentLat = off.baseLat + (resp.pilotLat - off.baseLat) * progress;
          off.currentLng = off.baseLng + (resp.pilotLng - off.baseLng) * progress;
        }

        if (progress >= 1) {
          off.status = 'arrived';
          resp.intercepted = true;
          off.assignedDrone = null;
          off.currentLat = off.baseLat;
          off.currentLng = off.baseLng;
          off.status = 'patrol';
        }
      } else if (!resp || resp.intercepted) {
        off.status = 'patrol';
        off.currentLat = off.baseLat;
        off.currentLng = off.baseLng;
      }

      // Draw officer
      const oColor = off.status === 'enroute' ? '#00ff88' : '#4488ff';
      const oSize = off.status === 'enroute' ? 6 : 4;
      L.circleMarker([off.currentLat, off.currentLng], {
        radius: oSize, color: oColor, weight: 2, fillColor: oColor, fillOpacity: 0.9,
      }).addTo(officerLayerRef.current);

      // Draw route path if enroute
      if (off.status === 'enroute' && resp) {
        if (resp.routePath && resp.routePath.length > 1 && !useDFR) {
          // Draw the full road route
          L.polyline(resp.routePath as L.LatLngExpression[], {
            color: '#00ff88', weight: 2, opacity: 0.3, interactive: false,
          }).addTo(officerLayerRef.current);
          // Draw remaining route from officer to pilot
          const remaining = resp.routePath.filter((_, i) => {
            const progress2 = Math.min(1, (t - resp.routeDone) / Math.max(1, resp.locateDone - resp.routeDone));
            return i >= Math.floor(progress2 * (resp.routePath!.length - 1));
          });
          if (remaining.length > 1) {
            L.polyline(remaining as L.LatLngExpression[], {
              color: '#00ff88', weight: 2.5, opacity: 0.7, interactive: false,
            }).addTo(officerLayerRef.current);
          }
        } else {
          // Straight line for DFR
          L.polyline([[off.currentLat, off.currentLng], [resp.pilotLat, resp.pilotLng]], {
            color: '#00aaff', weight: 2, opacity: 0.6, dashArray: '6 4', interactive: false,
          }).addTo(officerLayerRef.current);
        }
      }
    }

    updateTimeline(t);

    // Auto-pan — use panTo with no animation to prevent drift
    if (visCount > 0) {
      const cLat = visLats.reduce((a, b) => a + b, 0) / visLats.length;
      const cLon = visLons.reduce((a, b) => a + b, 0) / visLons.length;
      const key = `${Math.round(cLat * 10)},${Math.round(cLon * 10)}`;
      if (key !== lastPanKey.current) {
        lastPanKey.current = key;
        map.panTo([cLat, cLon], { animate: false });
      }
    }

    // Update HUD
    updateHUD(t, visCount, emergCount, data);
  }, [data, droneIndex, colorMap, opFlags, showPilots, map, windows]);

  /* ── Response timeline overlay ── */
  const updateTimeline = useCallback((t: number) => {
    const el = timelineElRef.current;
    if (!el) return;
    const responses = responseRef.current;
    const activeIds = Object.keys(responses).filter(id => !responses[id].intercepted).sort((a, b) => responses[a].firstSeen - responses[b].firstSeen);
    const doneCount = Object.values(responses).filter(r => r.intercepted).length;

    if (activeIds.length === 0 && doneCount === 0) { el.innerHTML = ''; return; }

    const availOfficers = officersRef.current.filter(o => o.status === 'patrol').length;
    let html = `<div class="rt-title">Response Pipeline · ${availOfficers}/${officersRef.current.length} officers avail</div>`;

    for (const id of activeIds.slice(0, 6)) {
      const r = responses[id];
      const color = colorMap[id] || '#888';
      const short = id.slice(0, 8);

      const pctDetect = Math.min(1, Math.max(0, (t - r.firstSeen) / Math.max(1, r.detectDone - r.firstSeen)));
      const pctRoute = r.detectDone <= t ? Math.min(1, Math.max(0, (t - r.detectDone) / Math.max(1, r.routeDone - r.detectDone))) : 0;
      const pctLocate = r.routeDone <= t ? Math.min(1, Math.max(0, (t - r.routeDone) / Math.max(1, r.locateDone - r.routeDone))) : 0;

      const detectLabel = pctDetect >= 1 ? '✓' : `${Math.max(0, r.detectDone - t).toFixed(0)}s`;
      const routeLabel = pctRoute >= 1 ? '✓' : t > r.detectDone ? `${Math.max(0, r.routeDone - t).toFixed(0)}s` : '—';
      const locateLabel = pctLocate >= 1 ? '✓' : t > r.routeDone ? `${Math.max(0, (r.locateDone - t) / 60).toFixed(1)}m` : '—';

      const ds = pctDetect >= 1 ? 'done' : pctDetect > 0 ? 'active' : 'pending';
      const rs = pctRoute >= 1 ? 'done' : pctRoute > 0 ? 'active' : 'pending';
      const ls = pctLocate >= 1 ? 'done' : pctLocate > 0 ? 'active' : 'pending';

      html += `<div class="rt-row">
        <div class="rt-id" style="color:${color}">${short}</div>
        <div class="rt-bars">
          <div class="rt-phase ${ds}"><div class="rt-fill" style="width:${pctDetect * 100}%;background:#10b981"></div><span>Detect ${detectLabel}</span></div>
          <div class="rt-phase ${rs}"><div class="rt-fill" style="width:${pctRoute * 100}%;background:#3b82f6"></div><span>Route LEO ${routeLabel}</span></div>
          <div class="rt-phase ${ls}"><div class="rt-fill" style="width:${pctLocate * 100}%;background:#f59e0b"></div><span>Find Pilot ${locateLabel} (${r.distKm.toFixed(1)}km)</span></div>
        </div>
      </div>`;
    }

    if (doneCount > 0) html += `<div class="rt-more" style="color:#10b981">✓ ${doneCount} intercepted</div>`;
    if (activeIds.length > 6) html += `<div class="rt-more">+${activeIds.length - 6} more</div>`;

    el.innerHTML = html;
  }, [colorMap]);

  /* ── HUD overlay ── */
  const updateHUD = useCallback((t: number, vis: number, emerg: number, d: AnimData) => {
    const el = overlayElRef.current;
    if (!el) return;

    const dk = dateKeyET(t);
    const ev = d.events.find((e) => e.date === dk);
    const tfr = ev?.tfr;
    const tfrActive = tfr ? t >= tfr.start_unix && t <= tfr.end_unix : false;
    const kickUnix = tfr ? tfr.start_unix + 3600 : 0;

    let gcHtml = '';
    if (ev && tfr) {
      const secToTfr = tfr.start_unix - t;
      const secToKick = kickUnix - t;
      const secSinceKick = t - kickUnix;
      const gameEnd = kickUnix + GAME_DUR_MIN * 60;

      if (t < tfr.start_unix) {
        gcHtml = `<div class="gc-line"><span class="gc-l">TFR in</span><span class="gc-v countdown">${fmtCountdown(secToTfr)}</span></div><div class="gc-line"><span class="gc-l">Kickoff in</span><span class="gc-v countdown">${fmtCountdown(secToKick)}</span></div>`;
      } else if (t < kickUnix) {
        gcHtml = `<div class="gc-line"><span class="gc-l">TFR</span><span class="gc-v active">ACTIVE</span></div><div class="gc-line"><span class="gc-l">Kickoff in</span><span class="gc-v countdown">${fmtCountdown(secToKick)}</span></div>`;
      } else if (t <= gameEnd) {
        let elapsed = secSinceKick / 60, cum = 0, qLabel = '', qClock = '';
        const bars: { l: string; pct: number }[] = [];
        for (const seg of GAME_SEGS) {
          if (seg.q) {
            const pct = Math.max(0, Math.min(1, (elapsed - cum) / seg.d)) * 100;
            bars.push({ l: seg.l, pct });
          }
          if (!qLabel && elapsed <= cum + seg.d) {
            qLabel = seg.l;
            if (seg.q) { const left = 15 - ((elapsed - cum) / seg.d) * 15; qClock = `${Math.floor(left)}:${String(Math.floor((left % 1) * 60)).padStart(2, '0')}`; }
          }
          cum += seg.d;
        }
        const barHtml = bars.map((b) => `<div class="gc-bar"><div class="gc-fill" style="width:${b.pct}%"></div></div>`).join('');
        const labelsHtml = bars.map((b) => `<span>${b.l}</span>`).join('');
        gcHtml = `<div class="gc-line"><span class="gc-l">TFR</span><span class="gc-v active">ACTIVE</span></div><div class="gc-line"><span class="gc-l">${qLabel}</span><span class="gc-v quarter">${qClock || '—'}</span></div><div class="gc-bars">${barHtml}</div><div class="gc-labels">${labelsHtml}</div>`;
      } else if (t <= tfr.end_unix) {
        gcHtml = `<div class="gc-line"><span class="gc-l">Game</span><span class="gc-v dim">FINAL</span></div><div class="gc-line"><span class="gc-l">TFR expires</span><span class="gc-v countdown">${fmtCountdown(tfr.end_unix - t)}</span></div>`;
      }
    }

    const wi = windows.findIndex(([, we]) => t <= we + 5);
    const winLabel = wi >= 0 ? `${wi + 1}/${windows.length}` : '';

    el.innerHTML = `
      <div class="da-clock">${fmtDateET(t)} ${fmtET(t)}</div>
      <div class="da-event">${ev ? ev.name : ''}</div>
      ${gcHtml ? `<div class="da-gc">${gcHtml}</div>` : ''}
      <div class="da-stats">
        <span>Ops: <b>${vis}</b></span>
        ${emerg ? `<span class="da-emerg">⚠ ${emerg} EMERG</span>` : ''}
        <span class="da-tfr">${tfrActive ? 'TFR ACTIVE' : ''}</span>
        <span class="da-win">${winLabel}</span>
      </div>`;
  }, [windows]);

  /* ── Playback loop ── */
  useEffect(() => {
    if (!playing || !data || !visible) return;
    lastFrame.current = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = (now - lastFrame.current) / 1000;
      lastFrame.current = now;
      tRef.current += dt * speed;

      if (autoSkip && windows.length) {
        const inGap = !windows.some(([ws, we]) => tRef.current >= ws - 5 && tRef.current <= we + 5);
        if (inGap) {
          const nw = windows.find(([ws]) => ws > tRef.current + 5);
          if (nw) tRef.current = nw[0] - 3;
        }
      }

      const end = data.time_range[1] + 10;
      if (tRef.current > end) tRef.current = data.time_range[0];

      renderFrame(tRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, data, visible, speed, autoSkip, renderFrame, windows]);

  /* ── Skip helpers ── */
  const skipNext = useCallback(() => {
    const nw = windows.find(([ws]) => ws > tRef.current + 5);
    if (nw) { tRef.current = nw[0] - 3; renderFrame(tRef.current); }
  }, [windows, renderFrame]);

  const skipPrev = useCallback(() => {
    for (let i = windows.length - 1; i >= 0; i--) {
      if (windows[i][0] < tRef.current - 5) { tRef.current = windows[i][0]; renderFrame(tRef.current); break; }
    }
  }, [windows, renderFrame]);

  /* ── Keyboard ── */
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.code === 'ArrowRight') { e.preventDefault(); skipNext(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); skipPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, skipNext, skipPrev]);

  if (!visible || !data) return null;

  return (
    <>
      {/* Response timeline */}
      <div ref={timelineElRef} className="rt-overlay" />

      {/* HUD overlay */}
      <div className="da-overlay">
        <div ref={overlayElRef} className="da-hud" />
        <div className="da-controls">
          <button onClick={skipPrev} title="Previous (←)">⏮</button>
          <button onClick={() => setPlaying((p) => !p)} title="Play/Pause (Space)">{playing ? '⏸' : '▶'}</button>
          <button onClick={skipNext} title="Next (→)">⏭</button>
          <input
            type="range" min={data.time_range[0]} max={data.time_range[1]}
            value={tRef.current}
            onChange={(e) => { tRef.current = +e.target.value; renderFrame(tRef.current); }}
            className="da-slider"
          />
          <select value={speed} onChange={(e) => setSpeed(+e.target.value)} className="da-speed">
            <option value={1}>1x</option>
            <option value={5}>5x</option>
            <option value={15}>15x</option>
            <option value={30}>30x</option>
            <option value={60}>60x</option>
            <option value={120}>120x</option>
            <option value={300}>5m/s</option>
          </select>
          <label className="da-toggle"><input type="checkbox" checked={showPilots} onChange={() => setShowPilots((v) => !v)} /> PIC</label>
          <label className="da-toggle"><input type="checkbox" checked={autoSkip} onChange={() => setAutoSkip((v) => !v)} /> Skip</label>
          <label className={`da-toggle ${useDFR ? 'da-dfr-active' : ''}`}><input type="checkbox" checked={useDFR} onChange={() => setUseDFR((v) => !v)} /> {useDFR ? 'DFR' : 'LEO'}</label>
        </div>
        <div className="da-response-params">
          <label>Detect <input type="range" min={2} max={60} value={detectSec} onChange={(e) => setDetectSec(+e.target.value)} /> {detectSec}s</label>
          <label>Route <input type="range" min={5} max={120} value={routeSec} onChange={(e) => setRouteSec(+e.target.value)} /> {routeSec}s</label>
          <label>Find <input type="range" min={1} max={15} step={0.5} value={locateMin} onChange={(e) => setLocateMin(+e.target.value)} /> {locateMin}m</label>
          <label>Officers <input type="range" min={2} max={20} value={numOfficers} onChange={(e) => { setNumOfficers(+e.target.value); officersRef.current = initOfficers(+e.target.value); }} /> {numOfficers}</label>
        </div>
      </div>
    </>
  );
}
