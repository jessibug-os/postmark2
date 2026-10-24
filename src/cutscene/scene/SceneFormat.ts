/**
 * The `.scene` text format — reading and writing an authored cutscene.
 *
 * Same bargain as `.acre`: a reviewer opening a diff should see the staging
 * that changed, not a wall of JSON. A cutscene is mostly names and numbers —
 * who stands where, what the camera looks at, which line is said — and those
 * read well as text and merge badly as serialized objects.
 *
 *   # scene: kindly-opening
 *   # set: ferry
 *   # set: post-office
 *
 *   shot  two-shot  between player recruit  dist 6.4 pitch 17 az 62 axis actors
 *   actor recruit   at deck.recruit facing deck.player
 *
 *   beat greeting
 *     @0.0  camera two-shot over 1.0
 *     @0.4  say recruit OPENING.recruitOrdinary
 *
 * **Beats, not a wall clock.** Industry sequencers (Unreal's Sequencer, Unity's
 * Timeline) lay cues on absolute time, which works because their cutscenes run
 * to a fixed length. Ours cannot: dialogue blocks until the player dismisses
 * it, so every line makes the rest of the scene later by an unknowable amount.
 * A beat is therefore a bundle of cues that start together at their `@offset`
 * and finish when the slowest of them is done — parallelism where the timeline
 * needs it, and sequencing that survives a player who reads slowly.
 *
 * **A scene defines no marks.** They belong to the `.set` files it names, and
 * a scene only ever refers to them. That is what lets one scene play on any
 * island — the marks move with the set as it is seated — and, later, one set
 * host more than one scene. It also means `parseScene` cannot check a mark
 * name on its own: `validateAgainstSets` is the second half of validation, run
 * wherever the sets are actually available.
 *
 * Strict on purpose, and every error names a line. A scene that parses into
 * the wrong shape is a camera inside a wall several beats later.
 */

/** A point in the set's own space. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * What a shot is composed against.
 *
 * `world` is the rig's own zero (due south) and is almost never what you want.
 * `actors` measures the angle from the line between the shot's targets — a
 * three-quarter stays a three-quarter wherever the beat plays. `aperture`
 * measures it from the set's own forward axis, for shots that must look
 * through a door or a window: composed against the actors instead, the camera
 * swings off the axis and plays the scene against a wall.
 */
export type ShotAxis = 'world' | 'actors' | 'aperture';

/**
 * The curves a `camera` cue may be eased on.
 *
 * `inout` is the default and the one the rig applied unconditionally before the
 * field existed, so an omitted ease means exactly what every scene authored
 * without one already meant.
 */
export const CAMERA_EASES = ['linear', 'in', 'out', 'inout'] as const;

export type CameraEase = (typeof CAMERA_EASES)[number];

export const DEFAULT_EASE: CameraEase = 'inout';

/** The ease a camera cue asks for. Reads the optional tail, defaults to inout. */
export function cueEase(args: readonly string[]): CameraEase {
  const named = args[3] === 'ease' ? args[4] : undefined;
  return (CAMERA_EASES as readonly string[]).includes(named ?? '')
    ? (named as CameraEase)
    : DEFAULT_EASE;
}

export interface SceneShot {
  id: string;
  /** `on` frames one target; `between` frames the line between two. */
  framing: 'on' | 'between';
  targets: string[];
  distance: number;
  pitch: number;
  azimuth: number;
  /** Vertical offset of the framed point, roughly eye height. */
  lift: number;
  axis: ShotAxis;
  /** For `between`: where along the line the frame sits. 0.5 is the midpoint. */
  bias: number;
  line: number;
}

export interface SceneActor {
  id: string;
  at: string;
  facing?: string;
  line: number;
}

export interface SceneCue {
  /** Seconds after the beat starts. */
  at: number;
  verb: CueVerb;
  args: string[];
  line: number;
}

export interface SceneBeat {
  id: string;
  cues: SceneCue[];
  /**
   * Free prose written directly above the beat.
   *
   * Preserved through the round trip on purpose. A cutscene's hardest-won
   * knowledge is why a beat is staged the way it is — that a shot must stay on
   * the door axis, that an empty frame has to rhyme with the full one — and a
   * formatter that discarded it would quietly delete the reasoning every time
   * the editor saved.
   */
  note?: string;
  line: number;
}

export interface Scene {
  id: string;
  /**
   * The sets this scene is staged in, in the order it uses them.
   *
   * More than one because the opening is: it starts on the ferry and finishes
   * in the post office, and cutting between two places is ordinary film
   * grammar rather than a special case worth a second scene file.
   */
  sets: string[];
  note?: string;
  shots: SceneShot[];
  actors: SceneActor[];
  beats: SceneBeat[];
}

export class SceneParseError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'SceneParseError';
  }
}

/**
 * The cue vocabulary, with how many arguments each verb takes.
 *
 * Validated at parse time rather than when the director reaches the cue. A
 * misspelled verb should be a line number in the editor, not a scene that
 * plays three beats and then stops.
 */
export const CUE_VERBS = {
  /**
   * `camera <shot> over <seconds> [ease <curve>]` — move the rig onto a shot.
   *
   * The ease is optional and defaults to `inout`, which is the curve the rig
   * has always applied. Made authorable rather than fixed because the curve is
   * a compositional choice: a push-in that starts and stops softly reads as
   * operated, and a whip-pan that does the same reads as apologetic. Optional
   * rather than required so that every scene authored before it stays
   * byte-identical — `formatScene` omits the default.
   */
  camera: { min: 3, max: 5, usage: 'camera <shot> over <seconds> [ease linear|in|out|inout]' },
  /** `say <actor> <lineId>` — blocks until the player advances. */
  say: { min: 2, max: 2, usage: 'say <actor> <line-id>' },
  /** `fade in|out <seconds>` — DOM veil, for covering a cut. */
  fade: { min: 2, max: 2, usage: 'fade in|out <seconds>' },
  /** `fog <near> <far> <seconds>` — rendered scene fog, never a DOM wash. */
  fog: { min: 3, max: 3, usage: 'fog <near> <far> <seconds>' },
  /** `hold <seconds>` — a deliberate pause on the current frame. */
  hold: { min: 1, max: 1, usage: 'hold <seconds>' },
  /** `move <actor> to <mark> over <seconds>` */
  move: { min: 5, max: 5, usage: 'move <actor> to <mark> over <seconds>' },
  /** `face <actor> <mark>` */
  face: { min: 2, max: 2, usage: 'face <actor> <mark>' },
  /** `show <actor>` / `hide <actor>` */
  show: { min: 1, max: 1, usage: 'show <actor>' },
  hide: { min: 1, max: 1, usage: 'hide <actor>' },
  /** `pose <actor> <pose>` — swap an authored static pose (seated/standing). */
  pose: { min: 2, max: 2, usage: 'pose <actor> <pose>' },
  /** `mood <actor> <mood> <seconds>` — face/expression state. */
  mood: { min: 3, max: 3, usage: 'mood <actor> <mood> <seconds>' },
  /**
   * `control to <mark> radius <metres>` — hand the player their character and
   * block until they arrive. The one cue that cannot be timed, which is the
   * point of it.
   */
  control: { min: 4, max: 4, usage: 'control to <mark> radius <metres>' },
  /** `layer <name> <level> <seconds>` — music bed. */
  layer: { min: 3, max: 3, usage: 'layer <name> <level> <seconds>' },
  /** `sfx <name>` */
  sfx: { min: 1, max: 1, usage: 'sfx <name>' },
  /**
   * `ask <prompt>` — put a named prompt to the player and block on the answer.
   *
   * The opening's assignment card is the only one today: the player names
   * their postmaster and their island, and the recruit's warning quotes the
   * island back. Blocking like `say` and `control`, and for the same reason —
   * how long someone takes to type is not an authorable duration.
   */
  ask: { min: 1, max: 1, usage: 'ask <prompt>' },
  /**
   * `strike <set>` — remove a set's geometry from the world.
   *
   * Named after the stagehands' word, and it means the same thing: the ferry
   * has to leave once the fog has taken it, or it stands in the bay for the
   * rest of the game. A set the scene never strikes stays — which is what the
   * post office does on purpose, because the reveal location has to still be
   * there when the player is asked to help reopen it.
   */
  strike: { min: 1, max: 1, usage: 'strike <set>' },
  /**
   * `choice <id>` — put a named choice to the player and block on the answer.
   *
   * Blocking like `say` and `ask`, and for a stronger version of the same
   * reason: deciding is the point of the cue, so it has no duration anyone
   * could author. The answer is kept under the choice's id and read back by
   * the reply lines — see `OPENING_CHOICES`, which also explains why no choice
   * in this opening changes where the scene goes.
   */
  choice: { min: 1, max: 1, usage: 'choice <choice-id>' },
  /**
   * `bed <name> <level> <rate> over <seconds>` — a sustained diegetic sound.
   *
   * The third audio verb, and the only one that is not music. `layer` moves
   * parts of the score and `sfx` fires a one-shot; a bed belongs to the
   * *world*, runs for as long as a scene wants it, and can be driven somewhere
   * — which is the whole reason it takes a rate. `/story` asks the mist beat
   * for an engine that "stretches", and a bed that could only fade would read
   * as somebody turning the volume down rather than as a machine going wrong.
   *
   * Two beds today: `engine` for the crossing and `keeper` for the thing at
   * the spring. It shipped as a bare `engine` verb with a note saying to
   * generalise when a second one arrived, and this is that.
   */
  bed: { min: 5, max: 5, usage: 'bed <name> <level> <rate> over <seconds>' },
  /**
   * `theme <name>` — hand the score to a named theme.
   *
   * The companion to `clock`, and authored for the same reason: the opening
   * crosses from an ordinary afternoon into dusk into whatever the Keeper is,
   * and it was doing all of that over a single theme chosen once at boot. A
   * cue rather than a constant because *when* the music turns is staging —
   * the light drains across three passenger stops and the score should drain
   * with it, on the same beats.
   *
   * `AudioSystem.setTheme` crossfades, so a change lands as a turn rather than
   * a cut. The names are the authored themes: `day`, `dusk`, `night` and the
   * rest of `THEMES`.
   */
  theme: { min: 1, max: 1, usage: 'theme <name>' },
  /**
   * `clock <hour> over <seconds>` — run the world's light to an authored hour.
   *
   * The opening crosses a fog the player loses consciousness in, and until this
   * existed it came out the other side at the same time of morning it went in.
   * That is not a continuity nit: the whole back half is a grieving scene, and
   * it was playing in flat ten-o'clock daylight because the light was a
   * property of when the player pressed New Game rather than of the story.
   *
   * A cue rather than a constant in `startNewGame`, because *when* the light
   * changes is staging — it happens behind the veil, on the cut, and a scene
   * that could not say so would have to change the light in front of the
   * player or not at all.
   */
  clock: { min: 3, max: 3, usage: 'clock <hour> over <seconds>' },
  /**
   * `wisp lead to <mark>` / `wisp into <actor>` / `wisp away` — the guiding light.
   *
   * `lead` is non-blocking on purpose: it sets the light going and the
   * `control` cue in the same beat is what actually waits, so the walk and the
   * thing leading it are one beat rather than two. `into` blocks, because what
   * it resolves on is the light going out — and the beat after it is the one
   * where the body it went into moves.
   */
  wisp: { min: 1, max: 3, usage: 'wisp lead to <mark> | wisp into <actor> | wisp away' },
  /** `title <text>` — the card. Text may contain spaces. */
  title: { min: 1, max: 64, usage: 'title <text...>' },
} as const;

export type CueVerb = keyof typeof CUE_VERBS;

/** Literal connector words each verb requires, as [argument index, word]. */
const CUE_CONNECTORS: Partial<Record<CueVerb, Array<[number, string]>>> = {
  camera: [[1, 'over']],
  move: [[1, 'to'], [3, 'over']],
  control: [[0, 'to'], [2, 'radius']],
  clock: [[1, 'over']],
  bed: [[3, 'over']],
};

const NAME = /^[a-z0-9][a-z0-9._-]*$/i;

function number(token: string, field: string, file: string, line: number): number {
  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new SceneParseError(file, line, `${field} expects a number, got "${token}"`);
  }
  return value;
}

function name(token: string, field: string, file: string, line: number): string {
  if (!NAME.test(token)) {
    throw new SceneParseError(file, line, `${field} "${token}" is not a legal name`);
  }
  return token;
}

/**
 * Pull `key value` pairs off the tail of a declaration.
 *
 * Keeps `shot` lines readable in any order — `dist 6.4 pitch 17` and
 * `pitch 17 dist 6.4` are the same shot, and neither is a positional puzzle.
 */
function options(
  tokens: string[],
  allowed: string[],
  file: string,
  line: number,
): Record<string, string> {
  const found: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i += 2) {
    const key = tokens[i];
    if (!allowed.includes(key)) {
      throw new SceneParseError(file, line, `unknown option "${key}" (expected ${allowed.join(', ')})`);
    }
    if (i + 1 >= tokens.length) {
      throw new SceneParseError(file, line, `option "${key}" has no value`);
    }
    found[key] = tokens[i + 1];
  }
  return found;
}

/** Parse one `.scene` file. */
export function parseScene(text: string, file = '<scene>'): Scene {
  const lines = text.split('\n');
  const sets: string[] = [];
  const shots: SceneShot[] = [];
  const actors: SceneActor[] = [];
  const beats: SceneBeat[] = [];
  let id: string | undefined;
  let note: string | undefined;
  let beat: SceneBeat | null = null;
  let pendingNote: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Header and comments. `# key: value` sets a field; anything else is prose.
    if (trimmed.startsWith('#')) {
      const header = /^#\s*([a-z]+):\s*(.*)$/i.exec(trimmed);
      if (!header) {
        // Prose. Held in case the next declaration is a beat, which adopts it.
        pendingNote.push(trimmed.replace(/^#\s?/, ''));
        continue;
      }
      const [, key, value] = header;
      if (key === 'scene') id = name(value.trim(), 'scene', file, line);
      else if (key === 'set') {
        const setId = name(value.trim(), 'set', file, line);
        if (sets.includes(setId)) {
          throw new SceneParseError(file, line, `duplicate set "${setId}"`);
        }
        sets.push(setId);
      }
      else if (key === 'note') note = value.trim();
      continue;
    }

    const tokens = trimmed.split(/\s+/);
    const keyword = tokens[0];
    // Prose only attaches to a beat directly beneath it; anything else clears it.
    if (keyword !== 'beat') pendingNote = [];

    // A cue belongs to the beat it is indented under.
    if (keyword.startsWith('@')) {
      if (!beat) throw new SceneParseError(file, line, 'cue outside any beat');
      const at = number(keyword.slice(1), 'cue offset', file, line);
      if (at < 0) throw new SceneParseError(file, line, 'cue offset cannot be negative');
      const verb = tokens[1];
      if (!verb) throw new SceneParseError(file, line, 'cue has no verb');
      if (!(verb in CUE_VERBS)) {
        throw new SceneParseError(file, line, `unknown cue verb "${verb}"`);
      }
      const spec = CUE_VERBS[verb as CueVerb];
      const args = tokens.slice(2);
      if (args.length < spec.min || args.length > spec.max) {
        throw new SceneParseError(file, line, `${verb} takes ${spec.usage}`);
      }
      // Connector words are part of the grammar, not decoration: without this
      // `move a from m over 1` parses happily and then means nothing.
      for (const [position, word] of CUE_CONNECTORS[verb as CueVerb] ?? []) {
        if (args[position] !== word) {
          throw new SceneParseError(file, line, `${verb} takes ${spec.usage}`);
        }
      }
      // The camera's optional ease is a whole clause, so it is present or
      // absent — never half-written. Checked here rather than as a connector
      // because connectors are unconditional and this one is not.
      if (verb === 'camera' && args.length !== 3) {
        if (args.length !== 5 || args[3] !== 'ease') {
          throw new SceneParseError(file, line, `camera takes ${spec.usage}`);
        }
        if (!(CAMERA_EASES as readonly string[]).includes(args[4])) {
          throw new SceneParseError(
            file, line, `unknown ease "${args[4]}" (expected ${CAMERA_EASES.join(', ')})`,
          );
        }
      }
      beat.cues.push({ at, verb: verb as CueVerb, args, line });
      continue;
    }

    switch (keyword) {
      case 'shot': {
        const shotId = name(tokens[1] ?? '', 'shot', file, line);
        const framing = tokens[2];
        if (framing !== 'on' && framing !== 'between') {
          throw new SceneParseError(file, line, `shot framing must be "on" or "between", got "${framing}"`);
        }
        const targetCount = framing === 'on' ? 1 : 2;
        // Targets run until the first option keyword. Slicing a fixed count
        // instead lets `shot s between m dist 4` eat "dist" as a second target
        // and then report a baffling error about the option "4".
        const SHOT_OPTIONS = ['dist', 'pitch', 'az', 'lift', 'axis', 'bias'];
        const rest = tokens.slice(3);
        const optionAt = rest.findIndex((token) => SHOT_OPTIONS.includes(token));
        const targets = optionAt === -1 ? rest : rest.slice(0, optionAt);
        if (targets.length !== targetCount) {
          throw new SceneParseError(
            file,
            line,
            `shot "${shotId}" (${framing}) needs ${targetCount} target(s), got ${targets.length}`,
          );
        }
        const opts = options(
          optionAt === -1 ? [] : rest.slice(optionAt),
          SHOT_OPTIONS,
          file,
          line,
        );
        if (opts.dist === undefined) {
          throw new SceneParseError(file, line, `shot "${shotId}" needs a dist`);
        }
        const axis = (opts.axis ?? 'actors') as ShotAxis;
        if (axis !== 'world' && axis !== 'actors' && axis !== 'aperture') {
          throw new SceneParseError(file, line, `unknown axis "${opts.axis}"`);
        }
        shots.push({
          id: shotId,
          framing,
          targets,
          distance: number(opts.dist, 'dist', file, line),
          pitch: opts.pitch === undefined ? 30 : number(opts.pitch, 'pitch', file, line),
          azimuth: opts.az === undefined ? 0 : number(opts.az, 'az', file, line),
          lift: opts.lift === undefined ? 1.2 : number(opts.lift, 'lift', file, line),
          axis,
          bias: opts.bias === undefined ? 0.5 : number(opts.bias, 'bias', file, line),
          line,
        });
        break;
      }
      case 'actor': {
        const actorId = name(tokens[1] ?? '', 'actor', file, line);
        const opts = options(tokens.slice(2), ['at', 'facing'], file, line);
        if (!opts.at) throw new SceneParseError(file, line, `actor "${actorId}" needs an "at" mark`);
        actors.push({ id: actorId, at: opts.at, facing: opts.facing, line });
        break;
      }
      case 'beat': {
        const beatId = name(tokens[1] ?? '', 'beat', file, line);
        if (beats.some((existing) => existing.id === beatId)) {
          throw new SceneParseError(file, line, `duplicate beat "${beatId}"`);
        }
        beat = {
          id: beatId,
          cues: [],
          note: pendingNote.length ? pendingNote.join('\n') : undefined,
          line,
        };
        pendingNote = [];
        beats.push(beat);
        break;
      }
      default:
        throw new SceneParseError(file, line, `unknown keyword "${keyword}"`);
    }
  }

  if (!id) throw new SceneParseError(file, 1, 'scene has no "# scene:" header');
  if (!sets.length) throw new SceneParseError(file, 1, 'scene has no "# set:" header');

  const scene: Scene = { id, sets, note, shots, actors, beats };
  validateScene(scene, file);
  return scene;
}

/**
 * Cross-reference every name a scene uses **against itself**.
 *
 * Shots, actors and cue verbs are checked here because the scene owns them.
 * Marks are not: they live in the `.set` files the scene names, and nothing at
 * parse time has read those. Every mark reference is collected instead and
 * handed to `validateAgainstSets`, which is run wherever the sets are loaded —
 * the runtime, the editor and the coherency gate all do.
 *
 * This is the half of the format that earns its keep. A shot aimed at a mark
 * that does not exist, or an actor placed on a deleted seat, is a broken frame
 * discovered in a capture twenty minutes later; here it is a line number
 * before the scene ever runs.
 */
export function validateScene(scene: Scene, file = '<scene>'): void {
  const actors = new Set(scene.actors.map((actor) => actor.id));
  const shots = new Set(scene.shots.map((shot) => shot.id));

  for (const actor of scene.actors) {
    if (scene.actors.filter((other) => other.id === actor.id).length > 1) {
      throw new SceneParseError(file, actor.line, `duplicate actor "${actor.id}"`);
    }
  }
  for (const beat of scene.beats) {
    for (const cue of beat.cues) {
      const [first] = cue.args;
      if (cue.verb === 'camera' && !shots.has(first)) {
        throw new SceneParseError(file, cue.line, `camera cue names unknown shot "${first}"`);
      }
      if (cue.verb === 'strike' && !scene.sets.includes(first)) {
        throw new SceneParseError(file, cue.line, `strike cue names unknown set "${first}"`);
      }
      if ((cue.verb === 'say' || cue.verb === 'move' || cue.verb === 'face'
        || cue.verb === 'show' || cue.verb === 'hide' || cue.verb === 'pose'
        || cue.verb === 'mood') && !actors.has(first)) {
        throw new SceneParseError(file, cue.line, `${cue.verb} cue names unknown actor "${first}"`);
      }
    }
  }
}

/** One place a scene names a mark, with the line to blame if it is wrong. */
export interface MarkReference {
  mark: string;
  line: number;
  where: string;
}

/** Every mark this scene expects its sets to provide. */
export function markReferences(scene: Scene): MarkReference[] {
  const actors = new Set(scene.actors.map((actor) => actor.id));
  const out: MarkReference[] = [];
  for (const actor of scene.actors) {
    out.push({ mark: actor.at, line: actor.line, where: `actor "${actor.id}" stands on` });
    // An actor may face another actor, who is somewhere only at runtime.
    if (actor.facing && !actors.has(actor.facing)) {
      out.push({ mark: actor.facing, line: actor.line, where: `actor "${actor.id}" faces` });
    }
  }
  for (const shot of scene.shots) {
    for (const target of shot.targets) {
      if (!actors.has(target)) {
        out.push({ mark: target, line: shot.line, where: `shot "${shot.id}" aims at` });
      }
    }
  }
  for (const beat of scene.beats) {
    for (const cue of beat.cues) {
      if (cue.verb === 'move') {
        out.push({ mark: cue.args[2], line: cue.line, where: 'move cue names' });
      }
      if (cue.verb === 'control') {
        out.push({ mark: cue.args[1], line: cue.line, where: 'control cue names' });
      }
      if (cue.verb === 'face' && !actors.has(cue.args[1])) {
        out.push({ mark: cue.args[1], line: cue.line, where: 'face cue names' });
      }
    }
  }
  return out;
}

/**
 * The second half of validation: every mark the scene names exists in a set.
 *
 * Separate from `validateScene` because it needs the sets, and the parser has
 * only ever seen one file. Run it at every door the scene comes through —
 * loading it, previewing it, gating it — so the answer is the same everywhere.
 */
export function validateAgainstSets(
  scene: Scene,
  marks: Iterable<string>,
  file = '<scene>',
): void {
  const known = new Set(marks);
  for (const reference of markReferences(scene)) {
    if (!known.has(reference.mark)) {
      throw new SceneParseError(
        file,
        reference.line,
        `${reference.where} unknown mark "${reference.mark}" `
        + `(sets ${scene.sets.join(', ')} provide none by that name)`,
      );
    }
  }
}

const fixed = (value: number, places = 2): string => {
  const text = value.toFixed(places);
  return text.replace(/\.?0+$/, '') || '0';
};

/**
 * Write a scene back out in canonical form.
 *
 * The editor saves through this, so a file on disk is always the shape the
 * parser produces — the same round-trip guarantee `.acre` makes. It also means
 * hand-edits and editor edits converge instead of fighting over whitespace.
 */
export function formatScene(scene: Scene): string {
  const out: string[] = [];
  out.push(`# scene: ${scene.id}`);
  for (const set of scene.sets) out.push(`# set: ${set}`);
  if (scene.note) out.push(`# note: ${scene.note}`);
  out.push('');

  if (scene.shots.length) {
    for (const shot of scene.shots) {
      const parts = [
        `shot ${shot.id} ${shot.framing} ${shot.targets.join(' ')}`,
        `dist ${fixed(shot.distance)}`,
        `pitch ${fixed(shot.pitch)}`,
        `az ${fixed(shot.azimuth)}`,
        `lift ${fixed(shot.lift)}`,
        `axis ${shot.axis}`,
      ];
      if (shot.framing === 'between') parts.push(`bias ${fixed(shot.bias)}`);
      out.push(parts.join(' '));
    }
    out.push('');
  }
  if (scene.actors.length) {
    for (const actor of scene.actors) {
      const facing = actor.facing ? ` facing ${actor.facing}` : '';
      out.push(`actor ${actor.id} at ${actor.at}${facing}`);
    }
    out.push('');
  }
  for (const beat of scene.beats) {
    if (beat.note) {
      for (const noteLine of beat.note.split('\n')) {
        out.push(noteLine ? `# ${noteLine}` : '#');
      }
    }
    out.push(`beat ${beat.id}`);
    for (const cue of beat.cues) {
      out.push(`  @${fixed(cue.at, 2)} ${cue.verb} ${cue.args.join(' ')}`.trimEnd());
    }
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
