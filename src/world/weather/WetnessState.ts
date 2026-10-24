import { ACTIVE_CELLS } from '../mapConstants';
import { CellWetnessField } from './WetnessField';

/**
 * The one live moisture field shared by Weather, terrain and diagnostics.
 *
 * Keep it on `globalThis`, not merely in module scope. Vite HMR can evaluate a
 * changed singleton module under a new timestamp while an already-compiled
 * material still holds the previous module's texture. Weather then updates the
 * new field while the ground samples the old all-zero one. A global owner makes
 * those module generations converge on the same field and texture.
 */
const runtime = globalThis as typeof globalThis & {
  __postmarkWetnessField?: CellWetnessField;
};

export const wetnessField = runtime.__postmarkWetnessField ??=
  new CellWetnessField(undefined, undefined, ACTIVE_CELLS);
