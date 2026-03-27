import { Download } from 'lucide-react';
import type { MapOverlay } from '../types';
import { translateFeature } from '../lib/geo';
import { exportGeoJSON } from '../lib/api';

interface Props {
  overlays: MapOverlay[];
}

export default function ExportButton({ overlays }: Props) {
  if (overlays.length === 0) return null;

  function handleExport() {
    const features = overlays.map((o) => {
      const translated = translateFeature(o.feature, o.offsetLat, o.offsetLng);
      return {
        ...translated,
        properties: {
          name: o.name,
          color: o.color,
          areaSqMi: o.areaSqMi,
          areaSqKm: o.areaSqKm,
        },
      };
    });

    const json = exportGeoJSON(features);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'maps-comparison.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-colors text-xs"
    >
      <Download className="w-3.5 h-3.5" />
      Export GeoJSON
    </button>
  );
}
