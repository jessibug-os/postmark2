/** W5 four-view gameplay-scale evidence. Visual verdict remains human-only. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'docs/review-queue/w5-cast-form';
const ACTORS = ['postmaster', 'albert', 'mira', 'rowan', 'liliane', 'amina', 'niko', 'maeve', 'vittorio', 'ferry-recruit'];
const VIEWS = { front: 0, quarter: Math.PI / 4, side: Math.PI / 2, back: Math.PI };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
await page.goto(URL);
for (const actorName of ACTORS) {
  for (const [viewName, angle] of Object.entries(VIEWS)) {
    const png = await page.evaluate(async ({ actorName, angle }) => {
      const THREE = await import('/@id/three');
      const { GLTFLoader } = await import('/@id/three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(`/assets/${actorName}.glb`);
      const actor = gltf.scene;
      actor.rotation.y = angle;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x27303a);
      scene.add(actor);
      const hemi = new THREE.HemisphereLight(0xffedcf, 0x263448, 2.25);
      const key = new THREE.DirectionalLight(0xffdfb0, 2.8);
      key.position.set(-3, -5, 7);
      scene.add(hemi, key);
      const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.01, 100);
      // Fixed gameplay-scale framing. Skeleton-derived animated bounds include
      // rest-pose tails and made the first evidence pass misleadingly tiny.
      camera.position.set(0, 3.25, 6.4);
      camera.lookAt(0, 1.35, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setSize(480, 360, false);
      renderer.render(scene, camera);
      const result = renderer.domElement.toDataURL('image/png');
      renderer.dispose();
      return result;
    }, { actorName, angle });
    writeFileSync(`${OUT}/${actorName}-${viewName}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
}
await browser.close();
console.log(`WROTE ${ACTORS.length * Object.keys(VIEWS).length} views to ${OUT}`);
