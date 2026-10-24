import { Game } from './game/Game';
import { assets } from './core/AssetLoader';
import { previewRequest, ScenePreview } from './cutscene/preview/ScenePreview';
import { sceneSource } from './cutscene/scene/SceneLibrary';

const container = document.getElementById('app')!;
await assets.preload([
  'bench', 'benchTimber', 'sparks', 'orchardTree',
  'postmaster', 'albert', 'mira', 'rowan', 'liliane',
  'amina', 'niko', 'maeve', 'vittorio', 'ferry-recruit', 'keeper',
  'bunny', 'staff', 'flower-pot',
  // Opening sets. The post office and its lanterns are placed by the town
  // builder at world construction, so they must be resolved before the Game
  // constructor runs, not lazily when the cutscene starts.
  'ferry', 'post-office', 'lantern-post', 'ferry-passenger',
]);
// Debug hook for probe scripts; harmless in production.
const game = new Game(container);
game.start();

/**
 * Scene-preview mode.
 *
 * `?scene=<id>&beat=<id>` boots the real game into an authored `.scene` held at
 * a beat, which is what the `/cutscene` editor puts in its iframe. The branch
 * lives here rather than in `Game.ts`: the preview is not a game state, it is a
 * different way of entering the one that already exists.
 */
const preview = previewRequest();
if (preview) {
  // From the bundle, not the dev-server API: the file ships with the build and
  // Vite reloads this module when it changes, so the fetch was ~400ms of round
  // trip to learn something already in memory.
  const text = sceneSource(preview.scene);
  if (text === null) throw new Error(`no scene "${preview.scene}"`);
  const session = new ScenePreview(game, container, text, preview);
  game.scenePreview = session;
  await session.start();
}
