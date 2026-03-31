import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ViewshedResult } from '../lib/viewshed';

interface Props {
  viewshed: ViewshedResult | null;
  visible: boolean;
}

function createViewshedImage(vs: ViewshedResult): string {
  const canvas = document.createElement('canvas');
  canvas.width = vs.cols;
  canvas.height = vs.rows;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(vs.cols, vs.rows);
  const pixels = imgData.data;

  const maxCount = Math.max(1, vs.overlapTarget);

  for (let i = 0; i < vs.visibilityCount.length; i++) {
    const count = vs.visibilityCount[i];
    const px = i * 4;

    if (count === 0) {
      pixels[px] = 220;
      pixels[px + 1] = 40;
      pixels[px + 2] = 40;
      pixels[px + 3] = 90;
    } else if (count >= maxCount) {
      pixels[px] = 34;
      pixels[px + 1] = 197;
      pixels[px + 2] = 94;
      pixels[px + 3] = 70;
    } else {
      const t = count / maxCount;
      pixels[px] = Math.round(245 * (1 - t) + 34 * t);
      pixels[px + 1] = Math.round(158 * (1 - t) + 197 * t);
      pixels[px + 2] = Math.round(11 * (1 - t) + 94 * t);
      pixels[px + 3] = 80;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export default function ViewshedOverlay({ viewshed, visible }: Props) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }

    if (!viewshed || !visible) return;

    const imgUrl = createViewshedImage(viewshed);
    const bounds: L.LatLngBoundsExpression = [
      [viewshed.south, viewshed.west],
      [viewshed.north, viewshed.east],
    ];

    const overlay = L.imageOverlay(imgUrl, bounds, {
      opacity: 0.6,
      interactive: false,
      className: 'viewshed-overlay',
    }).addTo(map);

    overlayRef.current = overlay;

    return () => {
      overlay.remove();
    };
  }, [viewshed, visible, map]);

  return null;
}
