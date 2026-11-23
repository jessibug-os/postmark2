import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import { applyVertexSnap } from '../../core/RetroMaterial';
import { FACE_SIZE, paintFace } from './facePaint';
import type { SlotV2 } from './contract';
import { itemById, type ItemVariant } from './items';
import { KIT_ASSET, kit, paintBody, type Channel } from './kit';
import type { CharacterRecipeV2 } from './recipeV2';

export interface Character {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  apply(recipe: CharacterRecipeV2): void;
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

const KIT_SLOT: Record<string, SlotV2> = { apron: 'outer' };

function outfitItem(recipe: CharacterRecipeV2, slot: SlotV2): { parts: string[]; variant: ItemVariant | undefined } {
  const entry = recipe.outfit[slot];
  const item = entry ? itemById(entry.item) : undefined;
  return { parts: item?.parts ?? [], variant: item?.variants.find((v) => v.id === entry?.variant) };
}

function channelColors(recipe: CharacterRecipeV2): Partial<Record<Channel, string>> {
  const primary = (slot: SlotV2): string | undefined => outfitItem(recipe, slot).variant?.colors.primary;
  const colors: Partial<Record<Channel, string | undefined>> = {
    skin: recipe.skin,
    hair: recipe.hair.color,
    hat: primary('hat'),
    top: primary('top'),
    bottom: primary('bottom'),
    legs: outfitItem(recipe, 'bottom').variant?.colors.secondary,
    shoes: primary('shoes'),
    accent: primary('outer') ?? outfitItem(recipe, 'top').variant?.colors.accent,
  };
  return Object.fromEntries(Object.entries(colors).filter(([, hex]) => hex)) as Partial<Record<Channel, string>>;
}

export function createCharacter(recipe: CharacterRecipeV2): Character {
  const { size, clips } = kit();
  const root = assets.model(KIT_ASSET);
  const body = canvasTexture(size);
  const head = canvasTexture(FACE_SIZE);
  const bodyPixels = body.ctx.createImageData(size, size);
  const copies = new Map<THREE.Material, THREE.Material>();
  const parts: Array<{ mesh: THREE.Mesh; slot: string; names: string[] }> = [];
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

  const apply = (next: CharacterRecipeV2): void => {
    for (const { mesh, slot, names } of parts) {
      if (slot === 'body') mesh.visible = true;
      else if (slot === 'hair') mesh.visible = names.includes(next.hair.style ?? '');
      else {
        const worn = outfitItem(next, KIT_SLOT[slot] ?? (slot as SlotV2)).parts;
        mesh.visible = names.some((name) => worn.includes(name));
      }
    }
    paintBody(bodyPixels, channelColors(next));
    body.ctx.putImageData(bodyPixels, 0, 0);
    body.texture.needsUpdate = true;
    paintFace(head.ctx, next.skin, { ...next.face, iris: next.eyes });
    head.texture.needsUpdate = true;
    rig.scale.setScalar(next.height);
  };
  apply(recipe);
  return { root, clips, apply };
}

export function recipeAssets(recipe: CharacterRecipeV2): { model: () => THREE.Group; clips: () => THREE.AnimationClip[] } {
  return { model: () => createCharacter(recipe).root, clips: () => kit().clips };
}
