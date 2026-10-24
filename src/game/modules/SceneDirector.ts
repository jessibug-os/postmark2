import type { Game } from '../Game';
import { PALETTE_CSS, PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { applyVertexSnap, makeRetroMaterial } from '../../core/RetroMaterial';
import { woodSheet } from '../../core/texturePaint';
import { NPC } from '../../characters/NPC';
import { item } from '../../data/items';
import { type SceneStep } from '../../data/heartScenes';
import { ACTIVE_HEART_SCENES as HEART_SCENES, ACTIVE_KEEPSAKES as KEEPSAKES } from '../../content/activePack';
import { el } from '../../ui/kit';
import { heightAt } from '../../world/TownMap';

export function burst(this: Game, pos: THREE.Vector3,
    colors: number[],
    count: number,
    opts: { speed: number; up: number; life: number; size: number; gravity?: number },): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(opts.size * (0.7 + Math.random() * 0.6), 4, 4),
        new THREE.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
        }),
      );
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(a) * opts.speed * r,
          opts.up * (0.5 + Math.random() * 0.7),
          Math.sin(a) * opts.speed * r,
        ),
        life: opts.life * (0.7 + Math.random() * 0.6),
        maxLife: opts.life,
        gravity: opts.gravity ?? 5,
      });
    }
  }

export function celebrateFireworks(this: Game): void {
    const colors = [PALETTE_HEX.hffb347, PALETTE_HEX.hd8453c, PALETTE_HEX.hbcd0e8, PALETTE_HEX.hc9a227, PALETTE_HEX.h8fd0a8];
    for (let burstI = 0; burstI < 8; burstI++) {
      setTimeout(() => {
        audio.sfx('catch');
        const cx = -8 + Math.random() * 14;
        const cz = 0 + Math.random() * 12;
        this.burst(
          new THREE.Vector3(cx, heightAt(cx, cz) + 7 + Math.random() * 3, cz),
          [colors[burstI % colors.length]],
          18,
          { speed: 4, up: 2.5, life: 1.6, size: 0.09, gravity: 4 },
        );
      }, burstI * 650);
    }
  }

export function updateParticles(this: Game, dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

export function setLetterbox(this: Game, on: boolean): void {
    if (!this.letterboxTop) {
      const mk = (edge: 'top' | 'bottom'): HTMLDivElement => {
        const bar = el('div');
        bar.style.cssText = `
          position:absolute; left:0; right:0; ${edge}:0; height:0;
          background:var(--pm-h0c0a08); z-index:18; pointer-events:none;
          transition: height 0.7s cubic-bezier(0.6, 0, 0.3, 1);
        `;
        this.renderer.domElement.parentElement!.appendChild(bar);
        return bar;
      };
      this.letterboxTop = mk('top');
      this.letterboxBottom = mk('bottom');
    }
    // Force reflow so the first transition plays.
    void this.letterboxTop.offsetHeight;
    this.letterboxTop.style.height = on ? '9%' : '0';
    this.letterboxBottom!.style.height = on ? '9%' : '0';
  }

export function sceneWait(this: Game, seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

export function sceneSay(this: Game, npc: NPC, name: string, lines: string[]): Promise<void> {
    return new Promise((resolve) => {
      this.currentTalker = npc;
      npc.talking = name !== '';
      this.lastLineText = '';
      this.dialogue.open(name, lines, {
        onDone: () => {
          npc.talking = false;
          resolve();
        },
      });
    });
  }

export async function playHeartScene(this: Game, npc: NPC, index: number): Promise<void> {
    const scene = HEART_SCENES[npc.id]?.[index];
    this.friendship.markSceneSeen(npc.id, index);
    if (!scene) return;
    this.cutsceneHold = true;
    this.sceneActor = npc;
    // Stage the scene on open ground. Villagers stand wherever their schedule
    // left them, which is often flat against a shopfront; playing there gives
    // the camera nowhere to stand and the whole scene reads as a wall.
    const open = this.currentInterior
      ? { x: npc.position.x, z: npc.position.z }
      : this.map.findOpenSpot(npc.position.x, npc.position.z);
    const origin = new THREE.Vector3(open.x, heightAt(open.x, open.z), open.z);
    this.setLetterbox(true);
    this.sceneTheme = 'scene-heart';
    audio.sfx('stinger');
    bus.emit('toast', { text: `♥ ${scene.title}`, icon: '♥' });
    await this.sceneWait(1.1);
    try {
      // Actors hit their marks: villager on the spot, player facing them a
      // pace away, both turned to each other before a word is spoken.
      if (!this.currentInterior) {
        npc.command = new THREE.Vector3(origin.x, 0, origin.z);
        const start = Date.now();
        while (!npc.commandReached && Date.now() - start < 3500) await this.sceneWait(0.1);
        npc.command = npc.position.clone();
        // If the villager could not make the mark — powered down for the day,
        // blocked, or simply too far — the scene comes to them instead. A
        // staged shot of empty grass is worse than a cramped one with both
        // actors in it.
        if (npc.position.distanceTo(origin) > 2.5) {
          origin.set(npc.position.x, npc.position.y, npc.position.z);
        }
        // The player stands beside the villager rather than in front of them,
        // so the line between the two actors runs across the camera and both
        // are seen in profile — a two-shot, not the back of two heads.
        await this.walkPlayerTo(new THREE.Vector3(origin.x - 1.9, 0, origin.z + 0.5));
      }
      // Establishing shot: open wide on the two of them, then creep in over
      // the first exchange. Every scene gets this, so no scene opens flat.
      npc.face(this.player.position);
      this.facePlayerAt(npc.position);
      // Frame the pair, not the villager: the look-at point sits between them.
      const stage = origin.clone().setY(origin.y + 1.3);
      stage.x -= 0.95;
      this.rig.moveTo(stage.clone(), { distance: 14, pitch: 40, azimuth: -10, seconds: 0.01 });
      await this.sceneWait(0.1);
      this.rig.moveTo(stage.clone(), { distance: 9.5, pitch: 34, azimuth: -4, seconds: 2.6 });

      let said = 0;
      for (const step of scene.steps) {
        await this.runSceneStep(step, npc, origin);
        // Between spoken beats, drift the camera a little. A locked-off camera
        // over a long conversation is the thing that made these read as
        // "dialogue with black bars" instead of a scene.
        if (step.t === 'say' || step.t === 'narrate') {
          said++;
          if (!this.rig.moving && said % 2 === 0) {
            // Small swings only. A cutscene camera that ducks below roof
            // height or swings behind a building fills the frame with wall,
            // so the drift stays high, wide and gentle.
            const swing = said % 4 === 0 ? 9 : -8;
            this.rig.moveTo(this.rig.followTarget.clone(), {
              distance: Math.max(7.6, 10 - said * 0.4),
              azimuth: THREE.MathUtils.clamp(this.rig.azimuth + swing, -18, 18),
              seconds: 3.4,
            });
          }
        }
      }
      // Closing pull-back: let the moment sit, then release.
      this.rig.moveTo(origin.clone().setY(origin.y + 1.2), {
        distance: 11, pitch: 36, azimuth: 0, seconds: 2.0,
      });
      await this.sceneWait(2.0);
    } finally {
      this.sceneTheme = null;
      this.clearSceneProps();
      // Final tier: the keepsake, and dialogue changed for good.
      if (index === 2) {
        const keepsakeId = KEEPSAKES[npc.id];
        const s = this.friendship.state(npc.id);
        if (keepsakeId && !s.keepsakeGiven) {
          s.keepsakeGiven = true;
          this.inventory.add(keepsakeId);
          audio.sfx('catch');
          bus.emit('toast', { text: `Keepsake received: ${item(keepsakeId).name}`, icon: item(keepsakeId).icon });
        }
      }
      this.setLetterbox(false);
      this.rig.clearFocus();
      npc.command = null;
      this.sceneActor = null;
      this.cutsceneHold = false;
      this.save(true);
    }
  }

export async function runSceneStep(this: Game, step: SceneStep, npc: NPC, origin: THREE.Vector3): Promise<void> {
    switch (step.t) {
      case 'focus':
        this.rig.focus(
          new THREE.Vector3(origin.x + step.dx, origin.y + 1, origin.z + step.dz),
          step.dist ?? 8,
        );
        await this.sceneWait(0.9);
        break;
      case 'focusNpc':
        this.rig.focus(npc.position.clone().add(new THREE.Vector3(0, 1.2, 0)), step.dist ?? 7);
        await this.sceneWait(0.9);
        break;
      case 'npcWalk': {
        const dest = new THREE.Vector3(origin.x + step.dx, 0, origin.z + step.dz);
        npc.command = dest;
        const start = Date.now();
        while (!npc.commandReached && Date.now() - start < 6000) await this.sceneWait(0.1);
        npc.command = npc.position.clone(); // hold position
        break;
      }
      case 'npcFace': {
        const p = npc.position;
        if (step.where === 'player') npc.face(this.player.position);
        else if (step.where === 'away') {
          npc.face(new THREE.Vector3(p.x * 2 - this.player.position.x, 0, p.z * 2 - this.player.position.z));
        } else {
          const dir = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }[step.where];
          npc.face(new THREE.Vector3(p.x + dir[0], 0, p.z + dir[1]));
        }
        await this.sceneWait(0.5);
        break;
      }
      case 'say':
        await this.sceneSay(npc, npc.displayName, step.lines);
        break;
      case 'narrate':
        await this.sceneSay(npc, '', step.lines);
        break;
      case 'emote':
        npc.emote(step.kind, 2);
        break;
      case 'mood':
        npc.mood(step.expr, step.secs ?? 2);
        break;
      case 'cheer':
        npc.cheer();
        break;
      case 'wait':
        await this.sceneWait(step.secs);
        break;
      case 'stinger':
        audio.sfx('stinger');
        break;

      // --- camera -----------------------------------------------------------
      case 'dolly': {
        const secs = this.rig.moveTo(
          new THREE.Vector3(origin.x + step.dx, origin.y + 1.2, origin.z + step.dz),
          { distance: step.dist, pitch: step.pitch, azimuth: step.azimuth, seconds: step.secs ?? 1.6 },
        );
        if (!step.under) await this.sceneWait(secs);
        break;
      }
      case 'orbit': {
        const secs = this.rig.moveTo(this.rig.followTarget.clone(), {
          azimuth: this.rig.azimuth + step.degrees,
          seconds: step.secs ?? 2.2,
        });
        if (!step.under) await this.sceneWait(secs);
        break;
      }
      case 'pushIn': {
        const secs = this.rig.moveTo(this.rig.followTarget.clone(), {
          distance: step.dist,
          seconds: step.secs ?? 2.0,
        });
        if (!step.under) await this.sceneWait(secs);
        break;
      }

      // --- blocking ---------------------------------------------------------
      case 'playerWalk': {
        const dest = new THREE.Vector3(origin.x + step.dx, 0, origin.z + step.dz);
        await this.walkPlayerTo(dest);
        break;
      }
      case 'playerFace': {
        const p = this.player.position;
        let look: THREE.Vector3;
        if (step.where === 'npc') look = npc.position.clone();
        else if (step.where === 'away') look = new THREE.Vector3(p.x * 2 - npc.position.x, 0, p.z * 2 - npc.position.z);
        else {
          const dir = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }[step.where];
          look = new THREE.Vector3(p.x + dir[0], 0, p.z + dir[1]);
        }
        this.facePlayerAt(look);
        await this.sceneWait(0.4);
        break;
      }
      case 'faceOff':
        npc.face(this.player.position);
        this.facePlayerAt(npc.position);
        await this.sceneWait(0.5);
        break;

      // --- staging ----------------------------------------------------------
      case 'prop':
        this.addSceneProp(
          step.kind,
          origin.x + step.dx,
          origin.z + step.dz,
          step.heldBy === 'npc' ? npc.object : step.heldBy === 'player' ? this.player.object : null,
        );
        await this.sceneWait(0.35);
        break;
      case 'light': {
        const light = new THREE.PointLight(step.color, step.intensity, 14, 2);
        light.position.set(origin.x + (step.dx ?? 0), origin.y + 2.4, origin.z + (step.dz ?? 0));
        this.scene.add(light);
        this.sceneProps.push(light);
        break;
      }
      case 'dim':
        this.sceneDim = step.amount;
        break;
      case 'music':
        if (step.cue === 'swell') audio.sfx('stinger');
        else if (step.cue === 'resolve') audio.sfx('catch');
        else audio.sfx('cancel');
        break;
    }
  }

export async function walkPlayerTo(this: Game, dest: THREE.Vector3): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const p = this.player.position;
      const dx = dest.x - p.x;
      const dz = dest.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) break;
      const step = Math.min(d, 2.6 * 0.05);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      p.y = heightAt(p.x, p.z);
      this.facePlayerAt(dest);
      await this.sceneWait(0.05);
    }
  }

export function facePlayerAt(this: Game, look: THREE.Vector3): void {
    const p = this.player.position;
    this.player.object.rotation.y = Math.atan2(look.x - p.x, look.z - p.z);
  }

export function addSceneProp(this: Game, kind: string, x: number, z: number, holder: THREE.Object3D | null = null): void {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    switch (kind) {
      case 'lantern': {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5), makeRetroMaterial({ color: PALETTE_HEX.h3c352c }));
        post.position.y = 0.55;
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.32, 0.26),
          applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffc470 })),
        );
        glass.position.y = 1.25;
        g.add(post, glass, new THREE.PointLight(PALETTE_HEX.hffb347, 3, 7, 2));
        break;
      }
      case 'letter': {
        const paper = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.025, 0.32),
          makeRetroMaterial({ color: PALETTE_HEX.he8dfc8 }),
        );
        paper.position.y = 0.04;
        paper.rotation.y = 0.3;
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), makeRetroMaterial({ color: PALETTE_HEX.ha8402f }));
        seal.position.set(0.06, 0.06, 0.02);
        g.add(paper, seal);
        break;
      }
      case 'flowers':
        for (let i = 0; i < 5; i++) {
          const bloom = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.1, 0),
            makeRetroMaterial({ color: [PALETTE_HEX.hd8b8c8, PALETTE_HEX.hc9a227, PALETTE_HEX.hbcd0e8, PALETTE_HEX.hc0553f, PALETTE_HEX.he8dfc8][i] }),
          );
          bloom.position.set((i - 2) * 0.18, 0.25 + (i % 2) * 0.08, (i % 3) * 0.12);
          g.add(bloom);
        }
        break;
      case 'crate': {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h8a7455) }));
        crate.position.y = 0.3;
        g.add(crate);
        break;
      }
      case 'ember': {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 7, 6),
          applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hff9a3c })),
        );
        glow.position.y = 0.2;
        g.add(glow, new THREE.PointLight(PALETTE_HEX.hff8a30, 2.4, 6, 2));
        break;
      }
      case 'petals':
        for (let i = 0; i < 14; i++) {
          const petal = new THREE.Mesh(
            new THREE.PlaneGeometry(0.11, 0.09),
            applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hf0cddc, side: THREE.DoubleSide })),
          );
          petal.position.set((Math.random() - 0.5) * 3, 0.4 + Math.random() * 2.4, (Math.random() - 0.5) * 3);
          petal.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          g.add(petal);
        }
        break;
    }
    const hand = holder?.getObjectByName('armR');
    if (hand) {
      // Every robot's right arm exposes the same shoulder-pivot convention;
      // several permanent tools (including SPARKS's clipboard) already use
      // this exact visible hand plane. Present the scene document over that
      // plane so it rides talk gestures and cannot disappear inside the torso.
      g.position.set(0.04, -0.43, 0.2);
      g.rotation.set(-0.48, 0.08, -0.03);
      g.scale.setScalar(1.35);
      hand.add(g);
    } else if (holder) {
      g.position.set(0, 0.9, 0.55);
      g.rotation.set(-0.3, 0.1, 0);
      holder.add(g);
    } else {
      g.position.set(x, y, z);
      this.scene.add(g);
    }
    this.sceneProps.push(g);
  }

export function clearSceneProps(this: Game): void {
    for (const p of this.sceneProps) p.removeFromParent();
    this.sceneProps = [];
    this.sceneDim = 0;
  }
