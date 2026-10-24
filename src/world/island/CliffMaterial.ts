import * as THREE from 'three';
import { PALETTE_HEX } from '../../art/palette';

/** Stone emerges on steep faces; the shoulder and foot keep their ground colour. */
export function applyCliffSurface(material: THREE.MeshLambertMaterial): void {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  const stone = new THREE.Color(PALETTE_HEX.h7d7a72);
  const texture = new THREE.TextureLoader().load('/assets/terrain/cliff-strata.svg');
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.cliffStone = {value: stone};
    shader.uniforms.cliffStrata = {value: texture};
    shader.vertexShader = 'varying float vCliffFace; varying vec3 vCliffPosition; varying vec2 vCliffAxis;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCliffFace = smoothstep(.03, .28, 1.0 - abs(normal.z));
        vCliffPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vCliffAxis = abs(normal.xy);
      `);
    shader.fragmentShader = 'varying float vCliffFace; varying vec3 vCliffPosition; varying vec2 vCliffAxis; uniform sampler2D cliffStrata; uniform vec3 cliffStone;\n' + shader.fragmentShader
      .replace('#include <lights_lambert_fragment>', `
        vec2 axes = vCliffAxis / max(vCliffAxis.x + vCliffAxis.y, .001);
        float strata = texture2D(cliffStrata, vCliffPosition.zy / vec2(4.8, 2.4)).r * axes.x
          + texture2D(cliffStrata, vCliffPosition.xy / vec2(4.8, 2.4)).r * axes.y;
        vec3 rock = cliffStone * (.78 + strata * .44);
        diffuseColor.rgb = mix(diffuseColor.rgb, rock, vCliffFace);
        #include <lights_lambert_fragment>
      `);
  };
  material.customProgramCacheKey = () => `${key}-cliff-stone-v2`;
  material.needsUpdate = true;
}
