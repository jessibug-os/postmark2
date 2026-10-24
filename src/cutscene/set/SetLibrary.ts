/**
 * Every authored `.set` on disk, parsed once.
 *
 * Loaded through Vite's raw glob, the same way `AcreLibrary` loads pieces: the
 * files are content, they ship with the bundle, and a set that fails to parse
 * should take the build down rather than the opening.
 */
import { parseSet, type CutsceneSet } from './SetFormat';

const SOURCES = import.meta.glob('../sets/*.set', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ON_DISK: readonly CutsceneSet[] = Object.keys(SOURCES)
  .sort()
  .map((file) => parseSet(SOURCES[file], file.split('/').pop() ?? file));

const BY_ID = new Map(ON_DISK.map((set) => [set.id, set]));

export function authoredSets(): readonly CutsceneSet[] {
  return ON_DISK;
}

/** One set by id. Throws by name — a missing set is an authoring mistake. */
export function setById(id: string): CutsceneSet {
  const found = BY_ID.get(id);
  if (!found) {
    throw new Error(`no set "${id}" (have ${[...BY_ID.keys()].join(', ') || 'none'})`);
  }
  return found;
}
