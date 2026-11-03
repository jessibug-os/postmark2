import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/harbor');
  await page.waitForFunction(() => !!window.__harborPreview, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const { assets } = await import('/src/core/AssetLoader.ts');
    await assets.preload(['post-office', 'bench', 'lantern-post']);
    const { TownMap } = await import('/src/world/TownMap.ts');
    const { HARBOR_DRAFT_OUTDOOR_ANCHORS: anchors, HARBOR_DRAFT_ROUTE_LINKS: links } = await import('/src/content/little-harbor/mapDraft.ts');
    const { LEGACY_WORLD_CONTENT } = await import('/src/world/WorldContent.ts');
    // Explicitly audit the copied draft's legacy fixtures; never a Harbor runtime default.
    const town = new TownMap(LEGACY_WORLD_CONTENT);
    const collisionAnchors = anchors.map(anchor => ({ id: anchor.id, ...anchor.transform,
      playerClear: town.isPlacementClear(anchor.transform.x, anchor.transform.z, 0.45),
      passingClear: town.isPlacementClear(anchor.transform.x, anchor.transform.z, 0.9) }));
    const { ACTIVE_FIELD: field, SPOTS, MAP } = await import('/src/world/mapConstants.ts');
    const { Vector3, Scene } = await import('/node_modules/three/build/three.module.js');
    const { HarborTownPlace } = await import('/src/game/HarborTownPlace.ts');
    const surveyScene = new Scene();
    let restored = null;
    const surveyPlayer = { interior: null, setOutdoorCollision() {}, restoreTransform(position) { restored = position.clone(); } };
    const adapter = new HarborTownPlace(town, (x,z) => field.heightAt(x,z), surveyScene, surveyPlayer, { snapTo() {} });
    const adapterAnchors = anchors.map(anchor => {
      const position = { placeId: 'town', ...anchor.transform };
      const standable = adapter.standable(position);
      if (standable) adapter.install(position);
      return { id: anchor.id, standable, restoredHeight: standable ? restored.y : null };
    });
    adapter.dispose();
    if (surveyScene.children.length) throw new Error('Town adapter left a scene attachment');
    const byId = new Map(anchors.map(a => [a.id, a.transform]));
    const clearance = new Map();
    const clear = (x, z) => {
      const key = `${x},${z}`;
      if (clearance.has(key)) return clearance.get(key);
      const ok = town.isPlacementClear(x, z, 0.9) && Array.from({ length: 8 }, (_, i) => i * Math.PI / 4)
        .every(a => field.walkableAt(x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9));
      clearance.set(key, ok); return ok;
    };
    const routes = links.map(([from, to]) => {
      const start = byId.get(from), end = byId.get(to);
      const queue = [{ x: start.x, z: start.z, distance: 0 }], seen = new Set([`${start.x},${start.z}`]);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        if (current.x === end.x && current.z === end.z) return { from, to, metres: current.distance };
        for (const [dx, dz] of [[0.5,0],[-0.5,0],[0,0.5],[0,-0.5]]) {
          const x = current.x + dx, z = current.z + dz, key = `${x},${z}`;
          if (x < -65 || x > 0 || z < 0 || z > 75 || seen.has(key) || !clear(x,z)) continue;
          const previous = new Vector3(current.x, field.heightAt(current.x,current.z), current.z);
          const moved = new Vector3(x, field.heightAt(x,z), z);
          town.collide(moved, 0.45, previous);
          if (Math.hypot(moved.x-x,moved.z-z) > 0.001) continue;
          seen.add(key); queue.push({ x, z, distance: current.distance + 0.5 });
        }
      }
      return { from, to, metres: null };
    });
    const points = Object.fromEntries(Object.entries(SPOTS).map(([id, p]) => [id,
      { x: p.x, z: p.z, height: field.heightAt(p.x, p.z), walkable: field.walkableAt(p.x, p.z) }]));
    const office = SPOTS.townHall;
    const nearby = [];
    for (let dz = -20; dz <= 20; dz += 5) for (let dx = -20; dx <= 20; dx += 5) {
      const x = office.x + dx, z = office.z + dz;
      const height = field.heightAt(x, z);
      const clear = [[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([a,b]) =>
        field.walkableAt(x+a,z+b) && Math.abs(field.heightAt(x+a,z+b)-height) < 0.1);
      if (clear) nearby.push({ x, z, height });
    }
    return { map: MAP, points, collisionAnchors, adapterAnchors, routes, fixtureTypes: [...new Set(town.placedObjects.map(p => p.type))], nearby, caveat: 'Current draft colliders still belong to legacy fixtures; not final Harbor building collision.' };
  });
  assert.ok(result.collisionAnchors.every(a => a.passingClear), 'Draft anchor clearance');
  assert.ok(result.adapterAnchors.every(a => a.standable), 'Town adapter anchor installation');
  assert.ok(result.routes.every(route => route.metres !== null), 'Draft routes through movement collision');
  const { nearby, ...summary } = result;
  console.log(JSON.stringify({ ...summary, nearbyClearSamples: nearby.length }, null, 2));
} finally { await browser.close(); }
