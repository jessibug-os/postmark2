import { PALETTE_CSS } from '../art/palette';
import * as THREE from 'three';

/**
 * @deprecated Runtime canvas painting is a compatibility fallback for assets
 * that have not entered the authored PNG pipeline. New code must load texture
 * sheets through AssetLoader instead.
 *
 * Hand-painted canvas texture toolkit. Everything the game "paints" —
 * character faces, clothing folds, wood siding, brick, brass patina — is
 * generated here as small canvas sheets, per the texture-first art direction:
 * detail lives in textures, not geometry.
 *
 * Conventions: all colors are '#rrggbb' strings; shade()/tint() move them in
 * HSL space so hue drifts stay painterly instead of muddy.
 */

export interface Paint {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function paintCanvas(w: number, h: number): Paint {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, w, h };
}

// --- color helpers -------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hh = 0;
  if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hh = ((b - r) / d + 2) / 6;
  else hh = ((r - g) / d + 4) / 6;
  return [hh, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number): string => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Lightness/saturation shift in HSL, with a gentle hue drift toward warm
 * highlights and cool shadows — the classic painter's trick. Returns hex so
 * results can feed back into shade()/withAlpha(). */
export function shade(hex: string, dl: number, ds = 0, dh = 0): string {
  const [h, s, l] = hexToHsl(hex);
  // Painterly drift: lighter → warmer, darker → cooler (unless overridden).
  const drift = dh !== 0 ? dh : dl * -0.045;
  const nh = (h + drift + 1) % 1;
  const ns = THREE.MathUtils.clamp(s + ds, 0, 1);
  const nl = THREE.MathUtils.clamp(l + dl, 0, 1);
  return hslToHex(nh, ns, nl);
}

export function withAlpha(hex: string, a: number): string {
  const [h, s, l] = hexToHsl(hex);
  return `hsla(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;
}

// --- primitive brushes ---------------------------------------------------

/** Flat base coat with soft mottled blotches — the underpainting. */
export function mottle(p: Paint, base: string, opts: { blotches?: number; strength?: number; scale?: number } = {}): void {
  const { ctx, w, h } = p;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const n = opts.blotches ?? 26;
  const str = opts.strength ?? 0.05;
  const scale = opts.scale ?? 0.24;
  for (let i = 0; i < n; i++) {
    const r = (0.4 + Math.random() * 0.9) * scale * Math.min(w, h);
    const light = (Math.random() - 0.45) * 2 * str;
    ctx.fillStyle = withAlpha(shade(base, light), 0.5);
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, r, r * (0.5 + Math.random() * 0.7), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Directional dry-brush strokes over whatever is beneath. */
export function strokes(
  p: Paint,
  base: string,
  opts: { count?: number; vertical?: boolean; length?: number; width?: number; strength?: number } = {},
): void {
  const { ctx, w, h } = p;
  const n = opts.count ?? 40;
  const len = (opts.length ?? 0.5) * (opts.vertical ? h : w);
  const wid = opts.width ?? 2;
  const str = opts.strength ?? 0.06;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const light = (Math.random() - 0.5) * 2 * str;
    ctx.strokeStyle = withAlpha(shade(base, light), 0.28 + Math.random() * 0.3);
    ctx.lineWidth = wid * (0.5 + Math.random());
    const x = Math.random() * w;
    const y = Math.random() * h;
    const l = len * (0.4 + Math.random() * 0.8);
    const wob = (Math.random() - 0.5) * 6;
    ctx.beginPath();
    if (opts.vertical) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + wob, y + l / 2, x + wob * 0.4, y + l);
    } else {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + l / 2, y + wob, x + l, y + wob * 0.4);
    }
    ctx.stroke();
  }
}

/** Wrap a finished canvas as a scene texture. */
export function toTexture(p: Paint, opts: { repeat?: [number, number] } = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(p.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return tex;
}

// --- material sheets -----------------------------------------------------

const sheetCache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let tex = sheetCache.get(key);
  if (!tex) {
    tex = make();
    sheetCache.set(key, tex);
  }
  return tex;
}

/** Painted wood siding: horizontal planks, grain streaks, nail shadows. */
export function woodSheet(base: string, opts: { vertical?: boolean; planks?: number } = {}): THREE.CanvasTexture {
  return cached(`wood-${base}-${opts.vertical ? 'v' : 'h'}-${opts.planks ?? 6}`, () => {
    const p = paintCanvas(128, 128);
    const { ctx } = p;
    mottle(p, base, { strength: 0.04 });
    strokes(p, base, { vertical: opts.vertical, count: 46, length: 0.8, width: 1.6, strength: 0.07 });
    const planks = opts.planks ?? 6;
    const step = 128 / planks;
    for (let i = 0; i <= planks; i++) {
      const at = Math.round(i * step) + (Math.random() - 0.5) * 1.4;
      // Shadow seam + bright top edge for each board.
      ctx.strokeStyle = withAlpha(shade(base, -0.14), 0.85);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (opts.vertical) { ctx.moveTo(at, 0); ctx.lineTo(at, 128); } else { ctx.moveTo(0, at); ctx.lineTo(128, at); }
      ctx.stroke();
      ctx.strokeStyle = withAlpha(shade(base, 0.08), 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (opts.vertical) { ctx.moveTo(at + 1.5, 0); ctx.lineTo(at + 1.5, 128); } else { ctx.moveTo(0, at + 1.5); ctx.lineTo(128, at + 1.5); }
      ctx.stroke();
      // Occasional knot in a plank.
      if (Math.random() < 0.5 && i < planks) {
        const kx = Math.random() * 118 + 5;
        const ky = at + step * (0.3 + Math.random() * 0.4);
        ctx.fillStyle = withAlpha(shade(base, -0.1), 0.7);
        ctx.beginPath();
        if (opts.vertical) ctx.ellipse(at + step * 0.5, kx, 2.4, 3.4, 0, 0, Math.PI * 2);
        else ctx.ellipse(kx, ky, 3.4, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return toTexture(p, { repeat: [1, 1] });
  });
}

/** Painted brick courses with mortar lines and tonal variation per brick. */
export function brickSheet(base: string, mortar: string): THREE.CanvasTexture {
  return cached(`brick-${base}-${mortar}`, () => {
    const p = paintCanvas(128, 128);
    const { ctx } = p;
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, 128, 128);
    const rows = 8;
    const cols = 4;
    const bh = 128 / rows;
    const bw = 128 / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < cols; c++) {
        const light = (Math.random() - 0.5) * 0.14;
        ctx.fillStyle = shade(base, light);
        const x = c * bw + off + 1;
        const y = r * bh + 1;
        ctx.fillRect(x, y, bw - 2, bh - 2);
        // Worn top-edge highlight.
        ctx.fillStyle = withAlpha(shade(base, light + 0.09), 0.6);
        ctx.fillRect(x, y, bw - 2, 1.4);
      }
    }
    // Age wash.
    mottleOver(p, base, 8, 0.06);
    return toTexture(p, { repeat: [1, 1] });
  });
}

/** Soft plaster with hairline cracks — for cottage walls. */
export function plasterSheet(base: string): THREE.CanvasTexture {
  return cached(`plaster-${base}`, () => {
    const p = paintCanvas(128, 128);
    const { ctx } = p;
    mottle(p, base, { strength: 0.045, blotches: 34 });
    strokes(p, base, { count: 26, length: 0.4, width: 3, strength: 0.04 });
    // A couple of hairline cracks.
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = withAlpha(shade(base, -0.16), 0.5);
      ctx.lineWidth = 0.8;
      let x = Math.random() * 128;
      let y = Math.random() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 14;
        y += 10 + Math.random() * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return toTexture(p, { repeat: [1, 1] });
  });
}

/** Cloth with soft vertical fold shading and a hand-stitched hem. */
export function fabricSheet(base: string, opts: { folds?: number; hem?: boolean } = {}): THREE.CanvasTexture {
  return cached(`fabric-${base}-${opts.folds ?? 5}-${opts.hem !== false}`, () => {
    const p = paintCanvas(128, 128);
    const { ctx } = p;
    mottle(p, base, { strength: 0.03, blotches: 18 });
    const folds = opts.folds ?? 5;
    for (let i = 0; i < folds; i++) {
      const x = ((i + 0.5) / folds) * 128 + (Math.random() - 0.5) * 10;
      const grad = ctx.createLinearGradient(x - 11, 0, x + 11, 0);
      grad.addColorStop(0, withAlpha(shade(base, 0.06), 0));
      grad.addColorStop(0.35, withAlpha(shade(base, 0.07), 0.55));
      grad.addColorStop(0.62, withAlpha(shade(base, -0.09), 0.55));
      grad.addColorStop(1, withAlpha(shade(base, -0.1), 0));
      ctx.fillStyle = grad;
      ctx.fillRect(x - 11, 0, 22, 128);
    }
    // Weave suggestion.
    strokes(p, base, { vertical: true, count: 30, length: 0.6, width: 1, strength: 0.03 });
    if (opts.hem !== false) {
      ctx.strokeStyle = withAlpha(shade(base, -0.18), 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 122);
      ctx.lineTo(128, 122);
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = withAlpha(shade(base, 0.14), 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 118);
      ctx.lineTo(128, 118);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return toTexture(p);
  });
}

/** Aged metal: brushed sheen bands, patina blotches, rivet seam. */
export function metalSheet(base: string, opts: { rivets?: boolean; patina?: string } = {}): THREE.CanvasTexture {
  return cached(`metal-${base}-${opts.rivets !== false}-${opts.patina ?? ''}`, () => {
    const p = paintCanvas(128, 128);
    const { ctx } = p;
    mottle(p, base, { strength: 0.05, blotches: 20 });
    strokes(p, base, { count: 44, length: 0.9, width: 1.4, strength: 0.08 });
    // Patina blooms (verdigris on brass/copper by default).
    const patina = opts.patina ?? PALETTE_CSS.h5a7a68;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = withAlpha(patina, 0.1 + Math.random() * 0.12);
      const r = 5 + Math.random() * 14;
      ctx.beginPath();
      ctx.ellipse(Math.random() * 128, Math.random() * 128, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    if (opts.rivets !== false) {
      // A single rivet seam line — repeats read as panel joins.
      const y = 34 + Math.random() * 60;
      ctx.strokeStyle = withAlpha(shade(base, -0.12), 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();
      for (let x = 8; x < 128; x += 16) {
        ctx.fillStyle = shade(base, -0.14);
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha(shade(base, 0.12), 0.9);
        ctx.beginPath();
        ctx.arc(x - 0.6, y - 0.6, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return toTexture(p);
  });
}

/** Wallpaper stripes: two-tone vertical bands with painterly wobble. */
export function stripeSheet(a: string, b: string): THREE.CanvasTexture {
  return cached(`stripe-${a}-${b}`, () => {
    const p = paintCanvas(128, 128);
    const { ctx } = p;
    mottle(p, a, { strength: 0.03, blotches: 14 });
    const bands = 8;
    const bw = 128 / bands;
    for (let i = 0; i < bands; i += 2) {
      ctx.fillStyle = withAlpha(b, 0.9);
      ctx.fillRect(i * bw + Math.sin(i) * 0.8, 0, bw, 128);
    }
    strokes(p, a, { vertical: true, count: 20, length: 0.7, width: 1.4, strength: 0.03 });
    return toTexture(p, { repeat: [1, 1] });
  });
}

/** Post-pass mottle over existing art (used by sheets above). */
function mottleOver(p: Paint, base: string, n: number, strength: number): void {
  const { ctx, w, h } = p;
  for (let i = 0; i < n; i++) {
    const r = (0.2 + Math.random() * 0.5) * 0.35 * Math.min(w, h);
    ctx.fillStyle = withAlpha(shade(base, (Math.random() - 0.5) * 2 * strength), 0.3);
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}
