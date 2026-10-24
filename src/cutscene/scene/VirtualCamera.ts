import * as THREE from 'three';
import type { SceneShot, ShotAxis } from './SceneFormat';

/**
 * Resolving a `shot` into an actual camera placement.
 *
 * This exists because of a specific, repeated failure. `CameraRig.azimuth` is
 * world-absolute — 0 is due south — so an authored angle means a different
 * composition at every location. Staging the opening by hand, the same
 * "swing 50 degrees off for a clean three-quarter" that read beautifully on
 * the ferry put the camera inside a side wall at the post office, and the
 * payoff of the whole sequence played behind a roof slab. It took four
 * twenty-minute capture cycles to find, because nothing but a human eye could
 * see it.
 *
 * Two ideas fix that, both borrowed from Cinemachine:
 *
 * 1. **Angles are relative to an axis**, not to the compass. `actors` measures
 *    from the line between the subjects; `aperture` measures from the set's
 *    forward direction, for shots that must look through a door or window.
 * 2. **The camera checks its own sightline** and pulls in until it can see the
 *    subject. A shot that cannot be composed reports itself instead of
 *    silently rendering a wall.
 */

export interface ShotTargets {
  /** World position of each of the shot's targets, in order. */
  positions: THREE.Vector3[];
  /** The set's forward direction, for `axis aperture`. */
  aperture?: THREE.Vector3;
}

export interface ResolvedShot {
  /** The point the camera frames. */
  point: THREE.Vector3;
  distance: number;
  pitch: number;
  /** World-absolute azimuth, ready for CameraRig.moveTo. */
  azimuth: number;
}

/** Where the rig would put the camera for a resolved shot. */
export function cameraPosition(shot: ResolvedShot): THREE.Vector3 {
  const pitch = THREE.MathUtils.degToRad(shot.pitch);
  const azimuth = THREE.MathUtils.degToRad(shot.azimuth);
  const ground = Math.cos(pitch) * shot.distance;
  const height = Math.sin(pitch) * shot.distance;
  return new THREE.Vector3(
    shot.point.x + Math.sin(azimuth) * ground,
    shot.point.y + height,
    shot.point.z + Math.cos(azimuth) * ground,
  );
}

/**
 * Turn an authored angle into a world azimuth.
 *
 * The rig places the camera at `(sin az, cos az) * ground` from the framed
 * point, so a camera that should look along `d` sits opposite it — hence the
 * negation. Getting this backwards puts every shot in the reverse angle, which
 * looks deliberate and is extremely confusing to debug.
 */
function axisBearing(axis: ShotAxis, targets: ShotTargets): number {
  if (axis === 'world') return 0;
  const direction = axis === 'aperture'
    ? targets.aperture?.clone()
    : new THREE.Vector3().subVectors(
      targets.positions[targets.positions.length - 1],
      targets.positions[0],
    );
  if (!direction) return 0;
  direction.y = 0;
  if (direction.lengthSq() < 1e-6) return 0;
  return THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z));
}

/** Compose a shot: where to frame, from how far, at what absolute angle. */
export function resolveShot(shot: SceneShot, targets: ShotTargets): ResolvedShot {
  const first = targets.positions[0];
  const point = shot.framing === 'between' && targets.positions[1]
    ? first.clone().lerp(targets.positions[1], shot.bias)
    : first.clone();
  point.y += shot.lift;
  return {
    point,
    distance: shot.distance,
    pitch: shot.pitch,
    azimuth: shot.azimuth + axisBearing(shot.axis, targets),
  };
}

export interface SightlineReport {
  /** True when every subject is visible from the resolved camera position. */
  clear: boolean;
  /** Subjects the camera cannot see, by index into `positions`. */
  blocked: number[];
  /** Distance the shot had to be pulled in to clear the obstruction, if any. */
  pulledIn: number;
}

/**
 * Does this camera actually see its subjects, and can it be saved if not?
 *
 * `occluded` is supplied by the caller — the runtime raycasts against world
 * geometry, the editor can use the same test — so this module stays free of
 * scene knowledge and remains unit-testable.
 *
 * The recovery is deliberately one-dimensional: pull the camera in along its
 * own boom, the way a real crane operator would, rather than searching for
 * some other angle. An automatic angle search would silently rewrite the
 * author's composition; shortening the boom preserves the intent and, when
 * even the closest position is blocked, reports failure instead of guessing.
 */
export function clearSightline(
  shot: ResolvedShot,
  subjects: THREE.Vector3[],
  occluded: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
  options: { minDistance?: number; steps?: number; samples?: number[] } = {},
): { shot: ResolvedShot; report: SightlineReport } {
  const minDistance = options.minDistance ?? 1.6;
  const steps = options.steps ?? 6;
  // Height offsets tested per subject. A character is not a point: one ray at
  // chest height reports Albert hidden whenever the sorting counter is between
  // him and the camera, which is true of his sternum and false of the shot —
  // his head and shoulders are plainly in frame. A subject counts as seen when
  // any sample is seen.
  const samples = options.samples ?? [0];
  const blockedFrom = (candidate: ResolvedShot): number[] => {
    const eye = cameraPosition(candidate);
    return subjects
      .map((subject, index) => (samples.some((lift) => !occluded(
        eye, new THREE.Vector3(subject.x, subject.y + lift, subject.z),
      )) ? -1 : index))
      .filter((index) => index >= 0);
  };

  let blocked = blockedFrom(shot);
  if (!blocked.length) {
    return { shot, report: { clear: true, blocked: [], pulledIn: 0 } };
  }
  for (let step = 1; step <= steps; step++) {
    const distance = THREE.MathUtils.lerp(shot.distance, minDistance, step / steps);
    const candidate = { ...shot, distance };
    blocked = blockedFrom(candidate);
    if (!blocked.length) {
      return {
        shot: candidate,
        report: { clear: true, blocked: [], pulledIn: shot.distance - distance },
      };
    }
  }
  // Nothing along the boom works. Hand back the original rather than a
  // half-measure: a shot that cannot be composed is an authoring bug, and the
  // director surfaces it as one.
  return { shot, report: { clear: false, blocked, pulledIn: 0 } };
}
