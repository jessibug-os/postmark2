import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import { applyVertexSnap } from '../../core/RetroMaterial';
import type { SlotV2 } from './contract';
import { FACE_SIZE } from './facePaint';
import { createFaceAnimator, type FaceAnimator } from './face/FaceAnimator';
import { faceSpecFrom, type Expression, type FaceSpec } from './face/types';
import { createAssembly } from './assemble';
import { isOnePiece, itemById, type ItemVariant } from './items';
import { KIT_ASSET, KIT_MASK, kit } from './kit';
import { createBodyMaterial, setTints, TINT_GROUPS, type TintGroup } from './material';
import type { CharacterRecipeV2 } from './recipeV2';

export interface Character {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  face: FaceAnimator;
  apply(recipe: CharacterRecipeV2): void;
  dispose(): void;
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

function outfitItem(recipe: CharacterRecipeV2, slot: SlotV2): { parts: string[]; colors: ItemVariant['colors'] } {
  const entry = slot === 'bottom' && isOnePiece(recipe.outfit.top?.item) ? null : recipe.outfit[slot];
  const item = entry ? itemById(entry.item) : undefined;
  const colors = item?.variants.find((v) => v.id === entry?.variant)?.colors ?? {};
  return {
    parts: item?.parts ?? [],
    colors: { ...colors, primary: entry?.color ?? colors.primary, secondary: entry?.secondary ?? colors.secondary },
  };
}

function tintColors(recipe: CharacterRecipeV2): Array<string | undefined> {
  const item = (slot: SlotV2): Array<string | undefined> => {
    const { colors } = outfitItem(recipe, slot);
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

function faceRig(face: FaceAnimator) {
  let queued: { expression: Expression; seconds: number } | null = null;
  let moodLeft = 0;
  let asleep = false;
  return {
    idleCanvas: face.idle,
    mood(expression: Expression, seconds = 1.2, then?: Expression, thenSeconds = 1.2): void {
      face.setExpression(expression, seconds);
      queued = then ? { expression: then, seconds: thenSeconds } : null;
      moodLeft = seconds;
    },
    blink(): void {},
    get sleeping(): boolean {
      return asleep;
    },
    set sleeping(value: boolean) {
      if (value === asleep) return;
      asleep = value;
      queued = null;
      face.setRest(value ? 'asleep' : 'idle');
      face.setExpression('idle');
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

const faceSpec = (recipe: CharacterRecipeV2): FaceSpec => faceSpecFrom(recipe.face, recipe.eyes);

export function createCharacter(recipe: CharacterRecipeV2): Character {
  const { clips, body: template, mask, defaults, grey } = kit();
  const root = assets.model(KIT_ASSET);
  root.getObjectByName(KIT_MASK)?.removeFromParent();
  const head = canvasTexture(FACE_SIZE);
  const body = createBodyMaterial(template, mask);
  const parts: Array<{ mesh: THREE.SkinnedMesh; slot: string; names: string[]; hides: string[]; area: string; variant: string }> = [];
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
    parts.push({
      mesh: object as THREE.SkinnedMesh,
      slot: object.userData.kit_slot,
      names: String(object.userData.kit_part).split(','),
      hides: String(object.userData.kit_hides ?? '').split(','),
      area: String(object.userData.kit_area ?? ''),
      variant: String(object.userData.kit_hat_variant ?? ''),
    });
  });
  const assembly = createAssembly(parts.map((part) => part.mesh), body);
  const rig = root.getObjectByName('core_root')!.parent!;
  let face: FaceAnimator | null = null;

  const worn = (next: CharacterRecipeV2, slot: string, names: string[]): boolean => {
    if (slot === 'body') return true;
    const items = outfitItem(next, KIT_SLOT[slot] ?? (slot as SlotV2)).parts;
    return names.some((name) => items.includes(name));
  };

  const apply = (next: CharacterRecipeV2): void => {
    const outfit = parts.filter((part) => part.slot !== 'hair' && worn(next, part.slot, part.names));
    const hidden = new Set(outfit.flatMap((part) => part.hides));
    const style = next.hair.style ?? '';
    const base = parts.filter((part) => part.slot === 'hair' && part.names.includes(style));
    const variant = hidden.has('scalp') ? base.find((part) => part.variant)?.variant : undefined;
    const hair = variant ? parts.filter((part) => part.slot === 'hair' && part.names.includes(variant)) : base;
    const shown = [...outfit, ...hair].filter((part) => !(part.area && hidden.has(part.area)));
    assembly.update(shown.map((part) => part.mesh));
    setTints(body, tintColors(next), defaults, grey);
    const spec = faceSpec(next);
    if (face) face.setSpec(next.skin, spec);
    else face = createFaceAnimator(head.ctx, head.texture, next.skin, spec);
    rig.scale.setScalar(next.height);
  };
  apply(recipe);
  root.userData.faceRig = faceRig(face!);
  const dispose = (): void => {
    assembly.mesh.geometry.dispose();
    body.dispose();
    headMaterial?.dispose();
    head.texture.dispose();
    head.ctx.canvas.width = head.ctx.canvas.height = 0;
    face!.idle.width = face!.idle.height = 0;
  };
  return { root, clips, face: face!, apply, dispose };
}

export function recipeAssets(recipe: CharacterRecipeV2): { model: () => THREE.Group; clips: () => THREE.AnimationClip[] } {
  return { model: () => createCharacter(recipe).root, clips: () => kit().clips };
}
