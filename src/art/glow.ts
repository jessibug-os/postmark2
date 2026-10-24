import * as THREE from 'three';

/**
 * A soft radial glow, painted once and shared by everything that glows.
 *
 * Every light source in this game that has to read *through* something — the
 * wisp in the fog, a lantern at range — is a sprite with this map on it rather
 * than a lit sphere, and the reason is the render target. The scene is drawn
 * at roughly 480x360 and upscaled, so a small emissive mesh twenty metres out
 * is smaller than a pixel; a sprite holds a constant screen footprint and
 * survives.
 *
 * The falloff is squared rather than linear. A linear ramp still shows a
 * visible outer rim where it reaches zero — the eye finds the discontinuity in
 * the gradient's slope, not just in its value — and a rim is the exact
 * artefact a glow sprite exists to avoid: it turns a light into a sticker.
 */
let glowMap: THREE.Texture | null = null;

export function glowTexture(): THREE.Texture {
  if (glowMap) return glowMap;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const mid = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mid, y - mid) / mid;
      const a = d >= 1 ? 0 : (1 - d) * (1 - d);
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  glowMap = new THREE.CanvasTexture(canvas);
  return glowMap;
}
