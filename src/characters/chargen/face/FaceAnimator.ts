import type * as THREE from 'three';
import { FACE_SIZE } from '../facePaint';
import { paintFaceLayers } from './paintFaceLayers';
import { MOUTH_FRAMES, type Expression, type FaceSpec } from './types';

export interface FaceAnimator {
  setSpec(skinHex: string, spec: FaceSpec): void;
  setExpression(expression: Expression, seconds?: number): void;
  talk(active: boolean): void;
  update(dt: number): void;
}

const BLINK_SECONDS = 0.12;
const nextBlink = (): number => 2.5 + Math.random() * 3.5;
const nextFlap = (): number => (1 / 8) * (0.75 + Math.random() * 0.5);

export function createFaceAnimator(
  ctx: CanvasRenderingContext2D,
  texture: THREE.Texture,
  skinHex: string,
  spec: FaceSpec,
): FaceAnimator {
  let skin = skinHex;
  let face = spec;
  const frames = new Map<string, HTMLCanvasElement>();
  let shown = '';
  let held: Expression | null = null;
  let heldTime = Infinity;
  let blinkIn = nextBlink();
  let blinkTime = 0;
  let talking = false;
  let flapIn = 0;
  let mouth = 0;

  const frame = (expression: Expression, mouthIndex: number): HTMLCanvasElement => {
    const key = `${expression}:${mouthIndex}`;
    let canvas = frames.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = FACE_SIZE;
      paintFaceLayers(canvas.getContext('2d')!, skin, face, expression, MOUTH_FRAMES[mouthIndex]);
      frames.set(key, canvas);
    }
    return canvas;
  };

  const present = (): void => {
    const expression = held ?? (blinkTime > 0 ? 'blink' : 'idle');
    const mouthIndex = talking ? mouth : 0;
    const key = `${expression}:${mouthIndex}`;
    if (key === shown) return;
    shown = key;
    ctx.drawImage(frame(expression, mouthIndex), 0, 0);
    texture.needsUpdate = true;
  };

  present();

  return {
    setSpec(nextSkin, nextSpec) {
      skin = nextSkin;
      face = nextSpec;
      frames.clear();
      shown = '';
      present();
    },
    setExpression(expression, seconds) {
      held = expression === 'idle' ? null : expression;
      heldTime = seconds ?? Infinity;
      present();
    },
    talk(active) {
      if (active === talking) return;
      talking = active;
      flapIn = 0;
      mouth = 0;
      present();
    },
    update(dt) {
      if (held) {
        heldTime -= dt;
        if (heldTime <= 0) held = null;
      }
      if (blinkTime > 0) blinkTime -= dt;
      blinkIn -= dt;
      if (blinkIn <= 0) {
        blinkTime = BLINK_SECONDS;
        blinkIn = nextBlink();
      }
      if (talking) {
        flapIn -= dt;
        if (flapIn <= 0) {
          flapIn = nextFlap();
          mouth = mouth === 0 ? (Math.random() < 0.6 ? 2 : 1) : Math.random() < 0.8 ? 0 : 3 - mouth;
        }
      }
      present();
    },
  };
}
