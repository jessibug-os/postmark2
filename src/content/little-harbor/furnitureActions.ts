import type { HarborState } from './types';
/** Shared use descriptors keep ordinary use separate from decoration. */
export const FURNITURE_ACTIONS: Readonly<Record<string, { kind: 'toggle-light' | 'storage' | 'sleep'; label: string }>> = {
  bed: { kind: 'sleep', label: 'Sleep until morning' },
  trunk: { kind: 'storage', label: 'Open storage' },
  lamp: { kind: 'toggle-light', label: 'Toggle lamp' },
};
export const lampFactKey = (instanceId: string) => `furniture:${instanceId}:light-on`;
export const lampIsOn = (facts: HarborState['facts'], instanceId: string) => facts[lampFactKey(instanceId)] !== false;
