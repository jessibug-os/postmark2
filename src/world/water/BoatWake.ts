import * as THREE from 'three';
import { snapUniforms } from '../../core/RetroMaterial';

export const WAKE_SAMPLES = 32;
const INTERVAL = 0.1;

export const wakeTrail = Array.from({ length: WAKE_SAMPLES }, () => new THREE.Vector4(0, 0, -1000, 0));
export const wakeCentre = new THREE.Vector2(0, 0);

let next = 0;
let last = -Infinity;

export function stirWake(x: number, z: number, strength: number): void {
  const now = snapUniforms.uTime.value;
  wakeCentre.set(x, z);
  if (now < last) last = -Infinity;
  if (now - last < INTERVAL) return;
  last = now;
  wakeTrail[next].set(x, z, now, strength);
  next = (next + 1) % WAKE_SAMPLES;
}
