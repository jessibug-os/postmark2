import type * as THREE from 'three';
import { bindSet, type GroundHeight, type SetPlacement } from './SetBinding';
import { ACRE_SIZE, acreCentre } from '../../world/island/AcreLibrary';
import type { IslandMap } from '../../world/island/IslandMap';
import {
  ANCHOR_LANDMARKS, type AnchorLandmark, type CutsceneSet, type SetRequirement,
} from './SetFormat';

/**
 * Checking a set's `requires` contract against the island hosting it.
 *
 * A `.set` states what it needs from anywhere it is seated — the ferry needs
 * water to float on, the office needs somewhere to stand and somewhere to be
 * approached from. Nothing enforced that before: the opening was authored on
 * one map and simply assumed the other seven resembled it, which is how a set
 * comes to be planted with its front door over open water.
 *
 * Deliberately a small vocabulary, and a violation names the map, the set and
 * the unmet clause rather than throwing. A contract that stopped the game from
 * booting would make an authoring problem into an outage; a contract that
 * reports is one the gate can enumerate across all eight maps at once.
 */

/**
 * Seat a set, declining to point it somewhere its own contract forbids.
 *
 * The `.set` says which way the building wants to look — `face dock`, because
 * the walk inland should arrive down the building's own axis. On some of the
 * eight authored maps that bearing puts the front door over open water, and the
 * approach mark with it. This tries the authored facing first and, only if it
 * breaks the set's **own** contract, rotates to the nearest heading that keeps
 * more of it — every clause, not just `standable`, because a doorway facing
 * into a hillside satisfies "you can stand there" and still leaves the camera
 * that shoots through it buried in the slope.
 *
 * The intent stays authored; what is searched is coverage across maps, which is
 * the one thing a human placing a building by hand on one map cannot do. It
 * returns the authored placement unchanged when nothing better exists, so a map
 * where no heading works still fails the gate loudly rather than being quietly
 * rotated to something almost as wrong.
 */
export function seatSet(
  set: CutsceneSet,
  island: IslandMap,
  ground: GroundHeight,
  probe: WorldProbe,
  vector: (x: number, y: number, z: number) => THREE.Vector3,
): SetPlacement {
  const authored = bindSet(set, island, ground);
  if (!set.requires.length) return authored;
  const violations = (placement: SetPlacement): number =>
    checkContract(placement, island, probe, vector).length;
  if (violations(authored) === 0) return authored;

  // Eighth turns, nearest the authored facing first, so a set that has to be
  // rotated is rotated as little as the contract allows.
  const offsets = [45, -45, 90, -90, 135, -135, 180];
  let best = authored;
  let bestCount = violations(authored);
  for (const offset of offsets) {
    const turned = bindSet(
      { ...set, anchor: { ...set.anchor, turn: set.anchor.turn + offset } },
      island,
      ground,
    );
    const count = violations(turned);
    if (count < bestCount) { best = turned; bestCount = count; }
    if (bestCount === 0) break;
  }
  return best;
}

export interface ContractViolation {
  set: string;
  requirement: string;
  message: string;
  line: number;
}

/** What the checker needs to know about the world. Injected, so it is testable. */
export interface WorldProbe {
  /** Ground height at a world point. */
  heightAt(x: number, z: number): number;
  /** True where the player's character can stand. */
  walkableAt(x: number, z: number): boolean;
  /** Still-water level. Anything below it is sea. */
  seaLevel: number;
}

/**
 * The requirement vocabulary.
 *
 * - `standable <mark...>` — each named mark is on ground the player can stand
 *   on. The clause the office needs, and the one it fails when its front faces
 *   the water.
 * - `water seaward <metres>` — there is open water this far along the set's own
 *   forward axis. What makes a berth a berth.
 * - `flat <metres> <tolerance>` — the ground within this radius of the set's
 *   origin varies by no more than the tolerance, so a building does not
 *   overhang a tier edge. The radius is the building's own footprint corner,
 *   not a round number: sampling further out reads the neighbouring acre's
 *   cliff bleeding across the seam and condemns a site the building fits on.
 * - `clear <metres>` — the world's scatter keeps this radius around the set's
 *   origin free of trees and props. Not checked here but read by
 *   acre fixture authoring: `AGENTS.md` rule 6 says the player is always visible, and an
 *   orchard tree planted where a scene stages puts a trunk between the camera
 *   and the character the shot exists to introduce.
 * - `visible-from <landmark> <mark>` — the ground does not rise between that
 *   landmark and this mark. The opening's dock beat promises "you can see where
 *   to go" and its authored note says the shot must contain the lantern line;
 *   this is that promise written down where the placer and the gate can both
 *   read it, rather than left as something the map either happens to allow or
 *   quietly does not.
 * - `on-acre` — every mark lies inside the anchor acre. The clause that keeps a
 *   set portable: a mark 0.2m past the seam is on grass on one map and in open
 *   water on the next, and which one is pure luck.
 */
/** Roughly where a standing character's eyes are. */
const EYE = 1.4;

/**
 * How far the ground rises above the straight line between two points, or null
 * if it never does.
 *
 * A terrain-only test: buildings and trees are not consulted, because this
 * answers "does this map have a sightline here" — a property of the island —
 * rather than "is this particular shot clear", which is `clearSightline`'s job
 * against real geometry at the moment a camera cuts.
 */
function ridgeBetween(
  from: THREE.Vector3,
  to: THREE.Vector3,
  probe: WorldProbe,
  vector: (x: number, y: number, z: number) => THREE.Vector3,
): number | null {
  const steps = Math.max(8, Math.round(from.distanceTo(to) / 3));
  let worst = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const at = vector(
      from.x + (to.x - from.x) * t,
      0,
      from.z + (to.z - from.z) * t,
    );
    const line = from.y + (to.y - from.y) * t;
    worst = Math.max(worst, probe.heightAt(at.x, at.z) - line);
  }
  return worst > 0.25 ? worst : null;
}

export function checkContract(
  placement: SetPlacement,
  island: IslandMap,
  probe: WorldProbe,
  vector: (x: number, y: number, z: number) => THREE.Vector3,
): ContractViolation[] {
  const out: ContractViolation[] = [];
  const fail = (requirement: SetRequirement, message: string): void => {
    out.push({
      set: placement.set.id,
      requirement: [requirement.kind, ...requirement.args].join(' '),
      message,
      line: requirement.line,
    });
  };

  for (const requirement of placement.set.requires) {
    switch (requirement.kind) {
      case 'standable': {
        for (const markId of requirement.args) {
          let at: THREE.Vector3;
          try {
            at = placement.markWorld(markId);
          } catch (error) {
            fail(requirement, String((error as Error).message ?? error));
            continue;
          }
          if (at.y <= probe.seaLevel) {
            fail(requirement, `mark "${markId}" is under water (y ${at.y.toFixed(2)})`);
          } else if (!probe.walkableAt(at.x, at.z)) {
            fail(requirement, `mark "${markId}" is not on standable ground`);
          }
        }
        break;
      }
      case 'water': {
        const [direction, reach] = requirement.args;
        if (direction !== 'seaward') {
          fail(requirement, `unknown water direction "${direction}" (expected seaward)`);
          break;
        }
        const distance = Number(reach);
        const forward = placement.aperture();
        const at = placement.origin.clone().addScaledVector(forward, distance);
        if (probe.heightAt(at.x, at.z) > probe.seaLevel) {
          fail(requirement, `no open water ${distance}m along the set's forward axis`);
        }
        break;
      }
      case 'flat': {
        const [reach, tolerance] = requirement.args;
        const radius = Number(reach);
        const allowed = tolerance === undefined ? 0.6 : Number(tolerance);
        const base = probe.heightAt(placement.origin.x, placement.origin.z);
        let worst = 0;
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const at = vector(
            placement.origin.x + Math.cos(angle) * radius,
            0,
            placement.origin.z + Math.sin(angle) * radius,
          );
          worst = Math.max(worst, Math.abs(probe.heightAt(at.x, at.z) - base));
        }
        if (worst > allowed) {
          fail(requirement, `ground varies by ${worst.toFixed(2)}m within ${radius}m (allowed ${allowed})`);
        }
        break;
      }
      case 'clear':
        // Honoured by the world builder, not asserted here — there is nothing
        // to check after the fact except that the number parses.
        if (!Number.isFinite(Number(requirement.args[0]))) {
          fail(requirement, `clear expects a radius in metres, got "${requirement.args[0]}"`);
        }
        break;
      case 'visible-from': {
        const [landmark, markId] = requirement.args;
        if (!(ANCHOR_LANDMARKS as readonly string[]).includes(landmark)) {
          fail(requirement, `unknown landmark "${landmark}"`);
          break;
        }
        let to: THREE.Vector3;
        try {
          to = placement.markWorld(markId);
        } catch (error) {
          fail(requirement, String((error as Error).message ?? error));
          break;
        }
        const acre = island.anchors[landmark as AnchorLandmark] as { col: number; row: number };
        const centre = acreCentre(acre.col, acre.row);
        const from = vector(centre.x, probe.heightAt(centre.x, centre.z) + EYE, centre.z);
        const blocked = ridgeBetween(from, to.clone().setY(to.y + EYE), probe, vector);
        if (blocked !== null) {
          fail(requirement, `the ground rises ${blocked.toFixed(2)}m above the line from ${landmark}`);
        }
        break;
      }
      case 'on-acre': {
        const half = ACRE_SIZE / 2;
        for (const mark of [...placement.set.marks, ...placement.set.seats]) {
          const { x, z } = mark.position;
          if (Math.abs(x) > half || Math.abs(z) > half) {
            fail(requirement, `mark "${mark.id}" is ${Math.max(Math.abs(x), Math.abs(z)).toFixed(2)}m out, past the acre's ${half}m half-width`);
          }
        }
        break;
      }
      default:
        fail(requirement, `no checker knows the requirement "${requirement.kind}"`);
    }
  }
  return out;
}
