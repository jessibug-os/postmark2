import { bus } from '../core/events';
import type { FriendState } from './Friendship';
import type { Stack } from './Inventory';
import type { MailSaveData } from './MailSystem';

export const SAVE_VERSION = 3 as const;
export const DEFAULT_SAVE_ISLAND_SEED = 0x53544d59;
export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlotId = (typeof SAVE_SLOTS)[number];

const LEGACY_KEY = 'postmark-save-v1';
const ACTIVE_SLOT_KEY = 'postmark-save-active-slot';
const LEGACY_SLOT_KEY_PREFIX = 'postmark-save-v2-slot-';
const SLOT_KEY_PREFIX = 'postmark-save-v3-slot-';
const CORRUPT_KEY_PREFIX = 'postmark-save-corrupt-';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveDataBase {
  playerName: string;
  createdAt: number;
  playedSeconds: number;
  player: {
    x: number;
    z: number;
    coatItemId: string;
    equippedTool: string | null;
  };
  inventory: { slots: Array<Stack | null>; gears: number };
  museum: string[];
  discovered?: string[];
  questSteps: Record<string, number>;
  completedQuests: string[];
  reactivatedNpcs: string[];
  constructedBuildings: string[];
  unlockedZones: string[];
  placedFurniture: Array<{ itemId: string; x: number; z: number; rotY: number; y?: number; cell?: { col: number; row: number } }>;
  lastDigRefresh: number;
  introSeen: boolean;
  houseTier?: number;
  housePaper?: string;
  houseFloor?: string;
  friendship?: Record<string, FriendState>;
  mail?: MailSaveData;
  dailyLoop?: { day: string; npcId: string; itemId: string; surprise: string };
  achievements?: string[];
  settings?: { volume?: number; music?: boolean; sfx?: boolean; shake?: boolean };
  island?: IslandSaveData;
}

export interface IslandSaveData {
  /**
   * The authored map this save is on — a `.island` template id.
   *
   * Everything else here is legacy. A save written before islands were authored
   * carries the seed the generator was asked for, the seed it landed on, the
   * attempt that succeeded and a canonical snapshot of the acres it produced;
   * none of that can be replayed now that the passes are gone, so such a save
   * loads on the default map. The fields stay readable so an old save still
   * parses rather than being rejected at the door.
   */
  templateId?: string;
  requestedSeed?: number;
  resolvedSeed?: number;
  generationAttempt?: number;
  generatorVersion?: number;
  snapshot?: string;
}

/** The exact legacy shape committed in tests/fixtures/save-v1.json. */
export interface SaveDataV1 extends SaveDataBase {
  version: 1;
}

/** Current JSON-plain persistence contract. Optional v1 rails are normalized. */
export interface SaveData extends SaveDataBase {
  version: typeof SAVE_VERSION;
  savedAt: number;
  discovered: string[];
  houseTier: number;
  housePaper: string;
  houseFloor: string;
  friendship: Record<string, FriendState>;
  mail: MailSaveData;
  dailyLoop: { day: string; npcId: string; itemId: string; surprise: string };
  achievements: string[];
  settings: { volume: number; music: boolean; sfx: boolean; shake: boolean };
  island: IslandSaveData;
  recovery?: { at: number; reason: string };
}

export interface SaveSlotSummary {
  slot: SaveSlotId;
  occupied: boolean;
  playerName: string;
  playedSeconds: number;
  savedAt: number;
  recovered: boolean;
  refusedLegacy?: boolean;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function storageOrDefault(storage?: SaveStorage): SaveStorage {
  return storage ?? globalThis.localStorage;
}

export function slotKey(slot: SaveSlotId): string {
  return `${SLOT_KEY_PREFIX}${slot}`;
}

function validSlot(value: unknown): value is SaveSlotId {
  return value === 1 || value === 2 || value === 3;
}

export function activeSaveSlot(storage?: SaveStorage): SaveSlotId {
  const parsed = Number(storageOrDefault(storage).getItem(ACTIVE_SLOT_KEY));
  return validSlot(parsed) ? parsed : 1;
}

export function selectSaveSlot(slot: SaveSlotId, storage?: SaveStorage): void {
  storageOrDefault(storage).setItem(ACTIVE_SLOT_KEY, String(slot));
}

function safeFriendship(value: unknown): Record<string, FriendState> {
  if (!isRecord(value)) return {};
  const result: Record<string, FriendState> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    result[id] = {
      points: Math.max(0, Math.min(250, finite(raw.points, 0))),
      lastTalkDay: text(raw.lastTalkDay),
      lastGiftDay: text(raw.lastGiftDay),
      seenScenes: Array.isArray(raw.seenScenes)
        ? raw.seenScenes.filter((entry): entry is number => Number.isInteger(entry))
        : [],
      keepsakeGiven: flag(raw.keepsakeGiven, false),
      favorItem: typeof raw.favorItem === 'string' ? raw.favorItem : null,
    };
  }
  return result;
}

function safeMail(value: unknown): MailSaveData {
  const raw = isRecord(value) ? value : {};
  return {
    delivered: strings(raw.delivered),
    fragments: strings(raw.fragments),
  };
}

function safeInventory(value: unknown): SaveData['inventory'] {
  const raw = isRecord(value) ? value : {};
  const slots = Array.isArray(raw.slots)
    ? raw.slots.map((entry): Stack | null => {
        if (!isRecord(entry) || typeof entry.itemId !== 'string') return null;
        return { itemId: entry.itemId, count: Math.max(1, Math.floor(finite(entry.count, 1))) };
      })
    : [];
  return { slots, gears: Math.max(0, finite(raw.gears, 100)) };
}

function safeFurniture(value: unknown): SaveData['placedFurniture'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== 'string') return [];
    const x = finite(entry.x, Number.NaN);
    const z = finite(entry.z, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
    return [{
      itemId: entry.itemId,
      x,
      z,
      rotY: finite(entry.rotY, 0),
      ...(isRecord(entry.cell) && Number.isInteger(entry.cell.col) && Number.isInteger(entry.cell.row)
        ? { cell: { col: Number(entry.cell.col), row: Number(entry.cell.row) } }
        : {}),
      ...(typeof entry.y === 'number' && Number.isFinite(entry.y) ? { y: entry.y } : {}),
    }];
  });
}

function safeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([key, number]) => [key, Math.max(0, Math.floor(number))]),
  );
}

function safeIsland(value: unknown): IslandSaveData {
  const raw = isRecord(value) ? value : {};
  // `templateId` is the only field here the runtime still reads
  // (`mapConstants.chosenMap`). Dropping it on normalize silently moved every
  // reloaded save back to the default map, which is what the persistence gate
  // exists to catch. An absent id stays absent rather than being defaulted: the
  // default map is `templateOrDefault`'s job, not the save's.
  const templateId = text(raw.templateId);
  return {
    ...(templateId ? { templateId } : {}),
    requestedSeed: finite(raw.requestedSeed, DEFAULT_SAVE_ISLAND_SEED) >>> 0,
    resolvedSeed: finite(raw.resolvedSeed, finite(raw.requestedSeed, DEFAULT_SAVE_ISLAND_SEED)) >>> 0,
    generationAttempt: Math.max(0, Math.floor(finite(raw.generationAttempt, 0))),
    generatorVersion: Math.max(1, Math.floor(finite(raw.generatorVersion, 1))),
    snapshot: text(raw.snapshot),
  };
}

/** Create a complete v2 save. This is also the corruption-recovery baseline. */
export function newSaveData(playerName: string, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    playerName,
    createdAt: now,
    playedSeconds: 0,
    player: { x: 0, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [], gears: 100 },
    museum: [],
    discovered: [],
    questSteps: {},
    completedQuests: [],
    reactivatedNpcs: [],
    constructedBuildings: [],
    unlockedZones: ['town'],
    placedFurniture: [],
    lastDigRefresh: 0,
    introSeen: false,
    houseTier: 0,
    housePaper: 'plaster',
    houseFloor: 'pine',
    friendship: {},
    mail: safeMail(undefined),
    dailyLoop: { day: '', npcId: '', itemId: '', surprise: '' },
    achievements: [],
    settings: { volume: 0.5, music: true, sfx: true, shake: true },
    island: safeIsland(undefined),
  };
}

function normalizeSave(value: UnknownRecord, now: number): SaveData {
  const fallback = newSaveData('Postmaster', now);
  const player = isRecord(value.player) ? value.player : {};
  const settings = isRecord(value.settings) ? value.settings : {};
  const daily = isRecord(value.dailyLoop) ? value.dailyLoop : {};
  return {
    ...fallback,
    version: SAVE_VERSION,
    savedAt: finite(value.savedAt, now),
    playerName: text(value.playerName, fallback.playerName).slice(0, 40) || fallback.playerName,
    createdAt: finite(value.createdAt, now),
    playedSeconds: Math.max(0, finite(value.playedSeconds, 0)),
    player: {
      x: finite(player.x, fallback.player.x),
      z: finite(player.z, fallback.player.z),
      coatItemId: text(player.coatItemId, fallback.player.coatItemId),
      equippedTool: typeof player.equippedTool === 'string' ? player.equippedTool : null,
    },
    inventory: safeInventory(value.inventory),
    museum: strings(value.museum),
    discovered: strings(value.discovered),
    questSteps: safeNumberRecord(value.questSteps),
    completedQuests: strings(value.completedQuests),
    reactivatedNpcs: strings(value.reactivatedNpcs),
    constructedBuildings: strings(value.constructedBuildings),
    unlockedZones: strings(value.unlockedZones).length ? strings(value.unlockedZones) : ['town'],
    placedFurniture: safeFurniture(value.placedFurniture),
    lastDigRefresh: finite(value.lastDigRefresh, 0),
    introSeen: flag(value.introSeen, false),
    houseTier: Math.max(0, Math.floor(finite(value.houseTier, 0))),
    housePaper: text(value.housePaper, 'plaster'),
    houseFloor: text(value.houseFloor, 'pine'),
    friendship: safeFriendship(value.friendship),
    mail: safeMail(value.mail),
    dailyLoop: {
      day: text(daily.day),
      npcId: text(daily.npcId),
      itemId: text(daily.itemId),
      surprise: text(daily.surprise),
    },
    achievements: strings(value.achievements),
    settings: {
      volume: Math.max(0, Math.min(1, finite(settings.volume, 0.5))),
      music: flag(settings.music, true),
      sfx: flag(settings.sfx, true),
      shake: flag(settings.shake, true),
    },
    island: safeIsland(value.island),
    ...(isRecord(value.recovery)
      ? { recovery: { at: finite(value.recovery.at, now), reason: text(value.recovery.reason, 'recovered') } }
      : {}),
  };
}

export const LEGACY_SAVE_MESSAGE = 'This save is from an earlier version of the game and can’t be loaded.';

export class LegacySaveVersionError extends Error {
  constructor(readonly version: number) {
    super(LEGACY_SAVE_MESSAGE);
    this.name = 'LegacySaveVersionError';
  }
}

/** Parse the v3 contract. POSTMARK v1/v2 saves are deliberately refused. */
export function decodeSave(raw: string, now = Date.now()): SaveData {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error('save root is not an object');
  const version = finite(parsed.version, 1);
  if (version === 1 || version === 2) throw new LegacySaveVersionError(version);
  if (version !== SAVE_VERSION) throw new Error(`unsupported save version ${String(parsed.version)}`);
  return normalizeSave(parsed, now);
}

function recover(raw: string, reason: unknown, slot: SaveSlotId, storage: SaveStorage): SaveData {
  const now = Date.now();
  const message = reason instanceof Error ? reason.message : String(reason);
  try {
    storage.setItem(`${CORRUPT_KEY_PREFIX}${now}-slot-${slot}`, raw);
  } catch {
    // Recovery must not fail because quarantine storage is full.
  }
  const safe = {
    ...newSaveData('Recovered Town', now),
    introSeen: true,
    recovery: { at: now, reason: message },
  };
  try {
    storage.setItem(slotKey(slot), JSON.stringify(safe));
  } catch {
    // Returning the in-memory safe state is enough to keep the session alive.
  }
  console.warn(`[SaveSystem] slot ${slot} recovered: ${message}`);
  return safe;
}

function legacyRaw(slot: SaveSlotId, storage: SaveStorage): string | null {
  return storage.getItem(`${LEGACY_SLOT_KEY_PREFIX}${slot}`)
    ?? (slot === 1 ? storage.getItem(LEGACY_KEY) : null);
}

export function loadSave(slot = activeSaveSlot(), storage?: SaveStorage): SaveData | null {
  const target = storageOrDefault(storage);
  const currentRaw = target.getItem(slotKey(slot));
  const raw = currentRaw ?? legacyRaw(slot, target);
  if (!raw) return null;
  try {
    const data = decodeSave(raw);
    if (!currentRaw || raw !== JSON.stringify(data)) {
      target.setItem(slotKey(slot), JSON.stringify(data));
    }
    return data;
  } catch (error) {
    // A clean canon break is not corruption. Keep the old bytes intact so a
    // future explicit importer remains possible, and let the title list state
    // plainly that the slot cannot be continued.
    if (error instanceof LegacySaveVersionError) return null;
    return recover(raw, error, slot, target);
  }
}

/** Read the island identity before the world module is constructed. */
export function activeIslandSave(storage?: SaveStorage): IslandSaveData | null {
  return loadSave(activeSaveSlot(storage), storage)?.island ?? null;
}

export function writeSave(data: SaveData, auto = false, slot = activeSaveSlot(), storage?: SaveStorage): void {
  try {
    const target = storageOrDefault(storage);
    const normalized = normalizeSave({ ...data, version: SAVE_VERSION, savedAt: Date.now() }, Date.now());
    target.setItem(slotKey(slot), JSON.stringify(normalized));
    selectSaveSlot(slot, target);
    bus.emit('save:done', { auto });
  } catch (error) {
    console.warn('[SaveSystem] save failed', error);
  }
}

export function deleteSave(slot = activeSaveSlot(), storage?: SaveStorage): void {
  const target = storageOrDefault(storage);
  target.removeItem(slotKey(slot));
  target.removeItem(`${LEGACY_SLOT_KEY_PREFIX}${slot}`);
  if (slot === 1) target.removeItem(LEGACY_KEY);
}

export function hasSave(slot = activeSaveSlot(), storage?: SaveStorage): boolean {
  const target = storageOrDefault(storage);
  return target.getItem(slotKey(slot)) !== null || legacyRaw(slot, target) !== null;
}

export function listSaveSlots(storage?: SaveStorage): SaveSlotSummary[] {
  const target = storageOrDefault(storage);
  return SAVE_SLOTS.map((slot) => {
    if (!hasSave(slot, target)) {
      return { slot, occupied: false, playerName: '', playedSeconds: 0, savedAt: 0, recovered: false };
    }
    const data = loadSave(slot, target);
    if (!data && legacyRaw(slot, target)) {
      return {
        slot,
        occupied: true,
        playerName: LEGACY_SAVE_MESSAGE,
        playedSeconds: 0,
        savedAt: 0,
        recovered: false,
        refusedLegacy: true,
      };
    }
    return data
      ? {
          slot,
          occupied: true,
          playerName: data.playerName,
          playedSeconds: data.playedSeconds,
          savedAt: data.savedAt,
          recovered: Boolean(data.recovery),
        }
      : { slot, occupied: false, playerName: '', playedSeconds: 0, savedAt: 0, recovered: false };
  });
}
