import * as THREE from 'three';
import { applyVertexSnap } from '../../core/RetroMaterial';

export const TINT_GROUPS = ['skin', 'hair', 'top', 'bottom', 'outer', 'shoes', 'hat', 'bag'] as const;
export type TintGroup = (typeof TINT_GROUPS)[number];
export const TINT_SLOTS = TINT_GROUPS.length * 3;

const VERTEX_HEAD = 'attribute float tintGroup;\nvarying float vTintGroup;\n';

const FRAGMENT_HEAD = `uniform sampler2D uTintMask;\nuniform vec3 uTint[${TINT_SLOTS}];\nvarying float vTintGroup;\n`;

const FRAGMENT_TINT = /* glsl */ `
#include <map_fragment>
{
  vec4 tintMask = texture2D(uTintMask, vMapUv);
  int tintBase = int(vTintGroup + 0.5) * 3;
  vec3 tint = mix(vec3(1.0), uTint[tintBase], tintMask.r)
    * mix(vec3(1.0), uTint[tintBase + 1], tintMask.g)
    * mix(vec3(1.0), uTint[tintBase + 2], tintMask.b);
  diffuseColor.rgb *= mix(tint, vec3(1.0), tintMask.a);
}
`;

export function createBodyMaterial(template: THREE.MeshLambertMaterial, mask: THREE.Texture): THREE.MeshLambertMaterial {
  const material = applyVertexSnap(new THREE.MeshLambertMaterial({
    name: template.name,
    map: template.map,
    side: template.side,
    flatShading: false,
  }));
  const tints = { value: Array.from({ length: TINT_SLOTS }, () => new THREE.Color(1, 1, 1)) };
  const retro = material.onBeforeCompile;
  const retroKey = material.customProgramCacheKey;
  material.userData.tints = tints;
  material.onBeforeCompile = (shader, renderer) => {
    retro.call(material, shader, renderer);
    shader.uniforms.uTintMask = { value: mask };
    shader.uniforms.uTint = tints;
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vTintGroup = tintGroup;');
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <map_fragment>', FRAGMENT_TINT);
  };
  material.customProgramCacheKey = () => `${retroKey.call(material)}-chargen-tint`;
  return material;
}

export function setTints(material: THREE.Material, colors: ReadonlyArray<string | undefined>, defaults: ReadonlyArray<string | undefined>, grey: number): void {
  const scale = 1 / new THREE.Color().setRGB(grey / 255, grey / 255, grey / 255, THREE.SRGBColorSpace).r;
  const tints = (material.userData.tints as { value: THREE.Color[] }).value;
  tints.forEach((tint, i) => {
    tint.set(colors[i] ?? defaults[i] ?? '#ffffff').multiplyScalar(scale);
  });
}
