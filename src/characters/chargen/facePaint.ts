import type { FaceRecipe } from './recipe';

export const FACE_SIZE = 512;

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as RGB;
}

function css(rgb: RGB, alpha = 1): string {
  return `rgba(${rgb.map(Math.round).join(',')},${alpha})`;
}

export function paintFace(ctx: CanvasRenderingContext2D, skinHex: string, face: FaceRecipe): void {
  const skin = hexToRgb(skinHex);
  const iris = hexToRgb(face.iris);
  const brow = hexToRgb(face.brow);
  const blushTone = hexToRgb(face.blush);
  const line = mix(brow, [0, 0, 0], 0.5);
  const y = (value: number): number => FACE_SIZE - value;

  const ellipse = (cx: number, cy: number, rx: number, ry: number, rgb: RGB, alpha = 1): void => {
    ctx.fillStyle = css(rgb, alpha);
    ctx.beginPath();
    ctx.ellipse(cx, y(cy), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const segment = (ax: number, ay: number, bx: number, by: number, width: number, rgb: RGB, alpha = 1): void => {
    ctx.strokeStyle = css(rgb, alpha);
    ctx.lineWidth = width * 2 + 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, y(ay));
    ctx.lineTo(bx, y(by));
    ctx.stroke();
  };

  ctx.fillStyle = css(skin);
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);

  const blush = mix(skin, blushTone, 0.62);
  ellipse(152, 220, 54, 31, blush, 0.42);
  ellipse(360, 220, 54, 31, blush, 0.42);
  const eyeY = 286;
  const eyeH = 61 * face.squint;
  for (const cx of [178, 334]) {
    ellipse(cx, eyeY, 38, eyeH, [246, 236, 209]);
    ellipse(cx, eyeY - 2, 29, eyeH * 0.91, line);
    ellipse(cx, eyeY - 5, 19, eyeH * 0.7, iris);
    ellipse(cx - 8, eyeY + 21, 8, 12, [255, 250, 224], 0.95);
    ellipse(cx + 7, eyeY - 25, 5, 7, mix(iris, [191, 107, 36], 0.55), 0.85);
  }
  segment(142, 369, 204, 378, 8, brow, 0.96);
  segment(308, 378, 370, 369, 8, brow, 0.96);
  ellipse(256, 233, 12, 10, mix(skin, blushTone, 0.48), 0.78);
  segment(226, 177, 256, 166, 5, line, 0.92);
  segment(256, 166, 286, 177, 5, line, 0.92);
  if (face.freckles) {
    for (const [fx, fy] of [[204, 232], [219, 225], [233, 232], [279, 232], [293, 225], [308, 232]]) {
      ellipse(fx, fy, 3.2, 3.2, mix(line, skin, 0.35), 0.75);
    }
  }
  if (face.age) {
    for (const sign of [-1, 1]) {
      const cx = 256 + sign * 113;
      segment(cx - sign * 6, 230, cx + sign * 13, 220, 2.2, line, 0.3);
      segment(cx - sign * 4, 212, cx + sign * 12, 202, 2.0, line, 0.26);
    }
    segment(213, 408, 299, 408, 2.2, line, 0.18);
  }
  if (face.lashes) {
    segment(137, 309, 125, 318, 2.5, line, 0.8);
    segment(375, 309, 387, 318, 2.5, line, 0.8);
  }
  if (face.glasses) {
    for (const cx of [178, 334]) {
      ctx.strokeStyle = css(line, 0.92);
      ctx.lineWidth = 7.4;
      ctx.beginPath();
      ctx.ellipse(cx, y(eyeY), 48, 69, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    segment(226, eyeY + 5, 286, eyeY + 5, 3.0, line, 0.92);
  }
  if (face.moustache) {
    ellipse(238, 194, 25, 11, line, 0.96);
    ellipse(274, 194, 25, 11, line, 0.96);
    segment(240, 166, 256, 160, 4, line, 0.9);
    segment(256, 160, 272, 166, 4, line, 0.9);
  }
}
