import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(30000);
  await page.goto('http://localhost:5173/harbor');
  await page.waitForFunction(() => !!window.__harborPreview);
  const result = await page.evaluate(async () => {
    const { assets } = await import('/src/core/AssetLoader.ts');
    await assets.preload(['post-office', 'bench', 'lantern-post']);
    const { Scene, Vector3 } = await import('/node_modules/three/build/three.module.js');
    const { TownMap } = await import('/src/world/TownMap.ts');
    const { LEGACY_WORLD_CONTENT } = await import('/src/world/WorldContent.ts');
    const { heightAt } = await import('/src/world/terrain.ts');
    const { Player } = await import('/src/player/Player.ts');
    const { CameraRig } = await import('/src/world/CameraRig.ts');
    const { PlaceRegistry } = await import('/src/world/PlaceRegistry.ts');
    const { CAFE_PLACE, CAFE_ANCHORS } = await import('/src/content/little-harbor/cafeRoom.ts');
    const { STARTER_ROOM_PLACE, STARTER_ROOM_ANCHORS } = await import('/src/content/little-harbor/places.ts');
    const { HARBOR_DRAFT_OUTDOOR_ANCHORS } = await import('/src/content/little-harbor/mapDraft.ts');
    const { openHarborServices } = await import('/src/game/HarborServices.ts');
    const { HarborWorldRuntime } = await import('/src/game/HarborWorldRuntime.ts');
    const places = new PlaceRegistry([{ id: 'town', spawnAnchor: 'dock.arrival', access: 'public', capacity: 100 }, STARTER_ROOM_PLACE, CAFE_PLACE],
      [...HARBOR_DRAFT_OUTDOOR_ANCHORS, ...STARTER_ROOM_ANCHORS, ...CAFE_ANCHORS], 1);
    const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
    const context = { contentId: 'little-harbor', mapId: 'little-harbor-v1', saveNamespace: 'little-harbor-save-v1', slotId: 1 };
    const services = openHarborServices(context, storage, { seed: 42, layoutVersion: 1, name: 'Robin', arrival: { placeId: 'town', x: -30, z: 26, yaw: 0 } });
    // Explicit legacy content only for this copied-map lifecycle audit.
    const town = new TownMap(LEGACY_WORLD_CONTENT), scene = new Scene(), player = new Player(town), camera = new CameraRig(1);
    const world = new HarborWorldRuntime(scene, services, town, heightAt, player, camera, places, { occupants: () => 0, invited: () => false });
    const log = [];
    const moveTo = id => {
      const a = places.anchor(id), room = world.room;
      player.restoreTransform(room ? room.toWorld(new Vector3(a.transform.x-room.halfW,0,a.transform.z-room.halfD))
        : new Vector3(a.transform.x,heightAt(a.transform.x,a.transform.z),a.transform.z), a.transform.yaw);
    };
    const travel = async (id, destination) => {
      const outcome = await world.travel(id, destination);
      if (!outcome.ok) throw new Error(JSON.stringify(outcome));
      if (scene.children.length !== 1) throw new Error('Duplicate or missing place group');
      if (services.time.paused) throw new Error('Leaked transition pause');
      log.push({ place: world.host.currentPlaceId, saved: services.commands.snapshot.state.player.position.placeId, interior: player.interior?.id ?? null });
    };
    for (let i=0;i<3;i++) {
      moveTo('bakery.stairs'); await travel(`home-${i}`, 'starter-room');
      if (!world.room.group.getObjectByName('starter-bed')) throw new Error('Missing saved home furniture');
      moveTo('starter-room.exit'); await travel(`home-exit-${i}`, 'town');
      moveTo('cafe.door'); await travel(`cafe-${i}`, 'cafe');
      moveTo('cafe.exit'); await travel(`cafe-exit-${i}`, 'town');
    }
    moveTo('bakery.stairs'); await travel('save-home', 'starter-room'); services.save();
    world.dispose(); services.dispose();
    const reloaded = openHarborServices(context, storage);
    const resumed = new HarborWorldRuntime(scene, reloaded, town, heightAt, player, camera, places, { occupants: () => 0, invited: () => false });
    const restored = { place: resumed.host.currentPlaceId, interior: player.interior?.id, groups: scene.children.length };
    resumed.dispose(); reloaded.dispose();
    return { log, restored, groupsAfterDispose: scene.children.length };
  });
  assert.equal(result.log.length, 13); assert.ok(result.log.every(row => row.place === row.saved));
  assert.deepEqual(result.restored, { place: 'starter-room', interior: 'starter-room', groups: 1 });
  assert.equal(result.groupsAfterDispose, 0); console.log(JSON.stringify(result));
} finally { await browser.close(); }
