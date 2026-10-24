import * as THREE from 'three';
import { applyVertexSnap } from '../core/RetroMaterial';

/**
 * AC-style blob shadow: a soft dark disc that sits just above the ground
 * under every character. Parent it to the entity root (which stands on the
 * terrain), and it grounds the character visually at zero lighting cost.
 */
export function makeBlobShadow(radius: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  // A defined core with a soft skirt. The old version peaked at 0.42 and
  // faded from the centre out, which vanished into the ground at 480x360 —
  // the character has to look like it is standing ON something.
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(16, 20, 14, 0.72)');
  grad.addColorStop(0.42, 'rgba(16, 20, 14, 0.66)');
  grad.addColorStop(0.72, 'rgba(16, 20, 14, 0.32)');
  grad.addColorStop(1, 'rgba(16, 20, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  // **Without this the shadow glows.** Three treats an unflagged canvas as
  // linear data, so `rgb(16,20,14)` — near black — is converted *up* on output
  // to a mid grey. In daylight that reads as a weak shadow; at night, when the
  // lit ground is darker than the grey, it inverts into a pale halo under every
  // character. Every other canvas texture in the project sets this; this one
  // was the exception.
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.2, radius * 2.2),
    applyVertexSnap(
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    ),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  return mesh;
}
