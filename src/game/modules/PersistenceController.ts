import type { Game } from '../Game';
import { audio } from '../../core/AudioSystem';
import { bus } from '../../core/events';
import { ITEMS } from '../../data/items';
import { type ToolId } from '../../player/Player';
import { SAVE_VERSION, writeSave, type SaveData } from '../../systems/SaveSystem';
import { heightAt } from '../../world/TownMap';
import { ACTIVE_LAYOUT } from '../../world/mapConstants';

export function save(this: Game, auto: boolean): void {
    if (this.state !== 'play') return;
    const data: SaveData = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playerName: this.playerName,
      createdAt: this.createdAt,
      playedSeconds: Math.floor(this.playedSeconds),
      player: {
        // If saving from indoors, persist the outdoor return point.
        x: this.currentInterior ? this.interiorReturn.x : this.player.position.x,
        z: this.currentInterior ? this.interiorReturn.z : this.player.position.z,
        coatItemId: this.equippedCoat,
        equippedTool: this.player.equippedTool,
      },
      inventory: this.inventory.serialize(),
      museum: [...this.museumDonations],
      discovered: [...this.discovered],
      questSteps: { main: this.quests.step },
      completedQuests: [String(this.quests.questIndex)],
      reactivatedNpcs: [...this.npcs.values()]
        .filter((n) => n.state !== 'dormant')
        .map((n) => n.id),
      constructedBuildings: [...this.map.plots.values()].filter((p) => p.built).map((p) => p.id),
      unlockedZones: (['town', 'forest', 'meadow'] as const).filter((z) => this.map.isUnlocked(z)),
      placedFurniture: this.furniture.placed,
      lastDigRefresh: this.lastDigRefresh,
      introSeen: true,
      houseTier: this.houseTier,
      housePaper: this.housePaper,
      houseFloor: this.houseFloor,
      friendship: this.friendship.serialize(),
      mail: this.mail.serialize(),
      achievements: [...this.achievements],
      dailyLoop: { ...this.dailyLoop },
      settings: { volume: audio.volume, music: audio.musicEnabled, sfx: audio.sfxEnabled, shake: this.screenShake },
      island: { templateId: ACTIVE_LAYOUT.acres!.id },
    };
    writeSave(data, auto, this.saveSlot);
    if (!auto) bus.emit('toast', { text: 'Town ledger saved.', icon: '💾' });
  }

export function restore(this: Game, data: SaveData): void {
    this.playerName = data.playerName;
    this.createdAt = data.createdAt;
    this.playedSeconds = data.playedSeconds;
    this.inventory.restore(data.inventory);
    this.quests.restore({
      questIndex: Number(data.completedQuests[0] ?? 0),
      step: data.questSteps['main'] ?? 0,
    });
    this.museumDonations = new Set(data.museum);
    this.discovered = new Set(data.discovered ?? data.museum.filter(id=>['fish','bug','sea','fossil'].includes(ITEMS[id]?.category)));
    this.lastDigRefresh = data.lastDigRefresh;
    this.houseTier = data.houseTier ?? 0;
    this.housePaper = data.housePaper ?? 'plaster';
    this.houseFloor = data.houseFloor ?? 'pine';
    this.friendship.restore(data.friendship);
    this.mail.restore(data.mail);
    this.achievements = new Set(data.achievements ?? []);
    this.dailyLoop = data.dailyLoop ?? { day: '', npcId: '', itemId: '', surprise: '' };
    if (data.settings) {
      audio.setMasterVolume(data.settings.volume ?? 0.5);
      audio.setMusicEnabled(data.settings.music ?? true);
      audio.sfxEnabled = data.settings.sfx ?? true;
      this.screenShake = data.settings.shake ?? true;
    }

    this.player.position.set(data.player.x, heightAt(data.player.x, data.player.z), data.player.z);
    this.equippedCoat = data.player.coatItemId;
    const coat = ITEMS[this.equippedCoat];
    if (coat?.clothingColor) this.player.setCoatColor(coat.clothingColor);
    if (data.player.equippedTool && this.inventory.has(data.player.equippedTool)) {
      this.player.equip(data.player.equippedTool as ToolId);
    }

    for (const zone of data.unlockedZones) {
      if (zone === 'forest' || zone === 'meadow') this.map.unlockZone(zone);
    }
    for (const buildingId of data.constructedBuildings) this.map.constructBuilding(buildingId);
    for (const npcId of data.reactivatedNpcs) this.npcs.get(npcId)?.reactivate();
    for (const p of data.placedFurniture) this.furniture.place(p);
    this.refreshDigSpots();
    this.rig.snapTo(this.player.position);
  }
