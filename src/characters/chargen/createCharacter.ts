import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import { applyVertexSnap } from '../../core/RetroMaterial';
import type { SlotV2 } from './contract';
import { FACE_SIZE } from './facePaint';
import { createFaceAnimator, type FaceAnimator } from './face/FaceAnimator';
import { paintFaceLayers } from './face/paintFaceLayers';
import { faceSpecFrom, type Expression, type FaceSpec } from './face/types';
import { itemById, type ItemVariant } from './items';
import { KIT_ASSET, kit, paintBody, type Channel } from './kit';
import type { CharacterRecipeV2 } from './recipeV2';

export interface Character {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  face: FaceAnimator;
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

function faceRig(face: FaceAnimator, idleCanvas: HTMLCanvasElement) {
  let queued: { expression: Expression; seconds: number } | null = null;
  let moodLeft = 0;
  let asleep = false;
  return {
    idleCanvas,
    mood(expression: Expression, seconds = 1.2, then?: Expression, thenSeconds = 1.2): void {
      face.setExpression(expression, seconds);
      queued = then ? { expression: then, seconds: thenSeconds } : null;
      moodLeft = seconds;
    },
    blink(): void {
      if (!asleep && moodLeft <= 0 && !queued) face.setExpression('blink', 0.13);
    },
    get sleeping(): boolean {
      return asleep;
    },
    set sleeping(value: boolean) {
      if (value === asleep) return;
      asleep = value;
      face.setExpression(value ? 'asleep' : 'idle');
    },
    update(dt: number): void {
      moodLeft -= dt;
      if (queued && moodLeft <= 0) {
        face.setExpression(queued.expression, queued.seconds);
        moodLeft = queued.seconds;
        queued = null;
      }
      face.update(dt);
    },
  };
}

const faceSpec = (recipe: CharacterRecipeV2): FaceSpec => faceSpecFrom({ ...recipe.face, iris: recipe.eyes });

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
  const idleCanvas = document.createElement('canvas');
  idleCanvas.width = idleCanvas.height = FACE_SIZE;
  let face: FaceAnimator | null = null;

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
    const spec = faceSpec(next);
    if (face) face.setSpec(next.skin, spec);
    else face = createFaceAnimator(head.ctx, head.texture, next.skin, spec);
    paintFaceLayers(idleCanvas.getContext('2d')!, next.skin, spec, 'idle', 0);
    rig.scale.setScalar(next.height);
  };
  apply(recipe);
  root.userData.faceRig = faceRig(face!, idleCanvas);
  return { root, clips, face: face!, apply };
}

export function recipeAssets(recipe: CharacterRecipeV2): { model: () => THREE.Group; clips: () => THREE.AnimationClip[] } {
  return { model: () => createCharacter(recipe).root, clips: () => kit().clips };
}
