import * as THREE from 'three';
import { audio } from '../core/AudioSystem';
import { bus } from '../core/events';
import { makeItemSprite } from '../characters/iconSprite';
import type { Inventory } from './Inventory';
import { heightAt } from '../world/terrain';

type Phase = 'pop' | 'rest' | 'fly';

interface Drop {
  itemId: string;
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  phase: Phase;
  restTime: number;
  bobBase: number;
}

const PICKUP_RANGE = 1.4;

/**
 * Show-don't-tell item flow: items pop out of trees/holes/water as little
 * icon sprites with an arc and bounce, rest on the ground bobbing, then fly
 * into the player's pockets when she comes near. Inventory changes happen at
 * the moment of collection — the world explains itself.
 */
export class ItemDrops {
  private drops: Drop[] = [];

  constructor(private scene: THREE.Scene, private inventory: Inventory) {}

  /** Pop an item out of the world at a position with a scatter arc. */
  spawn(itemId: string, x: number, y: number, z: number, scatter = 1): void {
    const sprite = makeItemSprite(itemId, 0.5);
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    const a = Math.random() * Math.PI * 2;
    this.drops.push({
      itemId,
      sprite,
      vel: new THREE.Vector3(
        Math.cos(a) * 1.4 * scatter,
        2.6 + Math.random() * 1.2,
        Math.sin(a) * 1.4 * scatter,
      ),
      phase: 'pop',
      restTime: 0,
      bobBase: 0,
    });
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const p = d.sprite.position;
      if (d.phase === 'pop') {
        d.vel.y -= 9 * dt;
        p.addScaledVector(d.vel, dt);
        const floor = heightAt(p.x, p.z) + 0.28;
        if (p.y <= floor && d.vel.y < 0) {
          if (Math.abs(d.vel.y) > 1.2) {
            d.vel.y = -d.vel.y * 0.45; // bounce
            d.vel.x *= 0.6;
            d.vel.z *= 0.6;
          } else {
            d.phase = 'rest';
            d.bobBase = floor;
            p.y = floor;
          }
        }
      } else if (d.phase === 'rest') {
        d.restTime += dt;
        p.y = d.bobBase + Math.abs(Math.sin(d.restTime * 2.4)) * 0.06;
        const distSq = (p.x - playerPos.x) ** 2 + (p.z - playerPos.z) ** 2;
        // Don't vacuum instantly — let it land, then fly on approach.
        if (d.restTime > 0.25 && distSq < PICKUP_RANGE * PICKUP_RANGE * 4) {
          d.phase = 'fly';
        }
      } else {
        // Fly to the player's satchel.
        const target = new THREE.Vector3(playerPos.x, playerPos.y + 0.9, playerPos.z);
        const to = target.sub(p);
        const dist = to.length();
        if (dist < 0.25) {
          if (this.inventory.add(d.itemId)) {
            audio.sfx('pickup');
          } else {
            bus.emit('toast', { text: 'Pockets full!', icon: '🎒' });
            d.phase = 'rest';
            d.restTime = -3; // sulk on the ground a while before retrying
            continue;
          }
          this.scene.remove(d.sprite);
          this.drops.splice(i, 1);
          continue;
        }
        to.normalize();
        p.addScaledVector(to, Math.min(dist, (4 + (1.6 / Math.max(dist, 0.3)) * 4) * dt));
        d.sprite.scale.setScalar(Math.max(0.18, Math.min(0.5, dist * 0.5)));
      }
    }
  }
}
