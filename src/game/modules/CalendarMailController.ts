import { Game } from '../Game';
import { PALETTE_CSS, PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { applyVertexSnap, makeRetroMaterial } from '../../core/RetroMaterial';
import { groundUniforms } from '../../world/terrain';
import { snowField } from '../../world/weather/SnowState';
import { NPC } from '../../characters/NPC';
import { ITEMS, item } from '../../data/items';
import { DialogueBox } from '../../interaction/DialogueBox';
import { type DeadLetter } from '../../data/letters';
import { type Season } from '../../systems/Calendar';
import { type LetterAvailability } from '../../systems/MailSystem';
import { el } from '../../ui/kit';
import { heightAt, PLAZA } from '../../world/TownMap';
import { FAVOR_WISHLISTS, DAILY_SURPRISES } from '../Game';

export function applySeason(this: Game): void {
    this.season = this.calendar.season;
    this.dayNight.season = this.season;
    this.map.season = this.season;
    // Water is a surface too. It was the only one that did not know the month.
    this.map.water.setSeason(this.season);
    const g = Game.SEASON_GRADE[this.season];
    this.pipeline.setSeasonGrade(g.tint, g.strength, g.sat);
    this.map.setSeasonTint(g.ground);
    // Local snowiness decides whether ground is covered. Keeping the material
    // strength live lets forced snow accumulate visibly in any debug season;
    // natural weather still only rolls snow during winter.
    groundUniforms.uSnow.value = 0.9;
    snowField.setWinter(this.season === 'winter');
    this.ambience.setSeason(this.season, g.ambient);
    // Weather rolls once per day, seeded by the date.
    const now = new Date();
    const daySeed = now.getFullYear() * 1000 + this.dayOfYear();
    this.weather.rollDaily(this.season, daySeed);
  }

export function dayOfYear(this: Game): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now.getTime() - start.getTime()) / 86400000);
  }

export function checkFestival(this: Game): void {
    const fest = this.calendar.festivalToday();
    const day = new Date().toDateString();
    if (fest && this.lastFestivalDay !== day && !this.festivalActive) {
      this.lastFestivalDay = day;
      this.startFestival();
    } else if (!fest && this.festivalActive) {
      this.endFestival();
    }
  }

export function startFestival(this: Game): void {
    const fest = this.calendar.festivalToday();
    if (!fest) return;
    this.festivalActive = true;
    this.festivalRewardGiven = false;
    bus.emit('toast', { text: `${fest.name} — today on the plaza!` });
    this.hud.showCatchBanner(fest.name);
    audio.setTheme('ceremony');
    this.ceremonyUntil = Date.now() + 60000;
    this.buildFestivalProps(fest.season);
    // Scatter gather tokens around the plaza — the mini-activity.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const r = 3 + Math.random() * 4;
      const x = PLAZA.x + Math.cos(a) * r;
      const z = PLAZA.z + Math.sin(a) * r;
      const tokenColors: Record<Season, number> = { spring: PALETTE_HEX.hf6a8c4, summer: PALETTE_HEX.hffd06a, autumn: PALETTE_HEX.hd87a3a, winter: PALETTE_HEX.hbcd8f0 };
      const token = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.24, 0),
        applyVertexSnap(new THREE.MeshBasicMaterial({ color: tokenColors[fest.season] })),
      );
      token.position.set(x, heightAt(x, z) + 0.8, z);
      this.scene.add(token);
      this.festivalTokens.push({ mesh: token, x, z });
    }
    bus.emit('toast', { text: `Gather the 6 festival tokens around the plaza!`, icon: '✨' });
  }

export function buildFestivalProps(this: Game, season: Season): void {
    const colors: Record<Season, number> = { spring: PALETTE_HEX.hf6c6d8, summer: PALETTE_HEX.h8ac0d8, autumn: PALETTE_HEX.hc87a3a, winter: PALETTE_HEX.hdfe8f0 };
    const c = colors[season];
    // A ring of lantern poles around the plaza.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = PLAZA.x + Math.cos(a) * 7;
      const z = PLAZA.z + Math.sin(a) * 7;
      const pole = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5), makeRetroMaterial({ color: PALETTE_HEX.h54432f }));
      post.position.y = 1.2;
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 6),
        applyVertexSnap(new THREE.MeshBasicMaterial({ color: c })),
      );
      lantern.position.y = 2.4;
      const glow = new THREE.PointLight(c, 2.2, 6, 2);
      glow.position.y = 2.4;
      pole.add(post, lantern, glow);
      pole.position.set(x, heightAt(x, z), z);
      this.scene.add(pole);
      this.festivalProps.push(pole);
    }
  }

export function endFestival(this: Game): void {
    this.festivalActive = false;
    for (const p of this.festivalProps) this.scene.remove(p);
    this.festivalProps = [];
    for (const t of this.festivalTokens) this.scene.remove(t.mesh);
    this.festivalTokens = [];
  }

export function updateFestival(this: Game, dt: number): void {
    if (!this.festivalActive) return;
    const t = performance.now() / 1000;
    const pos = this.player.position;
    for (let i = this.festivalTokens.length - 1; i >= 0; i--) {
      const tok = this.festivalTokens[i];
      tok.mesh.rotation.y += dt * 2;
      tok.mesh.position.y = heightAt(tok.x, tok.z) + 0.8 + Math.sin(t * 2 + i) * 0.15;
      if ((pos.x - tok.x) ** 2 + (pos.z - tok.z) ** 2 < 1.6 * 1.6) {
        this.scene.remove(tok.mesh);
        this.festivalTokens.splice(i, 1);
        audio.sfx('pickup');
        this.burst(tok.mesh.position, [PALETTE_HEX.hffd58a, PALETTE_HEX.hfff4dc], 8, { speed: 1, up: 1.4, life: 0.5, size: 0.05 });
        this.player.emote('happy');
      }
    }
    if (!this.festivalTokens.length && !this.festivalRewardGiven) {
      this.festivalRewardGiven = true;
      const fest = this.calendar.festivalToday();
      if (fest) {
        this.inventory.add(fest.reward);
        audio.sfx('catch');
        this.hud.showCatchBanner(`${fest.name} — complete!`);
        bus.emit('toast', { text: `Festival reward: ${item(fest.reward).name}!`, icon: item(fest.reward).icon });
        this.celebrateFireworks();
      }
      this.save(true);
    }
  }

export function totalHearts(this: Game): number {
    let sum = 0;
    for (const npc of this.npcs.values()) sum += this.friendship.hearts(npc.id);
    return sum;
  }

export function storyDone(this: Game): boolean {
    return this.quests.active === null;
  }

/**
 * Live residency and build state for the letter gate. W5 built the gate and
 * nothing populated it; every claim went through the empty default until W6.5.
 */
export function letterAvailability(this: Game): LetterAvailability {
    const residents = new Set<string>();
    for (const npc of this.npcs.values()) {
      if (npc.state !== 'dormant') residents.add(npc.id);
    }
    const buildings = new Set<string>();
    for (const [id, plot] of this.map.plots) {
      if (plot.built) buildings.add(id);
    }
    return { storyReady: true, residents, buildings };
  }

export function openMailSack(this: Game, npc: NPC): void {
    this.mail.configureAvailability(this.letterAvailability());
    if (this.mail.carrying) {
      const l = this.mail.letter(this.mail.carrying)!;
      this.startTalk(npc, [
        `You are still carrying a letter: "${l.address}". Deliver it first, Mayor.`,
        `The envelope reads — ${l.from}. Take it to ${this.letterTargetLabel(l)}.`,
      ]);
      return;
    }
    const pickable = this.mail.pickable(this.storyDone(), this.totalHearts());
    if (!pickable.length) {
      // Nothing unlocked yet, or waiting on the Act III heart gate.
      const act = this.mail.availableAct(this.storyDone(), this.totalHearts());
      if (act === 2 && this.mail.actLetters(2).every((l) => this.mail.isDelivered(l.id))) {
        this.startTalk(npc, [
          'The last letters in the sack are... heavier. I do not think the town is ready to read them yet.',
          'Grow the hearts of this town, Mayor. When the townsfolk truly know they are loved, the sack will open its final act. Not before. Some truths need a soft place to land.',
        ]);
      } else {
        this.startTalk(npc, ['The sack is quiet for now, Mayor. Deliver what you\'re carrying, and check back.']);
      }
      return;
    }
    const next = pickable[0];
    this.mail.carrying = next.id;
    this.save(true);
    this.startTalk(npc, [
      'The mail sack. Forty years I have kept it and never had a postmaster to hand it to. Now I do.',
      `Here — this one is addressed and ready. ${next.from}.`,
      `Deliver it to ${this.letterTargetLabel(next)}. Read it aloud when you get there. Some of these... I have never heard read aloud. I should like the town to hear them at last.`,
    ], {
      onDone: () => bus.emit('toast', { text: `Carrying: "${next.address}"` }),
    });
  }

export function letterTargetLabel(this: Game, l: DeadLetter): string {
    const npc = this.npcs.get(l.target);
    if (npc) return npc.displayName;
    return l.address;
  }

export function letterTargetPos(this: Game, l: DeadLetter): { x: number; z: number } | null {
    const npc = this.npcs.get(l.target);
    if (npc) return { x: npc.position.x, z: npc.position.z };
    return null;
  }

export async function deliverLetter(this: Game): Promise<void> {
    const id = this.mail.carrying;
    if (!id) return;
    const l = this.mail.letter(id)!;
    const speaker = this.npcs.get(l.target) ?? null;

    this.cutsceneHold = true;
    this.setLetterbox(true);
    audio.sfx('confirm');
    // Same staging as a heart scene: villagers stand wherever their schedule
    // left them, so play the moment on open ground or the camera ends up
    // inside a shopfront.
    const anchor = speaker ? speaker.position : this.player.position;
    const open = this.currentInterior
      ? { x: anchor.x, z: anchor.z }
      : this.map.findOpenSpot(anchor.x, anchor.z);
    const origin = new THREE.Vector3(open.x, heightAt(open.x, open.z), open.z);
    if (speaker) {
      this.sceneActor = speaker;
      this.currentTalker = speaker;
      speaker.talking = true;
    }
    if (!this.currentInterior && speaker) {
      speaker.command = new THREE.Vector3(origin.x, 0, origin.z);
      const mark = new THREE.Vector3(origin.x - 1.9, 0, origin.z + 0.5);
      await Promise.all([
        this.walkPlayerTo(mark),
        (async () => {
          const start = Date.now();
          while (!speaker.commandReached && Date.now() - start < 4000) await this.sceneWait(0.1);
          speaker.command = speaker.position.clone();
        })(),
      ]);
    }
    speaker?.face(this.player.position);
    this.facePlayerAt(speaker ? speaker.position : origin);
    // Look between the two of them, not at the villager.
    const stage = origin.clone().setY(origin.y + 1.3);
    stage.x -= 0.95;
    this.addSceneProp('letter', origin.x + 0.7, origin.z + 1.2);
    this.rig.moveTo(stage.clone(), { distance: 13, pitch: 40, azimuth: 10, seconds: 0.01 });
    await this.sceneWait(0.1);
    this.rig.moveTo(stage.clone(), { distance: 9.5, pitch: 35, azimuth: 4, seconds: 2.4 });

    try {
      await this.sceneSay(
        speaker ?? this.npcs.get('sparks')!,
        '',
        [l.opener ?? 'You break the wax seal and unfold a letter forty years unread.', ...l.contents],
      );
      // Push in for the reaction — the line that actually costs them something.
      this.rig.moveTo(stage.clone(), { distance: 8.0, pitch: 33, azimuth: -12, seconds: 2.2 });
      speaker?.mood('surprised', 1.4);
      audio.sfx('stinger');
      if (speaker && l.reaction?.length) await this.sceneSay(speaker, speaker.displayName, l.reaction);
      speaker?.emote('idea', 2.5);
      await this.sceneWait(1.2);
      this.rig.moveTo(stage.clone(), { distance: 12, pitch: 38, azimuth: 0, seconds: 1.8 });
      await this.sceneWait(1.8);
    } finally {
      this.clearSceneProps();
      this.setLetterbox(false);
      this.rig.clearFocus();
      if (speaker) {
        speaker.talking = false;
        speaker.command = null;
      }
      this.sceneActor = null;
      this.cutsceneHold = false;
      this.mail.deliver(id);
      bus.emit('toast', { text: `Truth uncovered — see the Case File [L]` });
      this.save(true);
    }
  }

export function beginDailyLoop(this: Game, day: string): void {
    let seed = 2166136261;
    for (let i = 0; i < day.length; i++) {
      seed ^= day.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    const active = [...this.npcs.values()].filter((npc) => npc.state !== 'dormant');
    const npc = active[Math.abs(seed) % active.length];
    const list = FAVOR_WISHLISTS[npc?.id ?? 'sparks'] ?? ['orchard-apple'];
    const itemId = list[Math.abs(seed >>> 7) % list.length];
    const surprise = DAILY_SURPRISES[Math.abs(seed >>> 13) % DAILY_SURPRISES.length];

    for (const resident of this.npcs.values()) this.friendship.state(resident.id).favorItem = null;
    if (npc) this.friendship.state(npc.id).favorItem = itemId;

    const parcelAdded = this.inventory.add(surprise);
    if (!parcelAdded) this.inventory.addGears(50);
    this.dailyLoop = { day, npcId: npc?.id ?? 'sparks', itemId, surprise: parcelAdded ? surprise : '50-gears' };
    this.save(true);
  }

export function showDayCard(this: Game): void {
    const festival = this.calendar.festivalToday();
    const birthday = this.calendar.birthdayToday();
    const weatherWord: Record<string, string> = {
      clear: 'Clear', rain: 'Rain', snow: 'Snow', fog: 'Fog',
    };
    const card = el('div', 'pm-daycard');
    card.style.cssText = `
      position:absolute; inset:0; z-index:40; pointer-events:none;
      display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity 700ms ease;
    `;
    const stamp = el('div');
    stamp.style.cssText = `
      position:relative; padding:26px 46px; text-align:center;
      font-family:var(--pm-display,Georgia,serif); color:var(--pm-h3a3129);
      background:var(--pm-kraft,var(--pm-he8dfc8));
      border:2px solid rgba(60,50,38,0.45); border-radius:6px;
      box-shadow:0 10px 26px rgba(0,0,0,0.4);
      transform:scale(0.86) rotate(-1.5deg); transition:transform 700ms cubic-bezier(.2,1.4,.4,1);
    `;
    const date = el('div', '', this.calendar.label);
    date.style.cssText = 'font-size:34px; letter-spacing:0.14em;';
    const sub = el('div', '', weatherWord[this.weather.kind] ?? 'Clear');
    sub.style.cssText = 'font-size:15px; letter-spacing:0.24em; opacity:0.7; margin-top:6px; text-transform:uppercase;';
    stamp.append(date, sub);
    if (festival || birthday) {
      const banner = el('div', '', festival ? festival.name.toUpperCase() : 'A BIRTHDAY TODAY');
      banner.style.cssText = 'margin-top:12px; font-size:14px; letter-spacing:0.2em; color:var(--pm-ha8402f);';
      stamp.appendChild(banner);
    }
    const resident = this.npcs.get(this.dailyLoop.npcId);
    const requestDef = ITEMS[this.dailyLoop.itemId];
    const parcelDef = ITEMS[this.dailyLoop.surprise];
    if (resident && requestDef) {
      const request = el('div', '', `${resident.displayName} is looking for ${requestDef.icon} ${requestDef.name}`);
      request.style.cssText = 'margin-top:14px; font-size:15px; letter-spacing:0.04em; color:var(--pm-h5b4638);';
      stamp.appendChild(request);
    }
    const parcelText = parcelDef
      ? `Morning parcel · ${parcelDef.icon} ${parcelDef.name}`
      : 'Morning parcel · ⚙ 50 gears (pockets full)';
    const parcel = el('div', '', parcelText);
    parcel.style.cssText = 'margin-top:6px; font-size:13px; letter-spacing:0.08em; opacity:0.72;';
    stamp.appendChild(parcel);
    // The cancellation ring, offset like a real postmark strike.
    const ring = el('div');
    ring.style.cssText = `
      position:absolute; left:-26px; top:-24px; width:88px; height:88px;
      border:3px solid rgba(168,64,47,0.5); border-radius:50%;
      transform:rotate(-14deg);
    `;
    stamp.appendChild(ring);
    card.appendChild(stamp);
    this.renderer.domElement.parentElement!.appendChild(card);
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      stamp.style.transform = 'scale(1) rotate(-1.5deg)';
    });
    audio.sfx('stinger');
    setTimeout(() => {
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 800);
    }, 2600);
  }

export function showTitleCard(this: Game, lines: string[]): void {
    const card = el('div');
    card.style.cssText = `
      position:absolute; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; z-index:56;
      font-family:var(--pm-display,Georgia,serif); color:var(--pm-hf2ead6); opacity:0;
      transition:opacity 1s ease; text-shadow:0 3px 12px rgba(0,0,0,0.7);
      pointer-events:none; text-align:center;
    `;
    // A scrim behind the words. Pale serif over a sunlit plaza is unreadable
    // no matter how much text-shadow you pile on, and these lines are the
    // ones the whole story lands on.
    const scrim = el('div');
    scrim.style.cssText = `
      position:absolute; inset:0;
      background:radial-gradient(ellipse at center,
        rgba(10,8,6,0.82) 0%, rgba(10,8,6,0.68) 38%, rgba(10,8,6,0) 78%);
    `;
    card.appendChild(scrim);
    const big = el('div', '', lines[0] ?? '');
    big.style.cssText = 'font-size:52px; letter-spacing:0.18em; position:relative;';
    card.appendChild(big);
    if (lines[1]) {
      const small = el('div', '', lines[1]);
      small.style.cssText = 'font-size:18px; color:var(--pm-hffb347); font-style:italic; margin-top:14px; position:relative;';
      card.appendChild(small);
    }
    this.renderer.domElement.parentElement!.appendChild(card);
    void card.offsetHeight;
    card.style.opacity = '1';
    setTimeout(() => {
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 1200);
    }, 2600);
  }

export function rollCredits(this: Game): Promise<void> {
    return new Promise((resolve) => {
      const roll = el('div');
      roll.style.cssText = `
        position:absolute; inset:0; z-index:57; background:var(--pm-h0c0a08);
        color:var(--pm-he8dfc8); font-family:var(--pm-display,Georgia,serif);
        display:flex; align-items:flex-start; justify-content:center;
        overflow:hidden; opacity:0; transition:opacity 1.2s ease;
      `;
      const inner = el('div');
      inner.style.cssText = 'text-align:center; padding-top:100vh; line-height:2.1; font-size:18px;';
      const credits = [
        '✦ POSTMARK ✦', '',
        'a cozy post-human town-builder', '', '',
        `the town of ${this.playerName}'s Crossing`, '', '',
        'SPARKS · keeper of the ledgers',
        'REGGIE · the re-emporium',
        'CATALOGER 734 · the archive',
        'MARIGOLD · the orchard',
        'BUOY · the river',
        'WICK · the lamps',
        'FERN · the kettle',
        'PLINK · the town song', '', '',
        'and the postmaster who kept the door open', '',
        'and the postmaster who walked through it', '', '', '',
        'General Delivery.', '',
        'To be claimed by whoever arrives.', '', '', '',
        '~ thank you for coming home ~', '', '', '',
      ];
      for (const line of credits) {
        const row = el('div', '', line);
        if (line.startsWith('✦')) row.style.cssText = 'font-size:34px; letter-spacing:0.2em; color:var(--pm-hffb347);';
        if (line.startsWith('~')) row.style.color = PALETTE_CSS.hffb347;
        inner.appendChild(row);
      }
      roll.appendChild(inner);
      this.renderer.domElement.parentElement!.appendChild(roll);
      void roll.offsetHeight;
      roll.style.opacity = '1';
      inner.style.transition = 'transform 22s linear';
      requestAnimationFrame(() => {
        inner.style.transform = 'translateY(-140vh)';
      });
      const skip = (): void => {
        roll.style.opacity = '0';
        setTimeout(() => {
          roll.remove();
          window.removeEventListener('keydown', skip);
          resolve();
        }, 1200);
      };
      setTimeout(skip, 23000);
      window.addEventListener('keydown', skip);
    });
  }

export function startTalkless(this: Game, lines: string[]): void {
    this.dialogue.open('', lines);
  }

export function startTalk(this: Game, npc: NPC,
    lines: string[],
    opts?: Parameters<DialogueBox['open']>[2],): void {
    this.currentTalker = npc;
    npc.talking = true;
    this.lastLineText = '';
    this.dialogue.open(npc.displayName, lines, opts);
  }

