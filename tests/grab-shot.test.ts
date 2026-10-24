import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { grabShot } from '../src/cutscene/preview/ScenePreview';
import { cameraPosition, type ResolvedShot } from '../src/cutscene/scene/VirtualCamera';

/**
 * Grab-shot is the exact inverse of the rig's placement, not an approximation.
 *
 * `cameraPosition` is closed-form polar, so recovering the numbers that produce
 * a given camera is arithmetic. That matters more than it sounds: the whole
 * gesture is "fly the camera until the frame looks right, press grab", and a
 * grab that landed *near* the frame you chose would quietly undo the judgement
 * you just made by eye — the one thing in this editor a human is for.
 */
const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

describe('grabShot', () => {
  const cases: ResolvedShot[] = [
    { point: v(0, 0, 0), distance: 6.4, pitch: 17, azimuth: 62 },
    { point: v(-21.5, 2.2, -7.25), distance: 11, pitch: 32, azimuth: 0 },
    { point: v(3, 1.4, -9), distance: 17, pitch: 20, azimuth: -34 },
    { point: v(-63, 0.9, 49), distance: 4.2, pitch: 12, azimuth: 44 },
    { point: v(8, 0.5, 2), distance: 5, pitch: 10, azimuth: 179 },
    { point: v(8, 0.5, 2), distance: 5, pitch: 10, azimuth: -179 },
  ];

  for (const shot of cases) {
    it(`round-trips dist ${shot.distance} pitch ${shot.pitch} az ${shot.azimuth}`, () => {
      const eye = cameraPosition(shot);
      const grabbed = grabShot(eye, shot.point);
      expect(grabbed.distance).toBeCloseTo(shot.distance, 10);
      expect(grabbed.pitch).toBeCloseTo(shot.pitch, 10);
      // Azimuth is an angle: ±179 are half a degree apart, not 358.
      const delta = Math.abs(((grabbed.azimuth - shot.azimuth + 540) % 360) - 180);
      expect(delta).toBeLessThan(1e-9);
    });
  }

  it('reproduces the camera position it was taken from, within 1e-3', () => {
    for (const shot of cases) {
      const eye = cameraPosition(shot);
      const grabbed = grabShot(eye, shot.point);
      const back = cameraPosition({
        point: new THREE.Vector3(...grabbed.point),
        distance: grabbed.distance,
        pitch: grabbed.pitch,
        azimuth: grabbed.azimuth,
      });
      expect(back.distanceTo(eye)).toBeLessThan(1e-3);
    }
  });

  it('carries the framed point through unchanged', () => {
    const grabbed = grabShot(v(1, 2, 3), v(-4, 5, -6));
    expect(grabbed.point).toEqual([-4, 5, -6]);
  });
});
