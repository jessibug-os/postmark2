import { describe, expect, it } from 'vitest';
import {
  componentsOf, formatGameObject, parseGameObject, GameObjectParseError,
} from '../src/world/objects/GameObjectFormat';
import { ACTIVE_GAME_OBJECTS } from '../src/content/activePack';

const sources = import.meta.glob('../src/content/kindly-forward/objects/*.gameobj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files = Object.keys(sources).sort();

describe('the .gameobj format', () => {
  it('round-trips every authored object byte-identically', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(formatGameObject(parseGameObject(sources[file], file)), file).toBe(sources[file]);
    }
  });

  it('names the line for an unknown component', () => {
    expect(() => parseGameObject('# object: x\n# model: x.glb\n\nglow bright\n', 'x.gameobj'))
      .toThrow(/x\.gameobj:4: unknown component "glow"/);
  });

  it('requires a model, since an object without one cannot be placed', () => {
    expect(() => parseGameObject('# object: x\n')).toThrow(GameObjectParseError);
    expect(() => parseGameObject('# object: x\n')).toThrow(/missing "model:"/);
  });

  /**
   * The failure this catches parses, reads correctly, and does nothing at
   * runtime — an interaction pointed at a seat the object does not have.
   */
  it('refuses an interact naming a seat that does not exist', () => {
    const text = '# object: b\n# model: b.glb\n\nseat left at 0 0 0\ninteract sit right\n';
    expect(() => parseGameObject(text, 'b.gameobj'))
      .toThrow(/interact sit "right" names no seat on "b"/);
  });

  it('rejects a collide radius that is not positive', () => {
    expect(() => parseGameObject('# object: x\n# model: x.glb\n\ncollide circle 0\n'))
      .toThrow(/collide radius must be positive/);
  });
});

describe('the authored objects', () => {
  const object = (id: string) => {
    const found = ACTIVE_GAME_OBJECTS.get(id);
    expect(found, `${id}.gameobj is missing`).toBeDefined();
    return found!;
  };

  /**
   * The post office's walls, recovered from `OpeningSet.buildPostOffice` when
   * that builder was deleted. Nine circles, and the front doorway carries none
   * on purpose: the player walks in through it, and a single footprint circle
   * would seal the entrance and push them off the threshold mid-reveal.
   */
  it('traces the office walls and leaves the doorway open', () => {
    const walls = componentsOf(object('post-office'), 'collide');
    expect(walls).toHaveLength(9);
    expect(walls.every((wall) => wall.radius === 1.15)).toBe(true);
    // Nothing within the doorway gap on the front face.
    const door = walls.filter((wall) => wall.at.z > 3 && Math.abs(wall.at.x) < 1.1);
    expect(door).toEqual([]);
  });

  /**
   * One seat, and an interaction that reaches it.
   *
   * The bench is 1.66 wide and the Postmaster is 1.34, so a seat at either end
   * left her overhanging the slats with nowhere for a second sitter to go. A
   * bench this size holds one of her.
   */
  it('gives the bench a seat and an interaction that reaches it', () => {
    const bench = object('bench');
    const seats = componentsOf(bench, 'seat');
    expect(seats.map((seat) => seat.id)).toEqual(['middle']);
    const interact = componentsOf(bench, 'interact')[0];
    expect(interact?.verb).toBe('sit');
    expect(seats.some((seat) => seat.id === interact?.target)).toBe(true);
  });

  /**
   * Seat height is measured off the mesh, not estimated. The slats top out at
   * 0.78 and her hips ride 0.3 above her own origin in the seated pose, so the
   * seat sits at the difference — anything else puts her through the bench or
   * hovering over it, and both look like a bug rather than a number.
   */
  it('places the seat where her hips land on the slats', () => {
    const seat = componentsOf(object('bench'), 'seat')[0];
    expect(seat.at.y).toBeCloseTo(0.78 - 0.3, 6);
    // Clear of the backrest, which the mesh puts at z -0.23.
    expect(seat.at.z).toBeGreaterThan(-0.23);
  });

  it('gives every object a model the runtime could load', () => {
    for (const entry of ACTIVE_GAME_OBJECTS.values()) {
      expect(entry.model, entry.id).toMatch(/\.glb$/);
    }
  });
});
