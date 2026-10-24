import { describe, expect, it } from 'vitest';
import {
  bindSet,
  acreYaw,
} from '../src/cutscene/set/SetBinding';
import {
  formatSet,
  parseSet,
  SetParseError,
  type CutsceneSet,
} from '../src/cutscene/set/SetFormat';
import type { IslandMap } from '../src/world/island/IslandMap';
import { acreCentre } from '../src/world/island/AcreLibrary';

const SOURCE = `# set: sample
# name: A sample set
# note: a fixture
# anchor: dock offset 0 0.4 -6 turn 180

prop hull ferry.glb
prop lantern lantern.glb at 0.4 1.2 -2.1

mark player -0.9 0 3
mark recruit 0.85 0 3.3 facing player
mark door 0 0 -0.97

seat bench -1.55 0.49 4.3 facing 0

aperture 0 0 1
requires water seaward 12
`;

/** Parse a source expected to fail, and hand back the error. */
function failure(source: string): SetParseError {
  try {
    parseSet(source, 'test.set');
  } catch (error) {
    return error as SetParseError;
  }
  throw new Error('expected a SetParseError, but the source parsed');
}

/** A source with the fixture's header, plus whatever body a case needs. */
const withBody = (body: string): string =>
  `# set: sample\n# anchor: dock\n${body}\naperture 0 0 1\n`;

describe('parseSet', () => {
  const set = parseSet(SOURCE, 'sample.set');

  it('reads the header', () => {
    expect(set.id).toBe('sample');
    expect(set.name).toBe('A sample set');
    expect(set.note).toBe('a fixture');
  });

  it('reads the anchor, keeping the turn in authored degrees', () => {
    expect(set.anchor.landmark).toBe('dock');
    expect(set.anchor.offset).toEqual({ x: 0, y: 0.4, z: -6 });
    expect(set.anchor.turn).toBe(180);
  });

  it('defaults a prop with no "at" to the set origin', () => {
    expect(set.props[0]).toMatchObject({ id: 'hull', model: 'ferry.glb' });
    expect(set.props[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(set.props[1].position).toEqual({ x: 0.4, y: 1.2, z: -2.1 });
  });

  it('reads marks, their facing, and seats', () => {
    expect(set.marks.map((mark) => mark.id)).toEqual(['player', 'recruit', 'door']);
    expect(set.marks[1].facing).toBe('player');
    expect(set.marks[0].facing).toBeUndefined();
    expect(set.seats).toHaveLength(1);
    expect(set.seats[0]).toMatchObject({ id: 'bench', facing: 0 });
  });

  it('reads the aperture and the coherency contract', () => {
    expect(set.aperture).toEqual({ x: 0, y: 0, z: 1 });
    expect(set.requires).toHaveLength(1);
    expect(set.requires[0]).toMatchObject({ kind: 'water', args: ['seaward', '12'] });
  });

  it('names the line of every failure', () => {
    expect(failure('# set: s\n# anchor: dock\naperture 0 0 1\nwobble 1\n').line).toBe(4);
    expect(failure(withBody('mark a 0 0')).line).toBe(3);
  });

  it('rejects a set with no id, anchor or aperture', () => {
    expect(() => parseSet('# anchor: dock\naperture 0 0 1\n', 'x.set')).toThrow(/no "# set:"/);
    expect(() => parseSet('# set: s\naperture 0 0 1\n', 'x.set')).toThrow(/no "# anchor:"/);
    expect(() => parseSet('# set: s\n# anchor: dock\n', 'x.set')).toThrow(/no "aperture"/);
  });

  it('rejects an unknown landmark', () => {
    expect(failure('# set: s\n# anchor: lighthouse\naperture 0 0 1\n').message)
      .toMatch(/unknown anchor landmark "lighthouse"/);
  });

  it('rejects facing the anchor\'s own landmark, which names no direction', () => {
    expect(failure('# set: s\n# anchor: dock face dock\naperture 0 0 1\n').message)
      .toMatch(/cannot face its own landmark "dock"/);
  });

  it('rejects an unknown anchor clause', () => {
    expect(failure('# set: s\n# anchor: dock shifted 1 2 3\naperture 0 0 1\n').message)
      .toMatch(/unknown anchor clause "shifted"/);
  });

  it('rejects a mark facing something that does not exist', () => {
    expect(failure(withBody('mark a 0 0 0 facing ghost')).message)
      .toMatch(/mark "a" faces unknown "ghost"/);
  });

  it('lets a mark face a seat', () => {
    expect(() => parseSet(withBody('mark a 0 0 0 facing b\nseat b 1 0 0 facing 90'), 's.set'))
      .not.toThrow();
  });

  it('rejects a seat with no facing', () => {
    expect(failure(withBody('seat b 1 0 0')).message).toMatch(/needs a facing in degrees/);
  });

  it('rejects two things sharing a name', () => {
    expect(failure(withBody('mark a 0 0 0\nseat a 1 0 0 facing 0')).message)
      .toMatch(/duplicate seat "a"/);
  });

  it('rejects a zero aperture, which composes every axis shot against nothing', () => {
    expect(() => parseSet('# set: s\n# anchor: dock\naperture 0 0 0\n', 'x.set'))
      .toThrow(/aperture cannot be the zero vector/);
  });

  it('accepts an anchor with neither clause', () => {
    const bare = parseSet('# set: s\n# anchor: postOffice\naperture 0 0 1\n', 'x.set');
    expect(bare.anchor).toMatchObject({ landmark: 'postOffice', turn: 0 });
    expect(bare.anchor.offset).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('formatSet', () => {
  it('round-trips: parse(format(parse(x))) equals parse(x)', () => {
    const once = parseSet(SOURCE, 'sample.set');
    const twice = parseSet(formatSet(once), 'sample.set');
    const strip = (set: CutsceneSet): unknown => JSON.parse(
      JSON.stringify(set, (key, value) => (key === 'line' ? undefined : value)),
    );
    expect(strip(twice)).toEqual(strip(once));
  });

  it('is stable: formatting twice changes nothing', () => {
    const text = formatSet(parseSet(SOURCE, 'sample.set'));
    expect(formatSet(parseSet(text, 'sample.set'))).toBe(text);
  });

  it('writes the fixture back byte-identically', () => {
    expect(formatSet(parseSet(SOURCE, 'sample.set'))).toBe(SOURCE);
  });
});

/** An island with one dock acre, enough to seat a set against. */
function island(
  dock: { col: number; row: number },
  pieceId: string,
  postOffice = dock,
): IslandMap {
  const acres = [
    { col: dock.col, row: dock.row, kind: 'dock', tier: 1, edges: [], pieceId },
    { col: postOffice.col, row: postOffice.row, kind: 'post-office', tier: 1, edges: [] },
  ];
  return {
    anchors: { dock, postOffice, summit: dock },
    at: (col: number, row: number) =>
      acres.find((acre) => acre.col === col && acre.row === row) ?? null,
  } as unknown as IslandMap;
}

describe('acreYaw', () => {
  it('reads the quarter turns off a placement id', () => {
    expect(acreYaw('dock-a')).toBe(0);
    expect(acreYaw('dock-a@1')).toBeCloseTo(-Math.PI / 2, 12);
    expect(acreYaw('dock-a@2')).toBeCloseTo(-Math.PI, 12);
    expect(acreYaw(undefined)).toBe(0);
  });
});

describe('bindSet', () => {
  const flat = (): number => 0;

  it('lands the set on its anchor acre, lifted by the offset', () => {
    const set = parseSet('# set: s\n# anchor: dock offset 0 0.4 0\naperture 0 0 1\n', 's.set');
    const placement = bindSet(set, island({ col: 3, row: 4 }, 'dock-a'), flat);
    const centre = acreCentre(3, 4);
    expect(placement.origin.x).toBeCloseTo(centre.x, 10);
    expect(placement.origin.z).toBeCloseTo(centre.z, 10);
    expect(placement.origin.y).toBeCloseTo(0.4, 10);
    expect(placement.yaw).toBe(0);
  });

  it('measures the offset in the set frame, after the turn', () => {
    const set = parseSet('# set: s\n# anchor: dock offset 0 0 -6 turn 180\naperture 0 0 1\n', 's.set');
    const placement = bindSet(set, island({ col: 3, row: 4 }, 'dock-a'), flat);
    const centre = acreCentre(3, 4);
    // Turned about-face, so backing off 6 metres moves +6 in world z.
    expect(placement.origin.z - centre.z).toBeCloseTo(6, 10);
    expect(placement.origin.x - centre.x).toBeCloseTo(0, 10);
  });

  it('inherits the anchor acre rotation, so a turned dock turns the set', () => {
    const set = parseSet('# set: s\n# anchor: dock\naperture 0 0 1\n', 's.set');
    const placement = bindSet(set, island({ col: 3, row: 4 }, 'dock-a@1'), flat);
    expect(placement.yaw).toBeCloseTo(-Math.PI / 2, 12);
    // The set's forward axis follows it.
    const forward = placement.aperture();
    expect(forward.x).toBeCloseTo(-1, 10);
    expect(forward.z).toBeCloseTo(0, 10);
  });

  it('resolves marks and seats through the same transform', () => {
    const set = parseSet(
      '# set: s\n# anchor: dock turn 90\nmark a 1 0 0\nseat b 0 0 2 facing 30\naperture 0 0 1\n',
      's.set',
    );
    const placement = bindSet(set, island({ col: 3, row: 4 }, 'dock-a'), flat);
    const centre = acreCentre(3, 4);
    // Turned a quarter clockwise: local +X points along world -Z.
    expect(placement.markWorld('a').z - centre.z).toBeCloseTo(-1, 10);
    expect(placement.markWorld('b').x - centre.x).toBeCloseTo(2, 10);
    expect(placement.markFacing('b')).toBeCloseTo((90 + 30) * (Math.PI / 180), 12);
  });

  it('derives a facing mark yaw from the two positions', () => {
    const set = parseSet(
      '# set: s\n# anchor: dock\nmark a 0 0 0 facing b\nmark b 0 0 5\naperture 0 0 1\n',
      's.set',
    );
    const placement = bindSet(set, island({ col: 3, row: 4 }, 'dock-a'), flat);
    expect(placement.markFacing('a')).toBeCloseTo(0, 10);
    expect(placement.markFacing('b')).toBeNull();
  });

  it('takes its base facing from "face", not from an undirected anchor acre', () => {
    // `post-office-a.acre` is uniform grass, so its recorded quarter turn says
    // nothing about which way the building looks. `face dock` is the authored
    // answer: the front looks at the boat.
    const set = parseSet('# set: s\n# anchor: postOffice face dock\naperture 0 0 1\n', 's.set');
    const dock = { col: 2, row: 4 };
    const office = { col: 2, row: 8 };
    const placement = bindSet(set, island(dock, 'dock-a@3', office), flat);
    // The dock is due north of the office, so the office looks along -Z.
    expect(placement.yaw).toBeCloseTo(Math.PI, 10);
    const forward = placement.aperture();
    expect(forward.z).toBeCloseTo(-1, 10);
  });

  it('adds "turn" on top of a "face" base', () => {
    const set = parseSet(
      '# set: s\n# anchor: postOffice face dock turn 90\naperture 0 0 1\n', 's.set',
    );
    const placement = bindSet(set, island({ col: 2, row: 4 }, 'dock-a', { col: 2, row: 8 }), flat);
    expect(placement.yaw).toBeCloseTo(Math.PI + Math.PI / 2, 10);
  });

  it('throws by name on an unknown mark', () => {
    const set = parseSet('# set: s\n# anchor: dock\naperture 0 0 1\n', 's.set');
    const placement = bindSet(set, island({ col: 3, row: 4 }, 'dock-a'), flat);
    expect(() => placement.markWorld('ghost')).toThrow(/set "s" has no mark "ghost"/);
  });
});
