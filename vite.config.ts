import { defineConfig, type Plugin } from 'vite';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { formatAcre, parseAcre } from './src/world/island/AcreFormat';
import { formatScene, parseScene } from './src/cutscene/scene/SceneFormat';
import { formatSet, parseSet } from './src/cutscene/set/SetFormat';
import { performanceClipNames, roleOf, type ClipRole } from './src/characters/clipVocabulary';

/**
 * Serve the wiki at a bare `/wiki` in dev and preview. The page itself lives
 * at `wiki/index.html`, which static hosts resolve from `/wiki/` on their own;
 * this only covers the extension-less, slash-less URL people actually type.
 */
function wikiRoute(): Plugin {
  const rewrite = (req: { url?: string }): void => {
    for (const base of ['/admin', '/wiki', '/review', '/characters', '/island-contract', '/story', '/verbs', '/weather', '/models', '/audio', '/acre', '/island', '/scene', '/water', '/grass', '/sky']) {
      if (req.url === base || (req.url && req.url.startsWith(base + '?'))) {
        req.url = base + '/index.html' + req.url.slice(base.length);
        return;
      }
    }
  };
  return {
    name: 'postmark-wiki-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
  };
}

interface CatalogEntry {
  slug: string;
  url: string;
  /** Family the file belongs to: `mira-v03` and `mira` share the base `mira`. */
  base: string;
  /** Version number parsed off the filename, or null for an unversioned file. */
  version: number | null;
  /** True when `public/assets/manifest.json` loads this file into the game. */
  runtime: boolean;
  bytes: number;
  /**
   * What sort of model this is, for the lab's three shelves.
   *
   * **Derived from the asset, never from a list beside it.** Equipment lives in
   * its own directory because the equipment registry addresses it that way; a
   * character is a model that carries a locomotion clip, which is the honest
   * definition — a character is a thing that can stand and walk — and it falls
   * out of the clip vocabulary we already read. Everything else is a prop.
   *
   * A hand-maintained kind table would be the fourth copy of a fact the files
   * already state, and `models/model-lab.js` has been carrying two of the other
   * three.
   */
  kind: 'character' | 'prop' | 'equipment';
  /** Every animation clip in the file, with the job the vocabulary gives it. */
  clips: Array<{ name: string; role: ClipRole }>;
  /**
   * The subset a `pose` cue may name, precomputed for the cutscene editor.
   *
   * Derived rather than authored: it is whatever the file carries that no
   * structural role claims. The editor's pose dropdown reads this, which is how
   * that dropdown stopped being a list somebody typed out by hand.
   */
  performances: string[];
}

/**
 * Animation clip names inside a `.glb`, read straight from its JSON chunk.
 *
 * A binary glTF is a 12-byte header followed by length-prefixed chunks; the
 * first is always JSON, and its `animations` array carries the names. Parsing
 * it here rather than loading the file through Three keeps the dev server free
 * of a WebGL dependency and costs a single buffered read per model.
 *
 * Any file that is not a glTF, or carries no animations, yields an empty list
 * rather than throwing — the asset directory holds props and set pieces too,
 * and a bad export should not take the whole catalog down with it.
 */
function clipNamesOf(file: string): string[] {
  try {
    const buffer = readFileSync(file);
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) return [];
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32LE(offset);
      const type = buffer.readUInt32LE(offset + 4);
      if (type === 0x4e4f534a) {
        const json = JSON.parse(
          buffer.subarray(offset + 8, offset + 8 + length).toString('utf8'),
        ) as { animations?: Array<{ name?: string }> };
        return (json.animations ?? []).map((clip, index) => clip.name ?? `animation_${index}`);
      }
      // Chunks are four-byte aligned; the padding is not counted in `length`.
      offset += 8 + length + ((4 - (length % 4)) % 4);
    }
    return [];
  } catch {
    return [];
  }
}

const ASSET_DIR = resolve(process.cwd(), 'public/assets');

/**
 * Slugs the runtime actually loads, read from the game's own asset manifest.
 * Anything else on disk is a review candidate or a retired version, and the
 * model lab must label it as such — presence in `public/assets` has never
 * meant a model is in the game.
 */
function runtimeSlugs(): Set<string> {
  try {
    const manifest = JSON.parse(readFileSync(resolve(ASSET_DIR, 'manifest.json'), 'utf8')) as Record<
      string,
      { type?: string; url?: string }
    >;
    const slugs = Object.values(manifest)
      .filter((entry) => entry.type === 'model' && typeof entry.url === 'string')
      .map((entry) => basename(entry.url as string, '.glb'));
    return new Set(slugs);
  } catch {
    return new Set();
  }
}

function readCatalog(): CatalogEntry[] {
  const runtime = runtimeSlugs();
  const glbs = (directory: string, prefix = ''): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory()
        ? glbs(join(directory, entry.name), relative)
        : extname(entry.name) === '.glb' ? [relative] : [];
    });
  return glbs(ASSET_DIR)
    .sort()
    .map((file) => {
      const slug = basename(file, '.glb');
      const versioned = /^(.+)-v(\d+)$/.exec(slug);
      const names = clipNamesOf(resolve(ASSET_DIR, file));
      return {
        // Filled in below: kind is a property of the family, not the file.
        kind: 'prop' as CatalogEntry['kind'],
        slug,
        url: `/assets/${file}`,
        base: versioned ? versioned[1] : slug,
        version: versioned ? Number(versioned[2]) : null,
        runtime: runtime.has(slug),
        bytes: statSync(resolve(ASSET_DIR, file)).size,
        clips: names.map((name) => ({ name, role: roleOf(name) })),
        performances: performanceClipNames(names),
      };
    })
    .map((entry, _index, all) => ({ ...entry, kind: kindOf(entry, all) }));
}

/**
 * What sort of model this is — decided per **family**, not per file.
 *
 * Equipment is addressed by directory, because the equipment registry addresses
 * it that way. Everything else turns on whether the family carries a locomotion
 * clip, which is the honest definition of a character: a thing that can stand
 * and walk.
 *
 * The family, not the file, is what makes it right. `albert-v01` through `-v03`
 * predate the rig and carry no clips at all; asked file by file they classify as
 * props and sit in the catalog beside `bench`, which is nonsense — they are
 * early drafts of a character. A family is one subject, and its versions are
 * attempts at that subject.
 */
function kindOf(entry: CatalogEntry, all: readonly CatalogEntry[]): CatalogEntry['kind'] {
  if (entry.url.startsWith('/assets/equipment/')) return 'equipment';
  const animated = all.some((candidate) => candidate.base === entry.base
    && candidate.clips.some((clip) => clip.role === 'locomotion'));
  return animated ? 'character' : 'prop';
}

/**
 * Backs `/models` with a listing of every GLB on disk.
 *
 * The list is read from the filesystem rather than hand-maintained, so a model
 * authored today shows up in the lab without a code change — the same reason
 * the cast viewer loads live GLBs instead of captured stills. In dev the
 * listing is computed per request so a fresh export appears on reload; for a
 * build it is frozen into `models/manifest.json` beside the page, since a
 * static host has no directory to scan.
 */
function modelCatalog(): Plugin {
  const ROUTE = '/models/manifest.json';
  return {
    name: 'postmark-model-catalog',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || (req.url !== ROUTE && !req.url.startsWith(ROUTE + '?'))) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(readCatalog()));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'models/manifest.json',
        source: JSON.stringify(readCatalog(), null, 2),
      });
    },
  };
}

const PIECE_DIR = resolve(process.cwd(), 'src/world/island/pieces');

/**
 * Backs `/acre` with read and write access to `src/world/island/pieces/*.acre`.
 *
 * **`configureServer` only, deliberately.** There is no preview hook and no
 * `generateBundle`, so no build output can contain a write path — a level
 * editor that ships is a level editor someone points at a production host.
 *
 * Writes go through `parseAcre` then `formatAcre`, so a file on disk is always
 * canonical and always parses: the editor cannot save something the loader
 * would then reject, and a rejected `PUT` names the line like every other acre
 * error does.
 */
function acrePiecesApi(): Plugin {
  const ROUTE = '/acre/pieces';
  const pieceFile = (id: string, group?: string): string => {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`"${id}" is not a legal piece id`);
    if (group !== undefined && group !== 'unsorted') {
      if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(group)) throw new Error(`"${group}" is not a legal group`);
      return resolve(PIECE_DIR, group, `${id}.acre`);
    }
    return resolve(PIECE_DIR, `${id}.acre`);
  };
  /**
   * Every `.acre` on disk, at any depth.
   *
   * Folders are the palette's organization (`PieceLibrary.pieceGroup`), so the
   * listing walks them and reports the group beside each piece. A piece loose in
   * `pieces/` is `unsorted`.
   */
  const walk = (dir: string, prefix = ''): { file: string; group: string }[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return walk(join(dir, entry.name), rel);
      return extname(entry.name) === '.acre'
        ? [{ file: rel, group: prefix || 'unsorted' }]
        : [];
    });

  const listing = (): unknown[] => walk(PIECE_DIR)
    .sort((a, b) => (a.file < b.file ? -1 : 1))
    .map(({ file, group }) => {
      const text = readFileSync(resolve(PIECE_DIR, file), 'utf8');
      const piece = parseAcre(text, file);
      return {
        id: piece.id,
        file,
        group,
        family: piece.family,
        weight: piece.weight,
        tags: piece.tags,
        rotatable: piece.rotatable,
        offset: piece.offset ?? null,
        bytes: text.length,
      };
    });

  /** Where a piece currently lives, or null if it is not on disk yet. */
  const findFile = (id: string): string | null =>
    walk(PIECE_DIR).find(({ file }) => basename(file, '.acre') === id)?.file ?? null;

  return {
    name: 'postmark-acre-pieces-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== ROUTE && !url.startsWith(ROUTE + '/')) return next();
        const id = url === ROUTE ? '' : decodeURIComponent(url.slice(ROUTE.length + 1));
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const fail = (error: unknown): void => send(400, { error: String((error as Error).message ?? error) });
        try {
          if (req.method === 'GET' && id === '') return send(200, listing());
          if (req.method === 'GET') {
            const found = findFile(id);
            if (!found) throw new Error(`no piece "${id}" on disk`);
            const text = readFileSync(resolve(PIECE_DIR, found), 'utf8');
            return send(200, { id, text, group: dirname(found) === '.' ? 'unsorted' : dirname(found) });
          }
          if (req.method === 'PUT') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as { text?: string; group?: string };
                const existing = findFile(id);
                const text = payload.text
                  ?? (existing ? readFileSync(resolve(PIECE_DIR, existing), 'utf8') : '');
                const piece = parseAcre(text, `${id}.acre`);
                if (piece.id !== id) throw new Error(`piece says id "${piece.id}" but was PUT to "${id}"`);
                const canonical = formatAcre(piece);
                const target = pieceFile(id, payload.group);
                mkdirSync(dirname(target), { recursive: true });
                writeFileSync(target, canonical);
                // A move is a write to the new path and an unlink of the old, so
                // a failed write leaves the piece where it was rather than
                // nowhere. Filing is reorganisation, and reorganisation must
                // never be able to lose an acre.
                if (existing && resolve(PIECE_DIR, existing) !== target) {
                  unlinkSync(resolve(PIECE_DIR, existing));
                }
                send(200, { id, text: canonical, group: payload.group ?? 'unsorted' });
              } catch (error) { fail(error); }
            });
            return;
          }
          if (req.method === 'DELETE') {
            const found = findFile(id);
            if (!found) throw new Error(`no piece "${id}" on disk`);
            unlinkSync(resolve(PIECE_DIR, found));
            return send(200, { id, deleted: true });
          }
          return send(405, { error: `${req.method} not allowed on ${url}` });
        } catch (error) {
          return fail(error);
        }
      });
    },
  };
}

const TEMPLATE_DIR = resolve(process.cwd(), 'src/world/island/templates');

/**
 * Backs `/island` with read and write access to `src/world/island/templates/*.island`.
 *
 * The same shape and the same constraint as `acrePiecesApi`: `configureServer`
 * only, so no build output can carry a write path. Unlike the piece API this one
 * does **not** re-canonicalise on save — a template is written by the editor
 * from its own model and `formatIsland` is already the only writer, so parsing
 * it back would be a round trip through the same function.
 */
function islandTemplatesApi(): Plugin {
  const ROUTE = '/island/templates';
  const file = (id: string): string => {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`"${id}" is not a legal template id`);
    return resolve(TEMPLATE_DIR, `${id}.island`);
  };
  const listing = (): unknown[] => {
    try {
      return readdirSync(TEMPLATE_DIR)
        .filter((name) => extname(name) === '.island')
        .sort()
        .map((name) => {
          const text = readFileSync(resolve(TEMPLATE_DIR, name), 'utf8');
          const id = /^#\s*id:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? basename(name, '.island');
          const label = /^#\s*name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? id;
          const acres = text.split('\n')
            .filter((line) => !line.startsWith('#') && line.trim().length > 0)
            .join(' ').split(/\s+/).filter((t) => t.length > 0 && t !== '..').length;
          return { id, file: name, name: label, acres, bytes: text.length };
        });
    } catch {
      return [];
    }
  };

  return {
    name: 'postmark-island-templates-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== ROUTE && !url.startsWith(ROUTE + '/')) return next();
        const id = url === ROUTE ? '' : decodeURIComponent(url.slice(ROUTE.length + 1));
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const fail = (error: unknown): void => send(400, { error: String((error as Error).message ?? error) });
        try {
          if (req.method === 'GET' && id === '') return send(200, listing());
          if (req.method === 'GET') return send(200, { id, text: readFileSync(file(id), 'utf8') });
          if (req.method === 'PUT') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const text = (JSON.parse(body) as { text: string }).text;
                mkdirSync(TEMPLATE_DIR, { recursive: true });
                writeFileSync(file(id), text);
                send(200, { id, bytes: text.length });
              } catch (error) { fail(error); }
            });
            return;
          }
          if (req.method === 'DELETE') {
            unlinkSync(file(id));
            return send(200, { id, deleted: true });
          }
          return send(405, { error: `${req.method} not allowed on ${url}` });
        } catch (error) {
          return fail(error);
        }
      });
    },
  };
}

function authoredAssetReload(): Plugin {
  return {
    name: 'postmark-authored-asset-reload',
    configureServer(server) {
      const assetPattern = resolve(process.cwd(), 'public/assets/**/*.glb');
      server.watcher.add(assetPattern);
      server.watcher.on('change', (file) => {
        if (extname(file) !== '.glb') return;
        server.ws.send({ type: 'full-reload', path: '*' });
      });
    },
  };
}

const SCENE_DIR = resolve(process.cwd(), 'src/cutscene/scenes');

/**
 * Backs `/scene` with read and write access to `src/cutscene/scenes/*.scene`.
 *
 * Same shape and same constraint as `acrePiecesApi`: `configureServer` only, no
 * preview hook and no `generateBundle`, so no build output can contain a write
 * path. A cutscene editor that ships is a cutscene editor someone points at a
 * production host.
 *
 * Writes round-trip through `parseScene` then `formatScene`, so a file on disk
 * always parses and is always canonical — the editor cannot save staging the
 * runtime would then reject, and a rejected `PUT` names the line.
 */
function cutsceneScenesApi(): Plugin {
  const ROUTE = '/scene/scenes';
  const sceneFile = (id: string): string => {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`"${id}" is not a legal scene id`);
    return resolve(SCENE_DIR, `${id}.scene`);
  };
  const listing = (): unknown[] => {
    try {
      return readdirSync(SCENE_DIR)
        .filter((name) => extname(name) === '.scene')
        .sort()
        .map((name) => {
          const text = readFileSync(resolve(SCENE_DIR, name), 'utf8');
          const scene = parseScene(text, name);
          return {
            id: scene.id,
            file: name,
            sets: scene.sets,
            note: scene.note ?? null,
            beats: scene.beats.map((beat) => beat.id),
            shots: scene.shots.length,
            actors: scene.actors.length,
            bytes: text.length,
          };
        });
    } catch (error) {
      // Reported rather than swallowed. An empty list used to be the only
      // symptom of a scene that stopped parsing, which made a format change
      // look like an editor that had forgotten how to fetch.
      return [{ error: String((error as Error).message ?? error) }];
    }
  };

  return {
    name: 'postmark-cutscene-scenes-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== ROUTE && !url.startsWith(ROUTE + '/')) return next();
        const id = url === ROUTE ? '' : decodeURIComponent(url.slice(ROUTE.length + 1));
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const fail = (error: unknown): void => send(400, { error: String((error as Error).message ?? error) });
        try {
          if (req.method === 'GET' && id === '') return send(200, listing());
          if (req.method === 'GET') {
            const text = readFileSync(sceneFile(id), 'utf8');
            // Parse on read too: a hand-edit that broke the file should be
            // reported when the editor opens it, not when it tries to save.
            parseScene(text, `${id}.scene`);
            return send(200, { id, text });
          }
          if (req.method === 'PUT') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as { text?: string };
                const scene = parseScene(payload.text ?? '', `${id}.scene`);
                if (scene.id !== id) {
                  throw new Error(`scene says id "${scene.id}" but was PUT to "${id}"`);
                }
                const canonical = formatScene(scene);
                mkdirSync(SCENE_DIR, { recursive: true });
                writeFileSync(sceneFile(id), canonical);
                send(200, { id, text: canonical });
              } catch (error) { fail(error); }
            });
            return;
          }
          return send(405, { error: `${req.method} not allowed on ${url}` });
        } catch (error) {
          return fail(error);
        }
      });
    },
  };
}

const SET_DIR = resolve(process.cwd(), 'src/cutscene/sets');

/**
 * Backs `/scene` with read and write access to `src/cutscene/sets/*.set`.
 *
 * A clone of `cutsceneScenesApi` down to the constraint: `configureServer`
 * only, so no build output can carry a write path. Same round trip through
 * `parseSet` then `formatSet`, so a set on disk always parses and is always
 * canonical, and a rejected `PUT` names the line.
 */
function cutsceneSetsApi(): Plugin {
  const ROUTE = '/scene/sets';
  const setFile = (id: string): string => {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`"${id}" is not a legal set id`);
    return resolve(SET_DIR, `${id}.set`);
  };
  const listing = (): unknown[] => {
    try {
      return readdirSync(SET_DIR)
        .filter((name) => extname(name) === '.set')
        .sort()
        .map((name) => {
          const text = readFileSync(resolve(SET_DIR, name), 'utf8');
          const set = parseSet(text, name);
          return {
            id: set.id,
            file: name,
            name: set.name ?? null,
            note: set.note ?? null,
            anchor: set.anchor.landmark,
            marks: [...set.marks, ...set.seats].map((mark) => mark.id),
            props: set.props.length,
            bytes: text.length,
          };
        });
    } catch {
      return [];
    }
  };

  return {
    name: 'postmark-cutscene-sets-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== ROUTE && !url.startsWith(ROUTE + '/')) return next();
        const id = url === ROUTE ? '' : decodeURIComponent(url.slice(ROUTE.length + 1));
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const fail = (error: unknown): void => send(400, { error: String((error as Error).message ?? error) });
        try {
          if (req.method === 'GET' && id === '') return send(200, listing());
          if (req.method === 'GET') {
            const text = readFileSync(setFile(id), 'utf8');
            parseSet(text, `${id}.set`);
            return send(200, { id, text });
          }
          if (req.method === 'PUT') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as { text?: string };
                const set = parseSet(payload.text ?? '', `${id}.set`);
                if (set.id !== id) {
                  throw new Error(`set says id "${set.id}" but was PUT to "${id}"`);
                }
                const canonical = formatSet(set);
                mkdirSync(SET_DIR, { recursive: true });
                writeFileSync(setFile(id), canonical);
                send(200, { id, text: canonical });
              } catch (error) { fail(error); }
            });
            return;
          }
          return send(405, { error: `${req.method} not allowed on ${url}` });
        } catch (error) {
          return fail(error);
        }
      });
    },
  };
}

const TAKE_DIR = resolve(process.cwd(), 'docs/review-queue/takes');

/**
 * Backs `/scene`'s take recorder with a folder of frames per take.
 *
 * A take is what this project's review process already runs on — the jury rule
 * means a human has to look, and looking has meant a directory of stills under
 * `docs/review-queue/` produced by a capture script out of band. This puts the
 * same artifact one button away from the edit that produced it, so the loop is
 * "change the shot, record, compare against the last one you liked" instead of
 * "change the shot, go to a terminal, wait".
 *
 * Frames arrive as data URLs and are written as ordinary image files, so a take
 * is browsable in Finder and attachable to a review without this editor. Same
 * `configureServer`-only constraint as every other write path here: no build
 * output can carry it.
 */
function cutsceneTakesApi(): Plugin {
  const ROUTE = '/scene/takes';
  const legal = (part: string): string => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(part)) throw new Error(`"${part}" is not a legal take path`);
    return part;
  };
  interface TakeManifest {
    scene: string;
    take: string;
    recorded: string;
    map: string;
    fps: number;
    width: number;
    height: number;
    frames: string[];
    note: string;
    range: { from: string; to: string };
  }
  const manifestOf = (scene: string, take: string): TakeManifest | null => {
    try {
      return JSON.parse(
        readFileSync(resolve(TAKE_DIR, scene, take, 'take.json'), 'utf8'),
      ) as TakeManifest;
    } catch {
      return null;
    }
  };
  const listing = (scene: string): unknown[] => {
    try {
      return readdirSync(resolve(TAKE_DIR, scene), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => manifestOf(scene, entry.name))
        .filter((manifest): manifest is TakeManifest => manifest !== null)
        // Newest first: the take you want to compare against is almost always
        // the last one you liked, not the first one you ever shot.
        .sort((a, b) => (a.recorded < b.recorded ? 1 : -1));
    } catch {
      return [];
    }
  };

  return {
    name: 'postmark-scene-takes-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== ROUTE && !url.startsWith(ROUTE + '/')) return next();
        const parts = url.slice(ROUTE.length).split('/').filter(Boolean).map(decodeURIComponent);
        const send = (code: number, body: unknown): void => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const fail = (error: unknown): void => send(400, { error: String((error as Error).message ?? error) });
        try {
          if (req.method === 'GET' && parts.length === 1) {
            return send(200, listing(legal(parts[0])));
          }
          if (req.method === 'GET' && parts.length === 3) {
            // Served from here rather than left to Vite's static handling: a
            // take lives in `docs/`, which is outside anything the dev server
            // promises to serve, and an A/B compare that works only because of
            // an incidental path resolution is one config change from breaking.
            const [scene, take, frame] = parts;
            if (!/^[0-9]{4}\.(webp|png|jpeg|jpg)$/.test(frame)) {
              throw new Error(`"${frame}" is not a take frame`);
            }
            const file = resolve(TAKE_DIR, legal(scene), legal(take), frame);
            const type = frame.endsWith('.webp') ? 'image/webp'
              : frame.endsWith('.png') ? 'image/png' : 'image/jpeg';
            res.statusCode = 200;
            res.setHeader('Content-Type', type);
            res.setHeader('Cache-Control', 'no-store');
            res.end(readFileSync(file));
            return;
          }
          if (req.method === 'POST' && parts.length === 1) {
            const scene = legal(parts[0]);
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as {
                  frames?: string[]; fps?: number; width?: number; height?: number;
                  map?: string; note?: string; range?: { from: string; to: string };
                };
                const frames = payload.frames ?? [];
                if (!frames.length) throw new Error('a take with no frames is not a take');
                // Named by the instant it was shot, so takes sort by time on
                // disk as well as in the listing and two recordings a second
                // apart cannot collide.
                const take = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const dir = resolve(TAKE_DIR, scene, take);
                mkdirSync(dir, { recursive: true });
                const names: string[] = [];
                frames.forEach((frame, index) => {
                  const match = /^data:image\/(\w+);base64,(.+)$/.exec(frame);
                  if (!match) throw new Error(`frame ${index} is not a data URL`);
                  const name = `${String(index).padStart(4, '0')}.${match[1]}`;
                  writeFileSync(resolve(dir, name), Buffer.from(match[2], 'base64'));
                  names.push(name);
                });
                const manifest: TakeManifest = {
                  scene,
                  take,
                  recorded: new Date().toISOString(),
                  map: payload.map ?? 'unknown',
                  fps: payload.fps ?? 12,
                  width: payload.width ?? 480,
                  height: payload.height ?? 360,
                  frames: names,
                  note: payload.note ?? '',
                  range: payload.range ?? { from: '', to: '' },
                };
                writeFileSync(resolve(dir, 'take.json'), JSON.stringify(manifest, null, 2));
                send(200, manifest);
              } catch (error) { fail(error); }
            });
            return;
          }
          if (req.method === 'DELETE' && parts.length === 2) {
            const dir = resolve(TAKE_DIR, legal(parts[0]), legal(parts[1]));
            for (const name of readdirSync(dir)) unlinkSync(resolve(dir, name));
            rmdirSync(dir);
            return send(200, { deleted: true });
          }
          return send(405, { error: `${req.method} not allowed on ${url}` });
        } catch (error) {
          return fail(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    wikiRoute(), modelCatalog(), acrePiecesApi(), islandTemplatesApi(),
    cutsceneScenesApi(), cutsceneSetsApi(), cutsceneTakesApi(), authoredAssetReload(),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin/index.html',
        wiki: 'wiki/index.html',
        review: 'review/index.html',
        characters: 'characters/index.html',
        islandContract: 'island-contract/index.html',
        island: 'island/index.html',
        story: 'story/index.html',
        verbs: 'verbs/index.html',
        weather: 'weather/index.html',
        models: 'models/index.html',
        audio: 'audio/index.html',
        acre: 'acre/index.html',
        scene: 'scene/index.html',
        water: 'water/index.html',
        grass: 'grass/index.html',
        sky: 'sky/index.html',
      },
    },
  },
});
