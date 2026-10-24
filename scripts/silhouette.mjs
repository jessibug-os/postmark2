/**
 * W4 Kindly Forward silhouette contact sheet.
 *
 * Renders all ten exported W4 assets as 64×64 flat-black masks from
 * the normal 40° gameplay pitch. Each is framed to its own bounds so the test
 * measures shape language rather than raw height. This mechanical distinctness
 * check is not visual approval: the sheet always goes to human review.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'docs/review-queue/w4-kindly-cast';
const SHEET = `${OUT}/contact-sheet.png`;
const MATRIX = `${OUT}/matrix.json`;
const SIZE = 64;
const THRESHOLD = 0.18;
const ACTORS = ['postmaster', 'albert', 'mira', 'rowan', 'liliane', 'amina', 'niko', 'maeve', 'vittorio', 'ferry-recruit'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(URL);

const captures = [];
for (const name of ACTORS) {
  const capture = await page.evaluate(async ({ actorName, size }) => {
    const THREE = await import('/@id/three');
    const { GLTFLoader } = await import('/@id/three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(`/assets/${actorName}.glb`);
    const actor = gltf.scene;
    if (!actor) throw new Error(`Missing exported Kindly Forward asset ${actorName}`);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.add(actor);
    actor.position.set(0, 0, 0);
    actor.rotation.set(0, 0, 0);
    actor.traverse((object) => {
      if (object.isSprite || object.isLine || object.isPoints) {
        object.visible = false;
      } else if (object.isMesh) {
        object.material = new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide,
          depthWrite: true,
        });
      }
    });
    actor.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(actor);
    if (box.isEmpty()) throw new Error(`Empty silhouette bounds for ${actorName}`);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    const pitch = THREE.MathUtils.degToRad(40);
    const distance = Math.max(3, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.18);
    camera.position.set(
      sphere.center.x,
      sphere.center.y + Math.sin(pitch) * distance,
      sphere.center.z + Math.cos(pitch) * distance,
    );
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0xffffff, 1);
    renderer.render(scene, camera);

    const read = document.createElement('canvas');
    read.width = size;
    read.height = size;
    const ctx = read.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(renderer.domElement, 0, 0, size, size);
    const rgba = ctx.getImageData(0, 0, size, size).data;
    const mask = [];
    let occupied = 0;
    for (let index = 0; index < rgba.length; index += 4) {
      const black = rgba[index] + rgba[index + 1] + rgba[index + 2] < 384 ? 1 : 0;
      mask.push(black);
      occupied += black;
    }
    renderer.dispose();
    return { png: read.toDataURL('image/png'), mask, occupied };
  }, { actorName: name, size: SIZE });
  if (capture.occupied < 40) errors.push(`${name} silhouette contains only ${capture.occupied} pixels`);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(capture.png.split(',')[1], 'base64'));
  captures.push({ name, ...capture });
}

const difference = (a, b) => {
  let xor = 0;
  let union = 0;
  for (let index = 0; index < a.length; index++) {
    xor += a[index] === b[index] ? 0 : 1;
    union += a[index] || b[index] ? 1 : 0;
  }
  return union ? xor / union : 0;
};

const rows = {};
const failures = [];
for (const a of captures) {
  rows[a.name] = {};
  for (const b of captures) {
    const value = a === b ? 0 : difference(a.mask, b.mask);
    rows[a.name][b.name] = +value.toFixed(4);
    if (a.name < b.name && value < THRESHOLD) {
      failures.push({ a: a.name, b: b.name, difference: +value.toFixed(4) });
    }
  }
}

const compositor = await context.newPage();
await compositor.setContent('<canvas></canvas>');
const sheet = await compositor.evaluate(async ({ images, size }) => {
  const scale = 2;
  const cellW = size * scale + 24;
  const cellH = size * scale + 48;
  const canvas = document.querySelector('canvas');
  canvas.width = cellW * 3;
  canvas.height = cellH * Math.ceil(images.length / 3);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eee6d4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const load = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
  for (let index = 0; index < images.length; index++) {
    const entry = images[index];
    const image = await load(entry.png);
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = col * cellW + 12;
    const y = row * cellH + 10;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, size * scale, size * scale);
    ctx.drawImage(image, x, y, size * scale, size * scale);
    ctx.strokeStyle = '#6b5945';
    ctx.strokeRect(x + 0.5, y + 0.5, size * scale - 1, size * scale - 1);
    ctx.fillStyle = '#302820';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.name.toUpperCase(), x + size, y + size * scale + 24);
  }
  return canvas.toDataURL('image/png');
}, {
  images: captures.map(({ name, png }) => ({ name, png })),
  size: SIZE,
});
writeFileSync(SHEET, Buffer.from(sheet.split(',')[1], 'base64'));
writeFileSync(MATRIX, `${JSON.stringify({
  actors: ACTORS,
  size: SIZE,
  cameraPitch: 40,
  metric: 'binary XOR / union',
  threshold: THRESHOLD,
  occupiedPixels: Object.fromEntries(captures.map((entry) => [entry.name, entry.occupied])),
  matrix: rows,
  failures,
}, null, 2)}\n`);

console.log(`THRESHOLD: ${THRESHOLD.toFixed(2)} (binary XOR / union)`);
console.log(`CONTACT SHEET: ${SHEET}`);
console.log(`MATRIX: ${MATRIX}`);
console.log('BELOW THRESHOLD:', failures.length ? JSON.stringify(failures) : 'none');
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
if (errors.length || failures.length) process.exitCode = 1;
