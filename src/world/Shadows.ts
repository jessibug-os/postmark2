import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { heightAt } from './terrain';
import { inWater } from './geography';

/**
 * Blob shadows — the cheapest, loudest trick in the Animal Crossing playbook.
 * Without them everything floats; with them, props sit ON the ground.
 *
 * This handles the static world: trees, rocks, lamps, landmarks and building
 * footprints, all batched into one InstancedMesh so a few hundred of them cost
 * a single draw call. Characters carry their own moving shadow instead (see
 * `characters/blobShadow.ts`), parented to the entity root so it tracks the
 * terrain height for free.
 *
 * Shadows never write depth, so they layer over the painted terrain without
 * z-fighting the heightfield.
 */

const MAX_STATIC = 1400;

function blobTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Solid-ish core with a long soft skirt: reads as contact, not as a smudge.
  grad.addColorStop(0.0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.92)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.42)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Shadow material: black, alpha straight from the blob map. Per-instance
 * strength would need a shader patch to reach alpha (instanceColor only tints
 * RGB, and ours is already black), so instead the strength is baked into the
 * texture and varied by giving each blob its own radius. One flat opacity for
 * every static shadow is also just how the reference games do it.
 */
function shadowMaterial(map: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    color: PALETTE_HEX.h000000,
    opacity,
  });
}

export class ShadowSystem {
  readonly group = new THREE.Group();
  private tex = blobTexture();
  private statics: THREE.InstancedMesh;
  private staticCount = 0;
  private dummy = new THREE.Object3D();

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.statics = new THREE.InstancedMesh(geo, shadowMaterial(this.tex, 0.42), MAX_STATIC);
    this.statics.count = 0;
    this.statics.frustumCulled = false;
    this.statics.renderOrder = 1;
    this.statics.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.statics);
    this.group.renderOrder = 1;
    parent.add(this.group);
  }

  /**
   * Drop a permanent shadow. `rx`/`rz` are radii in world units, so a building
   * can lay down a long oval pool and a pebble a small circle.
   */
  addStatic(x: number, z: number, rx: number, rz = rx, yOffset = 0.035): void {
    if (this.staticCount >= MAX_STATIC) return;
    // A shadow cast onto water reads as a hole in the surface, and whatever
    // cast it is submerged and invisible anyway.
    if (inWater(x, z)) return;
    const i = this.staticCount++;
    this.dummy.position.set(x, heightAt(x, z) + yOffset, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(rx * 2, 1, rz * 2);
    this.dummy.updateMatrix();
    this.statics.setMatrixAt(i, this.dummy.matrix);
    this.statics.count = this.staticCount;
    this.statics.instanceMatrix.needsUpdate = true;
  }

  /** Hide every shadow (used indoors, where the ground plane is a room floor). */
  setVisible(v: boolean): void {
    this.group.visible = v;
  }
}
