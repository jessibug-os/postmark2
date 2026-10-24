/**
 * How the game names itself on the title card.
 *
 * The title screen had these three strings hardcoded in `TitleScreen.ts`, and
 * they read "THE LAST POSTMASTER OF / POSTMARK / a town, asleep in its
 * clockwork" — the other game, on the first frame a player ever sees, in front
 * of a sequence that spends four minutes establishing this one. The strings
 * were never wrong so much as never moved: the whole content-pack seam exists
 * so that story identity lives with the story, and the title is the shortest
 * piece of story there is.
 *
 * `tagline` is deliberately not a description of the mechanic. It is the line
 * the Keeper ends on, which is also the promise the game is making: the island
 * is full of people who cannot finish, and finishing is something somebody has
 * to carry to them.
 */
export const KINDLY_FORWARD_TITLE = {
  overline: 'ST. MYSTERE AND THE',
  name: 'KINDLY FORWARD',
  tagline: 'an island of unfinished business',
} as const;

export const KINDLY_FORWARD_STORY_SPINE = {
  acts: [
    {
      id: 'arrival',
      title: 'A Village That Waits',
      beats: [
        'The Postmaster reaches an office that already knows her title.',
        'Albert teaches the rules while concealing his own letter.',
        'Mira establishes that truth without care can become cruelty.',
        'The ferry establishes that residents may leave, but nobody is forced.',
      ],
    },
    {
      id: 'delivery',
      title: 'Truth Enters Daily Life',
      beats: [
        'Restored spaces let residents practice identities beyond waiting.',
        'Letters arrive through places and activities already used in daily life.',
        'Deliveries change schedules, relationships and shared environments.',
        'No mail is addressed to the Postmaster.',
      ],
    },
    {
      id: 'forwarding',
      title: 'A Town, Not a Waiting Room',
      beats: [
        "Albert's hidden letter exposes the institution behind the village.",
        'Residents choose to cross, stay, postpone or return for visits.',
        'The village writes its own charter instead of obeying an unseen destination system.',
        'The Postmaster chooses a relationship to the town; metaphysical status is not the answer.',
      ],
    },
  ],
  postmaster: {
    recruit: 'Name St. Mystere, survive the ferry fog, meet Albert and reopen the office.',
    reveal: 'The summons ledger has no entry for the Postmaster.',
    pressure: "Every delivered letter makes her more necessary and her own blank record harder to avoid.",
    choice: 'Search alone, keep serving without an answer, or let the residents help.',
    resolution: 'Choose to be a visitor, resident or something between those categories.',
  },
  mystery: {
    missingRecord: 'A blank space appears where the Postmaster destination should be.',
    discipline: 'Her status complicates her relationships; it never erases resident stories or becomes a twist prize.',
  },
} as const;

