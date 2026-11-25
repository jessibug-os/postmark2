import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TINT_GROUPS, type TintGroup } from './material';

type TypedArrayType = Float32ArrayConstructor | Uint16ArrayConstructor;

const ATTRIBUTES: Record<string, TypedArrayType> = {
  position: Float32Array,
  normal: Float32Array,
  uv: Float32Array,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
};

const MIN_RADIUS = 5;

const prepared = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

function copyAttribute(source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, Type: TypedArrayType): THREE.BufferAttribute {
  const array = new Type(source.count * source.itemSize);
  for (let i = 0; i < source.count; i++) {
    for (let c = 0; c < source.itemSize; c++) array[i * source.itemSize + c] = source.getComponent(i, c);
  }
  return new THREE.BufferAttribute(array, source.itemSize);
}

function partGeometry(mesh: THREE.SkinnedMesh): THREE.BufferGeometry {
  const source = mesh.geometry;
  const cached = prepared.get(source);
  if (cached) return cached;
  const geometry = new THREE.BufferGeometry();
  for (const [name, Type] of Object.entries(ATTRIBUTES)) geometry.setAttribute(name, copyAttribute(source.getAttribute(name), Type));
  const count = source.getAttribute('position').count;
  const group = Math.max(0, TINT_GROUPS.indexOf(mesh.userData.kit_tint as TintGroup));
  geometry.setAttribute('tintGroup', new THREE.BufferAttribute(new Float32Array(count).fill(group), 1));
  geometry.setIndex(source.index ? Array.from(source.index.array) : Array.from({ length: count }, (_, i) => i));
  prepared.set(source, geometry);
  return geometry;
}

export interface Assembly {
  mesh: THREE.SkinnedMesh;
  update(parts: THREE.SkinnedMesh[]): void;
}

export function createAssembly(parts: THREE.SkinnedMesh[], material: THREE.Material): Assembly {
  const [first] = parts;
  const mismatch = parts.find((part) => !part.bindMatrix.equals(first.bindMatrix) || part.parent !== first.parent);
  if (mismatch) throw new Error(`chargen part "${mismatch.name}" does not share the kit bind pose`);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), material);
  mesh.name = 'chargen_body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  first.parent!.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  for (const part of parts) part.removeFromParent();
  let key = '';
  return {
    mesh,
    update(visible) {
      const next = visible.map((part) => part.uuid).join();
      if (next === key) return;
      key = next;
      const geometry = mergeGeometries(visible.map(partGeometry));
      if (!geometry) throw new Error('chargen parts could not be merged');
      geometry.computeBoundingSphere();
      geometry.boundingSphere!.radius = Math.max(geometry.boundingSphere!.radius, MIN_RADIUS);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.boundingSphere = geometry.boundingSphere!.clone();
    },
  };
}
