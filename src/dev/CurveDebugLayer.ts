/** Curve view — the island's extracted feature curves, drawn over the terrain. */
import * as THREE from 'three';
import { applyVertexSnap } from '../core/RetroMaterial';
import { palette } from '../art/palette';
import { cliffCurves, pondCurves, riverCurve, smoothedCoast, type CurveKind, type FeatureCurve } from '../world/island/FeatureCurves';
import type { IslandMap } from '../world/island/IslandMap';
import type { IslandFieldQuery } from '../world/island/IslandRuntime';

const LIFT = 0.14;
/** World-unit spacing for resampling a segment, so a line follows the ground. */
const DRAPE_STEP = 1;

const CURVE_COLOR: Readonly<Record<CurveKind, number>> = {
  coast: palette.amber,
  cliff: palette.postalRed,
  pond: palette.patina,
  river: palette.glass,
};

export class CurveDebugLayer {
  readonly group = new THREE.Group();
  private visible = false;
  private built = false;

  constructor(
    private readonly island: IslandMap | null,
    private readonly field: IslandFieldQuery | null,
  ) {
    this.group.visible = false;
    this.group.renderOrder = 5;
  }

  get isVisible(): boolean { return this.visible; }
  get available(): boolean { return this.island !== null && this.field !== null; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.group.visible = on;
    if (on && !this.built) this.rebuild();
  }

  /**
   * The curves as the runtime actually measures them — the coast smoothed, not
   * the raw staircase. An overlay that draws the unsmoothed loop would disagree
   * with the ground under it, which is the one thing a debug overlay may never
   * do.
   */
  private curves(): FeatureCurve[] {
    const river = riverCurve(this.island!);
    return [
      ...smoothedCoast(this.island!),
      ...cliffCurves(this.island!),
      ...pondCurves(this.island!),
      ...(river ? [river] : []),
    ];
  }

  describe(): string[] {
    if (!this.island) return ['No generated island is active.'];
    const curves = this.curves();
    const byKind = new Map<CurveKind, FeatureCurve[]>();
    for (const c of curves) {
      if (!byKind.has(c.kind)) byKind.set(c.kind, []);
      byKind.get(c.kind)!.push(c);
    }
    return [...byKind.entries()].map(([kind, list]) => {
      const loops = list.filter((c) => c.closed).length;
      const points = list.reduce((n, c) => n + c.points.length, 0);
      return `${kind}: ${list.length} curve(s), ${loops} closed, ${points} points`;
    });
  }

  private height(x: number, z: number): number {
    const ground = this.field!.heightAt(x, z);
    const water = this.field!.waterAt(x, z);
    return Math.max(ground, water ?? ground) + LIFT;
  }

  private rebuild(): void {
    this.group.clear();
    this.built = true;
    if (!this.island || !this.field) return;
    const positions: number[] = [];
    const colors: number[] = [];
    const colour = new THREE.Color();

    for (const curve of this.curves()) {
      colour.setHex(CURVE_COLOR[curve.kind]);
      for (let i = 0; i + 1 < curve.points.length; i++) {
        const a = curve.points[i];
        const b = curve.points[i + 1];
        // Resampled rather than drawn corner-to-corner: a coast segment spans a
        // whole acre, and the ground under it is not flat, so a single straight
        // line would sink through the beach falloff it is meant to trace.
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / DRAPE_STEP));
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const x0 = a.x + (b.x - a.x) * t0;
          const z0 = a.z + (b.z - a.z) * t0;
          const x1 = a.x + (b.x - a.x) * t1;
          const z1 = a.z + (b.z - a.z) * t1;
          positions.push(x0, this.height(x0, z0), z0, x1, this.height(x1, z1), z1);
          colors.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
        }
      }
    }

    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = applyVertexSnap(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false,
    }));
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    this.group.add(lines);
  }
}
