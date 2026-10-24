/**
 * A `localStorage` stub, installed before any module is imported.
 *
 * `src/world/mapConstants.ts` reads the active island save *at module load*,
 * so importing anything downstream of `world/terrain` in a bare Node process
 * throws before a single test runs. That is a real wart in the runtime — module
 * initialisation should not depend on browser storage — but it is not this
 * plan's to fix, and a five-line in-memory shim is a much smaller lie than
 * pulling jsdom in for one getter.
 *
 * Node exposes a `localStorage` global of its own, but only backed by a real
 * file — without `--localstorage-file` it is present and every method on it is
 * missing, which is why the test is "is `getItem` callable" rather than "does
 * the global exist".
 */
if (typeof (globalThis as { localStorage?: { getItem?: unknown } }).localStorage?.getItem
  !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    },
    configurable: true,
  });
}
