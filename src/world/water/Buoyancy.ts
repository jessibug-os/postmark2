import type * as THREE from 'three';
import { snapUniforms } from '../../core/RetroMaterial';
import { swellHeight } from './Swell';

interface Floater {
  object: THREE.Object3D;
  restY: number;
  restRoll: number;
  restPitch: number;
  halfLength: number;
  halfBeam: number;
}

const floaters: Floater[] = [];

export interface FloatOptions {
  length?: number;
  beam?: number;
}

export function float(object: THREE.Object3D, opts: FloatOptions = {}): void {
  const existing = floaters.findIndex((f) => f.object === object);
  if (existing >= 0) floaters.splice(existing, 1);
  object.rotation.order = 'YXZ';
  floaters.push({
    object,
    restY: object.position.y,
    restRoll: object.rotation.z,
    restPitch: object.rotation.x,
    halfLength: (opts.length ?? 3) / 2,
    halfBeam: (opts.beam ?? 1.2) / 2,
  });
}

function heightAt(x: number, z: number, t: number): number {
  return swellHeight(x, z, t);
}

export function updateBuoyancy(): void {
  const t = snapUniforms.uTime.value;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    if (!f.object.parent) { floaters.splice(i, 1); continue; }
    const { x, z } = f.object.position;
    const yaw = f.object.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const bow = heightAt(x + fx * f.halfLength, z + fz * f.halfLength, t);
    const stern = heightAt(x - fx * f.halfLength, z - fz * f.halfLength, t);
    const right = heightAt(x + fz * f.halfBeam, z - fx * f.halfBeam, t);
    const left = heightAt(x - fz * f.halfBeam, z + fx * f.halfBeam, t);
    f.object.position.y = f.restY + (bow + stern + right + left) / 4;
    f.object.rotation.x = f.restPitch + Math.atan2(stern - bow, f.halfLength * 2);
    f.object.rotation.z = f.restRoll + Math.atan2(right - left, f.halfBeam * 2);
  }
}

export function floaterCount(): number {
  return floaters.length;
}
