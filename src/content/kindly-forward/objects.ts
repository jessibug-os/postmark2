/**
 * Every authored `.gameobj` in this content pack, parsed once.
 *
 * Loaded through Vite's raw glob, the same way `SetLibrary` loads sets and
 * `AcreLibrary` loads pieces: the files are content, they ship with the bundle,
 * and one that fails to parse should take the build down rather than the world.
 *
 * **This is the content side of the seam.** The format and the systems that
 * read components are engine (`src/world/objects/`); which objects exist is
 * this pack's business, and the engine reaches them through `activePack`.
 */
import { parseGameObject, type GameObject } from '../../world/objects/GameObjectFormat';

const SOURCES = import.meta.glob('./objects/*.gameobj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const KINDLY_FORWARD_GAME_OBJECTS: readonly GameObject[] = Object.keys(SOURCES)
  .sort()
  .map((file) => parseGameObject(SOURCES[file], file.split('/').pop() ?? file));
