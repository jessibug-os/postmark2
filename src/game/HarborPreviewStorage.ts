import type { SaveStorage } from '../systems/SaveSystem';

/** Tab-scoped authoring snapshots are never production game slots. */
export function harborPreviewStorage(storage: SaveStorage, room: 'home' | 'cafe' | 'world' = 'home'): SaveStorage {
  const keyFor = (key: string) => {
    if (!/^little-harbor-save-v1-slot-[123]-(a|b|head)$/.test(key)) throw new Error('Unexpected preview storage key');
    return `little-harbor-preview-v1${room === 'home' ? '' : `:${room}`}:${key}`;
  };
  return {
    getItem: key => storage.getItem(keyFor(key)),
    setItem: (key, value) => storage.setItem(keyFor(key), value),
    removeItem: key => storage.removeItem(keyFor(key)),
  };
}
