import * as THREE from 'three';
import { palette } from '../art/palette';
import { heightAt } from '../world/terrain';
import { approachRoute, type ApproachRoute } from './ApproachRoute';
import { glowTexture } from '../art/glow';

/**
 * The light that leads the Postmaster inland, and wakes the Keeper.
 *
 * This replaces a trail of lantern posts, and the reason is worth keeping.
 * Lanterns solved the navigation problem — the player is handed control in a
 * twenty-two metre fog with sixty metres of dogleg ahead of her, and without
 * something lit in the frame the opening simply does not end. But they solved
 * it by leaving nine lamp posts standing on the island forever, staging that
 * outlives its scene, and they solved it *impersonally*: a lamp post is
 * municipal furniture, and the beat it was lighting is the loneliest in the
 * game.
 *
 * A single wisp does the same navigational work with none of that. It is
 * inside the fog's reach by construction because it stays a fixed distance
 * ahead of the player rather than at a fixed place on the map. It leaves
 * nothing behind. And it can *end*: the light the player follows for sixty
 * metres turns out to be what wakes the Keeper, so the walk pays off as a
 * revelation instead of as arriving somewhere. Following a light and finding
 * out what it was for is a better minute of game than walking between lamps.
 *
 * It leads rather than tows. The wisp holds station ahead of the player and
 * waits when she falls behind, so the pace is hers — the failure mode is
 * dawdling, not being dragged, and a player who stops to look at the island
 * finds the light still there when she looks up.
 */

/** How far ahead of the player the wisp holds station, in metres of path. */
const LEAD = 7;

/** How close the player must get before it will move on at all. */
const PATIENCE = 11;

/** Metres per second. A little faster than a walk, so it stays ahead. */
const SPEED = 4.2;

/** Hover height above the ground it is over. */
const HOVER = 1.5;

export class Wisp {
  readonly object: THREE.Group;
  private light: THREE.PointLight;
  private core: THREE.Sprite;
  private halo: THREE.Sprite;
  private route: ApproachRoute | null = null;
  /** Cumulative path distance at each route point, for station-keeping. */
  private distances: number[] = [];
  /** How far along the route the wisp currently is. */
  private travelled = 0;
  private age = 0;
  private brightness = 0;
  /**
   * Dark until something sends it somewhere.
   *
   * This defaulted to 1, and `update` runs from the frame the host is built —
   * which is the frame the *ferry* is staged on, minutes before any beat calls
   * `lead`. So the wisp spent the whole crossing ramping up to full brightness
   * at the world origin, sunk in the terrain, waiting to be seen by any camera
   * that happened to look that way. Exactly the failure the Keeper had for the
   * same reason: added to the world before anything positioned it.
   *
   * `visible = false` in the constructor was not enough, because `update`
   * derives visibility from brightness and cheerfully turned it back on.
   */
  private target = 0;
  private merging: { into: THREE.Object3D; elapsed: number; over: number } | null = null;

  constructor(private world: THREE.Object3D) {
    const texture = glowTexture();
    this.object = new THREE.Group();
    this.object.name = 'kindly-forward-wisp';
    // Cold, not warm. The lantern trail this replaced was amber, which is the
    // colour of the office and of Albert — the warmth the island has lost. A
    // soul-light that is already warm has nothing left to promise, and the walk
    // it leads is the loneliest stretch of the opening. Pale glass-blue reads
    // as cold light in cold mist, and makes the amber of the office, when it
    // finally arrives, mean something.
    const material = (opacity: number, scale: number, additive = true) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        color: palette.glass,
        transparent: true,
        depthWrite: false,
        // The wisp is a light source, and fog scatters a light source into a
        // halo rather than subtracting it. Under scene fog the thing the player
        // is meant to follow through fog is the first thing the fog erases.
        fog: false,
        // The halo adds; the core does not. Additive light on a *bright*
        // field adds almost nothing, and at dusk this renderer's fog takes the
        // sky's colour — so the wisp, staged to be the one thing visible in the
        // mist, was invisible in the mist. A solid near-white core reads on any
        // background the sky can produce; the additive halo around it is what
        // makes the core look like a source rather than a dot.
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity,
        // Constant screen size. Attenuated, one distance is right and the rest
        // are wrong: sized to read at the far end of its leash it is a bonfire
        // when the player catches up, and it was washing out her silhouette.
        sizeAttenuation: false,
      }));
      sprite.scale.setScalar(scale);
      return sprite;
    };
    // Two sprites, and the sizes are the whole of what makes it read as a
    // flame rather than a smudge. The core was 0.055 of the viewport, which at
    // this renderer's 480x360 internal target is about three pixels — so what
    // the player actually saw was the halo alone, a soft blob with no source
    // in it. A glow needs something to be a glow *of*.
    this.halo = material(0.6, 0.3);
    this.core = material(1, 0.105, false);
    // Range and intensity are set to actually pool on the ground it passes
    // over, not just to exist: at dusk the island is dark and a guiding light
    // that lights nothing reads as a UI marker composited over the world
    // rather than as something in it.
    this.light = new THREE.PointLight(palette.glass, 4.2, 15, 2);
    this.object.add(this.halo, this.core, this.light);
    this.object.visible = false;
    world.add(this.object);
  }

  /**
   * Send the wisp along the walkable route to a mark, leading from `from`.
   *
   * Returns false when this island offers no walkable route, which the caller
   * should treat as a staging failure rather than papering over: a wisp that
   * cannot lead anywhere is worse than no wisp, because the player will follow
   * it regardless.
   */
  lead(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const route = approachRoute(from, to);
    if (!route) return false;
    this.route = route;
    this.distances = [0];
    for (let i = 1; i < route.points.length; i++) {
      this.distances.push(this.distances[i - 1] + route.points[i].distanceTo(route.points[i - 1]));
    }
    this.travelled = Math.min(LEAD, route.length);
    this.object.position.copy(this.at(this.travelled));
    this.object.visible = true;
    this.target = 1;
    return true;
  }

  /** Fade it out where it stands, for a beat that does not use the merge. */
  dismiss(): void {
    this.target = 0;
  }

  /**
   * Fly into a body and go out.
   *
   * The payoff the whole walk was for: the light the player followed is what
   * the Keeper has been missing, and it goes into him rather than merely
   * arriving beside him. Resolves when the wisp is gone, so the beat can put
   * the unfold on the frame the light disappears in.
   */
  mergeInto(into: THREE.Object3D, over = 1.8): Promise<void> {
    this.merging = { into, elapsed: 0, over };
    this.route = null;
    return new Promise((resolve) => { this.settle = resolve; });
  }

  private settle: (() => void) | null = null;

  /**
   * Where along the route a given distance falls, sampled on the ground.
   *
   * Hovering at a fixed height over *terrain* rather than interpolating the
   * path's own heights: the path is a metre-resolution lattice over ground
   * that steps at tier changes, and a light that stepped with it would strobe
   * up and down a ramp instead of floating over it.
   */
  private at(distance: number): THREE.Vector3 {
    const route = this.route;
    if (!route) return this.object.position.clone();
    const d = Math.max(0, Math.min(route.length, distance));
    let i = 1;
    while (i < this.distances.length - 1 && this.distances[i] < d) i++;
    const span = this.distances[i] - this.distances[i - 1];
    const t = span > 1e-6 ? (d - this.distances[i - 1]) / span : 0;
    const at = route.points[i - 1].clone().lerp(route.points[i], t);
    at.y = heightAt(at.x, at.z) + HOVER;
    return at;
  }

  /**
   * Advance one frame.
   *
   * `player` may be null — during the merge, and while the wisp is fading,
   * there is nobody to keep station on.
   */
  update(dt: number, player: THREE.Vector3 | null): void {
    this.age += dt;
    this.brightness += (this.target - this.brightness) * Math.min(1, dt * 2.4);

    if (this.merging) {
      const m = this.merging;
      m.elapsed += dt;
      const t = Math.min(1, m.elapsed / m.over);
      // Into the body's middle, not its feet: `getWorldPosition` is the root,
      // and the Keeper's root is on the ground under a four-metre body.
      const box = new THREE.Box3().setFromObject(m.into);
      const heart = box.getCenter(new THREE.Vector3());
      // Ease in: the light hesitates, then commits. A linear approach reads as
      // a projectile, and this is a decision.
      const eased = t * t;
      this.object.position.lerp(heart, Math.min(1, eased * 2.2 * Math.max(dt * 60, 1) / 60 + dt * 2));
      // Flare, then out. The Keeper takes the light; it does not merely land.
      this.target = t < 0.72 ? 1.9 : 0;
      if (t >= 1) {
        this.merging = null;
        this.object.visible = false;
        this.brightness = 0;
        this.settle?.();
        this.settle = null;
      }
    } else if (this.route && player) {
      // Station-keeping. The wisp wants to sit `LEAD` metres further along the
      // route than the player is, and refuses to be more than `PATIENCE` ahead
      // — so it waits for a player who stops, and it never outruns the fog.
      const behind = this.progressOf(player);
      const want = Math.min(this.route.length, behind + LEAD);
      if (this.travelled > behind + PATIENCE) {
        // Too far ahead: hold. Not reverse — a light that backs toward the
        // player reads as fetching her, which is a dog, not a spirit.
      } else if (want > this.travelled) {
        this.travelled = Math.min(want, this.travelled + SPEED * dt);
      }
      const goal = this.at(this.travelled);
      this.object.position.lerp(goal, Math.min(1, dt * 3.4));
    }

    // Bob and breathe, always — a light that holds perfectly still while it
    // waits reads as a UI marker rather than as something alive.
    this.object.position.y += Math.sin(this.age * 1.7) * dt * 0.42;
    const breath = 0.86 + Math.sin(this.age * 2.3) * 0.14;
    const lit = this.brightness * breath;
    this.core.material.opacity = Math.min(1, lit);
    this.halo.material.opacity = 0.62 * lit;
    this.light.intensity = 4.2 * lit;
    this.object.visible = lit > 0.01;
  }

  /** How far along the route the player has got, in metres of path. */
  private progressOf(player: THREE.Vector3): number {
    const route = this.route;
    if (!route) return 0;
    let best = 0;
    let bestD = Infinity;
    // Searched from the front rather than globally: the route doubles back on
    // itself around the ramp, and the nearest point to a player standing on the
    // upper tier is a point on the *lower* leg she has already walked.
    for (let i = 0; i < route.points.length; i++) {
      const d = route.points[i].distanceToSquared(player);
      if (d < bestD) { bestD = d; best = i; }
    }
    return this.distances[best] ?? 0;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.core.material.dispose();
    this.halo.material.dispose();
    void this.world;
  }
}
