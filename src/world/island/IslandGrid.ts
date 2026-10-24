/**
 * Grid arithmetic shared by every solver pass.
 *
 * Each pass used to define its own `key` and `inGrid` as local consts inside
 * one enormous function. Extracting them is what lets the passes become
 * separate modules at all, and it removes the standing chance that two copies
 * disagree about what a key is.
 */
import { GRID_COLS, GRID_ROWS } from './AcreLibrary';

/** Acre coordinates packed into one integer, row-major. */
export const key = (col: number, row: number): number => row * GRID_COLS + col;

export const colOf = (k: number): number => k % GRID_COLS;
export const rowOf = (k: number): number => Math.floor(k / GRID_COLS);

export const inGrid = (col: number, row: number): boolean =>
  col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;

/** Uniform choice from a list. Never returns undefined for a non-empty list. */
export function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** A land set as coordinate pairs, in key order. */
export function acresOf(land: ReadonlySet<number>): { c: number; r: number }[] {
  return [...land].map((k) => ({ c: colOf(k), r: rowOf(k) }));
}
