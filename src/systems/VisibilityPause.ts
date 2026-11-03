import type { SimClock } from './SimClock';
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Owns one pause lease, independently of menus, scenes and other pause owners. */
export function bindVisibilityPause(clock: SimClock, source: VisibilitySource,
  onResume: () => void): () => void {
  let release: (() => void) | undefined;
  const update = () => {
    if (source.hidden) release ??= clock.acquirePause('hidden');
    else if (release) {
      release(); release = undefined;
      onResume();
    }
  };
  source.addEventListener('visibilitychange', update);
  update();
  return () => {
    source.removeEventListener('visibilitychange', update);
    release?.(); release = undefined;
  };
}
