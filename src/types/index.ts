import type { Feature, Polygon, MultiPolygon } from 'geojson';

export interface MapOverlay {
  id: string;
  name: string;
  originalName: string;
  feature: Feature<Polygon | MultiPolygon>;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  areaSqKm: number;
  areaSqMi: number;
  offsetLat: number;
  offsetLng: number;
}

export interface DetectionNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  visible: boolean;
}

export const NODE_COLORS = [
  '#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444',
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316',
];

export interface CoverageTier {
  id: string;
  label: string;
  altitudeFt: number;
  probability: number;
  radiusMiles: number;
  color: string;
  visible: boolean;
}

export const DEFAULT_COVERAGE_TIERS: CoverageTier[] = [
  { id: 'tier-400', label: '400ft+', altitudeFt: 400, probability: 0.99, radiusMiles: 2, color: '#10b981', visible: true },
  { id: 'tier-200', label: '200ft',  altitudeFt: 200, probability: 0.75, radiusMiles: 2, color: '#f59e0b', visible: true },
  { id: 'tier-100', label: '100ft',  altitudeFt: 100, probability: 0.50, radiusMiles: 2, color: '#ef4444', visible: true },
];

export const MILES_TO_METERS = 1609.344;

export interface PresetPlace {
  name: string;
  category: 'city' | 'country' | 'region' | 'landmark' | 'state' | 'stadium' | 'cuas';
  osmId?: number;
  osmType?: 'relation' | 'way' | 'node';
  searchQuery?: string;
  description?: string;
  geojson?: Feature<Polygon | MultiPolygon>;
}

export interface SearchResult {
  display_name: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  boundingbox: string[];
  geojson?: Feature<Polygon | MultiPolygon>;
}

export type TileLayerOption = 'streets' | 'satellite' | 'dark' | 'light';

export const TILE_LAYERS: Record<TileLayerOption, { url: string; attribution: string; name: string }> = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    name: 'Streets',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    name: 'Satellite',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© CARTO',
    name: 'Dark',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© CARTO',
    name: 'Light',
  },
};

export type ProductTier = 'remote-id' | 'enhanced-detection';
export type PricingModel = 'subscription' | 'capex';

export interface ProductConfig {
  id: ProductTier;
  name: string;
  tagline: string;
  radiusMiles: number;
  pricing: Record<PricingModel, {
    upfront: number;
    annual: number;
    contractYears: number;
    twoYearTotal: number;
    hardwareOwnership: boolean;
    obsolescenceRisk: boolean;
  }>;
}

export const PRODUCTS: ProductConfig[] = [
  {
    id: 'remote-id',
    name: 'Remote ID',
    tagline: '3-mile detection range',
    radiusMiles: 3,
    pricing: {
      subscription: {
        upfront: 0, annual: 37_500, contractYears: 2,
        twoYearTotal: 75_000, hardwareOwnership: false, obsolescenceRisk: false,
      },
      capex: {
        upfront: 35_000, annual: 20_000, contractYears: 0,
        twoYearTotal: 75_000, hardwareOwnership: true, obsolescenceRisk: true,
      },
    },
  },
  {
    id: 'enhanced-detection',
    name: 'Enhanced Detection',
    tagline: '1.5-mile detection range',
    radiusMiles: 1.5,
    pricing: {
      subscription: {
        upfront: 0, annual: 55_000, contractYears: 2,
        twoYearTotal: 110_000, hardwareOwnership: false, obsolescenceRisk: false,
      },
      capex: {
        upfront: 50_000, annual: 30_000, contractYears: 0,
        twoYearTotal: 110_000, hardwareOwnership: true, obsolescenceRisk: true,
      },
    },
  },
];

export const OVERLAY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#facc15',
];
