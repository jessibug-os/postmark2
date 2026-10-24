/**
 * The `.gameobj` text format — a placeable thing, and what it can do.
 *
 * An acre used to name a `.glb` directly, which meant a prop was a mesh and
 * nothing else: no collision, no interaction, no way to say that a bench is
 * sat on. This is the layer between. An acre names an **object type**; the type
 * names the model and carries the components that make it more than geometry.
 *
 *   # object: bench
 *   # name: Timber bench
 *   # model: bench.glb
 *
 *   collide circle 0.55 at -0.6 0
 *   collide circle 0.55 at 0.6 0
 *   seat left at -0.6 0.45 -0.2 facing 180
 *
 * **Component types are engine; definitions are content.** Adding `interact` was
 * a change to this file and to the system that reads it, once. Adding the
 * fiftieth interactable object is a text file and no code at all. That is the
 * whole point of the split, and it is the line to defend: new *verbs* are code,
 * new *things* are data. Verbs are naturally few; things are endless.
 *
 * **This is not an entity-component system in the architectural sense** and
 * should not become one. There is no entity table, no packed component arrays,
 * no scheduler — those solve composition and cache locality for tens of
 * thousands of entities, and this game has tens. What is borrowed is the data
 * model: a definition is a bag of typed components, and ordinary runtime code
 * reads them.
 *
 * Same bargain as `.acre`, `.set` and `.scene`: strict, diffable, every error
 * names a line, and `format(parse(text)) === text`.
 */

export interface Vec3 { x: number; y: number; z: number }

export class GameObjectParseError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'GameObjectParseError';
  }
}

/**
 * A circle the player cannot walk into, in the object's own frame.
 *
 * Circles because that is what the collision system has — `Collider` is
 * `{x, z, r}` and nothing else. A building traces its walls with several,
 * which is exactly what `OpeningSet.buildPostOffice` did by hand, and it leaves
 * the doorway open by simply not declaring one there. A single box would be a
 * lie about the engine and would seal the office door.
 */
export interface CollideComponent {
  kind: 'collide';
  radius: number;
  at: { x: number; z: number };
  line: number;
}

/** Somewhere a character can sit, and which way they face once seated. */
export interface SeatComponent {
  kind: 'seat';
  id: string;
  at: Vec3;
  /** Degrees clockwise in the object's frame. */
  facing: number;
  line: number;
}

/**
 * What happens when the player interacts.
 *
 * `scene` plays an authored `.scene`, which is how a door opens and walks the
 * player through it: that is a cutscene, and there is already a format, a
 * director and an editor for those. `sit` takes the object's named seat.
 */
export interface InteractComponent {
  kind: 'interact';
  verb: 'scene' | 'sit';
  /** A scene id, or a seat id. */
  target: string;
  /** The prompt shown when the player is in range. */
  prompt?: string;
  line: number;
}

/** Metres of world scatter kept clear around this object. */
export interface ClearComponent {
  kind: 'clear';
  radius: number;
  line: number;
}

/** The axis `axis aperture` shots compose against, in the object's frame. */
export interface ApertureComponent {
  kind: 'aperture';
  axis: Vec3;
  line: number;
}

/**
 * A free comment, kept in place through the round trip.
 *
 * Not a component — `componentsOf` never returns one — but it lives in the same
 * ordered list so it can be written back exactly where it was. The office's
 * walls are nine anonymous circles and the paragraph above them is the only
 * thing that says the doorway gap is deliberate; a format that dropped it would
 * lose the reason and keep the numbers, which is the wrong half.
 */
export interface CommentLine {
  kind: 'comment';
  text: string;
  line: number;
}

export type ObjectComponent =
  | CollideComponent
  | SeatComponent
  | InteractComponent
  | ClearComponent
  | ApertureComponent
  | CommentLine;

export interface GameObject {
  id: string;
  /** Shown in the editor's picker; the id is what a `.acre` names. */
  name: string;
  /** The `.glb` under `public/assets`. */
  model: string;
  note?: string;
  components: readonly ObjectComponent[];
}

const number = (token: string | undefined, what: string, file: string, line: number): number => {
  const value = Number(token);
  if (token === undefined || !Number.isFinite(value)) {
    throw new GameObjectParseError(file, line, `${what} must be a number, got "${token ?? ''}"`);
  }
  return value;
};

/** Parse one `.gameobj` file. Strict: every failure names a line. */
export function parseGameObject(text: string, file = '<gameobj>'): GameObject {
  const header: Record<string, string> = {};
  const components: ObjectComponent[] = [];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const at = i + 1;
    if (line.length === 0) continue;
    if (line.startsWith('#')) {
      const body = line.slice(1).trim();
      const split = body.indexOf(':');
      // A header line is `key: value` *before* any component; after that a
      // `# ` line is prose about the components under it, and stays put.
      if (split < 0 || components.length > 0) {
        components.push({ kind: 'comment', text: body, line: at });
        continue;
      }
      header[body.slice(0, split).trim()] = body.slice(split + 1).trim();
      continue;
    }

    const tokens = line.split(/\s+/).filter((token) => token.length > 0);
    const kind = tokens.shift();
    switch (kind) {
      case 'collide': {
        if (tokens.shift() !== 'circle') {
          throw new GameObjectParseError(file, at, 'collide takes "circle <radius> [at <x> <z>]"');
        }
        const radius = number(tokens.shift(), 'collide radius', file, at);
        if (radius <= 0) throw new GameObjectParseError(file, at, 'collide radius must be positive');
        let spot = { x: 0, z: 0 };
        if (tokens.length > 0) {
          if (tokens.shift() !== 'at') {
            throw new GameObjectParseError(file, at, 'collide takes "circle <radius> [at <x> <z>]"');
          }
          spot = {
            x: number(tokens.shift(), 'collide x', file, at),
            z: number(tokens.shift(), 'collide z', file, at),
          };
        }
        components.push({ kind: 'collide', radius, at: spot, line: at });
        break;
      }
      case 'seat': {
        const id = tokens.shift();
        if (!id) throw new GameObjectParseError(file, at, 'seat needs an id');
        if (tokens.shift() !== 'at') {
          throw new GameObjectParseError(file, at, `seat "${id}" needs "at <x> <y> <z>"`);
        }
        const position = {
          x: number(tokens.shift(), 'seat x', file, at),
          y: number(tokens.shift(), 'seat y', file, at),
          z: number(tokens.shift(), 'seat z', file, at),
        };
        let facing = 0;
        if (tokens.length > 0) {
          if (tokens.shift() !== 'facing') {
            throw new GameObjectParseError(file, at, `seat "${id}" takes an optional "facing <degrees>"`);
          }
          facing = number(tokens.shift(), 'seat facing', file, at);
        }
        components.push({ kind: 'seat', id, at: position, facing, line: at });
        break;
      }
      case 'interact': {
        const verb = tokens.shift();
        if (verb !== 'scene' && verb !== 'sit') {
          throw new GameObjectParseError(file, at, `interact verb is "scene" or "sit", got "${verb ?? ''}"`);
        }
        const target = tokens.shift();
        if (!target) throw new GameObjectParseError(file, at, `interact ${verb} needs a target`);
        const prompt = tokens.length > 0 ? tokens.join(' ') : undefined;
        components.push({ kind: 'interact', verb, target, ...(prompt ? { prompt } : {}), line: at });
        break;
      }
      case 'clear':
        components.push({
          kind: 'clear', radius: number(tokens.shift(), 'clear radius', file, at), line: at,
        });
        break;
      case 'aperture':
        components.push({
          kind: 'aperture',
          axis: {
            x: number(tokens.shift(), 'aperture x', file, at),
            y: number(tokens.shift(), 'aperture y', file, at),
            z: number(tokens.shift(), 'aperture z', file, at),
          },
          line: at,
        });
        break;
      default:
        throw new GameObjectParseError(file, at, `unknown component "${kind ?? ''}"`);
    }
  }

  if (!header.object) throw new GameObjectParseError(file, 1, 'header is missing "object:"');
  if (!header.model) throw new GameObjectParseError(file, 1, 'header is missing "model:"');

  // An `interact sit` naming a seat the object does not have is the mistake
  // this catches: it parses, it looks right, and it does nothing at runtime.
  const seats = new Set(components.filter((c) => c.kind === 'seat').map((c) => c.id));
  for (const component of components) {
    if (component.kind !== 'interact' || component.verb !== 'sit') continue;
    if (!seats.has(component.target)) {
      throw new GameObjectParseError(
        file, component.line,
        `interact sit "${component.target}" names no seat on "${header.object}"`,
      );
    }
  }

  return {
    id: header.object,
    name: header.name ?? header.object,
    model: header.model,
    ...(header.note ? { note: header.note } : {}),
    components,
  };
}

/** Write one back out. Round-trips through `parseGameObject` unchanged. */
export function formatGameObject(object: GameObject): string {
  const out: string[] = [`# object: ${object.id}`];
  if (object.name !== object.id) out.push(`# name: ${object.name}`);
  out.push(`# model: ${object.model}`);
  if (object.note) out.push(`# note: ${object.note}`);
  if (object.components.length > 0) out.push('');
  for (const component of object.components) {
    switch (component.kind) {
      case 'collide': {
        const spot = component.at.x === 0 && component.at.z === 0
          ? '' : ` at ${component.at.x} ${component.at.z}`;
        out.push(`collide circle ${component.radius}${spot}`);
        break;
      }
      case 'seat': {
        const facing = component.facing === 0 ? '' : ` facing ${component.facing}`;
        out.push(`seat ${component.id} at ${component.at.x} ${component.at.y} ${component.at.z}${facing}`);
        break;
      }
      case 'interact':
        out.push(`interact ${component.verb} ${component.target}`
          + (component.prompt ? ` ${component.prompt}` : ''));
        break;
      case 'clear':
        out.push(`clear ${component.radius}`);
        break;
      case 'aperture':
        out.push(`aperture ${component.axis.x} ${component.axis.y} ${component.axis.z}`);
        break;
      case 'comment':
        out.push(`# ${component.text}`);
        break;
    }
  }
  return `${out.join('\n')}\n`;
}

/** Every component of one kind, typed. */
export function componentsOf<K extends ObjectComponent['kind']>(
  object: GameObject | undefined,
  kind: K,
): Array<Extract<ObjectComponent, { kind: K }>> {
  return (object?.components ?? []).filter(
    (component): component is Extract<ObjectComponent, { kind: K }> => component.kind === kind,
  );
}
