import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { seatWorld } from '../src/game/modules/FixtureInteraction';
import { parseGameObject, componentsOf } from '../src/world/objects/GameObjectFormat';

const bench = parseGameObject([
  '# object: bench',
  '# model: bench.glb',
  '',
  'seat left at -0.6 0.45 -0.1',
  'seat right at 0.6 0.45 -0.1 facing 90',
  'interact sit left',
  '',
].join('\n'));

const seat = (id: string) => {
  const found = componentsOf(bench, 'seat').find((candidate) => candidate.id === id);
  expect(found, id).toBeDefined();
  return found!;
};

const placed = (yaw: number) => ({
  id: '0-0-bench-1',
  type: 'bench',
  definition: bench,
  position: new THREE.Vector3(10, 2, -4),
  yaw,
  object: new THREE.Object3D(),
});

describe('seating', () => {
  it('offsets the seat from the object, in the object frame', () => {
    const { position } = seatWorld(placed(0), seat('left'));
    expect(position.x).toBeCloseTo(10 - 0.6, 6);
    expect(position.y).toBeCloseTo(2 + 0.45, 6);
    expect(position.z).toBeCloseTo(-4 - 0.1, 6);
  });

  /**
   * The failure this catches is a bench turned a quarter and a player seated
   * across it instead of along it — the offset has to rotate with the object,
   * not be added in world axes.
   */
  it('turns the offset with the object', () => {
    const quarter = Math.PI / 2;
    const { position } = seatWorld(placed(quarter), seat('left'));
    // Rotating (-0.6, -0.1) a quarter about +Y sends x to -z and z to x.
    expect(position.x).toBeCloseTo(10 - 0.1, 6);
    expect(position.z).toBeCloseTo(-4 + 0.6, 6);
  });

  it('faces the object way when the seat asks for nothing', () => {
    expect(seatWorld(placed(0.4), seat('left')).facing).toBeCloseTo(0.4, 6);
  });

  /**
   * A seat's `facing` is degrees clockwise in the object's frame and Three's Y
   * rotation runs the other way — the same conversion `AcreFixtures` makes for
   * a fixture's `turn`. Getting the sign wrong seats the player backwards.
   */
  it('applies the seat facing against the yaw, not with it', () => {
    const { facing } = seatWorld(placed(0), seat('right'));
    expect(facing).toBeCloseTo(-Math.PI / 2, 6);
  });
});
