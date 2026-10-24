import { PALETTE_CSS } from '../art/palette';
import { item } from '../data/items';

/**
 * Painted item icons. The game is emoji-free everywhere else, so its inventory
 * should be too: instead of a wall of 🐟🦋🪲, each item gets a small
 * hand-painted glyph keyed to its category, tinted per-item so a full pocket
 * reads as a painterly collection rather than a keyboard picker.
 *
 * Everything is drawn into a 64-unit box; callers scale to whatever size they
 * need. Canvases are cached per id.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const hsl = (h: number, s: number, l: number): string =>
  `hsl(${Math.round(((h % 1) + 1) % 1 * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

/** Draw the icon for `itemId` into ctx, filling a 64x64 box at the origin. */
export function paintItemIcon(ctx: CanvasRenderingContext2D, itemId: string): void {
  const def = item(itemId);
  const r = hash(itemId);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Per-item hue, nudged into a category-appropriate band so a fish looks
  // fishy and a leaf looks leafy while still varying piece to piece.
  const band = (base: number, spread: number): number => base + (r - 0.5) * spread;

  switch (def.category) {
    case 'fish': {
      const hue = band(0.55, 0.5); // blue-green through amber
      body(ctx, hue, r);
      // teardrop body + tail fin
      ctx.fillStyle = hsl(hue, 0.5, 0.6);
      ctx.strokeStyle = hsl(hue, 0.55, 0.32);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(30, 34, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(46, 34); ctx.lineTo(58, 24); ctx.lineTo(56, 44);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      dot(ctx, 22, 30, 2.6, hsl(hue, 0.6, 0.18));
      sheen(ctx, 24, 27, hue);
      break;
    }
    case 'bug': {
      const hue = band(0.12, 0.9);
      body(ctx, hue, r);
      const flutter = r < 0.5;
      ctx.fillStyle = hsl(hue, 0.5, 0.62);
      ctx.strokeStyle = hsl(hue, 0.55, 0.3);
      ctx.lineWidth = 2.2;
      if (flutter) {
        // butterfly: four wings
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(32 + sx * 12, 26, 11, 9, sx * 0.5, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(32 + sx * 10, 40, 8, 7, -sx * 0.4, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = hsl(hue, 0.4, 0.25);
        ctx.fillRect(30, 20, 4, 26);
      } else {
        // beetle: domed shell + head
        ctx.beginPath();
        ctx.ellipse(32, 36, 15, 17, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(32, 20); ctx.lineTo(32, 52);
        ctx.strokeStyle = hsl(hue, 0.5, 0.25);
        ctx.stroke();
        dot(ctx, 32, 17, 6, hsl(hue, 0.5, 0.3));
      }
      break;
    }
    case 'sea': {
      const hue=band(.52,.24); body(ctx,hue,r);
      ctx.fillStyle=hsl(hue,.52,.58); ctx.strokeStyle=hsl(hue,.5,.28); ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.arc(32,34,13,Math.PI,0); ctx.lineTo(45,43);
      for(let x=42;x>=20;x-=6) ctx.quadraticCurveTo(x-3,50+(x%3),x-6,43);
      ctx.closePath();ctx.fill();ctx.stroke();
      dot(ctx,27,31,2,hsl(hue,.6,.16)); break;
    }
    case 'fossil': {
      body(ctx,.1,r); ctx.strokeStyle=PALETTE_CSS.hd6c39a;ctx.lineWidth=5;
      ctx.beginPath();ctx.arc(32,34,16,0,Math.PI*1.8);ctx.arc(32,34,9,Math.PI*1.8,.2,true);ctx.stroke();
      dot(ctx,18,49,4,PALETTE_CSS.h9b8058); break;
    }
    case 'art': {
      body(ctx,.08,r);ctx.fillStyle=PALETTE_CSS.h8a623c;ctx.fillRect(10,9,44,46);
      ctx.fillStyle=PALETTE_CSS.he4d2aa;ctx.fillRect(15,14,34,36);
      const forged=def.authentic===false;
      ctx.fillStyle=forged?PALETTE_CSS.h6f8f9b:PALETTE_CSS.hbd754c;
      ctx.beginPath();ctx.moveTo(17,44);ctx.lineTo(29,25);ctx.lineTo(38,38);ctx.lineTo(47,20);ctx.lineTo(47,48);ctx.lineTo(17,48);ctx.fill();
      // Forged canvases visibly carry an extra lower-right ochre mark—the
      // inventory inspection text explains the work-specific authored tell.
      if(forged) dot(ctx,44,44,3,PALETTE_CSS.hd39a45);
      break;
    }
    case 'forage': {
      const hue = band(0.28, 0.16); // greens
      body(ctx, hue, r);
      // a stem with two leaves + a bud
      ctx.strokeStyle = hsl(0.3, 0.4, 0.35);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(32, 52); ctx.lineTo(32, 20); ctx.stroke();
      ctx.fillStyle = hsl(hue, 0.45, 0.5);
      ctx.strokeStyle = hsl(hue, 0.5, 0.3);
      ctx.lineWidth = 2;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(32 + sx * 9, 36, 9, 5, sx * -0.7, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      dot(ctx, 32, 18, 7, hsl(band(0.1, 0.9), 0.55, 0.6));
      break;
    }
    case 'fruit': {
      const hue = band(0.02, 0.1); // red
      body(ctx, hue, r);
      ctx.fillStyle = hsl(hue, 0.6, 0.55);
      ctx.strokeStyle = hsl(hue, 0.6, 0.32);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(32, 38, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hsl(0.09, 0.5, 0.3); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(32, 22); ctx.lineTo(34, 12); ctx.stroke();
      ctx.fillStyle = hsl(0.28, 0.45, 0.45);
      ctx.beginPath(); ctx.ellipse(40, 16, 7, 4, -0.6, 0, Math.PI * 2); ctx.fill();
      sheen(ctx, 26, 31, hue);
      break;
    }
    case 'material': {
      material(ctx, itemId, r);
      break;
    }
    case 'relic': {
      const keepsake = itemId.startsWith('keepsake');
      const hue = keepsake ? 0.11 : band(0.09, 0.2);
      body(ctx, hue, r, keepsake ? 0.5 : 0.25);
      // a faceted gem / artifact on a little stand
      ctx.fillStyle = hsl(hue, 0.55, keepsake ? 0.62 : 0.5);
      ctx.strokeStyle = hsl(hue, 0.6, 0.3);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(32, 14); ctx.lineTo(48, 30); ctx.lineTo(32, 50); ctx.lineTo(16, 30);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hsl(hue, 0.4, 0.7); ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(16, 30); ctx.lineTo(48, 30);
      ctx.moveTo(32, 14); ctx.lineTo(32, 50);
      ctx.stroke();
      if (keepsake) sheen(ctx, 26, 24, hue);
      break;
    }
    case 'tool': {
      tool(ctx, itemId);
      break;
    }
    case 'clothing': {
      const hue = band(0.6, 0.8);
      const tint = def.clothingColor;
      const base = tint !== undefined
        ? `#${tint.toString(16).padStart(6, '0')}`
        : hsl(hue, 0.4, 0.5);
      body(ctx, hue, r, 0.18);
      ctx.fillStyle = base;
      ctx.strokeStyle = 'rgba(40,32,26,0.5)';
      ctx.lineWidth = 2.5;
      // a little folded coat
      ctx.beginPath();
      ctx.moveTo(20, 20); ctx.lineTo(28, 16); ctx.lineTo(36, 16); ctx.lineTo(44, 20);
      ctx.lineTo(50, 30); ctx.lineTo(44, 34); ctx.lineTo(44, 50); ctx.lineTo(20, 50);
      ctx.lineTo(20, 34); ctx.lineTo(14, 30);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, 16); ctx.lineTo(32, 50); ctx.stroke();
      break;
    }
    case 'furniture': {
      const hue = band(0.08, 0.06); // wood
      body(ctx, hue, r, 0.2);
      ctx.fillStyle = hsl(hue, 0.4, 0.45);
      ctx.strokeStyle = hsl(hue, 0.45, 0.26);
      ctx.lineWidth = 2.5;
      // a simple chair silhouette
      ctx.fillRect(22, 30, 20, 6);
      ctx.strokeRect(22, 30, 20, 6);
      ctx.fillRect(22, 16, 5, 20);
      ctx.strokeRect(22, 16, 5, 20);
      ctx.fillRect(24, 36, 4, 14); ctx.strokeRect(24, 36, 4, 14);
      ctx.fillRect(38, 36, 4, 14); ctx.strokeRect(38, 36, 4, 14);
      break;
    }
    default:
      body(ctx, 0.1, r);
  }
  ctx.restore();
}

// --- shared bits -----------------------------------------------------------

/** Soft rounded background wafer so every icon sits on the same painterly disc. */
function body(ctx: CanvasRenderingContext2D, hue: number, r: number, sat = 0.3): void {
  const g = ctx.createRadialGradient(28, 26, 4, 32, 32, 34);
  g.addColorStop(0, hsl(hue, sat, 0.42 + r * 0.06));
  g.addColorStop(1, hsl(hue, sat * 0.8, 0.28));
  ctx.fillStyle = g;
  roundRect(ctx, 4, 4, 56, 56, 14);
  ctx.fill();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function sheen(ctx: CanvasRenderingContext2D, x: number, y: number, hue: number): void {
  ctx.fillStyle = hsl(hue, 0.3, 0.9);
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(x, y, 4, 2.5, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function material(ctx: CanvasRenderingContext2D, id: string, r: number): void {
  if (id === 'timber') {
    body(ctx, 0.08, r, 0.35);
    ctx.fillStyle = PALETTE_CSS.ha07a4c; ctx.strokeStyle = PALETTE_CSS.h5c4530; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(20 + i * 10, 32 - i * 2, 8, 20, 0.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      dot(ctx, 20 + i * 10, 24 - i * 2, 3, PALETTE_CSS.h7a5c3c);
    }
  } else if (id === 'stone') {
    body(ctx, 0.6, r, 0.1);
    ctx.fillStyle = PALETTE_CSS.h9a968c; ctx.strokeStyle = PALETTE_CSS.h5c584e; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(16, 44); ctx.lineTo(22, 24); ctx.lineTo(42, 20); ctx.lineTo(50, 38);
    ctx.lineTo(44, 48); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (id === 'scrap-metal') {
    body(ctx, 0.58, r, 0.12);
    ctx.strokeStyle = PALETTE_CSS.h8a8a86; ctx.fillStyle = PALETTE_CSS.hb0b0aa; ctx.lineWidth = 2.5;
    // a gear
    ctx.save();
    ctx.translate(32, 32);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -20, 8, 8);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    dot(ctx, 32, 32, 5, PALETTE_CSS.h7a7a74);
  } else {
    // amber-cell: a glowing capsule
    body(ctx, 0.09, r, 0.4);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 16);
    g.addColorStop(0, PALETTE_CSS.hffd27a); g.addColorStop(1, PALETTE_CSS.hb8792a);
    ctx.fillStyle = g; ctx.strokeStyle = PALETTE_CSS.h8a5a1e; ctx.lineWidth = 2.5;
    roundRect(ctx, 22, 16, 20, 32, 9); ctx.fill(); ctx.stroke();
    sheen(ctx, 28, 24, 0.11);
  }
}

function tool(ctx: CanvasRenderingContext2D, id: string): void {
  const base = id.replace(/-steel|-fine|-iron|-felling/, '');
  const upgraded = base !== id;
  const hue = 0.09;
  body(ctx, hue, 0.4, upgraded ? 0.15 : 0.3);
  const handle = PALETTE_CSS.h8a6b45;
  const metal = upgraded ? PALETTE_CSS.hc9cdd2 : PALETTE_CSS.h9a9a96;
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  if (base === 'tool-net') {
    ctx.strokeStyle = handle;
    ctx.beginPath(); ctx.moveTo(20, 50); ctx.lineTo(36, 24); ctx.stroke();
    ctx.strokeStyle = metal; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(40, 20, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(230,224,208,0.5)';
    ctx.beginPath(); ctx.arc(40, 20, 11, 0, Math.PI * 2); ctx.fill();
  } else if (base === 'tool-rod') {
    ctx.strokeStyle = handle;
    ctx.beginPath(); ctx.moveTo(16, 50); ctx.lineTo(46, 14); ctx.stroke();
    ctx.strokeStyle = PALETTE_CSS.hd8d0c0; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(46, 14); ctx.lineTo(50, 40); ctx.stroke();
    dot(ctx, 50, 42, 3, PALETTE_CSS.hd8453c);
  } else if (base === 'tool-shovel') {
    ctx.strokeStyle = handle;
    ctx.beginPath(); ctx.moveTo(32, 14); ctx.lineTo(32, 40); ctx.stroke();
    ctx.fillStyle = metal; ctx.strokeStyle = PALETTE_CSS.h5c584e; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 40); ctx.lineTo(40, 40); ctx.lineTo(34, 54); ctx.lineTo(30, 54);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    // axe
    ctx.strokeStyle = handle;
    ctx.beginPath(); ctx.moveTo(24, 52); ctx.lineTo(38, 16); ctx.stroke();
    ctx.fillStyle = metal; ctx.strokeStyle = PALETTE_CSS.h5c584e; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, 16); ctx.quadraticCurveTo(52, 18, 48, 32);
    ctx.quadraticCurveTo(40, 30, 34, 24); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- consumers -------------------------------------------------------------

const canvasCache = new Map<string, HTMLCanvasElement>();

/** A cached 64x64 canvas for an item id. */
export function itemIconCanvas(itemId: string): HTMLCanvasElement {
  const hit = canvasCache.get(itemId);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  paintItemIcon(canvas.getContext('2d')!, itemId);
  canvasCache.set(itemId, canvas);
  return canvas;
}

const urlCache = new Map<string, string>();
export function itemIconURL(itemId: string): string {
  const hit = urlCache.get(itemId);
  if (hit) return hit;
  const url = itemIconCanvas(itemId).toDataURL();
  urlCache.set(itemId, url);
  return url;
}

/** A DOM element showing the painted icon, sized to `px`. */
export function itemIconEl(itemId: string, px = 32): HTMLElement {
  const span = document.createElement('span');
  span.style.cssText = `
    display:inline-block; width:${px}px; height:${px}px; vertical-align:middle;
    background:url(${itemIconURL(itemId)}) center/contain no-repeat;
  `;
  return span;
}
