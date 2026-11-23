import { FACE_SIZE, hexToRgb, type RGB } from '../facePaint';
import type { BrowStyle, Expression, FaceSpec } from './types';

const BROWS: Record<BrowStyle, { outer: number; inner: number; arch: number }> = {
  soft: { outer: 369, inner: 378, arch: 0 },
  flat: { outer: 373, inner: 373, arch: 0 },
  arched: { outer: 364, inner: 371, arch: 16 },
};

const WHITE: RGB = [246, 236, 209];
const SHINE: RGB = [255, 250, 224];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as RGB;
}

function css(rgb: RGB, alpha = 1): string {
  return `rgba(${rgb.map(Math.round).join(',')},${alpha})`;
}

export function paintFaceLayers(
  ctx: CanvasRenderingContext2D,
  skinHex: string,
  spec: FaceSpec,
  expression: Expression,
  mouthOpen: number,
): void {
  const skin = hexToRgb(skinHex);
  const iris = hexToRgb(spec.iris);
  const brow = hexToRgb(spec.brow);
  const blushTone = hexToRgb(spec.blush);
  const line = mix(brow, [0, 0, 0], 0.5);
  const mouthDark = mix(line, [120, 30, 34], 0.45);
  const tongue = mix(blushTone, [255, 170, 150], 0.4);
  const y = (value: number): number => FACE_SIZE - value;

  const ellipse = (cx: number, cy: number, rx: number, ry: number, rgb: RGB, alpha = 1): void => {
    ctx.fillStyle = css(rgb, alpha);
    ctx.beginPath();
    ctx.ellipse(cx, y(cy), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const stroke = (width: number, rgb: RGB, alpha: number): void => {
    ctx.strokeStyle = css(rgb, alpha);
    ctx.lineWidth = width * 2 + 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const segment = (ax: number, ay: number, bx: number, by: number, width: number, rgb: RGB, alpha = 1): void => {
    ctx.beginPath();
    ctx.moveTo(ax, y(ay));
    ctx.lineTo(bx, y(by));
    stroke(width, rgb, alpha);
  };
  const curve = (ax: number, ay: number, qx: number, qy: number, bx: number, by: number, width: number, rgb: RGB, alpha = 1): void => {
    ctx.beginPath();
    ctx.moveTo(ax, y(ay));
    ctx.quadraticCurveTo(qx, y(qy), bx, y(by));
    stroke(width, rgb, alpha);
  };
  const clipped = (path: () => void, draw: () => void): void => {
    ctx.save();
    ctx.beginPath();
    path();
    ctx.clip();
    draw();
    ctx.restore();
  };
  const openMouth = (cx: number, cy: number, rx: number, ry: number): void => {
    ellipse(cx, cy, rx, ry, mouthDark);
    clipped(
      () => ctx.ellipse(cx, y(cy), rx, ry, 0, 0, Math.PI * 2),
      () => ellipse(cx, cy - ry * 0.6, rx * 0.75, ry * 0.6, tongue),
    );
  };

  ctx.fillStyle = css(skin);
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);

  const blush = mix(skin, blushTone, 0.62);
  const blushAlpha = expression === 'happy' ? 0.6 : 0.42;
  ellipse(152, 220, 54, 31, blush, blushAlpha);
  ellipse(360, 220, 54, 31, blush, blushAlpha);
  if (spec.freckles) {
    for (const [fx, fy] of [[204, 232], [219, 225], [233, 232], [279, 232], [293, 225], [308, 232]]) {
      ellipse(fx, fy, 3.2, 3.2, mix(line, skin, 0.35), 0.75);
    }
  }
  if (spec.age) {
    for (const sign of [-1, 1]) {
      const cx = 256 + sign * 113;
      segment(cx - sign * 6, 230, cx + sign * 13, 220, 2.2, line, 0.3);
      segment(cx - sign * 4, 212, cx + sign * 12, 202, 2.0, line, 0.26);
    }
    segment(213, 408, 299, 408, 2.2, line, 0.18);
  }

  const eyeY = 286;
  const wide = expression === 'surprised' ? 1.18 : 1;
  const eyeW = 38 * (expression === 'surprised' ? 1.08 : 1);
  const eyeH = 61 * spec.squint * wide;
  const roundEye = (cx: number, sparkle: boolean): void => {
    ellipse(cx, eyeY, eyeW, eyeH, WHITE);
    ellipse(cx, eyeY - 2, eyeW * 0.76, eyeH * 0.91, line);
    ellipse(cx, eyeY - 5, eyeW * 0.5, eyeH * 0.7, iris);
    if (sparkle) {
      ellipse(cx - 9, eyeY + 18 * wide, 12, 17, SHINE, 0.97);
      ellipse(cx + 10, eyeY - 20 * wide, 7, 9, SHINE, 0.95);
      ellipse(cx + 13, eyeY + 14 * wide, 4, 5, SHINE, 0.9);
    } else {
      ellipse(cx - 8, eyeY + 21 * wide, 8, 12, SHINE, 0.95);
      ellipse(cx + 7, eyeY - 25 * wide, 5, 7, mix(iris, [191, 107, 36], 0.55), 0.85);
    }
  };
  const openEye = (cx: number): void => {
    if (spec.eyeStyle === 'dot') {
      ellipse(cx, eyeY - 4, 22 * wide, 34 * spec.squint * wide, mix(iris, line, 0.5));
      ellipse(cx - 7, eyeY + 10 * wide, 7, 9, SHINE, 0.95);
    } else if (spec.eyeStyle === 'sleepy') {
      const lid = eyeY + eyeH * (expression === 'surprised' ? 0.55 : 0.1);
      clipped(() => ctx.rect(0, y(lid), FACE_SIZE, FACE_SIZE), () => roundEye(cx, false));
      const half = eyeW * Math.sqrt(1 - ((lid - eyeY) / eyeH) ** 2);
      segment(cx - half, lid, cx + half, lid, 6, line, 0.95);
    } else {
      roundEye(cx, spec.eyeStyle === 'sparkle');
    }
  };
  for (const [cx, sign] of [[178, -1], [334, 1]]) {
    if (expression === 'idle' || expression === 'surprised') {
      openEye(cx);
      if (spec.lashes) segment(cx + sign * 41, eyeY + 23 * wide, cx + sign * 53, eyeY + 32 * wide, 2.5, line, 0.8);
    } else if (expression === 'happy') {
      curve(cx - 36, eyeY - 18, cx, eyeY + 46, cx + 36, eyeY - 18, 9, line, 0.96);
      if (spec.lashes) segment(cx + sign * 36, eyeY - 18, cx + sign * 50, eyeY - 12, 2.5, line, 0.8);
    } else {
      const drop = expression === 'asleep' ? 10 : 0;
      curve(cx - 36, eyeY - 6 - drop, cx, eyeY - 40 - drop, cx + 36, eyeY - 6 - drop, 9, line, 0.96);
      if (spec.lashes) segment(cx + sign * 36, eyeY - 6 - drop, cx + sign * 48, eyeY - 14 - drop, 2.5, line, 0.8);
    }
  }
  if (spec.glasses) {
    for (const cx of [178, 334]) {
      ctx.strokeStyle = css(line, 0.92);
      ctx.lineWidth = 7.4;
      ctx.beginPath();
      ctx.ellipse(cx, y(eyeY), 48, 69, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    segment(226, eyeY + 5, 286, eyeY + 5, 3.0, line, 0.92);
  }

  const shape = BROWS[spec.browStyle];
  const lift = expression === 'surprised' ? 26 : expression === 'happy' ? 8 : expression === 'asleep' ? -6 : 0;
  const arch = shape.arch + (expression === 'surprised' ? 8 : expression === 'happy' ? 6 : 0);
  for (const [outerX, innerX] of [[142, 204], [370, 308]]) {
    const outerY = shape.outer + lift;
    const innerY = shape.inner + lift;
    curve(outerX, outerY, (outerX + innerX) / 2, (outerY + innerY) / 2 + arch * 2, innerX, innerY, 8, brow, 0.96);
  }

  if (spec.nose === 'button') ellipse(256, 233, 12, 10, mix(skin, blushTone, 0.48), 0.78);

  const open = Math.max(0, Math.min(1, mouthOpen));
  const resting = open === 0 && (expression === 'idle' || expression === 'blink');
  if (expression === 'happy') {
    const rx = 30 + 4 * open;
    const ry = 22 + 16 * open;
    const half = (): void => {
      ctx.ellipse(256, y(180), rx, ry, 0, 0, Math.PI);
      ctx.closePath();
    };
    ctx.fillStyle = css(mouthDark);
    ctx.beginPath();
    half();
    ctx.fill();
    clipped(half, () => ellipse(256, 180 - ry, rx * 0.7, ry * 0.55, tongue));
  } else if (expression === 'surprised') {
    openMouth(256, 166 - 4 * open, 13 + 5 * open, 17 + 9 * open);
  } else if (open > 0) {
    openMouth(256, 172 - 4 * open, 18 + 8 * open, 7 + 15 * open);
  } else if (expression === 'asleep') {
    ellipse(256, 168, 8, 9, mouthDark);
  } else if (spec.mouthStyle === 'flat') {
    segment(230, 171, 282, 171, 5, line, 0.92);
  } else if (spec.mouthStyle === 'cat') {
    curve(220, 180, 230, 160, 256, 174, 5, line, 0.92);
    curve(256, 174, 282, 160, 292, 180, 5, line, 0.92);
  } else {
    segment(226, 177, 256, 166, 5, line, 0.92);
    segment(256, 166, 286, 177, 5, line, 0.92);
  }

  if (spec.moustache) {
    ellipse(238, 194, 25, 11, line, 0.96);
    ellipse(274, 194, 25, 11, line, 0.96);
    if (resting) {
      segment(240, 166, 256, 160, 4, line, 0.9);
      segment(256, 160, 272, 166, 4, line, 0.9);
    }
  }
}
