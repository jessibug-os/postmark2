import type { Game } from '../Game';
import { PALETTE_CSS, PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { NPC } from '../../characters/NPC';
import { item } from '../../data/items';
import { baseTool } from '../../data/crafting';
import { el } from '../../ui/kit';
import { heightAt } from '../../world/TownMap';
import { buildArchiveInterior, buildCottageInterior, buildEmporiumInterior, buildPlayerHouseInterior, Interior, setEmporiumStock } from '../../world/Interior';

export function updateInteractions(this: Game): void {
    if (this.currentInterior) {
      this.updateInteriorInteractions();
      return;
    }
    if (this.furniture.placing) {
      this.showPrompt('Placing — E place · R rotate · Esc cancel');
      if (this.input.wasPressed('KeyR')) this.furniture.rotateGhost();
      if (this.input.wasPressed('KeyE')) {
        if (this.furniture.confirmPlacement()) this.checkTownLivesProgress();
      }
      return;
    }

    const pos = this.player.position;
    if(this.diving.swimming){
      this.showPrompt(this.diving.diving?'Diving…':'Swim · chase a shadow · [E] dive · [V] return');
      if(this.input.wasPressed('KeyE')) {
        if(this.diving.action(pos)) {
          audio.sfx('splash');
          this.burst(pos, [PALETTE_HEX.hd8f4f2, PALETTE_HEX.h93d8df, PALETTE_HEX.hffffff], 12, {
            speed: 0.8, up: 1.7, life: 0.65, size: 0.045,
          });
        } else bus.emit('toast',{text:'No bubbles close enough. Follow a moving shadow.'});
      }
      return;
    }
    const actions: Array<{ text: string; key: string; run: () => void }> = [];
    // Placed objects first: while seated the only offer is standing up, and a
    // player who cannot stand because a villager wandered past is stuck.
    actions.push(...this.fixtureActions());
    const nearbyFurniture = this.furniture.nearest(pos);
    if (nearbyFurniture) {
      actions.push({
        text: `[E] Put away ${item(nearbyFurniture.itemId).name}`,
        key: 'KeyE',
        run: () => this.furniture.pickup(nearbyFurniture),
      });
    }

    let nearestNpc: NPC | null = null;
    let npcDist = 3.2 * 3.2;
    for (const npc of this.npcs.values()) {
      if (npc.hiddenInside) continue; // away at their indoor post
      const d = npc.position.distanceToSquared(pos);
      if (d < npcDist) {
        npcDist = d;
        nearestNpc = npc;
      }
    }
    // Carrying a dead letter → deliver it at its target (villager or spot).
    if (this.mail.carrying) {
      const l = this.mail.letter(this.mail.carrying)!;
      const tp = this.letterTargetPos(l);
      if (tp && (pos.x - tp.x) ** 2 + (pos.z - tp.z) ** 2 < 3.4 * 3.4) {
        actions.push({
          text: `[E] Deliver "${l.address}"`,
          key: 'KeyE',
          run: () => this.deliverLetter(),
        });
      }
    }

    if (nearestNpc) {
      const npcRef = nearestNpc;
      const label = npcRef.state === 'dormant' ? 'Examine' : 'Talk to';
      actions.push({
        text: `[E] ${label} ${npcRef.displayName}`,
        key: 'KeyE',
        run: () => this.talkTo(npcRef),
      });
    }

    // Doors: standing by a built building's door steps you inside.
    let atDoor = false;
    for (const doorId of ['emporium', 'archive', 'house-marigold', 'house-buoy', 'house-player']) {
      const door = this.map.doorWorld(doorId);
      if (!door) continue;
      if ((pos.x - door.x) ** 2 + (pos.z - door.z) ** 2 < 1.7 * 1.7) {
        const label = doorId === 'house-player' ? 'Go home' : 'Go inside';
        // Doors outrank villager chatter inside their tight radius.
        actions.unshift({ text: `[E] ${label}`, key: 'KeyE', run: () => this.enterInterior(doorId) });
        atDoor = true;
        break;
      }
    }

    if (!nearestNpc && !atDoor) {
      const archive = this.map.plots.get('archive');
      if (archive?.built && (pos.x - archive.x) ** 2 + (pos.z - archive.z) ** 2 < 16) {
        actions.push({
          text: '[E] Read the Archive ledger',
          key: 'KeyE',
          run: () => this.museumUI.open(this.museumDonations),
        });
      }
    }

    for (const [plotId, plot] of this.map.plots) {
      if (plot.built) continue;
      if ((pos.x - plot.x) ** 2 + (pos.z - plot.z) ** 2 > 20) continue;
      const req = this.plotRequirement(plotId);
      if (!req) {
        if (!actions.length) this.showPrompt(`🏗 ${plot.label} — not yet planned`);
        continue;
      }
      actions.push({
        text: `[E] Build ${plot.label} (${req.text})`,
        key: 'KeyE',
        run: () => this.tryBuild(plotId),
      });
    }

    const shakeTree = this.map.nearestFeature(pos, ['tree-live'], 2.2);
    if (shakeTree && shakeTree.fruitReady && !nearestNpc) {
      actions.push({
        text: '[E] Shake the tree',
        key: 'KeyE',
        run: () => this.shakeTree(shakeTree),
      });
    }
    const flower = this.map.nearestFeature(pos, ['flower'], 1.8);
    if (flower && !nearestNpc) {
      actions.push({
        text: `[E] Gather ${item(flower.itemId!).name}`,
        key: 'KeyE',
        run: () => this.pickFlower(flower),
      });
    }

    // Tool actions share the one interact button. They are appended last, so
    // any interaction above (talk, deliver, enter) wins when both are in
    // range — the Animal Crossing rule: face someone and A talks; otherwise A
    // uses whatever is in your hands.
    const tool = baseTool(this.player.equippedTool ?? '');
    if (tool === 'tool-rod') {
      if (this.fishing.isCasting) {
        actions.push({ text: 'Strike!', key: 'KeyE', run: () => this.useTool() });
      } else if (this.fishing.canCastFrom(pos)) {
        actions.push({ text: 'Cast line', key: 'KeyE', run: () => this.useTool() });
      }
    } else if (tool === 'tool-net') {
      actions.push({ text: 'Swing net', key: 'KeyE', run: () => this.useTool() });
    } else if (tool === 'tool-shovel') {
      const spot = this.map.nearestFeature(pos, ['digspot'], 2.0);
      if (spot) actions.push({ text: 'Dig', key: 'KeyE', run: () => this.useTool() });
    } else if (tool === 'tool-axe') {
      const dead = this.map.nearestFeature(pos, ['tree-dead'], 2.2);
      if (dead) actions.push({ text: 'Chop', key: 'KeyE', run: () => this.useTool() });
    }

    this.runPrimaryAction(actions);
  }

export function runPrimaryAction(this: Game, actions: Array<{ text: string; key: string; run: () => void }>): void {
    if (!actions.length) {
      this.prompt.style.display = 'none';
      return;
    }
    const primary = actions[0];
    this.showPrompt(primary.text.replace(/^\[\w+\]\s*/, ''));
    if (this.input.wasPressed('KeyE')) primary.run();
  }

export function getInterior(this: Game, id: string): Interior {
    let room = this.interiors.get(id);
    if (room) return room;
    const indices: Record<string, number> = {
      emporium: 0, archive: 1, 'house-marigold': 2, 'house-buoy': 3, 'house-player': 4,
    };
    const index = indices[id] ?? 5;
    if (id === 'emporium') room = buildEmporiumInterior(index);
    else if (id === 'archive') room = buildArchiveInterior(index);
    else if (id === 'house-marigold') room = buildCottageInterior('marigold', index);
    else if (id === 'house-buoy') room = buildCottageInterior('buoy', index);
    else room = buildPlayerHouseInterior(index, this.houseTier, this.housePaper, this.houseFloor);
    this.interiors.set(id, room);
    this.scene.add(room.group);
    return room;
  }

export function doorFade(this: Game, mid: () => void): void {
    if (this.doorBusy) return;
    this.doorBusy = true;
    if (!this.doorFadeEl) {
      this.doorFadeEl = el('div', 'pm-fade');
      this.doorFadeEl.style.opacity = '0';
      this.doorFadeEl.style.transition = 'opacity 0.35s ease';
      this.renderer.domElement.parentElement!.appendChild(this.doorFadeEl);
    }
    const fade = this.doorFadeEl;
    fade.style.opacity = '1';
    setTimeout(() => {
      mid();
      fade.style.opacity = '0';
      setTimeout(() => {
        this.doorBusy = false;
      }, 380);
    }, 380);
  }

export function enterInterior(this: Game, id: string): void {
    const room = this.getInterior(id);
    if (id === 'emporium') {
      setEmporiumStock(room, this.shopUI.todayStock(this.ownedTools(), this.shopTier()));
    }
    audio.sfx('confirm');
    this.doorFade(() => {
      this.interiorReturn.copy(this.player.position);
      this.currentInterior = room;
      this.weather.setVisible(false);
      // Rooms sit in a dark void, not under the open sky.
      const fog = this.scene.fog as THREE.Fog;
      this.outdoorFog = { near: fog.near, far: fog.far };
      fog.near = 18;
      fog.far = 42;
      this.player.interior = { floorY: room.floorY, collide: (p) => room.collide(p) };
      this.player.position.copy(room.toWorld(room.spawn));
      this.player.object.rotation.y = Math.PI; // walk in facing north
      this.rig.snapTo(this.player.position);
      // Re-arm indoor furniture colliders (from a save) and placement mode.
      if (id === 'house-player') {
        this.furniture.indoor = {
          floorY: room.floorY,
          addCollider: (x, z, r) => room.addCollider(x - room.origin.x, z - room.origin.z, r),
          clamp: (p) => room.collide(p),
        };
        this.furniture.rearmIndoorColliders();
      }
      // Station the occupant inside.
      const occupants: Record<string, string> = {
        emporium: 'reggie', archive: 'cataloger-734',
        'house-marigold': 'marigold', 'house-buoy': 'buoy',
      };
      const npc = occupants[id] ? this.npcs.get(occupants[id]) : undefined;
      if (npc && npc.state !== 'dormant' && room.occupantSpot) {
        this.stationedNpc = npc;
        this.stationedReturn.copy(npc.position);
        const spot = room.toWorld(room.occupantSpot);
        spot.y = room.floorY;
        npc.stationedAt = spot;
        npc.face(this.player.position);
      }
    });
  }

export function clearInteriorState(this: Game): void {
    this.concertTrack = null;
    this.currentInterior = null;
    this.player.interior = null;
    this.furniture.indoor = null;
    this.furniture.cancelPlacement();
    this.weather.setVisible(true);
    if (this.outdoorFog) {
      const fog = this.scene.fog as THREE.Fog;
      fog.near = this.outdoorFog.near;
      fog.far = this.outdoorFog.far;
      this.outdoorFog = null;
    }
    if (this.stationedNpc) {
      this.stationedNpc.stationedAt = null;
      this.stationedNpc.position.copy(this.stationedReturn);
      this.stationedNpc = null;
    }
  }

export function exitInterior(this: Game): void {
    audio.sfx('confirm');
    this.doorFade(() => {
      this.clearInteriorState();
      this.player.position.copy(this.interiorReturn);
      this.player.position.y = heightAt(this.interiorReturn.x, this.interiorReturn.z);
      this.player.object.rotation.y = Math.PI; // face south, away from the door
      this.rig.snapTo(this.player.position);
    });
  }

export function rebuildPlayerHouse(this: Game): void {
    const old = this.interiors.get('house-player');
    if (old) this.scene.remove(old.group);
    this.interiors.delete('house-player');
    const room = this.getInterior('house-player');
    if (this.currentInterior && this.currentInterior.id === 'house-player') {
      this.currentInterior = room;
      this.player.interior = { floorY: room.floorY, collide: (p) => room.collide(p) };
      this.furniture.indoor = {
        floorY: room.floorY,
        addCollider: (x, z, r) => room.addCollider(x - room.origin.x, z - room.origin.z, r),
        clamp: (p) => room.collide(p),
      };
        this.furniture.rearmIndoorColliders();
      room.collide(this.player.position);
    }
  }

export function updateInteriorInteractions(this: Game): void {
    const room = this.currentInterior!;
    const pos = this.player.position;

    // Auto-exit when stepping into the doorway.
    if (room.atDoor(pos) && !this.doorBusy) {
      this.exitInterior();
      return;
    }

    if (this.furniture.placing) {
      this.showPrompt('[E] Set down   ·   [R] Rotate   ·   [Esc] Cancel');
      if (this.input.wasPressed('KeyR')) this.furniture.rotateGhost();
      if (this.input.wasPressed('KeyE')) this.furniture.confirmPlacement();
      return;
    }

    const actions: Array<{ text: string; key: string; run: () => void }> = [];
    // Placed objects first: while seated the only offer is standing up, and a
    // player who cannot stand because a villager wandered past is stuck.
    actions.push(...this.fixtureActions());
    const nearbyFurniture = this.furniture.nearest(pos);
    if (nearbyFurniture) {
      actions.push({
        text: `[E] Put away ${item(nearbyFurniture.itemId).name}`,
        key: 'KeyE',
        run: () => this.furniture.pickup(nearbyFurniture),
      });
    }
    // Hotspots are tight fixtures you are physically standing at; the occupant's
    // conversation radius is broad enough to swallow every one of them (REGGIE
    // stands two paces behind his own sell counter). Whatever is under the
    // player's hand therefore outranks the chat, and stepping off the fixture
    // hands the [E] back to the shopkeeper.
    const spotActions: Array<{ text: string; key: string; run: () => void }> = [];
    for (const spot of room.hotspots) {
      const world = room.toWorld(new THREE.Vector3(spot.x, 0, spot.z));
      if ((pos.x - world.x) ** 2 + (pos.z - world.z) ** 2 > spot.radius * spot.radius) continue;
      if (spot.action === 'shop') {
        spotActions.push({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.shopUI.open(this.ownedTools(), this.shopTier()) });
      } else if (spot.action === 'shop-sell') {
        spotActions.push({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.shopUI.openSell(this.ownedTools(), this.shopTier()) });
      } else if (spot.action.startsWith('shop-item:')) {
        const itemId = spot.action.slice('shop-item:'.length);
        spotActions.unshift({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.browseShopItem(itemId) });
      } else if (spot.action === 'museum') {
        spotActions.push({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.museumUI.open(this.museumDonations) });
      } else if (spot.action === 'renovate') {
        spotActions.push({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.openRenovationLedger() });
      } else if (spot.action === 'craft') {
        spotActions.push({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.openWorkbench() });
      } else if (spot.action === 'concert') {
        spotActions.push({ text: `[E] ${spot.label}`, key: 'KeyE', run: () => this.openConcertPlayer() });
      }
    }
    actions.push(...spotActions);
    if (this.stationedNpc) {
      const npc = this.stationedNpc;
      if (npc.position.distanceToSquared(pos) < 3.4 * 3.4) {
        actions.push({
          text: `[E] Talk to ${npc.displayName}`,
          key: 'KeyE',
          run: () => this.talkTo(npc),
        });
      }
    }

    this.runPrimaryAction(actions);
  }

export function showPrompt(this: Game, text: string): void {
    // Leading [K] tokens become wax-seal key badges.
    this.prompt.textContent = '';
    text.split('   ·   ').forEach((part, i) => {
      if (i > 0) {
        const dot = el('span', '', ' · ');
        dot.style.color = PALETTE_CSS.h9a7f4e;
        this.prompt.appendChild(dot);
      }
      const m = /^\[(\w+)\]\s*(.*)$/.exec(part);
      if (m) {
        const seal = el('span', 'pm-seal', m[1]);
        this.prompt.appendChild(seal);
        this.prompt.appendChild(el('span', '', m[2]));
      } else {
        this.prompt.appendChild(el('span', '', part));
      }
    });
    this.prompt.style.display = 'block';
  }
