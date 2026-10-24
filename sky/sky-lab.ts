/**
 * The sky lab — `/sky`.
 *
 * Every picture on this page is rendered by the game's own sky code
 * (`src/world/sky/*`) through the game's own pipeline shape: a 480×360 buffer
 * upscaled nearest-neighbour. A mock-up drawn in CSS would flatter the proposal
 * exactly where it is most likely to fail — gradient banding, the size of a
 * star, the edge of a cloud — because those are all artefacts of the low-res
 * pass, and CSS does not have one.
 *
 * The foreground is a silhouette stand-in, not the island. It is here because a
 * sky cannot be judged without a horizon in the frame, and it is deliberately
 * featureless so nobody mistakes it for a claim about the island's art.
 */
import * as THREE from 'three';
import { SkyDome } from '../src/world/sky/SkyDome';
import { Stars } from '../src/world/sky/Stars';
import { skyAt } from '../src/world/sky/skyRamp';
import { CONSTELLATIONS } from '../src/world/sky/constellations';
import { daylightAt } from '../src/systems/TimeSystem';
import { PALETTE_HEX, palette } from '../src/art/palette';

/** The game's render buffer. Everything is drawn at this size and upscaled. */
const WIDTH = 480;
const HEIGHT = 360;

interface ViewOptions {
  hour: number;
  cover: number;
  storm: number;
  wind: number;
  monthDay: number;
  pitch: number;
  /** Degrees the view tilts up from the rig's framing — the star-gazing camera. */
  gaze: number;
  /** Recipe switches, matching the three proposals on the page. */
  /** The game's fog. Off shows what the fog is hiding. */
  fog: boolean;
  gradient: boolean;
  bodies: boolean;
  clouds: boolean;
  stars: boolean;
  chart: boolean;
  /** Draw today's single flat colour instead of the dome. */
  flat: boolean;
}

const DEFAULTS: ViewOptions = {
  hour: 18.6, cover: 0.22, storm: 0, wind: 0.8, monthDay: 8, pitch: 20, gaze: 0, fog: true,
  gradient: true, bodies: true, clouds: true, stars: true, chart: false, flat: false,
};

/**
 * Today's sky colour, transcribed from `DayNight.update`.
 *
 * Here so the comparison is against what actually ships rather than against a
 * remembered version of it. If `DayNight` changes, this is wrong and the page
 * is lying — which is the trade for not booting the whole game to show one
 * flat colour.
 */
const FLAT_NIGHT = new THREE.Color(PALETTE_HEX.h1e2a4a);
const FLAT_GOLD = new THREE.Color(PALETTE_HEX.hc09070);
const FLAT_DAY = new THREE.Color(PALETTE_HEX.h9cb8d8);

function flatSky(hour: number): THREE.Color {
  const daylight = daylightAt(hour);
  const out = new THREE.Color();
  if (daylight < 0.5) out.copy(FLAT_NIGHT).lerp(FLAT_GOLD, daylight * 2);
  else out.copy(FLAT_GOLD).lerp(FLAT_DAY, (daylight - 0.5) * 2);
  return out;
}

export interface SkyView {
  set(options: Partial<ViewOptions>): void;
  options: ViewOptions;
  /** Fraction of frame height above the true horizon at the current pitch. */
  skyOnScreen(): number;
  shoot(): void;
  render(): void;
}

/** One self-contained sky render inside a canvas. */
export function makeSkyView(canvas: HTMLCanvasElement, initial: Partial<ViewOptions> = {}): SkyView {
  const options: ViewOptions = { ...DEFAULTS, ...initial };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT, 0.1, 400);

  const sky = new SkyDome();
  const stars = new Stars();
  scene.add(sky.mesh, stars.group);

  // Ground stand-in: one flat disc in the season's grass colour, fogged like
  // the island's is. Not the island — the point is only that the sky is being
  // judged over something, and that the distance dissolves the way the game
  // dissolves it.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(300, 48),
    new THREE.MeshBasicMaterial({ color: palette.seasons.summer.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const silhouettes = new THREE.Group();
  const block = (x: number, z: number, w: number, h: number, d: number): void => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: palette.ink }),
    );
    mesh.position.set(x, h / 2, z);
    silhouettes.add(mesh);
  };
  const tree = (x: number, z: number, h: number): void => {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(h * 0.42, h, 7),
      new THREE.MeshBasicMaterial({ color: palette.ink }),
    );
    mesh.position.set(x, h / 2, z);
    silhouettes.add(mesh);
  };
  // Pushed well out: near the camera they are a wall, and the frame is meant to
  // be mostly sky and ground with a town on the far edge of it.
  block(-34, -96, 12, 8, 10);
  block(-22, -104, 5, 12, 5);
  block(30, -110, 16, 7, 11);
  tree(-58, -92, 10);
  tree(48, -88, 8);
  tree(62, -100, 11);
  tree(8, -120, 9);
  scene.add(silhouettes);

  const clock = new THREE.Clock();
  let time = 0;

  // Framed exactly as `CameraRig` frames the game: the camera sits `pitch`
  // degrees above a target 16 units away and looks at it. This is the whole
  // reason the lab is worth building — a free camera pointed at the horizon
  // would show a sky the game never puts on screen.
  const target = new THREE.Vector3(0, 1.4, 0);
  const place = (): void => {
    const pitch = THREE.MathUtils.degToRad(options.pitch);
    camera.position.set(
      target.x,
      target.y + Math.sin(pitch) * 16,
      target.z + Math.cos(pitch) * 16,
    );
    camera.lookAt(target);
    // Gaze tilts the view up out of that framing without moving the camera —
    // what a "look up" or a bench would do, and the only way anything above
    // 17.5° of elevation gets on screen at all.
    camera.rotateX(THREE.MathUtils.degToRad(options.gaze));
  };

  /** Fraction of the frame's height that is above the true horizon. */
  const skyFraction = (pitch: number, gaze: number): number =>
    Math.max(0, Math.min(1, (17.5 - pitch + gaze) / 35));

  // The game's fog, at the game's numbers. Without it the lab would show a
  // hard sea edge the player never sees, and — more to the point — would hide
  // that the band which reads as sky in play is fog.
  const fog = new THREE.Fog(0x000000, 40, 150);
  scene.fog = fog;

  const render = (): void => {
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;
    place();
    sky.bodies = options.bodies;
    sky.clouds = options.clouds;
    sky.mesh.visible = !options.flat && options.gradient;
    stars.group.visible = !options.flat && options.stars;
    stars.chart = options.chart;
    sky.update({
      hour: options.hour,
      monthDay: options.monthDay,
      cover: options.cover,
      storm: options.storm,
      wind: new THREE.Vector2(options.wind, options.wind * 0.35),
      time,
    });
    stars.update(dt, time, daylightAt(options.hour), options.cover);
    // The stand-in ground is unlit, so it takes the day's level by hand.
    // Without this the lawn is noon-bright under a midnight sky.
    const level = 0.2 + daylightAt(options.hour) * 0.8;
    (ground.material as THREE.MeshBasicMaterial).color
      .setHex(palette.seasons.summer.ground).multiplyScalar(level);
    sky.follow(camera);
    stars.follow(camera);
    // The handshake: the fog is fed the ramp's horizon, so the distance
    // dissolves into the bottom of the dome instead of into a second opinion.
    scene.fog = options.fog ? fog : null;
    fog.color.copy(options.flat ? flatSky(options.hour) : sky.horizonColor);
    // Flat mode paints the single colour the game uses today; the dome and the
    // stars are hidden, so what is left is exactly the shipped sky.
    scene.background = options.flat
      ? flatSky(options.hour)
      : (options.gradient ? null : new THREE.Color(skyAt(options.hour).horizon));
    renderer.render(scene, camera);
  };

  return {
    options,
    skyOnScreen: () => skyFraction(options.pitch, options.gaze),
    set(patch: Partial<ViewOptions>) { Object.assign(options, patch); },
    shoot() { stars.shoot(); },
    render,
  };
}

/* ---------------------------------------------------------------- page ---- */

const views: SkyView[] = [];

/**
 * The lab's views, for the console and for `scripts/sky-bake.mjs`.
 *
 * The baker drives the same object the page's controls drive, so a prebaked
 * frame cannot disagree with what the page shows when you set the same values.
 */
declare global {
  interface Window { __skyLab?: { views: SkyView[]; lab?: SkyView } }
}

function boot(): void {
  const hero = document.getElementById('heroSky') as HTMLCanvasElement | null;
  if (hero) {
    const view = makeSkyView(hero, { hour: 19.1, cover: 0.3, pitch: 20, gaze: 30 });
    views.push(view);
  }

  const labCanvas = document.getElementById('labSky') as HTMLCanvasElement | null;
  if (labCanvas) {
    const lab = makeSkyView(labCanvas, {});
    views.push(lab);
    wireControls(lab);
    window.__skyLab = { views, lab };
  }
  window.__skyLab ??= { views };

  drawRamp();
  drawCurve();
  listConstellations();

  const tick = (): void => {
    for (const view of views) view.render();
    requestAnimationFrame(tick);
  };
  tick();
}

function wireControls(lab: SkyView): void {
  const readout = document.getElementById('labReadout') as HTMLElement;
  const clockOf = (hour: number): string => {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  const update = (): void => {
    const ramp = skyAt(lab.options.hour);
    readout.innerHTML =
      `<b>${clockOf(lab.options.hour)}</b> · daylight ${daylightAt(lab.options.hour).toFixed(2)}` +
      ` · zenith <code>#${ramp.zenith.toString(16).padStart(6, '0')}</code>` +
      ` · horizon <code>#${ramp.horizon.toString(16).padStart(6, '0')}</code>` +
      ` · cover ${Math.round(lab.options.cover * 100)}%` +
      `<br /><b>sky above the horizon: ${(lab.skyOnScreen() * 100).toFixed(0)}% of frame height</b>` +
      ` — at the rig's play pitch of 45° and its idle 20°, none of it is.`;
  };

  for (const input of document.querySelectorAll<HTMLInputElement>('[data-opt]')) {
    const key = input.dataset.opt as keyof ViewOptions;
    const apply = (): void => {
      const value = input.type === 'checkbox' ? input.checked : Number(input.value);
      lab.set({ [key]: value } as Partial<ViewOptions>);
      update();
    };
    input.addEventListener('input', apply);
    apply();
  }

  const syncSliders = (patch: Partial<ViewOptions>): void => {
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-opt]')) {
      const key = input.dataset.opt as keyof ViewOptions;
      if (!(key in patch)) continue;
      if (input.type === 'checkbox') input.checked = Boolean(patch[key]);
      else input.value = String(patch[key]);
    }
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-camera]')) {
    button.addEventListener('click', () => {
      const camera = button.dataset.camera;
      const patch: Partial<ViewOptions> = camera === 'walking'
        ? { pitch: 45, gaze: 0 }
        : camera === 'idle' ? { pitch: 20, gaze: 0 } : { pitch: 20, gaze: 26 };
      lab.set(patch);
      syncSliders(patch);
      update();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-hour]')) {
    button.addEventListener('click', () => {
      const hour = Number(button.dataset.hour);
      const slider = document.querySelector<HTMLInputElement>('[data-opt="hour"]');
      if (slider) slider.value = String(hour);
      lab.set({ hour });
      update();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-recipe]')) {
    button.addEventListener('click', () => {
      const recipe = button.dataset.recipe;
      const patch: Partial<ViewOptions> = recipe === 'today'
        ? { flat: true }
        : recipe === 'a'
          ? { flat: false, gradient: true, bodies: false, clouds: false, stars: false }
          : recipe === 'b'
            ? { flat: false, gradient: true, bodies: true, clouds: false, stars: true }
            : { flat: false, gradient: true, bodies: true, clouds: true, stars: true };
      lab.set(patch);
      syncSliders(patch);
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-recipe]')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      update();
    });
  }

  document.getElementById('shootBtn')?.addEventListener('click', () => lab.shoot());
  update();
}

/** The 24-hour ramp, as the strip the stops actually describe. */
function drawRamp(): void {
  const canvas = document.getElementById('rampStrip') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  for (let x = 0; x < w; x++) {
    const hour = (x / w) * 24;
    const ramp = skyAt(hour);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, `#${ramp.zenith.toString(16).padStart(6, '0')}`);
    gradient.addColorStop(1, `#${ramp.horizon.toString(16).padStart(6, '0')}`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 1, h);
  }
  // The same strip for what ships today, underneath, for the comparison.
  const flatStrip = document.getElementById('flatStrip') as HTMLCanvasElement | null;
  const flatCtx = flatStrip?.getContext('2d');
  if (flatStrip && flatCtx) {
    for (let x = 0; x < flatStrip.width; x++) {
      const hour = (x / flatStrip.width) * 24;
      flatCtx.fillStyle = `#${flatSky(hour).getHexString()}`;
      flatCtx.fillRect(x, 0, 1, flatStrip.height);
    }
  }
}

/** The daylight curve, plotted against the ramp's stop hours. */
function drawCurve(): void {
  const canvas = document.getElementById('curvePlot') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(38,55,77,.22)';
  ctx.lineWidth = 1;
  for (const stop of palette.sky.stops) {
    const x = (stop.hour / 24) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.strokeStyle = '#b6813e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) {
    const y = h - daylightAt((x / w) * 24) * (h - 6) - 3;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function listConstellations(): void {
  const list = document.getElementById('constellations');
  if (!list) return;
  list.innerHTML = CONSTELLATIONS.map((constellation) => `
    <div class="panel">
      <h3>${constellation.name}</h3>
      <p>${constellation.lore}</p>
      <small>${constellation.stars.length} stars · ${constellation.lines.length} lines</small>
    </div>`).join('');
}

boot();
