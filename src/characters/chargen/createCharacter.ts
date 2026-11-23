import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import { applyVertexSnap } from '../../core/RetroMaterial';
import type { SlotV2 } from './contract';
import { FACE_SIZE } from './facePaint';
import { createFaceAnimator, type FaceAnimator } from './face/FaceAnimator';
import { paintFaceLayers } from './face/paintFaceLayers';
import { faceSpecFrom, type Expression, type FaceSpec } from './face/types';
import { createAssembly } from './assemble';
import { itemById, type ItemVariant } from './items';
import { KIT_ASSET, KIT_MASK, kit } from './kit';
import { createBodyMaterial, setTints, TINT_GROUPS, type TintGroup } from './material';
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

function tintColors(recipe: CharacterRecipeV2): Array<string | undefined> {
  const item = (slot: SlotV2): Array<string | undefined> => {
    const colors = outfitItem(recipe, slot).variant?.colors ?? {};
    return [colors.primary, colors.secondary, colors.accent ?? colors.primary];
  };
  const groups: Record<TintGroup, Array<string | undefined>> = {
    skin: [recipe.skin],
    hair: [recipe.hair.color],
    top: item('top'),
    bottom: item('bottom'),
    outer: item('outer'),
    shoes: item('shoes'),
    hat: item('hat'),
    bag: item('bag'),
  };
  return TINT_GROUPS.flatMap((group) => [0, 1, 2].map((i) => groups[group][i]));
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
  const { clips, body: template, mask, defaults, grey } = kit();
  const root = assets.model(KIT_ASSET);
  root.getObjectByName(KIT_MASK)?.removeFromParent();
  const head = canvasTexture(FACE_SIZE);
  const body = createBodyMaterial(template, mask);
  const parts: Array<{ mesh: THREE.SkinnedMesh; slot: string; names: string[] }> = [];
  let headMaterial: THREE.Material | null = null;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.atlas === 'head') {
      if (!headMaterial) {
        const material = applyVertexSnap((object.material as THREE.MeshLambertMaterial).clone());
        material.map = head.texture;
        headMaterial = material;
      }
      object.material = headMaterial;
      return;
    }
    parts.push({ mesh: object as THREE.SkinnedMesh, slot: object.userData.kit_slot, names: String(object.userData.kit_part).split(',') });
  });
  const assembly = createAssembly(parts.map((part) => part.mesh), body);
  const rig = root.getObjectByName('core_root')!.parent!;
  const idleCanvas = document.createElement('canvas');
  idleCanvas.width = idleCanvas.height = FACE_SIZE;
  let face: FaceAnimator | null = null;

  const worn = (next: CharacterRecipeV2, slot: string, names: string[]): boolean => {
    if (slot === 'body') return true;
    if (slot === 'hair') return names.includes(next.hair.style ?? '');
    const items = outfitItem(next, KIT_SLOT[slot] ?? (slot as SlotV2)).parts;
    return names.some((name) => items.includes(name));
  };

  const apply = (next: CharacterRecipeV2): void => {
    assembly.update(parts.filter((part) => worn(next, part.slot, part.names)).map((part) => part.mesh));
    setTints(body, tintColors(next), defaults, grey);
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
