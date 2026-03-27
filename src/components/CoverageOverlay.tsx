import { useMemo } from 'react';
import { Circle } from 'react-leaflet';
import type { DetectionNode, CoverageTier } from '../types';

interface Props {
  nodes: DetectionNode[];
  tiers: CoverageTier[];
}

export default function CoverageOverlay({ nodes, tiers }: Props) {
  const visibleNodes = useMemo(() => nodes.filter((n) => n.visible), [nodes]);
  const maxTier = useMemo(
    () => tiers.filter((t) => t.visible).sort((a, b) => b.radiusMiles - a.radiusMiles)[0],
    [tiers]
  );

  if (!maxTier || visibleNodes.length === 0) return null;

  const radiusMeters = maxTier.radiusMiles * 1609.34;

  return (
    <>
      {visibleNodes.map((node) => (
        <Circle
          key={`cov-${node.id}`}
          center={[node.lat, node.lng]}
          radius={radiusMeters}
          pathOptions={{
            color: '#22c55e',
            weight: 1,
            opacity: 0.3,
            fillColor: '#86efac',
            fillOpacity: 0.12,
            className: 'coverage-ring',
          }}
        />
      ))}
    </>
  );
}
