import { describe, expect, it } from 'vitest';
import { formatSet, parseSet, type CutsceneSet } from '../src/cutscene/set/SetFormat';
import { bindSet } from '../src/cutscene/set/SetBinding';
import { templateOrDefault } from '../src/world/island/TemplateLibrary';
import { templateToIsland } from '../src/world/island/IslandTemplate';
import { authoredPieces } from '../src/world/island/PieceLibrary';
import { FIXTURE_LIMIT, islandMarks } from '../src/world/island/AcreFixtures';
import { activeGameObject } from '../src/content/activePack';
import { componentsOf } from '../src/world/objects/GameObjectFormat';

/**
 * Every authored `.set` on disk must parse, cross-reference and be canonical —
 * the same gate `authored-scenes.test.ts` puts on `.scene`.
 */
const sources = import.meta.glob('../src/cutscene/sets/*.set', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files = Object.keys(sources).sort();

describe('authored sets', () => {
  it('there is at least one', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const text = sources[file];

      it('parses and cross-references', () => {
        expect(() => parseSet(text, file)).not.toThrow();
      });

      it('is stored canonically', () => {
        expect(formatSet(parseSet(text, file))).toBe(text);
      });

      it('has an aperture that is a real direction', () => {
        const set = parseSet(text, file);
        const { x, y, z } = set.aperture;
        expect(Math.hypot(x, y, z)).toBeGreaterThan(0);
      });
    });
  }
});

const byId = (id: string): CutsceneSet => {
  const file = files.find((path) => path.endsWith(`/${id}.set`));
  if (!file) throw new Error(`no ${id}.set on disk`);
  return parseSet(sources[file], file);
};

/**
 * The opening's staging, pinned.
 *
 * These numbers were `FERRY` and `OFFICE` — frozen `THREE.Vector3` constants in
 * `OpeningSet.ts`, hand-copied into `kindly-opening.scene`. C2 deleted them, so
 * this is where they are now asserted: the `.set` is the single source, and a
 * nudge to any of these marks is a deliberate restaging that has to change this
 * test too.
 */
describe('the opening sets stage where the hardcoded opening did', () => {
  const ferry = byId('ferry');

  const markOf = (set: CutsceneSet, id: string) => {
    const found = [...set.marks, ...set.seats].find((entry) => entry.id === id);
    expect(found, `${set.id}.set has no mark "${id}"`).toBeDefined();
    return found!.position;
  };

  it('holds the ferry deck marks', () => {
    expect(markOf(ferry, 'deck.player')).toEqual({ x: -0.9, y: 0, z: 3 });
    expect(markOf(ferry, 'deck.recruit')).toEqual({ x: 1.55, y: 0, z: 3.2 });
    expect(markOf(ferry, 'deck.bow')).toEqual({ x: 0, y: 1, z: 5.6 });
    expect(markOf(ferry, 'cabin.door')).toEqual({ x: 0, y: 0, z: -0.97 });
    expect(markOf(ferry, 'cabin.offstage')).toEqual({ x: 0, y: 0, z: -3.4 });
  });

  it('holds three bench seats, the aft one facing the cabin', () => {
    expect(ferry.seats.map((seat) => seat.id)).toEqual(['seat.a', 'seat.b', 'seat.c']);
    expect(ferry.seats.map((seat) => seat.facing)).toEqual([0, 0, 180]);
    expect(markOf(ferry, 'seat.a')).toEqual({ x: -1.55, y: 0.49, z: 4.3 });
    expect(markOf(ferry, 'seat.b')).toEqual({ x: 1.55, y: 0.49, z: 4.3 });
    expect(markOf(ferry, 'seat.c')).toEqual({ x: -1.55, y: 0.49, z: 1.6 });
  });


  it('faces the recruit at the player across the deck', () => {
    expect(ferry.marks.find((mark) => mark.id === 'deck.recruit')?.facing).toBe('deck.player');
  });

  it('anchors the ferry to an island landmark, not to a map constant', () => {
    expect(ferry.anchor.landmark).toBe('dock');
    // The ferry rides 0.4 above the dock's terrain, as `IntroCutscene` placed it.
    expect(ferry.anchor.offset.y).toBeCloseTo(0.4, 10);
  });
});

/**
 * The office's staging, which moved out of `post-office.set` and into the acre
 * that owns it.
 *
 * Same numbers, same purpose as the ferry block above: these were hand-copied
 * constants once, then a `.set`, and now they are fixtures of
 * `post-office-a.acre`. A nudge to any of them is a deliberate restaging that
 * has to change this test too.
 */
describe('the post office stages from its own acre', () => {
  const office = () => {
    const piece = authoredPieces().find((candidate) => candidate.id === 'post-office-a');
    expect(piece, 'post-office-a.acre is missing').toBeDefined();
    return piece!;
  };
  const fixture = (id: string) => {
    const found = office().fixtures?.find((candidate) => candidate.id === id);
    expect(found, `post-office-a carries no fixture "${id}"`).toBeDefined();
    return found!;
  };

  it('carries the building, and only a unique piece may', () => {
    expect(office().unique).toBe(true);
    expect(fixture('building').kind).toBe('prop');
    // The acre names an object *type*; the type owns the model and everything
    // the building can do.
    expect(fixture('building').object).toBe('post-office');
  });

  /**
   * The office's marks are **authored in `/acre` now**, not typed.
   *
   * This block used to pin their exact coordinates, the way the ferry block
   * above still does, because they had been hand-copied constants and a nudge
   * was necessarily a deliberate restaging. That stopped being true when the
   * editor grew fixture handles: dragging the counter half a metre is the
   * normal way to work now, and a test that fails on every drag is friction
   * with no signal in it.
   *
   * What is asserted instead is what a drag must not break — the relationships
   * the opening actually depends on. The exact numbers live in the `.acre`,
   * which is the file a reviewer reads.
   */
  it('offers the five office marks', () => {
    expect(office().fixtures?.filter((f) => f.kind === 'mark').map((f) => f.id).sort())
      .toEqual([
        'office.approach', 'office.counter', 'office.doorway',
        'office.ledger', 'office.threshold',
      ]);
  });

  it('keeps every fixture inside its own acre', () => {
    // Past half an acre a fixture belongs to the neighbour, which never
    // declared it — and if that neighbour is a reusable piece, to every copy.
    for (const fixture of office().fixtures ?? []) {
      expect(Math.abs(fixture.position.x), `${fixture.id} x`).toBeLessThanOrEqual(FIXTURE_LIMIT);
      expect(Math.abs(fixture.position.z), `${fixture.id} z`).toBeLessThanOrEqual(FIXTURE_LIMIT);
    }
  });

  /**
   * The walk inland arrives down the building's own axis: approach, then
   * threshold, then the counter inside. `+z` is the building's front, so the
   * three run from most positive to least — the ordering the `sightline`,
   * `threshold` and `silhouette` shots are composed against.
   */
  it('keeps the approach outside the threshold, and the counter within', () => {
    const z = (id: string): number => fixture(id).position.z;
    expect(z('office.approach')).toBeGreaterThan(z('office.threshold'));
    expect(z('office.threshold')).toBeGreaterThan(z('office.counter'));
  });

  /**
   * The interior marks are measured off the building, not off the ground.
   *
   * `post-office.set` drew this distinction with a set-level `# ground: conform`
   * and four marks overridden to `rigid`, and losing it would let the counter
   * and the ledger ride whatever slope the floor cuts through.
   */
  it('keeps the interior marks rigid and the approach conformed', () => {
    expect(fixture('office.approach').ground).toBe('conform');
    for (const id of ['office.threshold', 'office.counter', 'office.ledger', 'office.doorway']) {
      expect(fixture(id).ground, id).toBe('rigid');
    }
  });

  /**
   * `requires clear 9` — the clause AGENTS.md rule 6 rests on — is a property of
   * post offices, so it lives on the object type rather than on this instance.
   */
  it('keeps its scatter radius, and its walls', () => {
    const office = activeGameObject('post-office');
    expect(office, 'post-office.gameobj is missing').toBeDefined();
    expect(componentsOf(office, 'clear')[0]?.radius).toBe(9);
    // Nine traced circles, doorway deliberately open. A single footprint circle
    // would seal the entrance and push the player off the threshold mid-reveal.
    expect(componentsOf(office, 'collide')).toHaveLength(9);
    expect(componentsOf(office, 'aperture')[0]?.axis).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('offers its marks on every authored map', () => {
    for (const map of [
      'seed-1', 'seed-42', 'seed-777', 'seed-999',
      'seed-1234', 'seed-2026', 'seed-31337', 'seed-80085',
    ]) {
      const island = templateToIsland(templateOrDefault(map));
      const marks = islandMarks(island, () => 0);
      for (const id of ['office.approach', 'office.threshold', 'office.counter']) {
        expect(marks.has(id), `${id} on ${map}`).toBe(true);
      }
    }
  });
});

/**
 * Both sets seat on every authored map.
 *
 * The narrow version of C6's coherency gate: no shot testing yet, but a set
 * whose anchor landmark is missing, or whose marks cannot be resolved, fails
 * here with the map named rather than at the first frame of the opening.
 */
describe('seating on the authored maps', () => {
  const MAPS = [
    'seed-1', 'seed-42', 'seed-777', 'seed-999',
    'seed-1234', 'seed-2026', 'seed-31337', 'seed-80085',
  ];
  const flat = (): number => 0;

  for (const map of MAPS) {
    it(`seats the ferry on ${map}`, () => {
      const island = templateToIsland(templateOrDefault(map));
      for (const id of ['ferry']) {
        const set = byId(id);
        const placement = bindSet(set, island, flat);
        expect(Number.isFinite(placement.origin.x), `${id} on ${map}`).toBe(true);
        expect(Number.isFinite(placement.yaw), `${id} on ${map}`).toBe(true);
        for (const mark of [...set.marks, ...set.seats]) {
          expect(Number.isFinite(placement.markWorld(mark.id).x)).toBe(true);
        }
      }
    });
  }

  it('seats the ferry and the office apart, so the walk inland is a walk', () => {
    const island = templateToIsland(templateOrDefault('seed-42'));
    const ferry = bindSet(byId('ferry'), island, flat);
    const threshold = islandMarks(island, flat).get('office.threshold');
    expect(threshold, 'seed-42 offers no office.threshold').toBeDefined();
    expect(ferry.origin.distanceTo(threshold!.position)).toBeGreaterThan(5);
  });
});
