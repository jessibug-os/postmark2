import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clearSightline, cameraPosition, resolveShot } from '../src/cutscene/scene/VirtualCamera';
import { parseScene, type SceneShot } from '../src/cutscene/scene/SceneFormat';

/** Build one shot through the real parser, so the test uses authored syntax. */
function shot(declaration: string): SceneShot {
  const scene = parseScene(
    `# scene: s\n# set: x\n${declaration}\n`,
  );
  return scene.shots[0];
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

describe('resolveShot', () => {
  it('frames the target, lifted to eye height', () => {
    const resolved = resolveShot(shot('shot s on a dist 6 lift 1.5'), {
      positions: [v(3, 0, 4)],
    });
    expect(resolved.point.x).toBe(3);
    expect(resolved.point.y).toBe(1.5);
    expect(resolved.point.z).toBe(4);
  });

  it('frames the midpoint of a between-shot, and honours bias', () => {
    const targets = { positions: [v(0, 0, 0), v(10, 0, 0)] };
    expect(resolveShot(shot('shot s between a b dist 6 lift 0'), targets).point.x).toBe(5);
    expect(resolveShot(shot('shot s between a b dist 6 lift 0 bias 0.8'), targets).point.x).toBe(8);
  });

  it('leaves world-axis angles alone', () => {
    const resolved = resolveShot(shot('shot s on a dist 6 az 30 axis world'), {
      positions: [v(9, 0, -4)],
    });
    expect(resolved.azimuth).toBe(30);
  });

  /**
   * The regression that motivated the whole module: an angle that is correct
   * at one location must stay correct at another.
   */
  it('keeps an actors-axis angle relative wherever the beat plays', () => {
    const declaration = 'shot s between a b dist 6 az 40 axis actors';
    const near = resolveShot(shot(declaration), { positions: [v(0, 0, 0), v(0, 0, -10)] });
    const far = resolveShot(shot(declaration), { positions: [v(50, 0, 20), v(60, 0, 20)] });
    // Same offset from each pair's own axis, different absolute bearings.
    expect(near.azimuth).not.toBeCloseTo(far.azimuth);
    const relative = (resolvedAz: number, from: THREE.Vector3, to: THREE.Vector3): number => {
      const direction = to.clone().sub(from);
      const bearing = THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z));
      return ((resolvedAz - bearing) % 360 + 540) % 360 - 180;
    };
    expect(relative(near.azimuth, v(0, 0, 0), v(0, 0, -10))).toBeCloseTo(40);
    expect(relative(far.azimuth, v(50, 0, 20), v(60, 0, 20))).toBeCloseTo(40);
  });

  it('measures an aperture-axis angle from the set, not the actors', () => {
    const resolved = resolveShot(shot('shot s between a b dist 6 az 0 axis aperture'), {
      // Actors are side by side; the doorway looks down -Z.
      positions: [v(-1, 0, 0), v(1, 0, 0)],
      aperture: v(0, 0, -1),
    });
    // Camera sits on the +Z side, looking back down the doorway.
    expect(cameraPosition(resolved).z).toBeGreaterThan(resolved.point.z);
    expect(Math.abs(cameraPosition(resolved).x - resolved.point.x)).toBeLessThan(1e-6);
  });
});

describe('cameraPosition', () => {
  it('puts the camera opposite the direction it looks', () => {
    // Azimuth 0 is due south: the camera sits at +Z of what it frames.
    const eye = cameraPosition({ point: v(0, 0, 0), distance: 10, pitch: 0, azimuth: 0 });
    expect(eye.z).toBeCloseTo(10);
    expect(eye.x).toBeCloseTo(0);
  });

  it('raises the camera with pitch', () => {
    const level = cameraPosition({ point: v(0, 0, 0), distance: 10, pitch: 0, azimuth: 0 });
    const high = cameraPosition({ point: v(0, 0, 0), distance: 10, pitch: 45, azimuth: 0 });
    expect(high.y).toBeGreaterThan(level.y);
  });
});

describe('clearSightline', () => {
  const subject = v(0, 1, 0);
  const resolved = { point: v(0, 1, 0), distance: 12, pitch: 20, azimuth: 0 };

  it('passes a shot with nothing in the way', () => {
    const { report } = clearSightline(resolved, [subject], () => false);
    expect(report.clear).toBe(true);
    expect(report.pulledIn).toBe(0);
  });

  it('pulls the camera in along its boom until the subject is visible', () => {
    // A wall stands 8m out: anything further away cannot see the subject.
    const occluded = (from: THREE.Vector3): boolean => from.distanceTo(subject) > 8;
    const { shot: fixed, report } = clearSightline(resolved, [subject], occluded);
    expect(report.clear).toBe(true);
    expect(fixed.distance).toBeLessThan(resolved.distance);
    expect(report.pulledIn).toBeGreaterThan(0);
  });

  it('preserves the authored angle while recovering', () => {
    const occluded = (from: THREE.Vector3): boolean => from.distanceTo(subject) > 8;
    const { shot: fixed } = clearSightline(
      { ...resolved, azimuth: 37, pitch: 21 }, [subject], occluded,
    );
    expect(fixed.azimuth).toBe(37);
    expect(fixed.pitch).toBe(21);
  });

  it('reports failure rather than guessing when no distance works', () => {
    const { report } = clearSightline(resolved, [subject], () => true);
    expect(report.clear).toBe(false);
    expect(report.blocked).toEqual([0]);
  });

  it('names which subject is hidden in a two-shot', () => {
    const other = v(20, 1, 0);
    const occluded = (_from: THREE.Vector3, to: THREE.Vector3): boolean => to.equals(other);
    const { report } = clearSightline(resolved, [subject, other], occluded);
    expect(report.clear).toBe(false);
    expect(report.blocked).toEqual([1]);
  });
});
