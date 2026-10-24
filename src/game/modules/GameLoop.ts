import { updateCoastalOcean } from '../../world/water/CoastalOcean';
import type { Game } from '../Game';
import { PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { wetnessField } from '../../world/weather/WetnessState';
import { audio, type ThemeName } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { tickRetroTime } from '../../core/RetroMaterial';
import { assets } from '../../core/AssetLoader';
import { NPC } from '../../characters/NPC';
import { RESIDENT_EQUIPMENT_DEFAULTS } from '../../characters/equipment';
import { ACTIVE_CAST, ACTIVE_INDOOR_RESIDENCES, ACTIVE_OPENING_NPC } from '../../content/activePack';
import * as D from '../../data/dialogue';
import { item } from '../../data/items';
import { type ToolId } from '../../player/Player';
import { TOOL_UPGRADES, baseTool } from '../../data/crafting';
import {
  deleteSave,
  loadSave,
  selectSaveSlot,
  type SaveSlotId,
} from '../../systems/SaveSystem';
import { heightAt, PLAZA, SPOTS } from '../../world/TownMap';
import { beginWaterFrame, nearestWater, waterKindAt, waterSurfaceAt } from '../../world/geography';
import { ACTIVE_FIELD } from '../../world/mapConstants';
import { TOOL_HOTKEYS } from '../Game';

const FIXED_STEP_SECONDS = 1 / 60;
// Avoid a suspended tab trying to simulate minutes of history on resume. This
// is a workload guard, not the simulation step: every update below still gets
// exactly FIXED_STEP_SECONDS.
const MAX_FRAME_SECONDS = 0.25;

export function configureLightingLayers(this: Game): void {
    this.rig.camera.layers.enable(1);
    this.rig.camera.layers.enable(2);
    // Terrain and authored/static forms receive directional grounding. Avoid
    // doubling the instanced scatter pass; its contact decals remain cheaper.
    this.map.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      if (!(object instanceof THREE.InstancedMesh)) object.castShadow = true;
    });
    for (const actor of [this.player.object, ...[...this.npcs.values()].map((npc) => npc.object)]) {
      actor.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.layers.enable(1);
        if (object.name === 'amber') object.layers.enable(2);
      });
    }
  }

export function applySchedules(this: Game): void {
    const context = {
      day: new Date().getDay(),
      plaza: { x: PLAZA.x, z: PLAZA.z },
      spots: SPOTS,
    };
    for (const member of ACTIVE_CAST.members) {
      const npc = this.npcs.get(member.id);
      if (!npc) continue;
      npc.schedule = member.schedule(context);
      if (npc.state === 'active' && !npc.stationedAt) npc.applySchedule(this.time.hour);
    }
  }

export function spawnNpcs(this: Game): void {
    const collider = (pos: THREE.Vector3, radius: number, previous?: THREE.Vector3): void =>
      this.map.collide(pos, radius, previous);
    const poiProvider = (pos: THREE.Vector3): import('../../characters/NPC').NpcPoi | null => {
      // Nearest pickable flower or placed bench within admiring distance.
      const flower = this.map.nearestFeature(pos, ['flower'], 8);
      const benches = this.furniture.placed.filter((f) => f.itemId === 'furn-bench');
      let bench: { x: number; z: number } | null = null;
      let benchDist = 8;
      for (const b of benches) {
        const d = Math.hypot(b.x - pos.x, b.z - pos.z);
        if (d < benchDist) {
          benchDist = d;
          bench = b;
        }
      }
      if (bench && (!flower || benchDist < Math.hypot(flower.x - pos.x, flower.z - pos.z))) {
        return {
          point: new THREE.Vector3(bench.x + 0.4, 0, bench.z + 0.9),
          linger: 6 + Math.random() * 5,
          kind: 'bench',
        };
      }
      if (flower) {
        return {
          point: new THREE.Vector3(flower.x + 0.5, 0, flower.z + 0.5),
          linger: 2.5 + Math.random() * 2,
          kind: 'flower',
        };
      }
      return null;
    };
    const add = (npc: NPC): NPC => {
      npc.poiProvider = poiProvider;
      npc.collider = collider;
      this.npcs.set(npc.id, npc);
      this.scene.add(npc.object);
      return npc;
    };
    for (const member of ACTIVE_CAST.members) {
      const npc = add(new NPC({
        ...member,
        model: member.model(),
        clips: member.clips?.(),
      }));
      // Candidate rigs expose explicit hand sockets. Until a candidate passes
      // the human visual gate, the older runtime GLB may still contain its
      // signature prop baked into the mesh; do not attach a duplicate there.
      const equipmentReady = Boolean(
        npc.object.getObjectByName('socket_hand_l')
        && npc.object.getObjectByName('socket_hand_r'),
      );
      if (equipmentReady) {
        for (const equipmentId of RESIDENT_EQUIPMENT_DEFAULTS[npc.id] ?? []) {
          npc.equipment.equip(equipmentId, assets.model(equipmentId));
        }
      }
    }
  }

export function registerSpeakers(this: Game): void {
    const speakerLooks = Object.fromEntries(
      ACTIVE_CAST.members.map((member) => [member.id, member.speakerLook]),
    );
    for (const npc of this.npcs.values()) {
      const look = speakerLooks[npc.id];
      if (!look) continue;
      let face: import('../../characters/FaceRig').FaceRig | null = null;
      npc.object.traverse((c) => {
        if (!face && c.userData.faceRig) face = c.userData.faceRig as import('../../characters/FaceRig').FaceRig;
      });
      this.dialogue.registerSpeaker(npc.displayName, {
        color: look[0],
        face: face ? (face as import('../../characters/FaceRig').FaceRig).idleCanvas : undefined,
        portraitBg: look[1],
      });
    }
  }

export function startNewGame(this: Game, slot: SaveSlotId = this.saveSlot): void {
    this.saveSlot = slot;
    selectSaveSlot(slot);
    deleteSave(slot);
    this.state = 'intro';
    // The opening starts in authored ordinary daylight and does not stay there:
    // `kindly-opening.scene` runs the clock forward through the emptying ferry
    // and again under the veil, so the crossing arrives at dusk. This is only
    // the hour it *leaves* at — mid-afternoon, ordinary, the sun already
    // starting down — and it is set here rather than inherited so the sequence
    // does not begin at midnight or in a storm because of when New Game was
    // pressed.
    this.time.setLocalHour(15.4);
    this.weather.setWeather('clear');
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = 40;
      this.scene.fog.far = 150;
    }
    // The theme is the scene's now, not this function's: `kindly-opening.scene`
    // opens on an ordinary afternoon and turns the score twice on its way to
    // dusk. Setting one here would only be the thing the scene's first beat
    // immediately replaced.
    void this.intro.run(
      this.player, this.npcs.get(ACTIVE_OPENING_NPC)!, this.rig, this.time, this.npcs.values(),
      (name) => { this.sceneTheme = name; },
    ).then((name) => {
      this.playerName = name;
      this.createdAt = Date.now();
      this.inventory.addGears(100);
      this.refreshDigSpots();
      // Arrival is its own first-day ceremony. Do not cover the handoff and
      // Albert objective with an unrelated random resident request card.
      this.dailyLoop.day = new Date().toDateString();
      this.state = 'play';
      this.hud.setVisible(true);
      this.save(true);
      bus.emit('toast', { text: `Welcome to St. Mystere, ${name}.` });
    });
  }

export function startFromSave(this: Game, slot: SaveSlotId = this.saveSlot): void {
    this.saveSlot = slot;
    selectSaveSlot(slot);
    const data = loadSave(slot);
    if (!data) {
      this.startNewGame();
      return;
    }
    this.restore(data);
    this.state = 'play';
    this.hud.setVisible(true);
    void this.intro.fadeInOnly();
    bus.emit('toast', { text: `Welcome back, ${this.playerName}.` });
  }

export function start(this: Game): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

export function frame(this: Game): void {
    // The clamp keeps one stalled frame from teleporting the simulation, but
    // the time it discards is real: a hidden tab suspends the animation loop
    // entirely, and the in-game hour is the wall-clock hour, so the world comes
    // back to the right sky and the wrong ground. Hand the discarded remainder
    // to the fields that can absorb it cheaply. This covers every long gap —
    // a backgrounded tab, a slept laptop, a blocking dialog — not just one.
    const elapsedSeconds = this.clockThree.getDelta();
    const frameSeconds = Math.min(elapsedSeconds, MAX_FRAME_SECONDS);
    if (elapsedSeconds > frameSeconds) this.weather.queueOffscreen(elapsedSeconds - frameSeconds);
    tickRetroTime(this.clockThree.elapsedTime);
    this.input.pollGamepad();
    this.simulationAccumulator += frameSeconds;

    while (this.simulationAccumulator >= FIXED_STEP_SECONDS) {
      this.fixedUpdate(FIXED_STEP_SECONDS);
      this.simulationAccumulator -= FIXED_STEP_SECONDS;
    }

    // Rendering remains tied to the display. Simulation may run zero, one, or
    // several fixed ticks before this single render.
    this.pipeline.render(this.scene, this.rig.camera);
    // A recorded take can only be sampled once the frame exists. Nothing but
    // scene-preview mode implements this, so the real game pays a null check.
    this.scenePreview?.afterRender?.();
  }

export function fixedUpdate(this: Game, dt: number): void {
    // Water queries memoise for the length of one tick. The clear belongs here,
    // above every consumer, so no system can be the one that forgot it.
    beginWaterFrame();
    this.time.update();
    this.dialogue.update(dt);
    this.intro.update(dt);
    this.updateParticles(dt);

    // The title diorama always shows the town in a flattering light. A staged
    // scene can also pull the world down toward dusk so its own key light and
    // props carry the frame.
    const daylight =
      (this.state === 'title' ? Math.max(this.time.daylight, 0.55) : this.time.daylight) *
      (1 - this.sceneDim);
    this.dayNight.setRain(this.weather.kind === 'rain' ? this.weather.intensity : 0);
    this.dayNight.update(daylight, this.state === 'title' ? 16 : this.time.hour);
    this.pipeline.setDaylight(daylight);
    if (this.currentInterior) {
      // Indoors: a warm dark void beyond the walls instead of open sky.
      (this.scene.background as THREE.Color).setHex(PALETTE_HEX.h241e18);
      (this.scene.fog as THREE.Fog).color.setHex(PALETTE_HEX.h241e18);
      this.pipeline.setDaylight(0.75); // rooms keep their warm grade
    }
    this.map.update(dt, this.time.hour, daylight);
    this.weather.updateMoisture(dt, daylight);
    // Every water surface, tinted once. This used to be four `multiplyScalar`
    // calls against a hand-kept list that had lost the waterfall's lip and cap
    // — the two materials whose whole job is to be invisible against the river.
    this.map.water.update(daylight, this.weather.wetness, dt);
    updateCoastalOcean(this.map.oceanMat, this.time.hour, daylight, this.weather.wetness);
    this.furniture.updateLights(daylight);
    if (!this.currentInterior) {
      this.ambience.update(dt, this.rig.followTarget, daylight);
      this.weather.update(dt, this.rig.followTarget, this.scene.fog as THREE.Fog);
    }

    // Water wash volume by proximity. One search covers river, pond and surf
    // alike now that none of them is at a known place on the map.
    const near = nearestWater(
      this.player.position.x,
      this.player.position.z,
      14,
    );
    const waterDist = near.dist;
    // What the nearest water is, and which way it lies. Both were missing: the
    // wash had one timbre for every body of water and no direction at all, so
    // a waterfall and a still pond at the same distance were the same sound in
    // both ears.
    audio.waterKind = Number.isFinite(waterDist) ? waterKindAt(near.x, near.z) : null;
    // A falls is water with a cascade acre under it. Asked of the water's own
    // position rather than the player's: you hear the falls from the bank.
    const nearAcre = Number.isFinite(waterDist)
      ? ACTIVE_FIELD?.acreAt(near.x, near.z) ?? null
      : null;
    audio.waterFalling = Boolean(nearAcre?.kind.includes('cascade'));
    if (Number.isFinite(waterDist) && waterDist > 0.01) {
      // Bearing in *camera* space, so the pan agrees with what is on screen
      // rather than with what is east. Taken from the camera's own right vector
      // — the rig owns the orientation and reading its matrix cannot disagree
      // with it, which a second copy of the azimuth would eventually do.
      const camera = this.rig.camera;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const dx = near.x - this.player.position.x;
      const dz = near.z - this.player.position.z;
      const span = Math.hypot(dx, dz) || 1;
      // 0.8 rather than 1: hard-panned ambience reads as a bug in headphones.
      audio.waterBearing = Math.max(-1, Math.min(1,
        ((right.x * dx + right.z * dz) / span) * 0.8));
    } else {
      audio.waterBearing = 0;
    }
    // Weather ambience: rain/snow hiss, muted indoors.
    audio.weatherAmbience = this.currentInterior
      ? 0
      : (this.weather.kind === 'rain' ? this.weather.intensity : this.weather.kind === 'snow' ? this.weather.intensity * 0.3 : 0);
    audio.weatherSurface = this.weather.listenerSurface;
    audio.weatherCanopy = THREE.MathUtils.clamp(this.weather.canopyActivity, 0, 1);
    audio.weatherGust = this.weather.wind.length() / 1.8;
    audio.updateAmbience(
      dt,
      daylight,
      THREE.MathUtils.clamp(1 - waterDist / 10, 0, 1),
      this.currentInterior !== null,
    );

    if (this.scenePreview) {
      // Preview mode: the scene owns the camera and the stage, and the world
      // still ticks around it so lighting, weather and water are the real ones.
      //
      // The rig is deliberately *not* stepped here. A held scrub must hold, and
      // a camera tween advanced by the frame clock rather than the scene clock
      // would creep to its destination under a parked playhead. `ScenePreview`
      // steps the rig itself, on the scene's clock — see its `update`.
      this.scenePreview.update(dt);
      for (const npc of this.npcs.values()) npc.update(dt, this.time.isNight, true);
    } else if (this.state === 'title' && this.title) {
      // Living diorama: slow flyover of the town while villagers potter about.
      this.titleSpin += dt * 0.045;
      const path = new THREE.Vector3(
        -2 + Math.sin(this.titleSpin) * 12,
        0,
        6 + Math.cos(this.titleSpin * 0.6) * 9,
      );
      path.y = heightAt(path.x, path.z);
      // Everything below is a camera the player is not driving, so the idle
      // drift stays off: it is an answer to *the player* standing still.
      this.rig.idleDrift = false;
      this.rig.update(path, dt);
      for (const npc of this.npcs.values()) npc.update(dt, this.time.isNight, false);
      this.updateNpcSocial(dt);
      this.title.update(this.input, dt);
    } else if (this.state === 'intro') {
      if (this.dialogue.isOpen && this.pressedConfirm()) this.dialogue.advance();
      // The opening puts real choices now, and a choice you cannot move the
      // cursor on is not one. This branch wired confirm and nothing else, so
      // every `choice` cue would have resolved to its first option no matter
      // what the player pressed — the same two lines `updatePlay` has always
      // had, which is where the omission hid.
      if (this.dialogue.isOpen) {
        if (this.input.wasPressed('ArrowDown') || this.input.wasPressed('KeyS')) {
          this.dialogue.moveChoice(1);
        }
        if (this.input.wasPressed('ArrowUp') || this.input.wasPressed('KeyW')) {
          this.dialogue.moveChoice(-1);
        }
      }
      // The opening hands control back for the dock walk. Following the voice
      // inland is meant to be the player's first meaningful decision, so for
      // that stretch the intro state drives the character from real input
      // instead of tweening it. Every other beat leaves this false and the
      // player stays where the script puts them.
      if (this.intro.playerControlled && !this.dialogue.isOpen) {
        this.player.update(this.input, dt);
      }
      this.rig.idleDrift = false;
      this.rig.update(this.player.position, dt);
      for (const npc of this.npcs.values()) npc.update(dt, this.time.isNight, true);
    } else if (this.state === 'play') {
      this.updatePlay(dt);
    }

    this.input.clearFrame();
    // Bubbles track heads in screen space, so they update after the camera
    // has settled for this frame but before the scene is drawn.
    this.fx.update(dt);
    this.bubbles.update(dt, this.rig.camera);
    this.subjectProtection.update(dt);
  }

export function pressedConfirm(this: Game): boolean {
    return (
      this.input.wasPressed('KeyE') ||
      this.input.wasPressed('Enter') ||
      this.input.wasPressed('Space')
    );
  }

export function currentTheme(this: Game): ThemeName {
    // A staged scene owns the score for as long as it runs. This has to be an
    // override rather than a `setTheme` call at the scene's start, because
    // `updatePlay` re-asserts the theme every frame and would take it straight
    // back on the next one.
    if (this.sceneTheme) return this.sceneTheme;
    if (this.shopUI.isOpen) return 'shop';
    if (Date.now() < this.ceremonyUntil) return 'ceremony';
    if (this.currentInterior?.id === 'house-player' && this.concertTrack !== null) return `concert-${this.concertTrack}`;
    const hour = Math.floor(this.time.hour);
    if (this.currentInterior) return `interior-${hour}-${this.season}`;
    return `hour-${hour}-${this.season}`;
  }

export function updatePlay(this: Game, dt: number): void {
    this.playedSeconds += dt;
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 45) {
      this.autosaveTimer = 0;
      this.save(true);
    }
    audio.setTheme(this.currentTheme());
    // Speech wins over the score while it is on screen.
    audio.setDucked(this.dialogue.isOpen);

    // Season rolls over when the real month changes; re-grade + re-roll.
    if (this.calendar.season !== this.season) this.applySeason();

    // HUD refresh.
    this.hud.setClock(this.time.clockText, this.time.phase);
    this.hud.setGears(this.inventory.gears);
    this.hud.setSeason(this.calendar.label, this.weather.kind);
    this.hud.setTool(this.player.equippedTool);

    // Release the talker when dialogue has closed.
    if (!this.dialogue.isOpen && this.currentTalker) {
      this.currentTalker.talking = false;
      this.currentTalker = null;
    }

    const playerPos = this.player.position;
    const npcFrozen = this.dialogue.isOpen || this.cutsceneHold;
    this.scheduleTimer -= dt;
    if (this.scheduleTimer <= 0 && !this.npcsPinned) {
      this.scheduleTimer = 4;
      this.applySchedules();
    }
    this.updateResidences();
    for (const npc of this.npcs.values()) {
      // Scene actors keep acting through the cutscene freeze.
      npc.update(dt, this.time.isNight, npcFrozen && npc !== this.sceneActor, playerPos);
    }
    if (!npcFrozen && !this.currentInterior) this.updateNpcSocial(dt);
    if (!this.currentInterior) {
      this.fishing.update(dt, this.rig.followTarget);
      this.fishing.updateLine(playerPos);
      this.bugs.update(
        dt,
        playerPos,
        this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'),
      );
      this.diving.update(dt,playerPos);
      this.player.swimming=this.diving.swimming;
      this.player.diving=this.diving.diving;
    }
    this.drops.update(dt, playerPos);
    this.furniture.updateGhost(playerPos, this.player.object.rotation.y);

    // The acre view is an outdoor overlay on the island's own ground; an
    // interior is a different scene and it has nothing to say there.
    this.acreView.group.visible = this.acreView.isVisible && !this.currentInterior;
    this.acreView.update(playerPos.x, playerPos.z);
    this.gridView.group.visible = this.gridView.isVisible && !this.currentInterior;
    this.gridView.update(playerPos.x, playerPos.z);

    // --- the dev console outranks every modal: it is how you get out of one.
    if (this.input.wasPressed('Backquote')) this.devConsole.toggle();
    if (this.devConsole.isOpen) return this.afterModal(dt);

    // --- modal UIs eat input first.
    if (this.pauseMenu.update(this.input)) return this.afterModal(dt);
    if (this.inventoryUI.update(this.input)) return this.afterModal(dt);
    if (this.shopUI.update(this.input)) return this.afterModal(dt);
    if (this.museumUI.update(this.input, this.museumDonations)) return this.afterModal(dt);
    if (this.ledgerUI.update(this.input)) return this.afterModal(dt);

    if (this.dialogue.isOpen) {
      if (this.pressedConfirm()) this.dialogue.advance();
      if (this.input.wasPressed('ArrowDown') || this.input.wasPressed('KeyS')) this.dialogue.moveChoice(1);
      if (this.input.wasPressed('ArrowUp') || this.input.wasPressed('KeyW')) this.dialogue.moveChoice(-1);
      this.emoteForLine();
      this.prompt.style.display = 'none';
      return this.afterModal(dt);
    }

    if (this.cutsceneHold) {
      this.prompt.style.display = 'none';
      this.rig.idleDrift = false;
      this.rig.update(playerPos, dt);
      return;
    }

    // --- open menus
    if (this.input.wasPressed('Escape')) {
      if (this.furniture.placing) this.furniture.cancelPlacement();
      else this.pauseMenu.open();
    }
    if (this.input.wasPressed('Tab')) this.inventoryUI.open();
    if (this.input.wasPressed('KeyL')) {
      this.ledgerUI.open(
        [...this.npcs.values()].map((n) => ({
          id: n.id,
          name: n.displayName,
          awake: n.state !== 'dormant',
        })),
        this.mail.truthFragments,
        [...this.achievements],
        this.discovered,
      );
    }

    // --- tool hotkeys (equip the best owned variant of each base tool)
    for (const [code, tool] of TOOL_HOTKEYS) {
      if (this.input.wasPressed(code)) {
        const upgrade = TOOL_UPGRADES[tool]?.to;
        const owned = upgrade && this.inventory.has(upgrade) ? upgrade : this.inventory.has(tool) ? tool : null;
        if (owned) {
          const alreadyOn = baseTool(this.player.equippedTool ?? '') === tool;
          this.player.equip(alreadyOn ? null : (owned as ToolId));
          audio.sfx('blip');
        } else {
          bus.emit('toast', { text: `No ${item(tool).name} yet.` });
        }
      }
    }

    // --- movement & world sim
    if(this.input.wasPressed('KeyV')){
      if(this.diving.toggle(this.player.position)){
        audio.sfx('dive');
        this.player.swimming=this.diving.swimming;
        this.player.diving=false;
        bus.emit('toast',{text:this.diving.swimming?'Swim out and chase a moving shadow. [E] dive · [V] shore':'Back on shore.',icon:'🫧'});
      } else bus.emit('toast',{text:this.diving.swimming?'Swim closer to shore first.':'Enter from the beach.'});
    }
    // Hold the rod out over the water while a cast is waiting/biting so the
    // wait reads as fishing (cleared automatically on reel/cancel → idle).
    this.player.setFishingHold(!this.currentInterior && this.fishing.isCasting);
    this.player.update(this.input, dt);
    if (this.player.stepped) {
      const p = this.player.position;
      const localWetness = this.currentInterior ? 0 : wetnessField.atWorld(p.x, p.z);
      audio.step(this.footSurface(), localWetness);
      // Standing *in* water outranks standing on wet ground. The shore ramp
      // made this reachable: before it, the sea began at a line the player
      // could not cross, so a footfall in water was not a case that happened.
      const surface = waterSurfaceAt(p.x, p.z);
      const depth = surface === null ? 0 : surface - heightAt(p.x, p.z);
      if (!this.currentInterior && depth > 0.02) {
        this.fx.waterStep(p.x, surface!, p.z, depth);
      } else if (!this.currentInterior && this.footSurface() !== 'wood') {
        // Dust only where there is loose ground to kick up.
        if (localWetness > 0.3) this.fx.wetFootstep(p.x, p.y, p.z, wetnessField.poolingAtWorld(p.x, p.z));
        else this.fx.footstep(p.x, p.y, p.z);
      }
    }
    this.rig.idleDrift = true;
    this.rig.update(playerPos, dt);

    // --- context interactions
    this.updateInteractions();

    // Daily dig spot refresh.
    const today = new Date().toDateString();
    if (new Date(this.lastDigRefresh).toDateString() !== today) this.refreshDigSpots();
    // A day-start card the first time the player is in the world on a new day:
    // the small ceremony that tells you a fresh day of the game has begun.
    if (this.dailyLoop.day !== today) {
      this.beginDailyLoop(today);
      this.showDayCard();
    }
    this.mailCheckTimer -= dt;
    if (this.mailCheckTimer <= 0) {
      this.mailCheckTimer = 3;
      this.checkFestival();
    }
    this.updateFestival(dt);
  }

export function updateResidences(this: Game): void {
    // Pinned villagers stay put and visible (test determinism), same as the
    // schedule system.
    if (this.npcsPinned) return;
    const residents = ACTIVE_INDOOR_RESIDENCES;
    for (const [id, plotId] of Object.entries(residents)) {
      const npc = this.npcs.get(id);
      if (!npc || npc.state === 'dormant') continue;
      const built = this.map.plots.get(plotId)?.built ?? false;
      const hide = built && !npc.stationedAt && !npc.hasBlockAt(this.time.hour);
      npc.hiddenInside = hide;
      npc.object.visible = !hide;
      if (hide) {
        // Park at the building so they emerge from the doorway when their next
        // outdoor block begins, rather than teleporting in from mid-map.
        const plot = this.map.plots.get(plotId)!;
        npc.object.position.set(plot.x, heightAt(plot.x, plot.z), plot.z);
      }
    }
  }

export function updateNpcSocial(this: Game, dt: number): void {
    const s = this.social;
    if (!s) {
      this.socialCooldown -= dt;
      if (this.socialCooldown > 0) return;
      // Find a pair of active, unoccupied villagers near each other.
      const candidates = [...this.npcs.values()].filter(
        (n) => n.state === 'active' && !n.talking && n !== this.currentTalker && !n.stationedAt && !n.hiddenInside,
      );
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i];
          const b = candidates[j];
          if (a.position.distanceToSquared(b.position) < 15 * 15) {
            const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
            const dir = b.position.clone().sub(a.position).normalize();
            a.command = mid.clone().addScaledVector(dir, -0.9);
            b.command = mid.clone().addScaledVector(dir, 0.9);
            this.social = {
              a, b, phase: 'approach', timer: 9, exchange: 0, line: 0,
              script: D.overheardFor(a.id, b.id, this.overheardCounter++),
            };
            this.socialCooldown = 26 + Math.random() * 30;
            return;
          }
        }
      }
      this.socialCooldown = 8;
      return;
    }
    // The player talking to a participant ends the huddle immediately.
    if (this.currentTalker === s.a || this.currentTalker === s.b || s.a.state !== 'active' || s.b.state !== 'active') {
      this.endSocial();
      return;
    }
    s.timer -= dt;
    if (s.phase === 'approach') {
      if ((s.a.commandReached && s.b.commandReached) || s.timer <= 0) {
        s.phase = 'chat';
        s.timer = 7.5;
        s.a.command = null;
        s.b.command = null;
        s.a.face(s.b.position);
        s.b.face(s.a.position);
        s.a.talking = true;
        s.b.talking = true;
      }
    } else {
      // Play the written exchange one line at a time, as overheard speech.
      // Villagers with nothing scripted together fall back to emote bubbles.
      s.exchange -= dt;
      if (s.exchange <= 0) {
        s.exchange = 2.6;
        const line = s.script?.[s.line];
        if (line) {
          const speaker = line[0] === s.a.id ? s.a : s.b;
          const listener = speaker === s.a ? s.b : s.a;
          this.bubbles.show(speaker.object, line[1], 2.5);
          speaker.face(listener.position);
          s.line++;
          if (s.line >= s.script!.length) s.timer = Math.min(s.timer, 1.6);
        } else {
          const speaker = Math.floor(s.timer / 1.4) % 2 === 0 ? s.a : s.b;
          const pool = ['music', 'happy', 'question', 'notice', 'idea', 'love'] as const;
          speaker.emote(pool[Math.floor(Math.random() * pool.length)], 1.2);
        }
      }
      if (s.timer <= 0) {
        s.a.cheer();
        s.b.cheer();
        this.endSocial();
      }
    }
  }

export function endSocial(this: Game): void {
    if (!this.social) return;
    for (const npc of [this.social.a, this.social.b]) {
      npc.command = null;
      if (npc !== this.currentTalker) npc.talking = false;
    }
    this.bubbles.clear();
    this.social = null;
  }

export function footSurface(this: Game): 'grass' | 'stone' | 'wood' {
    if (this.currentInterior) return 'wood';
    const p = this.player.position;
    if (this.map.onBridge(p.x, p.z)) return 'wood';
    // The jetty. `p.z > 14.5` used to stand in for "out past the beach",
    // which was true only of POSTMARK's one southern dock; the island's runs
    // seaward from whichever coast the anchor landed on, so measure distance to
    // the anchor instead of a line of constant z.
    if (Math.hypot(p.x - SPOTS.dock.x, p.z - SPOTS.dock.z) < 6.5) return 'wood';
    if (Math.hypot(p.x - PLAZA.x, p.z - PLAZA.z) < 7) return 'stone';
    return 'grass';
  }

export function afterModal(this: Game, dt: number): void {
    // A menu or an open dialogue box is standing still for a different reason —
    // hold the game's framing, and let it ease back if the drift had begun.
    this.rig.idleDrift = false;
    this.rig.update(this.player.position, dt);
  }

export function emoteForLine(this: Game): void {
    const line = this.dialogue.currentLineText;
    if (!this.currentTalker || line === this.lastLineText) return;
    this.lastLineText = line;
    if (Math.random() > 0.65) return; // don't emote every line
    if (line.includes('♪') || /KA-CHING|music|song|sing/i.test(line)) this.currentTalker.emote('music');
    else if (line.includes('?')) this.currentTalker.emote('question');
    else if (line.includes('!')) this.currentTalker.emote(Math.random() < 0.5 ? 'notice' : 'happy');
    else if (/dear|love|miss|home/i.test(line)) this.currentTalker.emote('love');
    else if (line.includes('...')) this.currentTalker.emote('sad');
  }
