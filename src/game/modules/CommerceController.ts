import type { Game } from '../Game';
import { PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { ITEMS, item } from '../../data/items';
import { type ToolId } from '../../player/Player';
import { RECIPES, baseTool } from '../../data/crafting';
import { heightAt } from '../../world/TownMap';
import { FLOORS, setEmporiumStock, WALLPAPERS } from '../../world/Interior';

export function checkMuseumWings(this: Game): void {
    const wings: Array<{ cat: string; ach: string; title: string; reward: string }> = [
      { cat: 'fish', ach: 'wing-fish', title: 'Ichthyologist', reward: 'furn-fountain' },
      { cat: 'bug', ach: 'wing-bug', title: 'Entomologist', reward: 'furn-planter' },
    ];
    for (const w of wings) {
      if (this.achievements.has(w.ach)) continue;
      const all = Object.values(ITEMS).filter((it) => it.category === w.cat && it.archiveLabel);
      if (all.length && all.every((it) => this.museumDonations.has(it.id))) {
        this.inventory.add(w.reward);
        this.recordAchievement(w.ach, w.title, `Completed the ${w.cat} wing of the Archive!`);
        bus.emit('toast', { text: `Wing complete — ${item(w.reward).name} awarded!`, icon: item(w.reward).icon });
      }
    }
  }

export function recordAchievement(this: Game, id: string, title: string, blurb: string): void {
    if (this.achievements.has(id)) return;
    this.achievements.add(id);
    this.inventory.addGears(200);
    this.hud.showCatchBanner(`Achievement: ${title}`);
    bus.emit('toast', { text: `${blurb} Town Stamp award: 200 gears.` });
    audio.sfx('catch');
    this.save(true);
  }

export function shopTier(this: Game): number {
    if (this.houseTier >= 2 || this.achievements.size >= 6) return 3;
    if (this.storyDone() || this.achievements.size >= 3) return 2;
    return 1;
  }

export function openWorkbench(this: Game): void {
    // Recipes unlock with town progress: tools need the story done.
    const unlocked = RECIPES.filter((r) => {
      if (r.category === 'tool') return this.storyDone();
      if (r.id === 'craft-fountain' || r.id === 'craft-postbox') return this.storyDone();
      return true;
    });
    const canMake = (r: (typeof RECIPES)[number]): boolean =>
      r.cost.every(([id, n]) => this.inventory.has(id, n)) &&
      this.inventory.gears >= (r.gears ?? 0);
    const choices = unlocked.map((r) => {
      const costText = r.cost.map(([id, n]) => `${n} ${item(id).name}`).join(', ') + (r.gears ? ` + ${r.gears} g` : '');
      const ok = canMake(r);
      return {
        label: `${ok ? '' : '(locked) '}${r.label} — ${costText}`,
        action: () => {
          if (!canMake(r)) {
            bus.emit('toast', { text: 'Not enough materials.' });
            return;
          }
          for (const [id, n] of r.cost) this.inventory.remove(id, n);
          if (r.gears) this.inventory.addGears(-r.gears);
          // Tool upgrades consume the base tool if held.
          if (r.category === 'tool') {
            const base = baseTool(r.result);
            if (this.inventory.has(base)) this.inventory.remove(base, 1);
            if (this.player.equippedTool === base) this.player.equip(r.result as ToolId);
          }
          this.inventory.add(r.result, r.resultCount);
          this.recentAction = 'building';
          audio.sfx('build');
          this.burst(this.player.position, [PALETTE_HEX.hd8cdb4, PALETTE_HEX.hb09a6a], 8, { speed: 1, up: 1.6, life: 0.6, size: 0.05 });
          bus.emit('toast', { text: `Crafted: ${item(r.result).name}!`, icon: item(r.result).icon });
          this.recordAchievement('first-craft', 'Tinkerer', 'Crafted your first item at the workbench.');
          if (r.category === 'tool') this.recordAchievement('first-upgrade', 'Master of Tools', 'Upgraded a tool.');
          this.save(true);
        },
      };
    });
    choices.push({ label: '👋 Step away', action: () => audio.sfx('cancel') });
    this.dialogue.open('WORKBENCH', [
      'The old workbench, oiled and ready. Raw materials in, useful things out.',
    ], { choices });
  }

export function openRenovationLedger(this: Game): void {
    const tierCosts = [3000, 8000];
    const choices: Array<{ label: string; action?: () => void }> = [];
    if (this.houseTier < 2) {
      const cost = tierCosts[this.houseTier];
      choices.push({
        label: `Expand the cottage — ${cost} gears`,
        action: () => {
          if (this.inventory.gears < cost) {
            bus.emit('toast', { text: 'Not enough gears yet.' });
            return;
          }
          this.inventory.addGears(-cost);
          this.houseTier += 1;
          audio.sfx('build');
          this.burst(this.player.position, [PALETTE_HEX.hd8cdb4, PALETTE_HEX.hb09a6a], 10, { speed: 1.2, up: 2, life: 0.7, size: 0.06 });
          this.rebuildPlayerHouse();
          bus.emit('toast', { text: 'The cottage grows!' });
          this.save(true);
        },
      });
    }
    choices.push({
      label: 'Change wallpaper — 400 gears',
      action: () => this.openStylePicker('wallpaper'),
    });
    choices.push({
      label: 'Change flooring — 400 gears',
      action: () => this.openStylePicker('flooring'),
    });
    choices.push({ label: 'Close the ledger' });
    this.dialogue.open(
      'RENOVATION LEDGER',
      ['Pinned to the wall: a fresh page of the old renovation ledger, prices in neat clerk\'s hand.'],
      { choices },
    );
  }

export function openStylePicker(this: Game, kind: 'wallpaper' | 'flooring'): void {
    const styles = kind === 'wallpaper' ? WALLPAPERS : FLOORS;
    const current = kind === 'wallpaper' ? this.housePaper : this.houseFloor;
    const choices = styles.map((s) => ({
      label: `${s.name}${s.id === current ? '  (current)' : ''}`,
      action: () => {
        if (s.id === current) return;
        if (this.inventory.gears < 400) {
          bus.emit('toast', { text: 'Not enough gears yet.' });
          return;
        }
        this.inventory.addGears(-400);
        if (kind === 'wallpaper') this.housePaper = s.id;
        else this.houseFloor = s.id;
        audio.sfx('build');
        this.rebuildPlayerHouse();
        bus.emit('toast', { text: `${s.name} — much cozier.`, icon: kind === 'wallpaper' ? '🖼️' : '🪵' });
        this.save(true);
      },
    }));
    choices.push({ label: 'Never mind', action: () => undefined });
    this.dialogue.open('RENOVATION LEDGER', [`Swatches of ${kind} paste-samples flutter on the page.`], { choices });
  }

export function openConcertPlayer(this: Game): void {
    const owned = this.inventory.slots
      .filter((slot): slot is NonNullable<typeof slot> => !!slot?.itemId.startsWith('concert-'))
      .map((slot) => slot.itemId)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .sort();
    const choices = owned.map((id) => ({
      label: `${this.concertTrack === Number(id.slice(8)) ? '♪ ' : ''}${item(id).name}`,
      action: () => {
        this.concertTrack = Number(id.slice(8));
        audio.setTheme(`concert-${this.concertTrack}`);
        bus.emit('toast', { text: `Now playing: ${item(id).name}`, icon: '🎶' });
      },
    }));
    if (this.concertTrack !== null) {
      choices.push({
        label: 'Lift the needle',
        action: () => {
          this.concertTrack = null;
          audio.setTheme(this.currentTheme());
        },
      });
    }
    choices.push({ label: 'Step away', action: () => undefined });
    this.dialogue.open(
      'COTTAGE GRAMOPHONE',
      [owned.length
        ? `${owned.length} of eight PLINK records rest beside the brass horn.`
        : 'The brass horn waits. REGGIE stocks one PLINK record each day once his Counter grows.'],
      { choices },
    );
  }

export function browseShopItem(this: Game, itemId: string): void {
    const def = item(itemId);
    const price = def.buyPrice ?? 0;
    this.dialogue.open('SHELF TAG', [
      `${def.icon} ${def.name} · ${price} gears`,
      def.description,
    ], {
      choices: [
        {
          label: `Wrap it up · ${price} gears`,
          action: () => {
            const result = this.shopUI.purchase(itemId);
            this.dialogue.open('REGGIE', [result.text]);
            if (result.ok) {
              this.save(true);
              if (this.currentInterior?.id === 'emporium') {
                setEmporiumStock(
                  this.currentInterior,
                  this.shopUI.todayStock(this.ownedTools(), this.shopTier()),
                );
              }
            }
          },
        },
        { label: 'Leave it on the shelf', action: () => undefined },
      ],
    });
  }

export function plotRequirement(this: Game, plotId: string): { text: string; mats: Array<[string, number]> } | null {
    switch (plotId) {
      case 'emporium':
        if (!this.quests.reached('emporium-rising', 1)) return null;
        return { text: '8 Timber + 6 Stone', mats: [['timber', 8], ['stone', 6]] };
      case 'archive':
        if (!this.quests.reached('the-nocturnal-librarian', 2)) return null;
        return {
          text: '10 Timber + 8 Stone + 1 Amber Cell',
          mats: [['timber', 10], ['stone', 8], ['amber-cell', 1]],
        };
      case 'house-marigold':
      case 'house-buoy': {
        if (!this.quests.reached('a-growing-town', 2)) return null;
        const npcId = plotId === 'house-marigold' ? 'marigold' : 'buoy';
        if (this.npcs.get(npcId)!.state === 'dormant') return null;
        return { text: '6 Timber + 4 Stone', mats: [['timber', 6], ['stone', 4]] };
      }
      default:
        return null;
    }
  }

export function tryBuild(this: Game, plotId: string): void {
    const req = this.plotRequirement(plotId);
    const plot = this.map.plots.get(plotId);
    if (!req || !plot) return;
    for (const [matId, count] of req.mats) {
      if (!this.inventory.has(matId, count)) {
        bus.emit('toast', {
          text: `Still needed: ${req.mats
            .map(([m, c]) => `${Math.max(0, c - this.inventory.countOf(m))} ${item(m).name}`)
            .filter((s) => !s.startsWith('0 '))
            .join(', ')}`,
          icon: '🏗',
        });
        audio.sfx('cancel');
        return;
      }
    }
    for (const [matId, count] of req.mats) this.inventory.remove(matId, count);

    // Staged construction: scaffolding, hammering, then the reveal.
    this.cutsceneHold = true;
    const center = new THREE.Vector3(plot.x, heightAt(plot.x, plot.z), plot.z);
    this.map.raiseScaffold(plotId);
    this.rig.focus(center, 12);
    let knocks = 0;
    const knock = window.setInterval(() => {
      audio.sfx('hammer');
      this.burst(
        new THREE.Vector3(
          plot.x + (Math.random() - 0.5) * 3,
          center.y + 1 + Math.random() * 2,
          plot.z + (Math.random() - 0.5) * 3,
        ),
        [PALETTE_HEX.hb09a6a, PALETTE_HEX.hd8cdb4],
        4,
        { speed: 1, up: 1.2, life: 0.5, size: 0.05 },
      );
      if (++knocks >= 7) window.clearInterval(knock);
    }, 340);
    setTimeout(() => {
      this.map.constructBuilding(plotId);
      this.recentAction = 'building';
      audio.sfx('build');
      this.burst(center.clone().add(new THREE.Vector3(0, 2, 0)), [PALETTE_HEX.hf0e0b0, PALETTE_HEX.hd8cdb4, PALETTE_HEX.hffd58a], 26, {
        speed: 2.6, up: 2, life: 1.1, size: 0.1, gravity: 2,
      });
      this.rig.clearFocus();
      this.cutsceneHold = false;
      this.player.emote('happy');
      bus.emit('building:constructed', { buildingId: plotId });

      if (plotId === 'emporium') {
        this.quests.completeQuest('emporium-rising');
      } else if (plotId === 'archive') {
        this.quests.completeQuest('the-nocturnal-librarian');
      } else if (plotId.startsWith('house-')) {
        // POSTMARK's pair. Kindly Forward has its own `house-*` plots and no
        // such quest, so both lookups must tolerate an absent plot.
        const marigold = this.map.plots.get('house-marigold');
        const buoy = this.map.plots.get('house-buoy');
        if (marigold?.built && buoy?.built) this.quests.completeQuest('a-growing-town');
      }
      this.save(true);
    }, 2600);
  }

export function onQuestCompleted(this: Game, questId: string): void {
    if (questId === 'emporium-rising') {
      this.map.unlockZone('forest');
      bus.emit('toast', { text: 'The north gate to the forest is open!', icon: '🌲' });
    } else if (questId === 'the-nocturnal-librarian') {
      this.map.unlockZone('meadow');
      bus.emit('toast', { text: 'The river bridge to the eastern meadow is open!', icon: '🌉' });
    } else if (questId === 'the-town-lives') {
      bus.emit('toast', { text: '🎆 The town lives! Thank you for playing POSTMARK.', icon: '🎆' });
      this.ceremonyUntil = Date.now() + 60_000;
      this.celebrateFireworks();
      for (const npc of this.npcs.values()) {
        if (npc.state === 'active') {
          npc.cheer();
          npc.emote('love', 3);
        }
      }
    }
  }

export function checkTownLivesProgress(this: Game): void {
    if (this.quests.is('the-town-lives', 0) && this.furniture.placed.length >= 3) {
      this.quests.advance();
      bus.emit('toast', { text: 'The town green looks lived-in!', icon: '🪑' });
    }
    if (this.quests.is('the-town-lives', 1) && this.museumDonations.size >= 8) {
      this.quests.advance();
      bus.emit('toast', { text: 'The Archive hums with labels. Speak to SPARKS!', icon: '📖' });
    }
  }
