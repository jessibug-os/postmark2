/** Visual swash, independent of collision and of the wall clock. Units are metres/seconds. */
export const SHORE_CYCLE = { seconds: 7.8, advance: 0.36, hold: 0.43, low: -0.65, high: 0.95 } as const;
const smooth = (x: number): number => x * x * (3 - 2 * x);
export function shorePhase(seconds: number, x: number, z: number): number {
  const phase = seconds / SHORE_CYCLE.seconds + Math.sin(x * 0.045 + z * 0.027) * 0.18 + Math.cos(z * 0.038) * 0.1;
  return phase - Math.floor(phase);
}
export function shoreFront(phase: number): number {
  const p = phase - Math.floor(phase);
  const reach = p < SHORE_CYCLE.advance ? smooth(p / SHORE_CYCLE.advance)
    : p < SHORE_CYCLE.hold ? 1 : 1 - smooth((p - SHORE_CYCLE.hold) / (1 - SHORE_CYCLE.hold));
  return SHORE_CYCLE.low + (SHORE_CYCLE.high - SHORE_CYCLE.low) * reach;
}
