import * as THREE from 'three';
import type { Game } from '../Game';
import type { PlacedObject } from '../../world/TownMap';
import { componentsOf, type SeatComponent } from '../../world/objects/GameObjectFormat';
import { islandMarks } from '../../world/island/AcreFixtures';
import { SEA_LEVEL } from '../../world/island/IslandRuntime';
import { ACTIVE_FIELD, ACTIVE_LAYOUT, MAP } from '../../world/mapConstants';
import { heightAt } from '../../world/terrain';
import { inOcean } from '../../world/geography';
import { overDeck } from '../../world/decks';
import { float } from '../../world/water/Buoyancy';
import { stirWake } from '../../world/water/BoatWake';
import { PALETTE_HEX } from '../../art/palette';
import { audio } from '../../core/AudioSystem';

const DEG = Math.PI / 180;
const BOARD_REACH = 1.6;
const JUMP_REACH = 3;
const JUMP_SPEED = 1.2;
const HOP_IN = 0.5;
const HOP_OUT = 0.6;
const MAX_SPEED = 4.5;
const REVERSE_SPEED = 1.6;
const THRUST = 2.4;
const DRAG = 1.4;
const TURN_RATE = 1.7;
const DRAFT = 0.3;
const EDGE = 2;
const HULL: ReadonlyArray<readonly [number, number]> = [
  [0, 1.65], [0, -1.65], [0.62, 0], [-0.62, 0], [0.45, 1.05], [-0.45, 1.05], [0.55, -1.2], [-0.55, -1.2],
];
const IDLE = { level: 0.45, rate: 0.8 };
const WAKE = [PALETTE_HEX.hd8f4f2, PALETTE_HEX.hffffff];

interface Boat {
  placed: PlacedObject;
  seat: SeatComponent;
  boarding: THREE.Vector3;
  speed: number;
  motor: { level: number; rate: number };
}

let boat: Boat | null = null;
let aboard = false;

function findBoat(game: Game): Boat | null {
  if (boat && game.map.placedObjects.includes(boat.placed)) return boat;
  boat = null;
  const placed = game.map.placedObjects.find((object) => object.type === 'boat');
  const seat = placed && componentsOf(placed.definition, 'seat')[0];
  const island = ACTIVE_LAYOUT.acres;
  const boarding = island && islandMarks(island, heightAt).get('dock.boarding');
  if (!placed || !seat || !boarding) return null;
  float(placed.object, { length: 3.2, beam: 1.3 });
  boat = {
    placed, seat,
    boarding: boarding.position.clone(),
    speed: 0,
    motor: { level: 0, rate: 1 },
  };
  return boat;
}

function navigable(x: number, z: number): boolean {
  if (x < MAP.minX + EDGE || x > MAP.maxX - EDGE || z < MAP.minZ + EDGE || z > MAP.maxZ - EDGE) return false;
  if (overDeck(x, z) || !inOcean(x, z)) return false;
  return (ACTIVE_FIELD?.heightAt(x, z) ?? 0) < SEA_LEVEL - DRAFT;
}

function hullMisses(x: number, z: number, yaw: number): number {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return HULL.filter(([lx, lz]) => !navigable(x + lx * cos + lz * sin, z - lx * sin + lz * cos)).length;
}

function motorTo(b: Boat, level: number, rate: number, seconds: number): void {
  if (Math.abs(level - b.motor.level) < 0.02 && Math.abs(rate - b.motor.rate) < 0.02) return;
  b.motor = { level, rate };
  audio.bed('outboard', level, rate, seconds);
}

function seatPose(b: Boat): { position: THREE.Vector3; facing: number } {
  const object = b.placed.object;
  object.updateMatrixWorld();
  return {
    position: object.localToWorld(new THREE.Vector3(b.seat.at.x, b.seat.at.y, b.seat.at.z)),
    facing: object.rotation.y - b.seat.facing * DEG,
  };
}

export function boating(this: Game): boolean {
  if (aboard && !findBoat(this)) {
    aboard = false;
    audio.bed('outboard', 0, 1, 0.5);
    this.player.stand();
  }
  return aboard;
}

const cameraTarget = new THREE.Vector3();

export function boatCameraTarget(this: Game): THREE.Vector3 | null {
  if (!aboard || !boat) return null;
  const p = this.player.position;
  return cameraTarget.set(p.x, SEA_LEVEL + boat.seat.at.y, p.z);
}

export function boatReturn(this: Game): THREE.Vector3 | null {
  return aboard && boat ? boat.boarding : null;
}

export function boatActions(this: Game): Array<{ text: string; key: string; run: () => void }> {
  const b = findBoat(this);
  if (!b || this.player.inSeatTransition) return [];
  const seat = seatPose(b);
  const pos = this.player.position;
  if (!aboard) {
    if (Math.hypot(pos.x - b.boarding.x, pos.z - b.boarding.z) > BOARD_REACH) return [];
    if (Math.hypot(pos.x - seat.position.x, pos.z - seat.position.z) > JUMP_REACH + BOARD_REACH) return [];
    return [{
      text: '[E] Get in the boat',
      key: 'KeyE',
      run: () => {
        if (!this.player.sitAt(seat.position, seat.facing, 'seated_idle', 'sit_down', HOP_IN)) {
          this.showPrompt('They have no way to sit');
          return;
        }
        aboard = true;
        b.speed = 0;
        motorTo(b, IDLE.level, IDLE.rate, 1.2);
      },
    }];
  }
  const dx = b.boarding.x - seat.position.x;
  const dz = b.boarding.z - seat.position.z;
  if (Math.hypot(dx, dz) > JUMP_REACH || Math.abs(b.speed) > JUMP_SPEED) return [];
  return [{
    text: '[E] Get out',
    key: 'KeyE',
    run: () => {
      b.speed = 0;
      aboard = false;
      motorTo(b, 0, 0.6, 1.2);
      this.player.standFrom(b.boarding, Math.atan2(dx, dz), 'stand_up', HOP_OUT);
    },
  }];
}

export function updateBoat(this: Game, dt: number): void {
  const b = findBoat(this);
  if (!b || !aboard) return;
  const object = b.placed.object;

  if (this.player.inSeatTransition) return;

  const input = this.input;
  const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
    - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
  const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0)
    - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);

  const target = throttle > 0 ? MAX_SPEED : throttle < 0 ? -REVERSE_SPEED : 0;
  const rate = throttle !== 0 ? THRUST : DRAG;
  const step = rate * dt;
  b.speed += THREE.MathUtils.clamp(target - b.speed, -step, step);

  const { x, z } = object.position;
  const misses = hullMisses(x, z, object.rotation.y);
  const fits = (px: number, pz: number, yaw: number) => hullMisses(px, pz, yaw) <= misses;

  const grip = THREE.MathUtils.clamp(Math.abs(b.speed) / 1.5, 0.35, 1);
  const yaw = object.rotation.y + steer * TURN_RATE * grip * dt;
  if (fits(x, z, yaw)) object.rotation.y = yaw;

  const heading = object.rotation.y;
  const dx = Math.sin(heading) * b.speed * dt;
  const dz = Math.cos(heading) * b.speed * dt;
  if (fits(x + dx, z + dz, heading)) object.position.set(x + dx, object.position.y, z + dz);
  else if (fits(x + dx, z, heading)) object.position.x = x + dx;
  else if (fits(x, z + dz, heading)) object.position.z = z + dz;
  else b.speed = 0;

  const { position, facing } = seatPose(b);
  this.player.ride(position, facing);

  const pace = Math.abs(b.speed) / MAX_SPEED;
  motorTo(b, IDLE.level + 0.35 * pace + 0.2 * Math.abs(throttle), IDLE.rate + 0.85 * pace + 0.15 * Math.abs(throttle), 0.4);

  const dir = Math.sign(b.speed) || 1;
  const fx = Math.sin(heading) * dir;
  const fz = Math.cos(heading) * dir;
  stirWake(object.position.x + fx * 0.6, object.position.z + fz * 0.6, 0.15 + 0.85 * pace);
  if (pace > 0.55 && Math.random() < dt * 12) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const at = new THREE.Vector3(
      object.position.x + fx * 1.2 + fz * side * 0.5,
      SEA_LEVEL + 0.1,
      object.position.z + fz * 1.2 - fx * side * 0.5,
    );
    this.burst(at, WAKE, 2, { speed: 0.7, up: 0.9, life: 0.5, size: 0.045, gravity: 3 });
  }
}
