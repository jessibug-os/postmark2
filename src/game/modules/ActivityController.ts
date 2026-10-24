import type { Game } from '../Game';
import { PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { item } from '../../data/items';
import { type ToolId } from '../../player/Player';
import { ART_PAIRS } from '../../data/collections';
import { baseTool } from '../../data/crafting';
import { heightAt, type MapFeature } from '../../world/TownMap';
import { TOOL_HOTKEYS } from '../Game';

export function useTool(this: Game): void {
    const tool = baseTool(this.player.equippedTool ?? '');
    const pos = this.player.position;
    if (!tool || this.player.busy) return;
    this.fishing.fastBite = tool === 'tool-rod' && this.toolUpgraded;
    switch (tool) {
      case 'tool-rod': {
        if (this.fishing.isBiting) {
          audio.sfx('reel');
          this.player.playToolAnim('reel');
          this.fishing.action(pos);
        } else if (this.fishing.isCasting) {
          this.fishing.action(pos); // early reel-in
        } else if (this.fishing.canCastFrom(pos)) {
          audio.sfx('cast');
          this.player.playToolAnim('cast');
          setTimeout(() => this.fishing.action(pos), 340); // release moment (whip peak)
        }
        break;
      }
      case 'tool-net': {
        this.player.playToolAnim('swing');
        audio.sfx('net');
        setTimeout(() => this.bugs.swing(this.player.position), 280); // sweep midpoint
        break;
      }
      case 'tool-shovel': {
        const spot = this.map.nearestFeature(pos, ['digspot'], 2.0);
        if (!spot) {
          this.player.emote('question');
          return;
        }
        this.player.playToolAnim('dig');
        setTimeout(() => this.dig(spot), 460); // plunge impact
        break;
      }
      case 'tool-axe': {
        const dead = this.map.nearestFeature(pos, ['tree-dead'], 2.2);
        if (!dead) {
          this.player.emote('question');
          return;
        }
        this.player.playToolAnim('chop');
        setTimeout(() => this.chop(dead), 400); // strike impact
        break;
      }
    }
  }

export function landCatch(this: Game, itemId: string, pos: THREE.Vector3, isFish: boolean): void {
    const def = item(itemId);
    if (!this.inventory.add(itemId)) {
      bus.emit('toast', { text: 'Pockets full — it got away!', icon: def.icon });
      this.player.emote('sad');
      return;
    }
    this.discovered.add(itemId);
    this.recentAction = isFish ? 'fishing' : 'catching';
    if (isFish) {
      audio.sfx('splash');
      this.burst(pos, [PALETTE_HEX.hbcd8e8, PALETTE_HEX.hdfe8f0, PALETTE_HEX.h8fb8c8], 14, {
        speed: 1.6, up: 3, life: 0.7, size: 0.06,
      });
    }
    audio.sfx('catch');
    const isSea = def.category === 'sea';
    if (!isSea) this.player.celebrate(def.id);
    if (!isSea) {
      const p = this.player.position;
      this.fx.celebrate(p.x, p.y + 1.9, p.z);
    } else {
      this.burst(pos, [PALETTE_HEX.hd8f4f2, PALETTE_HEX.h93d8df, PALETTE_HEX.hffffff], 18, {
        speed: 1.15, up: 2.1, life: 0.85, size: 0.055,
      });
    }
    if (this.screenShake) this.rig.shake(isSea ? 0.045 : 0.1, isSea ? 0.14 : 0.22);
    this.hud.showCatchBanner(`I caught a ${def.name.toLowerCase()}!`, def.id);
    if (isFish) this.recordAchievement('first-fish', 'First Cast', 'Caught your first fish.');
    else if(def.category==='bug') this.recordAchievement('first-bug', 'Bug in the System', 'Caught your first bug.');
  }

export function dig(this: Game, spot: MapFeature): void {
    this.recentAction = 'digging';
    audio.sfx('dig');
    const y = heightAt(spot.x, spot.z);
    this.burst(new THREE.Vector3(spot.x, y + 0.3, spot.z), [PALETTE_HEX.h6e5a42, PALETTE_HEX.h54432f, PALETTE_HEX.h8a7455], 12, {
      speed: 1.3, up: 2.6, life: 0.7, size: 0.07,
    });
    this.map.consumeFeature(spot, Number.POSITIVE_INFINITY);
    spot.respawnAt = undefined;
    let itemId: string;
    if (this.quests.is('wake-the-shopkeeper', 0)) {
      itemId = 'amber-cell';
      this.quests.advance();
      this.player.emote('idea');
    } else {
      const needCells =
        this.quests.is('a-growing-town') && this.inventory.countOf('amber-cell') < 2;
      const roll = Math.random();
      const amberChance = needCells ? 0.4 : 0.08;
      if (roll < amberChance) itemId = 'amber-cell';
      else if (roll < amberChance + 0.34) itemId = 'stone';
      else if (roll < amberChance + 0.58) itemId = 'scrap-metal';
      else if (roll < amberChance + 0.72) {
        const relics = ['relic-teacup', 'relic-letter', 'relic-gearheart', 'relic-boot'];
        itemId = relics[Math.floor(Math.random() * relics.length)];
      } else if(roll < amberChance + 0.9) {
        itemId='fossil-unassessed';
      } else {
        const pair=ART_PAIRS[Math.floor(Math.random()*ART_PAIRS.length)];
        itemId=Math.random()<0.62?pair[0]:pair[1];
      }
    }
    this.drops.spawn(itemId, spot.x, y + 0.5, spot.z, 0.6);
    // Iron Shovel: a chance at a bonus find each dig.
    if (this.toolUpgraded && Math.random() < 0.4) {
      this.drops.spawn(Math.random() < 0.3 ? 'amber-cell' : 'scrap-metal', spot.x + 0.4, y + 0.5, spot.z, 0.6);
    }
  }

export function chop(this: Game, tree: MapFeature): void {
    this.recentAction = 'chopping';
    audio.sfx('chop');
    const y = heightAt(tree.x, tree.z);
    this.burst(new THREE.Vector3(tree.x, y + 1.4, tree.z), [PALETTE_HEX.hb09a6a, PALETTE_HEX.h8a7455], 7, {
      speed: 1.8, up: 1.4, life: 0.6, size: 0.06,
    });
    tree.chops = (tree.chops ?? 0) + 1;
    tree.object.rotation.z = 0.06 * (tree.chops % 2 === 0 ? 1 : -1);
    setTimeout(() => (tree.object.rotation.z = 0), 120);
    // Felling Axe: down in 2 swings instead of 3, and an extra timber.
    const swingsNeeded = this.toolUpgraded ? 2 : 3;
    if (tree.chops >= swingsNeeded) {
      this.map.consumeFeature(tree, 8 * 60 * 1000);
      this.burst(new THREE.Vector3(tree.x, y + 0.6, tree.z), [PALETTE_HEX.h8a7455, PALETTE_HEX.h6e6258], 16, {
        speed: 2, up: 2.4, life: 0.8, size: 0.08,
      });
      this.drops.spawn('timber', tree.x, y + 0.8, tree.z, 1.1);
      this.drops.spawn('timber', tree.x, y + 0.8, tree.z, 1.1);
      if (this.toolUpgraded) this.drops.spawn('timber', tree.x, y + 0.8, tree.z, 1.1);
    }
  }

export function shakeTree(this: Game, tree: MapFeature): void {
    this.player.playToolAnim('shake');
    audio.sfx('shake');
    // The canopy rustles...
    const obj = tree.object;
    const baseRot = obj.rotation.z;
    let rustleT = 0;
    const rustle = setInterval(() => {
      rustleT += 0.05;
      obj.rotation.z = baseRot + Math.sin(rustleT * 30) * 0.035;
      if (rustleT >= 0.5) {
        clearInterval(rustle);
        obj.rotation.z = baseRot;
      }
    }, 50);
    setTimeout(() => {
      const y = heightAt(tree.x, tree.z);
      this.drops.spawn('orchard-apple', tree.x, y + 2.4, tree.z, 1.3);
      this.drops.spawn('orchard-apple', tree.x, y + 2.4, tree.z, 1.3);
      if (Math.random() < 0.2) this.drops.spawn('bristle-pinecone', tree.x, y + 2.2, tree.z, 1.3);
      this.burst(new THREE.Vector3(tree.x, y + 2.6, tree.z), [PALETTE_HEX.h5a6b42, PALETTE_HEX.h46583a], 8, {
        speed: 1.2, up: 0.4, life: 0.9, size: 0.09, gravity: 3,
      });
    }, 420);
  }

export function pickFlower(this: Game, flower: MapFeature): void {
    audio.sfx('shake');
    const y = heightAt(flower.x, flower.z);
    this.map.consumeFeature(flower, 6 * 60 * 1000);
    this.drops.spawn(flower.itemId!, flower.x, y + 0.4, flower.z, 0.4);
    this.burst(new THREE.Vector3(flower.x, y + 0.5, flower.z), [PALETTE_HEX.hbcd0e8, PALETTE_HEX.h93a468], 6, {
      speed: 0.9, up: 1.4, life: 0.5, size: 0.05,
    });
  }

export function refreshDigSpots(this: Game): void {
    this.lastDigRefresh = Date.now();
    const candidates = this.map.features.filter((f) => f.kind === 'digspot');
    for (const c of candidates) {
      c.dead = true;
      c.object.visible = false;
    }
    const eligible = candidates.filter((c) => this.map.isUnlocked(c.zone));
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    for (const spot of shuffled.slice(0, 5)) {
      spot.dead = false;
      spot.object.visible = true;
    }
  }

export function ownedTools(this: Game): Set<string> {
    const owned = new Set<string>();
    for (const [, toolId] of TOOL_HOTKEYS) if (this.inventory.has(toolId)) owned.add(toolId);
    return owned;
  }

export function useInventorySlot(this: Game, index: number): void {
    const stack = this.inventory.slots[index];
    if (!stack) return;
    const def = item(stack.itemId);
    if (def.category === 'tool') {
      this.player.equip(stack.itemId as ToolId);
      audio.sfx('confirm');
      this.inventoryUI.close();
    } else if (def.category === 'clothing') {
      this.player.setCoatColor(def.clothingColor ?? PALETTE_HEX.h4a5a78);
      this.equippedCoat = stack.itemId;
      audio.sfx('confirm');
      this.player.emote('happy');
    } else if (def.category === 'furniture') {
      this.inventoryUI.close();
      this.furniture.beginPlacement(stack.itemId);
    } else {
      bus.emit('toast', { text: def.description, icon: def.icon });
    }
  }
