import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  await page.goto('http://localhost:5173/harbor');
  await page.waitForFunction(() => !!window.__harborPreview);
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { buildHarborCafe } = await import('/src/world/HarborCafe.ts');
    const room = buildHarborCafe(30);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x283d43);
    scene.add(room.group, new THREE.HemisphereLight(0xffedcf, 0x50646e, 2));
    const light = new THREE.DirectionalLight(0xffedcf, 2); light.position.set(room.origin.x - 3, 10, 5); scene.add(light);
    const camera = new THREE.PerspectiveCamera(40, 1100 / 850, 0.1, 100);
    camera.position.copy(room.origin).add(new THREE.Vector3(0, 12, 13));
    camera.lookAt(room.origin);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1100, 850);
    renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:9999';
    document.body.append(renderer.domElement); renderer.render(scene, camera);
    return { spawnClear: room.canStand(room.toWorld(room.spawn)), spawnAtDoor: room.atDoor(room.toWorld(room.spawn)),
      hotspots: room.hotspots.map(h => h.action), furnitureCount: room.group.getObjectByName('harbor-cafe-furnishings').children.length };
  });
  assert.equal(result.spawnClear, true); assert.equal(result.spawnAtDoor, false);
  assert.deepEqual(result.hotspots, ['cafe:counter', 'cafe:pickup', 'cafe:return']);
  assert.ok(result.furnitureCount > 20);
  await page.screenshot({ path: '/tmp/harbor-cafe.png' });
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
