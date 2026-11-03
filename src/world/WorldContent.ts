import { ACTIVE_PLOTS, activeGameObject, type PlotDef } from '../content/activePack';
import type { GameObject } from './objects/GameObjectFormat';
import type { BootstrapContext } from '../content/BootstrapContext';

export interface WorldContent {
  readonly plots: readonly PlotDef[];
  object(id: string): GameObject | undefined;
  /** Authored game worlds reject unresolved fixtures; legacy authoring previews warn. */
  readonly strictFixtures: boolean;
}
export const LEGACY_WORLD_CONTENT: WorldContent = {
  plots: ACTIVE_PLOTS, object: activeGameObject, strictFixtures: false,
};
export function resolveWorldContent(contentId: BootstrapContext['contentId'] | undefined,
  supplied?: WorldContent): WorldContent {
  if (supplied) return supplied;
  if (contentId === 'little-harbor') throw new Error('Little Harbor requires explicit world content; refusing legacy fixture fallback');
  return LEGACY_WORLD_CONTENT;
}
