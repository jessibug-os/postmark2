import { PALETTE_CSS, PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { applyVertexSnap } from '../core/RetroMaterial';
import { paintCanvas, shade, withAlpha } from '../core/texturePaint';

/**
 * Painted face decal with expression swaps — the AC approach: eyes and mouth
 * live on a hand-painted texture sheet, and emotion is a texture swap, not
 * bone animation. Each character declares a FaceSpec (eye style, colors,
 * mouth); the rig pre-paints one canvas per expression and swaps maps.
 *
 * Expressions: idle, blink (transient), happy, surprised, asleep.
 */

export type Expression = 'idle' | 'blink' | 'happy' | 'surprised' | 'asleep';

export interface FaceSpec {
  /** Eye rendering style: 'human' painted iris, 'lens' robot dial, 'glow' lit shapes. */
  style: 'human' | 'lens' | 'glow';
  eyeColor: string;
  /** Glow styles draw on this backing color (register slit, lamp glass...). */
  glowShape?: 'bar' | 'dot' | 'slit';
  /** Eye center X as fraction of half-width (0.3 = close, 0.55 = wide-set). */
  spacing?: number;
  eyeScale?: number;
  lashes?: boolean;
  blush?: string | null;
  mouth?: 'smile' | 'grin' | 'line' | 'o' | 'none';
  mouthColor?: string;
  /** World size of the decal plane. */
  width: number;
  height: number;
  /** Cylindrical bend depth so the decal hugs a round head. */
  curve?: number;
}

const W = 128;
const H = 80;

function paintFace(spec: FaceSpec, expr: Expression): HTMLCanvasElement {
  const p = paintCanvas(W, H);
  const { ctx } = p;
  const cx = W / 2;
  // Eyes ride high and the mouth stays close under them: the camera looks
  // down at ~40°, so features drawn low on the sheet vanish under the chin.
  const eyeY = H * 0.4;
  const sp = (spec.spacing ?? 0.42) * (W / 2);
  const es = (spec.eyeScale ?? 1) * 11;
  const color = spec.eyeColor;

  const eachEye = (fn: (x: number, side: -1 | 1) => void): void => {
    fn(cx - sp, -1);
    fn(cx + sp, 1);
  };

  // --- eyes ---
  const closedLine = (x: number, curveUp: boolean): void => {
    ctx.strokeStyle = spec.style === 'glow' ? withAlpha(color, 0.85) : PALETTE_CSS.h33291f;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, curveUp ? eyeY + es * 0.55 : eyeY - es * 0.55, es * 0.85, curveUp ? Math.PI * 1.15 : Math.PI * 0.15, curveUp ? Math.PI * 1.85 : Math.PI * 0.85);
    ctx.stroke();
  };

  if (expr === 'blink' || expr === 'asleep') {
    // Restful down-curves; asleep adds soft lower lashes.
    eachEye((x) => closedLine(x, false));
    if (expr === 'asleep' && spec.style === 'human') {
      eachEye((x, side) => {
        ctx.strokeStyle = PALETTE_CSS.h33291f;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + side * es * 0.7, eyeY + es * 0.25);
        ctx.lineTo(x + side * es * 1.0, eyeY + es * 0.5);
        ctx.stroke();
      });
    }
  } else if (expr === 'happy') {
    // AC happy-arc eyes: ∪ flipped — arcs opening downward.
    eachEye((x) => closedLine(x, true));
  } else {
    const wide = expr === 'surprised' ? 1.3 : 1;
    eachEye((x, side) => {
      if (spec.style === 'human') {
        // AC-bold: one solid dark-iris almond per eye + a single big sparkle.
        // Layered whites/pupils turn to mud at 480x360 — simple shapes read.
        ctx.fillStyle = shade(color, -0.12);
        ctx.beginPath();
        ctx.ellipse(x, eyeY, es * 0.62 * wide, es * wide, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(color, 0.14, 0.1);
        ctx.beginPath();
        ctx.ellipse(x, eyeY + es * 0.35, es * 0.45 * wide, es * 0.45 * wide, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.beginPath();
        ctx.arc(x - es * 0.2, eyeY - es * 0.32, es * 0.26, 0, Math.PI * 2);
        ctx.fill();
        if (spec.lashes) {
          ctx.strokeStyle = PALETTE_CSS.h241d28;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + (x < cx ? -1 : 1) * es * 0.62, eyeY - es * 0.7);
          ctx.lineTo(x + (x < cx ? -1 : 1) * es * 0.95, eyeY - es * 0.95);
          ctx.stroke();
        }
      } else if (spec.style === 'lens') {
        // Dial eye: dark glass, metal ring, warm glint.
        ctx.fillStyle = PALETTE_CSS.h241f1a;
        ctx.beginPath();
        ctx.arc(x, eyeY, es * 0.8 * wide, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = shade(color, 0.1);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(x, eyeY, es * 0.8 * wide, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, eyeY + es * 0.05, es * 0.34 * wide, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,244,220,0.9)';
        ctx.beginPath();
        ctx.arc(x - es * 0.25, eyeY - es * 0.25, es * 0.14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Glow: lit shape on dark backing.
        const shapeW = (spec.glowShape === 'bar' ? es * 1.3 : spec.glowShape === 'slit' ? es * 0.45 : es * 0.8) * wide;
        const shapeH = (spec.glowShape === 'bar' ? es * 0.55 : spec.glowShape === 'slit' ? es * 1.0 : es * 0.8) * wide;
        ctx.fillStyle = withAlpha(color, 0.25);
        ctx.beginPath();
        ctx.ellipse(x, eyeY, shapeW * 1.5, shapeH * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, eyeY, shapeW, shapeH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,252,240,0.95)';
        ctx.beginPath();
        ctx.ellipse(x - shapeW * 0.25, eyeY - shapeH * 0.3, shapeW * 0.3, shapeH * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      void side;
    });
  }

  // --- blush ---
  if (spec.blush && (expr === 'idle' || expr === 'happy' || expr === 'blink')) {
    eachEye((x, side) => {
      ctx.fillStyle = withAlpha(spec.blush!, expr === 'happy' ? 0.5 : 0.32);
      ctx.beginPath();
      ctx.ellipse(x + side * es * 0.5, eyeY + es * 1.25, es * 0.75, es * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // --- mouth ---
  const mouth = spec.mouth ?? 'smile';
  if (mouth !== 'none') {
    const my = H * 0.72;
    const mc = spec.mouthColor ?? PALETTE_CSS.h8a5a50;
    ctx.strokeStyle = mc;
    ctx.fillStyle = mc;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    if (expr === 'surprised') {
      ctx.beginPath();
      ctx.ellipse(cx, my, 5.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (expr === 'happy') {
      // Open grin with a tongue-warm interior.
      ctx.beginPath();
      ctx.arc(cx, my - 3, 9, Math.PI * 0.1, Math.PI * 0.9);
      ctx.closePath();
      ctx.fill();
    } else if (expr === 'asleep') {
      ctx.beginPath();
      ctx.ellipse(cx, my, 3.4, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mouth === 'line') {
      ctx.beginPath();
      ctx.moveTo(cx - 6, my);
      ctx.lineTo(cx + 6, my);
      ctx.stroke();
    } else if (mouth === 'o') {
      ctx.beginPath();
      ctx.ellipse(cx, my, 4, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Gentle smile; 'grin' is wider.
      const r = mouth === 'grin' ? 10 : 6.5;
      ctx.beginPath();
      ctx.arc(cx, my - r * 0.55, r, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
  }
  return p.canvas;
}

export class FaceRig {
  readonly mesh: THREE.Mesh;
  private textures = new Map<Expression, THREE.CanvasTexture>();
  private material: THREE.MeshLambertMaterial;
  private current: Expression = 'idle';
  /** Expression forced by mood (happy/surprised) with a countdown. */
  private moodExpr: Expression | null = null;
  private moodTime = 0;
  private blinkTime = 0;
  sleeping = false;

  constructor(spec: FaceSpec) {
    for (const expr of ['idle', 'blink', 'happy', 'surprised', 'asleep'] as Expression[]) {
      const tex = new THREE.CanvasTexture(paintFace(spec, expr));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(expr, tex);
    }
    // Faces stay readable in any light: the vertical decal catches almost no
    // directional light, so half the map is re-added as self-lit emissive.
    this.material = applyVertexSnap(
      new THREE.MeshLambertMaterial({
        map: this.textures.get('idle')!,
        emissive: PALETTE_HEX.h9a9a9a,
        emissiveMap: this.textures.get('idle')!,
        transparent: true,
        alphaTest: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    const geo = new THREE.PlaneGeometry(spec.width, spec.height, 8, 4);
    // Cylindrical bend so the decal hugs a round head.
    const curve = spec.curve ?? 0;
    if (curve > 0) {
      const pos = geo.attributes.position;
      const halfW = spec.width / 2;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, -curve * (x / halfW) * (x / halfW));
      }
      geo.computeVertexNormals();
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'faceRig';
  }

  /** The idle-expression sheet (used for dialogue portraits). */
  get idleCanvas(): HTMLCanvasElement {
    return this.textures.get('idle')!.image as HTMLCanvasElement;
  }

  private apply(expr: Expression): void {
    if (expr === this.current) return;
    this.current = expr;
    const tex = this.textures.get(expr)!;
    this.material.map = tex;
    this.material.emissiveMap = tex;
  }

  /** Transient eyelid close. */
  blink(): void {
    this.blinkTime = 0.13;
  }

  /** Hold an expression for a while, optionally followed by another
   * (surprise → smile is the classic notice beat). */
  mood(expr: Expression, seconds = 1.2, then?: Expression, thenSeconds = 1.2): void {
    this.moodExpr = expr;
    this.moodTime = seconds;
    this.nextExpr = then ?? null;
    this.nextTime = thenSeconds;
  }
  private nextExpr: Expression | null = null;
  private nextTime = 0;

  update(dt: number): void {
    if (this.moodTime > 0) {
      this.moodTime -= dt;
      if (this.moodTime <= 0 && this.nextExpr) {
        this.moodExpr = this.nextExpr;
        this.moodTime = this.nextTime;
        this.nextExpr = null;
      }
    }
    if (this.blinkTime > 0) this.blinkTime -= dt;
    if (this.sleeping) this.apply('asleep');
    else if (this.moodTime > 0 && this.moodExpr) this.apply(this.moodExpr);
    else if (this.blinkTime > 0) this.apply('blink');
    else this.apply('idle');
  }
}
