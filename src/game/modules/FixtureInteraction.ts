import * as THREE from 'three';
import type { Game } from '../Game';
import type { PlacedObject } from '../../world/TownMap';
import { componentsOf, type SeatComponent } from '../../world/objects/GameObjectFormat';
import { heightAt } from '../../world/terrain';
import { audio } from '../../core/AudioSystem';
import { PALETTE_HEX } from '../../art/palette';

/**
 * Interacting with the objects an acre placed.
 *
 * The first thing a `.gameobj` component *does*, and the proof the split is
 * worth having: a bench is sittable because its type says
 * `seat left at …` and `interact sit left`, not because anything in this file
 * knows what a bench is. A second sittable object is a text file.
 *
 * The state lives here rather than on `Game`, which `AGENTS.md` asks not to
 * grow. There is one player, so one seat at a time is the whole of it.
 */

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/** How close the player must be for an object to offer its interaction. */
const REACH = 1.8;

/**
 * The three clips a seat uses, in the order they play.
 *
 * Performance names, so they go through the vocabulary and the ownership rules
 * like any cutscene pose. The two transitions are optional — a character with
 * only `seated_idle` still sits, they simply arrive in the pose instead of
 * moving into it. `sit_down` and `stand_up` are one-shots (`clipVocabulary`),
 * so they clamp on their last frame rather than looping back to standing.
 */
const SEAT_CLIPS = { enter: 'sit_down', hold: 'seated_idle', exit: 'stand_up' } as const;

/** How far clear of the seat standing up puts her. */
const STEP_OFF = 0.9;

/**
 * Dust colours for the scuff when weight lands.
 *
 * Two close earth tones rather than one: a single colour reads as a decal, and
 * the whole point of a puff is that it looks like several things at once.
 */
const SCUFF = [PALETTE_HEX.h9a7f4e, PALETTE_HEX.h8a8478];

/**
 * When the weight lands, as a share of each transition.
 *
 * Sitting lands late — she is still crossing for most of it and the sound
 * belongs to the settle. Standing lands early: the push-off is the effort, and
 * a scuff at the end would be a footfall she has already finished making. Both
 * match `SEAT_EASE`, which holds still for the first 4/18 of either clip.
 */
const WEIGHT_AT = { sit: 0.62, stand: 0.3 };

let seated: { object: PlacedObject; seat: SeatComponent } | null = null;

/**
 * Where a seat is in the world, and which way it faces.
 *
 * Exported for testing: this is the one piece of maths in the file, and getting
 * the facing sign wrong would seat the player backwards on a rotated bench —
 * plausible-looking and invisible until an acre is turned.
 */
export function seatWorld(object: PlacedObject, seat: SeatComponent): {
  position: THREE.Vector3; facing: number;
} {
  const offset = new THREE.Vector3(seat.at.x, seat.at.y, seat.at.z).applyAxisAngle(UP, object.yaw);
  return {
    position: object.position.clone().add(offset),
    // The seat's facing is authored in the object's frame, so it turns with it.
    facing: object.yaw - seat.facing * DEG,
  };
}

/**
 * Stand up: rise and step clear of the seat as one motion.
 *
 * The step is along the seat's own facing, because standing in place would
 * leave her overlapping the bench's collider and be shoved out sideways. Her
 * ground height is picked up again the moment `seated` clears, so the target
 * only needs to be right in x and z.
 */
export function standUp(this: Game): void {
  if (!seated) return;
  const { object, seat } = seated;
  const { position, facing } = seatWorld(object, seat);
  seated = null;
  audio.sfx('shake');
  const clear = position.clone().add(
    new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(STEP_OFF),
  );
  // Down to the ground as part of the rise. Left at seat height the descent
  // happened in one frame at the end, after the animation had already finished
  // standing her up — a 0.48 drop with nothing to explain it.
  clear.y = heightAt(clear.x, clear.z);
  const span = this.player.animation.performanceLength(SEAT_CLIPS.exit);
  this.player.standFrom(clear, facing, SEAT_CLIPS.exit);
  // The scuff belongs to the moment her feet take the weight, not to the button
  // press — landing it on the push-off is what makes a rise feel like effort.
  scuffAt(this, clear, span * WEIGHT_AT.stand);
}

/** A small puff of dust at ground level, after a delay. */
function scuffAt(game: Game, at: THREE.Vector3, delay: number): void {
  window.setTimeout(() => {
    game.burst(at.clone().setY(at.y + 0.08), SCUFF, 5, {
      speed: 0.5, up: 0.5, life: 0.4, size: 0.035, gravity: 2.2,
    });
  }, Math.max(0, delay) * 1000);
}

/**
 * Actions the nearby placed objects offer, newest-first in the prompt.
 *
 * Returns the same shape `updateInteractions` collects everywhere else, so a
 * fixture competes with a villager and a fruit tree on equal terms rather than
 * pre-empting them.
 */
export function fixtureActions(this: Game): Array<{ text: string; key: string; run: () => void }> {
  const actions: Array<{ text: string; key: string; run: () => void }> = [];

  // A rebuilt world drops the object that was being sat on. Cleared rather
  // than carried, or the player would be frozen on a bench that no longer
  // exists with no prompt to release them.
  if (seated && !this.map.placedObjects.includes(seated.object)) {
    seated = null;
    this.player.stand();
  }
  // Nothing is on offer mid-transition. Without this the rise clears `seated`
  // at its first frame, so the bench offers "sit down" again while she is still
  // getting up and a second press restarts the sit from a half-risen pose.
  if (this.player.inSeatTransition) return actions;
  // Seated: the only thing on offer is getting up, and it must outrank
  // everything else — a player who cannot stand is stuck.
  if (seated) {
    actions.push({ text: '[E] Stand up', key: 'KeyE', run: () => this.standUp() });
    return actions;
  }

  const pos = this.player.position;
  let nearest: PlacedObject | null = null;
  let best = REACH * REACH;
  for (const object of this.map.placedObjects) {
    const distance = object.position.distanceToSquared(pos);
    if (distance < best) {
      best = distance;
      nearest = object;
    }
  }
  if (!nearest) return actions;

  const object = nearest;
  for (const interact of componentsOf(object.definition, 'interact')) {
    if (interact.verb === 'sit') {
      const seat = componentsOf(object.definition, 'seat')
        .find((candidate) => candidate.id === interact.target);
      // The format refuses an `interact sit` naming a seat that does not exist,
      // so this cannot be missing on a file that parsed.
      if (!seat) continue;
      actions.push({
        text: `[E] ${interact.prompt ?? 'Sit'}`,
        key: 'KeyE',
        run: () => {
          const { position, facing } = seatWorld(object, seat);
          const span = this.player.animation.performanceLength(SEAT_CLIPS.enter);
          if (!this.player.sitAt(position, facing, SEAT_CLIPS.hold, SEAT_CLIPS.enter)) {
            // A character whose packet has no seated clip. Said out loud,
            // because a button that silently does nothing is the worst possible
            // version of it.
            this.showPrompt('They have no way to sit');
            return;
          }
          seated = { object, seat };
          // Landing on the seat, not leaving the ground: the settle is the beat
          // with the weight in it.
          window.setTimeout(() => audio.sfx('shake'), span * WEIGHT_AT.sit * 1000);
        },
      });
      continue;
    }
    // `interact scene` parses and validates but has no runtime: playing an
    // authored scene mid-game needs a stage builder that does not assume the
    // opening's cast, which `buildOpeningStage` currently does. Reported rather
    // than offered, so the gap is visible instead of being a dead prompt.
    console.warn(
      `[fixtures] "${object.type}" asks for interact ${interact.verb}, `
      + 'which has no runtime yet',
    );
  }
  return actions;
}
