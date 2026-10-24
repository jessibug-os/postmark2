import * as THREE from 'three';
import type { IslandMap } from '../island/IslandMap';
import { riverBankDistance, RIVER_WATERLINE } from '../island/IslandRuntime';

/** A small quarter-circle lip followed by a near-vertical curtain. */
export function waterfallSection(top: number, foot: number, t: number): [number, number] {
  const drop = top - foot;
  const radius = Math.min(.18, drop * .18);
  const arc = radius * Math.PI / 2;
  const travel = t * (arc + drop - radius);
  if (travel < arc) {
    const angle = travel / radius;
    return [radius * Math.sin(angle), top - radius * (1 - Math.cos(angle))];
  }
  return [radius, top - radius - (travel - arc)];
}

/** The cell contour supplies the drop; the continuous bank supplies its width. */
export function fitWaterfallBanks(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshLambertMaterial>,
  island: IslandMap,
): void {
  const original = mesh.geometry;
  // Preserve four-channel colours and flow attributes while refining the bank
  // samples. The general Three modifier retains only RGB and standard UVs.
  const names = Object.keys(original.attributes);
  const attributes = names.map(name => original.getAttribute(name));
  const sizes = attributes.map(a => a.itemSize);
  const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));
  const output = names.map(() => [] as number[]);
  const read = (i: number): number[] => attributes.flatMap(a =>
    Array.from({length: a.itemSize}, (_, k) => a.array[i * a.itemSize + k]));
  const pos = offsets[names.indexOf('position')];
  const length = (a: number[], b: number[]) => Math.hypot(...[0, 1, 2].map(k => a[pos+k] - b[pos+k]));
  const split = (a: number[], b: number[], c: number[], depth: number): void => {
    const edges = [length(a,b), length(b,c), length(c,a)];
    const longest = Math.max(...edges);
    if (longest > .3 && depth < 10) {
      const e = edges.indexOf(longest), points = [a,b,c];
      const p = points[e], q = points[(e+1)%3], r = points[(e+2)%3];
      const mid = p.map((v,i) => (v+q[i])*.5);
      split(p,mid,r,depth+1); split(mid,q,r,depth+1);
    } else {
      for (const v of [a,b,c]) sizes.forEach((size,i) => output[i].push(...v.slice(offsets[i], offsets[i]+size)));
    }
  };
  const count = original.getAttribute('position').count;
  for (let i=0;i<count;i+=3) split(read(i),read(i+1),read(i+2),0);
  mesh.geometry = new THREE.BufferGeometry();
  names.forEach((name,i) => mesh.geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[i], sizes[i])));
  original.dispose();
  const p = mesh.geometry.getAttribute('position');
  const bank = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    bank[i] = riverBankDistance(island, p.getX(i), p.getZ(i)) - RIVER_WATERLINE;
  }
  mesh.geometry.setAttribute('fallBank', new THREE.BufferAttribute(bank, 1));
  const material = mesh.material;
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = 'attribute float fallBank; varying float vFallBank;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFallBank = fallBank;');
    shader.fragmentShader = 'varying float vFallBank;\n' + shader.fragmentShader
      .replace('#include <alphatest_fragment>', `
        diffuseColor.a *= smoothstep(0.0, .14, vFallBank);
        if (diffuseColor.a < .015) discard;
        #include <alphatest_fragment>
      `);
  };
  material.customProgramCacheKey = () => `${key}-fitted-fall-v1`;
  material.needsUpdate = true;
  mesh.userData.noSubjectFade = true;
}
