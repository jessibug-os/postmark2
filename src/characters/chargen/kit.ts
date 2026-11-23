import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import { SLOTS, type Channel, type Slot } from './recipe';
import { hexToRgb, type RGB } from './facePaint';

export const KIT_ASSET = 'chargen-kit';

type Rect = [number, number, number, number];

interface PixelRect {
  channel: Channel;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dominant: RGB;
}

export interface Kit {
  options: Record<Slot, string[]>;
  size: number;
  atlas: ImageData;
  regions: PixelRect[];
  clips: THREE.AnimationClip[];
}

let cached: Kit | null = null;

function dominantColor(data: Uint8ClampedArray, size: number, rect: Omit<PixelRect, 'dominant' | 'channel'>): RGB {
  const buckets = new Map<number, { count: number; sum: RGB }>();
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const i = (py * size + px) * 4;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] };
      bucket.count++;
      bucket.sum[0] += data[i];
      bucket.sum[1] += data[i + 1];
      bucket.sum[2] += data[i + 2];
      buckets.set(key, bucket);
    }
  }
  const best = [...buckets.values()].reduce((a, b) => (b.count > a.count ? b : a));
  return best.sum.map((v) => v / best.count) as RGB;
}

export function kit(): Kit {
  if (cached) return cached;
  const template = assets.model(KIT_ASSET);
  const extras = template.userData as { kit_rects: string; kit_tints: string; kit_atlas: number };
  const rects = JSON.parse(extras.kit_rects) as Record<string, Rect>;
  const tints = JSON.parse(extras.kit_tints) as Record<string, Channel>;
  const options = Object.fromEntries(SLOTS.map((slot) => [slot, [] as string[]])) as Record<Slot, string[]>;
  let image: CanvasImageSource | null = null;
  template.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const slot = object.userData.kit_slot as Slot | 'body';
    if (object.userData.atlas !== 'head') {
      image ??= ((object.material as THREE.MeshLambertMaterial).map?.image as CanvasImageSource) ?? null;
    }
    if (slot === 'body') return;
    for (const part of String(object.userData.kit_part).split(',')) {
      if (!options[slot].includes(part)) options[slot].push(part);
    }
  });
  if (!image) throw new Error('chargen kit has no body atlas');
  const size = extras.kit_atlas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, size, size);
  const atlas = ctx.getImageData(0, 0, size, size);
  const regions = Object.entries(tints).map(([name, channel]) => {
    const [u0, v0, u1, v1] = rects[name];
    const rect = {
      x0: Math.floor(u0 * size),
      x1: Math.ceil(u1 * size),
      y0: Math.floor((1 - v1) * size),
      y1: Math.ceil((1 - v0) * size),
    };
    return { ...rect, channel, dominant: dominantColor(atlas.data, size, rect) };
  });
  cached = { options, size, atlas, regions, clips: assets.animations(KIT_ASSET) };
  return cached;
}

export function paintBody(target: ImageData, colors: Partial<Record<Channel, string>>): void {
  const { atlas, regions, size } = kit();
  target.data.set(atlas.data);
  const data = target.data;
  for (const region of regions) {
    const hex = colors[region.channel];
    if (!hex) continue;
    const [dr, dg, db] = region.dominant;
    const [cr, cg, cb] = hexToRgb(hex);
    for (let py = region.y0; py < region.y1; py++) {
      for (let px = region.x0; px < region.x1; px++) {
        const i = (py * size + px) * 4;
        const dist = Math.hypot(data[i] - dr, data[i + 1] - dg, data[i + 2] - db);
        const weight = Math.min(1, Math.max(0, (110 - dist) / 70));
        if (weight === 0) continue;
        data[i] += (cr - dr) * weight;
        data[i + 1] += (cg - dg) * weight;
        data[i + 2] += (cb - db) * weight;
      }
    }
  }
}
