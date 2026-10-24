import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../src/world/CameraRig';

const STEP = 1 / 60;

/** Advance the rig, moving the target at `speed` units/s along +x. */
function run(rig: CameraRig, seconds: number, speed: number, target: THREE.Vector3): void {
  for (let t = 0; t < seconds; t += STEP) {
    target.x += speed * STEP;
    rig.update(target, STEP);
  }
}

describe('camera idle drift', () => {
  it('holds the base pitch while the player walks', () => {
    const rig = new CameraRig(1.6);
    const target = new THREE.Vector3();
    rig.snapTo(target);
    run(rig, 20, 3, target);
    expect(rig.pitch).toBeCloseTo(rig.basePitch, 5);
    expect(rig.idling).toBe(false);
  });

  it('waits fifteen seconds of stillness before it starts to move', () => {
    const rig = new CameraRig(1.6);
    const target = new THREE.Vector3();
    rig.snapTo(target);
    run(rig, 14.5, 0, target);
    expect(rig.pitch).toBeCloseTo(rig.basePitch, 5);
    run(rig, 1, 0, target);
    expect(rig.pitch).toBeLessThan(rig.basePitch);
  });

  it('settles all the way to the idle pitch', () => {
    const rig = new CameraRig(1.6);
    const target = new THREE.Vector3();
    rig.snapTo(target);
    run(rig, 20, 0, target);
    expect(rig.pitch).toBeCloseTo(rig.idlePitch, 3);
  });

  it('comes back to the base pitch once the player moves again', () => {
    const rig = new CameraRig(1.6);
    const target = new THREE.Vector3();
    rig.snapTo(target);
    run(rig, 20, 0, target);
    run(rig, 1, 3, target);
    expect(rig.pitch).toBeCloseTo(rig.basePitch, 3);
    expect(rig.idling).toBe(false);
  });

  it('stays put when the drift is disabled', () => {
    const rig = new CameraRig(1.6);
    const target = new THREE.Vector3();
    rig.snapTo(target);
    rig.idleDrift = false;
    run(rig, 20, 0, target);
    expect(rig.pitch).toBeCloseTo(rig.basePitch, 5);
  });

  it('leaves a cinematic focus in charge of the angle', () => {
    const rig = new CameraRig(1.6);
    const target = new THREE.Vector3();
    rig.snapTo(target);
    rig.focus(new THREE.Vector3(2, 0, 2), 8);
    rig.pitch = 30;
    run(rig, 20, 0, target);
    expect(rig.pitch).toBe(30);
  });
});
