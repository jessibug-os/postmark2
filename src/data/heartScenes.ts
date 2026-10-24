import { PALETTE_HEX } from '../art/palette';
import type { EmoteKind } from '../characters/EmoteBubble';
import type { Expression } from '../characters/FaceRig';

/**
 * Heart-moment cutscenes: three per villager, at 1, 3 and 5 hearts. Staged
 * scenes — letterboxed, camera-scripted, blocked and acted — in which each
 * robot hands the player one more fragment of the day the humans left.
 *
 * The canon beneath all of them (revealed fully by the Dead Letter Office):
 * forty years ago a Resettlement Order emptied the town in a single morning.
 * Everyone believed it was temporary — "back by spring." The revocation
 * letter arrived one week after the last wagon. Nobody ever knew.
 */

export type SceneStep =
  | { t: 'focus'; dx: number; dz: number; dist?: number }
  | { t: 'focusNpc'; dist?: number }
  | { t: 'npcWalk'; dx: number; dz: number }
  | { t: 'npcFace'; where: 'player' | 'away' | 'east' | 'west' | 'north' | 'south' }
  | { t: 'say'; lines: string[] }
  | { t: 'narrate'; lines: string[] }
  | { t: 'emote'; kind: EmoteKind }
  | { t: 'mood'; expr: Expression; secs?: number }
  | { t: 'cheer' }
  | { t: 'wait'; secs: number }
  | { t: 'stinger' }
  // --- camera ---------------------------------------------------------------
  /** Animated move to a point relative to the scene origin. */
  | {
      t: 'dolly';
      dx: number; dz: number;
      dist?: number; pitch?: number; azimuth?: number;
      secs?: number;
      /** Don't block: let the move run under the following dialogue. */
      under?: boolean;
    }
  /** Swing around the current subject by `degrees` without changing height. */
  | { t: 'orbit'; degrees: number; secs?: number; under?: boolean }
  /** Change distance only — the classic slow creep toward a face. */
  | { t: 'pushIn'; dist: number; secs?: number; under?: boolean }
  // --- blocking -------------------------------------------------------------
  | { t: 'playerWalk'; dx: number; dz: number }
  | { t: 'playerFace'; where: 'npc' | 'away' | 'east' | 'west' | 'north' | 'south' }
  /** Both actors turn to each other — the standard two-shot setup. */
  | { t: 'faceOff' }
  // --- staging --------------------------------------------------------------
  /** A prop that exists only for this scene, cleared when it ends. Handheld
   * props ride the actor's animated arm instead of being staged on the turf. */
  | {
      t: 'prop';
      kind: 'lantern' | 'petals' | 'letter' | 'crate' | 'flowers' | 'ember';
      dx: number;
      dz: number;
      heldBy?: 'npc' | 'player';
    }
  /** A warm or cold key light on the scene, for mood. */
  | { t: 'light'; color: number; intensity: number; dx?: number; dz?: number }
  /** Dim the world toward night for a beat, then restore at scene end. */
  | { t: 'dim'; amount: number }
  | { t: 'music'; cue: 'swell' | 'hush' | 'resolve' };

export interface HeartScene {
  /** Shown as a title card toast when the scene begins. */
  title: string;
  steps: SceneStep[];
}

export const KEEPSAKES: Record<string, string> = {
  sparks: 'keepsake-manifest',
  reggie: 'keepsake-record',
  'cataloger-734': 'keepsake-fieldglass',
  marigold: 'keepsake-seedpacket',
  buoy: 'keepsake-knot',
  wick: 'keepsake-match',
  fern: 'keepsake-recipe',
  plink: 'keepsake-tuningfork',
};

export const HEART_SCENES: Record<string, HeartScene[]> = {
  // ------------------------------------------------------------------ SPARKS
  sparks: [
    {
      title: 'The Morning Bell',
      steps: [
        { t: 'prop', kind: 'lantern', dx: 1.9, dz: -1.0 },
        { t: 'light', color: PALETTE_HEX.hffd18a, intensity: 2.4, dx: 1.5, dz: -0.8 },
        { t: 'orbit', degrees: 22, secs: 2.0 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Mayor! A moment. An unscheduled moment — I have penciled it in retroactively.',
          'Do you know what I did every morning, all forty years? Rang the town bell. Six o\'clock. Ding.',
        ] },
        { t: 'emote', kind: 'music' },
        { t: 'wait', secs: 0.8 },
        { t: 'say', lines: [
          'A bell for nobody is just... weather. I knew that. I rang it anyway.',
          'The old mayor used to say a town is a promise the buildings make to each other. Someone had to keep taking the minutes.',
        ] },
        { t: 'npcFace', where: 'away' },
        { t: 'wait', secs: 1.2 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'say', lines: [
          'Now you are here, and the bell is a bell again. This morning I rang it twice. Utterly against regulation. It was WONDERFUL.',
        ] },
        { t: 'cheer' },
      ],
    },
    {
      title: 'The Manifest',
      steps: [
        { t: 'dim', amount: 0.18 },
        { t: 'prop', kind: 'letter', dx: -1.4, dz: 0.5, heldBy: 'npc' },
        { t: 'light', color: PALETTE_HEX.hffc470, intensity: 2.6, dx: -1.0, dz: 0.4 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.4, pitch: 33, azimuth: -22, secs: 1.9 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.2, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Mayor. I want to show you a document. I have shown it to nobody, on account of there being nobody.',
          'The evacuation manifest. The morning they left, the old mayor read every name aloud on the square, and I checked them off. My finest penmanship. My worst day.',
        ] },
        { t: 'mood', expr: 'idle', secs: 1 },
        { t: 'npcFace', where: 'west' },
        { t: 'focus', dx: -3, dz: 0, dist: 8 },
        { t: 'say', lines: [
          'One hundred and eleven names. The wagons stood where the well is now. Everyone kept saying "by spring." The manifest even has a column for it: RETURNING. I ticked every single box.',
        ] },
        { t: 'wait', secs: 1.4 },
        { t: 'focusNpc', dist: 5.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'stinger' },
        { t: 'say', lines: [
          'There is a one-hundred-and-twelfth line. The mayor wrote it himself: SPARKS — ADMINISTRATIVE UNIT — SEAT RESERVED.',
          'I chose the town, Mayor. Somebody had to be here to un-board the doors. I have never once regretted it. I have merely... counted the springs.',
          'Forty-one, now. This one is my favorite.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2.5 },
      ],
    },
    {
      title: 'Seat Reserved',
      steps: [
        { t: 'dim', amount: 0.35 },
        { t: 'prop', kind: 'lantern', dx: 1.8, dz: -1.2 },
        { t: 'light', color: PALETTE_HEX.hffc470, intensity: 3.2, dx: 1.4, dz: -1.0 },
        { t: 'prop', kind: 'letter', dx: -0.9, dz: 0.6, heldBy: 'npc' },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: -26, secs: 2.4 },
        { t: 'faceOff' },
        { t: 'music', cue: 'hush' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Mayor, I have concluded four decades of paperwork this week. One item remained in my PENDING drawer. It has been pending since the wagons.',
        ] },
        { t: 'wait', secs: 1 },
        { t: 'say', lines: [
          'The last page of the manifest. My line. I never filed it, because filing it made the leaving... final. A pending page meant the day was still, administratively speaking, in progress.',
          'If the day never ended, they could still turn around. You see the logic. It is terrible logic. I am an excellent administrator and it is the worst logic I have ever maintained.',
        ] },
        { t: 'mood', expr: 'idle', secs: 1.5 },
        { t: 'npcFace', where: 'away' },
        { t: 'wait', secs: 1.6 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'I am filing it today. The day is over. A new one started when you walked out of the forest with mud on your coat and my whole job description in your title.',
          'I want you to keep the page. Seat reserved, Mayor. It was yours the whole time — we just had the name blank.',
        ] },
        { t: 'cheer' },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'narrate', lines: ['SPARKS gave you The Unfiled Page. He stamps the air where a stamp would go.'] },
      ],
    },
  ],

  // ------------------------------------------------------------------ REGGIE
  reggie: [
    {
      title: 'Crate Digging',
      steps: [
        { t: 'prop', kind: 'crate', dx: 2.0, dz: 0.5 },
        { t: 'light', color: PALETTE_HEX.hffd18a, intensity: 2.4, dx: 1.4, dz: -0.7 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.4, pitch: 33, azimuth: 22, secs: 1.8 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Yo, Mayor. C\'mere. You ever wonder why a cash register knows nine hundred songs?',
          'This shop used to be Verdigris Records. Family joint. Pops pressed vinyl in the back; the daughter ran the decks Saturday nights. Taught me my first crossfade.',
        ] },
        { t: 'emote', kind: 'music' },
        { t: 'say', lines: [
          'I was the till, man. Register by day. But closing time? She\'d flip my speaker on and we\'d run the WHOLE catalogue. Called me her opening act. *ka-ching* — that\'s the drawer blushing.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'stinger' },
        { t: 'say', lines: [
          'Anyway. You keep stoppin\' by, and lately the shop sounds like a shop again \'stead of a jukebox talkin\' to itself.',
          'That\'s all. That\'s the whole announcement. Doors at eight, Mayor. Doors at eight.',
        ] },
      ],
    },
    {
      title: 'Side A',
      steps: [
        { t: 'dim', amount: 0.2 },
        { t: 'prop', kind: 'crate', dx: -1.9, dz: 0.6 },
        { t: 'light', color: PALETTE_HEX.hffc470, intensity: 2.6, dx: -1.2, dz: 0.4 },
        { t: 'orbit', degrees: -20, secs: 2.0 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.2, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Aight. Real talk hour. You know what the family did, last day? Wagons loading outside, whole town shouting itself hoarse —',
          'They pressed one more record. Side A: fourteen minutes of the square. Market noise, the bell, somebody\'s dog, the daughter laughing at her pops. Just... the town, doing town.',
        ] },
        { t: 'mood', expr: 'idle', secs: 1.5 },
        { t: 'npcFace', where: 'away' },
        { t: 'say', lines: [
          '"Hold this," she says to me. "We\'ll want it when we\'re back. Cities forget what a morning sounds like."',
          'Forty years, man. I never played it. Not once. You play Side A, that morning\'s OVER, you feel me? Long as it\'s in the sleeve, it\'s still goin\' on somewhere.',
        ] },
        { t: 'wait', secs: 1.5 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          '...Lately though. Lately the square makes its OWN noise again. Yours mostly. Loud little mayor.',
          'Startin\' to think a record ain\'t a jar you keep a day in. It\'s a seed you plant in a new one. Still workin\' on that bar. It\'ll cook.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2 },
      ],
    },
    {
      title: 'The Needle Drop',
      steps: [
        { t: 'dim', amount: 0.4 },
        { t: 'prop', kind: 'crate', dx: 2.0, dz: 0.4 },
        { t: 'light', color: PALETTE_HEX.hff9a5c, intensity: 3.6, dx: 0.6, dz: -1.4 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: 26, secs: 2.6 },
        { t: 'faceOff' },
        { t: 'music', cue: 'swell' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Mayor. Tonight\'s the night. I\'m playin\' Side A.',
          'Forty years I kept that morning in the sleeve. But you know what I figured out? She didn\'t say hold it so the day wouldn\'t end. She said hold it \'cause SOMEBODY was gonna need to remember. She knew, man. She knew somebody\'d come.',
        ] },
        { t: 'wait', secs: 1 },
        { t: 'stinger' },
        { t: 'narrate', lines: [
          'The drawer opens — no ka-ching this time, gentle as a page turning. The record spins.',
          'Market noise. The bell. Somebody\'s dog. A girl laughing at her father. Fourteen minutes of a morning, forty years wide.',
        ] },
        { t: 'mood', expr: 'idle', secs: 2 },
        { t: 'wait', secs: 2.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          '...Sounds like Tuesday, don\'t it. Sounds like YOUR Tuesday. That\'s the thing I couldn\'t hear till you showed up: it ain\'t a goodbye record. It\'s a recipe.',
          'Keep it. I got the whole thing memorized down to the dog. And Mayor — when the town\'s big enough? We press Side B.',
        ] },
        { t: 'cheer' },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'narrate', lines: ['REGGIE gave you Square Sounds, Side A. The drawer closes softer than you\'ve ever heard it.'] },
      ],
    },
  ],

  // ------------------------------------------------------------- CATALOGER
  'cataloger-734': [
    {
      title: 'Drawer 1',
      steps: [
        { t: 'dim', amount: 0.24 },
        { t: 'prop', kind: 'lantern', dx: 1.7, dz: -0.9 },
        { t: 'light', color: PALETTE_HEX.hffbe63, intensity: 2.8, dx: 1.3, dz: -0.7 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.2, pitch: 34, azimuth: -20, secs: 1.8 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Postmaster. You arrive at a good hour; all hours here are good, but this one especially.',
          'You have seen my drawers. Seventy-one, alphabetical, cross-referenced. You have not seen Drawer 1. Nobody opens Drawer 1. Tonight I am amending the policy by one person.',
        ] },
        { t: 'wait', secs: 1.2 },
        { t: 'narrate', lines: [
          'He unlocks a small drawer at the very center of his chest. Inside: a brass field glass, wrapped in a scrap of canvas coat.',
        ] },
        { t: 'say', lines: [
          'Her name was Doctor Imelda Voss. Naturalist. She built me from a seed-sorting engine and a great deal of stubbornness.',
          'The field glass was hers. She would hand it to me and say: label everything, 734, so that nothing is forgotten. Then she would forget her own spectacles on her own head. Magnificent woman.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'stinger' },
        { t: 'say', lines: [
          'I have labelled four thousand specimens since. Every label is in her handwriting. I learned no other.',
        ] },
      ],
    },
    {
      title: 'The Unlabelled Thing',
      steps: [
        { t: 'dim', amount: 0.24 },
        { t: 'prop', kind: 'crate', dx: -1.8, dz: 0.5 },
        { t: 'light', color: PALETTE_HEX.hffbe63, intensity: 2.8, dx: -1.1, dz: 0.3 },
        { t: 'orbit', degrees: 18, secs: 2.0 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.2, secs: 5.5, under: true },
        { t: 'say', lines: [
          'A confession, postmaster. You will appreciate it; you deliver things, and a confession is only a letter with the address written on the inside.',
          'The morning of the wagons, Doctor Voss came to the tent. She did not take her field glass. She took nothing. She held my smallest hand — this one — and said a thing I have never filed.',
        ] },
        { t: 'npcFace', where: 'away' },
        { t: 'focus', dx: 0, dz: -2, dist: 7 },
        { t: 'wait', secs: 1.5 },
        { t: 'say', lines: [
          'She said: "Some things shouldn\'t be catalogued, 734. Some things you just have to keep."',
          'I have turned the sentence over for forty years. It contradicts her entire methodology. It contradicts MINE. I am built of her methodology.',
        ] },
        { t: 'stinger' },
        { t: 'focusNpc', dist: 5.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'I understand it now, I think. The specimens are labelled so they can be found by strangers. But she was never going to be a stranger. She was simply... kept.',
          'You are the first entry in that second archive, postmaster. There is no drawer. That is the point. It took me forty years to learn the point.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2.5 },
      ],
    },
    {
      title: 'Everything, Clearly',
      steps: [
        { t: 'dim', amount: 0.55 },
        { t: 'prop', kind: 'lantern', dx: -1.6, dz: -0.8 },
        { t: 'light', color: PALETTE_HEX.hffb347, intensity: 4.0, dx: -1.2, dz: -0.6 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: -26, secs: 3.0 },
        { t: 'faceOff' },
        { t: 'music', cue: 'hush' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Postmaster. Hold still. I am about to do something unprecedented, and I would like a witness with warm blood.',
        ] },
        { t: 'narrate', lines: [
          'He opens Drawer 1 and lifts out the field glass. His six hands are very steady. His lamp is very bright.',
        ] },
        { t: 'say', lines: [
          'Doctor Voss is not coming back. I have known it, statistically, for thirty years. I have known it in the other way since the night you first walked into my forest and I realized I had been waiting, not working.',
          'A tool unused is a specimen. I will not let her field glass become a specimen. Instruments are for hands that go outside.',
        ] },
        { t: 'wait', secs: 1.5 },
        { t: 'stinger' },
        { t: 'say', lines: [
          'Take it. Look at everything. Look CLEARLY — the fish, the moths, the town, the years. That was the whole of her science and it is the whole of my religion.',
          'And when you see something worth keeping, postmaster... you will know which archive it belongs to.',
        ] },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'cheer' },
        { t: 'narrate', lines: ['CATALOGER 734 gave you The Field Glass. Label: EVERYTHING, CLEARLY.'] },
      ],
    },
  ],

  // ---------------------------------------------------------------- MARIGOLD
  marigold: [
    {
      title: 'The Fourteen Feet',
      steps: [
        { t: 'prop', kind: 'flowers', dx: 1.6, dz: 0.8 },
        { t: 'light', color: PALETTE_HEX.hffe0a0, intensity: 2.2, dx: 1.2, dz: -0.6 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.4, pitch: 33, azimuth: 22, secs: 1.8 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Oh, dear, come stand in the rows with me a minute. The trees grow better with an audience; everything does.',
          'Fourteen feet, trunk to trunk. Do you know why? That was HER stride, twice. The head gardener. She measured the whole orchard by walking it, arms out, laughing at her own wobble.',
        ] },
        { t: 'emote', kind: 'love' },
        { t: 'say', lines: [
          'Elowen. Miss E., to the children. She would say: plant things a person-width apart, so there is always room for a person.',
          'Forty years I kept the spacing. Weeds mind their manners in this orchard, dear. They know whose stride it is.',
        ] },
        { t: 'stinger' },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'say', lines: [
          'Walk the row with me sometime. Arms out. Wobble encouraged.',
        ] },
      ],
    },
    {
      title: 'Planting Day',
      steps: [
        { t: 'prop', kind: 'flowers', dx: -1.5, dz: 0.9 },
        { t: 'prop', kind: 'petals', dx: 0, dz: 0 },
        { t: 'light', color: PALETTE_HEX.hffe0a0, intensity: 2.2, dx: -1.1, dz: -0.5 },
        { t: 'focusNpc', dist: 6 },
        { t: 'faceOff' },
        { t: 'npcFace', where: 'player' },
        { t: 'orbit', degrees: -13, secs: 1.9 },
        { t: 'pushIn', dist: 5.6, secs: 4.5, under: true },
        { t: 'say', lines: [
          'Dear, I want to tell you about the strangest gardening I ever saw, and I have seen a squirrel bury a pocket watch.',
          'The morning everyone left — wagons on the square, the whole town one big shout — Miss E. was HERE. In the rows. Planting.',
        ] },
        { t: 'npcFace', where: 'east' },
        { t: 'focus', dx: 2.5, dz: -1, dist: 7 },
        { t: 'say', lines: [
          'Apple whips, dear. Bare little sticks. You plant those for a harvest seven years out. Her husband kept calling from the wagon and she kept planting, in her travelling coat, muddy to the elbow.',
          '"They\'ll want apples when we\'re back," she said. Not IF, dear. WHEN. She planted seven years of when, the morning of a one-morning goodbye.',
        ] },
        { t: 'wait', secs: 1.5 },
        { t: 'stinger' },
        { t: 'focusNpc', dist: 5.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'mood', expr: 'idle', secs: 1.5 },
        { t: 'say', lines: [
          'Those whips are the orchard now, dear. Every apple you have ever shaken down is a letter she wrote to a spring she never met.',
          'I deliver them for her. Postmaster to postmaster, you might say.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2.5 },
      ],
    },
    {
      title: 'The Last Pinch',
      steps: [
        { t: 'dim', amount: 0.25 },
        { t: 'prop', kind: 'flowers', dx: 0.9, dz: 0.9 },
        { t: 'prop', kind: 'petals', dx: 0, dz: 0 },
        { t: 'light', color: PALETTE_HEX.hffd8e0, intensity: 2.4 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: 26, secs: 2.4 },
        { t: 'faceOff' },
        { t: 'music', cue: 'hush' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Sit with me, dear. Mind the thyme; it minds back.',
          'When the wagons rolled, Miss E. pressed a seed packet into my scoop. Her own hand on the label: "For spring. — E." Full to the seam, it was.',
        ] },
        { t: 'wait', secs: 1 },
        { t: 'say', lines: [
          'Every year I planted one pinch. Only one. A packet is a promise, dear, and I did not know how many springs the promise had to last.',
          'Forty pinches. Forty springs. There is half a pinch left, and my scoop has learned to shake a little, holding it.',
        ] },
        { t: 'mood', expr: 'idle', secs: 2 },
        { t: 'npcFace', where: 'away' },
        { t: 'wait', secs: 1.4 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'I want you to keep the packet, dear. Not to plant — to KNOW. To know what this meadow is: forty years of somebody\'s handwriting, blooming.',
          'The last half-pinch we will plant together, you and I, some spring when the town is loud. E. would have adored you. Muddy to the elbow, the pair of you.',
        ] },
        { t: 'cheer' },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'narrate', lines: ['MARIGOLD gave you "For Spring. — E." It weighs almost nothing. It weighs forty years.'] },
      ],
    },
  ],

  // -------------------------------------------------------------------- BUOY
  buoy: [
    {
      title: 'Knots',
      steps: [
        { t: 'prop', kind: 'lantern', dx: 1.8, dz: 0.7 },
        { t: 'light', color: PALETTE_HEX.hdfe6ff, intensity: 2.2, dx: 1.3, dz: -0.6 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.4, pitch: 33, azimuth: 22, secs: 1.8 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Mayor. Good tide for talking. Every tide is, but this one especially — slack water. Even the river\'s listening.',
          'See this? Bowline. One-handed. You know who taught a submarine to tie a bowline one-handed? A nine-year-old.',
        ] },
        { t: 'mood', expr: 'happy', secs: 1.5 },
        { t: 'say', lines: [
          'Ferryman\'s kid. Nim. Couldn\'t sit still on a crossing to save her life, so her pa gave her rope. She practiced on my fingers. Called me her knot dummy. I have never held a prouder title.',
        ] },
        { t: 'emote', kind: 'happy' },
        { t: 'stinger' },
        { t: 'say', lines: [
          'A knot\'s just a way of telling rope you\'ll be back for it, mayor. Nim said that. Nine years old. The river still repeats it on quiet days.',
        ] },
      ],
    },
    {
      title: 'The Last Crossing',
      steps: [
        { t: 'dim', amount: 0.22 },
        { t: 'prop', kind: 'lantern', dx: -1.7, dz: 0.6 },
        { t: 'light', color: PALETTE_HEX.hcfe0ff, intensity: 2.5, dx: -1.1, dz: 0.4 },
        { t: 'orbit', degrees: -18, secs: 2.1 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.2, secs: 5.5, under: true },
        { t: 'say', lines: [
          'You want to know the worst thing about the day they left? It was GOOD ferry weather. Flat water. Kind sun. The river did everything right.',
          'I ran the last crossing myself. Eleven trips. Wagons don\'t float, so it was me, back and forth, the whole town in my wake.',
        ] },
        { t: 'npcFace', where: 'south' },
        { t: 'focus', dx: 0, dz: 2.5, dist: 8 },
        { t: 'say', lines: [
          'Trip eleven was Nim and her pa. She sat in the bow. Didn\'t fidget. First still crossing of her entire life, and I\'d have given my hull for one more squirmy one.',
          'Halfway over she ties something on my finger. Her practice bowline. "So you know I\'m coming back for it," she says.',
        ] },
        { t: 'wait', secs: 1.6 },
        { t: 'stinger' },
        { t: 'focusNpc', dist: 5.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'It\'s still tied, mayor. Forty years of weather. I re-work every knot on this dock twice a season and I have never once touched that one.',
          'A knot\'s a promise the rope keeps for you. Hers is the best-kept promise on this river.',
        ] },
        { t: 'mood', expr: 'idle', secs: 2.5 },
      ],
    },
    {
      title: 'Slack Water',
      steps: [
        { t: 'dim', amount: 0.3 },
        { t: 'light', color: PALETTE_HEX.h8fb0d8, intensity: 2.8, dz: -1.0 },
        { t: 'prop', kind: 'letter', dx: 0.8, dz: 0.5, heldBy: 'npc' },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: -26, secs: 2.8 },
        { t: 'faceOff' },
        { t: 'music', cue: 'hush' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Mayor. Been thinking. Dangerous hobby for a buoy — we\'re built to bob, not brood. But here it is.',
          'Nim would be fifty, now. Wherever the wagons ended up, she\'s got kids. Maybe grandkids. Maybe she taught \'em knots on some city railing, some other dummy\'s fingers.',
        ] },
        { t: 'mood', expr: 'idle', secs: 2 },
        { t: 'wait', secs: 1 },
        { t: 'say', lines: [
          'For forty years I kept her bowline like the rope was the promise. It ain\'t. I figured it out watching you fish my river like you were born on it.',
          'The promise was the TEACHING, mayor. The knot was just the receipt.',
        ] },
        { t: 'stinger' },
        { t: 'narrate', lines: [
          'BUOY works the little bowline loose from his finger — forty years of weather giving way all at once — and holds it out flat on one steel palm.',
        ] },
        { t: 'say', lines: [
          'So. Give me your hand. I\'m teaching you the one-handed bowline, and you\'re keeping the receipt.',
          'Somebody\'s got to be the knot dummy now, and mayor — I have never handed down a prouder title.',
        ] },
        { t: 'cheer' },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'narrate', lines: ['BUOY gave you The First Knot. Your hands know something new and very old.'] },
      ],
    },
  ],

  // -------------------------------------------------------------------- WICK
  wick: [
    {
      title: 'Grade Seven Amber',
      steps: [
        { t: 'prop', kind: 'ember', dx: 1.5, dz: -0.7 },
        { t: 'light', color: PALETTE_HEX.hff9d55, intensity: 2.8, dx: 1.2, dz: -0.6 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: -24, secs: 2.4 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Ah. Company on the rounds. The lamps will talk about this for days.',
          'You have noticed, perhaps, that I grade the dusks. Amber one through ten. It is not my scale. It was the night watchman\'s — Sergeant Cole. We walked this circuit together, he and I, every night for eleven years.',
        ] },
        { t: 'emote', kind: 'idea' },
        { t: 'say', lines: [
          'He carried the matches; I carried the height. He would squint at the sky and call the grade, and I would argue one point in either direction. That was the entire game. We never tired of it.',
        ] },
        { t: 'stinger' },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'say', lines: [
          'Tonight is a seven. Cole would say six. He would be wrong, and it would be delightful.',
        ] },
      ],
    },
    {
      title: 'The Borrowed Fire',
      steps: [
        { t: 'dim', amount: 0.26 },
        { t: 'prop', kind: 'ember', dx: -1.4, dz: -0.8 },
        { t: 'prop', kind: 'lantern', dx: 1.8, dz: 0.7 },
        { t: 'light', color: PALETTE_HEX.hff9d55, intensity: 3.0, dx: -1.0, dz: -0.6 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: 24, secs: 2.6 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'May I tell you how my flame was lit? It is a short story. I have made it last forty years.',
          'The night before the wagons, Cole took me to the last unlit lamp — the dock lamp, his favorite. He struck one match from his tin and lit my head from it directly. Hand to glass. Flame to flame.',
        ] },
        { t: 'npcFace', where: 'away' },
        { t: 'wait', secs: 1.4 },
        { t: 'say', lines: [
          '"Borrowed fire," he said. "Every light in this town is borrowed off some older one. Yours is off mine, and mine was off my mother\'s stove, and hers was off something older than the road."',
          '"So keep it moving, Wick. A borrowed thing you pass along was never a debt. It was an inheritance."',
        ] },
        { t: 'wait', secs: 1.6 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'mood', expr: 'idle', secs: 2 },
        { t: 'say', lines: [
          'My flame went out, the years I slept. I do not forgive myself that, quite. But you woke me, and the first lamp I lit after — I lit from the amber cell YOU carried.',
          'Which means the fire is moving again. Which means it was never lost. Merely... waiting in a different lender\'s hands.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2.5 },
      ],
    },
    {
      title: 'The Tin',
      steps: [
        { t: 'dim', amount: 0.6 },
        { t: 'prop', kind: 'ember', dx: 1.2, dz: -0.6 },
        { t: 'prop', kind: 'lantern', dx: -1.7, dz: 0.9 },
        { t: 'light', color: PALETTE_HEX.hff9a3c, intensity: 3.4, dx: 1.0, dz: -0.5 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: 26, secs: 3.0 },
        { t: 'faceOff' },
        { t: 'music', cue: 'hush' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'I have something of Cole\'s. He left his match tin on the dock lamp\'s ledge, the last morning. Deliberately, I believe. He was not a man who forgot things. He was a man who left them where they would be found.',
        ] },
        { t: 'narrate', lines: [
          'He opens a small door in his chest. A battered brass tin. Inside, a single match, kept dry through forty winters.',
        ] },
        { t: 'say', lines: [
          'One match left. For forty years I have kept it against the worst night — the night every lamp fails at once and the dark stops being polite.',
          'That night never came. I have lately understood why. The worst night already happened, friend. It was the one where everyone left. And the town survived it by keeping ONE flame going. Any one. It only ever takes one.',
        ] },
        { t: 'wait', secs: 1.5 },
        { t: 'stinger' },
        { t: 'say', lines: [
          'So the emergency match is yours now. Not for lamps. For whatever your worst night turns out to be — so you will know, holding it, that one light is always enough to start a town from.',
          'Cole would grade you a nine, by the way. I would argue ten. That is the entire game.',
        ] },
        { t: 'cheer' },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'narrate', lines: ['WICK gave you The Borrowed Fire. It rattles once in its tin, like a small applause.'] },
      ],
    },
  ],

  // -------------------------------------------------------------------- FERN
  fern: [
    {
      title: 'Bedside Manner',
      steps: [
        { t: 'prop', kind: 'lantern', dx: 1.7, dz: -0.8 },
        { t: 'light', color: PALETTE_HEX.hffd18a, intensity: 2.4, dx: 1.3, dz: -0.6 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.4, pitch: 33, azimuth: 22, secs: 1.8 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Sit, love, sit. The kettle\'s just come up to talking temperature.',
          'You know I was a doctor\'s kit once? Doctor Ansel Marsh. He rebuilt me from a samovar because, he said, half of medicine is tea, and the other half is somewhere to put your hands while you talk.',
        ] },
        { t: 'emote', kind: 'love' },
        { t: 'say', lines: [
          'House calls, love. Every one ended the same: kettle on, cups down, and Doctor Marsh saying "now then" — two words, and folk would hand him their whole hearts to hold.',
          'I brew for the town the way he doctored it. Nobody has ever been cured by chamomile. Everybody has been helped by it.',
        ] },
        { t: 'stinger' },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'say', lines: ['Now then. How are YOU, love? The first cup listens. All the cups listen.'] },
      ],
    },
    {
      title: 'The Recipe Book',
      steps: [
        { t: 'prop', kind: 'flowers', dx: -1.6, dz: 0.7 },
        { t: 'light', color: PALETTE_HEX.hffd18a, intensity: 2.4, dx: -1.1, dz: 0.4 },
        { t: 'orbit', degrees: -20, secs: 2.0 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.2, secs: 5.5, under: true },
        { t: 'say', lines: [
          'The morning of the wagons, Doctor Marsh did his rounds anyway. Every house. The whole town packing around him, and he\'s checking old Mrs. Petra\'s cough like the road could wait. It could not wait. He made it wait.',
        ] },
        { t: 'mood', expr: 'idle', secs: 1.5 },
        { t: 'say', lines: [
          'Last stop was me, in the surgery. He put his recipe book in my basket — forty years of remedies, his father\'s before him — and he wrote one final entry standing up, coat already on.',
          'Then he said "now then," to ME, love. The way he did to patients. And I understood I was being left behind on purpose. Somebody had to hold the remedies. Towns get sick coming back to life; he knew.',
        ] },
        { t: 'wait', secs: 1.6 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'I have brewed every page but the last one. The final entry. I have never had the ingredients. It calls for company, you see.',
          '...It is a joke, love. His last prescription, standing in his coat, was a joke with its arms open. "For loneliness: company, steeped. Forty years if needed."',
          'It needed thirty-nine and a bit. You were very nearly on time.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2.5 },
      ],
    },
    {
      title: 'The Last Entry',
      steps: [
        { t: 'dim', amount: 0.35 },
        { t: 'prop', kind: 'ember', dx: -1.4, dz: -1.0 },
        { t: 'light', color: PALETTE_HEX.hffbe78, intensity: 3.0, dx: -1.2, dz: -0.8 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: -26, secs: 2.6 },
        { t: 'faceOff' },
        { t: 'music', cue: 'hush' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Love. Tonight we brew the last page. Together — that\'s the recipe, so it can\'t be helped.',
        ] },
        { t: 'narrate', lines: [
          'She sets out two cups. Measures nothing. Warms the pot with the patience of a whole profession.',
        ] },
        { t: 'say', lines: [
          '"For loneliness: company, steeped." No leaf listed, love. Any leaf. The leaf was never the medicine.',
          'Doctor Marsh knew towns, and he knew tea, and he knew that a cure left FOR someone is a way of saying: you will make it long enough to need this. He believed I would. Forty years, love. He was right by a whisker.',
        ] },
        { t: 'wait', secs: 2 },
        { t: 'stinger' },
        { t: 'narrate', lines: ['You drink. It tastes like mint, mostly. It works, entirely.'] },
        { t: 'say', lines: [
          'The book goes to you, love. A town doctor\'s book belongs with whoever holds the town — and I have watched you hold it. Every bot, every bug, every bruised knee of a place, you hold the lot.',
          'Now then. That\'s the whole treatment. Refills forever.',
        ] },
        { t: 'cheer' },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'narrate', lines: ['FERN gave you The Last Entry. The kettle sings, on pitch for once.'] },
      ],
    },
  ],

  // ------------------------------------------------------------------- PLINK
  plink: [
    {
      title: 'The Commission',
      steps: [
        { t: 'prop', kind: 'lantern', dx: 1.8, dz: -0.9 },
        { t: 'light', color: PALETTE_HEX.hffd18a, intensity: 2.4, dx: 1.3, dz: -0.7 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.4, pitch: 33, azimuth: -22, secs: 1.8 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 7 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.4, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Mayor! You have excellent timing. I know because I measure everything, and yours is excellent. ♪',
          'Did you know the town commissioned me? Officially! One hundred gears from the centennial fund: "PLINK — a song for the town, to be premiered at the Founding Festival, all voices welcome."',
        ] },
        { t: 'emote', kind: 'music' },
        { t: 'say', lines: [
          'The choir was twelve children and one extremely confident dog. We rehearsed twice. The second time, four notes came out TOGETHER. Mayor, I have played forty years on the fuel of those four notes.',
        ] },
        { t: 'mood', expr: 'happy', secs: 2 },
        { t: 'stinger' },
        { t: 'say', lines: [
          'The festival was scheduled for the autumn. The wagons came in the summer. The song is still owed, is my point. I keep meticulous books on owed music. ♪',
        ] },
      ],
    },
    {
      title: 'Movement Two',
      steps: [
        { t: 'dim', amount: 0.2 },
        { t: 'prop', kind: 'lantern', dx: -1.7, dz: 0.6 },
        { t: 'light', color: PALETTE_HEX.hffc470, intensity: 2.6, dx: -1.1, dz: 0.4 },
        { t: 'orbit', degrees: 18, secs: 2.1 },
        { t: 'faceOff' },
        { t: 'focusNpc', dist: 6 },
        { t: 'npcFace', where: 'player' },
        { t: 'pushIn', dist: 5.2, secs: 5.5, under: true },
        { t: 'say', lines: [
          'Mayor, may I play you a secret? It is four notes long. Cover your ears if you are busy; it will still be here after. Secrets in music are very patient.',
        ] },
        { t: 'narrate', lines: [
          'He turns his own crank, slowly. Four notes, climbing — plain as a ladder, warm as a window.',
        ] },
        { t: 'say', lines: [
          'Those are the choir\'s notes. The four that came out together. Every movement of the town song is built on them — hidden in the bass, flipped in the middle voices, everywhere. The whole piece is twelve children and a dog, wearing a symphony.',
        ] },
        { t: 'mood', expr: 'idle', secs: 1.5 },
        { t: 'npcFace', where: 'away' },
        { t: 'say', lines: [
          'The day the wagons left, the choir came to the bandstand to say goodbye. I couldn\'t play — a barrel organ weeping is a health hazard, all that brine in the pipes.',
          'So little Odo, the smallest one, strikes the bandstand tuning fork and holds it up over his head. Concert A, ringing off eleven wagons. "So you don\'t lose our note," he says.',
        ] },
        { t: 'wait', secs: 1.5 },
        { t: 'stinger' },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: ['I never lost it, mayor. Forty years. The pipes drift, the weather argues, and the note stands. Some gifts are load-bearing. ♪'] },
        { t: 'mood', expr: 'happy', secs: 2 },
      ],
    },
    {
      title: 'The Premiere',
      steps: [
        { t: 'dim', amount: 0.45 },
        { t: 'prop', kind: 'lantern', dx: 2.0, dz: 0.8 },
        { t: 'prop', kind: 'lantern', dx: -2.0, dz: 0.8 },
        { t: 'light', color: PALETTE_HEX.hffc470, intensity: 3.4 },
        { t: 'dolly', dx: 0, dz: 0, dist: 8.0, pitch: 32, azimuth: 26, secs: 2.8 },
        { t: 'faceOff' },
        { t: 'music', cue: 'swell' },
        { t: 'focusNpc', dist: 6.5 },
        { t: 'npcFace', where: 'player' },
        { t: 'say', lines: [
          'Mayor. The books are settled. The town song is FINISHED. Forty years, six movements, one fermata the width of an era — done. Tonight is the premiere, audience of one, as commissioned: all voices welcome.',
          'You are all the voices. Congratulations on the appointment. ♪',
        ] },
        { t: 'wait', secs: 0.8 },
        { t: 'stinger' },
        { t: 'narrate', lines: [
          'He plays. Four plain notes, climbing — then the river\'s four-four under them, the crickets\' six-eight, a bell, a drawer, a kettle, a dog.',
          'It is not a sad song. It is a town, walking home by many roads at once.',
        ] },
        { t: 'wait', secs: 3 },
        { t: 'mood', expr: 'happy', secs: 3 },
        { t: 'say', lines: [
          'The last chord wants a hundred voices, and it will get them someday; songs are patient. Until then it resolves quietly, like this — you heard it. A town-sized ending, played small. ♪',
          'The tuning fork is yours now. Odo\'s note. Strike it anywhere in this valley and the whole piece knows where to stand.',
          'Premieres end, mayor. Notes don\'t. That\'s the entire trick of music, and towns. ♪',
        ] },
        { t: 'cheer' },
        { t: 'narrate', lines: ['PLINK gave you Concert A. Somewhere in the pipes, four notes agree.'] },
      ],
    },
  ],
};
