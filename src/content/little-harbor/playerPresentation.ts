import type { Player } from '../../player/Player';

/** The provisional shared rig measures ~2.48 m tall at its legacy scale.
 * Harbor's metre-based interiors use a ~1.69 m player; retain the shared
 * locomotion owner and its 0.45 m collision radius. Final clothing is pending. */
export const HARBOR_PLAYER_SCALE = 0.68;
export function applyHarborPlayerPresentation(player: Player): void {
  player.object.scale.setScalar(HARBOR_PLAYER_SCALE);
}
