import { audio } from './core/AudioSystem';
import { listSaveSlots } from './systems/SaveSystem';
import { mountTitleScreen } from './ui/TitleScreen';
import type { Game as GameType } from './game/Game';

const container = document.getElementById('app')!;
let game: GameType | null = null;
const title = mountTitleScreen(container, {
  slots: listSaveSlots(),
  onContinue: (slot) => game?.startFromSave(slot),
  onNewGame: (slot) => game?.startNewGame(slot),
  musicOn: audio.musicEnabled,
  sfxOn: audio.sfxEnabled,
  musicToggle: () => {
    audio.setMusicEnabled(!audio.musicEnabled);
    return audio.musicEnabled;
  },
  sfxToggle: () => (audio.sfxEnabled = !audio.sfxEnabled),
});
await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

const [{ Game }, { assets }, { previewRequest, ScenePreview }, { sceneSource }] = await Promise.all([
  import('./game/Game'),
  import('./core/AssetLoader'),
  import('./cutscene/preview/ScenePreview'),
  import('./cutscene/scene/SceneLibrary'),
]);
await assets.preload([
  'bench', 'benchTimber', 'sparks', 'orchardTree',
  'postmaster', 'chargen-kit', 'albert', 'mira', 'rowan', 'liliane',
  'amina', 'niko', 'maeve', 'vittorio', 'ferry-recruit', 'keeper',
  'bunny', 'staff', 'flower-pot',
  'ferry', 'post-office', 'lantern-post', 'ferry-passenger', 'dock', 'dock-square', 'dock-step', 'boat',
]);
game = new Game(container);
game.title = title;
const canvas = game.renderer.domElement;
canvas.style.opacity = '0';
canvas.style.transition = 'opacity 0.8s';
game.start();
game.editor?.resume();
requestAnimationFrame(() => requestAnimationFrame(() => {
  canvas.style.opacity = '1';
  title.ready();
}));

const preview = previewRequest();
if (preview) {
  const text = sceneSource(preview.scene);
  if (text === null) throw new Error(`no scene "${preview.scene}"`);
  const session = new ScenePreview(game, container, text, preview);
  game.scenePreview = session;
  await session.start();
}
