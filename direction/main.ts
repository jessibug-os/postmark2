import * as THREE from 'three';
import { assets, type AssetId } from '../src/core/AssetLoader';
import { audio, type ThemeName } from '../src/core/AudioSystem';

const status = document.querySelector<HTMLElement>('#model-status')!;
const mount = document.querySelector<HTMLElement>('#cast-view')!;
const modelButtons = document.querySelectorAll<HTMLButtonElement>('[data-model]');
const rotationButton = document.querySelector<HTMLButtonElement>('#rotate')!;
let rotating = false;
let visible = true;
let model: THREE.Group | undefined;
let request = 0;

// This is an asset inspection view, not a reconstruction of the game renderer.
async function initViewer(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0xe4e5d6, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xfff9e9, 0x82947c, 2.5));
  const light = new THREE.DirectionalLight(0xfff2dc, 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const render = (): void => renderer.render(scene, camera);
  const resize = new ResizeObserver(() => {
    const { width, height } = mount.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  resize.observe(mount);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(mount);
  const select = async (id: AssetId): Promise<void> => {
    const token = ++request;
    status.textContent = `Loading ${id}…`;
    try {
      await assets.preload([id]);
      if (token !== request) return;
      if (model) scene.remove(model);
      model = assets.model(id);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      model.position.sub(center);
      const frame = new THREE.Group();
      frame.add(model);
      model = frame;
      model.rotation.y = -0.22;
      scene.add(model);
      const distance = Math.max(size.y, size.x * 1.2) / (2 * Math.tan(THREE.MathUtils.degToRad(16))) * 1.3;
      camera.position.set(0, size.y * 0.06, distance);
      camera.lookAt(0, 0, 0);
      status.textContent = '';
      modelButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.model === id)));
      render();
    } catch {
      if (token === request) status.textContent = 'Model unavailable. Inspect the current cast in the model library linked below.';
    }
  };
  modelButtons.forEach(button => button.addEventListener('click', () => void select(button.dataset.model as AssetId)));
  rotationButton.addEventListener('click', () => {
    rotating = !rotating;
    rotationButton.setAttribute('aria-pressed', String(rotating));
    rotationButton.textContent = rotating ? 'Stop rotation' : 'Rotate';
  });
  let previous = 0;
  renderer.setAnimationLoop((time: number) => {
    const delta = Math.min((time - previous) / 1000, 0.05);
    previous = time;
    if (rotating && model && visible && !document.hidden) {
      model.rotation.y += delta * 0.45;
      render();
    }
  });
  await select('postmaster');
}
void initViewer().catch(() => {
  status.textContent = '3D preview needs WebGL. The written plan and audio remain available.';
  rotationButton.disabled = true;
  modelButtons.forEach(button => { button.disabled = true; });
});

const theme = document.querySelector<HTMLSelectElement>('#theme')!;
const volume = document.querySelector<HTMLInputElement>('#volume')!;
const audioStatus = document.querySelector<HTMLElement>('#audio-status')!;
const play = document.querySelector<HTMLButtonElement>('#play-audio')!;
let playing = false;
function startMusic(): void {
  try {
    audio.setMasterVolume(Number(volume.value));
    audio.setTheme(theme.value as ThemeName, true);
    audio.unlock();
    playing = true;
    play.setAttribute('aria-pressed', 'true');
    audioStatus.textContent = `Playing ${theme.selectedOptions[0].textContent}.`;
  } catch {
    audioStatus.textContent = 'Audio could not start in this browser. Try the full audio lab.';
  }
}
function stopMusic(): void {
  audio.setTheme('silence', true);
  playing = false;
  play.setAttribute('aria-pressed', 'false');
  audioStatus.textContent = 'Stopped.';
}
play.addEventListener('click', startMusic);
document.querySelector('#stop-audio')!.addEventListener('click', stopMusic);
theme.addEventListener('change', () => { if (playing) startMusic(); });
volume.addEventListener('input', () => audio.setMasterVolume(Number(volume.value)));
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stopMusic(); });
document.querySelector('#print')!.addEventListener('click', () => window.print());

// Illustrative days show the proposed life at different stages.
const days: Record<string, { title: string; copy: string; meaning: string }> = {
  early: {
    title: 'You still have to check the street names.',
    copy: 'Work a short delivery round. Spend part of the pay on a blue lamp you saw in the secondhand shop. Get lost looking for the bathhouse and find the hill path instead. Eat dinner at the café because your room has no table yet. Pip knocks that evening to borrow a screwdriver.',
    meaning: 'The reward is small but concrete: you know another route, own something you chose, and have met your neighbor.',
  },
  settled: {
    title: 'June has already put your cup out.',
    copy: 'Walk to your café shift by the back lane. June wants to trade Saturday with you because of an audition. Agree, or help her ask somebody else. Pick up a repaired chair from the yard. Spend the afternoon arranging a corner for guests. Omar comes over after dinner and stays longer than either of you expected.',
    meaning: 'The same streets now hold commitments, preferences, and people who think of you before you arrive.',
  },
  rain: {
    title: 'You decide to stay close to home.',
    copy: 'Move a plant away from the draft. Cook with Pip using what you both have left. Walk to the bathhouse under an umbrella; Ada and Basil are already at their card table. Nell arrives with suspiciously wet hair. Buy a pastry on the way home. Leave the ambitious plans for another day.',
    meaning: 'An unproductive day can still contain humor, company, and the pleasure of having somewhere to come home to.',
  },
};
document.querySelectorAll<HTMLButtonElement>('[data-day]').forEach(button => {
  button.addEventListener('click', () => {
    const day = days[button.dataset.day!];
    document.querySelector('#day-title')!.textContent = day.title;
    document.querySelector('#day-copy')!.textContent = day.copy;
    document.querySelector('#day-meaning')!.textContent = day.meaning;
    document.querySelectorAll('[data-day]').forEach(other => {
      other.setAttribute('aria-pressed', String(other === button));
    });
  });
});
