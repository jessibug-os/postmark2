/**
 * Live cast viewer for the W4 review packet.
 *
 * Renders each character's actual exported GLB, playing its idle clip, in a
 * canvas on the review page. Deliberately live rather than a captured GIF or
 * contact sheet: a still artifact drifts out of date the moment the asset is
 * rebuilt, which already happened once with the island contact sheet. This
 * cannot — it loads whatever is on disk right now.
 *
 * A character with no GLB yet renders an explicit "not authored" card rather
 * than an empty box, so the packet never implies work that has not happened.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CAST = [
  ['postmaster', 'The Postmaster'],
  ['albert', 'Albert'],
  ['mira', 'Mira'],
  ['rowan', 'Old Rowan'],
  ['liliane', 'Liliane'],
  ['amina', 'Dr. Amina'],
  ['niko', 'Niko'],
  ['maeve', 'Maeve'],
  ['vittorio', 'Vittorio'],
  ['ferry-recruit', 'Ferry recruit'],
];

// Explicit versions are intentional. The review gate must not silently swap in
// a runtime placeholder just because another candidate has not landed yet.
const TURNAROUND_CANDIDATES = [
  ['postmaster-v26', 'Postmaster v26'],
  ['albert-v15', 'Albert v15'],
  ['mira-v14', 'Mira v14'],
  ['liliane-v12', 'Liliane v12'],
  ['rowan-v12', 'Old Rowan v12'],
  ['amina-v12', 'Dr. Amina v12'],
  ['niko-v12', 'Niko v12'],
  ['maeve-v12', 'Maeve v12'],
  ['vittorio-v12', 'Vittorio v12'],
  ['ferry-recruit-v11', 'Ferry recruit v11'],
];

const loader = new GLTFLoader();
const live = [];
let lastFrame = performance.now();

function card(slug, label) {
  const wrap = document.createElement('figure');
  wrap.className = 'cast-card';
  const holder = document.createElement('div');
  holder.className = 'cast-canvas';
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  wrap.append(holder, cap);
  return { wrap, holder, cap };
}

// Past vertical the character hangs upside down and its idle reads as nonsense,
// so pitch clamps instead of wrapping. Yaw is free.
const MAX_PITCH = THREE.MathUtils.degToRad(80);
// Radians per unit of scroll delta. Pitch is deliberately slower than yaw:
// turning right round is the common review move, while pitch only ever needs
// enough travel to see over a hat brim or under a chin, and macOS momentum
// scrolling would otherwise bury it in the clamp on one flick.
const YAW_RATE = 0.006;
const PITCH_RATE = 0.003;

/**
 * Rotation is reviewer-driven rather than automatic. An auto-spin never lets a
 * reviewer hold a pose long enough to compare one against reference, and ten
 * cards turning at once fights the eye. Wheel over a card turns it; dragging
 * does the same, which is the escape hatch when the page needs to scroll.
 *
 * Both input paths carry two axes. A trackpad reports sideways and vertical
 * swipes independently, so sideways yaws the model and vertical pitches it,
 * which is also how a drag reads.
 */
function attachSpin(element, pivot) {
  const turn = (yaw, pitch) => {
    pivot.rotation.y += yaw;
    pivot.rotation.x = THREE.MathUtils.clamp(pivot.rotation.x + pitch, -MAX_PITCH, MAX_PITCH);
  };

  element.addEventListener('wheel', (event) => {
    event.preventDefault();
    // deltaMode 1 reports lines rather than pixels; normalise so one notch
    // turns the model the same amount under either reporting mode.
    const scale = event.deltaMode === 1 ? 16 : 1;
    turn(event.deltaX * scale * YAW_RATE, event.deltaY * scale * PITCH_RATE);
  }, { passive: false });

  let last = null;
  element.addEventListener('pointerdown', (event) => {
    last = { x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', (event) => {
    if (last === null) return;
    turn((event.clientX - last.x) * 0.01, (event.clientY - last.y) * 0.005);
    last = { x: event.clientX, y: event.clientY };
  });
  const release = (event) => {
    if (last === null) return;
    last = null;
    element.releasePointerCapture(event.pointerId);
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
}

function missing(holder, cap, label) {
  holder.innerHTML = '<span class="cast-missing">no model authored</span>';
  cap.textContent = `${label} — pending`;
}

async function mount(slug, label, host) {
  const { wrap, holder, cap } = card(slug, label);
  host.appendChild(wrap);

  let gltf;
  try {
    gltf = await loader.loadAsync(`/assets/${slug}.glb`);
  } catch {
    missing(holder, cap, label);
    return;
  }

  const w = holder.clientWidth || 220;
  const h = holder.clientHeight || 260;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // updateStyle must stay on. Passing false leaves the canvas with no CSS size,
  // so at devicePixelRatio 2 it lays out at twice the box and the container
  // crops to the middle - which reads as a camera zoomed hard into the chest.
  renderer.setSize(w, h);
  holder.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe9c4, 0x38424f, 2.1));
  const key = new THREE.DirectionalLight(0xfff1d0, 1.5);
  key.position.set(2.5, 4, 3);
  scene.add(key);

  const model = gltf.scene;

  // Frame the model from its own bounds so every character sits the same way
  // in its box regardless of authored scale.
  // Precise bounds matter for the rigid-weighted turnaround rigs. The fast
  // path expands from each SkinnedMesh's conservative local box and can count
  // its bind offset twice, making an otherwise normal model render at half
  // size. Per-vertex bounds are cheap for a single low-poly review candidate.
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  holder.dataset.modelBounds = `${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)}`;

  // Turn a pivot centred on the bounding box rather than the model itself.
  // Authored origins sit at ground contact (assets/CONVENTION.md), so pitching
  // the model directly would swing it around its feet and throw the head out of
  // frame. The pivot turns about the point the camera is already aimed at.
  const pivot = new THREE.Group();
  pivot.position.y = size.y / 2;
  model.position.sub(centre);
  pivot.add(model);
  scene.add(pivot);

  // Fit on both axes rather than guessing from the largest dimension: a wide
  // character crops horizontally otherwise, since fov is the vertical angle.
  const fov = 30;
  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 100);
  const halfFov = THREE.MathUtils.degToRad(fov) / 2;
  const target = new THREE.Vector3(0, size.y * 0.5, 0);
  // The model turns, so the horizontal extent it can present is its diagonal.
  const spread = Math.hypot(size.x, size.z);
  const resize = () => {
    const width = holder.clientWidth || 220;
    const height = holder.clientHeight || 260;
    const aspect = width / height;
    renderer.setSize(width, height);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const distV = (size.y / 2) / Math.tan(halfFov);
    const distH = (spread / 2) / (Math.tan(halfFov) * aspect);
    const dist = Math.max(distV, distH) * 1.25;
    camera.position.set(dist * 0.34, size.y * 0.62, dist);
    camera.lookAt(target);
  };
  resize();

  attachSpin(renderer.domElement, pivot);

  let mixer = null;
  const clips = gltf.animations ?? [];
  const idle = clips.find((c) => /idle/i.test(c.name)) ?? clips[0];
  if (idle) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(idle).play();
  }
  cap.textContent = idle
    ? `${label} — ${idle.name}${clips.length > 1 ? ` (+${clips.length - 1} clips)` : ''}`
    : `${label} — no clips`;

  const item = { renderer, scene, camera, mixer, resize };
  live.push(item);
  return item;
}

/**
 * One large inspection viewport with explicit model switching. All panels are
 * mounted up front so changing residents is instant; versioned files that have
 * not arrived yet retain their visible missing-state panel and begin working
 * on the next page load without any code change.
 */
async function mountCandidateSelector(host) {
  const tabs = document.createElement('div');
  tabs.className = 'candidate-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Choose a turnaround candidate');
  const stage = document.createElement('div');
  stage.className = 'candidate-stage';
  host.append(tabs, stage);

  const entries = TURNAROUND_CANDIDATES.map(([slug, label], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label.replace(/ v\d+$/, '');
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    const panel = document.createElement('div');
    panel.className = 'candidate-panel cast-grid cast-solo';
    panel.hidden = index !== 0;
    tabs.appendChild(button);
    stage.appendChild(panel);
    button.addEventListener('click', () => {
      for (const item of entries) {
        const active = item.button === button;
        item.button.setAttribute('aria-pressed', active ? 'true' : 'false');
        item.panel.hidden = !active;
        if (active) {
          void ensureMounted(item).then(() => requestAnimationFrame(() => item.viewer?.resize()));
        }
      }
    });
    return { slug, label, button, panel };
  });

  const ensureMounted = async (entry) => {
    if (!entry.pending) {
      entry.pending = mount(entry.slug, `${entry.label} — drag or scroll to turn`, entry.panel)
        .then((viewer) => { entry.viewer = viewer; return viewer; });
    }
    return entry.pending;
  };
  await ensureMounted(entries[0]);
}

function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  for (const item of live) {
    if (item.mixer) item.mixer.update(dt);
    item.renderer.render(item.scene, item.camera);
  }
  requestAnimationFrame(tick);
}

let ticking = false;
const startTick = () => {
  if (ticking || live.length === 0) return;
  ticking = true;
  tick();
};

// Review is a long page with several WebGL packets. Mounting every off-screen
// canvas at boot can exhaust the browser's context budget and evict the newest
// embedded equipment viewer. Create each packet only when the reviewer nears
// it; the candidate selector additionally mounts only the selected resident.
const mountWhenVisible = (element, task) => {
  const run = () => { void Promise.resolve(task()).then(startTick); };
  if (!('IntersectionObserver' in window)) {
    run();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    run();
  }, { rootMargin: '120px' });
  observer.observe(element);
};

const host = document.getElementById('w4-cast-viewer');
if (host) mountWhenVisible(host, () => Promise.all(CAST.map(([slug, label]) => mount(slug, label, host))));

const candidateHost = document.getElementById('turnaround-candidate-viewer');
if (candidateHost) mountWhenVisible(candidateHost, () => mountCandidateSelector(candidateHost));

// Single-model mounts, for review entries that put one candidate under the
// reader's own control rather than in the whole-cast grid. Any element with
// data-cast-model gets that GLB, so a new entry needs no JS change.
for (const solo of document.querySelectorAll('[data-cast-model]')) {
  mountWhenVisible(solo, () => mount(
    solo.dataset.castModel,
    solo.dataset.castLabel ?? solo.dataset.castModel,
    solo,
  ));
}
