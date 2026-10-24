/**
 * The game's dev commands.
 *
 * Kept out of `Game.ts` so the debug surface is one file you can read to know
 * exactly what the console can do — and one file to delete if it ever needs to
 * go. Commands may read game state freely; they should stay away from mutating
 * anything a save persists, because a debug session is not a play session and
 * the autosave cannot tell them apart.
 */
import type { Game } from '../game/Game';
import { ACRE_SIZE, acreCentre, GRID_COLS, GRID_ROWS } from '../world/island/AcreLibrary';
import { ACTIVE_FIELD, ACTIVE_LAYOUT, ISLAND_MAP_ID } from '../world/mapConstants';
import { TEMPLATES } from '../world/island/TemplateLibrary';
import type { WeatherKind } from '../world/Weather';
import { WeatherDebugPanel } from './WeatherDebugPanel';

const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'rain', 'snow', 'fog'];

export function registerDevCommands(game: Game): void {
  const console_ = game.devConsole;
  const weatherPanel = new WeatherDebugPanel(document.querySelector('#game') ?? document.body, game);

  console_.commands.register({
    name: 'acre',
    help: 'Toggle the acre view — the generation grid drawn onto the terrain.',
    usage: 'acre [on|off]',
    run: (args) => {
      const arg = args[0]?.toLowerCase();
      const on = arg === 'on' ? true : arg === 'off' ? false : !game.acreView.isVisible;
      if (on && !game.acreView.available) return 'No generated island is active on this map.';
      game.acreView.setVisible(on);
      if (!on) return 'Acre view off.';
      const p = game.player.position;
      game.acreView.update(p.x, p.z);
      return ['Acre view on.', ...game.acreView.describe(p.x, p.z)];
    },
  });

  console_.commands.register({
    name: 'grid',
    help: 'Toggle the nearby gameplay cell grid; -w displays live snow or wetness.',
    usage: 'grid [on|off|-w]',
    run: (args) => {
      const arg = args[0]?.toLowerCase();
      if (arg && !['on', 'off', '-w'].includes(arg)) return 'Usage: grid [on|off|-w]';
      const wetness = arg === '-w';
      const on = wetness || (arg === 'on' ? true : arg === 'off' ? false : !game.gridView.isVisible);
      if (on && !game.gridView.available) return 'No gameplay cell grid is active on this map.';
      if (on) game.gridView.setMode(wetness ? 'wetness' : 'capabilities');
      game.gridView.setVisible(on);
      if (!on) return 'Grid view off.';
      const p = game.player.position;
      game.gridView.update(p.x, p.z);
      return [wetness ? 'Grid weather-surface view on.' : 'Grid view on.', ...game.gridView.describe(p.x, p.z)];
    },
  });

  console_.commands.register({
    name: 'curves',
    help: 'Toggle the feature-curve view — the island silhouette the curve layer sees.',
    usage: 'curves [on|off]',
    run: (args) => {
      const arg = args[0]?.toLowerCase();
      const on = arg === 'on' ? true : arg === 'off' ? false : !game.curveView.isVisible;
      if (on && !game.curveView.available) return 'No generated island is active on this map.';
      game.curveView.setVisible(on);
      if (!on) return 'Curve view off.';
      return ['Curve view on. amber coast · red cliff · teal pond · pale river.', ...game.curveView.describe()];
    },
  });

  console_.commands.register({
    name: 'map',
    help: 'Report the active authored island map.',
    run: () => [
      `map  ${ISLAND_MAP_ID ?? '(default)'}`,
      `grid ${GRID_COLS}×${GRID_ROWS} acres of ${ACRE_SIZE} units`,
      'Use /seed <x> to walk a different map; author them at /island.',
    ],
  });

  console_.commands.register({
    name: 'seed',
    help: 'List island seeds, or reload the game on one of them.',
    usage: 'seed <x>',
    run: (args) => {
      const available = TEMPLATES
        .map((entry) => entry.id.match(/^seed-(.+)$/)?.[1])
        .filter((seed): seed is string => seed !== undefined);
      const requested = args[0]?.replace(/^seed-/i, '');
      if (!requested) return [`Current seed: ${ISLAND_MAP_ID?.replace(/^seed-/, '') ?? '1'}`, `Options: ${available.join(', ')}`];

      const id = `seed-${requested}`;
      if (!TEMPLATES.some((entry) => entry.id === id)) {
        return [`Unknown seed: ${requested}`, `Options: ${available.join(', ')}`];
      }

      const url = new URL(window.location.href);
      url.searchParams.set('map', id);
      window.location.assign(url);
      return `Loading seed ${requested}…`;
    },
  });

  console_.commands.register({
    name: 'where',
    help: 'Print the player position and the acre under it.',
    run: () => {
      const p = game.player.position;
      const acre = ACTIVE_FIELD?.acreAt(p.x, p.z);
      return [
        `pos  ${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}`,
        `acre ${acre ? `[${acre.col},${acre.row}] ${acre.kind} tier ${acre.tier}` : 'off the grid'}`,
      ];
    },
  });

  console_.commands.register({
    name: 'time',
    help: 'Report the clock, or jump it to an hour.',
    usage: 'time [1900|19:00|19|reset]',
    run: (args) => {
      if (args.length === 0) return clockLine(game);
      if (args[0].toLowerCase() === 'reset') {
        game.time.offsetHours = 0;
        return [`Clock back on the wall clock.`, clockLine(game)];
      }
      const target = parseHour(args.join(''));
      if (target === null) return 'Usage: time 1900 | time 19:00 | time 19 | time reset';
      // `offsetHours` is absolute, so it has to be re-derived from the wall
      // clock rather than nudged — the clock keeps running from here.
      const wall = game.time.hour - game.time.offsetHours;
      game.time.offsetHours = target - wall;
      return clockLine(game);
    },
  });

  console_.commands.register({
    name: 'weather',
    help: 'Toggle live weather diagnostics, or force the current weather.',
    usage: 'weather [on|off|clear|rain|snow|fog]',
    run: (args) => {
      if (args.length === 0) {
        weatherPanel.setVisible(!weatherPanel.isVisible);
        return `Weather panel ${weatherPanel.isVisible ? 'on' : 'off'}.`;
      }
      const requested = args[0].toLowerCase();
      if (requested === 'on' || requested === 'off') {
        weatherPanel.setVisible(requested === 'on');
        return `Weather panel ${requested}.`;
      }
      if (!WEATHER_KINDS.includes(requested as WeatherKind)) {
        return `Unknown weather "${args[0]}". Use: on, off, ${WEATHER_KINDS.join(', ')}.`;
      }
      game.weather.setWeather(requested as WeatherKind);
      weatherPanel.setVisible(true);
      return `Weather forced to ${game.weather.kind}; panel on.`;
    },
  });

  // The framing the rig booted with, so `cam reset` restores the game's look
  // rather than a set of numbers copied out of CameraRig that could drift.
  const camDefaults = {
    pitch: game.rig.basePitch,
    distance: game.rig.distance,
    azimuth: game.rig.azimuth,
    fov: game.rig.camera.fov,
  };

  console_.commands.register({
    name: 'cam',
    help: 'Read or set the camera framing — pitch, idlepitch, distance, azimuth (rot), fov.',
    usage: 'cam [pitch|idlepitch|distance|azimuth|rot|fov] <degrees|units> | cam reset',
    run: (args) => {
      if (args.length === 0) return camLine(game);
      const key = args[0].toLowerCase();
      if (key === 'reset') {
        game.rig.basePitch = camDefaults.pitch;
        game.rig.pitch = camDefaults.pitch;
        game.rig.distance = camDefaults.distance;
        game.rig.azimuth = camDefaults.azimuth;
        setFov(game, camDefaults.fov);
        return ['Camera back to the game framing.', ...camLine(game)];
      }
      const value = Number(args[1]);
      if (!Number.isFinite(value)) return `cam ${key} needs a number.`;
      switch (key) {
        // Straight up and straight down both degenerate: lookAt has no up
        // vector to work with, and the frame flips.
        // `pitch` is rewritten every frame by the idle drift, so setting it
        // alone lasts one frame. The base angle is the one worth moving.
        case 'pitch': game.rig.basePitch = game.rig.pitch = clamp(value, 1, 89); break;
        case 'idlepitch': game.rig.idlePitch = clamp(value, 1, 89); break;
        // Below ~1.5 the camera is inside the player; the far plane is 200.
        case 'distance': game.rig.distance = clamp(value, 1.5, 120); break;
        // Wraps, so `cam azimuth 370` is the same shot as `10`.
        case 'azimuth':
        case 'rot': game.rig.azimuth = ((value % 360) + 360) % 360; break;
        case 'fov': setFov(game, clamp(value, 10, 100)); break;
        default: return 'cam takes pitch, idlepitch, distance, azimuth (rot), fov or reset.';
      }
      return camLine(game);
    },
  });

  console_.commands.register({
    name: 'tp',
    help: 'Teleport to a world position, an acre, or a named landmark.',
    usage: 'tp <x> <z> | tp acre <col> <row> | tp <dock|postoffice|summit|spot name>',
    run: (args) => {
      const target = resolveTarget(args);
      if (typeof target === 'string') return target;
      const y = ACTIVE_FIELD?.heightAt(target.x, target.z) ?? game.player.position.y;
      game.player.position.set(target.x, y, target.z);
      return `Moved to ${target.x.toFixed(1)}, ${target.z.toFixed(1)}.`;
    },
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function setFov(game: Game, fov: number): void {
  game.rig.camera.fov = fov;
  game.rig.camera.updateProjectionMatrix();
}

/**
 * Report the framing, and warn when it is about to be taken back.
 *
 * `CameraRig.update()` drives `pitch` and `azimuth` itself while a scripted
 * move runs, and `clearFocus()` returns both to the game's look when the move
 * ends — so a `cam` setting made during a cutscene lasts until the cutscene
 * disagrees. Saying so beats leaving someone to wonder why their angle reverted.
 */
function camLine(game: Game): string[] {
  const { rig } = game;
  const line =
    `pitch ${rig.pitch.toFixed(1)}° (base ${rig.basePitch.toFixed(1)}°, idle ${rig.idlePitch.toFixed(1)}°)  ` +
    `distance ${rig.distance.toFixed(1)}  ` +
    `azimuth ${rig.azimuth.toFixed(1)}°  fov ${rig.camera.fov.toFixed(1)}°`;
  if (rig.moving || game.cutsceneHold) {
    return [line, 'A scripted move is running — it will reset pitch and azimuth when it ends.'];
  }
  return rig.idling
    ? [line, 'The idle drift has the frame — move and it comes back to the base angle.']
    : [line];
}

function clockLine(game: Game): string {
  const offset = game.time.offsetHours;
  const drift = offset === 0 ? 'wall clock' : `${offset > 0 ? '+' : ''}${offset.toFixed(2)}h`;
  return `${game.time.clockText} — ${game.time.phase}, daylight ${game.time.daylight.toFixed(2)} (${drift})`;
}

/**
 * Read a time of day. `1900` is the shape people type, but `19:00` and a bare
 * `19` cost nothing to accept and are what the other half reach for.
 */
function parseHour(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  const m = /^(\d{1,2}):(\d{2})$|^(\d{3,4})$|^(\d{1,2})$/.exec(text);
  if (!m) return null;
  let hours: number;
  let minutes: number;
  if (m[1] !== undefined) {
    hours = Number(m[1]);
    minutes = Number(m[2]);
  } else if (m[3] !== undefined) {
    hours = Number(m[3].slice(0, -2));
    minutes = Number(m[3].slice(-2));
  } else {
    hours = Number(m[4]);
    minutes = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return hours + minutes / 60;
}

/** Turn `tp` arguments into a point, or into the error message to print. */
function resolveTarget(args: string[]): { x: number; z: number } | string {
  if (args.length === 0) return 'Usage: tp <x> <z> | tp acre <col> <row> | tp <landmark>';

  if (args[0].toLowerCase() === 'acre') {
    const col = Number(args[1]);
    const row = Number(args[2]);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return 'tp acre needs a column and a row.';
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
      return `Acre out of range (0..${GRID_COLS - 1}, 0..${GRID_ROWS - 1}).`;
    }
    return acreCentre(col, row);
  }

  if (args.length >= 2 && Number.isFinite(Number(args[0])) && Number.isFinite(Number(args[1]))) {
    return { x: Number(args[0]), z: Number(args[1]) };
  }

  // Named landmarks are the layout's own spots, matched case- and
  // punctuation-insensitively so `tp postoffice` finds `townHall`'s neighbours
  // by the name a person would actually type.
  const wanted = args.join('').toLowerCase();
  const alias: Record<string, string> = { postoffice: 'townHall', office: 'townHall' };
  const key = alias[wanted] ?? wanted;
  for (const [name, vec] of Object.entries(ACTIVE_LAYOUT.spots)) {
    if (name.toLowerCase() === key) return { x: vec.x, z: vec.z };
  }
  return `No landmark "${args.join(' ')}". Known: ${Object.keys(ACTIVE_LAYOUT.spots).join(', ')}`;
}
