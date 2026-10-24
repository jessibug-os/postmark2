/**
 * All dialogue content. Organized per character; which block plays is decided
 * by the NPC handlers in Game.ts based on quest state. Idle pools are cycled
 * through so repeat chats stay fresh.
 */

export const INTRO = {
  wakeUp: [
    '...',
    'Cold ground. Pine needles. The smell of rain that fell on someone else.',
    'You remember an address. Yours, apparently: POSTMASTER, FRONTIER TOWN.',
    'You do not remember anything else.',
  ],
  findSparks: [
    'Something is sitting against the old signpost. Brass, round, patient.',
    'A plate on its chest reads: S.P.A.R.K.S. — Settlement Postal & Administrative Record-Keeping System.',
    'A slot above the plate is shaped exactly like the key in your coat pocket.',
  ],
  sparksWakes: [
    '*click* ... *whirr* ... re... re... REACTIVATION COMPLETE!',
    'Oh! Oh my goodness! A PERSON! An actual—! Ahem. Composure, SPARKS. Composure.',
    'Welcome to... well! To what will absolutely, definitely, once again BE a town!',
    'The others powered down when the people left. I stayed on half-charge, keeping the records. Someone had to.',
    'And now someone is here to receive them! You! The new postmaster! ...And mayor. We are short-staffed.',
    'May I register your name for the town charter?',
  ],
  afterName: (name: string) => [
    `${name.toUpperCase()}. Oh, that files BEAUTIFULLY.`,
    'Follow the path south, Mayor. The town square is waiting — it has been waiting a very long time.',
  ],
};

export const SPARKS = {
  quest0Start: [
    'Mayor! Your first day! I have prepared: one (1) bug net, one (1) fishing rod, and unreasonable optimism.',
    'The river still runs and the meadow still sings. Catch me one fish and one bug — proof the frontier provides!',
    'Oh — press [1] and [2] to ready your tools, [F] to use them. It is all in the town charter. I wrote it last night.',
  ],
  quest0Waiting: [
    'A fish from the river, a bug from the grass! The rod casts near water, the net swings where something skitters.',
    'Take your time! I have taken forty-three years of it and look how composed I am.',
  ],
  quest0Done: [
    'A fish AND a bug! Filed under: TOWN, PROOF IT CAN FEED ONE (1).',
    'Which brings me to the matter I have rehearsed for four decades: we need the Emporium back.',
    'Its keeper, REGGIE, powered down beside it when the last customer left. His amber cell is long dead.',
    'Fresh cells sleep under the star-marked earth — the old-towners buried caches everywhere. Take this shovel!',
    'Dig at a ★ mark, find a cell, and wake our shopkeeper. He is... you will see. He is a lot. I have missed him terribly.',
  ],
  quest1Waiting: [
    'Star-marked earth, Mayor! The ★ spots! The shovel does the rest.',
    'REGGIE is the sleeping unit by the ruined shopfront, east side of the square.',
  ],
  quest2Start: [
    'He is AWAKE? Oh, the noise the town will make again!',
    'But a shopkeeper needs a shop. The old Emporium needs 8 Timber and 6 Cut Stone.',
    'Take this axe — the standing dead trees are fair lumber. Stone comes up with the ★ digs.',
    'Deliver it all to the marked plot by REGGIE. I will file the permits. There is no one to file them to. I will file them anyway.',
  ],
  quest2Waiting: [
    '8 Timber, 6 Cut Stone, one Emporium! The dead grey trees fall to the axe — leave the living ones be.',
  ],
  quest3Nudge: [
    'With the Emporium open, I un-boarded the north gate to the forest. Air the place out!',
    'A caution: the forest keeps a resident. He never powered down. He is... thorough. And entirely nocturnal.',
    'If you go, go politely. And ideally after dark.',
  ],
  quest4Start: [
    'An Archive! A real Archive! Cataloger always deserved better than a tent of drawers.',
    'And listen — with the forest open, I found two more dormant units on the old registry: MARIGOLD, the gardener, and BUOY, the ferry-fisher.',
    'They are somewhere in the eastern meadow, past the bridge. I un-boarded that too. I have been extremely busy.',
  ],
  quest4Waiting: [
    'MARIGOLD and BUOY, eastern meadow, one amber cell each — then a cottage each, 6 Timber and 4 Cut Stone.',
    'A town is just people with roofs, Mayor. We are collecting both.',
  ],
  quest5Waiting: [
    'Nearly there, Mayor! Furniture on the green — REGGIE stocks it. Species in the Archive. And then...',
    'Then we hold the Founding Ceremony. I have had the speech drafted since before you were born. Probably.',
  ],
  ceremony: [
    'Then by the authority vested in me by... hm. By nobody at all. By US.',
    'I declare this town FOUNDED. Re-founded. Found again, after being very lost.',
    'The people left us once, Mayor. I kept the ledgers so that if anyone came back, the town would still know its own name.',
    'You came back. It knows its name. Listen — Reggie is playing something. Cataloger left his drawers open. The lamps are on.',
    'Welcome home, Postmaster. First order of business tomorrow: everything. I can hardly wait.',
  ],
  idle: [
    ['Filing, filing! Population: six! I write it in ink now. INK, Mayor!'],
    ['The postbox stands ready. One day, a letter will come. I have decided to believe this daily.'],
    ['REGGIE says my filing system "slaps". I have chosen to receive this as praise.'],
    ['Sunny or grey, the town square is the best square. I may be biased. I am definitely biased.'],
    ['Do visit Cataloger after dark — he pretends he prefers the specimens, but he counts your visits. There is a drawer for it.'],
  ],
};

export const REGGIE = {
  dormant: [
    'A heavy unit slumps against the ruined shopfront — half cash register, half jukebox, all silent.',
    'Its speaker grill is furred with moss. A dead amber cell sits behind a little brass door.',
  ],
  dormantWithCell: [
    'The brass door opens with a squeak. The dead cell crumbles out like a spent battery.',
    'Your amber cell clicks into the slot — and somewhere inside, a turntable starts to spin.',
  ],
  wake: [
    '*bzzzt* ...one two, one two... AYYYY, we LIVE!',
    'Yo yo yo — customer! First customer in forty years and she\'s got the WHOLE mayor drip. Respect.',
    'Name\'s REGGIE. Purveyor of goods, dropper of beats, keeper of the till. *cash drawer opens* KA-CHING! That\'s my laugh, don\'t trip.',
    'Real talk though... place got quiet. Quiet\'s the one track I never learned to spin.',
    'Get my shop standing and I\'ll get this town BUMPING again. Timber and stone, Mayor. Let\'s GO.',
  ],
  shopOpen: [
    'WELCOME to Reggie\'s Re-Emporium! Everything\'s vintage \'cause everything\'s OLD! *KA-CHING*',
  ],
  idle: [
    ['Buy somethin\' or just vibe, Mayor. The vibe is free. The lamps are not. *KA-CHING*'],
    ['SPARKS keeps "filing" my invoices. Little buddy\'s been holding this town together with paperclips and love.'],
    ['You hear the spider guy in the forest got a whole MUSEUM now? Drawers on drawers on drawers. Man\'s an icon.'],
    ['Back in the day this square was PACKED. ...Day\'s comin\' back around. I can hear the intro fading in.'],
    ['Fresh stock whenever you\'re ready. Sell me your scrap too — one bot\'s junk is my entire business model.'],
  ],
};

export const CATALOGER = {
  firstMeet: [
    '...specimen. Bipedal. Warm-blooded. Uncatalogued.',
    'Forgive me. It has been... some time... since a drawer was needed for your kind.',
    'The Archive persists. I persist. These facts have, until now, felt equivalent.',
    'You may call me Cataloger 734. The others called me... hm. There are no others.',
    'If you would prove the world still produces wonders: bring me three different specimens. Fish, insect, flora. Anything that lives.',
  ],
  donationProgress: (n: number) => [
    `${n} of 3 specimens received. Each one is... mm. Each one is a very good day.`,
  ],
  threeDonated: [
    'Three specimens. Three labels. Three proofs the world did not end — it merely paused.',
    'My drawers overflow, postmaster. A tent is no archive. I require walls. Shelves. A door that closes against the damp.',
    '10 Timber. 8 Cut Stone. One amber cell for the reading lamp. Deliver them to the clearing here, and I will build the rest with my own eight hands.',
    'I have six hands. The expression required eight. Bring the materials.',
  ],
  archiveOpen: [
    'The Archive stands. Come in out of the dark, postmaster — or into it. My hours are my hours.',
  ],
  idleDay: [
    ['*The cabinet-spider is folded beneath the eaves, lenses shuttered. A small sign hangs on him: RECHARGING. DO ENQUIRE AFTER DUSK.*'],
  ],
  idle: [
    ['Tonight I labelled a moth, a fern, and a doubt. Two of the three sit still for it.'],
    ['The lantern eels are rising after dark. The river keeps better archives than I do; it simply refuses to sort them.'],
    ['SPARKS visits on Thursdays to "audit" me. He counts my drawers. I let him. It makes us both feel governed.'],
    ['Bring me what you find. Everything deserves a label. Even the boot. ESPECIALLY the boot.'],
  ],
};

export const MARIGOLD = {
  dormant: [
    'A rotund boiler-bodied unit kneels in the overgrown garden rows, hands full of forty-year-old seeds.',
    'Her nameplate reads MARIGOLD. Her cell hatch is already open, as if she meant to be found.',
  ],
  wake: [
    '*pip* ...warm. Warm! Oh — the garden! Is it spring? It smells like every spring at once.',
    'I am MARIGOLD, dear. Horticulture and holding-things-gently. Both certified.',
    'I planted a promise here before I slept: that the beds would bloom again. Weeds keep promises too, it turns out.',
    'Build me a little roof, dear, and I will make this meadow embarrassing with flowers.',
  ],
  idle: [
    ['Every seed I put in went in on faith. Nobody was coming. I planted anyway. Turns out I was planting for you.'],
    ['You can tell a lot about a place by what grows in the cracks. This town grows chicory. Stubborn and blue. Suits it.'],
    ["I talk to them, you know. The plants. Forty years of one-sided conversation. You're a considerable upgrade."],
    ["Mind the beds by the well — those are the old ones. Somebody human put those in. I've only ever kept them going."],
    ["There's a rose against the south wall that shouldn't have survived the cold. It did. I've stopped asking it how."],
    ["If you ever want cuttings, just ask. I've more than I can plant and nowhere near enough people to give them to."],
    ['The chicory came back on its own, you know. Forty years untended. Some things simply refuse.'],
    ['Ember berries by the treeline, dear — warm as fresh bread. Take some to that skinny librarian; he forgets to be delighted.'],
    ['I water BUOY\'s dock plants when the silly thing is out drifting. Don\'t tell him. He thinks it\'s rain.'],
  ],
};

export const BUOY = {
  dormant: [
    'Down by the water sits a barrel-round unit shaped like a bathysphere, a fishing line still tied to one finger.',
    'The line runs into the river. Whatever took the bait got a forty-year head start.',
  ],
  wake: [
    '*glub* ...tide\'s in! Tide\'s in and so am I! BUOY, at your service — ferryman, fisherman, professional float.',
    'Last thing I remember, I had a BITE on the line. Tell me honestly, mayor: did I catch it?',
    '...Forty years. That fish has grandchildren laughing at me. Excellent. A rivalry. A DYNASTY of a rivalry.',
    'Put a roof over my barrel and I\'ll teach this town everything the river ever told me.',
  ],
  idle: [
    ["River's got one job and it does it without complainin'. I respect that more than I can say."],
    ["Used to be a ferry here. Used to be folk needin' ferryin'. Now it's just me and a very well-maintained boat."],
    ["Caught somethin' this mornin' I've no name for. Took it to the spider fella. He had three names for it."],
    ["Tide comes in, tide goes out. Forty years of that. It's not borin'. People think it's borin'."],
    ["You can hear the ocean from the square if it's quiet enough. Most nights it's quiet enough."],
    ["I keep the lamp on the dock lit. Nobody's comin' in off that water. Keep it lit anyway."],
    ['The big one\'s still down there. Clockwork koi. I hear it ticking on quiet nights. It hears me rusting. We\'re even.'],
    ['Cast where the shadow\'s biggest, strike when the bobber sinks — not when it wobbles. The wobble is the fish LAUGHING.'],
    ['MARIGOLD swears it rains on my dock plants every day at noon. Precise weather we have here. Very precise.'],
  ],
};

export const WICK = {
  dormant: [
    'A tall, reed-thin unit leans against the lamppost like he was mid-conversation with it.',
    'His head is a hurricane lamp, long gone out. A brass lighting-pole is still tucked under one arm.',
  ],
  wake: [
    '*fsss* ...ah. There I am. And there... you are. Good evening. Or morning. I light either way.',
    'WICK. Lamplighter, first class. I keep the dark polite.',
    'Forty years unlit. The lamps must think I abandoned them. Lamps hold grudges, you know. Quiet ones.',
    'I work dusk to dawn, if it please the mayor. Someone must walk the town while it dreams.',
  ],
  idle: [
    ['Forty-one lamps. I know every one by its sound when it catches. Number twelve sighs.'],
    ["The dark's not empty, Mayor. It's just got fewer things in it, and they're all better company."],
    ["I light them in the same order every night. Not because it's efficient. Because it's mine."],
    ["You'll not see me much by day. That's not rudeness, that's chemistry. Solar in reverse, more or less."],
    ['Somebody built me to keep the lights on for people walking home. I never got to see anyone walk home. Till now.'],
    ["There's a lamp out past the orchard nobody needs. I light it anyway. In case."],
    ['Every lamp lit is a letter to whoever is out late, saying: you were expected.'],
    ['The Cataloger and I keep the same hours. We nod across the dark. It is a whole friendship.'],
    ['Dusk tonight was amber grade seven. Exceptional. I graded it. Somebody has to.'],
  ],
};

export const FERN = {
  dormant: [
    'A rounded copper unit sits in the ferns — a teapot the size of a stove, moss on her lid.',
    'Her basket has sprouted. Whatever she was gathering, the forest finished the job.',
  ],
  wake: [
    '*tink* ...oh, my. The kettle\'s cold. The kettle has been cold a WHILE, hasn\'t it.',
    'FERN, dear. Herbalist. Tea, tinctures, and telling weeds from wonders.',
    'The forest kept growing while I napped — bless it, it never needs supervising, only appreciating.',
    'Come by whenever your bones are tired, mayor. The first cup is free. All the cups are free. I never worked out billing.',
  ],
  idle: [
    ["There's a chair by my window with your name on it. Not literally. I could arrange literally."],
    ['I kept the kettle on for forty years, Mayor. Forty years. Nobody came. I never once thought of turning it off.'],
    ["You look like you've been walking all day. Sit down. No, properly sit down."],
    ["The trick to a good afternoon is having nowhere else to be. I'm extremely good at afternoons."],
    ["Marigold brings me flowers I've no vase for. I've started using teapots. It's working out."],
    ["If you're ever having a bad one, you don't have to say so. Just come by. That's the whole system."],
    ['Tinman mushrooms under the north pines, ember berries by the treeline. The forest sets a generous table.'],
    ['I offered Cataloger 734 a chamomile blend. He labelled it. Drawer 88: "kindness, steeped."'],
    ['MARIGOLD grows them and I brew them. Between us we very nearly make one competent garden.'],
  ],
};

export const PLINK = {
  dormant: [
    'A barrel organ on brass boots sits in the meadow grass, crank frozen mid-turn.',
    'Wind moves through its pipes and almost — almost — makes a chord.',
  ],
  wake: [
    '*hhhRRMM* ...and a one, and a two — wait. Wait wait wait. How long was that rest?',
    'FORTY YEARS?! That is the longest fermata in recorded music. I\'m putting it in the piece.',
    'PLINK! Composer, busker, barrel organ about town. I was writing the town a song when everything went quiet.',
    'It\'s still not finished. Good songs wait. Come find me when the wind\'s up — movement two has a wind part.',
  ],
  idle: [
    ["Music's just arithmetic that decided to be kind about it. I've never got over that."],
    ['I played to an empty square for four decades. The acoustics were superb. The reviews were sparse.'],
    ["Reggie says I'm 'classically trained'. I'm not trained at all. I just haven't stopped."],
    ["There's a piece I only play when it rains. I'll not tell you which. You'll know it when it comes."],
    ["The organ's gone half a step flat over the years. So have I. We match."],
    ["I don't remember who wrote the pieces I know. I remember every room I've played them in. That seems the right way round."],
    ['REGGIE spins the old records; I write the new ones. We are, technically, this town\'s entire music scene. ♪'],
    ['Movement three needs a sound like a bell but braver. I have been auditioning the fence posts.'],
    ['The river is in four-four. The crickets are in six-eight. The town swings anyway. ♪'],
  ],
};

/** Deterministic idle-line rotation: pass any counter (e.g. talk count). */
export function pickIdle(pool: string[][], counter: number): string[] {
  return pool[counter % pool.length];
}

/** Per-character Animalese voice profiles (keyed by displayName). */
export interface VoiceProfile {
  base: number;
  type: OscillatorType;
  wobble: number;
  vol?: number;
}
export const VOICES: Record<string, VoiceProfile> = {
  SPARKS: { base: 620, type: 'square', wobble: 1.2, vol: 0.05 }, // bright, chirpy, anxious
  REGGIE: { base: 300, type: 'sawtooth', wobble: 0.6, vol: 0.06 }, // low, funky, swaggery
  'CATALOGER 734': { base: 400, type: 'sine', wobble: 0.3, vol: 0.045 }, // measured, dry
  MARIGOLD: { base: 460, type: 'triangle', wobble: 0.9, vol: 0.05 }, // warm, motherly
  BUOY: { base: 340, type: 'triangle', wobble: 1.4, vol: 0.06 }, // bubbly, buoyant
  WICK: { base: 380, type: 'sine', wobble: 0.4, vol: 0.045 }, // soft, gentle
  FERN: { base: 500, type: 'triangle', wobble: 0.7, vol: 0.05 }, // kind, cozy
  PLINK: { base: 560, type: 'square', wobble: 1.6, vol: 0.05 }, // musical, playful
};

// ---------------------------------------------------------------------------
// Context-aware idle chatter: what a villager says depends on the hour, the
// day of the week, where you found them, and how far the town has come.
// A daily player should go a week without hearing a repeat.

import type { Season } from '../systems/Calendar';
import type { WeatherKind } from '../world/Weather';
import {
  BUOY_VOLUME,
  CATALOGER_VOLUME,
  FERN_VOLUME,
  MARIGOLD_VOLUME,
  PLINK_VOLUME,
  REGGIE_VOLUME,
  SPARKS_VOLUME,
  WICK_VOLUME,
} from './dialogueVolume';

export interface IdleCtx {
  phase: 'dawn' | 'day' | 'dusk' | 'night';
  /** 0 = Sunday ... 6 = Saturday. */
  day: number;
  zone: 'town' | 'forest' | 'meadow' | 'beach';
  /** Main-quest progress, 0..5; 6 = story done. */
  questIndex: number;
  /** Friendship tier (0 until hearts arrive; the pools are ready for it). */
  friendship: number;
  talkCount: number;
  season: Season;
  weather: WeatherKind;
  /** True on a festival day — everyone has something to say about it. */
  festival?: boolean;
  /** True on this villager's own birthday. */
  birthday?: boolean;
  /** Most recent substantial thing the mayor actually did this session. */
  recentAction?: RecentAction;
}

export type RecentAction =
  | 'fishing'
  | 'catching'
  | 'digging'
  | 'chopping'
  | 'gifting'
  | 'donating'
  | 'building';

export interface CtxPools {
  /** One line-set per weekday, Sunday first — the daily-fresh guarantee. */
  weekdays: string[][];
  dawn?: string[][];
  day?: string[][];
  dusk?: string[][];
  night?: string[][];
  zones?: Partial<Record<IdleCtx['zone'], string[][]>>;
  /** Early town (main quest not yet at the Archive). */
  early?: string[][];
  /** After the Founding Ceremony. */
  late?: string[][];
  /** Evergreen fallback. */
  any: string[][];
  /** Larger authored pool used after the sharper context openers. Every string
   * is hand-written copy; C1 counts source lines, not generated combinations. */
  extra?: string[][];
  /** Unlocked at five hearts — permanently changed, warmer dialogue. */
  bonded?: string[][];
  seasons?: Partial<Record<Season, string[][]>>;
  /** Keyed by weather; 'clear' is deliberately unused (that is just the day). */
  weather?: Partial<Record<Exclude<WeatherKind, 'clear'>, string[][]>>;
  festival?: string[][];
  birthday?: string[][];
  /** Immediate acknowledgement of what the player has just been doing. */
  recent?: Partial<Record<RecentAction, string[][]>>;
}

export function pickContextIdle(pools: CtxPools, ctx: IdleCtx): string[] {
  const candidates: string[][] = [];
  // Occasions come first: a villager who ignores their own birthday, or the
  // festival happening around them, breaks the illusion faster than a repeat.
  if (ctx.birthday && pools.birthday) candidates.push(...pools.birthday);
  if (ctx.festival && pools.festival) candidates.push(...pools.festival);
  const recentPool = ctx.recentAction ? pools.recent?.[ctx.recentAction] : undefined;
  // A recent-action acknowledgement is a one-shot conversational opener in
  // Game, so guarantee it is actually heard instead of burying it at an
  // arbitrary talkCount offset. Calendar occasions remain higher priority.
  if (recentPool && !ctx.birthday && !ctx.festival) {
    return recentPool[ctx.talkCount % recentPool.length];
  }
  if (ctx.weather !== 'clear') {
    const weatherPool = pools.weather?.[ctx.weather as Exclude<WeatherKind, 'clear'>];
    if (weatherPool) candidates.push(...weatherPool);
  }
  // Bonded villagers (5 hearts) lead with their warmest lines.
  if (ctx.friendship >= 5 && pools.bonded) candidates.push(...pools.bonded);
  const weekday = pools.weekdays[ctx.day % pools.weekdays.length];
  if (weekday) candidates.push(weekday);
  const seasonPool = pools.seasons?.[ctx.season];
  if (seasonPool) candidates.push(...seasonPool);
  const phasePool = pools[ctx.phase];
  if (phasePool) candidates.push(...phasePool);
  const zonePool = pools.zones?.[ctx.zone];
  if (zonePool) candidates.push(...zonePool);
  if (ctx.questIndex <= 2 && pools.early) candidates.push(...pools.early);
  if (ctx.questIndex >= 6 && pools.late) candidates.push(...pools.late);
  if (pools.extra) candidates.push(...pools.extra);
  candidates.push(...pools.any);
  // First talk of the day leads with the occasion/weekday line; later talks
  // rotate deterministically so a chatty player still works down the list.
  return candidates[ctx.talkCount % candidates.length];
}

/** Count actual authored dialogue lines in a context pool. Context permutations
 * that select the same sentence do not inflate this number. */
export function countAuthoredContextLines(pools: CtxPools): number {
  const seen = new Set<string>();
  const add = (groups: string[][] | undefined): void => {
    for (const conversation of groups ?? []) {
      for (const line of conversation) seen.add(line);
    }
  };
  add(pools.weekdays);
  add(pools.dawn);
  add(pools.day);
  add(pools.dusk);
  add(pools.night);
  for (const groups of Object.values(pools.zones ?? {})) add(groups);
  add(pools.early);
  add(pools.late);
  add(pools.any);
  add(pools.extra);
  add(pools.bonded);
  for (const groups of Object.values(pools.seasons ?? {})) add(groups);
  for (const groups of Object.values(pools.weather ?? {})) add(groups);
  add(pools.festival);
  add(pools.birthday);
  for (const groups of Object.values(pools.recent ?? {})) add(groups);
  return seen.size;
}

export const SPARKS_CTX: CtxPools = {
  extra: SPARKS_VOLUME,
  recent: {
    fishing: [['Your sleeves are river-damp, Mayor! Catch entered provisionally under: FINNY, IMPRESSIVE.']],
    catching: [['Net fibers on your shoulder! I shall notify the bug census that its numbers have changed.']],
    digging: [['Fresh soil on your boots. Another star mark processed with exemplary shovel compliance!']],
    chopping: [['Sawdust! Thank you for leaving the living trees standing and persuading the dead ones into civic service.']],
    gifting: [['You have that just-gave-something-away look. The generosity ledger balances itself, but I record it anyway.']],
    donating: [['Cataloger’s lamp is brighter after a donation. Not electrically—somehow administratively.']],
    building: [['I heard hammers! Every new roof changes the town map and, Mayor, I LOVE revising the town map.']],
  },
  seasons: {
    spring: [['Spring! The ledger flips to a fresh quarter and I get to write a new heading. I have practised the heading.']],
    summer: [['Summer. Long days, which means long OFFICE HOURS. I have extended mine to all of them.']],
    autumn: [['Autumn. The old-towners filed their harvest returns this month. I still rule the columns. Habit is a kind of monument.']],
    winter: [['Winter, Mayor. Fewer visitors, more filing. And the snow makes the postbox look very smart.']],
  },
  weather: {
    rain: [['Rain! Excellent for the meadow, ruinous for paperwork. I have moved the important drawers twice.']],
    snow: [['Snow on the square. I swept it. It came back. I have decided this is a collaboration, not a defeat.']],
    fog: [['Fog like this, you can only see as far as the next lamp. Rather like running a town, when you think about it.']],
  },
  festival: [['A FESTIVAL DAY, Mayor! I have the forms, the bunting, and a speech I will absolutely be reading aloud whether or not anyone stays.']],
  birthday: [['It is my activation day. Forty-one years. I do not require a fuss. I have, however, dusted the whole square, just in case there is one.']],
  weekdays: [
    ['Sunday. The old charter lists it as a REST day. I have filed a formal objection every Sunday for forty years. The streak lives.'],
    ['Monday! The whole week, blank as a fresh ledger page. I get shivers, Mayor. Administrative shivers.'],
    ['Tuesday is stamp-inventory day. Current inventory: one (1) stamp, ceremonial, guarded jealously. Attendance: perfect.'],
    ['On Wednesdays I inspect the bridge. The bridge has never once failed inspection. We have a rapport.'],
    ['Thursday! Audit day at the Archive tonight. Cataloger pretends to dread it. He sets out a chair for me.'],
    ['Friday. The old-towners used to post their weekend plans on the board. I still leave space for them. Force of habit. Or hope. One of those.'],
    ['SATURDAY! Reggie plays the square in the afternoon. Official noise complaint count, forty years running: zero. I checked.'],
  ],
  dawn: [
    ['Up with the sun, Mayor! The dew files itself on every blade of grass and NOBODY praises it. I praise it.'],
    ['Morning light on the postbox. Every dawn I think: today a letter might come. It is a very durable thought.'],
  ],
  day: [['Midday report: gears turning, river running, no emergencies. I keep a drawer for emergencies. It is my emptiest drawer, and my favorite.']],
  dusk: [['The lamps will be up soon. When Wick walks his rounds it looks like the town is being tucked in, one light at a time.']],
  night: [['You should be resting, Mayor! Although — between us — the town is prettiest right now. Do not file that. It is off the record.']],
  zones: {
    beach: [['The tide brings in the oddest paperwork — shells, driftwood, once an entire boot. The ocean has no filing system whatsoever.']],
    forest: [['Mind the mushrooms, Mayor. Cataloger has them all labelled IN SITU and he notices when one is stepped on.']],
    meadow: [['The orchard rows were planted by hand, you know. Human hands. I hold their spacing to be sacred. Fourteen feet, trunk to trunk.']],
  },
  early: [['It is a small town still, Mayor. But small is a size that things GROW from. I have seen it happen to paperwork.']],
  late: [
    ['Population six, plus one warm-blooded mayor. I re-count every morning. It keeps coming out wonderful.'],
    ['Founding Day is filed under PERMANENT. I check the drawer daily to make sure it stays put.'],
  ],
  any: SPARKS.idle,
  bonded: [
    ['Mayor! I filed the last page, and do you know — the PENDING drawer echoes now. I have started keeping biscuits in it. Progress.'],
    ['Seat reserved, Mayor. It always will be. I simply mean the bench by the well, now. I saved you the sunny end.'],
  ],
};

export const REGGIE_CTX: CtxPools = {
  extra: REGGIE_VOLUME,
  recent: {
    fishing: [["River water on the coat. Fresh catch? That's inventory that fights back—respect."]],
    catching: [["Net over the shoulder, victory in the pocket. Mayor running the meadow's smallest acquisition department."]],
    digging: [["You been digging. I can tell by the boots and the look of somebody who just opened earth's bargain bin."]],
    chopping: [["Sawdust drip today, huh? Raw timber now, premium rustic furniture later. That's the pipeline."]],
    gifting: [["Saw you hand somebody a gift. Zero markup, all value. Even I can't improve that transaction."]],
    donating: [["Archive run? You gave away a one-of-a-kind so everybody could see it. Public retail, no till. Big move."]],
    building: [["Heard that build hammer from here. New square footage means new places needing lamps—I got stock."]],
  },
  seasons: {
    spring: [['Spring stock just landed, Mayor. Everything smells like rain and possibility. Mostly rain. *KA-CHING*']],
    summer: [['Summer trade! Doors open, speaker out front, sun doing the marketing for me. Best season, no notes.']],
    autumn: [['Autumn hits different. Something about the light makes even my sales pitch sound sincere.']],
    winter: [["Cold snap means folks come inside and stay a while. Slow season for sales, best season for talkin'."]],
  },
  weather: {
    rain: [["Rain on a tin roof, Mayor. That's a beat. I ain't gotta do nothin' today, the sky's got it covered."]],
    snow: [["Snow means nobody's shoppin'. Snow also means nobody's rushin'. I'll take the trade."]],
    fog: [["Can't see the well from here. Feels like the whole world's just this shop and whoever walks in. Kinda nice, kinda not."]],
  },
  festival: [["FESTIVAL DAY! I got the speaker out, I got the levels set, I got ONE crowd member. You're the crowd, Mayor. Do NOT let me down."]],
  birthday: [["Ayy, it's my day. Nobody's sung to me in forty years. ...You ain't gotta. I'm just sayin' the mic's right there."]],
  weekdays: [
    ['Sunday slow-jam day. Shop\'s open but the tempo is HORIZONTAL. *slow ka-ching*'],
    ['Monday. Restock day. Everything old is new again \'cause I dusted it. That\'s retail, baby.'],
    ['Taco Tuesday! ...We don\'t got tacos. We got the CONCEPT. Concept\'s free with purchase.'],
    ['Wednesday\'s when SPARKS audits my till. Little dude finds a discrepancy, I find a discrepancy, we split the difference. It\'s church.'],
    ['Thursday. Crate-digging day. Found a record labeled "RAIN, SIDE B". Whole town used to press their own. Imagine.'],
    ['FRIDAY! Payday! For who? Details. The ENERGY is payday.'],
    ['SATURDAY, BABY! DJ set on the square this afternoon. Forty years of setlist backed up in here. Bring your ears.'],
  ],
  dawn: [['*yawwwn-CHING* Early bird gets first pick of the stock. Early bird is currently YOU. Congrats, bird.']],
  day: [['Prime retail hours, Mayor. Watch the master work. *sells nothing for several hours, confidently*']],
  dusk: [['Golden hour on the shopfront. Old man sun doing my awning ALL the favors. Shoulda charged him rent.']],
  night: [['Shop\'s shut but the man is ON. Night air\'s got the best acoustics. True fact. Reggie fact.']],
  zones: {
    beach: [['Beach day! Sand in the drawer, don\'t care. KA-CHING sounds better with reverb off the water anyway.']],
    meadow: [['Out here where the produce at! Marigold\'s the real vendor in this town, I just got better patter.']],
  },
  early: [['Town\'s quiet now but I remember it LOUD. We gettin\' it back, Mayor. Track by track.']],
  late: [
    ['Six bots, one mayor, one functioning economy. That\'s not a town, that\'s a MOVEMENT.'],
    ['Ceremony night? Best crowd I ever played. Don\'t tell the old crowds. ...Nah, tell \'em. They\'d be happy.'],
  ],
  any: REGGIE.idle,
  bonded: [
    ['Yo. Played Side A again this morning. Then I opened the doors and the square just... continued the track. Realest crossfade of my career.'],
    ['You know you got a standing discount, right? Friends-and-family. You\'re both. *ka-ching, but soft*'],
  ],
};

export const CATALOGER_CTX: CtxPools = {
  extra: CATALOGER_VOLUME,
  recent: {
    fishing: [['You have recently handled a fish. Scale on the cuff, water at the hem, satisfaction poorly concealed.']],
    catching: [['A successful net sweep leaves grass pollen in a distinctive arc. Yours is textbook.']],
    digging: [['Soil under the nails and an object-shaped gap in your satchel. The ground disclosed something.']],
    chopping: [['Fresh wood dust. Deadfall timber, I trust; the live-tree census remains delicately balanced.']],
    gifting: [['You transferred an object without compensation. Classification: gift. Secondary effect: observable warmth.']],
    donating: [['A new drawer closed moments ago. I can still hear the collection adjusting around your contribution.']],
    building: [['Construction dust travels farther than expected. So does purpose. The new structure has altered both maps.']],
  },
  seasons: {
    spring: [['Spring. Drawer intake triples. I have not slept — though of course I never do — and I have never been happier about it.']],
    summer: [['Summer nights are the richest. Everything that flies is out, and all of it wants my lamp.']],
    autumn: [['Autumn. The forest changes its mind all at once and I must re-label a third of the collection. I resent it entirely. I look forward to it all year.']],
    winter: [['Winter. Almost nothing moves. I use the quiet to re-read my own notes and correct the man I was in 2004.']],
  },
  weather: {
    rain: [['Rain drives the specimens down into the leaf litter. Poor conditions for collecting. Excellent conditions for thinking.']],
    snow: [['Snow. The forest goes to a single colour and every track written on it is legible. It is the most honest month.']],
    fog: [['Fog scatters my lamp into a sphere. For a few hours the Archive appears to be floating. I permit myself to enjoy it.']],
  },
  festival: [['A festival. I shall attend. I shall stand at the edge, hold something in a cup, and log the attendance in the morning. That is how I attend things.']],
  birthday: [['My commissioning date. I have never marked it. ...You knew it. That is a datum I did not give you. I find I do not mind.']],
  weekdays: [
    ['Sunday. I re-shelve. Everything drifts one drawer left over a week — entropy, or Sparks "helping". Tonight I put the world back.'],
    ['Monday. Moth census. They gather at Wick\'s lamps, which makes him, taxonomically speaking, my finest field instrument.'],
    ['Tuesday. I sharpen the labels. A dull label is a small dishonesty.'],
    ['Wednesday. Inventory of doubts. Drawer 90 is nearly full again. I file them so they do not file me.'],
    ['Thursday. Sparks audits tonight. He will count my drawers and miscount by one, as he has for forty years. I will not correct him. It is tradition.'],
    ['Friday. The river hatch rises after dusk. I attend. The mayflies do not know they are a calendar. It is better that way.'],
    ['Saturday. The busker plays and the moths prefer his lamplight to mine. I have recorded this under: rivalry, gentle.'],
  ],
  night: [
    ['The dark is not empty, postmaster. It is simply unlabelled. I am working on it.'],
    ['You keep late hours for a warm-blooded specimen. Noted. Approved. There is a drawer for your visits; it is nearly full.'],
  ],
  day: [['*He is folded beneath the eaves, lenses shuttered. A sign reads: RECHARGING. DO ENQUIRE AFTER DUSK.*']],
  dusk: [['Rising, rising. The sun files itself away and my shift begins. The handover is my favorite hour — both shifts pretending not to look at each other.']],
  dawn: [['To bed, to bed. The dawn chorus is deafening if one has spent forty years listening for footsteps.']],
  zones: {
    forest: [['Step where the moss is thickest; it complains least. The mushrooms are IN SITU and I know their coordinates by heart.']],
    beach: [['Salt. Ruinous for brass, magnificent for specimens. The tide pools are drawers that reshuffle themselves twice daily.']],
  },
  early: [['A tent, six drawers, and one visitor. When I powered on each dusk, I confess I did not always see the point. Lately the point visits on foot.']],
  late: [
    ['The Archive has a door now, and the door has a latch, and the latch has never once been needed. I built it anyway. Standards.'],
    ['Seventy-one drawers, one town, zero vacancies of purpose. File that under: good, unqualified.'],
  ],
  any: CATALOGER.idle,
  bonded: [
    ['You carry her field glass on your rounds. I notice. I notice everything; it is the job. But that one I notice off the clock.'],
    ['Drawer 1 stands empty now, postmaster. I have decided it is not empty. It is READY. There is a difference of one visitor.'],
  ],
};

export const MARIGOLD_CTX: CtxPools = {
  extra: MARIGOLD_VOLUME,
  recent: {
    fishing: [["River on your cuffs, dear. Put the catch somewhere cool and yourself somewhere warm."]],
    catching: [["You’ve been in the meadow with that net. Mind you open the jar now and then; little wings need weather."]],
    digging: [["Good soil on those boots. Whatever came up, remember to put a little kindness back in the hole."]],
    chopping: [["You smell of clean-cut timber, dear. Dead tree becoming shelter—that’s a respectable second life."]],
    gifting: [["I saw that gift leave your hands. Things given freely seem to weigh less and mean more."]],
    donating: [["Off to the Archive, were you? A wonder shared grows roots in everyone who sees it."]],
    building: [["Hammering carries clear across the beds. Every new roof gives the rain somewhere friendly to land."]],
  },
  seasons: {
    spring: [['Spring! Everything I put in the ground last autumn is calling in its debts. Busy, busy, wonderful.']],
    summer: [["Summer's the easy part, honestly. The garden mostly runs itself and I just walk about looking proud."]],
    autumn: [["Autumn's for putting things away. Bulbs down, beds mulched, promises made for a spring I have to trust will come."]],
    winter: [["Winter garden's not dead, it's just holding its breath. Everyone forgets that. I never do."]],
  },
  weather: {
    rain: [["Rain! Oh, let it come down. I've not had to carry a can all day and the beds are drinking it up."]],
    snow: [["Snow's a blanket, not a burden. Everything underneath is perfectly fine. I check. Constantly. But it is."]],
    fog: [["Fog beads on every leaf like the garden's been set with tiny glass. Worth getting up for."]],
  },
  festival: [["Festival day! I've cut flowers for the square since before dawn. Don't tell me it's too much. It is exactly enough."]],
  birthday: [["It's my day, apparently. Sparks keeps a list. I'd forgotten mine was on it — and then he reminded me, and I had to go and be busy in the shed for a minute."]],
  weekdays: [
    ['Sunday, dear. Even the weeds rest. I sit with the orchard and we say nothing together. Loveliest conversation of the week.'],
    ['Monday: turning the beds. The soil holds forty years of leaf-fall, dear. It is RICH. The old-towners would weep to plant in it.'],
    ['Tuesday is for the roses that are not roses. Ember berries, chicory, the stubborn lot. I count every one.'],
    ['Wednesday I prune. The trees flinch, then thank me. Everything worth growing needs one honest cut a week.'],
    ['Thursday: seed inventory. I still have packets with handwriting on them. "For spring. — E." I plant a pinch of E\'s every year.'],
    ['Friday, dear! I set flowers on the notice board for the weekend. Someone should be expecting company. Might as well be everyone.'],
    ['Saturday! Reggie plays and the blooms face the square. Phototropism, he says. Fandom, say I.'],
  ],
  dawn: [['Dew on the boiler this morning, dear. I let it sit. The garden waters ME on occasion; it is only fair.']],
  day: [['Feel that sun! My boiler\'s warm as a loaf. Come stand by me if the wind bites, dear — heat\'s the one crop I never run short of.']],
  dusk: [['The flowers close up shop so politely at dusk. No KA-CHING at all. Don\'t tell Reggie; he\'d take it as competition.']],
  night: [['Up late, dear? The night-scented stock only opens now. Flowers keep hours too — some of us simply prefer the quiet clientele.']],
  zones: {
    town: [['I\'m thinking window boxes for every sill in the square, dear. A town should look like someone loves it FROM THE STREET.']],
    forest: [['The forest garden needs no gardener, dear. I visit strictly to admire. And to steal cuttings. Admire-and-steal.']],
    beach: [['Sea kale, dear! Growing wild in the shingle like it pays rent. Nature beat me to the beach bed.']],
  },
  early: [['The meadow remembers being a garden, dear. Give us a season, the pair of us, and you shall see.']],
  late: [['A whole town blooming, dear. I promised the beds they\'d see it. Keeping a promise forty years late still counts. It may count DOUBLE.']],
  any: MARIGOLD.idle,
  bonded: [
    ['There you are, dear. I walked the rows arms-out this morning and wobbled properly for the first time in forty years. It\'s your fault. Thank you.'],
    ['When we plant the last half-pinch, dear, I\'ve decided where: by your door. E. always said flowers belong where the knocking happens.'],
  ],
};

export const BUOY_CTX: CtxPools = {
  extra: BUOY_VOLUME,
  recent: {
    fishing: [["That’s river shine on you. Good cast, good catch, and I bet the one that escaped was magnificent."]],
    catching: [["Netting meadow critters now? Different current, same trick: watch, wait, move once."]],
    digging: [["Mud on deck—well, boots. Riverbanks and star spots both pay the patient."]],
    chopping: [["Heard the axe carry over water. Dead timber makes fine docks when treated kindly."]],
    gifting: [["Gave something away, did you? Best cargo is the kind that arrives lighter than it left."]],
    donating: [["Archive delivery. Good. A catch behind glass still swims through a hundred conversations."]],
    building: [["Those hammers shook ripples off the bank. Sounds like the town’s growing another safe harbor."]],
  },
  seasons: {
    spring: [["Spring run's on. Whole river's got somewhere to be. I just sit and let it go past me. Peak spring, that."]],
    summer: [["Summer, and the sea's warm enough that even I'd get in. I won't. But I could."]],
    autumn: [["Autumn tides run strange. Everything's headed home. Bit much, some days, watching that."]],
    winter: [["Winter sea's got no manners at all. Best fishing of the year, mind. Costs you your fingers."]],
  },
  weather: {
    rain: [["Rain on the water. That's just the sea gettin' a letter from the sky. Best sound there is."]],
    snow: [["Snow on the beach. Two things that shouldn't be in the same room, and there they are, gettin' on fine."]],
    fog: [["Fog's the ocean's way of askin' for privacy. I usually give it. Today I didn't."]],
  },
  festival: [["Festival, aye. I'll come up for it. Won't dance. Might hum. Don't make it a thing, Mayor."]],
  birthday: [["It's my day, is it. Huh. Been a long time since anybody had cause to know that. ...Thanks for knowin' it."]],
  weekdays: [
    ['Sunday. No fishing. Me and the river just look at each other. It blinks first. Every time.'],
    ['Monday: line maintenance. Forty-year-old knots, mayor. They held. Whoever taught me knots, their hands are still holding things.'],
    ['Tuesday I fish the pond. The pond fish are soft city fish. Don\'t tell the river I said it — they\'re ALL the river\'s cousins.'],
    ['Wednesday\'s for the dock boards. I know every creak by name. Third one\'s called Gerald. Gerald\'s getting worse.'],
    ['Thursday: deep water day. The clockwork koi and I have a standing appointment. Forty years running, both parties present, no catch recorded.'],
    ['Friday! I count the shells up the beach. Tide leaves a different sum daily. Sloppy bookkeeping. Beautiful, sloppy bookkeeping.'],
    ['Saturday. Reggie plays, fish rise to listen. Best fishing hour of the week and I don\'t cast. Some things you don\'t interrupt.'],
  ],
  dawn: [['Dawn tide, mayor. The river runs polished pewter. If I ever say something poetic, it\'s the water talking through me.']],
  day: [['Good sun, good shadows. See a big one under the surface, cast PAST it and bring the bait home slow. Fish trust a thing that\'s leaving.']],
  dusk: [['Dusk bite\'s starting. The lantern eels come up with the first stars. Punctual as anything human ever built.']],
  night: [['Quiet night. You can hear the koi ticking if you put your ear to the dock. I\'m due a rematch. Forty years due.']],
  zones: {
    town: [['Dry land business, mayor? I float through. The square\'s fine but it doesn\'t RIPPLE.']],
    meadow: [['The creek through the meadow\'s barely a trickle but it\'s river family. I pay my respects.']],
    forest: [['Cataloger showed me the pools up the gorge. Cold, dark, full of secrets. Like the deep sea if the deep sea were walkable. I\'m moved.']],
  },
  early: [['River\'s generous this year, mayor. Like it saved up while nobody was casting.']],
  late: [['Whole town on its feet and the dock still creaks in G. Gerald held through the ceremony. Proud of that board.']],
  any: BUOY.idle,
  bonded: [
    ['Practiced your bowline yet? Don\'t tell me. Show me. ...See, look at that. Knot dummy makes good. Proudest buoy on the river.'],
    ['Gerald creaked in a NEW key this morning. I figure the dock\'s happy. Wood does that when the right feet cross it enough.'],
  ],
};

export const WICK_CTX: CtxPools = {
  extra: WICK_VOLUME,
  recent: {
    fishing: [["River water catches the lamplight on your coat. A successful evening, I think."]],
    catching: [["A wing scale is shining on your sleeve. Small evidence of a quick and careful hand."]],
    digging: [["Fresh earth on your boots, friend. The dark below town keeps its own lost-property office."]],
    chopping: [["Sawdust glows gold near a lamp. You’ve given old timber one more useful journey."]],
    gifting: [["You have just brightened someone without oil or wick. Efficient work, friend."]],
    donating: [["The Archive lamp stayed lit late for your new specimen. Cataloger’s gratitude has unusual hours."]],
    building: [["A new doorway means another lamp on my rounds. I have already chosen the welcoming angle."]],
  },
  seasons: {
    spring: [["Spring means shorter nights. Less of my shift, more of everyone else's. I don't say that bitterly. Mostly."]],
    summer: [['Midsummer. My rounds are barely three hours. I stretch them. I take the long way past the pond.']],
    autumn: [['Autumn. Dark comes early and stays late. Busiest season of my year, and the prettiest.']],
    winter: [['Winter. I light the lamps at four and they burn till eight. Sixteen hours of my kind of weather.']],
  },
  weather: {
    rain: [['Rain haloes every lamp. On a wet night this town looks like somebody drew it from memory. Fondly.']],
    snow: [['Snow doubles the light — falls, catches, throws it back. One lamp does the work of three. I feel efficient.']],
    fog: [['Fog nights are why I do this. Each lamp makes its own little room, and I walk from room to room all night.']],
  },
  festival: [["They'll want the lamps lit early tonight. I lit them early anyway. I've been ready since noon. I'm always ready."]],
  birthday: [["My day. I usually let it pass. But you're here, and the lamps are on, and that's more of a celebration than I've had in a while."]],
  weekdays: [
    ['Sunday. I polish the glass on every lamp. Clean glass, honest light. It is nearly a sermon, if you squint.'],
    ['Monday. New wicks all round. A fresh wick takes the flame differently — eager, a little too tall. By Tuesday it settles into the work.'],
    ['Tuesday. I walk the dark spots — the corners no lamp reaches yet. I keep a list. The list is getting satisfyingly short.'],
    ['Wednesday. Oil day. The good oil smells of oranges. A town that smells of oranges after dark is a town at peace. My opinion. Strongly held.'],
    ['Thursday. The Cataloger borrows my brightest lamp for his audit with Sparks. Two bureaucrats and one flame. It is the coziest argument in town.'],
    ['Friday. I light the dock lamp first, out of order. Buoy pretends not to wait for it. The water doubles every flame; Fridays I serve two towns.'],
    ['Saturday. Music night. I turn the square lamps up a grade. Dancing deserves its light.'],
  ],
  dusk: [['My hour, mayor. Watch — the first lamp is always the loudest. After that the dark goes quietly.']],
  night: [['All lit, all well. Walk anywhere you like; I have been ahead of you all evening.']],
  dawn: [['I put the lamps to bed one by one. Snuffing is gentler work than lighting. Everything deserves a soft ending to its shift.']],
  day: [['*He stands very still in the daylight, lamp-head dim, conserving.* ...I am, in a word, off-duty. In two words: politely dormant.']],
  zones: {
    forest: [['No lamps under the trees. The Cataloger asked me to leave the dark intact up here. Professional courtesy between night workers.']],
    beach: [['A lamp on a beach is a lighthouse, however small. I stand here some nights and feel enormous.']],
  },
  early: [['Four lamps and a lot of dark yet, mayor. But four is not zero. Four is a constellation.']],
  late: [['The town glows now, seen from the terrace. I climbed up to check. It looks... expected. That is the whole job, done.']],
  any: WICK.idle,
  bonded: [
    ['I no longer keep an emergency match, friend. I keep an emergency FRIEND. The economics are considerably better.'],
    ['Tonight is a nine. Cole would say eight. You would say something better than both of us. That is why the rounds go quicker now.'],
  ],
};

export const FERN_CTX: CtxPools = {
  extra: FERN_VOLUME,
  recent: {
    fishing: [["You’re river-cold, love. Sit near the stove; the catch can boast from the bucket."]],
    catching: [["Meadow grass in your laces and net thread on your sleeve. Tea before the next chase."]],
    digging: [["You’ve been turning earth, love. Wash your hands, but keep that good grounded feeling."]],
    chopping: [["Woodsmoke without smoke—that fresh sawdust smell. I’ll put on the lumberjack blend."]],
    gifting: [["Just gave a gift, did you? Come refill the space it left with tea."]],
    donating: [["Cataloger received something new. I know because he forgot his tea again in exactly the happy way."]],
    building: [["Building work! You’ll have hammer-arm tomorrow. Willow bark, warm cup, no heroics."]],
  },
  seasons: {
    spring: [['Spring, and everything wants attention at once. I like being needed by that many things.']],
    summer: [["Summer. Warm enough to sit outside with the tea until the light goes. That's the whole plan. That IS the plan."]],
    autumn: [["Autumn makes me want to feed people. There's nobody to feed. So I feed whoever wanders past. Hello."]],
    winter: [["Winter, and the kettle's on more or less permanently. Come by. Genuinely, come by."]],
  },
  weather: {
    rain: [["Rain's an excuse to stay in, and I never need much of an excuse. Kettle's on."]],
    snow: [["Snow days feel borrowed. Like the world's given everyone the afternoon off and nobody has to explain."]],
    fog: [['Fog makes the town feel small in a good way. Everything I care about is inside the part I can see.']],
  },
  festival: [["Festival! I've made far too much of everything, which is the correct amount for a festival. Take some. Take more."]],
  birthday: [["Oh — it's mine today. I wasn't going to mention it. I'm mentioning it. I'd quite like the fuss, if there's any going."]],
  weekdays: [
    ['Sunday, love. Chamomile day. Even the kettle rests — I steep it slow on yesterday\'s warmth.'],
    ['Monday I gather nettles. They only sting the hasty. The forest\'s way of teaching patience by hand.'],
    ['Tuesday: mint from the pond bank. It has AMBITIONS, mint. Turn your back a season and it annexes the shore.'],
    ['Wednesday is tincture day. Three drops of ember berry against the cold. Four if the cold is emotional.'],
    ['Thursday I dry the week\'s herbs in Marigold\'s boiler-heat. She claims she doesn\'t notice. She always leaves the warm side clear.'],
    ['Friday, love, I brew for the week ahead. Whatever the town is going to need, the leaves usually know first.'],
    ['Saturday! I take a thermos to Reggie\'s set. Dancing tea: rosehip, two drops of pluck. He calls it the good stuff. It IS the good stuff.'],
  ],
  dawn: [['First steam of the morning, love. The kettle sings a little flat till noon. We all do.']],
  day: [['Basket\'s half full and the day\'s half open. Good ratios all round.']],
  dusk: [['Evening blend hour. Lavender, lemon balm, and whatever the sunset suggests. Tonight it suggests extra honey.']],
  night: [['Can\'t sleep, love? There\'s a tea for that. There\'s a tea for nearly everything except goodbyes. I\'ve looked.']],
  zones: {
    town: [['I leave a jar of something soothing on the notice board shelf, love. For whoever needs it. It\'s always empty by week\'s end. Good sign. I think.']],
    meadow: [['Marigold\'s rows and my wild patches, love — the meadow can\'t decide if it\'s a farm or a party. Why decide?']],
    beach: [['Samphire, love! Salty little wonder. The sea does pickling all on its own; I just take credit.']],
  },
  early: [['The forest fed me forty years of quiet, love. Now I get to feed it back — one pot at a time.']],
  late: [['A full town means a full kettle, love. I\'ve gone from one cup a night to six. Wealth, by my measure.']],
  any: FERN.idle,
  bonded: [
    ['Kettle\'s already on, love. It goes on by itself when it hears your boots now. I\'ve stopped pretending that\'s a malfunction.'],
    ['I started a new recipe book. First entry: "For a town: one postmaster, undiluted. Do not steep. Serve as is."'],
  ],
};

export const PLINK_CTX: CtxPools = {
  extra: PLINK_VOLUME,
  recent: {
    fishing: [["A catch! Your reel made a perfect rising glissando from the river. I took notes. ♪"]],
    catching: [["Net swing in three-four, snap on the downbeat. Meadow percussion! ♪"]],
    digging: [["Shovel rhythm today? Scrape, thump, surprise—the classic star-spot cadence."]],
    chopping: [["Heard your axe keeping time beyond the square. Strong tempo, tasteful rests."]],
    gifting: [["A gift is a melody with only one listener, and somehow the whole town hums afterward. ♪"]],
    donating: [["New Archive piece! Cataloger calls it a specimen; I call it another instrument in the world orchestra."]],
    building: [["Hammers! Saws! A whole construction section, and the grand finale has a roof. ♪"]],
  },
  seasons: {
    spring: [["Spring! Everything's in a higher key. Even the river's gone up a tone, I'd swear to it."]],
    summer: [["Summer's all long notes. Nothing hurries. I've been playing the same phrase for three days and it's still not finished."]],
    autumn: [["Autumn's a minor key, but a warm one. My favourite thing to play and the hardest thing to explain."]],
    winter: [["Winter, and the cold puts my organ half a step flat. I've stopped fighting it. It sounds sadder. It suits."]],
  },
  weather: {
    rain: [["Rain's already percussion, so I've only got to do the melody. Easiest day of my year."]],
    snow: [["Snow eats sound. Everything I play comes out muffled and close, like it's only for whoever's standing right here. That's you."]],
    fog: [["Fog does the strangest thing to a note — sends it out and doesn't send it back. I play into it anyway."]],
  },
  festival: [["FESTIVAL! I've rehearsed. I've over-rehearsed. I'll play the one everyone knows and pretend that wasn't the plan all along."]],
  birthday: [["It's my day! I wrote myself a piece. It's terribly self-indulgent. I'm going to play it at you now, and you can't stop me."]],
  weekdays: [
    ['Sunday: rest. In music, the rest IS written, you know. Today the whole town is one long lovely rest. ♪'],
    ['Monday I tune. The cold gets into my pipes and everything goes a quarter-tone sad. Mondays are for un-sadding the pipes.'],
    ['Tuesday: the bridge session. The river holds a drone note in D and never tires. Best accompanist I\'ve ever had. ♪'],
    ['Wednesday I trade Reggie a new tune for an old record. We call it the exchange rate. It is EXTREMELY favorable both directions.'],
    ['Thursday: I play for the Archive moths. Cataloger says they navigate by my lamplight now. A literal following! ♪'],
    ['Friday I busk the square proper. Coins optional. Humming along is legal tender.'],
    ['Saturday! Reggie headlines, I open. The town\'s entire music scene, both of us, one stage. Sold out forty years running — no tickets. ♪'],
  ],
  dawn: [['Birds get the dawn slot, mayor. Union rules. I come in on the second verse. ♪']],
  day: [['Movement two is going WELL today. The wind sat in on rehearsal and only improvised a little.']],
  dusk: [['Dusk is in E-flat. Every dusk. I\'ve checked for forty years. The sky is a very consistent composer. ♪']],
  night: [['Sssh — hear it? Crickets in six-eight, river in four-four, Wick\'s boots on the cobbles keeping time. The town writes itself at night. I just transcribe.']],
  zones: {
    beach: [['The tide is the oldest rhythm section there is, mayor. I open for IT down here. Humbling, honestly. ♪']],
    forest: [['I play soft up here. The forest has its own set list and I am a guest performer. ♪']],
    meadow: [['The orchard rows are barlines, see? The whole meadow reads as sheet music if you stand just here. ♪']],
  },
  early: [['The town song\'s still missing instruments, mayor. Every bot you wake is a new part I get to write. No pressure! Some pressure. ♪']],
  late: [['The town song has all its parts now. I played it at the ceremony — did you hear the ending? That wasn\'t me. That was everyone. ♪']],
  any: PLINK.idle,
  bonded: [
    ['Mayor! I\'m writing movement seven. Nobody commissioned it. That\'s how you know a town\'s alive — the music starts happening on spec. ♪'],
    ['Strike your fork sometime when you\'re far out on the map. I\'ll answer from the square. Call and response, valley-sized. ♪'],
  ],
};

/** Gift reactions, per villager, per verdict. */
export const GIFT_REACTIONS: Record<string, Record<'loved' | 'liked' | 'neutral' | 'disliked', string[]>> = {
  sparks: {
    loved: ['For ME? Mayor, this goes STRAIGHT into the drawer marked TREASURES, DO NOT AUDIT. I— I need a moment. The moment is filed. Thank you.'],
    liked: ['Oh, splendid! Received, logged, and cherished — in that order, then all at once.'],
    neutral: ['Duly received! Everything given in kindness gets the good stamp.'],
    disliked: ['Ah. Hm. Filed under: THOUGHT, IT\'S THE. Which is a real drawer I am making right now.'],
  },
  reggie: {
    loved: ['YO. This goes on the shelf behind the till — that\'s the platinum shelf, nothing touches that shelf. You touched the shelf. *KA-CHING KA-CHING*'],
    liked: ['Okay okay okay, I see you. Solid pull. Going in the crate of good things.'],
    neutral: ['Appreciate you, Mayor. It\'s the thought, and the thought SLAPS.'],
    disliked: ['...I\'ma be real, this is a B-side. But every B-side\'s somebody\'s favorite song. *gentle ka-ching*'],
  },
  'cataloger-734': {
    loved: ['Oh. OH. Hold still — no, not you, the specimen. The specimen is perfect. You may watch me label it. That is the highest honor I know how to give.'],
    liked: ['A worthy addition. The drawers approve. I can hear them settle.'],
    neutral: ['Received and catalogued. Provenance: kindness. That column is new. I added it for you.'],
    disliked: ['I will label it honestly: "gift, puzzling, kept anyway." The third word is the operative one.'],
  },
  marigold: {
    loved: ['Oh, DEAR. Come here — no, closer, I\'m going to be sentimental at you and you\'ll just have to bear it. It\'s perfect.'],
    liked: ['Isn\'t that lovely! Into the warm pocket it goes. Yes, I have a warm pocket. I\'m a boiler, dear.'],
    neutral: ['Thank you, dear. Given things grow better than bought things. It\'s true of flowers and it\'s true of days.'],
    disliked: ['Well! It\'s... sturdy, isn\'t it. I shall plant something near it and they can keep each other company.'],
  },
  buoy: {
    loved: ['Mayor. MAYOR. This is going in the wheelhouse. I don\'t have a wheelhouse. I\'m BUILDING a wheelhouse for this.'],
    liked: ['Good haul. You\'ve got the eye. River says so too — I checked.'],
    neutral: ['Much obliged. Anything handed over water\'s edge counts double, old ferry rule.'],
    disliked: ['Huh. Well. Even a snagged line brings up SOMETHING. Cheers, mayor.'],
  },
  wick: {
    loved: ['Ah — careful, my flame just jumped a full grade. For me? Friend, this will sit on the ledge of the dock lamp. The good ledge.'],
    liked: ['How kind. It will keep well in the tin — the tin keeps everything well. It\'s had practice.'],
    neutral: ['Thank you, friend. Small lights, small gifts — the town runs on both.'],
    disliked: ['Hm. I shall regard it at dusk, when everything looks its best. Even this. ESPECIALLY this.'],
  },
  fern: {
    loved: ['Oh, LOVE. Sit down, I\'m brewing the celebration blend. This one calls for two cups and I finally have a second cup-haver.'],
    liked: ['That\'s a kindness, love. Into the basket — the basket knows what it likes and it likes this.'],
    neutral: ['Bless you, love. A gift\'s a cup of tea you can hold twice.'],
    disliked: ['...I\'ll find a use, love, I always do. Worst case it props the kettle and hears a lot of gossip.'],
  },
  plink: {
    loved: ['MAYOR. This has a RESONANCE. Listen— no, really, hold it up — d\'you hear that? That\'s a B-flat of pure friendship. It\'s going in the piece. ♪'],
    liked: ['Ooh, lovely timbre on this. Gifts are just chords you can carry, you know. ♪'],
    neutral: ['Thank you kindly! Every little thing hums if you hold it long enough. I\'ll find its note.'],
    disliked: ['Hmm. Percussion, then! Everything\'s percussion if you believe in it. ♪'],
  },
};

/** Favor lines: asked when the player offers to help. */
export const FAVOR_ASK: Record<string, (itemName: string, icon: string) => string[]> = {
  sparks: (n, i) => [`Actually — yes! For the town records: one ${i} ${n}. For the records, you understand. The records are me. I want it.`],
  reggie: (n, i) => [`Since you\'re askin\' — I been hunting a ${i} ${n} for the shop shelf. Finder\'s fee is my eternal respect plus interest.`],
  'cataloger-734': (n, i) => [`There is a gap in the collection shaped exactly like a ${i} ${n}. Gaps itch, postmaster. Scientifically speaking.`],
  marigold: (n, i) => [`Would you keep an eye out for a ${i} ${n}, dear? The garden\'s been asking. Gardens ask quietly, but they ask.`],
  buoy: (n, i) => [`Aye — a ${i} ${n} would do me right. The river\'s been holding out on me lately. Rude of it.`],
  wick: (n, i) => [`If your rounds cross paths with a ${i} ${n}, friend, the lamps and I would be much obliged.`],
  fern: (n, i) => [`Ooh — a ${i} ${n}, love, if one finds you. For a brew I\'ve been meaning to attempt. Medicinal. Mostly.`],
  plink: (n, i) => [`A ${i} ${n}! I need one for the orchestra. What section? Don\'t worry about it. ♪`],
};

// ---------------------------------------------------------------------------
// Overheard conversations. When two villagers pair off at social hour the
// player can wander close and catch a few lines of a chat that was never
// aimed at them — the cheapest way to make a town feel like it exists when
// you are not looking at it.
//
// Each exchange is a run of [speakerIndex, line] where 0 is the first villager
// and 1 the second. Pairs are looked up in either order.

export interface Overheard {
  /** Villager ids, in the order the speaker indices refer to. */
  pair: [string, string];
  exchanges: Array<Array<[0 | 1, string]>>;
}

export const OVERHEARD: Overheard[] = [
  {
    pair: ['sparks', 'reggie'],
    exchanges: [
      [
        [0, 'Reggie, your invoices are in a SHOEBOX.'],
        [1, 'The box is load-bearing, lil bro.'],
        [0, "It is a SHOE. BOX."],
        [1, "...Aight, bring the folders. Bring 'em all."],
      ],
      [
        [1, 'Sparks. Real talk. You ever take a day off?'],
        [0, 'I took one. In 2009. I filed a report about it.'],
        [1, 'Course you did.'],
      ],
    ],
  },
  {
    pair: ['cataloger-734', 'marigold'],
    exchanges: [
      [
        [1, "Your ferns are doing better than mine and I've fed mine."],
        [0, 'I do not feed them. I merely observe them very intently.'],
        [1, "That's just staring, love."],
        [0, '...It is rigorous staring.'],
      ],
      [
        [0, 'Marigold. The chicory by the well is a fortnight early.'],
        [1, "I know. I've been trying not to think about what that means."],
      ],
    ],
  },
  {
    pair: ['buoy', 'wick'],
    exchanges: [
      [
        [0, 'You ever sleep, lamplighter?'],
        [1, 'Days. Same as you do nights.'],
        [0, "So we've been livin' in the same town forty years and barely met."],
        [1, '...Yes. We should fix that.'],
      ],
      [
        [1, "The lamp at the dock keeps guttering. I'll see to it."],
        [0, "Leave it. I like the one that flickers. Feels like it's tryin'."],
      ],
    ],
  },
  {
    pair: ['fern', 'plink'],
    exchanges: [
      [
        [0, 'Play the slow one. The one in the minor key.'],
        [1, "You always ask for that one. It's terribly sad."],
        [0, "It's not sad. It's just honest with a tune on it."],
      ],
      [
        [1, "I've written something new. It's not finished."],
        [0, 'Nothing here is finished. Play it anyway.'],
      ],
    ],
  },
  {
    pair: ['reggie', 'plink'],
    exchanges: [
      [
        [0, 'Yo, Plink. You and me. Saturday. Square. Full set.'],
        [1, 'My organ is a devotional instrument, Reggie.'],
        [0, "So's a beat, my guy."],
        [1, '...Fine. But I take the second chorus.'],
      ],
    ],
  },
  {
    pair: ['sparks', 'cataloger-734'],
    exchanges: [
      [
        [0, 'Thursday audit! I brought the good pen.'],
        [1, 'I set out your chair an hour ago.'],
        [0, '...You did?'],
        [1, 'I set it out every Thursday. Do not make it a thing.'],
      ],
    ],
  },
  {
    pair: ['marigold', 'fern'],
    exchanges: [
      [
        [1, "Come in out of the wet, I've got the kettle on."],
        [0, "In a minute. The beds want turning."],
        [1, "The beds have wanted turning for forty years, Marigold."],
        [0, '...Alright. One cup.'],
      ],
    ],
  },
  {
    pair: ['wick', 'sparks'],
    exchanges: [
      [
        [1, 'Wick! Lamp seven, two minutes early tonight.'],
        [0, 'It looked like it wanted lighting.'],
        [1, 'I am AMENDING THE SCHEDULE. Officially. In ink.'],
      ],
    ],
  },
];

/** The exchange to play for a pair, if these two have anything written. */
export function overheardFor(
  aId: string,
  bId: string,
  counter: number,
): Array<[string, string]> | null {
  for (const o of OVERHEARD) {
    const forward = o.pair[0] === aId && o.pair[1] === bId;
    const reverse = o.pair[0] === bId && o.pair[1] === aId;
    if (!forward && !reverse) continue;
    const ex = o.exchanges[counter % o.exchanges.length];
    // Map speaker index back to the ids the caller passed in.
    return ex.map(([who, line]) => {
      const id = who === 0 ? o.pair[0] : o.pair[1];
      return [id, line] as [string, string];
    });
  }
  return null;
}
