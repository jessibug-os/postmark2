import type { Game } from '../Game';
import { PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { NPC } from '../../characters/NPC';
import * as D from '../../data/dialogue';
import { item } from '../../data/items';
import { FOSSILS } from '../../data/collections';
import { FAVOR_WISHLISTS } from '../Game';
import { ACTIVE_MAIL_KEEPER } from '../../content/activePack';
import { KINDLY_FORWARD_DAILY_DIALOGUE } from '../../content/kindly-forward/runtime';

export function idleTalk(this: Game, npc: NPC): void {
    const pending = this.friendship.pendingScene(npc.id);
    if (pending !== null) {
      void this.playHeartScene(npc, pending);
      return;
    }
    const s = this.friendship.state(npc.id);
    const choices: Array<{ label: string; action?: () => void }> = [
      { label: 'Give a gift', action: () => this.giftFlow(npc) },
    ];
    if (!s.favorItem) {
      choices.push({ label: 'Anything you need?', action: () => this.offerFavor(npc) });
    }
    // The office drawer's keeper offers the sack.
    if (npc.id === ACTIVE_MAIL_KEEPER && this.storyDone()) {
      if (this.mail.pickable(true, this.totalHearts()).length || this.mail.carrying) {
        choices.unshift({ label: 'The mail sack', action: () => this.openMailSack(npc) });
      }
    }
    choices.push({ label: '👋 Leave', action: () => audio.sfx('cancel') });
    this.startTalk(npc, this.contextIdle(npc), { choices });
  }

export function giftFlow(this: Game, npc: NPC): void {
    this.inventoryUI.openPicker(`A GIFT FOR ${npc.displayName}`, (slot) => {
      if (slot === null) return;
      const stack = this.inventory.slots[slot];
      if (!stack) return;
      const def = item(stack.itemId);
      if (def.category === 'tool' || stack.itemId.startsWith('keepsake')) {
        bus.emit('toast', { text: "You couldn't part with that.", icon: def.icon });
        return;
      }
      this.inventory.remove(stack.itemId, 1);
      this.recentAction = 'gifting';
      const res = this.friendship.onGift(npc.id, stack.itemId, def.category);
      audio.sfx('gift');
      npc.face(this.player.position);
      const reactions = D.GIFT_REACTIONS[npc.id];
      const lines: string[] = [];
      // Birthday: a big friendship bonus and a special line.
      const isBirthday = this.calendar.birthdayToday() === npc.id;
      if (isBirthday) {
        this.friendship.state(npc.id).points = Math.min(250, this.friendship.state(npc.id).points + 25);
        lines.push(`...You remembered. Today, of all days. You brought me a ${def.name} on my BIRTHDAY.`);
        npc.cheer();
        npc.emote('love', 3);
      }
      if (res.favor) lines.push(`The very ${def.name}! You actually found it!`);
      lines.push(...(reactions?.[res.verdict] ?? ['Thank you, Mayor.']));
      if (!res.counted) lines.push("(They've already had a gift today — the warmth doesn't stack, but the thought lands.)");
      if (res.verdict === 'loved' || res.favor) {
        npc.cheer();
        npc.emote('love', 2.5);
      } else if (res.verdict === 'disliked') {
        npc.mood('surprised', 1.2);
        npc.emote('question', 2);
      } else {
        npc.emote('happy', 2);
      }
      this.startTalk(npc, lines);
    });
  }

export function offerFavor(this: Game, npc: NPC): void {
    // Pick something gettable this villager would like.
    const list = FAVOR_WISHLISTS[npc.id] ?? ['orchard-apple'];
    const itemId = list[Math.floor(Math.random() * list.length)];
    this.friendship.state(npc.id).favorItem = itemId;
    const def = item(itemId);
    const ask = D.FAVOR_ASK[npc.id];
    npc.emote('idea', 2);
    this.startTalk(npc, ask ? ask(def.name, def.icon) : [`Could you find me a ${def.name}?`]);
  }

export function talkTo(this: Game, npc: NPC): void {
    npc.face(this.player.position);
    npc.talkCount++;
    if (npc.state === 'active') this.friendship.onTalk(npc.id);
    switch (npc.id) {
      case 'sparks': return this.talkSparks(npc);
      case 'reggie': return this.talkReggie(npc);
      case 'cataloger-734': return this.talkCataloger(npc);
      case 'marigold': return this.talkDormantVillager(npc, D.MARIGOLD, true);
      case 'buoy': return this.talkDormantVillager(npc, D.BUOY, true);
      case 'wick': return this.talkDormantVillager(npc, D.WICK, false);
      case 'fern': return this.talkDormantVillager(npc, D.FERN, false);
      case 'plink': return this.talkDormantVillager(npc, D.PLINK, false);
    }
    // Kindly Forward residents have no bespoke handler: the shared social flow
    // already covers gifts, favours, heart scenes and the authored day pool.
    if (KINDLY_FORWARD_DAILY_DIALOGUE[npc.id]) return this.idleTalk(npc);
  }

export function talkSparks(this: Game, npc: NPC): void {
    const q = this.quests;
    if (q.is('first-postmaster', 0)) {
      this.startTalk(npc, D.SPARKS.quest0Start, {
        onDone: () => {
          this.inventory.add('tool-net');
          this.inventory.add('tool-rod');
          bus.emit('toast', { text: 'Received the Bug Net and Fishing Rod!' });
          npc.cheer();
          q.advance();
        },
      });
      return;
    }
    if (q.is('first-postmaster', 1)) {
      const hasFish = this.inventory.slots.some((s) => s && item(s.itemId).category === 'fish');
      const hasBug = this.inventory.slots.some((s) => s && item(s.itemId).category === 'bug');
      if (hasFish && hasBug) {
        this.startTalk(npc, D.SPARKS.quest0Done, {
          onDone: () => {
            this.inventory.add('tool-shovel');
            bus.emit('toast', { text: 'Received the Shovel!', icon: '⛏️' });
            npc.cheer();
            q.advance();
          },
        });
      } else {
        this.startTalk(npc, D.SPARKS.quest0Waiting);
      }
      return;
    }
    if (q.is('wake-the-shopkeeper')) {
      this.startTalk(npc, D.SPARKS.quest1Waiting);
      return;
    }
    if (q.is('emporium-rising', 0)) {
      this.startTalk(npc, D.SPARKS.quest2Start, {
        onDone: () => {
          this.inventory.add('tool-axe');
          bus.emit('toast', { text: 'Received the Axe!', icon: '🪓' });
          npc.cheer();
          q.advance();
        },
      });
      return;
    }
    if (q.is('emporium-rising', 1)) {
      this.startTalk(npc, D.SPARKS.quest2Waiting);
      return;
    }
    if (q.is('the-nocturnal-librarian', 0)) {
      this.startTalk(npc, D.SPARKS.quest3Nudge);
      return;
    }
    if (q.is('a-growing-town', 0)) {
      this.startTalk(npc, D.SPARKS.quest4Start, { onDone: () => q.advance() });
      return;
    }
    if (q.is('a-growing-town')) {
      this.startTalk(npc, D.SPARKS.quest4Waiting);
      return;
    }
    if (q.is('the-town-lives', 2)) {
      this.startTalk(npc, D.SPARKS.ceremony, {
        onDone: () => {
          q.advance();
          audio.sfx('build');
          this.save(false);
        },
      });
      return;
    }
    if (q.is('the-town-lives')) {
      this.startTalk(npc, D.SPARKS.quest5Waiting);
      return;
    }
    this.idleTalk(npc);
  }

export function contextIdle(this: Game, npc: NPC): string[] {
    const pools: Record<string, D.CtxPools> = {
      sparks: D.SPARKS_CTX,
      reggie: D.REGGIE_CTX,
      'cataloger-734': D.CATALOGER_CTX,
      marigold: D.MARIGOLD_CTX,
      buoy: D.BUOY_CTX,
      wick: D.WICK_CTX,
      fern: D.FERN_CTX,
      plink: D.PLINK_CTX,
    };
    const pool = pools[npc.id];
    if (!pool) {
      const authored = KINDLY_FORWARD_DAILY_DIALOGUE[npc.id];
      if (!authored?.length) return ['...'];
      return [...authored[npc.talkCount % authored.length]];
    }
    const p = npc.position;
    const zone: D.IdleCtx['zone'] =
      p.z > 11 ? 'beach' : (this.map.zoneAt(p.x, p.z) as D.IdleCtx['zone']);
    const lines = D.pickContextIdle(pool, {
      phase: this.time.phase,
      day: new Date().getDay(),
      zone,
      questIndex: this.quests.active ? this.quests.questIndex : 6,
      friendship: this.friendship.hearts(npc.id),
      talkCount: npc.talkCount,
      season: this.calendar.season,
      weather: this.weather.kind,
      festival: this.calendar.festivalToday() !== null,
      birthday: this.calendar.birthdayToday() === npc.id,
      recentAction: this.recentAction,
    });
    // Recent activity is acknowledged once, by the next villager spoken to;
    // after that the richer calendar/location rotation resumes.
    this.recentAction = undefined;
    return lines;
  }

export function playReactivation(this: Game, npc: NPC, wakeLines: string[], after?: () => void): void {
    this.inventory.remove('amber-cell');
    this.cutsceneHold = true;
    this.rig.focus(npc.position, 8);
    audio.sfx('reactivate');
    const steamAt = npc.position.clone().add(new THREE.Vector3(0, 1.4, 0.3));
    this.burst(steamAt, [PALETTE_HEX.hf0eee8, PALETTE_HEX.hd8d5c8], 10, {
      speed: 0.6, up: 1.6, life: 1.4, size: 0.09, gravity: -0.5,
    });
    setTimeout(() => {
      npc.reactivate();
      npc.emote('notice', 1.2);
      this.burst(steamAt, [PALETTE_HEX.hffd58a, PALETTE_HEX.hffb347], 8, {
        speed: 1.4, up: 1.8, life: 0.8, size: 0.06, gravity: 2,
      });
    }, 900);
    setTimeout(() => {
      npc.face(this.player.position);
      npc.cheer();
      this.startTalk(npc, wakeLines, {
        onDone: () => {
          this.rig.clearFocus();
          this.cutsceneHold = false;
          npc.emote('love', 2.5);
          after?.();
          this.save(true);
        },
      });
    }, 1900);
    bus.emit('npc:reactivated', { npcId: npc.id });
  }

export function talkReggie(this: Game, npc: NPC): void {
    if (npc.state === 'dormant') {
      if (this.inventory.has('amber-cell')) {
        this.dialogue.open('', D.REGGIE.dormantWithCell, {
          onDone: () =>
            this.playReactivation(npc, D.REGGIE.wake, () => {
              this.quests.completeQuest('wake-the-shopkeeper');
            }),
        });
      } else {
        this.dialogue.open('', D.REGGIE.dormant);
      }
      return;
    }
    const shopBuilt = this.map.plots.get('emporium')?.built ?? false;
    if (!shopBuilt) {
      this.startTalk(npc, [
        'No walls, no shelves, no BASS. Get that timber and stone, Mayor — the plot\'s marked right there. *KA-CHING*',
      ]);
      return;
    }
    this.startTalk(npc, D.REGGIE.shopOpen, {
      choices: [
        { label: 'Shop', action: () => this.startTalk(npc, ['Today’s goods are out where you can SEE ’em. Walk the shelves; bring sales to the counter. *KA-CHING*']) },
        {
          label: '💬 Chat',
          action: () => this.idleTalk(npc),
        },
        { label: '👋 Leave', action: () => audio.sfx('cancel') },
      ],
    });
  }

export function talkCataloger(this: Game, npc: NPC): void {
    const q = this.quests;
    if (npc.state === 'low-power') {
      this.dialogue.open('', D.CATALOGER.idleDay[0]);
      return;
    }
    if (!q.reached('the-nocturnal-librarian', 1)) {
      this.startTalk(npc, D.CATALOGER.firstMeet, {
        onDone: () => {
          if (q.is('the-nocturnal-librarian', 0)) q.advance();
        },
      });
      return;
    }
    const archiveBuilt = this.map.plots.get('archive')?.built ?? false;
    const choices = [
      { label: 'Donate specimens', action: () => this.donateSpecimens(npc) },
      {
        label: '💬 Chat',
        action: () => this.idleTalk(npc),
      },
      { label: '👋 Leave', action: () => audio.sfx('cancel') },
    ];
    if (archiveBuilt) {
      choices.splice(1, 0, {
        label: '📖 Browse the ledger',
        action: () => this.museumUI.open(this.museumDonations),
      });
    }
    if (q.is('the-nocturnal-librarian', 1)) {
      this.startTalk(npc, D.CATALOGER.donationProgress(this.museumDonations.size), { choices });
    } else if (q.is('the-nocturnal-librarian', 2)) {
      this.startTalk(npc, ['The Archive waits on timber, stone, and one warm cell. The clearing is marked.'], { choices });
    } else {
      this.startTalk(npc, archiveBuilt ? this.contextIdle(npc) : D.pickIdle(D.CATALOGER.idle, npc.talkCount), { choices });
    }
  }

export function donateSpecimens(this: Game, npc: NPC): void {
    const donatedNow: string[] = [];
    const specimens=[...this.inventory.slots];
    let assessed=0;
    while(this.inventory.has('fossil-unassessed')){
      this.inventory.remove('fossil-unassessed');
      const fossil=FOSSILS[Math.floor(Math.random()*FOSSILS.length)];
      this.inventory.add(fossil); this.discovered.add(fossil); assessed++;
    }
    const rejected:string[]=[];
    for (const stack of specimens) {
      if (!stack) continue;
      const def = item(stack.itemId);
      if(def.category==='art' && def.authentic===false){ rejected.push(`${def.name}: ${def.artTell}`); continue; }
      if (def.archiveLabel && !this.museumDonations.has(stack.itemId)) {
        this.inventory.remove(stack.itemId, 1);
        this.museumDonations.add(stack.itemId);
        donatedNow.push(stack.itemId);
        bus.emit('museum:donated', { itemId: stack.itemId });
      }
    }
    if (!donatedNow.length && !assessed && !rejected.length) {
      this.startTalk(npc, [
        'Nothing new in your satchel. The drawers are patient; so am I. Mostly the drawers.',
      ]);
      return;
    }
    audio.sfx('catch');
    this.recentAction = 'donating';
    npc.emote('love', 2.5);
    const lines = donatedNow.map((id) => `${item(id).icon} ${item(id).name} — “${item(id).archiveLabel}”`);
    const assessment=assessed?[`I assessed ${assessed} fossil parcel${assessed===1?'':'s'}. The cleaned specimens are back in your pockets; donate them when ready.`]:[];
    const rejection=rejected.length?['I must reject the following art. The forgery tells are visible on inspection:',...rejected]:[];
    this.startTalk(npc, [...assessment,...rejection,...(donatedNow.length?['New specimens. New labels. A very good day:', ...lines]:[])], {
      onDone: () => {
        if (this.quests.is('the-nocturnal-librarian', 1) && this.museumDonations.size >= 3) {
          this.startTalk(npc, D.CATALOGER.threeDonated, { onDone: () => this.quests.advance() });
        }
        this.checkTownLivesProgress();
        this.save(true);
      },
    });
  }

export function talkDormantVillager(this: Game, npc: NPC,
    lines: { dormant: string[]; wake: string[]; idle: string[][] },
    questVillager: boolean,): void {
    if (npc.state === 'dormant') {
      if (questVillager && this.quests.is('a-growing-town', 0)) this.quests.advance();
      if (this.inventory.has('amber-cell')) {
        this.dialogue.open('', ['Your amber cell clicks into the open hatch...'], {
          onDone: () =>
            this.playReactivation(npc, lines.wake, () => {
              if (questVillager && this.quests.is('a-growing-town', 1)) {
                const marigoldNpc = this.npcs.get('marigold')!;
                const buoyNpc = this.npcs.get('buoy')!;
                if (marigoldNpc.state !== 'dormant' && buoyNpc.state !== 'dormant') {
                  this.quests.advance();
                }
              }
            }),
        });
      } else {
        this.dialogue.open('', lines.dormant);
      }
      return;
    }
    this.idleTalk(npc);
  }
