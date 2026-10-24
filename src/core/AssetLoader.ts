import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyVertexSnap } from './RetroMaterial';

export type AssetId =
  | 'bench' | 'benchTimber' | 'sparks' | 'orchardTree'
  | 'postmaster' | 'albert' | 'mira' | 'rowan' | 'liliane'
  | 'amina' | 'niko' | 'maeve' | 'vittorio' | 'ferry-recruit'
  | 'ferry' | 'post-office' | 'lantern-post' | 'ferry-passenger'
  | 'keeper' | 'bunny' | 'staff' | 'flower-pot';

interface ModelEntry {
  type: 'model';
  url: string;
}

interface TextureEntry {
  type: 'texture';
  url: string;
  mipmaps?: boolean;
}

type ManifestEntry = ModelEntry | TextureEntry;
type AssetManifest = Record<AssetId, ManifestEntry>;
export type AssetProgress = (loaded: number, total: number, id: AssetId) => void;

/**
 * Manifest-driven authored asset registry. Preload before constructing systems
 * that instantiate synchronously; clones preserve skins and animation roots.
 */
export class AssetRegistry {
  private readonly gltf = new GLTFLoader();
  private readonly textures = new THREE.TextureLoader();
  private manifest: AssetManifest | null = null;
  private models = new Map<AssetId, GLTF>();
  private images = new Map<AssetId, THREE.Texture>();

  constructor() {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    this.gltf.setDRACOLoader(draco);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  async preload(ids?: AssetId[], progress?: AssetProgress): Promise<void> {
    this.manifest ??= await fetch('/assets/manifest.json').then(async (response) => {
      if (!response.ok) throw new Error(`Asset manifest failed: ${response.status}`);
      return response.json() as Promise<AssetManifest>;
    });
    const manifest = this.manifest;
    if (!manifest) throw new Error('Asset manifest did not load');
    const wanted = ids ?? Object.keys(manifest) as AssetId[];
    let loaded = 0;
    await Promise.all(wanted.map(async (id) => {
      await this.load(id);
      progress?.(++loaded, wanted.length, id);
    }));
  }

  async reload(id: AssetId): Promise<void> {
    this.models.delete(id);
    this.images.delete(id);
    await this.load(id, `t=${Date.now()}`);
  }

  /**
   * The asset id whose manifest entry is this file under `/assets`.
   *
   * Acre fixtures name a **file** — `orchard-tree.glb` — because that is what
   * an author picks in `/acre` and what a reviewer reads in the `.acre`. The
   * runtime addresses models by id, and the two are not the same string:
   * `orchard-tree.glb` is `orchardTree`, and `postmaster` is whichever version
   * the manifest currently points at. Resolving through the manifest is the
   * only mapping that stays true when a model is versioned up.
   */
  idForFile(file: string): AssetId | null {
    const url = `/assets/${file}`;
    for (const [id, entry] of Object.entries(this.manifest ?? {})) {
      if (entry.type === 'model' && entry.url === url) return id as AssetId;
    }
    return null;
  }

  model(id: AssetId): THREE.Group {
    const asset = this.models.get(id);
    if (!asset) throw new Error(`Model "${id}" was not preloaded`);
    return clone(asset.scene) as THREE.Group;
  }

  animations(id: AssetId): THREE.AnimationClip[] {
    return this.models.get(id)?.animations ?? [];
  }

  texture(id: AssetId): THREE.Texture {
    const texture = this.images.get(id);
    if (!texture) throw new Error(`Texture "${id}" was not preloaded`);
    return texture;
  }

  private async load(id: AssetId, query = ''): Promise<void> {
    if (this.models.has(id) || this.images.has(id)) return;
    const entry = this.manifest?.[id];
    if (!entry) throw new Error(`Unknown asset "${id}"`);
    const url = query ? `${entry.url}?${query}` : entry.url;
    if (entry.type === 'model') {
      const asset = await this.gltf.loadAsync(url);
      asset.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.geometry.computeVertexNormals();
        if (object instanceof THREE.SkinnedMesh) {
          // A skin's bind-pose bounds are too tight for animation (and caused
          // individual parts to pop), but disabling culling made every part of
          // every off-screen resident render forever. Keep a deliberately
          // conservative actor-sized sphere on each part instead. The radius
          // scales with the model root and covers the authored cast's full
          // animation envelope while allowing Three to reject distant actors.
          object.geometry.computeBoundingSphere();
          if (object.geometry.boundingSphere) {
            object.geometry.boundingSphere.radius = Math.max(
              object.geometry.boundingSphere.radius,
              5,
            );
          }
          object.frustumCulled = true;
        }
        const source = Array.isArray(object.material) ? object.material : [object.material];
        const converted = source.map((material) => {
          if (material instanceof THREE.MeshBasicMaterial && material.transparent) {
            return applyVertexSnap(material.clone());
          }
          const standard = material as THREE.MeshStandardMaterial;
          if (standard.emissive?.getHex() && standard.emissiveIntensity > 0) {
            const emissive = applyVertexSnap(new THREE.MeshBasicMaterial({
              name: standard.name,
              color: standard.emissive.clone(),
              map: standard.emissiveMap ?? standard.map ?? null,
            }));
            object.layers.enable(2);
            return emissive;
          }
          const retro = new THREE.MeshLambertMaterial({
            name: standard.name,
            color: standard.color?.clone() ?? new THREE.Color(PALETTE_HEX.hffffff),
            map: standard.map ?? null,
            transparent: standard.transparent,
            opacity: standard.opacity,
            alphaTest: standard.alphaTest,
            side: standard.side,
            flatShading: true,
          });
          if (retro.map) {
            retro.map.colorSpace = THREE.SRGBColorSpace;
            retro.map.magFilter = THREE.NearestFilter;
          }
          return applyVertexSnap(retro);
        });
        object.material = Array.isArray(object.material) ? converted : converted[0];
      });
      this.models.set(id, asset);
      return;
    }
    const texture = await this.textures.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = entry.mipmaps === false
      ? THREE.NearestFilter
      : THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = entry.mipmaps !== false;
    this.images.set(id, texture);
  }
}

export const assets = new AssetRegistry();

const hot = (import.meta as ImportMeta & {
  hot?: { accept(callback: () => void): void };
}).hot;
if (hot) {
  hot.accept(() => {
    // Asset source edits are normally emitted through manifest updates. Reload
    // loaded entries without reconstructing the registry in development.
    void assets.reload('bench');
    void assets.reload('benchTimber');
    void assets.reload('sparks');
    for (const id of [
      'postmaster', 'albert', 'mira', 'rowan', 'liliane',
      'amina', 'niko', 'maeve', 'vittorio', 'ferry-recruit',
      'bunny', 'staff', 'flower-pot',
    ] as AssetId[]) void assets.reload(id);
  });
}
