import * as THREE from 'three';
import { assets } from '../core/AssetLoader';
import { RetroPipeline } from '../core/RetroPipeline';
import { snapUniforms } from '../core/RetroMaterial';
import { bootstrapContext } from '../content/BootstrapContext';
import { CAFE_PLACE, CAFE_ANCHORS } from '../content/little-harbor/cafeRoom';
import { STARTER_ROOM_PLACE, STARTER_ROOM_ANCHORS, starterRoomSpawn } from '../content/little-harbor/places';
import { HARBOR_DRAFT_OUTDOOR_ANCHORS } from '../content/little-harbor/mapDraft';
import { applyHarborPlayerPresentation } from '../content/little-harbor/playerPresentation';
import { Player } from '../player/Player';
import { Input } from '../player/Input';
import { CameraRig } from '../world/CameraRig';
import { TownMap, heightAt } from '../world/TownMap';
import { LEGACY_WORLD_CONTENT } from '../world/WorldContent';
import { PlaceRegistry } from '../world/PlaceRegistry';
import { DayNight } from '../world/DayNight';
import { SubjectProtection } from '../world/SubjectProtection';
import { HarborCafeCarry } from '../world/HarborCafeCarry';
import { HarborSaveCodec } from '../systems/HarborSaveCodec';
import { validHarborState } from '../systems/HarborState';
import { expireVisits } from '../systems/SocialEventSystem';
import { InteractionResolver, type InteractionCandidate } from '../interaction/InteractionResolver';
import { HarborPauseMenu } from '../ui/HarborPauseMenu';
import { HarborSaveStatus } from '../ui/HarborSaveStatus';
import { HarborStorageMenu } from '../ui/HarborStorageMenu';
import { HarborSleepMenu } from '../ui/HarborSleepMenu';
import { HarborCafeOrderMenu } from '../ui/HarborCafeOrderMenu';
import { HarborCafeJournal } from '../ui/HarborCafeJournal';
import { harborPreviewStorage } from './HarborPreviewStorage';
import { openHarborServices } from './HarborServices';
import { HarborWorldRuntime } from './HarborWorldRuntime';
import { HarborCafeController } from './HarborCafeController';

const storage = harborPreviewStorage(sessionStorage, 'world');
const loaded = new HarborSaveCodec(storage, validHarborState).load(bootstrapContext().slotId);
if (loaded.status === 'error') throw new Error(loaded.reason);
const services = openHarborServices(bootstrapContext(), storage, loaded.save ? undefined : {
  seed: 42, layoutVersion: 1, name: 'Robin', arrival: { placeId: 'town', x: -30, z: 26, yaw: 0 },
});
await assets.preload(['postmaster', 'chargen-kit', 'post-office', 'bench', 'lantern-post']);
// Explicit draft-only massing. This is not the release Harbor object library.
const town = new TownMap(LEGACY_WORLD_CONTENT);
for (const [id, label] of [['bakery.stairs', 'Upstairs room'], ['cafe.door', 'Café · draft entrance']]) {
  const anchor = HARBOR_DRAFT_OUTDOOR_ANCHORS.find(a => a.id === id)!;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#24382f'; ctx.fillRect(0,0,512,96);
  ctx.fillStyle = '#fff4df'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label,256,61);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sign.scale.set(4.8,0.9,1); sign.position.set(anchor.transform.x,heightAt(anchor.transform.x,anchor.transform.z)+2.4,anchor.transform.z);
  town.group.add(sign);
}
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x92a6b2);
const player = new Player(town); applyHarborPlayerPresentation(player); scene.add(player.object);
const camera = new CameraRig(1);
const places = new PlaceRegistry([{ id: 'town', spawnAnchor: 'dock.arrival', access: 'public', capacity: 100 }, STARTER_ROOM_PLACE, CAFE_PLACE],
  [...HARBOR_DRAFT_OUTDOOR_ANCHORS, ...STARTER_ROOM_ANCHORS, ...CAFE_ANCHORS], 1);
const world = new HarborWorldRuntime(scene, services, town, heightAt, player, camera, places,
  { occupants: () => 0, invited: () => false }); // No schedule actors installed in this draft.
const localPosition = () => {
  const room = world.room;
  return { placeId: world.host.currentPlaceId, x: player.position.x - (room ? room.origin.x-room.halfW : 0),
    z: player.position.z - (room ? room.origin.z-room.halfD : 0), yaw: player.object.rotation.y };
};
const id = () => `world-preview:${crypto.randomUUID()}`;
const cafe = new HarborCafeController(services, localPosition, id);
const carry = new HarborCafeCarry(player.object, player.animation);
const container = document.getElementById('app')!, panel = document.getElementById('panel')!, status = document.getElementById('status')!;
panel.querySelector('p')!.textContent = 'Connected world development preview. The outdoor post office is temporary bakery massing; café frontage and residents are unfinished. This tab has its own shared town/home/café save.';
panel.querySelectorAll('p')[1].textContent = 'Walk: WASD / left stick. Use doors and objects: E / A. Decorate at home: F / X. Journal: J / View. Pause: Esc / B. The upstairs door is east of the old office; the café marker is farther east.';
document.title = 'Little Harbor · Connected draft';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); container.append(renderer.domElement);
const pipeline = new RetroPipeline(renderer, 640, 480), lighting = new DayNight(scene);
const protection = new SubjectProtection(scene, camera.camera, player.object);
const input = new Input(), resolver = new InteractionResolver(), alternate = new InteractionResolver();
let notice = '';
const saves = new HarborSaveStatus(() => services.commands.pendingSave, () => services.commands.retrySave(), true); panel.append(saves.element);
const pause = new HarborPauseMenu(services, true, scale => document.documentElement.style.setProperty('--text-scale', String(scale)),
  value => { camera.reducedMotion = value; protection.reducedMotion = value; });
const orders = new HarborCafeOrderMenu(services.time), journal = new HarborCafeJournal(services.time, cafe);
const homeStorage = new HarborStorageMenu(services, world.home, id);
const sleep = new HarborSleepMenu(services.time, day => services.sleep(day, {
  offers() {}, plants(state) { if (state.plants.length) throw new Error('Plant rollover not installed'); },
  appointments: expireVisits, residents(state) { if (Object.keys(state.residents).length) throw new Error('Resident rollover not installed'); },
}, starterRoomSpawn()), () => { const restored = world.home.restorePlayerPosition(); player.restoreTransform(restored.world, restored.yaw); world.home.refresh(); });
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.camera.aspect = container.clientWidth/container.clientHeight; camera.camera.updateProjectionMatrix();
  camera.distance = world.room ? Math.max(20,24/camera.camera.aspect) : Math.max(15,16/camera.camera.aspect);
}
resize(); new ResizeObserver(resize).observe(container);
const retry = document.createElement('button'); retry.textContent = 'Retry entering place'; retry.hidden = true;
retry.onclick = () => { const result = world.host.retryInstall(); notice = result.ok ? '' : result.reason; retry.hidden = result.ok; resize(); };
panel.append(retry);
async function travel(destination: string) {
  const activeJob = Object.values(services.commands.snapshot.state.jobs).some(run => run.status === 'active' || run.status === 'readyToSettle');
  const result = await world.travel(id(), destination, activeJob ? 'continue-later' : undefined);
  notice = result.ok ? '' : result.reason;
  retry.hidden = result.ok || !result.committed;
  resolver.clear(); alternate.clear(); resize();
}
function doors(): InteractionCandidate[] {
  const current = world.host.currentPlaceId;
  const destinations = current === 'town' ? [STARTER_ROOM_PLACE, CAFE_PLACE] : [places.place(current)];
  return destinations.map(place => {
    const a = places.anchor(current === 'town' ? place.entranceAnchor! : place.exitAnchor!);
    const room = world.room;
    return { id: `door:${place.id}`, ownerId: place.id, kind: 'fixture', priority: 1, radius: 1.1,
      anchor: { x: a.transform.x + (room ? room.origin.x-room.halfW : 0), z: a.transform.z + (room ? room.origin.z-room.halfD : 0) },
      promptKey: current === 'town' ? `Enter ${place.id === 'starter-room' ? 'your upstairs room' : 'the café'}`
        : current === 'cafe' && cafe.earlyFinishMessage ? 'Leave café · continue shift later today' : 'Go outside',
      command: () => { void travel(current === 'town' ? place.id : 'town'); } };
  });
}
snapUniforms.uCurvature.value = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now-last)/1000,0.1); last = now; input.pollGamepad();
  const owned = sleep.handleInput(input) || homeStorage.handleInput(input) || orders.handleInput(input) || journal.handleInput(input)
    || world.home.handleInput(input,id) || pause.handleInput(input);
  let prompt = world.host.currentPlaceId === 'cafe' ? cafe.instruction : 'Explore the draft town and your upstairs room.';
  if (!owned && !services.time.paused && !world.host.busy) {
    const candidates = doors();
    if (world.room?.id === 'starter-room') candidates.push(...world.home.useCandidates(player.position,id,()=>homeStorage.show(),()=>sleep.show()));
    if (world.room?.id === 'cafe') candidates.push(...cafe.candidates().map(c => ({ ...c, anchor: {
      x: world.room!.origin.x-world.room!.halfW+c.anchor.x, z: world.room!.origin.z-world.room!.halfD+c.anchor.z } })));
    const context = { position: player.position, aim: { x: Math.sin(player.object.rotation.y), z: Math.cos(player.object.rotation.y) }, modal: false, decoration: false, alternate: false };
    const focused = resolver.resolve(candidates,context);
    const move = alternate.resolve(world.home.decorationCandidates(player.position),{...context,alternate:true});
    if (focused) prompt = `E / A: ${focused.promptKey}`; if (move) prompt += ` · F / X: ${move.promptKey}`;
    if (input.actions.take('alternate')) move?.command();
    else if (input.actions.take('interact') && focused) {
      if (focused.id.endsWith(':cafe.tray-pickup') && cafe.orderMessage) orders.show(cafe.orderMessage,focused.command);
      else if (focused.id.endsWith(':cafe.counter') && cafe.earlyFinishMessage) orders.show(cafe.earlyFinishMessage,focused.command,true);
      else focused.command();
    }
    carry.sync(world.host.currentPlaceId === 'cafe' ? cafe.heldPropId : null);
    if (!services.time.paused) player.update(input,dt);
  }
  world.capturePosition(); services.tick(dt); saves.update(); carry.update();
  lighting.season = services.time.season; lighting.update(services.time.daylight,services.time.hour);
  world.room?.setDaylight(services.time.daylight); town.update(dt,services.time.hour,services.time.daylight);
  snapUniforms.uTime.value += dt; camera.update(world.cameraTarget,dt);
  scene.updateMatrixWorld(true); protection.update(dt); pipeline.render(scene,camera.camera);
  status.textContent = `${services.time.clockText} · ${services.commands.snapshot.state.wallet.coins} coins · ${world.host.currentPlaceId} — ${notice || world.home.placementStatus || prompt}`;
  input.clearFrame();
});
Object.assign(window,{__harborWorldPreview:{world,services,player,scene,places,storage}});
