/**
 * The opening's script.
 *
 * **Tone.** The shape is still ordinary → wrong → eerie, but the landing has
 * moved twice. It used to end on Albert, whose register is comedy — a
 * frightened goofball knocking over a ledger — and the sequence wrote itself
 * backwards from that: the recruit quipped, the narration winked, and the fog
 * was a spooky interlude between two gags. It ends on the Keeper now, and he is
 * not sad about it either. He is old, he knows exactly how old, and he leans on
 * her to get his work done.
 *
 * So the comedy is drained out of everything ahead of him, because a joke three
 * minutes before that does not set it up, it inoculates the player against it.
 * The recruit stays warm — he has to be, or the emptying ferry takes nothing
 * away — but his warmth is the tired kind, and the last thing he says is about
 * people who mean to write and then find they cannot start. That is the whole
 * game stated by someone who does not know he is stating it, and it is the line
 * the Keeper answers an hour of fiction later.
 *
 * **The Keeper's half of this file is deliberately short.** He gets nineteen
 * lines to Albert's old thirteen-line explanation of the same situation,
 * because most of what the player learns about him is not said: the ground
 * thickens with unopened mail for the last fifty metres of the walk in
 * (`StrandedLetters`), his ember is out until he takes the light off her
 * (`OpeningStage`), and he crosses half the pool toward her while she gives
 * ground and the fog closes (`kindly-opening.scene`). A thing that old does not
 * explain itself to something that will be dead in fifty years, and the staging
 * is what says so. Every line here that could be a piece of blocking instead
 * should become one.
 *
 * Albert is not in the opening at all any more. He is the first thing the
 * player finds when it lets go of her, which is a better introduction than
 * being the last thing a cutscene hands her.
 */
export const OPENING = {
  recruitOrdinary: [
    'First assignment? You have the look.',
    "Don't let the quiet get to you. Every office is loud once it's yours.",
  ],
  recruitQuestion: ['Which island did they send you to?'],
  /**
   * The one line the sequence turns on, so it is the one that quotes the
   * player's own answer back at her. He tries the joke and it does not take —
   * which is more unsettling than not trying, because it shows him reaching
   * for the ordinary and missing.
   */
  recruitWarning: (island: string) => [
    `${island}? …Say that again.`,
    "I didn't know they'd opened that office back up. It was decommissioned before I was hired.",
    'There was a whole thing about it. Nobody I asked would say what.',
    "If the ferry's still on the schedule, the office must still be on the schedule. Right?",
  ],
  lastGoodbye: [
    'This is me.',
    'Write when you get settled. People mean to.',
    'Then it gets hard to start, and then it gets too late.',
  ],
  fogVoice: ['Postmaster…', 'So long… so long a wait…'],
  /**
   * Two lines, not three. The third used to be "It drifts a little way inland,
   * and waits for you" — a caption for something the player is watching happen,
   * written before the wisp existed and kept after it did. The light drifts
   * inland and waits; saying so is the narration reading the frame out loud.
   */
  dock: [
    'The ferry berth is empty. The water under it does not move.',
    'Something small and pale is burning at the end of the pier.',
  ],
  /**
   * At the spring, before the light does what it came to do.
   *
   * Three short lines and no explanation, because the player has just walked
   * fifty metres through the answer: the ground has been thickening with
   * undelivered mail the whole way in. Narration that told her what the drift
   * meant would be taking the discovery off her.
   */
  spring: [
    'The letters are everywhere here. None of them have been opened.',
    'Something is standing in the water.',
    'There is no light in it at all.',
  ],
  /**
   * It does not thank her. It takes.
   *
   * The Keeper is older than the office, older than the island's use, and it
   * has never once been the smaller thing in a conversation. So it does not
   * receive the light as a gift — the light is *its*, it has been missing, and
   * her having carried it is a fact about her usefulness rather than about her
   * kindness. Two words, because a thing this old does not explain itself to
   * something that will be dead in fifty years.
   */
  keeperWake: ['Ah.', 'Mine.'],
  /**
   * The mistake, and it is not an apology any more.
   *
   * It looks at her, finds the shape familiar, and discards the thought
   * without embarrassment. What used to be grief — "forgive me, you are not
   * her" — is now the coldest information in the sequence: there *was* one
   * before her, the Keeper does not consider her gone, and the correction is
   * made in the same breath as a threat about how long everything here waits.
   */
  keeperMistake: [
    'You wear her coat.',
    'No. Smaller. Warmer. Still breathing.',
    'The last one stood where you are standing.',
    'She is still on this island. They all are. Nothing leaves.',
  ],
  /**
   * What it is, stated as rank rather than as sorrow.
   *
   * The drift of letters on the walk has already told the player what it does.
   * These lines are about *standing*: it was here before the office, it will be
   * here after her, and it wants her to understand the difference in scale
   * before it asks her for anything.
   */
  keeperWho: [
    'I am the Keeper of Undelivered Things. I was here before the office. I will be here after it.',
    'You are the fourth they have sent. I remember all of them.',
  ],
  /**
   * The bidding, phrased so that refusing is not offered as an option.
   *
   * It never says what happens if she declines, which is the point — it lets
   * her supply that herself, having just been told that nothing leaves this
   * island and that three postmasters before her are still on it.
   */
  keeperBacklog: [
    'They cannot cross until they are told they may. Only a postmaster may tell them.',
    'I have held this since the office shut.',
  ],
  /**
   * The threat, on its own.
   *
   * It was the back half of a two-line block and it is the only sentence in
   * the sequence where he says what happens if she does not help — so it was
   * arriving in the middle of a paragraph, at the same size as the exposition
   * around it. One line, one beat, one push-in. He never says what "not
   * politely" means, which is the point: she has just been told that nothing
   * leaves this island and that three postmasters before her are still on it,
   * and she can supply the rest herself.
   */
  keeperThreat: ['I am not going to hold it politely for very much longer.'],
  keeperAsk: [
    'Take it.',
    'There is a door at the bottom of the hill. Someone behind it still believes he works here.',
    'Deliver what I give you, Postmaster, and I will let this island be gentle with you.',
    'Carry it kindly forward.',
  ],
} as const;

/**
 * The moments the player answers instead of advancing.
 *
 * Three of them, and they are placed where they are for three different jobs.
 *
 * `firstWords` is on the ferry, low stakes, and its only real purpose is to
 * teach the mechanic — the player learns that the box sometimes wants a choice
 * rather than a press, and learns it while nothing is at risk. It also gets the
 * first thing the Postmaster ever says out of the player rather than out of us.
 *
 * `standGround` is the one that matters. The Keeper has just told her that the
 * postmaster before her never left and that nothing on this island does, and
 * this is where she answers a very old thing that is deliberately leaning on
 * her. The three answers are not good, better and best; they are frightened,
 * curious and defiant, and the Keeper has something different to say to each.
 *
 * `theBargain` is the accept. **Every option accepts** — the opening has one
 * exit and pretending otherwise would be a lie the next beat immediately
 * exposes — but the *terms* are hers, and the Keeper's last line answers the
 * one she picked. That distinction is the whole design rule here: choices in
 * this opening change who the Postmaster is, not where she ends up. A branch
 * that changed where she ended up would need a second island and a second
 * Albert, and the honest version of a choice you cannot afford to honour is
 * not to offer it.
 */
export const OPENING_CHOICES = {
  firstWords: {
    /** Said by the recruit, so the choice reads as an answer to him. */
    prompt: ['So? Nervous?'],
    options: [
      { key: 'honest', label: '"Terrified."' },
      { key: 'game', label: '"I asked for a hard one."' },
      { key: 'quiet', label: '(say nothing)' },
    ],
  },
  standGround: {
    prompt: null,
    options: [
      { key: 'afraid', label: '"...What happens to the ones who stay?"' },
      { key: 'curious', label: '"What was her name?"' },
      { key: 'defiant', label: '"I am not the last one."' },
    ],
  },
  theBargain: {
    prompt: null,
    options: [
      { key: 'duty', label: '"Give me the first one."' },
      { key: 'terms', label: '"I will carry them. For them. Not for you."' },
    ],
  },
} as const;

/** The Keeper's answer to each stance. He always has one, and it is never warm. */
export const KEEPER_REPLIES: Record<string, string[]> = {
  afraid: [
    'They wait. That is all staying is.',
    'You will not like how patient a person can get.',
  ],
  curious: [
    'I do not keep names. I keep what was written on them.',
    'Hers is in here somewhere. Undelivered, like the rest.',
  ],
  defiant: [
    'No. You are the fourth.',
    'They all said something like that. I liked one of them for it.',
  ],
};

/** And to the terms she takes the work on. Same work, different weather. */
export const KEEPER_CLOSING: Record<string, string[]> = {
  duty: [
    'Good. Obedience is restful. I have missed it.',
    'Carry it kindly forward.',
  ],
  terms: [
    'For them. Yes. Say that to yourself as long as it holds.',
    'Carry it kindly forward.',
  ],
};

/** The recruit's reply to how she answered him, so the choice is not a void. */
export const RECRUIT_REPLIES: Record<string, string[]> = {
  honest: ['Good. The confident ones lose the mail.'],
  game: ['Ha. You will get one.'],
  quiet: ['Right. One of those.', "That's fine. Boat's long."],
};
