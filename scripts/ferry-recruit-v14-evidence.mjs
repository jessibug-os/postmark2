/** Matched Ferry Recruit v14 / Vittorio v12 evidence. Visual verdict is human-only. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'docs/review-queue/ferry-recruit-v14';
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/silhouette`, { recursive: true });
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
  ['seated-concern-dip-1', 0, 'seated_concern', .25, false],
  ['seated-concern-return', 0, 'seated_concern', .46, false],
  ['seated-concern-dip-2', 0, 'seated_concern', .72, false],
  ['stand-up', 0, 'stand_up', .55, false], ['boot-contact', 0, 'walk', 0, false],
];

async function render(actorName, angle, clipName, phase, head, silhouette=false, hideDocket=false) {
  return page.evaluate(async (args) => {
    const { actorName, angle, clipName, phase, head, silhouette, hideDocket } = args;
    const THREE = await import('/@id/three');
    const { GLTFLoader } = await import('/@id/three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(`/assets/${actorName}.glb`);
    const actor = gltf.scene;
    actor.rotation.y = angle;
    if (clipName) {
      const clip = gltf.animations.find((candidate) => candidate.name === clipName);
      if (!clip && actorName === 'ferry-recruit-v14') throw new Error(`missing ${actorName}:${clipName}`);
      if (clip) {
        const mixer = new THREE.AnimationMixer(actor);
        mixer.clipAction(clip).play(); mixer.setTime(clip.duration * phase); actor.updateMatrixWorld(true);
      }
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(silhouette ? 0xffffff : 0x27303a);
    scene.add(actor);
    if (silhouette) actor.traverse((o) => { if (o.isMesh) {
      const material = new THREE.MeshBasicMaterial({color:0x111111});
      if (hideDocket) material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPosition;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPosition = position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPosition;')
          .replace('void main() {', 'void main() {\nif (vLocalPosition.y < -0.36 && vLocalPosition.z > 0.90 && vLocalPosition.z < 1.58 && vLocalPosition.x > -0.08 && vLocalPosition.x < 0.22) discard;');
      };
      o.material = material;
    }});
    else {
      scene.add(new THREE.HemisphereLight(0xffedcf, 0x263448, 2.25));
      const key = new THREE.DirectionalLight(0xffdfb0, 2.8); key.position.set(-3,-5,7); scene.add(key);
    }
    const camera = new THREE.PerspectiveCamera(head ? 30 : 35, 4/3, .01, 100);
    camera.position.set(0, head ? 2.32 : 3.25, head ? 2.15 : 6.4);
    camera.lookAt(0, head ? 2.12 : 1.35, 0);
    const renderer = new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setSize(480,360,false); renderer.render(scene,camera);
    const result = renderer.domElement.toDataURL('image/png'); renderer.dispose(); return result;
  }, { actorName, angle, clipName, phase, head, silhouette, hideDocket });
}

for (const actorName of ['ferry-recruit-v14', 'vittorio-v12']) for (const [name,angle,clip,phase,head] of shots) {
  const png = await render(actorName, angle, clip, phase, head);
  writeFileSync(`${OUT}/${actorName}-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
}
for (const [name,angle,hide] of [['front-prop',0,false],['front-no-prop',0,true],['quarter-prop',Math.PI/4,false],['quarter-no-prop',Math.PI/4,true],['profile-no-prop',Math.PI/2,true],['rear-no-prop',Math.PI,true]]) {
  const png = await render('ferry-recruit-v14', angle, null, .5, false, true, hide);
  writeFileSync(`${OUT}/silhouette/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();
console.log(`WROTE ${shots.length * 2 + 6} v14 evidence frames to ${OUT}`);
