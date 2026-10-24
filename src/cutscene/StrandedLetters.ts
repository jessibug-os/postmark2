import * as THREE from 'three';
import { palette, PALETTE_HEX } from '../art/palette';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { heightAt } from '../world/terrain';
import { SEA_LEVEL } from '../world/island/IslandRuntime';
import type { ApproachRoute } from './ApproachRoute';

/**
 * Undelivered mail, drifting thicker the closer the route gets to the Keeper.
 *
 * This is the backlog said without saying it. The Keeper's account of himself
 * — everything that was never delivered came to me, and I have held it since —
 * was three lines of dialogue explaining a situation the player had walked
 * ninety metres through without seeing any evidence of. Now the evidence is
 * the walk: a letter caught in the grass near the berth, two more a little
 * further on, and by the last stretch the ground is littered with them, all of
 * them face-down and weathered and going nowhere. By the time he says what he
 * is, the player has already worked it out, and his line lands as confirmation
 * rather than as exposition.
 *
 * **These stay.** The lantern trail an earlier pass hung along this same route
 * was removed for outliving its scene, and the distinction is worth stating so
 * the next person does not "fix" this the same way: lanterns were a navigation
 * aid, which is a property of one cutscene, and the wisp replaced them. Letters
 * lying in the grass are a property of the *island* — the backlog is still a
 * backlog after the opening ends, and the first thing the player is asked to do
 * is start clearing it. Striking them at the title card would be tidying away
 * the problem the title card asks her to solve.
 *
 * Built from geometry rather than a `.glb` because an envelope at this scale is
 * two quads and a flap, and it is drawn at a size where the texture would never
 * be read: what says "letter" here is the silhouette and the pale value against
 * dark grass, both of which survive the 480x360 target that a painted sheet
 * would not.
 */

/** How far back from the spring the drift begins. */
const DRIFT = 52;

/**
 * Metres of path per letter at the far end of the drift, and at the spring.
 *
 * `DENSE` is deliberately well under the path's own one-metre sampling: a
 * spacing below a metre is unsatisfiable by spacing alone, and asking for one
 * is how the scatter says "cluster here" — see `perPoint`. At 0.28 the last few
 * metres carry three or four letters each, which is the difference between a
 * trail of litter and a drift the player has to walk through.
 */
const SPARSE = 9;
const DENSE = 0.28;

/** Paper tints. Three, because one is a cloned prop and three is a drift. */
const PAPERS = [PALETTE_HEX.hd8cdb4, PALETTE_HEX.hcbbf9e, PALETTE_HEX.he8dfc8];

function envelope(tint: number): THREE.Group {
  const letter = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.34),
    makeRetroMaterial({ color: tint, side: THREE.DoubleSide }),
  );
  body.rotation.x = -Math.PI / 2;
  // The flap is the whole silhouette read at this size: a bare rectangle in
  // grass is a scrap of paper, and the V is what makes it mail.
  const flap = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.24),
    makeRetroMaterial({ color: palette.cloth, side: THREE.DoubleSide }),
  );
  flap.rotation.x = -Math.PI / 2;
  flap.rotation.z = Math.PI / 4;
  flap.position.y = 0.008;
  letter.add(body, flap);
  return letter;
}

/**
 * Scatter the drift along a route, and return it as one group.
 *
 * Deterministic from the route's own geometry rather than `Math.random`: the
 * same island lays the same letters in the same grass every time it is loaded,
 * so a frame captured for review is a frame the player will see, and a
 * regression in the scatter is visible in a diff of the capture rather than
 * dismissed as noise.
 */
export function strandLetters(scene: THREE.Object3D, route: ApproachRoute): THREE.Group {
  const group = new THREE.Group();
  group.name = 'kindly-forward-backlog';

  let travelled = 0;
  let due = SPARSE;
  for (let i = 1; i < route.points.length; i++) {
    travelled += route.points[i].distanceTo(route.points[i - 1]);
    const remaining = route.length - travelled;
    if (remaining > DRIFT) continue;
    due -= route.points[i].distanceTo(route.points[i - 1]);
    if (due > 0) continue;
    // Closeness runs 0 at the far edge of the drift to 1 at the spring, and the
    // spacing is interpolated on it — so the litter thickens continuously
    // rather than stepping between two densities, which would read as two
    // separate props rather than as one thing getting worse.
    const closeness = 1 - remaining / DRIFT;
    // Eased *out*, not in. Squared the other way this stayed at eight or nine
    // metres for three quarters of the drift and only thickened in the last few
    // steps — eight letters over forty metres, which reads as scattered litter
    // rather than as a backlog. The player should feel it getting worse the
    // whole way in, so most of the change happens early and the last stretch is
    // already a carpet.
    const ease = 1 - (1 - closeness) * (1 - closeness);
    due = THREE.MathUtils.lerp(SPARSE, DENSE, ease);

    // A hash of the position, so the scatter is stable and still looks random.
    const seed = Math.sin(route.points[i].x * 12.9898 + route.points[i].z * 78.233) * 43758.5453;
    const noise = (n: number) => {
      const v = Math.sin(seed * (n + 1) * 1.618) * 43758.5453;
      return v - Math.floor(v);
    };
    // More than one letter per point where the drift is thickest.
    //
    // The path is sampled at a metre, so spacing alone cannot put letters
    // closer together than that however small `due` gets — the last stretch
    // came out at one letter per metre, which is a trail rather than a heap.
    // Asking for a spacing under a metre therefore means asking for a cluster,
    // and this is where that gets honoured.
    const perPoint = Math.max(1, Math.round(1 / due));
    for (let n = 0; n < perPoint; n++) {
      // Letters land wide of the path as well as on it — wider where the drift
      // is thin, so the far end reads as things blown loose one at a time and
      // the near end as a heap.
      const spread = THREE.MathUtils.lerp(5, 2.4, closeness);
      const x = route.points[i].x + (noise(n * 3) - 0.5) * spread;
      const z = route.points[i].z + (noise(n * 3 + 1) - 0.5) * spread;
      const ground = heightAt(x, z);
      // Nothing on the water. Paper does not sit on a river, and the route runs
      // along one for part of its length.
      if (ground < SEA_LEVEL + 0.15) continue;
      const letter = envelope(PAPERS[Math.floor(noise(n * 3 + 2) * PAPERS.length) % PAPERS.length]);
      // Just off the ground, not in it: at this camera the z-fight against grass
      // reads as flicker, and a letter lying perfectly flat reads as a decal.
      letter.position.set(x, ground + 0.03, z);
      letter.rotation.y = noise(n + 7) * Math.PI * 2;
      letter.rotation.z = (noise(n + 11) - 0.5) * 0.22;
      group.add(letter);
    }
  }

  scene.add(group);
  return group;
}
