import * as THREE from 'three';
import { assets } from '../../core/AssetLoader';
import type { MaskChannel } from './contract';
import { TINT_GROUPS, TINT_SLOTS, type TintGroup } from './material';

export const KIT_ASSET = 'chargen-kit';
export const KIT_MASK = 'kit_mask';
const KIT_NORMAL = '_kit_normal';

const CHANNEL_INDEX: Record<MaskChannel, number> = { primary: 0, secondary: 1, accent: 2 };

export interface Kit {
  hairStyles: string[];
  tinted: Set<string>;
  body: THREE.MeshLambertMaterial;
  mask: THREE.Texture;
  grey: number;
  defaults: Array<string | undefined>;
  clips: THREE.AnimationClip[];
}

let cached: Kit | null = null;

export function kit(): Kit {
  if (cached) return cached;
  const template = assets.model(KIT_ASSET);
  const extras = template.userData as { kit_tints: string; kit_tint_defaults: string; kit_mask_grey: number };
  const tints = JSON.parse(extras.kit_tints) as Record<string, MaskChannel>;
  const paint = JSON.parse(extras.kit_tint_defaults) as Record<string, string>;
  const defaults: Array<string | undefined> = new Array(TINT_SLOTS).fill(undefined);
  const hairStyles: string[] = [];
  const hatVariants = new Set<string>();
  const tinted = new Set<string>();
  const found: { body?: THREE.MeshLambertMaterial; mask?: THREE.Texture | null } = {};
  template.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.MeshLambertMaterial;
    const normals = object.geometry.getAttribute(KIT_NORMAL);
    if (normals) {
      object.geometry.setAttribute('normal', normals);
      object.geometry.deleteAttribute(KIT_NORMAL);
    }
    if (object.name === KIT_MASK) {
      found.mask = material.map;
      return;
    }
    if (object.userData.atlas === 'head') material.flatShading = false;
    if (object.userData.atlas !== 'body') return;
    found.body ??= material;
    const rect = String(object.userData.uv_rect);
    const group = TINT_GROUPS.indexOf(object.userData.kit_tint as TintGroup);
    if (group >= 0 && tints[rect]) {
      defaults[group * 3 + CHANNEL_INDEX[tints[rect]]] ??= paint[rect];
      for (const part of String(object.userData.kit_part).split(',')) tinted.add(part);
    }
    if (object.userData.kit_slot !== 'hair') return;
    if (object.userData.kit_hat_variant) hatVariants.add(String(object.userData.kit_hat_variant));
    for (const part of String(object.userData.kit_part).split(',')) {
      if (!hairStyles.includes(part)) hairStyles.push(part);
    }
  });
  const { body, mask } = found;
  if (!body || !mask) throw new Error('chargen kit has no body atlas or colour mask');
  mask.colorSpace = THREE.NoColorSpace;
  mask.needsUpdate = true;
  cached = { hairStyles: hairStyles.filter((style) => !hatVariants.has(style)), tinted, body, mask, grey: extras.kit_mask_grey, defaults, clips: assets.animations(KIT_ASSET) };
  return cached;
}
