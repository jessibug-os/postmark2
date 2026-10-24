/**
 * Every authored `.scene` on disk, as text, bundled.
 *
 * The preview used to fetch its scene from the dev-server API, which cost about
 * 400ms of the time between asking for a beat and seeing it — a round trip, a
 * parse on the server and a JSON envelope, to fetch a file that ships in the
 * bundle anyway. Vite reloads the module when the file changes, so this is
 * never staler than the API was, and an unsaved editor buffer arrives over
 * `postMessage` regardless.
 */
const SOURCES = import.meta.glob('../scenes/*.scene', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BY_ID = new Map(
  Object.entries(SOURCES).map(([path, text]) => [
    (path.split('/').pop() ?? path).replace(/\.scene$/, ''),
    text,
  ]),
);

/** One scene's source by id, or null if nothing on disk answers to it. */
export function sceneSource(id: string): string | null {
  return BY_ID.get(id) ?? null;
}

/** Every scene id that ships with the build. */
export function sceneIds(): string[] {
  return [...BY_ID.keys()].sort();
}
