import { FACE_SIZE } from '../facePaint';
import { paintFaceLayers } from './paintFaceLayers';
import { EXPRESSIONS, MOUTH_FRAMES, type FaceSpec } from './types';

const CELL = 256;

export function renderFaceSheet(skinHex: string, spec: FaceSpec): HTMLCanvasElement {
  const scratch = document.createElement('canvas');
  scratch.width = scratch.height = FACE_SIZE;
  const scratchCtx = scratch.getContext('2d')!;
  const sheet = document.createElement('canvas');
  sheet.width = MOUTH_FRAMES.length * CELL;
  sheet.height = EXPRESSIONS.length * CELL;
  const ctx = sheet.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  EXPRESSIONS.forEach((expression, row) => {
    MOUTH_FRAMES.forEach((open, column) => {
      paintFaceLayers(scratchCtx, skinHex, spec, expression, open);
      ctx.drawImage(scratch, column * CELL, row * CELL, CELL, CELL);
    });
  });
  return sheet;
}
