/** Matched Ferry Recruit v12 / Vittorio v12 review evidence. Visual verdict is human-only. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'docs/review-queue/ferry-recruit-v12';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
await page.goto(URL);

const shots = [
  ['front', 0, null, .5, false], ['quarter', Math.PI / 4, null, .5, false],
  ['profile', Math.PI / 2, null, .5, false], ['rear', Math.PI, null, .5, false],
  ['head-front', 0, null, .5, true], ['head-quarter', Math.PI / 4, null, .5, true],
  ['idle', 0, 'idle', .5, false], ['walk-extreme', 0, 'walk', .25, false],
  ['talk', 0, 'talk_warm', .5, false], ['concern', 0, 'concern', .42, false],
  ['seated-idle', 0, 'seated_idle', .3, false],
  ['seated-talk', 0, 'seated_talk_warm', .5, false],
  ['seated-concern', 0, 'seated_concern', .42, false],
  ['stand-up', 0, 'stand_up', .55, false], ['boot-contact', 0, 'walk', 0, false],
];

for (const actorName of ['ferry-recruit-v12', 'vittorio-v12']) {
  for (const [name, angle, clipName, phase, head] of shots) {
    const png = await page.evaluate(async ({ actorName, angle, clipName, phase, head }) => {
      const THREE = await import('/@id/three');
      const { GLTFLoader } = await import('/@id/three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(`/assets/${actorName}.glb`);
      const actor = gltf.scene;
      actor.rotation.y = angle;
      if (clipName) {
        const clip = gltf.animations.find((candidate) => candidate.name === clipName);
        if (clip) {
          const mixer = new THREE.AnimationMixer(actor);
          mixer.clipAction(clip).play();
          mixer.setTime(clip.duration * phase);
          actor.updateMatrixWorld(true);
        }
      }
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x27303a);
      scene.add(actor, new THREE.HemisphereLight(0xffedcf, 0x263448, 2.25));
      const key = new THREE.DirectionalLight(0xffdfb0, 2.8);
      key.position.set(-3, -5, 7);
      scene.add(key);
      const camera = new THREE.PerspectiveCamera(head ? 30 : 35, 4 / 3, .01, 100);
      camera.position.set(0, head ? 2.32 : 3.25, head ? 2.15 : 6.4);
      camera.lookAt(0, head ? 2.12 : 1.35, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setSize(480, 360, false);
      renderer.render(scene, camera);
      const result = renderer.domElement.toDataURL('image/png');
      renderer.dispose();
      return result;
    }, { actorName, angle, clipName, phase, head });
    writeFileSync(`${OUT}/${actorName}-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
}

await browser.close();
console.log(`WROTE ${shots.length * 2} matched evidence frames to ${OUT}`);
