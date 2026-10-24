/**
 * Things that float, and the swell that moves them.
 *
 * The ferry is the first frame of the game. The player arrives on it, stands on
 * it through the opening's first two beats, and it has been welded to the dock
 * at a fixed height the entire time — a boat on a sea that moves, not moving.
 *
 * This is deliberately not a physics system. A floater keeps its own rest pose
 * and receives a sine on `y` plus a smaller, slower roll, which is all a boat
 * at a mooring does. It is four lines of arithmetic on the most-looked-at
 * object in the product.
 *
 * **The registry is module-level**, like `WetnessState` and `SnowState`, and for
 * the same reason: the thing that builds the ferry is the cutscene stage, which
 * has no handle on the world, and threading one through five call sites to
 * deliver a sine would be the more expensive mistake. It self-cleans — a
 * floater whose object has left the scene is dropped on the next tick — so a
 * rebuilt opening does not accumulate ghosts.
 */
import type * as THREE from 'three';

interface Floater {
  object: THREE.Object3D;
  /** Rest pose, captured at registration. Motion is relative to this. */
  restY: number;
  restRoll: number;
  restPitch: number;
  rise: number;
  roll: number;
  /** Seconds per cycle. */
  period: number;
  /** Where in its cycle this floater starts, so two boats do not agree. */
  phase: number;
}

const floaters: Floater[] = [];

export interface FloatOptions {
  /** Vertical travel, peak to peak, in world units. */
  rise?: number;
  /** Roll amplitude in radians. */
  roll?: number;
  period?: number;
  phase?: number;
}

/**
 * Put an object on the water.
 *
 * Registering the same object twice replaces the first entry rather than
 * stacking two sines on it — the opening stage is rebuilt on every scene load,
 * and a doubled amplitude is the kind of bug that only appears the second time
 * anyone looks.
 */
export function float(object: THREE.Object3D, opts: FloatOptions = {}): void {
  const existing = floaters.findIndex((f) => f.object === object);
  if (existing >= 0) floaters.splice(existing, 1);
  floaters.push({
    object,
    restY: object.position.y,
    restRoll: object.rotation.z,
    restPitch: object.rotation.x,
    rise: opts.rise ?? 0.05,
    roll: opts.roll ?? 0.011,
    period: opts.period ?? 4.6,
    phase: opts.phase ?? Math.random() * Math.PI * 2,
  });
}

/** Step every floater. `elapsed` is seconds since the world started. */
export function updateBuoyancy(elapsed: number): void {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    // Gone from the scene: drop it rather than writing into a detached object.
    if (!f.object.parent) { floaters.splice(i, 1); continue; }
    const t = (elapsed / f.period) * Math.PI * 2 + f.phase;
    f.object.position.y = f.restY + Math.sin(t) * f.rise;
    // Roll lags the rise and runs at a different rate, which is what stops the
    // two reading as one motion. Pitch is half the roll: a moored boat yaws
    // against its line more than it noses.
    f.object.rotation.z = f.restRoll + Math.sin(t * 0.63 + 1.1) * f.roll;
    f.object.rotation.x = f.restPitch + Math.sin(t * 0.41 + 2.3) * f.roll * 0.5;
  }
}

/** How many things are currently afloat. For the gate. */
export function floaterCount(): number {
  return floaters.length;
}
