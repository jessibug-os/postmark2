import { PALETTE_HEX } from '../art/palette';
/**
 * Master item catalogue. Everything the player can hold goes through here.
 * Icons are emoji so the DOM UI needs no art assets; the in-world look of an
 * item is handled by the systems that spawn it.
 */
import type { Season } from '../systems/Calendar';
import { FURNITURE } from './furniture';
import { EXTRA_BUGS, EXTRA_FISH, EXTRA_ITEMS } from './collections';

export type ItemCategory =
  | 'fish'
  | 'bug'
  | 'sea'
  | 'fossil'
  | 'art'
  | 'forage'
  | 'fruit'
  | 'material'
  | 'relic'
  | 'tool'
  | 'clothing'
  | 'furniture';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  icon: string;
  description: string;
  /** Gears received when sold to Reggie. 0 = cannot be sold (tools in use). */
  sellPrice: number;
  /** Gears to buy from Reggie, when stocked. Absent = not sold. */
  buyPrice?: number;
  /** Museum-donatable species get an archive label from Cataloger 734. */
  archiveLabel?: string;
  /** Clothing tint applied to the player's coat. */
  clothingColor?: number;
  /** Art provenance. Forged works carry a visible/authored inspection tell. */
  authentic?: boolean;
  artTell?: string;
}

/** Water body a fish lives in. Absent means it is found in all of them. */
export type Water = 'river' | 'pond' | 'ocean';

export interface FishDef {
  itemId: string;
  /** Relative spawn weight within its active window. */
  weight: number;
  /** Hours (0-24) the fish is active; wraps midnight when start > end. */
  hours: [number, number];
  /** Shadow size class rendered in the water, 1 (small) - 3 (large). */
  shadow: 1 | 2 | 3;
  /** Seasons it runs in. Absent = all year. */
  seasons?: Season[];
  /** Water bodies it is found in. Absent = anywhere there is water. */
  where?: Water[];
}

export interface BugDef {
  itemId: string;
  weight: number;
  hours: [number, number];
  /** Where the bug wanders. */
  habitat: 'grass' | 'flowers' | 'trees';
  /** Seasons it is on the wing. Absent = all year. */
  seasons?: Season[];
}

/** True when a species is available in the given season. */
export function inSeason(season: Season, def: { seasons?: Season[] }): boolean {
  return !def.seasons || def.seasons.includes(season);
}

// ---------------------------------------------------------------------------

export const ITEMS: Record<string, ItemDef> = {};

export function def(item: ItemDef): void {
  ITEMS[item.id] = item;
}
for (const extra of EXTRA_ITEMS) def(extra);

// --- Fish (river species, post-collapse flavored) --------------------------
def({
  id: 'rust-carp', name: 'Rust Carp', category: 'fish', icon: '🐟',
  sellPrice: 120,
  description: 'Its scales oxidised to match the riverbed scrap. Camouflage, or sentiment?',
  archiveLabel: 'Cyprinus ferrugo — thrives where the water tastes of old machines.',
});
def({
  id: 'brass-bream', name: 'Brass Bream', category: 'fish', icon: '🐠',
  sellPrice: 240,
  description: 'Gleams like a polished doorknob. Surprisingly heavy.',
  archiveLabel: 'Abramis aeris — the shine is biological. Probably.',
});
def({
  id: 'mud-darter', name: 'Mud Darter', category: 'fish', icon: '🐡',
  sellPrice: 80,
  description: 'Small, quick, and perpetually embarrassed-looking.',
  archiveLabel: 'Etheostoma luti — catalogued between one blink and the next.',
});
def({
  id: 'lantern-eel', name: 'Lantern Eel', category: 'fish', icon: '🪱',
  sellPrice: 600,
  description: 'Glows faintly amber at night. The river remembers light.',
  archiveLabel: 'Anguilla lucerna — nocturnal. We keep similar hours, it and I.',
});
def({
  id: 'clockwork-koi', name: 'Clockwork Koi', category: 'fish', icon: '🎏',
  sellPrice: 1800,
  description: 'Someone, long ago, built a fish. It still swims. Nobody knows why.',
  archiveLabel: 'Automaton cyprinid — drawer 001. The first specimen I ever labelled twice.',
});
def({
  id: 'silver-minnow', name: 'Silver Minnow', category: 'fish', icon: '🐟',
  sellPrice: 60,
  description: 'The river\'s small change.',
  archiveLabel: 'Phoxinus argenti — abundant. Abundance is its own kind of miracle.',
});

// Sixteen more, so the almanac is a year's project rather than an afternoon's.
// Every entry is gated on at least one of season, hour or water body — a
// species you can catch anywhere at any time teaches the player nothing.
def({
  id: 'thaw-trout', name: 'Thaw Trout', category: 'fish', icon: '🐟',
  sellPrice: 340,
  description: 'Runs the moment the ice breaks, as if it had been waiting all winter.',
  archiveLabel: 'Salmo liquescens — arrives within a day of the first thaw. I set my calendar by it.',
});
def({
  id: 'blossom-dace', name: 'Blossom Dace', category: 'fish', icon: '🐠',
  sellPrice: 180,
  description: 'Pink-flanked, and only where petals fall on the water.',
  archiveLabel: 'Leuciscus floris — the colour is diet, not decoration. Still lovely.',
});
def({
  id: 'green-tench', name: 'Green Tench', category: 'fish', icon: '🐟',
  sellPrice: 260,
  description: 'Sits on the pond bottom like a submerged thought.',
  archiveLabel: 'Tinca viridis — patient beyond reason. We understand each other.',
});
def({
  id: 'sun-perch', name: 'Sun Perch', category: 'fish', icon: '🐠',
  sellPrice: 200,
  description: 'Only bites when the light is high and hard.',
  archiveLabel: 'Perca solis — midday specialist. I have never once seen it at dusk.',
});
def({
  id: 'kettle-catfish', name: 'Kettle Catfish', category: 'fish', icon: '🐡',
  sellPrice: 780,
  description: 'Whiskered, enormous, and entirely unbothered by you.',
  archiveLabel: 'Silurus lebes — drawer 244 could not hold it. I widened drawer 244.',
});
def({
  id: 'harvest-chub', name: 'Harvest Chub', category: 'fish', icon: '🐟',
  sellPrice: 220,
  description: 'Fattens through autumn as if it knows what is coming.',
  archiveLabel: 'Squalius messis — it has never been wrong about the cold yet.',
});
def({
  id: 'ember-salmon', name: 'Ember Salmon', category: 'fish', icon: '🐠',
  sellPrice: 900,
  description: 'Runs upriver in autumn, the colour of a banked fire.',
  archiveLabel: 'Oncorhynchus pruna — it goes home. I have thought about that a great deal.',
});
def({
  id: 'frost-pike', name: 'Frost Pike', category: 'fish', icon: '🐟',
  sellPrice: 1100,
  description: 'All winter it waits under the ice. All winter it is hungry.',
  archiveLabel: 'Esox gelidus — a specimen best admired through glass.',
});
def({
  id: 'glass-smelt', name: 'Glass Smelt', category: 'fish', icon: '🐟',
  sellPrice: 140,
  description: 'Nearly transparent. You catch the idea of a fish.',
  archiveLabel: 'Osmerus vitrea — the hardest thing I have ever had to draw.',
});
def({
  id: 'sump-loach', name: 'Sump Loach', category: 'fish', icon: '🪱',
  sellPrice: 160,
  description: 'Lives in the pond silt and comes up only after dark.',
  archiveLabel: 'Misgurnus limi — surfaces at night. So do I.',
});
def({
  id: 'moon-carp', name: 'Moon Carp', category: 'fish', icon: '🎏',
  sellPrice: 1400,
  description: 'Pale and slow, and only ever seen between midnight and dawn.',
  archiveLabel: 'Cyprinus lunaris — I have logged nine. Each one steadied me.',
});
def({
  id: 'tin-sardine', name: 'Tin Sardine', category: 'fish', icon: '🐟',
  sellPrice: 90,
  description: 'Shoals off the beach in numbers that used to feed a town.',
  archiveLabel: 'Sardina stanni — abundant, and therefore overlooked. I have made a note.',
});
def({
  id: 'anchor-cod', name: 'Anchor Cod', category: 'fish', icon: '🐠',
  sellPrice: 420,
  description: 'Heavy as its name. The sea gives it up reluctantly.',
  archiveLabel: 'Gadus ancora — winter ocean. Cold work, good eating, so the records say.',
});
def({
  id: 'ribbon-eel', name: 'Ribbon Eel', category: 'fish', icon: '🪱',
  sellPrice: 700,
  description: 'Unspools out of the surf like a dropped hair ribbon.',
  archiveLabel: 'Rhinomuraena vitta — the sea is not obliged to be plain.',
});
def({
  id: 'signal-ray', name: 'Signal Ray', category: 'fish', icon: '🥏',
  sellPrice: 1600,
  description: 'Its markings pulse in slow sequence. Nobody has decoded them.',
  archiveLabel: 'Raja signum — the pattern repeats every 41 seconds. I have counted. Twice.',
});
def({
  id: 'depot-sturgeon', name: 'Depot Sturgeon', category: 'fish', icon: '🐋',
  sellPrice: 2600,
  description: 'Older than the empty town. It has outlasted everyone.',
  archiveLabel: 'Acipenser stationis — predates the collapse. It remembers more than I do.',
});

export const FISH: FishDef[] = [
  // All year, the everyday catches.
  { itemId: 'silver-minnow', weight: 30, hours: [0, 24], shadow: 1 },
  { itemId: 'mud-darter', weight: 24, hours: [6, 20], shadow: 1, where: ['river', 'pond'] },
  { itemId: 'rust-carp', weight: 20, hours: [0, 24], shadow: 2, where: ['river', 'pond'] },
  { itemId: 'brass-bream', weight: 12, hours: [8, 18], shadow: 2, where: ['river'] },
  { itemId: 'lantern-eel', weight: 8, hours: [19, 5], shadow: 2, where: ['river', 'pond'] },
  { itemId: 'clockwork-koi', weight: 3, hours: [0, 24], shadow: 3, where: ['pond'] },
  { itemId: 'glass-smelt', weight: 18, hours: [4, 10], shadow: 1, where: ['river'] },
  { itemId: 'sump-loach', weight: 14, hours: [20, 4], shadow: 1, where: ['pond'] },
  { itemId: 'moon-carp', weight: 4, hours: [0, 5], shadow: 3, where: ['pond'] },
  { itemId: 'depot-sturgeon', weight: 2, hours: [0, 24], shadow: 3, where: ['river'] },
  // Spring.
  { itemId: 'thaw-trout', weight: 20, hours: [5, 12], shadow: 2, seasons: ['spring'], where: ['river'] },
  { itemId: 'blossom-dace', weight: 22, hours: [7, 19], shadow: 1, seasons: ['spring'], where: ['river', 'pond'] },
  // Summer.
  { itemId: 'sun-perch', weight: 22, hours: [10, 16], shadow: 2, seasons: ['summer'] },
  { itemId: 'green-tench', weight: 16, hours: [6, 20], shadow: 2, seasons: ['summer'], where: ['pond'] },
  { itemId: 'kettle-catfish', weight: 6, hours: [18, 4], shadow: 3, seasons: ['summer'], where: ['pond'] },
  { itemId: 'ribbon-eel', weight: 8, hours: [0, 24], shadow: 2, seasons: ['summer'], where: ['ocean'] },
  // Autumn.
  { itemId: 'harvest-chub', weight: 22, hours: [0, 24], shadow: 2, seasons: ['autumn'], where: ['river', 'pond'] },
  { itemId: 'ember-salmon', weight: 9, hours: [5, 18], shadow: 3, seasons: ['autumn'], where: ['river'] },
  // Winter.
  { itemId: 'frost-pike', weight: 8, hours: [0, 24], shadow: 3, seasons: ['winter'], where: ['river', 'pond'] },
  { itemId: 'anchor-cod', weight: 14, hours: [0, 24], shadow: 2, seasons: ['winter'], where: ['ocean'] },
  // Ocean, most of the year.
  { itemId: 'tin-sardine', weight: 26, hours: [0, 24], shadow: 1, where: ['ocean'] },
  { itemId: 'signal-ray', weight: 3, hours: [21, 6], shadow: 3, where: ['ocean'] },
];
FISH.push(...EXTRA_FISH);

// --- Bugs ------------------------------------------------------------------
def({
  id: 'cinder-moth', name: 'Cinder Moth', category: 'bug', icon: '🦋',
  sellPrice: 130,
  description: 'Wings like cooling embers. Drawn to the robots\' lamps.',
  archiveLabel: 'Pyralis favilla — it mistakes my core for a hearth. I allow it.',
});
def({
  id: 'gear-beetle', name: 'Gear Beetle', category: 'bug', icon: '🪲',
  sellPrice: 200,
  description: 'Its shell is ridged like a cog. Rolls when startled.',
  archiveLabel: 'Scarabaeus rotula — evolution has a sense of humour after all.',
});
def({
  id: 'meadow-hopper', name: 'Meadow Hopper', category: 'bug', icon: '🦗',
  sellPrice: 90,
  description: 'The loudest citizen of the empty meadow.',
  archiveLabel: 'Gryllus prati — its song fills rooms no voice has used in years.',
});
def({
  id: 'ivory-butterfly', name: 'Ivory Butterfly', category: 'bug', icon: '🦋',
  sellPrice: 110,
  description: 'Pale as old paper. Prefers flowerbeds.',
  archiveLabel: 'Pieris eburnea — it landed on drawer 340 and I did not disturb it for an hour.',
});
def({
  id: 'dusk-firefly', name: 'Dusk Firefly', category: 'bug', icon: '🪰',
  sellPrice: 260,
  description: 'A drifting spark that never starts a fire.',
  archiveLabel: 'Lampyris crepusculi — proof that small lights persist.',
});
def({
  id: 'oak-stag', name: 'Oak Stag Beetle', category: 'bug', icon: '🪲',
  sellPrice: 500,
  description: 'Clings to tree trunks and will absolutely fight you.',
  archiveLabel: 'Lucanus quercus — it pinched me. Noted, with respect.',
});

def({
  id: 'petal-blue', name: 'Petal Blue', category: 'bug', icon: '🦋',
  sellPrice: 160,
  description: 'The exact colour of the sky behind blossom.',
  archiveLabel: 'Polyommatus petalum — first of spring, every spring, without fail.',
});
def({
  id: 'thaw-mayfly', name: 'Thaw Mayfly', category: 'bug', icon: '🪰',
  sellPrice: 70,
  description: 'Lives a single day and appears to enjoy all of it.',
  archiveLabel: 'Ephemera liquescens — one day. I have had forty years and done less.',
});
def({
  id: 'seed-weevil', name: 'Seed Weevil', category: 'bug', icon: '🪲',
  sellPrice: 110,
  description: 'Rides the wind on stolen dandelion silk.',
  archiveLabel: 'Curculio seminis — an opportunist, and a good one.',
});
def({
  id: 'brass-cicada', name: 'Brass Cicada', category: 'bug', icon: '🦗',
  sellPrice: 240,
  description: 'Its song is the sound of a summer afternoon refusing to end.',
  archiveLabel: 'Cicada aeris — seventeen years underground for six weeks of noise. Worth it.',
});
def({
  id: 'kiln-dragonfly', name: 'Kiln Dragonfly', category: 'bug', icon: '🪰',
  sellPrice: 320,
  description: 'Hovers over the pond like a held breath.',
  archiveLabel: 'Anax fornacis — it hunts on the wing and never seems to hurry.',
});
def({
  id: 'copper-hornet', name: 'Copper Hornet', category: 'bug', icon: '🐝',
  sellPrice: 480,
  description: 'Nests in the dead trees. Does not negotiate.',
  archiveLabel: 'Vespa cupri — catalogued at some personal cost. Drawer 088.',
});
def({
  id: 'lantern-mantis', name: 'Lantern Mantis', category: 'bug', icon: '🦗',
  sellPrice: 620,
  description: 'Waits by the lamps for whatever the light brings.',
  archiveLabel: 'Mantis lucerna — a patient hunter. I find it restful company.',
});
def({
  id: 'harvest-moth', name: 'Harvest Moth', category: 'bug', icon: '🦋',
  sellPrice: 210,
  description: 'Wings the colour of cut wheat and late light.',
  archiveLabel: 'Noctua messis — arrives with the turning leaves, leaves with the frost.',
});
def({
  id: 'rust-ladybird', name: 'Rust Ladybird', category: 'bug', icon: '🐞',
  sellPrice: 130,
  description: 'Six spots, always six, no matter how many I count.',
  archiveLabel: 'Coccinella ferrugo — I have counted 1,204 of them. Always six.',
});
def({
  id: 'cog-cricket', name: 'Cog Cricket', category: 'bug', icon: '🦗',
  sellPrice: 180,
  description: 'Chirps in a steady tick, like something winding down.',
  archiveLabel: 'Gryllus rotula — it keeps better time than the town clock did.',
});
def({
  id: 'ash-swallowtail', name: 'Ash Swallowtail', category: 'bug', icon: '🦋',
  sellPrice: 540,
  description: 'Enormous, grey-gold, and utterly unhurried.',
  archiveLabel: 'Papilio cineris — it settled on my lens once. I did not move for some time.',
});
def({
  id: 'snow-springtail', name: 'Snow Springtail', category: 'bug', icon: '🪲',
  sellPrice: 150,
  description: 'Specks that walk on snow and vanish when you look closely.',
  archiveLabel: 'Hypogastrura nivis — proof that winter is not empty, only quiet.',
});
def({
  id: 'frost-lacewing', name: 'Frost Lacewing', category: 'bug', icon: '🪰',
  sellPrice: 380,
  description: 'Wings like a window on a cold morning.',
  archiveLabel: 'Chrysopa gelida — it should not survive the cold. It does anyway.',
});
def({
  id: 'shore-skimmer', name: 'Shore Skimmer', category: 'bug', icon: '🪰',
  sellPrice: 190,
  description: 'Skates the wet sand ahead of every wave.',
  archiveLabel: 'Halobates litoris — it has never once been caught out by the tide.',
});
def({
  id: 'clockwork-firefly', name: 'Clockwork Firefly', category: 'bug', icon: '✨',
  sellPrice: 1200,
  description: 'It blinks in a repeating pattern. Someone built this one too.',
  archiveLabel: 'Automaton lampyrid — the pattern is a postal code. I have not told anyone yet.',
});
def({
  id: 'depot-scarab', name: 'Depot Scarab', category: 'bug', icon: '🪲',
  sellPrice: 1500,
  description: 'Lives in the ruins and polishes itself on old brass.',
  archiveLabel: 'Scarabaeus stationis — drawer 001, shelf two. My finest specimen.',
});

export const BUGS: BugDef[] = [
  // All year.
  { itemId: 'meadow-hopper', weight: 28, hours: [7, 19], habitat: 'grass' },
  { itemId: 'gear-beetle', weight: 14, hours: [0, 24], habitat: 'trees' },
  { itemId: 'rust-ladybird', weight: 20, hours: [7, 18], habitat: 'flowers' },
  { itemId: 'cog-cricket', weight: 16, hours: [18, 5], habitat: 'grass' },
  { itemId: 'shore-skimmer', weight: 14, hours: [6, 19], habitat: 'grass' },
  { itemId: 'lantern-mantis', weight: 7, hours: [19, 4], habitat: 'trees' },
  { itemId: 'clockwork-firefly', weight: 3, hours: [21, 3], habitat: 'grass' },
  { itemId: 'depot-scarab', weight: 2, hours: [0, 24], habitat: 'trees' },
  // Spring.
  { itemId: 'petal-blue', weight: 24, hours: [8, 17], habitat: 'flowers', seasons: ['spring'] },
  { itemId: 'thaw-mayfly', weight: 22, hours: [5, 11], habitat: 'grass', seasons: ['spring'] },
  { itemId: 'seed-weevil', weight: 18, hours: [9, 18], habitat: 'flowers', seasons: ['spring'] },
  { itemId: 'ivory-butterfly', weight: 22, hours: [8, 17], habitat: 'flowers', seasons: ['spring', 'summer'] },
  // Summer.
  { itemId: 'brass-cicada', weight: 22, hours: [9, 17], habitat: 'trees', seasons: ['summer'] },
  { itemId: 'kiln-dragonfly', weight: 16, hours: [8, 18], habitat: 'grass', seasons: ['summer'] },
  { itemId: 'copper-hornet', weight: 8, hours: [8, 17], habitat: 'trees', seasons: ['summer'] },
  { itemId: 'dusk-firefly', weight: 12, hours: [19, 23], habitat: 'grass', seasons: ['summer', 'spring'] },
  // Autumn.
  { itemId: 'harvest-moth', weight: 20, hours: [17, 5], habitat: 'flowers', seasons: ['autumn'] },
  { itemId: 'ash-swallowtail', weight: 8, hours: [9, 16], habitat: 'trees', seasons: ['autumn'] },
  { itemId: 'oak-stag', weight: 10, hours: [0, 24], habitat: 'trees', seasons: ['summer', 'autumn'] },
  { itemId: 'cinder-moth', weight: 16, hours: [18, 6], habitat: 'grass', seasons: ['autumn', 'winter'] },
  // Winter.
  { itemId: 'snow-springtail', weight: 22, hours: [0, 24], habitat: 'grass', seasons: ['winter'] },
  { itemId: 'frost-lacewing', weight: 10, hours: [6, 16], habitat: 'trees', seasons: ['winter'] },
];
BUGS.push(...EXTRA_BUGS);

// --- Forage / fruit --------------------------------------------------------
def({
  id: 'wild-chicory', name: 'Wild Chicory', category: 'forage', icon: '🌼',
  sellPrice: 40,
  description: 'Bitter roots, cheerful flower. The frontier in one plant.',
  archiveLabel: 'Cichorium ferox — it grows through the floorboards of the old depot.',
});
def({
  id: 'tin-mushroom', name: 'Tinman Mushroom', category: 'forage', icon: '🍄',
  sellPrice: 150,
  description: 'Grey-capped, faintly metallic. Grows in robot footprints.',
  archiveLabel: 'Agaricus stanni — symbiosis, or fondness? The distinction blurs.',
});
def({
  id: 'ember-berry', name: 'Ember Berry', category: 'forage', icon: '🫐',
  sellPrice: 70,
  description: 'Warm to the touch even on cold mornings.',
  archiveLabel: 'Vaccinium calidum — I keep one in drawer 512 as a hand-warmer.',
});
def({
  id: 'orchard-apple', name: 'Orchard Apple', category: 'fruit', icon: '🍎',
  sellPrice: 100,
  description: 'The old orchards still keep their promises.',
  archiveLabel: 'Malus domestica — planted by hands. Harvested by none, until now.',
});
def({
  id: 'bristle-pinecone', name: 'Bristle Pinecone', category: 'forage', icon: '🌰',
  sellPrice: 30,
  description: 'Prickly, resinous, and weirdly satisfying to hold.',
  archiveLabel: 'Pinus hystrix — the forest\'s way of mailing itself into the future.',
});
def({
  id: 'thaw-crocus', name: 'Thaw Crocus', category: 'forage', icon: '🌷',
  sellPrice: 90,
  description: 'Comes up through the last of the snow, entirely unbothered.',
  archiveLabel: 'Crocus liquescens — it does not wait for permission from the weather.',
});
def({
  id: 'sun-clover', name: 'Sun Clover', category: 'forage', icon: '🍀',
  sellPrice: 60,
  description: 'Four leaves more often than it should have. Nobody is complaining.',
  archiveLabel: 'Trifolium solis — a statistically improbable quantity of luck.',
});
def({
  id: 'copper-fern', name: 'Copper Fern', category: 'forage', icon: '🍂',
  sellPrice: 120,
  description: 'Turns the colour of a warm kettle in the first cold week.',
  archiveLabel: 'Dryopteris cupri — the whole forest changes its mind at once.',
});
def({
  id: 'frost-holly', name: 'Frost Holly', category: 'forage', icon: '🎄',
  sellPrice: 140,
  description: 'Berries so red against the snow it looks deliberate.',
  archiveLabel: 'Ilex gelida — the only colour left outdoors in the deep of the year.',
});

/**
 * Which forage each season puts on the ground. Spawn points are fixed at world
 * build time, but what is growing on them is re-rolled from this when a picked
 * plant regrows — so walking the same loop in a different season pays out
 * differently.
 */
export const SEASONAL_FORAGE: Record<Season, string[]> = {
  spring: ['thaw-crocus', 'wild-chicory', 'wild-chicory', 'tin-mushroom'],
  summer: ['sun-clover', 'wild-chicory', 'ember-berry', 'tin-mushroom'],
  autumn: ['copper-fern', 'ember-berry', 'bristle-pinecone', 'tin-mushroom'],
  winter: ['frost-holly', 'bristle-pinecone', 'tin-mushroom'],
};

/** Bloom colour per forage species, so a regrown plant looks like what it is. */
export const FORAGE_COLORS: Record<string, number> = {
  'wild-chicory': PALETTE_HEX.hbcd0e8,
  'ember-berry': PALETTE_HEX.hc0553f,
  'tin-mushroom': PALETTE_HEX.h9aa0a8,
  'bristle-pinecone': PALETTE_HEX.h8a6b45,
  'thaw-crocus': PALETTE_HEX.hc8a8d8,
  'sun-clover': PALETTE_HEX.h8ab84e,
  'copper-fern': PALETTE_HEX.hc07a3c,
  'frost-holly': PALETTE_HEX.hd83c3c,
};

/** A forage item appropriate to the season, for a regrowing plant. */
export function rollForage(season: Season): string {
  const pool = SEASONAL_FORAGE[season];
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Materials -------------------------------------------------------------
def({
  id: 'scrap-metal', name: 'Scrap Metal', category: 'material', icon: '⚙️',
  sellPrice: 25,
  description: 'The old world, by the pound. Reggie pays for it; SPARKS builds with it.',
});
def({
  id: 'timber', name: 'Timber', category: 'material', icon: '🪵',
  sellPrice: 20,
  description: 'Cut from the dead standing trees. Still smells of resin.',
});
def({
  id: 'stone', name: 'Cut Stone', category: 'material', icon: '🪨',
  sellPrice: 20,
  description: 'Field stone, knapped square. Buildings start here.',
});
def({
  id: 'amber-cell', name: 'Amber Cell', category: 'material', icon: '🔆',
  sellPrice: 400,
  description: 'A pre-collapse power cell, still warm. Robots need one to wake.',
});

// --- Relics (dug up) -------------------------------------------------------
def({
  id: 'relic-teacup', name: 'Chipped Teacup', category: 'relic', icon: '🫖',
  sellPrice: 300,
  description: 'Someone drank from this every morning. The chip fits a thumb.',
  archiveLabel: 'Domestic relic 07 — evidence of ten thousand quiet breakfasts.',
});
def({
  id: 'relic-letter', name: 'Sealed Letter', category: 'relic', icon: '✉️',
  sellPrice: 550,
  description: 'Never delivered. The address has weathered away, but not the name.',
  archiveLabel: 'Postal relic 01 — I have not opened it. Some drawers stay closed.',
});
def({
  id: 'relic-gearheart', name: 'Gearheart Locket', category: 'relic', icon: '🗝️',
  sellPrice: 900,
  description: 'A locket shaped like a gear. Inside: a portrait of a robot.',
  archiveLabel: 'Sentimental relic 12 — they loved us. This is the proof.',
});
def({
  id: 'relic-boot', name: 'Old Boot', category: 'relic', icon: '🥾',
  sellPrice: 10,
  description: 'Every river has one. Tradition, probably.',
});
def({
  id:'fossil-unassessed',name:'Unassessed Fossil',category:'fossil',icon:'🪨',sellPrice:100,
  description:'A plaster-jacketed fossil find. CATALOGER 734 can clean and identify it before donation.',
});

// --- Keepsakes: given at five hearts; each is one robot's memory made
// solid. They cannot be sold. Obviously they cannot be sold.
def({
  id: 'keepsake-manifest', name: 'The Unfiled Page', category: 'relic', icon: '📄',
  sellPrice: 0,
  description: "The last page of the evacuation manifest — one seat, never struck through. SPARKS's seat.",
});
def({
  id: 'keepsake-record', name: 'Square Sounds, Side A', category: 'relic', icon: '💿',
  sellPrice: 0,
  description: 'A record pressed on the last day: fourteen minutes of the town square, alive. Reggie kept it forty years without a needle.',
});
def({
  id: 'keepsake-fieldglass', name: 'The Field Glass', category: 'relic', icon: '🔍',
  sellPrice: 0,
  description: "The naturalist's own lens, from drawer 1 of the Archive. Label: EVERYTHING, CLEARLY.",
});
def({
  id: 'keepsake-seedpacket', name: '"For Spring. — E."', category: 'relic', icon: '🌱',
  sellPrice: 0,
  description: 'A hand-labelled seed packet, half a pinch left. Marigold plants the rest of E.\'s handwriting every year.',
});
def({
  id: 'keepsake-knot', name: 'The First Knot', category: 'relic', icon: '🪢',
  sellPrice: 0,
  description: "The practice knot a ferryman's kid tied on Buoy's finger, forty years holding.",
});
def({
  id: 'keepsake-match', name: 'The Borrowed Fire', category: 'relic', icon: '🕯️',
  sellPrice: 0,
  description: "A single match from the night watchman's tin. Wick's flame was lit from its brothers.",
});
def({
  id: 'keepsake-recipe', name: 'The Last Entry', category: 'relic', icon: '📖',
  sellPrice: 0,
  description: 'From the doctor\'s recipe book — "For loneliness: company, steeped. Forty years if needed."',
});
def({
  id: 'keepsake-tuningfork', name: 'Concert A', category: 'relic', icon: '🎵',
  sellPrice: 0,
  description: 'The bandstand tuning fork. Strike it and every song the town ever sang agrees on a starting note.',
});

// PLINK's eight-record concert set. One rotates through the later Emporium
// shelves each day; collected sides can be played on the cottage gramophone.
[
  ['concert-0', 'Postmark Overture', 'The six-note town hook, bright as a brass cancellation stamp.'],
  ['concert-1', 'Rain on Platform Three', 'A brushed nocturne for a train that has not called in forty years.'],
  ['concert-2', 'Orchard in June', 'Quick wooden pipes and the rhythm of apples landing in grass.'],
  ['concert-3', 'Lantern Watch', 'WICK’s small-hours theme, patient and warm.'],
  ['concert-4', 'The Ferry Remembers', 'A rolling harbour waltz with BUOY keeping time.'],
  ['concert-5', 'Cataloguer’s Gavotte', 'Orderly phrases which keep discovering one extra drawer.'],
  ['concert-6', 'Tin Flowers', 'MARIGOLD and FERN’s garden duet, pressed in green shellac.'],
  ['concert-7', 'Homecoming, With Blank', 'The whole town states the hook; one final measure is left for you.'],
].forEach(([id, name, description]) => def({
  id, name, description, category: 'relic', icon: '🎶',
  sellPrice: 300, buyPrice: 900,
}));

// --- Tools -----------------------------------------------------------------
def({
  id: 'tool-net', name: 'Bug Net', category: 'tool', icon: '🕸️',
  sellPrice: 0, buyPrice: 400,
  description: 'Muslin on a bent pipe. Swing near a bug — gently.',
});
def({
  id: 'tool-rod', name: 'Fishing Rod', category: 'tool', icon: '🎣',
  sellPrice: 0, buyPrice: 400,
  description: 'Cast at a shadow in the river, strike when the bobber dips.',
});
def({
  id: 'tool-shovel', name: 'Shovel', category: 'tool', icon: '⛏️',
  sellPrice: 0, buyPrice: 600,
  description: 'For the star-marked spots where the ground remembers something.',
});
def({
  id: 'tool-axe', name: 'Axe', category: 'tool', icon: '🪓',
  sellPrice: 0, buyPrice: 600,
  description: 'Fells dead trees for timber. The living ones, leave be.',
});
// Upgraded tools (crafted at the workbench).
def({
  id: 'tool-rod-steel', name: 'Steel Rod', category: 'tool', icon: '🎣',
  sellPrice: 0,
  description: 'A steel rod. Fish come quicker and the shadows are never shy.',
});
def({
  id: 'tool-net-fine', name: 'Fine-Mesh Net', category: 'tool', icon: '🕸️',
  sellPrice: 0,
  description: 'A wider, quieter net. Bugs barely notice the swing.',
});
def({
  id: 'tool-shovel-iron', name: 'Iron Shovel', category: 'tool', icon: '⛏️',
  sellPrice: 0,
  description: 'Iron-shod. Every dig turns up a little more.',
});
def({
  id: 'tool-axe-felling', name: 'Felling Axe', category: 'tool', icon: '🪓',
  sellPrice: 0,
  description: 'A proper felling axe. Fewer swings, more timber.',
});

// --- Clothing --------------------------------------------------------------
def({
  id: 'coat-postal', name: 'Postal Blue Coat', category: 'clothing', icon: '🧥',
  sellPrice: 120, buyPrice: 480, clothingColor: PALETTE_HEX.h4a5a78,
  description: 'Standard issue, last issued a lifetime ago.',
});
def({
  id: 'coat-ember', name: 'Ember Red Coat', category: 'clothing', icon: '🧥',
  sellPrice: 130, buyPrice: 520, clothingColor: PALETTE_HEX.h8a3a32,
  description: 'Dyed with ember berries. Reggie says it "goes hard."',
});
def({
  id: 'coat-moss', name: 'Moss Green Coat', category: 'clothing', icon: '🧥',
  sellPrice: 130, buyPrice: 520, clothingColor: PALETTE_HEX.h5a6b3f,
  description: 'Blends into the meadow. The bugs will never see you coming.',
});
def({
  id: 'coat-ivory', name: 'Ivory Duster', category: 'clothing', icon: '🧥',
  sellPrice: 200, buyPrice: 800, clothingColor: PALETTE_HEX.hd8cdb4,
  description: 'Impractical, dramatic, magnificent.',
});
def({
  id: 'coat-ink', name: 'Ink Black Coat', category: 'clothing', icon: '🧥',
  sellPrice: 200, buyPrice: 800, clothingColor: PALETTE_HEX.h2a2630,
  description: 'For postmasters with a mysterious past.',
});

// Reggie's rotating rail: forty wearable coats total. The current low-poly
// player rig treats clothing as fabric/dye rather than extra geometry, keeping
// silhouette and animation costs fixed while giving character creation a real
// palette.
const EXTRA_COATS: Array<[string, string, number, number, string]> = [
  ['coat-rain-blue','Rain Blue Mackintosh',PALETTE_HEX.h436b82,620,'Waxed canvas for postal rounds in a downpour.'],
  ['coat-storm','Storm Grey Slicker',PALETTE_HEX.h58616b,620,'The colour of weather arriving early.'],
  ['coat-puddle','Puddle Teal Coat',PALETTE_HEX.h397477,580,'Bright enough to find after rain.'],
  ['coat-cloud','Cloud White Raincoat',PALETTE_HEX.hc6c9c2,700,'Keeps the rain out and every smudge in.'],
  ['coat-lichen','Lichen Field Coat',PALETTE_HEX.h74805c,560,'Quiet green with brass seed-shaped buttons.'],
  ['coat-fern','Fern Frond Coat',PALETTE_HEX.h3f684b,600,'CATALOGER calls it excellent field camouflage.'],
  ['coat-sage','Sage Work Coat',PALETTE_HEX.h87947b,540,'Soft, useful, and already carrying three pockets.'],
  ['coat-pine','Pine Needle Coat',PALETTE_HEX.h354f42,640,'Dark evergreen wool with a resin-clean scent.'],
  ['coat-apple','Orchard Apple Coat',PALETTE_HEX.h9b3f35,600,'MARIGOLD approved the colour, then the stitching.'],
  ['coat-cider','Cider Brown Duster',PALETTE_HEX.h8a603f,580,'Warm brown canvas, happiest in autumn.'],
  ['coat-harvest','Harvest Gold Coat',PALETTE_HEX.hb17c32,660,'The exact colour of the last field before frost.'],
  ['coat-plum','Plum Preserve Coat',PALETTE_HEX.h6e455d,640,'Deep fruit dye that holds through winter.'],
  ['coat-frost','Frost Blue Duster',PALETTE_HEX.h9fb5c2,680,'Pale wool with a sharp silver lining.'],
  ['coat-snow','Snowdrop Coat',PALETTE_HEX.hd5d4c8,760,'Winter white, with one green thread at the cuff.'],
  ['coat-aurora','Aurora Green Coat',PALETTE_HEX.h6a9a86,720,'Changes character beneath the night lamps.'],
  ['coat-solstice','Solstice Navy Coat',PALETTE_HEX.h303c59,700,'A long blue night with polished buttons.'],
  ['coat-brass','Brass Button Coat',PALETTE_HEX.h8b7145,640,'Every button salvaged from a different uniform.'],
  ['coat-copper','Copper Patina Coat',PALETTE_HEX.h527d72,680,'Green-blue dye over rust-coloured seams.'],
  ['coat-iron','Ironwork Coat',PALETTE_HEX.h41464b,660,'Foundry charcoal with a practical short hem.'],
  ['coat-rivet','Rivet Silver Coat',PALETTE_HEX.h858b8d,740,'REGGIE insists the metallic thread is tasteful.'],
  ['coat-rose','Rosehip Coat',PALETTE_HEX.ha5565e,620,'A winter red, softer than ember.'],
  ['coat-petal','Petal Pink Duster',PALETTE_HEX.hc18491,680,'Pale blossom dye with storm-grey lining.'],
  ['coat-lilac','Dusk Lilac Coat',PALETTE_HEX.h7c6b91,660,'The meadow colour five minutes after sunset.'],
  ['coat-marigold','Marigold Coat',PALETTE_HEX.hc98232,620,'Impossible to lose in tall grass.'],
  ['coat-cream','Bakery Cream Coat',PALETTE_HEX.hc8ad87,580,'Flour-coloured, though Reggie denies the connection.'],
  ['coat-cocoa','Cocoa Work Coat',PALETTE_HEX.h6a4b3e,560,'A dependable brown with reinforced elbows.'],
  ['coat-cherry','Festival Cherry Coat',PALETTE_HEX.had3940,720,'Ribbon-red and meant for the dancing square.'],
  ['coat-banner','Banner Blue Coat',PALETTE_HEX.h405f91,700,'The old town blue, restored from a faded flag.'],
  ['coat-star','Paper Star Coat',PALETTE_HEX.hc39b45,760,'Gold thread catches each lamp on the plaza.'],
  ['coat-midnight','Midnight Watch Coat',PALETTE_HEX.h252b3d,780,'WICK says it makes the lanterns look brighter.'],
  ['coat-archive','Archive Green Coat',PALETTE_HEX.h46594b,680,'Drawer-felt green with cream label stitching.'],
  ['coat-parchment','Parchment Duster',PALETTE_HEX.hb9a77e,660,'A letter-coloured coat for a letter-carrying life.'],
  ['coat-telegram','Telegram Red Coat',PALETTE_HEX.h8f3034,700,'Urgent red with a single black stripe.'],
  ['coat-tide','Low Tide Coat',PALETTE_HEX.h567987,620,'Blue-grey canvas, salt-soft at the hem.'],
  ['coat-deepsea','Deep Sea Coat',PALETTE_HEX.h273f52,760,'BUOY calls it proper water, right before dark.'],
];
for (const [id, name, clothingColor, buyPrice, description] of EXTRA_COATS) {
  def({
    id, name, category:'clothing', icon:'🧥',
    sellPrice:Math.round(buyPrice / 4), buyPrice, clothingColor, description,
  });
}

// --- Furniture -------------------------------------------------------------
// Registered from the furniture catalogue so a new piece is one data entry,
// not an item def plus a mesh case plus a shop listing.
for (const f of FURNITURE) {
  def({
    id: f.id,
    name: f.name,
    category: 'furniture',
    icon: f.icon,
    sellPrice: Math.round(f.price / 3),
    buyPrice: f.price,
    description: f.description,
  });
}

/** Convenience: item lookup that throws on unknown ids (catches data typos). */
export function item(id: string): ItemDef {
  const found = ITEMS[id];
  if (!found) throw new Error(`Unknown item id: ${id}`);
  return found;
}

/** True if the current hour (0-24) falls in a window that may wrap midnight. */
export function inHourWindow(hour: number, [start, end]: [number, number]): boolean {
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
