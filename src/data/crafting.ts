/**
 * The workbench. Raw materials (timber, cut stone, scrap, relics) become
 * furniture, better tools, and town-decoration projects. Recipes unlock as
 * the town grows so the crafting list grows with the player.
 */

export interface Recipe {
  id: string;
  /** Item id produced. */
  result: string;
  resultCount: number;
  /** [itemId, count] ingredients. */
  cost: Array<[string, number]>;
  /** Gears also required, if any. */
  gears?: number;
  category: 'furniture' | 'tool' | 'town';
  label: string;
  blurb: string;
}

export const RECIPES: Recipe[] = [
  // --- Furniture (from scavenged materials, cheaper than buying) -----------
  { id: 'craft-bench', result: 'furn-bench', resultCount: 1, cost: [['timber', 4]], category: 'furniture', label: 'Garden Bench', blurb: 'A place to sit and watch the town go by.' },
  { id: 'craft-planter', result: 'furn-planter', resultCount: 1, cost: [['timber', 2], ['stone', 2]], category: 'furniture', label: 'Flower Planter', blurb: 'Marigold-approved.' },
  { id: 'craft-lamp', result: 'furn-lamp', resultCount: 1, cost: [['scrap-metal', 3], ['stone', 1]], category: 'furniture', label: 'Gas Lamp', blurb: 'Keeps a corner of the night polite.' },
  { id: 'craft-fountain', result: 'furn-fountain', resultCount: 1, cost: [['stone', 6], ['scrap-metal', 4]], gears: 300, category: 'furniture', label: 'Cog Fountain', blurb: 'The plaza deserves a centrepiece.' },
  { id: 'craft-postbox', result: 'furn-postbox', resultCount: 1, cost: [['scrap-metal', 5], ['timber', 2]], gears: 200, category: 'furniture', label: 'Brass Postbox', blurb: 'A postmaster can never have too many.' },
  // Postal set: the pieces that make the front room look like an office.
  { id: 'craft-sorting-desk', result: 'furn-sorting-desk', resultCount: 1, cost: [['timber', 8], ['scrap-metal', 2]], gears: 250, category: 'furniture', label: 'Sorting Desk', blurb: 'Thirty-six pigeonholes and nothing yet to sort.' },
  { id: 'craft-mail-trolley', result: 'furn-mail-trolley', resultCount: 1, cost: [['timber', 4], ['scrap-metal', 4]], category: 'furniture', label: 'Mail Trolley', blurb: 'Squeaks companionably.' },
  { id: 'craft-parcel-stack', result: 'furn-parcel-stack', resultCount: 1, cost: [['timber', 3]], category: 'furniture', label: 'Parcel Stack', blurb: 'Addressed to nobody in particular.' },
  { id: 'craft-scales', result: 'furn-scales', resultCount: 1, cost: [['scrap-metal', 4], ['timber', 1]], gears: 150, category: 'furniture', label: 'Postal Scales', blurb: 'Still calibrated after forty years.' },
  // Garden set.
  { id: 'craft-birdbath', result: 'furn-birdbath', resultCount: 1, cost: [['stone', 6]], category: 'furniture', label: 'Birdbath', blurb: 'The sparrows will find it within the hour.' },
  { id: 'craft-trellis', result: 'furn-trellis', resultCount: 1, cost: [['timber', 5]], category: 'furniture', label: 'Rose Trellis', blurb: 'Something has been waiting to climb.' },
  { id: 'craft-water-barrel', result: 'furn-water-barrel', resultCount: 1, cost: [['timber', 4], ['scrap-metal', 2]], category: 'furniture', label: 'Rain Barrel', blurb: 'Full again by morning.' },
  // Parlour set.
  { id: 'craft-armchair', result: 'furn-armchair', resultCount: 1, cost: [['timber', 6], ['wild-chicory', 4]], gears: 300, category: 'furniture', label: 'Wingback Chair', blurb: 'Deep enough to lose an evening in.' },
  { id: 'craft-side-table', result: 'furn-side-table', resultCount: 1, cost: [['timber', 3]], category: 'furniture', label: 'Side Table', blurb: 'Exactly one cup wide.' },
  { id: 'craft-bookcase', result: 'furn-bookcase', resultCount: 1, cost: [['timber', 9]], gears: 200, category: 'furniture', label: 'Bookcase', blurb: 'For the ledgers you keep meaning to read.' },
  { id: 'craft-floor-lamp', result: 'furn-floor-lamp', resultCount: 1, cost: [['scrap-metal', 4], ['amber-cell', 1]], category: 'furniture', label: 'Standing Lamp', blurb: 'Reads warmer than it should.' },
  { id: 'craft-hearth-rug', result: 'furn-hearth-rug', resultCount: 1, cost: [['wild-chicory', 6]], category: 'furniture', label: 'Hearth Rug', blurb: 'Somewhere for the day to end.' },
  { id: 'craft-mantel-clock', result: 'furn-mantel-clock', resultCount: 1, cost: [['scrap-metal', 5], ['timber', 3]], gears: 350, category: 'furniture', label: 'Mantel Clock', blurb: 'It has not stopped once.' },
  // Workshop set.
  { id: 'craft-workbench-piece', result: 'furn-workbench', resultCount: 1, cost: [['timber', 8], ['scrap-metal', 3]], category: 'furniture', label: 'Workbench', blurb: 'Scored, scorched, much repaired.' },
  { id: 'craft-tool-rack', result: 'furn-tool-rack', resultCount: 1, cost: [['timber', 4], ['scrap-metal', 2]], category: 'furniture', label: 'Tool Rack', blurb: 'Everything in its painted outline.' },
  { id: 'craft-anvil', result: 'furn-anvil', resultCount: 1, cost: [['scrap-metal', 10], ['stone', 4]], gears: 400, category: 'furniture', label: 'Anvil', blurb: 'Immovable, and proud of it.' },
  { id: 'craft-crate-stack', result: 'furn-crate-stack', resultCount: 1, cost: [['timber', 4]], category: 'furniture', label: 'Crate Stack', blurb: 'Storage, or seating.' },
  { id: 'craft-oil-lamp', result: 'furn-oil-lamp', resultCount: 1, cost: [['scrap-metal', 3], ['amber-cell', 1]], category: 'furniture', label: 'Oil Lamp', blurb: 'Older than the electric ones, and twice as reliable.' },
  // Kitchen set.
  { id: 'craft-stove', result: 'furn-stove', resultCount: 1, cost: [['scrap-metal', 9], ['stone', 5]], gears: 450, category: 'furniture', label: 'Iron Stove', blurb: 'Holds its heat all night.' },
  { id: 'craft-cupboard', result: 'furn-cupboard', resultCount: 1, cost: [['timber', 8]], gears: 200, category: 'furniture', label: 'Kitchen Cupboard', blurb: 'Cheerfully empty.' },
  { id: 'craft-kitchen-table', result: 'furn-kitchen-table', resultCount: 1, cost: [['timber', 6]], category: 'furniture', label: 'Scrubbed Table', blurb: 'Pale from a century of hands.' },
  { id: 'craft-ladderback', result: 'furn-ladderback', resultCount: 1, cost: [['timber', 3]], category: 'furniture', label: 'Ladderback Chair', blurb: 'Creaks in a friendly way.' },
  { id: 'craft-kettle-shelf', result: 'furn-kettle-shelf', resultCount: 1, cost: [['timber', 3], ['scrap-metal', 2]], category: 'furniture', label: 'Kettle Shelf', blurb: 'The kettle is always warm.' },
  // Archive set — unlocked by the sort of player who donates.
  { id: 'craft-specimen-cabinet', result: 'furn-specimen-cabinet', resultCount: 1, cost: [['timber', 10], ['scrap-metal', 3]], gears: 500, category: 'furniture', label: 'Specimen Cabinet', blurb: 'Cataloger 734 labelled the drawers unprompted.' },
  { id: 'craft-bell-jar', result: 'furn-bell-jar', resultCount: 1, cost: [['scrap-metal', 4], ['timber', 4]], gears: 300, category: 'furniture', label: 'Bell Jar Stand', blurb: 'Worth the glass.' },
  { id: 'craft-reading-desk', result: 'furn-reading-desk', resultCount: 1, cost: [['timber', 7]], gears: 200, category: 'furniture', label: 'Reading Desk', blurb: 'Angled for long nights.' },
  { id: 'craft-globe', result: 'furn-globe', resultCount: 1, cost: [['scrap-metal', 5], ['timber', 4]], gears: 400, category: 'furniture', label: 'Brass Globe', blurb: 'The place-names no longer match anywhere.' },
  { id: 'craft-map-stand', result: 'furn-map-stand', resultCount: 1, cost: [['timber', 5]], category: 'furniture', label: 'Map Stand', blurb: 'A survey of a county that files no returns.' },
  // Seaside set.
  { id: 'craft-buoy-float', result: 'furn-buoy-float', resultCount: 1, cost: [['scrap-metal', 4], ['timber', 2]], category: 'furniture', label: 'Harbour Buoy', blurb: 'Marked a channel that silted up.' },
  { id: 'craft-net-rack', result: 'furn-net-rack', resultCount: 1, cost: [['timber', 5]], category: 'furniture', label: 'Net Rack', blurb: 'Mending nets is restful work.' },
  { id: 'craft-driftwood-stool', result: 'furn-driftwood-stool', resultCount: 1, cost: [['timber', 2]], category: 'furniture', label: 'Driftwood Stool', blurb: 'The sea made most of it.' },
  { id: 'craft-lantern-post', result: 'furn-lantern-post', resultCount: 1, cost: [['scrap-metal', 5], ['amber-cell', 1]], gears: 250, category: 'furniture', label: 'Harbour Lantern', blurb: 'Points the way in.' },
  { id: 'craft-tackle-chest', result: 'furn-tackle-chest', resultCount: 1, cost: [['timber', 5], ['scrap-metal', 2]], category: 'furniture', label: 'Tackle Chest', blurb: 'Six compartments of optimism.' },
  // Town set.
  { id: 'craft-notice-post', result: 'furn-notice-post', resultCount: 1, cost: [['timber', 4]], category: 'furniture', label: 'Notice Post', blurb: 'You post the news. You are also the news.' },
  { id: 'craft-hedge-planter', result: 'furn-hedge-planter', resultCount: 1, cost: [['timber', 4], ['wild-chicory', 3]], category: 'furniture', label: 'Hedge Planter', blurb: 'Wick finds it very calming.' },

  // --- Tool upgrades (each meaningfully improves its activity) -------------
  { id: 'craft-rod2', result: 'tool-rod-steel', resultCount: 1, cost: [['scrap-metal', 6], ['timber', 3]], gears: 400, category: 'tool', label: 'Steel Rod', blurb: 'Bites come faster and shadows spawn readier. Fishing, upgraded.' },
  { id: 'craft-net2', result: 'tool-net-fine', resultCount: 1, cost: [['scrap-metal', 4], ['timber', 4]], gears: 400, category: 'tool', label: 'Fine-Mesh Net', blurb: 'A wider, quieter swing — bugs spook less.' },
  { id: 'craft-shovel2', result: 'tool-shovel-iron', resultCount: 1, cost: [['scrap-metal', 6], ['stone', 4]], gears: 400, category: 'tool', label: 'Iron Shovel', blurb: 'Digs turn up more, and the odd extra amber cell.' },
  { id: 'craft-axe2', result: 'tool-axe-felling', resultCount: 1, cost: [['scrap-metal', 6], ['timber', 5]], gears: 400, category: 'tool', label: 'Felling Axe', blurb: 'Fells a dead tree in fewer swings, for more timber.' },
];

/** Tool upgrade lookup: base tool -> upgraded tool. */
export const TOOL_UPGRADES: Record<string, { to: string; label: string }> = {
  'tool-rod': { to: 'tool-rod-steel', label: 'Steel Rod' },
  'tool-net': { to: 'tool-net-fine', label: 'Fine-Mesh Net' },
  'tool-shovel': { to: 'tool-shovel-iron', label: 'Iron Shovel' },
  'tool-axe': { to: 'tool-axe-felling', label: 'Felling Axe' },
};

/** Which base tool an (upgraded) tool acts as. */
export function baseTool(id: string): string {
  const map: Record<string, string> = {
    'tool-rod-steel': 'tool-rod',
    'tool-net-fine': 'tool-net',
    'tool-shovel-iron': 'tool-shovel',
    'tool-axe-felling': 'tool-axe',
  };
  return map[id] ?? id;
}
