import { buildTemplateLayout } from './island/generatedLayout';
import { templateOrDefault } from './island/TemplateLibrary';
import { activeIslandSave } from '../systems/SaveSystem';

/**
 * Which map the game runs on.
 *
 * St. Mystere is an authored `.island` map, not a seeded generation. The id
 * lives here so a save can pin it: a save made on one map must never load
 * against another, which is the same rule the seed used to carry.
 *
 * `?map=` lets a reviewer walk any map without a rebuild. It is a review
 * affordance and not the save format.
 */
function chosenMap(): string | undefined {
  try {
    const raw = new URLSearchParams(window.location.search).get('map');
    if (raw !== null && raw.trim() !== '') return raw.trim();
  } catch {
    // Non-browser callers (scripts, tests) fall through to the save, then the default.
  }
  // A save written before islands were authored names a seed and a snapshot,
  // neither of which can be replayed now that the passes are deleted. It loads
  // on the default map rather than being rejected.
  return activeIslandSave()?.templateId;
}

export const ISLAND_MAP_ID = chosenMap();

/**
 * The island the game is standing on — an authored `.island` map.
 *
 * This used to be `buildGeneratedLayout(seed)`: six solver passes and a
 * resample loop deciding the map at boot. The map is now a file a human drew in
 * `/island`, and the seed survives only until the save format stops carrying
 * one. The seeded path is still callable and is deleted with the solvers.
 */
export const ACTIVE_LAYOUT = buildTemplateLayout(templateOrDefault(ISLAND_MAP_ID));

/** Ground queries for the active map. `terrain.ts` routes every height here. */
export const ACTIVE_FIELD = ACTIVE_LAYOUT.field ?? null;
export const ACTIVE_CELLS = ACTIVE_LAYOUT.cells ?? null;

/** Shared map geography, imported by both terrain and TownMap. */
export const MAP = ACTIVE_LAYOUT.bounds;

/** Town plaza center — the post office landmark the opening walks to. */
export const PLAZA = ACTIVE_LAYOUT.plaza;

export const SPOTS = ACTIVE_LAYOUT.spots;
