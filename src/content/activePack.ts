import { assets } from '../core/AssetLoader';
import type { CastPack } from './types';
import type { DeadLetter } from '../data/letters';
import type { SceneStep } from '../data/heartScenes';
import type { QuestDef } from '../systems/QuestSystem';
import type { Tastes } from '../systems/Friendship';
import type { GameObject } from '../world/objects/GameObjectFormat';

import {
  KINDLY_FORWARD_CAST,
  KINDLY_FORWARD_CHARACTER_ASSETS,
  KINDLY_FORWARD_TASTES,
} from './kindly-forward/cast';
import { KINDLY_FORWARD_GAME_OBJECTS } from './kindly-forward/objects';
import { KINDLY_FORWARD_TITLE } from './kindly-forward/storySpine';
import {
  KINDLY_FORWARD_HEART_SCENES,
  KINDLY_FORWARD_KEEPSAKES,
  KINDLY_FORWARD_LETTERS,
  KINDLY_FORWARD_QUESTS,
} from './kindly-forward/runtime';

/**
 * The content the game runs on.
 *
 * This was the W6.5 two-pack switch. W7 demolished the POSTMARK pack, so the
 * indirection now has a single consumer and survives only as the one place
 * that names what content the engine resolves — controllers still import from
 * here rather than reaching into `kindly-forward/` directly.
 */
/** Activities deliberately held back until their gameplay is ready. */
export const ACTIVE_CAPABILITIES = { fishing: false } as const;

export const ACTIVE_CAST: CastPack = KINDLY_FORWARD_CAST;

/**
 * The placeable objects this pack defines, by id.
 *
 * An `.acre` names one of these rather than a `.glb`: the type owns the model
 * *and* what the thing can do. The engine implements component kinds and reads
 * them through here; which objects exist is content.
 */
export const ACTIVE_GAME_OBJECTS: ReadonlyMap<string, GameObject> =
  new Map(KINDLY_FORWARD_GAME_OBJECTS.map((object) => [object.id, object]));

/** One object type by id, or undefined — callers report the name they wanted. */
export function activeGameObject(id: string): GameObject | undefined {
  return ACTIVE_GAME_OBJECTS.get(id);
}

export const ACTIVE_TASTES: Record<string, Tastes> = KINDLY_FORWARD_TASTES;

export const ACTIVE_QUESTS: QuestDef[] = KINDLY_FORWARD_QUESTS;

export const ACTIVE_HEART_SCENES: Record<string, { title: string; steps: SceneStep[] }[]> =
  KINDLY_FORWARD_HEART_SCENES;

export const ACTIVE_KEEPSAKES: Record<string, string> = KINDLY_FORWARD_KEEPSAKES;

/** The letter table the mail system claims from and delivers against. */
export function activeLetters(): DeadLetter[] {
  return KINDLY_FORWARD_LETTERS;
}

/** How the game names itself on the title card. */
export const ACTIVE_TITLE = KINDLY_FORWARD_TITLE;

/** The NPC the opening cutscene hands the player to. */
export const ACTIVE_OPENING_NPC = 'albert';

/** Authored roles used only by the opening and excluded from resident counts. */
export const ACTIVE_OPENING_ROLES = {
  ferryRecruit: KINDLY_FORWARD_CHARACTER_ASSETS['ferry-recruit'],
  keeper: { model: () => assets.model('keeper'), clips: () => assets.animations('keeper') },
} as const;

export interface PlotDef {
  id: string;
  x: number;
  z: number;
  label: string;
}

/**
 * Plot markers the town lays out. Deliberately empty.
 *
 * This held eleven entries at literal coordinates, and its own comment admitted
 * where they came from: "sited on the redressed compatibility map" — POSTMARK's
 * 86x70 rectangle. On the generated island those eleven points collapse into a
 * ~48-unit blob near the origin regardless of seed, and `buildPlots` placed
 * them with no legality check at all, so markers landed in the sea and on cliff
 * faces.
 *
 * They are not being re-sited here. The build mechanic is being reworked and
 * nothing should be staked out at the start of a game, so the table is empty
 * until that lands. `buildPlots` now treats empty as *no plots* rather than
 * falling back to POSTMARK's cast plots.
 *
 * When siting returns, `generatedLayout.ts` already has both halves of what it
 * needs: the buildable-acre list sorted by distance from the post office, and
 * `IslandLayout.validatePlotSite`.
 *
 * One thing worth carrying forward when it does. `/characters`' cast pack homes
 * Liliane and Vittorio at `music-hall` while their authored letters gate on
 * `music-room`; both ids were present here on purpose. That inconsistency lives
 * in the authored content and is still unresolved.
 */
export const ACTIVE_PLOTS: readonly PlotDef[] = [];

/** Who keeps the office drawer the player claims letters from. */
export const ACTIVE_MAIL_KEEPER = 'albert';

/** Residents who withdraw inside their building once it is built, by plot id. */
export const ACTIVE_INDOOR_RESIDENCES: Record<string, string> = Object.fromEntries(
  KINDLY_FORWARD_CAST.members
    .filter((member) => member.homePlot)
    .map((member) => [member.id, member.homePlot as string]),
);
