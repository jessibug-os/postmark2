import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import { applyVertexSnap } from '../../core/RetroMaterial';
import { FACE_SIZE, paintFace } from './facePaint';
import { KIT_ASSET, kit, paintBody } from './kit';
import { DEFAULT_SKIN, type CharacterRecipe, type Slot } from './recipe';

export interface Character {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  apply(recipe: CharacterRecipe): void;
}

function canvasTexture(size: number): { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { ctx: canvas.getContext('2d', { willReadFrequently: true })!, texture };
}

export function createCharacter(recipe: CharacterRecipe): Character {
  const { size, clips } = kit();
  const root = assets.model(KIT_ASSET);
  const body = canvasTexture(size);
  const head = canvasTexture(FACE_SIZE);
  const bodyPixels = body.ctx.createImageData(size, size);
  const copies = new Map<THREE.Material, THREE.Material>();
  const parts: Array<{ mesh: THREE.Mesh; slot: Slot | 'body'; names: string[] }> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.material as THREE.MeshLambertMaterial;
    let copy = copies.get(source);
    if (!copy) {
      const material = applyVertexSnap(source.clone());
      material.map = object.userData.atlas === 'head' ? head.texture : body.texture;
      copies.set(source, material);
      copy = material;
    }
    object.material = copy;
    parts.push({ mesh: object, slot: object.userData.kit_slot, names: String(object.userData.kit_part).split(',') });
  });
  const rig = root.getObjectByName('core_root')!.parent!;

  const apply = (next: CharacterRecipe): void => {
    for (const { mesh, slot, names } of parts) {
      mesh.visible = slot === 'body' || names.includes(next.parts[slot] ?? '');
    }
    paintBody(bodyPixels, next.colors);
    body.ctx.putImageData(bodyPixels, 0, 0);
    body.texture.needsUpdate = true;
    paintFace(head.ctx, next.colors.skin ?? DEFAULT_SKIN, next.face);
    head.texture.needsUpdate = true;
    rig.scale.setScalar(next.height);
  };
  apply(recipe);
  return { root, clips, apply };
}

export function recipeAssets(recipe: CharacterRecipe): { model: () => THREE.Group; clips: () => THREE.AnimationClip[] } {
  return { model: () => createCharacter(recipe).root, clips: () => kit().clips };
}
