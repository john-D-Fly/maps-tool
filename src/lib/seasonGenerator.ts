/**
 * Generates a synthetic 2026 UF football season drone activity dataset
 * based on patterns observed in the 2025 data.
 */

const BHG = { lat: 29.6500, lng: -82.3486 };
const TFR_RADIUS_NM = 3.0;
const CAMPUS_RADIUS_KM = 2.5;
const GNV_RADIUS_KM = 8;

// 2026 UF schedule (projected — SEC games + non-conference)
const SCHEDULE_2026 = [
  { date: '2026-09-05', opponent: 'Bethune-Cookman', kickoff: '19:00', tier: 'low' },
  { date: '2026-09-12', opponent: 'USF',             kickoff: '16:00', tier: 'mid' },
  { date: '2026-09-19', opponent: 'at Tennessee',    kickoff: '15:30', tier: 'away' },
  { date: '2026-09-26', opponent: 'UCF',             kickoff: '19:00', tier: 'mid' },
  { date: '2026-10-03', opponent: 'Alabama',         kickoff: '15:30', tier: 'high' },
  { date: '2026-10-10', opponent: 'at LSU',          kickoff: '19:00', tier: 'away' },
  { date: '2026-10-17', opponent: 'Texas',           kickoff: '15:30', tier: 'high' },
  { date: '2026-10-31', opponent: 'Georgia',         kickoff: '15:30', tier: 'high' },
  { date: '2026-11-07', opponent: 'at Missouri',     kickoff: '12:00', tier: 'away' },
  { date: '2026-11-14', opponent: 'Ole Miss',        kickoff: '15:30', tier: 'high' },
  { date: '2026-11-21', opponent: 'at Vanderbilt',   kickoff: '12:00', tier: 'away' },
  { date: '2026-11-28', opponent: 'FSU',             kickoff: '15:30', tier: 'high' },
] as const;

const TIER_PROFILES: Record<string, { ops: [number, number]; airborne: [number, number]; emergPct: number; inTfrPct: number; durationHrs: number }> = {
  low:  { ops: [2, 5],   airborne: [500, 2000],   emergPct: 0.01, inTfrPct: 0.3,  durationHrs: 3.0 },
  mid:  { ops: [4, 8],   airborne: [2000, 8000],  emergPct: 0.03, inTfrPct: 0.2,  durationHrs: 3.5 },
  high: { ops: [6, 15],  airborne: [8000, 20000], emergPct: 0.05, inTfrPct: 0.15, durationHrs: 4.0 },
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function dateToUnix(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  // ET = UTC-4 during football season
  const dt = new Date(Date.UTC(y, m - 1, d, h + 4, mi, 0));
  return Math.floor(dt.getTime() / 1000);
}

function generateDroneTrack(
  startUnix: number,
  durationSec: number,
  isAirborne: boolean,
  centerLat: number,
  centerLng: number,
  spreadKm: number,
): Array<[number, number, number, string, string, string, number | null, number | null, number]> {
  const points: Array<[number, number, number, string, string, string, number | null, number | null, number]> = [];
  const spreadDeg = spreadKm / 111;

  // Starting position
  let lat = centerLat + (Math.random() - 0.5) * spreadDeg * 2;
  let lng = centerLng + (Math.random() - 0.5) * spreadDeg * 2;
  const pilotLat = lat + (Math.random() - 0.5) * 0.002;
  const pilotLng = lng + (Math.random() - 0.5) * 0.002;

  const alt = isAirborne ? rand(30, 120) : 0;
  const speed = isAirborne ? rand(2, 15) : 0;
  const state = isAirborne ? 1 : 0;
  const interval = isAirborne ? randInt(3, 8) : randInt(10, 30);

  let t = startUnix;
  const endT = startUnix + durationSec;

  while (t < endT) {
    if (isAirborne) {
      lat += (Math.random() - 0.5) * 0.001;
      lng += (Math.random() - 0.5) * 0.001;
    }

    points.push([
      t, lat, lng,
      alt.toFixed(0), speed.toFixed(1), '0',
      pilotLat, pilotLng, state,
    ]);

    t += interval + randInt(-2, 2);
  }

  return points;
}

export interface SeasonSimData {
  drones: Record<string, Array<[number, number, number, string, string, string, number | null, number | null, number]>>;
  activity_windows: [number, number][];
  time_range: [number, number];
  events: Array<{
    date: string;
    name: string;
    center: [number, number];
    tfr: { center: [number, number]; radius_nm: number; start_unix: number; end_unix: number; label: string } | null;
    stats: {
      total_pts: number;
      operations: number;
      airborne: number;
      emergency: number;
      first_activity: string;
      last_activity: string;
      duration_hrs: number;
      in_tfr: number;
      in_tfr_pct: number;
      alt_max: number | null;
      speed_max: number | null;
      speed_avg: number | null;
      alt_avg: number | null;
      kickoff_et: string;
    };
  }>;
  op_flags: Record<string, { campus: boolean; gnv_5nm: boolean; flagged: boolean }>;
  overlays: {
    gnv_airport: { lat: number; lon: number; radius_nm: number };
    uf_campus: [number, number][];
  };
}

export function generateSeason2026(): SeasonSimData {
  const homeGames = SCHEDULE_2026.filter((g) => g.tier !== 'away');
  const allDrones: SeasonSimData['drones'] = {};
  const events: SeasonSimData['events'] = [];
  const windows: [number, number][] = [];
  const opFlags: Record<string, { campus: boolean; gnv_5nm: boolean; flagged: boolean }> = {};

  let globalMin = Infinity;
  let globalMax = -Infinity;
  let droneCounter = 0;

  for (const game of homeGames) {
    const profile = TIER_PROFILES[game.tier] ?? TIER_PROFILES.mid;
    const kickoffUnix = dateToUnix(game.date, game.kickoff);
    const tfrStart = kickoffUnix - 3600;
    const tfrEnd = kickoffUnix + (profile.durationHrs * 3600) + 1800;
    const windowStart = tfrStart - 7200;
    const windowEnd = tfrEnd + 3600;

    windows.push([windowStart, windowEnd]);
    globalMin = Math.min(globalMin, windowStart);
    globalMax = Math.max(globalMax, windowEnd);

    const numOps = randInt(profile.ops[0], profile.ops[1]);
    let totalAirborne = 0;
    let totalEmerg = 0;
    let totalInTfr = 0;
    let totalPts = 0;

    for (let i = 0; i < numOps; i++) {
      droneCounter++;
      const droneId = `sim-2026-${String(droneCounter).padStart(4, '0')}-${game.date}`;

      const preGame = Math.random() < 0.6;
      const trackStart = preGame
        ? windowStart + randInt(0, 3600)
        : kickoffUnix + randInt(-1800, (profile.durationHrs * 3600) / 2);
      const trackDuration = randInt(600, 3600);
      const isAirborne = Math.random() < 0.7;

      const onCampus = Math.random() < 0.4;
      const cLat = onCampus ? BHG.lat + (Math.random() - 0.5) * 0.01 : BHG.lat + (Math.random() - 0.5) * 0.08;
      const cLng = onCampus ? BHG.lng + (Math.random() - 0.5) * 0.01 : BHG.lng + (Math.random() - 0.5) * 0.08;

      const track = generateDroneTrack(trackStart, trackDuration, isAirborne, cLat, cLng, onCampus ? CAMPUS_RADIUS_KM : GNV_RADIUS_KM);

      allDrones[droneId] = track;
      totalPts += track.length;
      if (isAirborne) totalAirborne += track.length;

      const isEmergency = Math.random() < profile.emergPct;
      if (isEmergency) totalEmerg += Math.ceil(track.length * 0.1);

      const inTfr = Math.random() < profile.inTfrPct;
      if (inTfr) totalInTfr += Math.ceil(track.length * 0.3);

      opFlags[droneId] = {
        campus: onCampus,
        gnv_5nm: true,
        flagged: onCampus || isEmergency,
      };
    }

    events.push({
      date: game.date,
      name: `UF vs ${game.opponent}`,
      center: [BHG.lat, BHG.lng],
      tfr: {
        center: [BHG.lat, BHG.lng],
        radius_nm: TFR_RADIUS_NM,
        start_unix: tfrStart,
        end_unix: tfrEnd,
        label: `Stadium TFR — UF vs ${game.opponent}`,
      },
      stats: {
        total_pts: totalPts,
        operations: numOps,
        airborne: totalAirborne,
        emergency: totalEmerg,
        first_activity: new Date(windowStart * 1000).toISOString(),
        last_activity: new Date(windowEnd * 1000).toISOString(),
        duration_hrs: profile.durationHrs,
        in_tfr: totalInTfr,
        in_tfr_pct: totalPts > 0 ? (totalInTfr / totalPts) * 100 : 0,
        alt_max: rand(80, 150),
        speed_max: rand(10, 25),
        speed_avg: rand(3, 8),
        alt_avg: rand(40, 80),
        kickoff_et: game.kickoff,
      },
    });
  }

  return {
    drones: allDrones,
    activity_windows: windows,
    time_range: [globalMin, globalMax],
    events,
    op_flags: opFlags,
    overlays: {
      gnv_airport: { lat: 29.6900, lon: -82.2718, radius_nm: 5 },
      uf_campus: [
        [29.6520, -82.3700], [29.6520, -82.3265],
        [29.6355, -82.3265], [29.6355, -82.3700],
      ],
    },
  };
}

export function generateSingleGame(gameIndex: number): SeasonSimData {
  const game = SCHEDULE_2026[gameIndex];
  if (!game || game.tier === 'away') throw new Error('Invalid home game index');

  // Reuse the full generator but filter to just this one game
  const full = generateSeason2026();
  const evIdx = full.events.findIndex((e) => e.date === game.date);
  if (evIdx < 0) throw new Error('Game not found in generated data');

  const ev = full.events[evIdx];
  const win = full.activity_windows[evIdx];

  // Filter drones to only those in this game's window
  const drones: SeasonSimData['drones'] = {};
  const flags: SeasonSimData['op_flags'] = {};
  for (const [id, pts] of Object.entries(full.drones)) {
    if (id.includes(game.date)) {
      drones[id] = pts;
      if (full.op_flags[id]) flags[id] = full.op_flags[id];
    }
  }

  return {
    drones,
    activity_windows: [win],
    time_range: [win[0], win[1]],
    events: [ev],
    op_flags: flags,
    overlays: full.overlays,
  };
}

export function getSchedule2026() {
  return SCHEDULE_2026;
}
