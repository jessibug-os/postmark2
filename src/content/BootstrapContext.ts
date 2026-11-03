/** Selected before importing the game or any module that constructs its world. */
export interface BootstrapContext {
  readonly contentId: 'kindly-forward' | 'little-harbor';
  readonly mapId: string;
  readonly saveNamespace: 'postmark-save-v3' | 'little-harbor-save-v1';
  readonly slotId: 1 | 2 | 3;
}

let selected: Readonly<BootstrapContext> | undefined;

/** Repeated identical configuration is safe; changing a live world is not. */
export function configureBootstrap(context: BootstrapContext): Readonly<BootstrapContext> {
  const namespaces = {
    'kindly-forward': 'postmark-save-v3',
    'little-harbor': 'little-harbor-save-v1',
  } as const;
  if (!Object.hasOwn(namespaces, context.contentId)) {
    throw new Error(`Unknown content pack: ${context.contentId}`);
  }
  if (context.saveNamespace !== namespaces[context.contentId]) {
    throw new Error(`Save namespace does not belong to ${context.contentId}`);
  }
  if (typeof context.mapId !== 'string' || !context.mapId.trim() || context.mapId !== context.mapId.trim()) {
    throw new Error('Bootstrap requires a nonempty, trimmed map ID');
  }
  if (![1, 2, 3].includes(context.slotId)) throw new Error('Invalid bootstrap save slot');
  if (selected) {
    if (selected.contentId !== context.contentId || selected.mapId !== context.mapId ||
        selected.saveNamespace !== context.saveNamespace || selected.slotId !== context.slotId) {
      throw new Error('Cannot change bootstrap context in a running page');
    }
    return selected;
  }
  selected = Object.freeze({
    contentId: context.contentId,
    mapId: context.mapId,
    saveNamespace: context.saveNamespace,
    slotId: context.slotId,
  });
  return selected;
}

export function bootstrapContext(): Readonly<BootstrapContext> {
  if (!selected) throw new Error('Configure bootstrap context before importing the game');
  return selected;
}

/** Authoring tools still construct preview worlds without a game entry. */
export function configuredBootstrapContext(): Readonly<BootstrapContext> | undefined {
  return selected;
}
