/**
 * The `.set` text format — reading and writing an authored cutscene set.
 *
 * A set is the *place* a scene is staged in: the props that stand there, the
 * named marks actors and cameras are placed against, the axis the set looks
 * along, and — the part that makes it more than a data file — the island
 * landmark it is anchored to.
 *
 *   # set: ferry
 *   # name: The ferry
 *   # anchor: dock offset 0 0.4 0 turn 0
 *
 *   prop hull ferry.glb
 *
 *   mark deck.player -0.9 0 3
 *   mark deck.recruit 0.85 0 3.3 facing deck.player
 *   seat seat.a -1.55 0.49 4.3 facing 0
 *
 *   aperture 0 0 1
 *   requires water seaward 12
 *
 * **No world coordinate ever appears in a `.set` or a `.scene`.** Everything
 * here is in the set's own space; where that space lands is derived at load
 * from `island.anchors` plus the anchor acre's rotation (`SetBinding.ts`).
 * That is the whole point of the format: the ferry used to be positioned from
 * `SPOTS.dock` and the office from `SPOTS.townHall` — POSTMARK map constants —
 * so the opening ignored which island was actually loaded.
 *
 * Same bargain, same strictness and the same error shape as `.acre` and
 * `.scene`: a reviewer opening a diff should see the staging that changed, and
 * every failure names a line. A set that parses into the wrong shape is a
 * camera inside a wall several beats later.
 */

import type { Vec3 } from '../scene/SceneFormat';

/** The island landmarks a set may anchor to — the keys of `IslandMap.anchors`. */
export const ANCHOR_LANDMARKS = ['dock', 'postOffice', 'summit'] as const;
export type AnchorLandmark = (typeof ANCHOR_LANDMARKS)[number];

/**
 * Where this set sits, relative to a landmark on whatever island is loaded.
 *
 * `turn` is degrees clockwise from the set's base facing, and `offset` is
 * metres in the set's frame *after* that turn — so "offset 0 0 -6 turn 180"
 * reads as "turn around and back off six metres", which is what it does.
 *
 * The base facing is the anchor acre's own rotation, unless `face` names a
 * second landmark to look at. Both exist because only some landmark pieces are
 * directional: `dock-a.acre` draws a jetty and its water side, so a rotated
 * dock genuinely faces somewhere, and the ferry inherits it. `post-office-a.acre`
 * is sixteen rows of uniform grass — its rotation carries no information at
 * all, and a set that trusted it would point the office door at whichever
 * quarter turn the map happened to record. The building looks at the boat
 * because that is the authored intent, and `face dock` is how the file says so.
 */
export interface SetAnchor {
  landmark: AnchorLandmark;
  offset: Vec3;
  /**
   * A second landmark the set's forward axis points at, replacing the anchor
   * acre's rotation as the base facing.
   */
  face?: AnchorLandmark;
  /** Degrees. Stored as authored; `SetBinding` converts. */
  turn: number;
  line: number;
}

/**
 * How a set's marks meet the ground.
 *
 * `rigid` transforms every mark by the set's single origin and yaw: correct for
 * anything with its own floor, and the ferry is the case that makes it
 * necessary — a deck conformed to the seabed under it would tilt and buckle.
 * `conform` re-samples the terrain under each mark instead, which is what a
 * building standing on open ground needs, since a post office eight metres deep
 * on a slope would otherwise float at one end and be buried at the other.
 */
export type SetGround = 'rigid' | 'conform';

export const SET_GROUNDS = ['rigid', 'conform'] as const;

/** A named position in the set's own space. */
export interface SetMark {
  id: string;
  position: Vec3;
  /** Optional mark this one faces, for actors placed here. */
  facing?: string;
  /**
   * How this mark meets the ground, overriding the set's default.
   *
   * The post office needs both and is why this is per mark rather than per set:
   * `office.approach` stands outside on open terrain and has to follow the
   * hill, while `office.counter` stands on the building's own floor and must
   * not — conformed, Albert sinks into the slope the building is cut into and
   * the reveal plays through a wall.
   */
  ground?: SetGround;
  line: number;
}

/**
 * A seat: a mark that also carries a fixed yaw.
 *
 * Distinct from `mark ... facing <mark>` because a bench faces the direction
 * the bench was built facing — there is no second mark for it to look at, and
 * inventing one purely to give the seat something to point at would put a
 * phantom in every shot's autocomplete.
 */
export interface SetSeat {
  id: string;
  position: Vec3;
  /** Degrees clockwise in the set's frame. */
  facing: number;
  line: number;
}

/** A piece of authored geometry standing in the set. */
export interface SetProp {
  id: string;
  /** Model key as authored; a trailing `.glb` is decoration the loader strips. */
  model: string;
  position: Vec3;
  line: number;
}

/**
 * One clause of the set's coherency contract — what it needs from any island
 * that hosts it. Deliberately open: the checker (C6) owns the vocabulary, and
 * a set that names a requirement no checker knows should fail *there*, with a
 * map name attached, rather than fail to parse.
 */
export interface SetRequirement {
  kind: string;
  args: string[];
  line: number;
}


export interface CutsceneSet {
  id: string;
  name?: string;
  note?: string;
  anchor: SetAnchor;
  ground: SetGround;
  props: SetProp[];
  marks: SetMark[];
  seats: SetSeat[];
  /**
   * The direction a camera **looks** when it shoots through this set's opening.
   *
   * Not the opening's outward normal, which is the tempting reading and the
   * wrong one: `VirtualCamera` places the camera opposite the direction it
   * looks, so an aperture written as "the front faces +Z" puts every
   * `axis aperture` shot behind the building, staring at the back wall. The
   * post office's front faces +Z and its aperture is therefore `0 0 -1` — the
   * camera stands outside the door and looks in.
   *
   * Authored rather than derived, which is what `officeFacing()`'s arithmetic
   * against two POSTMARK map spots was standing in for.
   */
  aperture: Vec3;
  requires: SetRequirement[];
}

export class SetParseError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'SetParseError';
  }
}

const NAME = /^[a-z0-9][a-z0-9._-]*$/i;

function number(token: string, field: string, file: string, line: number): number {
  // Empty is rejected explicitly, because `Number('')` is 0 and a truncated
  // `mark a 0 0` would otherwise parse as a mark at z=0 rather than as a typo.
  if (token === undefined || token.trim() === '') {
    throw new SetParseError(file, line, `${field} is missing`);
  }
  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new SetParseError(file, line, `${field} expects a number, got "${token}"`);
  }
  return value;
}

function name(token: string, field: string, file: string, line: number): string {
  if (!NAME.test(token)) {
    throw new SetParseError(file, line, `${field} "${token}" is not a legal name`);
  }
  return token;
}

function vec3(tokens: string[], field: string, file: string, line: number): Vec3 {
  return {
    x: number(tokens[0] ?? '', `${field} x`, file, line),
    y: number(tokens[1] ?? '', `${field} y`, file, line),
    z: number(tokens[2] ?? '', `${field} z`, file, line),
  };
}

/** Pull `key value` pairs off the tail of a declaration. Mirrors `SceneFormat`. */
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
      throw new SetParseError(file, line, `unknown option "${key}" (expected ${allowed.join(', ')})`);
    }
    if (i + 1 >= tokens.length) {
      throw new SetParseError(file, line, `option "${key}" has no value`);
    }
    found[key] = tokens[i + 1];
  }
  return found;
}

/**
 * Parse the `# anchor:` header.
 *
 * `<landmark> offset <x> <y> <z> turn <degrees>`, with both clauses optional so
 * a set that sits exactly on its landmark can say so in one word.
 */
function parseAnchor(value: string, file: string, line: number): SetAnchor {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const landmark = tokens[0] ?? '';
  if (!(ANCHOR_LANDMARKS as readonly string[]).includes(landmark)) {
    throw new SetParseError(
      file,
      line,
      `unknown anchor landmark "${landmark}" (expected ${ANCHOR_LANDMARKS.join(', ')})`,
    );
  }
  let offset: Vec3 = { x: 0, y: 0, z: 0 };
  let face: AnchorLandmark | undefined;
  let turn = 0;
  let i = 1;
  while (i < tokens.length) {
    const clause = tokens[i];
    if (clause === 'offset') {
      offset = vec3(tokens.slice(i + 1, i + 4), 'anchor offset', file, line);
      i += 4;
    } else if (clause === 'face') {
      const target = tokens[i + 1] ?? '';
      if (!(ANCHOR_LANDMARKS as readonly string[]).includes(target)) {
        throw new SetParseError(
          file,
          line,
          `unknown anchor landmark "${target}" (expected ${ANCHOR_LANDMARKS.join(', ')})`,
        );
      }
      if (target === landmark) {
        throw new SetParseError(file, line, `anchor cannot face its own landmark "${target}"`);
      }
      face = target as AnchorLandmark;
      i += 2;
    } else if (clause === 'turn') {
      if (i + 1 >= tokens.length) throw new SetParseError(file, line, 'anchor "turn" has no value');
      turn = number(tokens[i + 1], 'anchor turn', file, line);
      i += 2;
    } else {
      throw new SetParseError(
        file, line, `unknown anchor clause "${clause}" (expected offset, face, turn)`,
      );
    }
  }
  return { landmark: landmark as AnchorLandmark, offset, face, turn, line };
}

/** Parse one `.set` file. */
export function parseSet(text: string, file = '<set>'): CutsceneSet {
  const props: SetProp[] = [];
  const marks: SetMark[] = [];
  const seats: SetSeat[] = [];
  const requires: SetRequirement[] = [];
  let id: string | undefined;
  let setName: string | undefined;
  let note: string | undefined;
  let anchor: SetAnchor | undefined;
  let aperture: Vec3 | undefined;
  let ground: SetGround = 'rigid';

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const trimmed = lines[index].trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      const header = /^#\s*([a-z]+):\s*(.*)$/i.exec(trimmed);
      if (!header) continue; // a free comment
      const [, key, value] = header;
      if (key === 'set') id = name(value.trim(), 'set', file, line);
      else if (key === 'name') setName = value.trim();
      else if (key === 'note') note = value.trim();
      else if (key === 'anchor') anchor = parseAnchor(value, file, line);
      else if (key === 'ground') {
        const word = value.trim();
        if (!(SET_GROUNDS as readonly string[]).includes(word)) {
          throw new SetParseError(
            file, line, `unknown ground "${word}" (expected ${SET_GROUNDS.join(', ')})`,
          );
        }
        ground = word as SetGround;
      }
      continue;
    }

    const tokens = trimmed.split(/\s+/);
    switch (tokens[0]) {
      case 'prop': {
        const propId = name(tokens[1] ?? '', 'prop', file, line);
        const model = name(tokens[2] ?? '', 'prop model', file, line);
        const rest = tokens.slice(3);
        let position: Vec3 = { x: 0, y: 0, z: 0 };
        if (rest.length) {
          if (rest[0] !== 'at') {
            throw new SetParseError(file, line, 'prop takes <id> <model> [at <x> <y> <z>]');
          }
          if (rest.length !== 4) {
            throw new SetParseError(file, line, 'prop takes <id> <model> [at <x> <y> <z>]');
          }
          position = vec3(rest.slice(1), 'prop position', file, line);
        }
        props.push({ id: propId, model, position, line });
        break;
      }
      case 'mark': {
        const markId = name(tokens[1] ?? '', 'mark', file, line);
        const position = vec3(tokens.slice(2, 5), 'mark', file, line);
        const opts = options(tokens.slice(5), ['facing', 'ground'], file, line);
        if (opts.ground !== undefined && !(SET_GROUNDS as readonly string[]).includes(opts.ground)) {
          throw new SetParseError(
            file, line, `unknown ground "${opts.ground}" (expected ${SET_GROUNDS.join(', ')})`,
          );
        }
        marks.push({
          id: markId,
          position,
          facing: opts.facing,
          ground: opts.ground as SetGround | undefined,
          line,
        });
        break;
      }
      case 'seat': {
        const seatId = name(tokens[1] ?? '', 'seat', file, line);
        const position = vec3(tokens.slice(2, 5), 'seat', file, line);
        const opts = options(tokens.slice(5), ['facing'], file, line);
        if (opts.facing === undefined) {
          throw new SetParseError(file, line, `seat "${seatId}" needs a facing in degrees`);
        }
        seats.push({
          id: seatId,
          position,
          facing: number(opts.facing, 'seat facing', file, line),
          line,
        });
        break;
      }
      case 'aperture': {
        aperture = vec3(tokens.slice(1, 4), 'aperture', file, line);
        break;
      }
      case 'requires': {
        const kind = name(tokens[1] ?? '', 'requires', file, line);
        requires.push({ kind, args: tokens.slice(2), line });
        break;
      }
      default:
        throw new SetParseError(file, line, `unknown keyword "${tokens[0]}"`);
    }
  }

  if (!id) throw new SetParseError(file, 1, 'set has no "# set:" header');
  if (!anchor) throw new SetParseError(file, 1, 'set has no "# anchor:" header');
  if (!aperture) throw new SetParseError(file, 1, 'set has no "aperture" line');

  const set: CutsceneSet = {
    id, name: setName, note, anchor, ground, props, marks, seats, aperture, requires,
  };
  validateSet(set, file);
  return set;
}

/**
 * Cross-reference every name a set uses.
 *
 * The half of the format that earns its keep, exactly as in `.scene`: a mark
 * facing a mark that does not exist is a character delivering a line to a wall,
 * found in a capture twenty minutes later. Here it is a line number.
 */
export function validateSet(set: CutsceneSet, file = '<set>'): void {
  const seen = new Map<string, number>();
  const claim = (id: string, what: string, line: number): void => {
    const first = seen.get(id);
    if (first !== undefined) {
      throw new SetParseError(file, line, `duplicate ${what} "${id}" (first declared on line ${first})`);
    }
    seen.set(id, line);
  };
  for (const prop of set.props) claim(prop.id, 'prop', prop.line);
  const positions = new Set<string>();
  for (const mark of set.marks) { claim(mark.id, 'mark', mark.line); positions.add(mark.id); }
  for (const seat of set.seats) { claim(seat.id, 'seat', seat.line); positions.add(seat.id); }

  for (const mark of set.marks) {
    if (mark.facing && !positions.has(mark.facing)) {
      throw new SetParseError(file, mark.line, `mark "${mark.id}" faces unknown "${mark.facing}"`);
    }
  }
  const { x, y, z } = set.aperture;
  if (x === 0 && y === 0 && z === 0) {
    throw new SetParseError(file, 1, 'aperture cannot be the zero vector');
  }
}

const fixed = (value: number, places = 2): string => {
  const text = value.toFixed(places);
  return text.replace(/\.?0+$/, '') || '0';
};

const triple = (v: Vec3): string => `${fixed(v.x)} ${fixed(v.y)} ${fixed(v.z)}`;

/**
 * Write a set back out in canonical form.
 *
 * The editor saves through this, so a file on disk is always the shape the
 * parser produces — the same round-trip guarantee `.acre` and `.scene` make,
 * which is what lets hand-edits and editor edits converge instead of fighting
 * over whitespace.
 */
export function formatSet(set: CutsceneSet): string {
  const out: string[] = [];
  out.push(`# set: ${set.id}`);
  if (set.name) out.push(`# name: ${set.name}`);
  if (set.note) out.push(`# note: ${set.note}`);
  const { landmark, offset, face, turn } = set.anchor;
  const facing = face ? ` face ${face}` : '';
  out.push(`# anchor: ${landmark} offset ${triple(offset)}${facing} turn ${fixed(turn)}`);
  if (set.ground !== 'rigid') out.push(`# ground: ${set.ground}`);
  out.push('');

  if (set.props.length) {
    for (const prop of set.props) {
      const at = prop.position.x === 0 && prop.position.y === 0 && prop.position.z === 0
        ? '' : ` at ${triple(prop.position)}`;
      out.push(`prop ${prop.id} ${prop.model}${at}`);
    }
    out.push('');
  }
  if (set.marks.length) {
    for (const mark of set.marks) {
      const facing = mark.facing ? ` facing ${mark.facing}` : '';
      const ground = mark.ground ? ` ground ${mark.ground}` : '';
      out.push(`mark ${mark.id} ${triple(mark.position)}${facing}${ground}`);
    }
    out.push('');
  }
  if (set.seats.length) {
    for (const seat of set.seats) {
      out.push(`seat ${seat.id} ${triple(seat.position)} facing ${fixed(seat.facing)}`);
    }
    out.push('');
  }
  out.push(`aperture ${triple(set.aperture)}`);
  for (const requirement of set.requires) {
    out.push(`requires ${[requirement.kind, ...requirement.args].join(' ')}`);
  }
  out.push('');
  return out.join('\n').replace(/\n+$/, '\n');
}
