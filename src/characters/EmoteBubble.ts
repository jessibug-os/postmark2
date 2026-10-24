import { PALETTE_CSS } from '../art/palette';
import * as THREE from 'three';

export type EmoteKind =
  | 'notice' // !
  | 'question' // ?
  | 'music' // ♪
  | 'happy' // ☺
  | 'love' // ♥
  | 'sleep' // Zz
  | 'gear' // ⚙
  | 'idea' // ✦
  | 'sad'; // droplet

const textureCache = new Map<EmoteKind, THREE.Texture>();

function drawEmote(kind: EmoteKind): THREE.Texture {
  const cached = textureCache.get(kind);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  // Speech-bubble backdrop: warm paper circle with an amber rim.
  ctx.beginPath();
  ctx.arc(48, 44, 34, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE_CSS.hf4ecd8;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = PALETTE_CSS.h9a7f4e;
  ctx.stroke();
  // Tail.
  ctx.beginPath();
  ctx.moveTo(38, 72);
  ctx.lineTo(48, 92);
  ctx.lineTo(56, 72);
  ctx.closePath();
  ctx.fillStyle = PALETTE_CSS.hf4ecd8;
  ctx.fill();

  ctx.fillStyle = PALETTE_CSS.h4a3a28;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs: Record<EmoteKind, [string, string, number]> = {
    notice: ['!', PALETTE_CSS.ha8402f, 52],
    question: ['?', PALETTE_CSS.h4a5a78, 48],
    music: ['♪', PALETTE_CSS.h4a6a4a, 46],
    happy: ['◠‿◠', PALETTE_CSS.ha8742f, 24],
    love: ['♥', PALETTE_CSS.hb8443f, 42],
    sleep: ['Zz', PALETTE_CSS.h5a6a8a, 34],
    gear: ['⚙', PALETTE_CSS.h6a5a3a, 40],
    idea: ['✦', PALETTE_CSS.hc9a227, 44],
    sad: ['…', PALETTE_CSS.h5a6a8a, 44],
  };
  const [glyph, color, size] = glyphs[kind];
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Georgia, serif`;
  ctx.fillText(glyph, 48, 46);

  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(kind, texture);
  return texture;
}

/**
 * AC-style emote bubble: a sprite that pops in above a character's head,
 * bobs, and fades. One per character; showing a new emote replaces the old.
 */
export class EmoteBubble {
  private sprite: THREE.Sprite;
  private life = 0;
  private total = 0;

  constructor(parent: THREE.Object3D, height: number) {
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, depthTest: false }),
    );
    this.sprite.position.set(0.25, height, 0);
    this.sprite.scale.setScalar(0);
    this.sprite.renderOrder = 5;
    this.sprite.visible = false;
    parent.add(this.sprite);
  }

  show(kind: EmoteKind, seconds = 1.8): void {
    this.sprite.material.map = drawEmote(kind);
    this.sprite.material.needsUpdate = true;
    this.sprite.visible = true;
    this.life = seconds;
    this.total = seconds;
  }

  get active(): boolean {
    return this.life > 0;
  }

  update(dt: number): void {
    if (!this.sprite.visible) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.sprite.visible = false;
      this.sprite.scale.setScalar(0);
      return;
    }
    const elapsed = this.total - this.life;
    // Pop-in with overshoot, gentle bob, fade at the end.
    const pop = Math.min(1, elapsed * 6);
    const overshoot = 1 + 0.35 * Math.sin(Math.min(elapsed * 6, Math.PI));
    const scale = 0.62 * pop * overshoot;
    this.sprite.scale.setScalar(scale);
    this.sprite.position.y += Math.sin(elapsed * 5) * 0.0025;
    this.sprite.material.opacity = this.life < 0.4 ? this.life / 0.4 : 1;
  }
}
