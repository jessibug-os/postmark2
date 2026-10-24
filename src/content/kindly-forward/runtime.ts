import type { Expression } from '../../characters/FaceRig';
import type { DeadLetter } from '../../data/letters';
import type { SceneStep } from '../../data/heartScenes';
import type { QuestDef } from '../../systems/QuestSystem';
import {
  KINDLY_FORWARD_RESIDENT_CONTENT,
  type ResidentContent,
} from './residentContent';

/**
 * Runtime adapter for W6.5 activation.
 *
 * `/characters` was authored as a design outline, not as runtime tables: quest
 * beats are objectives, heart-scene beats are stage directions, and the letters
 * carry contents but no recipient reaction. This module performs the mechanical
 * transform into the shapes the live controllers already consume. It invents no
 * words — every string below comes from `residentContent.ts` verbatim.
 *
 * Two authoring gaps are deliberately left visible rather than filled in here:
 *   - No letter has an authored `reaction` or truth `fragment`.
 *   - No quest beat has a world trigger, so beats advance conversationally.
 * Both belong to W6 and are recorded in `DESIGN_LOG.md`.
 */

const byId = new Map(KINDLY_FORWARD_RESIDENT_CONTENT.map((r) => [r.id, r]));

export const KINDLY_FORWARD_RESIDENT_IDS: readonly string[] =
  KINDLY_FORWARD_RESIDENT_CONTENT.map((r) => r.id);

export function residentContent(id: string): ResidentContent | undefined {
  return byId.get(id);
}

/** Daily dialogue pools, keyed by resident id. One authored exchange per entry. */
export const KINDLY_FORWARD_DAILY_DIALOGUE: Record<string, readonly (readonly string[])[]> =
  Object.fromEntries(KINDLY_FORWARD_RESIDENT_CONTENT.map((r) => [r.id, r.dailyDialogue]));

/**
 * No taste table is derived here on purpose. `residentContent.ts` and the W4
 * cast pack both author tastes and they disagree; `residentContent`'s ids are
 * not real items — `tea`, `paper`, `blank-form` and `relic-stamp` are absent
 * from `items.ts`, so a gift could never match one and gifting would silently
 * do nothing. `activePack` therefore takes tastes from `cast.ts`, whose ids all
 * resolve. Which table is canonical is the human's call.
 */

/**
 * The five authored beats become the five tracker steps of one quest per
 * resident. `/characters` fixes the order recruit → reveal → pressure → choice
 * → resolution; the beat text is the objective line the HUD shows.
 */
export const KINDLY_FORWARD_QUESTS: QuestDef[] = KINDLY_FORWARD_RESIDENT_CONTENT.map((r) => ({
  id: `kf-${r.id}`,
  title: `${r.id[0].toUpperCase()}${r.id.slice(1)} — ${r.role}`,
  steps: [r.quest.recruit, r.quest.reveal, r.quest.pressure, r.quest.choice, r.quest.resolution],
}));

/** Letters, gated by residency and the buildings each arc needs. */
export const KINDLY_FORWARD_LETTERS: DeadLetter[] = KINDLY_FORWARD_RESIDENT_CONTENT.map((r) => ({
  id: r.letter.id,
  target: r.id,
  address: r.letter.address,
  from: r.letter.from,
  contents: [...r.letter.contents],
  opener: 'You break the seal on a letter that has been waiting for its addressee.',
  // reaction and fragment are unauthored; see the module note.
  residentId: r.id,
  requiredBuildings: [...r.letter.requiredBuildings],
}));

const REGISTER_EXPRESSION: Record<'warm' | 'afraid' | 'angry' | 'quiet', Expression> = {
  warm: 'happy',
  afraid: 'surprised',
  angry: 'surprised',
  quiet: 'idle',
};

/**
 * Heart scenes. The authored beats are third-person stage directions, so they
 * are staged as narration over a held two-shot rather than put in the
 * resident's mouth. Camera and register framing are mechanical; the words are
 * the authored beats, unaltered and in order.
 */
export const KINDLY_FORWARD_HEART_SCENES: Record<string, { title: string; steps: SceneStep[] }[]> =
  Object.fromEntries(
    KINDLY_FORWARD_RESIDENT_CONTENT.map((r) => [
      r.id,
      r.heartScenes.map((scene) => ({
        title: scene.title,
        steps: [
          { t: 'faceOff' },
          { t: 'focusNpc', dist: 7 },
          { t: 'npcFace', where: 'player' },
          { t: 'mood', expr: REGISTER_EXPRESSION[scene.register], secs: 2 },
          { t: 'pushIn', dist: 5.6, secs: 5.5, under: true },
          ...scene.beats.map((beat): SceneStep => ({ t: 'narrate', lines: [beat] })),
          { t: 'wait', secs: 1.0 },
        ],
      })),
    ]),
  );

/** `/characters` authored no keepsake items for the residents. */
export const KINDLY_FORWARD_KEEPSAKES: Record<string, string> = {};
