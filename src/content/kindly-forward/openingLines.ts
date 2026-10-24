import {
  KEEPER_CLOSING, KEEPER_REPLIES, OPENING, OPENING_CHOICES, RECRUIT_REPLIES,
} from './opening';

/**
 * Resolving a `say` cue's line id into a speaker and the lines they say.
 *
 * `kindly-opening.scene` writes `say recruit recruitWarning`; this is the table
 * that turns that into "FELLOW RECRUIT" plus three sentences. It is deliberately
 * a lookup rather than prose in the scene file: a cutscene file full of dialogue
 * is a cutscene file nobody can restage without a merge conflict, and the lines
 * belong with the rest of the content pack.
 *
 * Two things it does that a bare `Record` could not. The narration lines —
 * the fog voice, the dock, the office door — have **no speaker**, and the
 * dialogue box renders them as narration when the name is empty; and
 * `recruitWarning` is a function of the island the player named, so the lookup
 * takes the answers the `ask` cue collected.
 */
export interface OpeningAnswers {
  name: string;
  island: string;
  /**
   * What the player has said, by choice id.
   *
   * The opening has one exit, so nothing here changes where she ends up — it
   * changes who she was on the way. `keeperReply` and `keeperClose` are the
   * lines that read it back, so a stance that nobody answers is a choice the
   * player will correctly read as decoration.
   */
  said: Record<string, string>;
}

export interface OpeningPrompt {
  speaker: string;
  /** Lines shown above the options. May be empty for a bare choice. */
  lines: string[];
  options: Array<{ key: string; label: string }>;
}

/**
 * A `choice` cue's prompt and options.
 *
 * Separate from `openingLine` because the shapes genuinely differ — a prompt
 * has options and no advance — and because keeping them apart is what lets the
 * scene format validate a `choice` cue against the choices rather than against
 * the lines, and name the mistake when an author writes one for the other.
 */
export function openingPrompt(id: string): OpeningPrompt {
  const choice = (OPENING_CHOICES as Record<string, {
    prompt: readonly string[] | null;
    options: ReadonlyArray<{ key: string; label: string }>;
  }>)[id];
  if (!choice) throw new Error(`no opening choice "${id}"`);
  return {
    // The ferry choice is the recruit asking her something; the two at the
    // spring are her answering a silence, which is why they carry no prompt.
    speaker: id === 'firstWords' ? RECRUIT : '',
    lines: [...(choice.prompt ?? [])],
    options: choice.options.map((option) => ({ key: option.key, label: option.label })),
  };
}

/** Every choice id the opening can put, for the editor's dropdown. */
export const OPENING_CHOICE_IDS = Object.keys(OPENING_CHOICES);

export interface OpeningLine {
  /** Empty for narration, which the dialogue box renders without a nameplate. */
  speaker: string;
  lines: string[];
}

const RECRUIT = 'FELLOW RECRUIT';
/**
 * The Keeper is named on the plate from his first word.
 *
 * Considered leaving him unnamed until he says what he is, and rejected: an
 * empty plate is how this box renders *narration*, so an unnamed speaker does
 * not read as a mystery, it reads as the island describing itself. He is a
 * person, and the plate is what says so.
 */
const KEEPER = 'THE KEEPER';

export function openingLine(id: string, answers: OpeningAnswers): OpeningLine {
  switch (id) {
    case 'recruitOrdinary': return { speaker: RECRUIT, lines: [...OPENING.recruitOrdinary] };
    case 'recruitQuestion': return { speaker: RECRUIT, lines: [...OPENING.recruitQuestion] };
    case 'recruitWarning': return { speaker: RECRUIT, lines: [...OPENING.recruitWarning(answers.island)] };
    case 'lastGoodbye': return { speaker: RECRUIT, lines: [...OPENING.lastGoodbye] };
    // Deliberately unattributed. The voice in the fog is the Keeper's, but the
    // player has no way to know that yet and a nameplate would give it away
    // three beats early — the recognition is supposed to land at the spring.
    case 'fogVoice': return { speaker: '', lines: [...OPENING.fogVoice] };
    case 'dock': return { speaker: '', lines: [...OPENING.dock] };
    case 'spring': return { speaker: '', lines: [...OPENING.spring] };
    case 'keeperWake': return { speaker: KEEPER, lines: [...OPENING.keeperWake] };
    case 'keeperMistake': return { speaker: KEEPER, lines: [...OPENING.keeperMistake] };
    case 'keeperWho': return { speaker: KEEPER, lines: [...OPENING.keeperWho] };
    case 'keeperBacklog': return { speaker: KEEPER, lines: [...OPENING.keeperBacklog] };
    case 'keeperThreat': return { speaker: KEEPER, lines: [...OPENING.keeperThreat] };
    case 'keeperAsk': return { speaker: KEEPER, lines: [...OPENING.keeperAsk] };
    // Three lines that exist only to answer something the player said. Each
    // falls back rather than throwing: a scene may reach one of these without
    // its choice having been put — a skip, a scrub, an unattended play — and a
    // reply to a question nobody asked should be the neutral one, not a crash.
    case 'recruitReply':
      return { speaker: RECRUIT, lines: [...(RECRUIT_REPLIES[answers.said.firstWords] ?? RECRUIT_REPLIES.quiet)] };
    case 'keeperReply':
      return { speaker: KEEPER, lines: [...(KEEPER_REPLIES[answers.said.standGround] ?? KEEPER_REPLIES.afraid)] };
    case 'keeperClose':
      return { speaker: KEEPER, lines: [...(KEEPER_CLOSING[answers.said.theBargain] ?? KEEPER_CLOSING.duty)] };
    default:
      // Named rather than silent: a scene that says a line id nothing answers
      // to should stop being authored, not play a beat of empty box.
      throw new Error(`no opening line "${id}"`);
  }
}

/** Every line id the opening can say, for the editor's dropdown. */
export const OPENING_LINE_IDS = [
  'recruitOrdinary', 'recruitQuestion', 'recruitWarning', 'lastGoodbye',
  'fogVoice', 'dock', 'spring',
  'keeperWake', 'keeperMistake', 'keeperWho', 'keeperBacklog', 'keeperThreat', 'keeperAsk',
  'recruitReply', 'keeperReply', 'keeperClose',
] as const;
