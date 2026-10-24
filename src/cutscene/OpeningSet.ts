import * as THREE from 'three';
import { assets, type AssetId } from '../core/AssetLoader';
import { ACTIVE_OPENING_ROLES } from '../content/activePack';
import { SkeletalAnimator } from '../characters/SkeletalAnimator';
import { PALETTE_HEX } from '../art/palette';
// Imported from the leaf modules, not from TownMap: TownBuilder is part of
// TownMap's own graph and imports this file to place the office, so reaching
// back through TownMap would close an import cycle.
import { heightAt } from '../world/terrain';
import { ACTIVE_LAYOUT } from '../world/mapConstants';
import type { IslandMap } from '../world/island/IslandMap';
import { seatSet } from './set/SetContract';
import { type SetPlacement } from './set/SetBinding';
import { authoredSets, setById } from './set/SetLibrary';
import { ACTIVE_FIELD } from '../world/mapConstants';
import {
  islandFixtures, islandKeepClear, islandMarks, type PlacedFixture,
} from '../world/island/AcreFixtures';

const UP = new THREE.Vector3(0, 1, 0);
import { SEA_LEVEL } from '../world/island/IslandRuntime';
import { float } from '../world/water/Buoyancy';

/**
 * Authored staging for the Kindly Forward opening.
 *
 * The opening used to build its own hero geometry inline: a BoxGeometry deck,
 * one rail and three CapsuleGeometry passengers. That made the first promise of
 * the game — an ordinary working ferry — read as temporary prototype space, so
 * the fog and the emptying boat landed as effects applied to a blockout rather
 * than as reality slipping away.
 *
 * Everything here loads authored GLBs instead (`assets/scripts/build_ferry.py`,
 * `build_post_office.py`, `build_ferry_passenger.py`, `build_lantern.py`) and
 * exposes the named anchors the cutscene stages against, so shot framing and
 * actor placement are stated once here rather than as loose vectors inside the
 * script.
 */

/**
 * Where the opening's two sets stand, on whatever island is loaded.
 *
 * The anchors used to be frozen `THREE.Vector3` constants in this file,
 * hand-copied into `kindly-opening.scene` — two sources of truth kept in sync
 * by remembering to. They live in `src/cutscene/sets/*.set` now, and this is
 * the one place they are seated: `island.anchors` says which acre the landmark
 * is on, the acre's placed piece says which way it faces, and the `.set` says
 * where the staging sits relative to that.
 *
 * The asset is authored in Blender facing -Y with +Z up; the glTF export maps
 * that to Three's +Y up and **+Z forward**, so a Blender point (x, y, z)
 * arrives as (x, z, -y) and every `.set` is written in that frame. Getting the
 * flip wrong puts every actor inside the cabin, so the mapping is stated rather
 * than rediscovered.
 */
const placements = new Map<string, SetPlacement>();

function placementOf(id: string, island: IslandMap): SetPlacement {
  // Keyed by island as well as set: the preview swaps maps without a reload,
  // and a cached ferry from the previous map would be seated on the old dock.
  const key = `${island.id ?? 'active'}:${id}`;
  const cached = placements.get(key);
  if (cached) return cached;
  const placement = seatSet(
    setById(id),
    island,
    heightAt,
    {
      heightAt,
      walkableAt: (x, z) => ACTIVE_FIELD?.walkableAt(x, z) ?? true,
      seaLevel: SEA_LEVEL,
    },
    (x, y, z) => new THREE.Vector3(x, y, z),
  );
  placements.set(key, placement);
  return placement;
}

function activeIsland(): IslandMap {
  const island = ACTIVE_LAYOUT.acres;
  // The layout's `acres` is optional because the seeded path used to omit it.
  // Nothing can be staged without an island, so this is a throw rather than a
  // fallback that would seat both sets at the world origin.
  if (!island) throw new Error('the active layout carries no island to seat sets on');
  return island;
}

/** The ferry, seated on the loaded island's dock. */
export function ferryPlacement(island: IslandMap = activeIsland()): SetPlacement {
  return placementOf('ferry', island);
}

/**
 * The post office, read off the acre that owns it.
 *
 * It used to be a `.set` seated against the `postOffice` anchor, with its
 * facing solved from `face dock` at load. It is now a fixture of
 * `post-office-a.acre` — the piece is `unique`, so it appears at most once per
 * island and its quarter turn *is* the building's facing, authored per map by
 * `scripts/face-landmarks.mjs` rather than derived every boot.
 *
 * The shape of the answer is unchanged on purpose: `origin`, `yaw`, a local-to-
 * world conversion and a mark lookup are the whole surface the rest of the
 * opening ever used, so nothing above this had to move.
 */
export interface OfficeAnchor {
  origin: THREE.Vector3;
  yaw: number;
  /** Office-local to world, re-sampling the ground under the result. */
  atGround(local: THREE.Vector3): THREE.Vector3;
  /** A named mark this acre offers, in world space. */
  mark(id: string): THREE.Vector3;
}

const officeCache = new Map<string, OfficeAnchor>();

export function officePlacement(island: IslandMap = activeIsland()): OfficeAnchor {
  const key = island.id ?? 'active';
  const cached = officeCache.get(key);
  if (cached) return cached;

  const marks = islandMarks(island, heightAt);
  const building = islandFixtures(island, heightAt)
    .find((placed: PlacedFixture) => placed.kind === 'prop' && placed.id === 'building');
  if (!building) {
    throw new Error('this island carries no post-office acre with a "building" fixture');
  }
  const anchor: OfficeAnchor = {
    origin: building.position.clone(),
    yaw: building.yaw,
    atGround(local) {
      const world = local.clone().applyAxisAngle(UP, building.yaw).add(building.position);
      // Same bargain the set struck with `# ground: conform`: keep x and z, and
      // take the height from the terrain under the result rather than from the
      // building's own origin, so a wall on a slope stands on the slope.
      world.y = heightAt(world.x, world.z) + local.y;
      return world;
    },
    mark(id) {
      const found = marks.get(id);
      if (!found) {
        throw new Error(`no island mark "${id}" (have ${[...marks.keys()].join(', ') || 'none'})`);
      }
      return found.position.clone();
    },
  };
  officeCache.set(key, anchor);
  return anchor;
}

/**
 * Circles the world's scatter must leave empty, from every set's `clear` clause.
 *
 * `AGENTS.md` rule 6: the player is always visible, no frame ever where a
 * character is buried under foliage. The opening is where that rule is hardest
 * to keep, because the scatter is placed by the town builder long before anyone
 * knows where a camera will be — and on one map an orchard tree landed between
 * the reveal camera and Albert, which the sightline check caught by name.
 *
 * Read by editor-authored fixture placement, so a set that needs room says so in its own file
 * rather than the world builder carrying a list of places to avoid.
 */
let keepClear: Array<{ x: number; z: number; r: number }> | null = null;

export function setKeepClear(): Array<{ x: number; z: number; r: number }> {
  // Memoized: the world builder asks this once per scatter candidate, which is
  // thousands of times, and the answer depends only on the loaded island and
  // the authored sets — neither of which changes while the page is up.
  if (keepClear) return keepClear;
  const out: Array<{ x: number; z: number; r: number }> = [];
  // Acre fixtures ask for room the same way a set does, and for the same
  // reason: the post office is scatter-clearing world content now, and losing
  // its radius would put an orchard tree back in front of Albert's reveal.
  try {
    out.push(...islandKeepClear(activeIsland(), heightAt));
  } catch {
    // No island seated yet; the coherency gate reports that, not the scatter.
  }
  for (const set of authoredSets()) {
    const clear = set.requires.find((clause) => clause.kind === 'clear');
    if (!clear) continue;
    const radius = Number(clear.args[0]);
    if (!Number.isFinite(radius)) continue;
    try {
      const placement = setPlacement(set.id);
      out.push({ x: placement.origin.x, z: placement.origin.z, r: radius });
    } catch {
      // A set that cannot be seated on this island keeps nothing clear; the
      // coherency gate is where that is reported, not here.
    }
  }
  keepClear = out;
  return out;
}

/** Any set by id, seated on the loaded island. One door, so one answer. */
export function setPlacement(id: string, island: IslandMap = activeIsland()): SetPlacement {
  return placementOf(id, island);
}

/**
 * Instance every prop a set declares, in its own space.
 *
 * The `.glb` a `.set` writes is decoration for the reader — the loader keys on
 * the registry name, and a set that says `ferry.glb` and one that says `ferry`
 * mean the same model.
 */
function addProps(group: THREE.Group, placement: SetPlacement): void {
  for (const prop of placement.set.props) {
    // The registry validates the id at load; an unknown model throws there,
    // naming it, which is a better error than anything a cast could add here.
    const model = assets.model(prop.model.replace(/\.glb$/i, '') as AssetId);
    model.position.set(prop.position.x, prop.position.y, prop.position.z);
    group.add(model);
  }
}

export interface FerrySet {
  group: THREE.Group;
  /** Where this ferry is seated. Marks resolve through it. */
  placement: SetPlacement;
  recruit: THREE.Group;
  recruitAnimator: SkeletalAnimator;
  passengers: FerryPassenger[];
  /** Ferry-local point converted to world space. */
  at(local: THREE.Vector3): THREE.Vector3;
  /** A named `.set` mark in world space. */
  mark(id: string): THREE.Vector3;
}

export interface FerryPassenger {
  root: THREE.Group;
  seated: THREE.Object3D;
  standing: THREE.Object3D;
  case: THREE.Object3D;
}

/** Coat tints so three anonymous silhouettes do not read as one person cloned. */
/**
 * A coat and a hat per passenger, and the hat is the one that matters.
 *
 * `ferry-passenger.glb` is painted out of the *ferry's own palette*: its coat
 * is `#c2b49c`, which is the benches, and its trousers are `#a29381`, which is
 * the deck. Three people were therefore upholstery, and only the coat was ever
 * being retinted — so the part that actually clears the bench back when
 * somebody is sitting down, the hat, kept the boat's patina and read as another
 * fitting.
 *
 * Which is why "the ferry empties" was being carried by the benches going bare
 * rather than by the player counting people. Hats are dark and distinct now,
 * well off both the deck's value (0.30) and the benches' (0.47), so a seated
 * passenger is a silhouette against the timber instead of part of it.
 *
 * Three different hues as well as three different values: anonymous is the
 * design, identical is a bug, and at this distance value does the separating
 * while hue does the "these are three people".
 */
const PASSENGER_COLOURS: ReadonlyArray<{ coat: number; hat: number }> = [
  { coat: PALETTE_HEX.h4a6a72, hat: PALETTE_HEX.h201a14 },
  { coat: PALETTE_HEX.h8a7455, hat: PALETTE_HEX.ha8402f },
  { coat: PALETTE_HEX.h7d7a72, hat: PALETTE_HEX.h5c4a38 },
];

/**
 * Repaint one passenger's coat and hat.
 *
 * Materials are cloned first: the registry hands out shared materials, so
 * tinting in place would recolour every passenger at once — and, because the
 * passenger shares its palette with the boat, would recolour the boat too.
 */
function tintPassenger(root: THREE.Object3D, colours: { coat: number; hat: number }): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshLambertMaterial)) continue;
      const hex = material.name.includes('coat') ? colours.coat
        : material.name.includes('hat') ? colours.hat
          : null;
      if (hex === null) continue;
      const tinted = material.clone();
      tinted.color.setHex(hex);
      object.material = tinted;
    }
  });
}

function makePassenger(index: number): FerryPassenger {
  const root = assets.model('ferry-passenger');
  root.name = `ferry-passenger-${index}`;
  const seated = root.getObjectByName('passenger_seated');
  const standing = root.getObjectByName('passenger_standing');
  const luggage = root.getObjectByName('passenger_case');
  if (!seated || !standing || !luggage) {
    throw new Error('ferry-passenger.glb is missing an authored pose node');
  }
  // The figure boards seated with the case on the deck beside them.
  standing.visible = false;
  luggage.position.set(0.55, -0.49, 0.1);
  tintPassenger(root, PASSENGER_COLOURS[index % PASSENGER_COLOURS.length]);
  return { root, seated, standing, case: luggage };
}

/** Stand a seated passenger up and give them their case to carry. */
export function standPassenger(passenger: FerryPassenger): void {
  passenger.seated.visible = false;
  passenger.standing.visible = true;
  // The case moves into the carrying hand authored on the standing pose. The
  // hand sits 0.55 up the standing figure, so a y of 0 leaves the case on the
  // deck at their feet while the arm carries nothing.
  passenger.case.position.set(0.31, 0.55, -0.28);
}

/**
 * Build the authored ferry, seat its passengers and place the recruit.
 *
 * The deck's walking surface is the set's own origin by construction, so actors
 * stage at local y=0 without the runtime measuring the hull.
 */
export function buildFerrySet(scene: THREE.Object3D, island?: IslandMap): FerrySet {
  const placement = island ? ferryPlacement(island) : ferryPlacement();
  const set = placement.set;
  const group = new THREE.Group();
  group.name = 'kindly-forward-ferry';
  addProps(group, placement);

  const passengers = set.seats.map((seat, index) => {
    const passenger = makePassenger(index);
    passenger.root.position.copy(placement.local(seat.id));
    passenger.root.rotation.y = seat.facing * (Math.PI / 180);
    group.add(passenger.root);
    return passenger;
  });

  const recruit = ACTIVE_OPENING_ROLES.ferryRecruit.model();
  recruit.name = 'ferry-recruit';
  recruit.position.copy(placement.local('deck.recruit'));
  // Turned to face the player across the deck, so the warning is delivered to
  // a face and not to the back of a head. Derived from the two marks rather
  // than dialled in by eye: a hand-set yaw is only correct for one camera, and
  // the shot plan moves the camera between every beat he speaks in. The set
  // states the relationship — `mark deck.recruit ... facing deck.player` — and
  // `markFacing` does the arithmetic, in world space, so the ferry's own
  // heading on this island is already in the answer.
  recruit.rotation.y = (placement.markFacing('deck.recruit') ?? 0) - placement.yaw;
  group.add(recruit);
  const recruitAnimator = new SkeletalAnimator(recruit, ACTIVE_OPENING_ROLES.ferryRecruit.clips());

  group.position.copy(placement.origin);
  group.rotation.y = placement.yaw;
  scene.add(group);
  // A boat on water moves. Registered after the group is placed and parented,
  // because `float` captures the rest pose it works from.
  float(group, { rise: 0.055, roll: 0.013, period: 4.9, phase: 0.4 });

  return {
    group,
    placement,
    recruit,
    recruitAnimator,
    passengers,
    at: (local: THREE.Vector3) => group.localToWorld(local.clone()),
    mark: (id: string) => placement.markWorld(id),
  };
}

/**
 * Where the post office stands, and which way it looks.
 *
 * The building is part of the world, not something the cutscene spawns and
 * deletes. That is deliberate: the reveal location has to still be there
 * during the handoff, because the first objective is to start reopening it.
 * A set that vanishes with the title card takes the office crisis out of the
 * composition at exactly the moment the player is asked to care about it.
 *
 * Its facing used to be `atan2` from the old town-hall spot to the dock — "the
 * front looks at the boat", which is only reliably true on a map where those
 * two are on the same side of the island. It is now the rotation of the
 * authored `post-office` acre, turned by whatever the `.set` asks for: a human
 * placed that piece, and which way it faces is part of what they placed.
 */
export function officeFacing(): number {
  return officePlacement().yaw;
}

export function officeOrigin(): THREE.Vector3 {
  return officePlacement().origin.clone();
}

/** A named mark the post-office acre offers, in world space. */
export function officeMark(id: string): THREE.Vector3 {
  return officePlacement().mark(id);
}
