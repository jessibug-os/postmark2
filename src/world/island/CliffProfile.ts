/** Shared elevation interpolation for cliff shoulders and earthen ramps. */
export interface CliffSample { height: number; ramp: boolean; water: boolean }

export function cliffProfile(samples: CliffSample[], x: number, z: number): number | null {
  const ramp = samples.every(s => s.ramp || s.height === samples[0].height);
  const ease = (v: number) => v * v * (3 - 2 * v);
  const u = ramp ? x : ease(x), v = ramp ? z : ease(z);
  return (samples[0].height * (1-u) + samples[1].height * u) * (1-v)
    + (samples[2].height * (1-u) + samples[3].height * u) * v;
}
