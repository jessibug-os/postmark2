/**
 * Every authored island map on disk.
 *
 * The counterpart to `PieceLibrary`, and deliberately the same shape: files are
 * globbed raw at module load, parsed once, and served by id. `IslandTemplate.ts`
 * stays free of `import.meta.glob` so the format can be tested in node without a
 * bundler, which is the same split `AcreFormat` / `PieceLibrary` uses.
 *
 * **Which map the game opens on** is `DEFAULT_TEMPLATE_ID`. When there are
 * several finished maps this becomes a choice at new-game time — the ACNL
 * shape, where the map you pick is a decision you live with — but that is a
 * save-format change and not this one.
 */
import { parseIsland, type IslandTemplate } from './IslandTemplate';

const sources = import.meta.glob('./templates/*.island', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Every map, in filename order. */
export const TEMPLATES: readonly IslandTemplate[] = Object.entries(sources)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([path, text]) => parseIsland(text, path));

const BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

/**
 * The map a new game starts on.
 *
 * Moved off `seed-1` on 2026-08-22 for a reason that is not taste: **seed-1
 * carries no `post-office` piece at all.** `island.anchors.postOffice` fell back
 * to the middle of the land, so the shipped opening staged Albert's reveal —
 * the payoff of the whole sequence — in an empty field, and `npm run scenes`
 * reports it. Four of the eight maps have the landmark; three of those pass
 * every shot; of those three this one has the shortest dock-to-office walk
 * (42m against 59m), which is the stretch `/story` and the integration plan both
 * flag as the sequence's real risk.
 *
 * One constant, trivially reversible — but reverting it without redrawing
 * seed-1's post-office acre in `/island` puts the reveal back in the field.
 */
export const DEFAULT_TEMPLATE_ID = 'seed-80085';

export function template(id: string): IslandTemplate | null {
  return BY_ID.get(id) ?? null;
}

/**
 * The map to open, by id, falling back to the first on disk.
 *
 * A named map that has gone missing is worth loading *something* for rather
 * than throwing: a save pointing at a deleted map should put the player on an
 * island, not on a stack trace.
 */
export function templateOrDefault(id: string = DEFAULT_TEMPLATE_ID): IslandTemplate {
  const found = BY_ID.get(id) ?? BY_ID.get(DEFAULT_TEMPLATE_ID) ?? TEMPLATES[0];
  if (!found) throw new Error('no .island templates on disk — the game has no map');
  return found;
}
