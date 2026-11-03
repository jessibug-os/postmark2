import { DayNight } from '../world/DayNight';
import { harborPreviewStorage } from './HarborPreviewStorage';
import { HarborSaveCodec } from '../systems/HarborSaveCodec';
import { validHarborState } from '../systems/HarborState';
import { starterRoomSpawn } from '../content/little-harbor/places';
import { HarborPauseMenu } from '../ui/HarborPauseMenu';
import { HarborSaveStatus } from '../ui/HarborSaveStatus';
import { SubjectProtection } from '../world/SubjectProtection';
import { applyHarborPlayerPresentation } from '../content/little-harbor/playerPresentation';
import { HarborSleepMenu } from '../ui/HarborSleepMenu';
import { expireVisits } from '../systems/SocialEventSystem';
import { HarborStorageMenu } from '../ui/HarborStorageMenu';
import * as THREE from 'three';
import { assets } from '../core/AssetLoader';
import { RetroPipeline } from '../core/RetroPipeline';
import { snapUniforms } from '../core/RetroMaterial';
import { bootstrapContext } from '../content/BootstrapContext';
import { Player } from '../player/Player';
import { Input } from '../player/Input';
import { CameraRig } from '../world/CameraRig';
import { openHarborServices } from './HarborServices';
import { InteractionResolver } from '../interaction/InteractionResolver';
import { HarborHomeController } from './HarborHomeController';

// Session storage survives reloads in this tab, under a separate preview prefix.
const previewStorage = harborPreviewStorage(sessionStorage);
const existing = new HarborSaveCodec(previewStorage, validHarborState).load(bootstrapContext().slotId);
if (existing.status === 'error') throw new Error(existing.reason);
const services = openHarborServices(bootstrapContext(), previewStorage, existing.save ? undefined
  : { seed: 42, layoutVersion: 1, name: 'Robin', arrival: starterRoomSpawn() });
await assets.preload(['postmaster']);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x242b30);
const lighting = new DayNight(scene);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
const container = document.getElementById('app')!;
container.append(renderer.domElement);
const pipeline = new RetroPipeline(renderer, 640, 480);
const home = new HarborHomeController(scene, services);
const player = new Player({ collide: position => home.room?.collide(position) });
applyHarborPlayerPresentation(player);
const rig = new CameraRig(innerWidth / innerHeight);
const place = home.preparePlace(player, rig);
const room = home.room!;
home.restorePlayerPosition();
place.install(services.commands.snapshot.state.player.position);
scene.add(player.object);
rig.distance = 15;
rig.snapTo(room.origin);
const protection = new SubjectProtection(scene, rig.camera, player.object);
snapUniforms.uCurvature.value = 0;
const input = new Input();
const interactions = new InteractionResolver();
const ordinaryInteractions = new InteractionResolver();
const status = document.getElementById('status')!;
const choices = document.getElementById('furniture')!;
const saveStatus = new HarborSaveStatus(() => services.commands.pendingSave, () => services.commands.retrySave(), true);
document.getElementById('panel')!.append(saveStatus.element);
for (const instance of services.commands.snapshot.state.placements) {
  const button = document.createElement('button');
  button.textContent = `Move ${instance.itemId}`;
  button.onclick = () => { home.cancel(); home.beginMove(instance.instanceId); button.blur(); };
  choices.append(button);
}
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  rig.camera.aspect = container.clientWidth / container.clientHeight; rig.camera.updateProjectionMatrix();
  rig.distance = Math.max(15, 16 / rig.camera.aspect); rig.snapTo(room.origin);
}
resize(); addEventListener('resize', resize);
new ResizeObserver(resize).observe(container);
let last = performance.now();
let serial = 0;
const pauseMenu = new HarborPauseMenu(services, true, scale => document.documentElement.style.setProperty('--text-scale', String(scale)),
  enabled => { rig.reducedMotion = enabled; protection.reducedMotion = enabled; });
const storageMenu = new HarborStorageMenu(services, home, () => `preview-storage:${++serial}`);
const sleepMenu = new HarborSleepMenu(services.time, day => services.sleep(day, {
  // Offers are derived from catalog + current day; no cached offer rows to refresh.
  offers() {},
  plants(state) { if (state.plants.length) throw new Error('Plant rollover is not installed in this preview'); },
  appointments: expireVisits,
  residents(state) { if (Object.keys(state.residents).length) throw new Error('Resident rollover is not installed in this preview'); },
}, starterRoomSpawn()),
  () => { player.restoreTransform(room.toWorld(room.spawn), 0); home.refresh(); });
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  input.pollGamepad();
  const owned = sleepMenu.handleInput(input) || storageMenu.handleInput(input) || home.handleInput(input, () => `preview-move:${++serial}`) || pauseMenu.handleInput(input);
  let prompt = services.time.hour >= 23 ? 'It is late. Sleep when you are ready.' : 'Walk near furniture, then press F / X to move it.';
  if (!owned && !services.time.paused) {
    const candidate = interactions.resolve(home.decorationCandidates(player.position), {
      position: player.position, aim: { x: Math.sin(player.object.rotation.y), z: Math.cos(player.object.rotation.y) },
      modal: false, decoration: false, alternate: true,
    });
    const ordinary = ordinaryInteractions.resolve(home.useCandidates(player.position, () => `preview-use:${++serial}`, () => storageMenu.show(), () => sleepMenu.show()), {
      position: player.position, aim: { x: Math.sin(player.object.rotation.y), z: Math.cos(player.object.rotation.y) },
      modal: false, decoration: false, alternate: false,
    });
    if (candidate) prompt = `F / X: ${candidate.promptKey}`;
    if (ordinary) prompt = `E / A: ${ordinary.promptKey}. ${prompt}`;
    if (input.actions.take('alternate')) candidate?.command();
    else if (input.actions.take('interact')) ordinary?.command();
    if (!home.decorating && !services.time.paused) player.update(input, dt);
  }
  services.capturePlayerPosition({ placeId: room.id,
    x: player.position.x - room.origin.x + room.halfW,
    z: player.position.z - room.origin.z + room.halfD, yaw: player.object.rotation.y });
  services.tick(dt);
  saveStatus.update();
  status.textContent = `Day ${services.time.state.dayIndex + 1} · ${services.time.clockText} — ${home.placementStatus ?? prompt}${services.commands.pendingSave ? ' Changes have not been saved.' : ''}`;
  lighting.season = services.time.season;
  lighting.update(services.time.daylight, services.time.hour);
  room.setDaylight(services.time.daylight);
  snapUniforms.uTime.value += dt;
  rig.update(room.origin, dt);
  scene.updateMatrixWorld(true);
  protection.update(dt);
  pipeline.render(scene, rig.camera);
  input.clearFrame();
});
Object.assign(window, { __harborPreview: { home, services, player, scene, storage: previewStorage } });
