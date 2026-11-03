import * as THREE from 'three';
import { bootstrapContext } from '../content/BootstrapContext';
import { CAFE_ANCHORS, cafeLocalToInterior } from '../content/little-harbor/cafeRoom';
import { applyHarborPlayerPresentation } from '../content/little-harbor/playerPresentation';
import { assets, type AssetId } from '../core/AssetLoader';
import { HARBOR_RESIDENTS } from '../content/little-harbor/residents';
import { RetroPipeline } from '../core/RetroPipeline';
import { snapUniforms } from '../core/RetroMaterial';
import { InteractionResolver } from '../interaction/InteractionResolver';
import { Input } from '../player/Input';
import { Player } from '../player/Player';
import { HarborSaveCodec } from '../systems/HarborSaveCodec';
import { validHarborState } from '../systems/HarborState';
import { HarborPauseMenu } from '../ui/HarborPauseMenu';
import { HarborCafeOrderMenu } from '../ui/HarborCafeOrderMenu';
import { HarborCafeJournal } from '../ui/HarborCafeJournal';
import { HarborSaveStatus } from '../ui/HarborSaveStatus';
import { CameraRig } from '../world/CameraRig';
import { DayNight } from '../world/DayNight';
import { buildHarborCafe } from '../world/HarborCafe';
import { HarborCafeCarry } from '../world/HarborCafeCarry';
import { HarborCafeStaff } from '../world/HarborCafeStaff';
import { SubjectProtection } from '../world/SubjectProtection';
import { HarborCafeController } from './HarborCafeController';
import { HarborInteriorPlace } from './HarborInteriorPlace';
import { harborPreviewStorage } from './HarborPreviewStorage';
import { openHarborServices } from './HarborServices';

const storage = harborPreviewStorage(sessionStorage, 'cafe');
const loaded = new HarborSaveCodec(storage, validHarborState).load(bootstrapContext().slotId);
if (loaded.status === 'error') throw new Error(loaded.reason);
const safe = { placeId: 'cafe', ...CAFE_ANCHORS.find(a => a.id === 'cafe.safe')!.transform };
const services = openHarborServices(bootstrapContext(), storage, loaded.save ? undefined
  : { seed: 42, layoutVersion: 1, name: 'Robin', arrival: safe });
const juneAsset = HARBOR_RESIDENTS.find(resident => resident.id === 'june')!.assetId as AssetId;
await assets.preload(['postmaster', juneAsset]);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x242b30);
const room = buildHarborCafe(0);
const staff = new HarborCafeStaff(room, assets.model(juneAsset), assets.animations(juneAsset));
const player = new Player({ collide: position => room.collide(position) });
applyHarborPlayerPresentation(player);
const rig = new CameraRig(1);
const place = new HarborInteriorPlace(room, scene, player, rig, () => staff.dispose());
const toWorld = (x: number, z: number) => {
  const local = cafeLocalToInterior(x, z); return room.toWorld(new THREE.Vector3(local.x, 0, local.z));
};
let saved = services.commands.snapshot.state.player.position;
if (saved.placeId !== room.id || !room.canStand(toWorld(saved.x, saved.z)) || room.atDoor(toWorld(saved.x, saved.z))) {
  const recovered = services.commands.execute(`cafe-recovery:${services.commands.snapshot.revision}`, 'position:recover', draft => { draft.player.position = safe; });
  if (!recovered.ok) throw new Error(recovered.reason);
  saved = safe;
}
place.install(saved); scene.add(player.object);
const position = () => ({ placeId: room.id, x: player.position.x - room.origin.x + room.halfW,
  z: player.position.z - room.origin.z + room.halfD, yaw: player.object.rotation.y });
const cafe = new HarborCafeController(services, position, () => `cafe-preview:${crypto.randomUUID()}`);
const carry = new HarborCafeCarry(player.object, player.animation);
carry.sync(cafe.heldPropId);
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1);
const container = document.getElementById('app')!; container.append(renderer.domElement);
const pipeline = new RetroPipeline(renderer, 640, 480);
const lighting = new DayNight(scene);
const protection = new SubjectProtection(scene, rig.camera, player.object);
const input = new Input(); const interactions = new InteractionResolver();
const panel = document.getElementById('panel')!;
panel.querySelector('p')!.textContent = 'Café development preview. Complete a shift at the counter, tables and cup return. Patrons and tray animations are still being built. Saves survive reloads in this tab, separately from the home preview.';
const help = panel.querySelectorAll('p')[1];
help.textContent = 'Walk: WASD / left stick. Interact: E / A. Pause: Esc / B. Journal: J / View. Start at June’s counter, then follow the order instructions. Town exits are not installed here.';
const link = document.createElement('a'); link.href = '/harbor'; link.textContent = 'Open home preview'; link.style.color = 'inherit';
document.getElementById('furniture')!.append(link);
document.title = 'Little Harbor · Café preview';
const status = document.getElementById('status')!;
const saves = new HarborSaveStatus(() => services.commands.pendingSave, () => services.commands.retrySave(), true); panel.append(saves.element);
const pause = new HarborPauseMenu(services, true, scale => document.documentElement.style.setProperty('--text-scale', String(scale)),
  reduced => { rig.reducedMotion = reduced; protection.reducedMotion = reduced; });
const orders = new HarborCafeOrderMenu(services.time);
const journal = new HarborCafeJournal(services.time, cafe);
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  rig.camera.aspect = container.clientWidth / container.clientHeight; rig.camera.updateProjectionMatrix();
  rig.distance = Math.max(20, 24 / rig.camera.aspect); rig.snapTo(room.origin);
}
resize(); new ResizeObserver(resize).observe(container);
snapUniforms.uCurvature.value = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now;
  input.pollGamepad(); const owned = orders.handleInput(input) || journal.handleInput(input) || pause.handleInput(input);
  let prompt = cafe.instruction;
  if (!owned && !services.time.paused) {
    const candidates = cafe.candidates().map(candidate => {
      const anchor = toWorld(candidate.anchor.x, candidate.anchor.z);
      return { ...candidate, anchor: { x: anchor.x, z: anchor.z } };
    });
    const focused = interactions.resolve(candidates, { position: player.position,
      aim: { x: Math.sin(player.object.rotation.y), z: Math.cos(player.object.rotation.y) },
      modal: false, decoration: false, alternate: false });
    if (focused) prompt = `E / A: ${focused.promptKey}. ${prompt}`;
    if (input.actions.take('interact') && focused) {
      if (focused.id.endsWith(':cafe.tray-pickup') && cafe.orderMessage) orders.show(cafe.orderMessage, focused.command);
      else if (focused.id.endsWith(':cafe.counter') && cafe.earlyFinishMessage) orders.show(cafe.earlyFinishMessage, focused.command, true);
      else focused.command();
    }
    carry.sync(cafe.heldPropId);
    if (!services.time.paused) player.update(input, dt);
  }
  services.capturePlayerPosition(position()); services.tick(dt); saves.update();
  status.textContent = `${services.time.clockText} · ${services.commands.snapshot.state.wallet.coins} coins — ${prompt}`;
  lighting.season = services.time.season; lighting.update(services.time.daylight, services.time.hour);
  room.setDaylight(services.time.daylight); snapUniforms.uTime.value += dt;
  carry.update();
  staff.update(dt, services.time.paused);
  rig.update(room.origin, dt); scene.updateMatrixWorld(true); protection.update(dt);
  pipeline.render(scene, rig.camera); input.clearFrame();
});
Object.assign(window, { __harborCafePreview: { cafe, carry, staff, place, services, player, room, storage } });
