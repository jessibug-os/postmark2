import * as THREE from 'three';
import { paintItemIcon } from '../ui/itemIcon';

const cache = new Map<string, THREE.Texture>();

/** Canvas-painted texture of an item's icon, keyed by item id (no assets). */
export function itemIconTexture(itemId: string): THREE.Texture {
  const cached = cache.get(itemId);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2); // paintItemIcon draws in a 64-box
  paintItemIcon(ctx, itemId);
  const texture = new THREE.CanvasTexture(canvas);
  cache.set(itemId, texture);
  return texture;
}

/** Billboard sprite showing an item's painted icon (drops, catch pose). */
export function makeItemSprite(itemId: string, scale = 0.55): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: itemIconTexture(itemId), transparent: true, depthTest: false }),
  );
  sprite.scale.setScalar(scale);
  sprite.renderOrder = 4;
  return sprite;
}
