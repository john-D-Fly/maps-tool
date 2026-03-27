// ── Step definition types ───────────────────────────────────────

export interface StepDef {
  caption?: string;
  sub?: string;
  add?: AddAction[];
  remove?: string[];
  fade?: FadeAction[];
  flyTo?: FlyAction;
  markers?: MarkerAction[];
  clearMarkers?: boolean;
  animate?: AnimateAction[];
  showNodes?: boolean;
  hideNodes?: boolean;
  revealNodes?: boolean;
  waitAfter?: number;
}

export interface AddAction {
  tag: string;
  name: string;
  key: string;
  color: string;
  opacity: number;
  offLat?: number;
  offLng?: number;
}

export interface FadeAction {
  tag: string;
  opacity: number;
}

export interface FlyAction {
  lat: number;
  lng: number;
  zoom: number;
  duration?: number;
}

export interface MarkerAction {
  set: string;
  offLat: number;
  offLng: number;
}

export interface AnimateAction {
  tag: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  duration: number;
  concurrent?: FlyAction;
}

// ── Site pin types ──────────────────────────────────────────────

export interface SitePin {
  name: string;
  lat: number;
  lng: number;
  type: 'military' | 'vip' | 'airport' | 'venue';
}

export const SITE_COLORS: Record<SitePin['type'], { bg: string; text: string }> = {
  military: { bg: 'rgba(220,38,38,0.85)', text: '#fff' },
  vip:      { bg: 'rgba(245,158,11,0.85)', text: '#fff' },
  airport:  { bg: 'rgba(59,130,246,0.85)', text: '#fff' },
  venue:    { bg: 'rgba(168,85,247,0.85)', text: '#fff' },
};

export const MARKER_SETS: Record<string, SitePin[]> = {
  nj: [
    { name: 'Trump Bedminster',         lat: 40.662, lng: -74.593, type: 'vip' },
    { name: 'JB McGuire-Dix-Lakehurst', lat: 40.016, lng: -74.594, type: 'military' },
  ],
  ny: [
    { name: 'Fort Drum',       lat: 44.050, lng: -75.760, type: 'military' },
    { name: 'West Point',      lat: 41.392, lng: -73.957, type: 'military' },
    { name: 'Trump Tower NYC', lat: 40.762, lng: -73.974, type: 'vip' },
    { name: 'JFK Airport',     lat: 40.641, lng: -73.778, type: 'airport' },
  ],
  fl: [
    { name: 'Mar-a-Lago',       lat: 26.677, lng: -80.037, type: 'vip' },
    { name: 'MacDill AFB',      lat: 27.849, lng: -82.521, type: 'military' },
    { name: 'Patrick SFB',      lat: 28.235, lng: -80.608, type: 'military' },
    { name: 'NAS Jacksonville', lat: 30.236, lng: -81.681, type: 'military' },
  ],
  laVenues: [
    { name: 'SoFi Stadium',        lat: 33.9535, lng: -118.3392, type: 'venue' },
    { name: 'LA Memorial Coliseum', lat: 34.0141, lng: -118.2879, type: 'venue' },
    { name: 'Crypto.com Arena',    lat: 34.0430, lng: -118.2673, type: 'venue' },
    { name: 'Rose Bowl',           lat: 34.1613, lng: -118.1676, type: 'venue' },
    { name: 'Long Beach',          lat: 33.7572, lng: -118.1894, type: 'venue' },
  ],
};

// ── Overlay colors ──────────────────────────────────────────────

export const OVERLAY_COLORS: Record<string, string> = {
  ufCampus:   '#4ade80',
  gainesville:'#22d3ee',
  florida:    '#f87171',
  newJersey:  '#fb923c',
  nyState:    '#64748b',
  manhattan:  '#a78bfa',
  marALago:   '#f59e0b',
  whiteHouse: '#e2e8f0',
  brickell:   '#f472b6',
  vaticanCity:'#eab308',
  metlife:    '#3b82f6',
  miami:      '#fb7185',
  nycMetro:   '#f472b6',
  laMetro:    '#c084fc',
  bergenCo:   '#f97316',
  malTFR:     '#ef4444',
  pbiNoUAS:   '#f97316',
  bhgTFR:     '#f97316',
};

// ── Boundary sources ────────────────────────────────────────────

export type BoundarySource =
  | { type: 'osm'; osmType: 'relation' | 'way'; osmId: number; label: string }
  | { type: 'search'; query: string; label: string }
  | { type: 'local'; builder: string; label: string };

export const BOUNDARY_SOURCES: Record<string, BoundarySource> = {
  nyState:    { type: 'osm', osmType: 'relation', osmId: 61320,   label: 'New York State' },
  newJersey:  { type: 'osm', osmType: 'relation', osmId: 224951,  label: 'New Jersey' },
  florida:    { type: 'osm', osmType: 'relation', osmId: 162050,  label: 'Florida' },
  manhattan:  { type: 'osm', osmType: 'relation', osmId: 8398124, label: 'Manhattan' },
  marALago:   { type: 'search', query: 'Mar-a-Lago Palm Beach Florida', label: 'Mar-a-Lago' },
  whiteHouse: { type: 'osm', osmType: 'relation', osmId: 19761182, label: 'White House' },
  vaticanCity:{ type: 'osm', osmType: 'relation', osmId: 36989,   label: 'Vatican City' },
  metlife:    { type: 'search', query: 'MetLife Stadium East Rutherford New Jersey', label: 'MetLife Stadium' },
  bergenCo:   { type: 'osm', osmType: 'relation', osmId: 958930,  label: 'Bergen County' },
  gainesville:{ type: 'osm', osmType: 'relation', osmId: 118870,  label: 'Gainesville' },
  nycMetro:   { type: 'osm', osmType: 'relation', osmId: 175905,  label: 'New York City' },
  miami:      { type: 'osm', osmType: 'relation', osmId: 1216769, label: 'Miami' },
  laMetro:    { type: 'osm', osmType: 'relation', osmId: 207359,  label: 'Los Angeles' },
  ufCampus:   { type: 'local', builder: 'ufCampus', label: 'UF Campus' },
  brickell:   { type: 'local', builder: 'brickell', label: 'Brickell' },
  malTFR:     { type: 'local', builder: 'malTFR', label: 'Mar-a-Lago TFR' },
  pbiNoUAS:   { type: 'local', builder: 'pbiNoUAS', label: 'PBI No-UAS Zone' },
  bhgTFR:     { type: 'local', builder: 'bhgTFR', label: 'BHG TFR' },
};

// ── Script context (computed at runtime) ────────────────────────

export interface ScriptContext {
  bhg: { lat: number; lng: number };
  centroids: Record<string, [number, number]>;
  sideOffsets: Record<string, { lat: number; lng: number }>;
  nodeCount: number;
}

// ── Script builder ──────────────────────────────────────────────

function off(ctx: ScriptContext, key: string): { offLat: number; offLng: number } {
  const [cLng, cLat] = ctx.centroids[key];
  return { offLat: ctx.bhg.lat - cLat, offLng: ctx.bhg.lng - cLng };
}

function offTo(ctx: ScriptContext, key: string, targetLat: number, targetLng: number): { offLat: number; offLng: number } {
  const [cLng, cLat] = ctx.centroids[key];
  return { offLat: targetLat - cLat, offLng: targetLng - cLng };
}

export function buildFlagshipScript(ctx: ScriptContext): StepDef[] {
  const { bhg } = ctx;
  const [flLng, flLat] = ctx.centroids.florida;
  const njSide = ctx.sideOffsets.newJersey;
  const nySide = ctx.sideOffsets.nyState;

  return [
    // ── 1  Start on UF Campus — show nodes ──
    {
      caption: 'University of Florida',
      sub: 'Gainesville, Florida',
      revealNodes: true,
      add: [{ tag: 'campus_intro', name: 'UF Campus', key: 'ufCampus', color: OVERLAY_COLORS.ufCampus, opacity: 0.25 }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 14, duration: 2 },
      waitAfter: 2000,
    },
    // ── 2  Zoom to Gainesville city — nodes still visible ──
    {
      caption: 'City of Gainesville',
      sub: '63 sq mi',
      remove: ['campus_intro'],
      add: [{ tag: 'gvl_intro', name: 'Gainesville', key: 'gainesville', color: OVERLAY_COLORS.gainesville, opacity: 0.2 }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 12, duration: 2.5 },
      waitAfter: 1500,
    },
    // ── 3  Zoom to Florida — hide nodes ──
    {
      caption: 'Florida',
      sub: '65,758 sq mi',
      hideNodes: true,
      remove: ['gvl_intro'],
      add: [{ tag: 'fl', name: 'Florida', key: 'florida', color: OVERLAY_COLORS.florida, opacity: 0.4 }],
      flyTo: { lat: flLat, lng: flLng, zoom: 6, duration: 2.5 },
      waitAfter: 1200,
    },
    // ── 4  NJ slides in beside Florida ──
    {
      caption: 'New Jersey',
      sub: '8,723 sq mi — the drone mystery state',
      add: [{ tag: 'nj', name: 'New Jersey', key: 'newJersey', color: OVERLAY_COLORS.newJersey, opacity: 0.45, offLat: njSide.lat, offLng: njSide.lng }],
      flyTo: { lat: flLat, lng: flLng + 4, zoom: 5, duration: 2.5 },
      waitAfter: 1500,
    },
    // ── 5  NJ + FL drone site labels ──
    {
      caption: 'Mystery Drone Sighting Locations',
      sub: 'Military bases and VIP properties — the same targets exist in Florida',
      markers: [
        { set: 'nj', offLat: njSide.lat, offLng: njSide.lng },
        { set: 'fl', offLat: 0, offLng: 0 },
      ],
      waitAfter: 4000,
    },
    // ── 6  NJ slides back ──
    {
      caption: 'New Jersey',
      sub: 'Returning to its real position',
      clearMarkers: true,
      animate: [{ tag: 'nj', fromLat: njSide.lat, fromLng: njSide.lng, toLat: 0, toLng: 0, duration: 2000 }],
      waitAfter: 500,
    },
    // ── 7  NY appears at comparison slot directly ──
    {
      caption: 'New York',
      sub: '54,556 sq mi — side by side at the same latitude',
      fade: [{ tag: 'nj', opacity: 0.1 }],
      add: [{ tag: 'ny', name: 'New York', key: 'nyState', color: OVERLAY_COLORS.nyState, opacity: 0.4, offLat: nySide.lat, offLng: nySide.lng }],
      flyTo: { lat: flLat, lng: flLng + 4, zoom: 5, duration: 2.5 },
      waitAfter: 1500,
    },
    // ── 9  NY + FL site labels ──
    {
      caption: 'The Same Vulnerabilities',
      sub: 'Military bases, VIP properties, airports — everywhere',
      markers: [
        { set: 'ny', offLat: nySide.lat, offLng: nySide.lng },
        { set: 'fl', offLat: 0, offLng: 0 },
      ],
      waitAfter: 4000,
    },
    // ── Manhattan on shifted NY ──
    {
      caption: 'Manhattan',
      sub: '23 sq mi — the island at the center of it all',
      clearMarkers: true,
      add: [{ tag: 'manhat', name: 'Manhattan', key: 'manhattan', color: OVERLAY_COLORS.manhattan, opacity: 0.7, offLat: nySide.lat, offLng: nySide.lng }],
      flyTo: { lat: flLat, lng: flLng + 8, zoom: 7, duration: 2 },
      waitAfter: 2000,
    },
    // ── Zoom to Mar-a-Lago with Manhattan shifted beside it ──
    {
      caption: 'Mar-a-Lago',
      sub: 'Palm Beach, Florida',
      fade: [{ tag: 'ny', opacity: 0.08 }, { tag: 'fl', opacity: 0.08 }, { tag: 'nj', opacity: 0.05 }],
      add: [{ tag: 'mal', name: 'Mar-a-Lago', key: 'marALago', color: OVERLAY_COLORS.marALago, opacity: 0.7 }],
      flyTo: { lat: 26.677, lng: -80.037, zoom: 14, duration: 3 },
    },
    {
      sub: '~17 acres vs Manhattan\'s 23 sq mi',
      fade: [{ tag: 'manhat', opacity: 0.5 }],
      add: [{ tag: 'manhat_cmp', name: 'Manhattan', key: 'manhattan', color: OVERLAY_COLORS.manhattan, opacity: 0.35, ...offTo(ctx, 'manhattan', 26.677, -80.037 + 0.08) }],
      waitAfter: 3500,
    },
    // ── Remove Manhattan comparison, show Mar-a-Lago detail ──
    {
      sub: '~17 acres of restricted airspace',
      remove: ['manhat_cmp'],
      waitAfter: 1500,
    },
    // ── TFR around Mar-a-Lago ──
    {
      caption: 'FAA Temporary Flight Restriction',
      sub: '10 nautical mile no-fly zone — active during presidential visits',
      add: [{ tag: 'malTFR', name: 'Mar-a-Lago TFR', key: 'malTFR', color: OVERLAY_COLORS.malTFR, opacity: 0.12 }],
      flyTo: { lat: 26.677, lng: -80.037, zoom: 11, duration: 2 },
      waitAfter: 2500,
    },
    // ── PBI 5 NM No-UAS Zone ──
    {
      caption: 'Palm Beach International Airport',
      sub: '5 nautical mile FAA no-UAS zone — overlapping the TFR',
      add: [{ tag: 'pbiNoUAS', name: 'PBI No-UAS Zone', key: 'pbiNoUAS', color: OVERLAY_COLORS.pbiNoUAS, opacity: 0.15 }],
      waitAfter: 3000,
    },
    // ── Remove airspace layers, move to BHG ──
    {
      caption: 'Moving to Gainesville',
      sub: 'Bringing it to Ben Hill Griffin Stadium',
      revealNodes: true,
      remove: ['ny', 'fl', 'nj', 'manhat', 'malTFR', 'pbiNoUAS'],
      animate: [{
        tag: 'mal', fromLat: 0, fromLng: 0,
        toLat: off(ctx, 'marALago').offLat, toLng: off(ctx, 'marALago').offLng,
        duration: 3500,
        concurrent: { lat: bhg.lat, lng: bhg.lng, zoom: 15, duration: 3.5 },
      }],
      waitAfter: 800,
    },
    // ── Ben Hill Griffin TFR ──
    {
      caption: 'Ben Hill Griffin Stadium',
      sub: '3 nautical mile game-day TFR — The Swamp',
      add: [{ tag: 'bhgTFR', name: 'BHG TFR', key: 'bhgTFR', color: OVERLAY_COLORS.bhgTFR, opacity: 0.12 }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 13, duration: 2 },
      waitAfter: 3000,
    },
    // ── Remove TFR, keep BHG reference, show campus ──
    {
      caption: 'University of Florida Campus',
      sub: 'West University Ave to Archer Rd · 34th St to 13th St',
      remove: ['bhgTFR'],
      add: [{ tag: 'campus', name: 'UF Campus', key: 'ufCampus', color: OVERLAY_COLORS.ufCampus, opacity: 0.2 }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 14, duration: 1.5 },
      waitAfter: 2000,
    },
    // ── White House — placed SE of BHG on campus ──
    {
      caption: 'The White House',
      sub: '18 acres — fits inside the UF campus',
      add: [{ tag: 'wh', name: 'White House', key: 'whiteHouse', color: OVERLAY_COLORS.whiteHouse, opacity: 0.65, ...offTo(ctx, 'whiteHouse', 29.650, -82.358) }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 15, duration: 1.5 },
      waitAfter: 2000,
    },
    // ── Vatican City — placed SW on campus ──
    {
      caption: 'Vatican City',
      sub: '0.17 sq mi — the world\'s smallest country, inside the campus',
      add: [{ tag: 'vc', name: 'Vatican City', key: 'vaticanCity', color: OVERLAY_COLORS.vaticanCity, opacity: 0.65, ...offTo(ctx, 'vaticanCity', 29.641, -82.360) }],
      waitAfter: 2000,
    },
    // ── Brickell — placed W of BHG on campus ──
    {
      caption: 'Brickell, Miami',
      sub: '"Wall Street South" — all of it fits on campus',
      add: [{ tag: 'brickell', name: 'Brickell', key: 'brickell', color: OVERLAY_COLORS.brickell, opacity: 0.6, ...offTo(ctx, 'brickell', 29.645, -82.340) }],
      waitAfter: 2000,
    },
    // ── 18  All small sites on campus — hold ──
    {
      caption: 'One Campus',
      sub: 'The White House, Mar-a-Lago, Vatican City, and Brickell — all fit inside UF',
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 15, duration: 1.5 },
      waitAfter: 3000,
    },
    // ── 19  Clear small overlays, continue with bigger comparisons ──
    {
      caption: 'Scaling Up',
      sub: 'Now for the bigger picture',
      remove: ['wh', 'mal', 'vc', 'brickell'],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 13, duration: 2 },
      waitAfter: 1500,
    },
    // ── MetLife Stadium ──
    {
      caption: 'MetLife Stadium',
      sub: '82,500 seats — NFL\'s largest venue',
      add: [{ tag: 'metlife', name: 'MetLife Stadium', key: 'metlife', color: OVERLAY_COLORS.metlife, opacity: 0.65, ...off(ctx, 'metlife') }],
      waitAfter: 2500,
    },
    // ── Bergen County — MetLife's county ──
    {
      caption: 'Bergen County',
      sub: 'Where MetLife Stadium sits — 247 sq mi of the drone sighting zone',
      add: [{ tag: 'bergenCo', name: 'Bergen County', key: 'bergenCo', color: OVERLAY_COLORS.bergenCo, opacity: 0.25, ...off(ctx, 'bergenCo') }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 11, duration: 2 },
      waitAfter: 3000,
    },
    // ── Clear medium overlays before city comparisons ──
    {
      caption: 'City Scale',
      sub: 'Now comparing entire cities',
      remove: ['metlife', 'bergenCo'],
      waitAfter: 1000,
    },
    // ── Gainesville city boundary — at real position ──
    {
      caption: 'City of Gainesville',
      sub: '63 sq mi',
      add: [{ tag: 'gvl', name: 'Gainesville', key: 'gainesville', color: OVERLAY_COLORS.gainesville, opacity: 0.2 }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 11, duration: 2 },
      waitAfter: 1500,
    },
    // ── Miami tucked to the right edge of Gainesville ──
    {
      caption: 'City of Miami',
      sub: '~56 sq mi — side by side with Gainesville\'s 63 sq mi',
      add: [{ tag: 'miami', name: 'Miami', key: 'miami', color: OVERLAY_COLORS.miami, opacity: 0.25, ...offTo(ctx, 'miami', bhg.lat - 0.2, bhg.lng) }],
      waitAfter: 2500,
    },
    // ── NYC overlaid on both ──
    {
      caption: 'New York City',
      sub: '302 sq mi — all 5 boroughs overlaid on Gainesville and Miami',
      add: [{ tag: 'nyc', name: 'New York City', key: 'nycMetro', color: OVERLAY_COLORS.nycMetro, opacity: 0.15, ...off(ctx, 'nycMetro') }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 10, duration: 2 },
      waitAfter: 2500,
    },
    // ── Borough comparisons ──
    {
      caption: 'Borough Scale',
      sub: 'Miami (~56 sq mi) ≈ Staten Island (58 sq mi) · Gainesville (~63 sq mi) ≈ Brooklyn (70 sq mi)',
      waitAfter: 3500,
    },
    {
      sub: 'Queens alone is 109 sq mi — larger than Miami and Gainesville combined',
      waitAfter: 3000,
    },
    // ── 23  Fly to LA ──
    {
      caption: 'Los Angeles 2028',
      sub: 'The next Olympic CUAS challenge',
      remove: ['mal', 'wh', 'brickell', 'vc', 'metlife', 'bergenCo', 'miami', 'nyc', 'campus'],
      fade: [{ tag: 'gvl', opacity: 0.08 }],
      flyTo: { lat: 34.05, lng: -118.25, zoom: 10, duration: 3 },
    },
    {
      sub: '5 major venues across 469 sq mi',
      add: [{ tag: 'la', name: 'Los Angeles', key: 'laMetro', color: OVERLAY_COLORS.laMetro, opacity: 0.25 }],
      markers: [{ set: 'laVenues', offLat: 0, offLng: 0 }],
      waitAfter: 4000,
    },
    // ── Bring LA to left of Gainesville with campus visible ──
    {
      caption: 'LA Venues at Gainesville Scale',
      sub: 'Every Olympic venue fits inside the detection network',
      clearMarkers: true,
      remove: ['la'],
      add: [
        { tag: 'la_bhg', name: 'Los Angeles', key: 'laMetro', color: OVERLAY_COLORS.laMetro, opacity: 0.12, ...offTo(ctx, 'laMetro', bhg.lat, bhg.lng - 0.5) },
        { tag: 'campus_la', name: 'UF Campus', key: 'ufCampus', color: OVERLAY_COLORS.ufCampus, opacity: 0.25 },
      ],
      flyTo: { lat: bhg.lat, lng: bhg.lng - 0.2, zoom: 10, duration: 3 },
    },
    {
      sub: 'LA\'s 469 sq mi next to Gainesville — with UF campus and The Swamp for reference',
      markers: [{ set: 'laVenues', ...offTo(ctx, 'laMetro', bhg.lat, bhg.lng - 0.5) }],
      waitAfter: 4000,
    },
    // ── Clean up LA before detection nodes ──
    {
      remove: ['la_bhg', 'campus_la'],
      clearMarkers: true,
      waitAfter: 500,
    },
    // ── 27  Detection nodes ──
    {
      showNodes: true,
      waitAfter: 3000,
    },
    // ── 28  Clean finale ──
    {
      caption: 'Total Coverage',
      sub: 'The merged detection network — light green: 1-3 nodes, bright green: 4+ overlapping',
      clearMarkers: true,
      remove: ['_all_except_gvl'],
      fade: [{ tag: 'gvl', opacity: 0.2 }],
      add: [{ tag: 'campus_f', name: 'UF Campus', key: 'ufCampus', color: OVERLAY_COLORS.ufCampus, opacity: 0.15 }],
      flyTo: { lat: bhg.lat, lng: bhg.lng, zoom: 14, duration: 2.5 },
      waitAfter: 3000,
    },
    {
      caption: 'Gainesville, Florida',
      sub: 'Passive detection at scale. Total airspace awareness.',
      waitAfter: 4000,
    },
  ];
}
