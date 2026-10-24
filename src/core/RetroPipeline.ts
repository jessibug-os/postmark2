import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';

/**
 * Renders the scene into a low-resolution WebGLRenderTarget, then blits it to
 * the canvas via a fullscreen quad with nearest-neighbour sampling and a
 * gentle film pass: saturation lift, warm shadow tint, and a soft vignette.
 */
export class RetroPipeline {
  /** When false, the scene renders directly to the canvas at native res. */
  enabled = true;

  private renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private bloomTarget: THREE.WebGLRenderTarget;
  private blitScene: THREE.Scene;
  private blitCamera: THREE.OrthographicCamera;
  private blitMaterial: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer, width = 480, height = 360) {
    this.renderer = renderer;
    this.target = this.createTarget(width, height);
    this.bloomTarget = this.createTarget(width, height);

    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        tBloom: { value: this.bloomTarget.texture },
        uSaturation: { value: 1.18 },
        uVignette: { value: 0.26 },
        uWarmth: { value: 0.028 },
        // Season grade: tint color + strength, and a saturation multiplier.
        uSeasonTint: { value: new THREE.Color(PALETTE_HEX.hffffff) },
        uSeasonStrength: { value: 0.0 },
        uSeasonSat: { value: 1.0 },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float uSaturation;
        uniform float uVignette;
        uniform float uWarmth;
        uniform vec3 uSeasonTint;
        uniform float uSeasonStrength;
        uniform float uSeasonSat;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D(tScene, vUv).rgb;
          // Amber-only low-res bloom from a dedicated emissive-object layer.
          // Lit walls never enter tBloom, regardless of how warm they become.
          vec3 bloom = vec3(0.0);
          vec2 offsets[4];
          offsets[0] = vec2(2.0, 0.0);
          offsets[1] = vec2(-2.0, 0.0);
          offsets[2] = vec2(0.0, 2.0);
          offsets[3] = vec2(0.0, -2.0);
          for (int i = 0; i < 4; i++) {
            bloom += texture2D(tBloom, vUv + offsets[i] * uTexel).rgb;
          }
          color += bloom * 0.16;
          // Saturation lift around luma.
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(luma), color, uSaturation);
          // Season grade: soft-light toward the season tint, then re-saturate.
          color = mix(color, color * uSeasonTint * 1.6, uSeasonStrength);
          color = mix(vec3(luma), color, uSeasonSat);
          // Shadow tint: warm paper glow by day, cool blue wash by night
          // (uWarmth is driven by daylight and goes negative after dark).
          float shadow = 1.0 - smoothstep(0.0, 0.55, luma);
          color += mix(vec3(0.0, uWarmth * -0.3, uWarmth * -0.9),
                       vec3(uWarmth, uWarmth * 0.55, 0.0),
                       step(0.0, uWarmth)) * shadow;
          // Soft vignette.
          vec2 d = vUv - 0.5;
          float vig = 1.0 - dot(d, d) * 2.2 * uVignette;
          color *= vig;
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.blitScene = new THREE.Scene();
    this.blitScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMaterial),
    );
  }

  get width(): number {
    return this.target.width;
  }

  get height(): number {
    return this.target.height;
  }

  /** Drive the film pass from time of day: warm by day, cool at night. */
  setDaylight(daylight: number): void {
    // Night pushes further into blue than the old -0.03 floor, which was too
    // timid to overcome the green of the grass after dark.
    this.blitMaterial.uniforms.uWarmth.value = -0.075 + daylight * 0.1;
  }

  /** Season color grade: tint hex, blend strength, saturation multiplier. */
  setSeasonGrade(tint: number, strength: number, sat: number): void {
    (this.blitMaterial.uniforms.uSeasonTint.value as THREE.Color).setHex(tint);
    this.blitMaterial.uniforms.uSeasonStrength.value = strength;
    this.blitMaterial.uniforms.uSeasonSat.value = sat;
  }

  setResolution(width: number, height: number): void {
    this.target.dispose();
    this.bloomTarget.dispose();
    this.target = this.createTarget(width, height);
    this.bloomTarget = this.createTarget(width, height);
    this.blitMaterial.uniforms.tScene.value = this.target.texture;
    this.blitMaterial.uniforms.tBloom.value = this.bloomTarget.texture;
    this.blitMaterial.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    // Render only objects opted into layer 2 against black. Emissive materials
    // remain visible; warm light falling on ordinary geometry cannot leak in.
    const savedMask = camera.layers.mask;
    const savedBackground = scene.background;
    const savedFog = scene.fog;
    camera.layers.set(2);
    scene.background = null;
    scene.fog = null;
    this.renderer.setRenderTarget(this.bloomTarget);
    this.renderer.setClearColor(PALETTE_HEX.h000000, 1);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    camera.layers.mask = savedMask;
    scene.background = savedBackground;
    scene.fog = savedFog;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }

  /**
   * The composited frame, at the resolution the game actually draws.
   *
   * This is what a recorded take has to be made of. Reading the canvas back
   * would need `preserveDrawingBuffer` on the renderer — a cost paid by every
   * frame of the real game so that the editor can occasionally save one — and
   * reading `this.target` would hand back the picture *before* the film pass,
   * missing the warmth, bloom and season grade that are half of how a frame
   * looks. So the blit is simply run once more into a capture target: one
   * full-screen quad, the same shader, the exact 480x360 image, and nothing
   * changed about how the game renders when nobody is recording.
   *
   * Pixels come out of WebGL bottom-up, so the rows are flipped on the way into
   * the 2D canvas — otherwise every take is upside down.
   */
  capture(type = 'image/webp', quality = 0.82): string {
    const { width, height } = this.target;
    if (!this.captureTarget
      || this.captureTarget.width !== width || this.captureTarget.height !== height) {
      this.captureTarget?.dispose();
      this.captureTarget = this.createTarget(width, height);
    }
    this.renderer.setRenderTarget(this.captureTarget);
    this.renderer.render(this.blitScene, this.blitCamera);
    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(this.captureTarget, 0, 0, width, height, pixels);
    this.renderer.setRenderTarget(null);

    const canvas = this.captureCanvas ??= document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return '';
    const image = context.createImageData(width, height);
    const stride = width * 4;
    for (let row = 0; row < height; row++) {
      const from = (height - 1 - row) * stride;
      image.data.set(pixels.subarray(from, from + stride), row * stride);
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL(type, quality);
  }

  private captureTarget: THREE.WebGLRenderTarget | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;

  private createTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(width, height, {
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  }
}
