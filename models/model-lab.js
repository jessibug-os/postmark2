/**
 * Model lab — every authored GLB in one inspection viewport.
 *
 * The catalog comes from `/models/manifest.json`, which the dev server builds
 * by scanning `public/assets` (see `modelCatalog()` in `vite.config.ts`). The
 * list is never hand-maintained here: a model exported today appears on the
 * next reload, and a retired one disappears, without touching this file.
 *
 * Two things this page is careful about, both of which the review packet
 * already had to learn:
 *
 * - Runtime membership is read from the game's own asset manifest, not from
 *   what happens to sit on disk. A file being in `public/assets` has never
 *   meant it is in the game, and an inspection tool that blurs that line will
 *   eventually be mistaken for approval.
 * - Turning is reviewer-driven, matching /review. Auto-spin never lets you
 *   hold a pose long enough to compare it against reference.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LOCOMOTION, roleOf } from '../src/characters/clipVocabulary.ts';
import { EQUIPMENT_DEFINITIONS } from '../src/characters/equipment/EquipmentDefinitions.ts';

const CATALOG_URL = '/models/manifest.json';

const dom = {
  list: document.getElementById('catalog-list'),
  count: document.getElementById('catalog-count'),
  filter: document.getElementById('filter'),
  stage: document.getElementById('stage'),
  note: document.getElementById('stage-note'),
  stats: document.getElementById('stats'),
  clipRow: document.getElementById('clip-row'),
  clipEmpty: document.getElementById('clip-empty'),
  play: document.getElementById('play'),
  loop: document.getElementById('loop'),
  scrub: document.getElementById('scrub'),
  time: document.getElementById('time'),
  speed: document.getElementById('speed'),
  speedRead: document.getElementById('speed-read'),
  resetView: document.getElementById('reset-view'),
  equipmentCharacter: document.getElementById('equipment-character'),
  modelVersion: document.getElementById('model-version'),
  animationSelect: document.getElementById('animation-select'),
  equipmentItem: document.getElementById('equipment-item'),
  equipmentHand: document.getElementById('equipment-hand'),
  equipmentMotion: document.getElementById('equipment-motion'),
  equipmentState: document.getElementById('equipment-state'),
};

/**
 * The equipment the hand rig can be inspected with, read from the runtime's own
 * registry.
 *
 * This was a hand-copied mirror, with a comment explaining that keeping the lab
 * independent of game boot code was worth the duplication. It was not: the page
 * is a Vite module and `EquipmentDefinitions` is pure data with no boot
 * dependency, and the copy had already drifted in the same way the locomotion
 * table below it had. One definition, read by both.
 */
const EQUIPMENT = {
  none: { label: 'None', hands: 0, pose: null, asset: null },
  ...Object.fromEntries(Object.values(EQUIPMENT_DEFINITIONS).map((definition) => [
    definition.id,
    {
      label: definition.id.replace(/(^|-)(\w)/g, (_, dash, char) => (dash ? ' ' : '') + char.toUpperCase()),
      hands: definition.hands.kind === 'two-hand' ? 2 : 1,
      pose: definition.holdPose,
      // A two-hand item fixes its own primary side: `item_root` sits at the
      // pot's +X edge, which is the character's right. Letting the hand selector
      // decide instead sent the left hand to the right-hand grip.
      ...(definition.hands.kind === 'two-hand' ? { primary: definition.hands.primary } : {}),
      asset: definition.modelUrl,
    },
  ])),
};

/**
 * First clip matching this motion's preferred base names, or undefined.
 *
 * The preference order comes from `clipVocabulary`, which is the same table
 * `SkeletalAnimator` builds itself from. The lab used to carry its own copy and
 * had already drifted: it preferred `idle_base` where the runtime takes `idle`
 * and strips the arm tracks itself, so the panel showed a clip the game never
 * plays. Reading the shared table is the whole point — a lab that disagrees
 * with the runtime is worse than no lab.
 */
function motionClip(motion) {
  const spec = LOCOMOTION[motion] ?? LOCOMOTION.idle;
  for (const name of spec.names) {
    const found = clips.find((candidate) => candidate.name.toLowerCase() === name);
    if (found) return found;
  }
  return undefined;
}

/** The hand that takes the item's primary grip, honouring two-hand items. */
function primaryHandOf(spec) {
  return spec.hands === 2 ? spec.primary : equipmentState.hand;
}

const equipmentState = {
  item: new URLSearchParams(location.search).get('item') ?? 'none',
  hand: new URLSearchParams(location.search).get('hand') ?? 'left',
  motion: new URLSearchParams(location.search).get('motion') ?? 'idle',
  prop: null,
  primaryGrip: null,
  primarySocket: null,
  secondarySocket: null,
  propToken: 0,
  socketNote: '',
  assetNote: '',
};

// ---------------------------------------------------------------- stage ----

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
dom.stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffe9c4, 0x38424f, 2.1));
const key = new THREE.DirectionalLight(0xfff1d0, 1.5);
key.position.set(2.5, 4, 3);
scene.add(key);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);

/**
 * Authored origins sit at ground contact (assets/CONVENTION.md), so turning
 * the model directly would swing it around its feet and throw the head out of
 * frame. Everything is parented to a pivot placed at the centre of the model's
 * own bounds — the point the camera is already aimed at.
 */
const pivot = new THREE.Group();
scene.add(pivot);

let current = null; // { model, box, size, entry }
let mixer = null;
let clips = [];
let action = null;
let holdAction = null;
let swingActions = [];
let selectedClip = null;
let looping = true;
let playing = false;
let dolly = 1; // camera distance multiplier, driven by zoom

function resize() {
  const w = dom.stage.clientWidth;
  const h = dom.stage.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  frameCamera();
}
new ResizeObserver(resize).observe(dom.stage);

/**
 * Fit on both axes rather than guessing from the largest dimension: fov is the
 * vertical angle, so a wide character crops horizontally otherwise. The model
 * turns, so the horizontal extent it can present is its own diagonal.
 */
function frameCamera() {
  if (!current) {
    camera.updateProjectionMatrix();
    return;
  }
  const { size } = current;
  const aspect = camera.aspect;
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const spread = Math.hypot(size.x, size.z);
  const distV = size.y / 2 / Math.tan(halfFov);
  const distH = spread / 2 / (Math.tan(halfFov) * aspect);
  const dist = Math.max(distV, distH, 0.1) * 1.25 * dolly;
  camera.position.set(dist * 0.34, size.y * 0.62, dist);
  camera.lookAt(new THREE.Vector3(0, size.y * 0.5, 0));
  camera.updateProjectionMatrix();
}

// Past vertical the model hangs upside down and its idle reads as nonsense, so
// pitch clamps instead of wrapping. Yaw is free.
const MAX_PITCH = THREE.MathUtils.degToRad(80);
// Radians per unit of scroll delta. Pitch is deliberately slower than yaw:
// turning right round is the common review move, while pitch only ever needs
// enough travel to see over a hat brim or under a chin, and macOS momentum
// scrolling would otherwise bury it in the clamp on one flick.
const YAW_RATE = 0.006;
const PITCH_RATE = 0.003;

function turn(yaw, pitch) {
  pivot.rotation.y += yaw;
  pivot.rotation.x = THREE.MathUtils.clamp(pivot.rotation.x + pitch, -MAX_PITCH, MAX_PITCH);
}

function zoom(delta) {
  dolly = THREE.MathUtils.clamp(dolly * Math.exp(delta * 0.0015), 0.25, 4);
  frameCamera();
}

const surface = renderer.domElement;

surface.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    // deltaMode 1 reports lines rather than pixels; normalise so one notch
    // moves the same amount under either reporting mode.
    const scale = event.deltaMode === 1 ? 16 : 1;
    // A trackpad pinch arrives as ctrl+wheel, so it zooms for free. Alt and
    // shift are the keyboard equivalents for a plain mouse wheel.
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      zoom(event.deltaY * scale);
      return;
    }
    turn(event.deltaX * scale * YAW_RATE, event.deltaY * scale * PITCH_RATE);
  },
  { passive: false },
);

let dragFrom = null;
surface.addEventListener('pointerdown', (event) => {
  dragFrom = { x: event.clientX, y: event.clientY };
  surface.setPointerCapture(event.pointerId);
});
surface.addEventListener('pointermove', (event) => {
  if (dragFrom === null) return;
  turn((event.clientX - dragFrom.x) * 0.01, (event.clientY - dragFrom.y) * 0.005);
  dragFrom = { x: event.clientX, y: event.clientY };
});
const release = (event) => {
  if (dragFrom === null) return;
  dragFrom = null;
  surface.releasePointerCapture(event.pointerId);
};
surface.addEventListener('pointerup', release);
surface.addEventListener('pointercancel', release);

function resetView() {
  pivot.rotation.set(0, 0, 0);
  dolly = 1;
  frameCamera();
}
dom.resetView.addEventListener('click', resetView);

// ---------------------------------------------------------------- model ----

/** Release GPU memory before swapping models; the lab is a long-lived page. */
function disposeModel(model) {
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

function countTriangles(model) {
  let tris = 0;
  let meshes = 0;
  model.traverse((node) => {
    if (!node.isMesh) return;
    meshes += 1;
    const geometry = node.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    tris += count / 3;
  });
  return { tris: Math.round(tris), meshes };
}

const loader = new GLTFLoader();
let loadToken = 0;

async function show(entry) {
  const token = ++loadToken;
  setNote(`loading ${entry.slug}.glb…`);

  let gltf;
  try {
    gltf = await loader.loadAsync(entry.url);
  } catch (error) {
    if (token !== loadToken) return;
    clear();
    setNote(`could not load ${entry.slug}.glb\n${String(error?.message ?? error)}`);
    return;
  }
  // A second click while this one was in flight already owns the stage.
  if (token !== loadToken) return;

  clear();

  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  pivot.position.y = size.y / 2;
  pivot.add(model);

  current = { model, box, size, entry };
  dolly = 1;
  pivot.rotation.set(0, 0, 0);
  frameCamera();

  clips = gltf.animations ?? [];
  if (clips.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    mixer.addEventListener('finished', () => {
      // A non-looping clip that has run out is paused at its last pose; the
      // play button has to say so or it reads as a hung viewer.
      playing = false;
      syncTransport();
    });
  }

  const { tris, meshes } = countTriangles(model);
  setNote(null);
  dom.stats.innerHTML = '';
  addStat('tris', String(tris));
  addStat('meshes', String(meshes));
  addStat('height', `${size.y.toFixed(2)}u`);
  addStat('size', formatBytes(entry.bytes));
  addStat('clips', clips.length === 0 ? 'none' : String(clips.length));

  buildClipButtons();
  const requestedClipName = new URLSearchParams(location.search).get('clip');
  const initialClip = clips.find((clip) => clip.name === requestedClipName)
    ?? motionClip(equipmentState.motion)
    ?? motionClip('idle')
    ?? clips[0];
  if (initialClip) selectClip(initialClip);
  else syncTransport();
  syncCharacterControl(entry.slug);
  await refreshEquipment();
}

function clear() {
  detachEquipment();
  if (mixer) {
    mixer.stopAllAction();
    mixer.uncacheRoot(mixer.getRoot());
    mixer = null;
  }
  action = null;
  holdAction = null;
  swingActions = [];
  selectedClip = null;
  clips = [];
  playing = false;
  if (current) {
    pivot.remove(current.model);
    disposeModel(current.model);
    current = null;
  }
  dom.stats.innerHTML = '';
  buildClipButtons();
  syncTransport();
}

function setNote(text) {
  dom.note.textContent = text ?? '';
  dom.note.hidden = text === null || text === undefined;
}

function addStat(label, value) {
  const span = document.createElement('span');
  span.innerHTML = `${label} <b></b>`;
  span.querySelector('b').textContent = value;
  dom.stats.appendChild(span);
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number') return '—';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}kB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ------------------------------------------------------------ animation ----

/** Clip -> its button, so selecting one can un-press the others. */
const clipButtons = new Map();

function buildClipButtons() {
  for (const stale of dom.clipRow.querySelectorAll('button')) stale.remove();
  clipButtons.clear();
  dom.animationSelect.innerHTML = '';
  dom.animationSelect.disabled = clips.length === 0;
  dom.clipEmpty.hidden = clips.length > 0;
  if (clips.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = current ? 'No embedded animations' : 'Choose a model';
    dom.animationSelect.appendChild(option);
    dom.clipEmpty.textContent = current ? 'this model has no animation clips' : '—';
    return;
  }
  clips.forEach((clip, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    // The job this clip holds, straight from the shared vocabulary. Worth
    // showing because the classification is what every other tool acts on: a
    // clip the lab labels `performance` is exactly one the cutscene editor will
    // offer to a pose cue, and a misspelling shows up here as a performance
    // clip nobody authored rather than as silence three tools away.
    const role = roleOf(clip.name);
    option.textContent = `${clip.name} · ${role} · ${clip.duration.toFixed(2)}s · ${clip.tracks.length} tracks`;
    dom.animationSelect.appendChild(option);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.role = role;
    button.title = `${role} clip · ${clip.tracks.length} tracks`;
    button.textContent = `${clip.name} · ${clip.duration.toFixed(2)}s`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectClip(clip));
    dom.clipRow.appendChild(button);
    clipButtons.set(clip, button);
  });
}

function selectClip(clip) {
  if (!mixer) return;
  if (action) action.stop();
  if (holdAction) holdAction.stop();
  for (const swing of swingActions) swing.stop();
  holdAction = null;
  swingActions = [];
  selectedClip = clip;
  const clipIndex = clips.indexOf(clip);
  if (clipIndex >= 0) dom.animationSelect.value = String(clipIndex);
  const resolved = resolveHands();
  const filtered = filterOccupiedArmTracks(clip, resolved);
  action = mixer.clipAction(filtered);
  action.reset();
  applyLoop();
  action.timeScale = Number(dom.speed.value);
  action.play();
  const holdClip = matchingHoldClip(EQUIPMENT[equipmentState.item] ?? EQUIPMENT.none);
  if (holdClip && holdClip !== clip) {
    const held = ['left', 'right'].filter((side) => resolved[side]).map((side) => (side === 'left' ? 'l' : 'r'));
    holdAction = mixer.clipAction(armTracksOnly(holdClip, held));
    holdAction.reset();
    holdAction.setLoop(THREE.LoopRepeat, Infinity);
    holdAction.timeScale = Number(dom.speed.value);
    holdAction.play();
  }
  const armLayer = (LOCOMOTION[equipmentState.motion] ?? LOCOMOTION.idle).arms;
  if (armLayer) {
    for (const side of ['left', 'right']) {
      if (resolved[side]) continue;
      const suffix = side === 'left' ? 'l' : 'r';
      const swingClip = clips.find((candidate) => candidate.name.toLowerCase() === `${armLayer}_${suffix}`);
      if (!swingClip || swingClip === clip) continue;
      const swing = mixer.clipAction(armTracksOnly(swingClip, [suffix]));
      swing.reset();
      swing.setLoop(THREE.LoopRepeat, Infinity);
      swing.timeScale = Number(dom.speed.value);
      swing.play();
      swingActions.push(swing);
    }
  }
  playing = true;
  for (const [candidate, button] of clipButtons) {
    button.setAttribute('aria-pressed', candidate === clip ? 'true' : 'false');
  }
  persistAnimationQuery();
  syncTransport();
}

/** Keep an exact model + clip pose linkable from editor and review threads. */
function persistAnimationQuery() {
  const params = new URLSearchParams(location.search);
  if (selectedClip) params.set('clip', selectedClip.name); else params.delete('clip');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

/**
 * Locomotion owns only free arms. This is the viewer-side version of the
 * runtime layer contract: occupied arm tracks are removed rather than allowed
 * to fight the hold pose. The filtered clips are intentionally ephemeral and
 * tiny; the lab only has one active action at a time.
 */
function filterOccupiedArmTracks(clip, hands) {
  if (!hands.left && !hands.right) return clip;
  const tracks = clip.tracks.filter((track) => {
    const side = armSideOf(track.name);
    return side === null || !hands[side === 'l' ? 'left' : 'right'];
  });
  return new THREE.AnimationClip(`${clip.name}__equipment_${hands.left ? 'l' : ''}${hands.right ? 'r' : ''}`, clip.duration, tracks);
}

/** Which arm a track drives, or null when it is not an arm track at all. */
function armSideOf(trackName) {
  const tokens = [
    'core_upper_arm_', 'core_forearm_', 'core_hand_', 'socket_hand_',
    'upper_arm_', 'forearm_', 'hand_', 'core_arm_',
  ];
  for (const token of tokens) {
    const at = trackName.indexOf(token);
    if (at === -1) continue;
    const suffix = trackName.charAt(at + token.length);
    if (suffix === 'l' || suffix === 'r') return suffix;
  }
  if (trackName.includes('armL')) return 'l';
  if (trackName.includes('armR')) return 'r';
  return null;
}

/**
 * Keeps only the arm an arm-layer clip is meant to drive. The exporter bakes
 * every bone into every NLA strip, so an unmasked `arm_swing_l` also writes the
 * right arm at rest — and the mixer averages equal-weight actions per property,
 * which halved every hold pose back toward the rest arm.
 */
function armTracksOnly(clip, sides) {
  const tracks = clip.tracks.filter((track) => {
    const side = armSideOf(track.name);
    return side !== null && sides.includes(side);
  });
  return new THREE.AnimationClip(`${clip.name}__arms_${sides.join('')}`, clip.duration, tracks);
}

// ------------------------------------------------------------ equipment ----

function resolveHands() {
  const spec = EQUIPMENT[equipmentState.item] ?? EQUIPMENT.none;
  if (spec.hands === 2) return { left: true, right: true };
  if (spec.hands === 1) {
    return { left: equipmentState.hand === 'left', right: equipmentState.hand === 'right' };
  }
  return { left: false, right: false };
}

function nodeByContract(model, side) {
  const socketName = `socket_hand_${side}`;
  const exact = model.getObjectByName(socketName);
  if (exact) return { node: exact, fallback: false };

  // The current eight-bone review rigs predate the socket contract. These
  // names are fallback inspection anchors only; the state box says so.
  const aliases = side === 'l'
    ? ['hand_l', 'core_arm_l', 'upper_arm_l', 'arm_l', 'armL', 'leftHand']
    : ['hand_r', 'core_arm_r', 'upper_arm_r', 'arm_r', 'armR', 'rightHand'];
  for (const name of aliases) {
    const node = model.getObjectByName(name);
    if (node) return { node, fallback: true };
  }
  return { node: null, fallback: false };
}

function detachEquipment() {
  equipmentState.propToken += 1;
  if (!equipmentState.prop) return;
  equipmentState.prop.removeFromParent();
  disposeModel(equipmentState.prop);
  equipmentState.prop = null;
  equipmentState.primaryGrip = null;
  equipmentState.primarySocket = null;
  equipmentState.secondarySocket = null;
  refitCurrentModel();
}

function refitCurrentModel() {
  if (!current) return;
  const bounds = new THREE.Box3().setFromObject(current.model, true);
  current.box = bounds;
  current.size = bounds.getSize(new THREE.Vector3());
  frameCamera();
}

async function refreshEquipment() {
  detachEquipment();
  const spec = EQUIPMENT[equipmentState.item] ?? EQUIPMENT.none;
  const hands = resolveHands();
  equipmentState.socketNote = '';
  equipmentState.assetNote = '';

  dom.equipmentHand.disabled = spec.hands !== 1;
  dom.equipmentHand.value = equipmentState.hand;
  dom.equipmentItem.value = equipmentState.item;
  dom.equipmentMotion.value = equipmentState.motion;

  // Recreate the locomotion action so newly occupied arms lose their swing.
  if (selectedClip && mixer) selectClip(selectedClip);
  syncEquipmentState();

  if (!current || !spec.asset) return;
  const primary = primaryHandOf(spec);
  const anchor = nodeByContract(current.model, primary === 'left' ? 'l' : 'r');
  if (!anchor.node) {
    equipmentState.socketNote = `missing socket_hand_${primary === 'left' ? 'l' : 'r'}`;
    syncEquipmentState();
    return;
  }
  if (anchor.fallback) equipmentState.socketNote = `using legacy ${anchor.node.name} fallback`;
  syncEquipmentState();

  const token = ++equipmentState.propToken;
  try {
    const gltf = await loader.loadAsync(spec.asset);
    if (token !== equipmentState.propToken || !current) {
      disposeModel(gltf.scene);
      return;
    }
    equipmentState.prop = gltf.scene;
    equipmentState.prop.position.set(0, 0, 0);
    equipmentState.prop.rotation.set(0, 0, 0);
    equipmentState.prop.scale.set(1, 1, 1);
    current.model.add(equipmentState.prop);
    equipmentState.primaryGrip = equipmentState.prop.getObjectByName('item_root') ?? equipmentState.prop;
    equipmentState.primarySocket = anchor.node;
    if (spec.hands === 2) {
      const secondary = primary === 'left' ? 'r' : 'l';
      equipmentState.secondarySocket = nodeByContract(current.model, secondary).node;
      if (!equipmentState.secondarySocket) equipmentState.socketNote = `missing socket_hand_${secondary}`;
    }

    if (spec.hands === 2 && !equipmentState.prop.getObjectByName('grip_secondary')) {
      equipmentState.assetNote = 'prop missing grip_secondary';
    }
    refitCurrentModel();
  } catch {
    if (token !== equipmentState.propToken) return;
    equipmentState.assetNote = `${spec.asset} not available`;
  }
  syncEquipmentState();
}

function matchingHoldClip(spec) {
  if (!spec.pose) return null;
  const suffix = equipmentState.hand === 'left' ? 'l' : 'r';
  const expected = spec.pose === 'carry-front'
    ? 'hold_two_front'
    : spec.pose === 'vertical-low'
      ? `hold_vertical_${suffix}`
      : `hold_cradle_${suffix}`;
  return clips.find((clip) => clip.name.toLowerCase() === expected) ?? null;
}

function syncEquipmentState() {
  const spec = EQUIPMENT[equipmentState.item] ?? EQUIPMENT.none;
  const hands = resolveHands();
  const left = hands.left ? `${spec.label} hold` : 'free / swing';
  const right = hands.right ? `${spec.label} hold` : 'free / swing';
  const notes = [];
  if (equipmentState.socketNote) notes.push(equipmentState.socketNote);
  if (equipmentState.assetNote) notes.push(equipmentState.assetNote);
  if (spec.pose && !matchingHoldClip(spec)) notes.push(`hold clip ${spec.pose} pending; occupied swing is masked`);
  dom.equipmentState.innerHTML = `<b>Hands:</b> left ${left} · right ${right}${notes.length ? `<br>${notes.join(' · ')}` : ''}`;
  dom.equipmentState.dataset.warning = notes.length ? 'true' : 'false';
}

function actorLocalPosition(node, result = new THREE.Vector3()) {
  node.getWorldPosition(result);
  return current.model.worldToLocal(result);
}

/** Props translate to the animated grip but remain upright in actor space. */
function updateEquipmentMount() {
  const spec = EQUIPMENT[equipmentState.item] ?? EQUIPMENT.none;
  if (!current || !equipmentState.prop || !equipmentState.primaryGrip || !equipmentState.primarySocket) return;
  const primaryGrip = actorLocalPosition(equipmentState.primaryGrip);
  const primarySocket = actorLocalPosition(equipmentState.primarySocket);
  if (spec.hands !== 2) {
    equipmentState.prop.position.add(primarySocket.sub(primaryGrip));
    equipmentState.prop.updateWorldMatrix(true, true);
    return;
  }
  const secondaryGrip = equipmentState.prop.getObjectByName('grip_secondary');
  if (!secondaryGrip || !equipmentState.secondarySocket) return;
  const secondarySocket = actorLocalPosition(equipmentState.secondarySocket);
  const targetMidpoint = primarySocket.add(secondarySocket).multiplyScalar(0.5);
  targetMidpoint.x = 0;
  const secondaryGripPosition = actorLocalPosition(secondaryGrip);
  const gripMidpoint = primaryGrip.add(secondaryGripPosition).multiplyScalar(0.5);
  equipmentState.prop.position.add(targetMidpoint.sub(gripMidpoint));
  equipmentState.prop.updateWorldMatrix(true, true);
}

function solveHandToGrip(suffix, target) {
  if (!current) return;
  const effector = nodeByContract(current.model, suffix).node;
  const upper = current.model.getObjectByName(`core_upper_arm_${suffix}`)
    ?? current.model.getObjectByName(`core_arm_${suffix}`);
  const forearm = current.model.getObjectByName(`core_forearm_${suffix}`);
  if (!effector || !upper) return;

  const targetPosition = target.getWorldPosition(new THREE.Vector3());
  const joints = [forearm, upper].filter(Boolean);
  const jointPosition = new THREE.Vector3();
  const effectorPosition = new THREE.Vector3();
  const toEffector = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const jointWorld = new THREE.Quaternion();
  const parentInverse = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  for (let iteration = 0; iteration < 3; iteration++) {
    for (const joint of joints) {
      joint.getWorldPosition(jointPosition);
      effector.getWorldPosition(effectorPosition);
      toEffector.subVectors(effectorPosition, jointPosition);
      toTarget.subVectors(targetPosition, jointPosition);
      if (toEffector.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) continue;
      delta.setFromUnitVectors(toEffector.normalize(), toTarget.normalize());
      joint.getWorldQuaternion(jointWorld);
      const desiredWorld = delta.multiply(jointWorld);
      if (joint.parent) joint.parent.getWorldQuaternion(parentInverse).invert();
      else parentInverse.identity();
      joint.quaternion.slerp(parentInverse.multiply(desiredWorld), 0.88);
      joint.updateWorldMatrix(false, true);
    }
  }
}

function applyTwoHandGripIK() {
  const spec = EQUIPMENT[equipmentState.item] ?? EQUIPMENT.none;
  const secondaryGrip = equipmentState.prop?.getObjectByName('grip_secondary');
  if (!current || spec.hands !== 2 || !equipmentState.primaryGrip || !secondaryGrip) return;
  const primary = primaryHandOf(spec) === 'left' ? 'l' : 'r';
  const secondary = primary === 'l' ? 'r' : 'l';
  solveHandToGrip(primary, equipmentState.primaryGrip);
  solveHandToGrip(secondary, secondaryGrip);
}

/**
 * Numeric mirror of what the stage is showing, for capture scripts. Positions
 * are actor-local, so they read the same at any camera angle or dolly: +X is
 * the character's left, +Y up, +Z forward.
 */
function publishEquipmentDebug() {
  if (!current) {
    globalThis.__modelLabEquipmentDebug = null;
    return;
  }
  const local = (node) => (node ? actorLocalPosition(node).toArray().map((n) => Number(n.toFixed(4))) : null);
  const named = (name) => local(current.model.getObjectByName(name));
  const prop = equipmentState.prop;
  // Actor-local, like every other figure here, so a tip height can be read
  // against the character's own floor instead of the turned stage.
  let bounds = null;
  if (prop) {
    bounds = new THREE.Box3();
    prop.updateWorldMatrix(true, true);
    prop.traverse((node) => {
      if (!node.isMesh) return;
      const geometry = node.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const corners = geometry.boundingBox;
      for (const x of [corners.min.x, corners.max.x]) {
        for (const y of [corners.min.y, corners.max.y]) {
          for (const z of [corners.min.z, corners.max.z]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(node.matrixWorld);
            bounds.expandByPoint(current.model.worldToLocal(point));
          }
        }
      }
    });
  }
  globalThis.__modelLabEquipmentDebug = {
    item: equipmentState.item,
    hand: equipmentState.hand,
    motion: equipmentState.motion,
    clip: selectedClip?.name ?? null,
    holdClip: holdAction?.getClip().name ?? null,
    swingClips: swingActions.map((swing) => swing.getClip().name),
    arms: Object.fromEntries(['l', 'r'].flatMap((side) => [
      [`upper_arm_${side}`, named(`core_upper_arm_${side}`)],
      [`forearm_${side}`, named(`core_forearm_${side}`)],
      [`hand_${side}`, named(`core_hand_${side}`)],
      [`socket_${side}`, named(`socket_hand_${side}`)],
    ])),
    prop: prop ? prop.position.toArray().map((n) => Number(n.toFixed(4))) : null,
    primaryGrip: local(equipmentState.primaryGrip),
    secondaryGrip: local(prop?.getObjectByName('grip_secondary')),
    propBounds: bounds ? [bounds.min.toArray(), bounds.max.toArray()] : null,
  };
}

function persistEquipmentQuery() {
  const params = new URLSearchParams(location.search);
  if (equipmentState.item === 'none') params.delete('item'); else params.set('item', equipmentState.item);
  params.set('hand', equipmentState.hand);
  params.set('motion', equipmentState.motion);
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function chooseMotion() {
  const clip = motionClip(equipmentState.motion);
  if (clip) selectClip(clip);
  syncEquipmentState();
}

function syncCharacterControl(slug) {
  const entry = catalog.find((candidate) => candidate.slug === slug);
  if (entry) dom.equipmentCharacter.value = entry.base;
}

dom.equipmentCharacter.addEventListener('change', () => selectFamily(dom.equipmentCharacter.value));
dom.modelVersion.addEventListener('change', () => select(dom.modelVersion.value));
dom.animationSelect.addEventListener('change', () => {
  const clip = clips[Number(dom.animationSelect.value)];
  if (clip) selectClip(clip);
});
dom.equipmentItem.addEventListener('change', () => {
  equipmentState.item = EQUIPMENT[dom.equipmentItem.value] ? dom.equipmentItem.value : 'none';
  persistEquipmentQuery();
  refreshEquipment();
});
dom.equipmentHand.addEventListener('change', () => {
  equipmentState.hand = dom.equipmentHand.value === 'right' ? 'right' : 'left';
  persistEquipmentQuery();
  refreshEquipment();
});
dom.equipmentMotion.addEventListener('change', () => {
  equipmentState.motion = LOCOMOTION[dom.equipmentMotion.value] ? dom.equipmentMotion.value : 'idle';
  persistEquipmentQuery();
  chooseMotion();
});

function applyLoop() {
  if (!action) return;
  action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  if (holdAction) holdAction.setLoop(THREE.LoopRepeat, Infinity);
  for (const swing of swingActions) swing.setLoop(THREE.LoopRepeat, Infinity);
}

function togglePlay() {
  if (!action) return;
  // Restarting from a clip that ran to its end is what "play" means there;
  // otherwise the button would look dead on a one-shot.
  if (!playing && !looping && action.time >= action.getClip().duration - 1e-4) {
    action.reset();
    applyLoop();
    action.play();
  }
  playing = !playing;
  action.paused = !playing;
  if (holdAction) holdAction.paused = !playing;
  for (const swing of swingActions) swing.paused = !playing;
  syncTransport();
}

dom.play.addEventListener('click', togglePlay);

dom.loop.addEventListener('click', () => {
  looping = !looping;
  applyLoop();
  syncTransport();
});

dom.speed.addEventListener('input', () => {
  const value = Number(dom.speed.value);
  dom.speedRead.textContent = `${value.toFixed(1)}×`;
  if (action) action.timeScale = value;
  if (holdAction) holdAction.timeScale = value;
  for (const swing of swingActions) swing.timeScale = value;
});

// Scrubbing pauses, so the pose you dragged to is the pose you keep.
dom.scrub.addEventListener('input', () => {
  if (!action || !mixer) return;
  playing = false;
  action.paused = true;
  action.time = (Number(dom.scrub.value) / 1000) * action.getClip().duration;
  if (holdAction) {
    holdAction.paused = true;
    holdAction.time = (Number(dom.scrub.value) / 1000) * holdAction.getClip().duration;
  }
  for (const swing of swingActions) {
    swing.paused = true;
    swing.time = (Number(dom.scrub.value) / 1000) * swing.getClip().duration;
  }
  mixer.update(0);
  syncTransport();
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  togglePlay();
});

/** Push transport state into the controls; called on every state change. */
function syncTransport() {
  const has = action !== null;
  dom.play.disabled = !has;
  dom.loop.disabled = !has;
  dom.scrub.disabled = !has;
  dom.play.textContent = playing ? '❚❚ Pause' : '▶ Play';
  dom.loop.setAttribute('aria-pressed', looping ? 'true' : 'false');
  if (!has) {
    dom.scrub.value = '0';
    dom.time.textContent = '0.00 / 0.00s';
  }
}

function syncPlayhead() {
  if (!action) return;
  const duration = action.getClip().duration;
  const time = THREE.MathUtils.clamp(action.time, 0, duration);
  // Leave the slider alone while it has focus, or dragging it fights this.
  if (document.activeElement !== dom.scrub) {
    dom.scrub.value = String(duration === 0 ? 0 : Math.round((time / duration) * 1000));
  }
  dom.time.textContent = `${time.toFixed(2)} / ${duration.toFixed(2)}s`;
}

// ---------------------------------------------------------------- catalog --

/**
 * Group by character family, runtime file first and versions newest first —
 * the order a reviewer reads them in, rather than the alphabetical order the
 * filesystem hands back (`mira-v01, mira-v02, mira-v03, mira`).
 */
function group(entries) {
  const families = new Map();
  for (const entry of entries) {
    if (!families.has(entry.base)) families.set(entry.base, []);
    families.get(entry.base).push(entry);
  }
  for (const files of families.values()) {
    files.sort((a, b) => {
      if (a.version === null) return -1;
      if (b.version === null) return 1;
      return b.version - a.version;
    });
  }
  return [...families.entries()].sort(([a], [b]) => a.localeCompare(b));
}

let catalog = [];
let selected = null;

function preferredEntry(files) {
  return files.find((entry) => entry.runtime)
    ?? files.find((entry) => entry.version !== null)
    ?? files[0];
}

function versionLabel(entry) {
  const name = entry.version === null ? 'Current / canonical' : `v${String(entry.version).padStart(2, '0')}`;
  return `${name}${entry.runtime ? ' · in game' : ''} · ${formatBytes(entry.bytes)}`;
}

function syncVersionControl(base) {
  const files = group(catalog).find(([family]) => family === base)?.[1] ?? [];
  dom.modelVersion.innerHTML = '';
  for (const entry of files) {
    const option = document.createElement('option');
    option.value = entry.slug;
    option.textContent = versionLabel(entry);
    dom.modelVersion.appendChild(option);
  }
  dom.modelVersion.disabled = files.length < 2;
  dom.modelVersion.value = selected ?? '';
}

function populateModelControl() {
  dom.equipmentCharacter.innerHTML = '';
  for (const [base] of group(catalog)) {
    const option = document.createElement('option');
    option.value = base;
    option.textContent = base;
    dom.equipmentCharacter.appendChild(option);
  }
}

/**
 * The three shelves, in the order they are worked on.
 *
 * A family's kind is its files' kind; a family whose versions disagree is a
 * export mistake worth seeing, so the first file wins and the mismatch shows up
 * as a model sitting on the wrong shelf rather than being quietly averaged.
 */
const SHELVES = [
  ['character', 'Characters'],
  ['prop', 'Props'],
  ['equipment', 'Equipment'],
];

function render(filter) {
  const needle = filter.trim().toLowerCase();
  const families = group(catalog).filter(([base, files]) => needle === ''
    || base.toLowerCase().includes(needle)
    || files.some((entry) => entry.slug.toLowerCase().includes(needle)));
  dom.list.innerHTML = '';

  const selectedEntry = catalog.find((entry) => entry.slug === selected);
  const entryFor = ([base, files]) => {
    const target = selectedEntry?.base === base ? selectedEntry : preferredEntry(files);
    const button = document.createElement('a');
    button.className = 'catalog-entry';
    button.href = `#${encodeURIComponent(target.slug)}`;
    button.setAttribute('aria-current', selectedEntry?.base === base ? 'true' : 'false');
    const name = document.createElement('span');
    name.textContent = base;
    button.appendChild(name);
    if (files.some((entry) => entry.runtime)) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = 'in game';
      button.appendChild(pill);
    }
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = files.length === 1 ? formatBytes(files[0].bytes) : `${files.length} versions`;
    button.appendChild(size);
    if (selectedEntry?.base === base) queueMicrotask(() => button.scrollIntoView({ block: 'nearest' }));
    return button;
  };

  for (const [kind, title] of SHELVES) {
    const shelf = families.filter(([, files]) => (files[0].kind ?? 'prop') === kind);
    if (!shelf.length) continue;
    const section = document.createElement('section');
    section.className = 'catalog-group';
    const heading = document.createElement('h2');
    heading.textContent = `${title} · ${shelf.length}`;
    section.appendChild(heading);
    for (const family of shelf) section.appendChild(entryFor(family));
    dom.list.appendChild(section);
  }

  const runtime = families.filter(([, files]) => files.some((entry) => entry.runtime)).length;
  dom.count.textContent = `${families.length} model${families.length === 1 ? '' : 's'} · ${runtime} in the runtime`;
}

function selectFamily(base) {
  const files = group(catalog).find(([family]) => family === base)?.[1];
  if (!files?.length) return;
  const currentEntry = catalog.find((entry) => entry.slug === selected && entry.base === base);
  select((currentEntry ?? preferredEntry(files)).slug);
}

function select(slug) {
  const entry = catalog.find((candidate) => candidate.slug === slug);
  if (!entry) return;
  selected = slug;
  // The hash makes a model linkable, which is the whole point of pasting one
  // into a review thread.
  if (location.hash.slice(1) !== slug) location.hash = slug;
  render(dom.filter.value);
  syncVersionControl(entry.base);
  show(entry);
}

dom.filter.addEventListener('input', () => render(dom.filter.value));
window.addEventListener('hashchange', () => {
  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug && slug !== selected) select(slug);
});

function tick(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (mixer && playing) mixer.update(dt);
  updateEquipmentMount();
  applyTwoHandGripIK();
  publishEquipmentDebug();
  syncPlayhead();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
let lastFrame = performance.now();

async function boot() {
  resize();
  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    catalog = await response.json();
  } catch (error) {
    dom.count.textContent = 'catalog unavailable';
    setNote(`could not read ${CATALOG_URL}\n${String(error?.message ?? error)}`);
    requestAnimationFrame(tick);
    return;
  }

  populateModelControl();
  render('');
  requestAnimationFrame(tick);

  const requested = decodeURIComponent(location.hash.slice(1));
  const requestedEntry = catalog.find((entry) => entry.slug === requested);
  if (requested && !requestedEntry) {
    selected = requested;
    render('');
    setNote(`${requested}.glb is not in the model catalog yet`);
    syncEquipmentState();
    return;
  }
  const first = requestedEntry ?? catalog.find((entry) => entry.runtime) ?? catalog[0];
  if (first) select(first.slug);
  else setNote('no GLB files found in public/assets');
}

boot();
