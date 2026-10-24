/**
 * How far a single cell's weather rates may stray from the island average.
 *
 * `1` is the original spread. Raising it scales each cell's *deviation* from
 * the mean without moving the mean, so a storm still soaks or buries the island
 * on the same schedule — it just arrives far more unevenly. That disparity is
 * what gives the quantised levels in `levels.ts` something to quantise: with a
 * narrow spread every cell climbs together and the whole island steps from one
 * level to the next at once, which reads as a wash with hard edges rather than
 * as patches of different depth.
 *
 * Both fields honour it, and both preserve their own mean while doing so.
 */
export const ACCUMULATION_SPREAD = 2;
