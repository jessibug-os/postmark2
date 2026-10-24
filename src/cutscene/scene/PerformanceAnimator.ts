import * as THREE from 'three';
import { performanceLoops } from '../../characters/clipVocabulary';

/** A staged spirit or prop has authored performances, but no walking state machine. */
export class PerformanceAnimator {
  private mixer: THREE.AnimationMixer;
  private action: THREE.AnimationAction | null = null;
  readonly performances: string[];

  constructor(private root: THREE.Object3D, private clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    this.performances = clips.map(clip => clip.name);
  }

  takeDirection(): void {}
  releaseDirection(): void { this.clearPerformance(); }
  update(dt: number): void { this.mixer.update(dt); }
  clearPerformance(): void { this.mixer.stopAllAction(); this.action = null; }
  perform(name: string, loop = performanceLoops(name)): boolean {
    const clip = THREE.AnimationClip.findByName(this.clips, name);
    if (!clip) return false;
    // Asking for the clip that is already running is a no-op, not a restart.
    //
    // `reset()` sends an action back to frame zero, and `clipAction` returns
    // the *same* action for the same clip — so there is no crossfade to hide
    // it. Four consecutive beats in the opening pose the Keeper as
    // `keeper_talk`, which meant his talk animation snapped to its first frame
    // at every beat boundary while he was in the middle of a sentence.
    //
    // Only for looping clips. A one-shot asked for twice is a deliberate
    // re-trigger — somebody wants it played again — and clamps at its end
    // rather than looping, so it has nothing left to interrupt.
    if (loop && this.action?.getClip() === clip && this.action.isRunning()) return true;
    const previous = this.action;
    const next = this.mixer.clipAction(clip).reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.play();
    if (previous && previous !== next) next.crossFadeFrom(previous, 0.45, false);
    this.action = next;
    this.mixer.update(0);
    return true;
  }
  dispose(): void { this.clearPerformance(); this.mixer.uncacheRoot(this.root); }
}
