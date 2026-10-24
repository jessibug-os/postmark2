import { CellSnowField } from './SnowField';
import { wetnessField } from './WetnessState';

/** HMR-stable live snow field paired with the one live moisture field. */
const runtime = globalThis as typeof globalThis & { __postmarkSnowField?: CellSnowField };
export const snowField = runtime.__postmarkSnowField ??= new CellSnowField(wetnessField);
