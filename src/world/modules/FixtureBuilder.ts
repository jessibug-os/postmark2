import * as THREE from 'three';
import type { TownMap } from '../TownMap';
import { assets } from '../../core/AssetLoader';
import { ACTIVE_LAYOUT } from '../mapConstants';
import { heightAt } from '../terrain';
import { islandFixtures } from '../island/AcreFixtures';
import { activeGameObject } from '../../content/activePack';
import { componentsOf } from '../objects/GameObjectFormat';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Build every prop a `unique` acre carries into the world.
 *
 * This is the half of acre fixtures that was missing: the format, the editor,
 * the mark resolution and the scene host all landed, and nothing ever
 * instantiated the geometry. The post office looked fine only because it had a
 * hand-written builder of its own left over from when it was a `.set`, so a
 * bench placed in the same acre saved correctly, drew correctly in `/acre`, and
 * then existed nowhere in the game.
 *
 * Generic on purpose. A builder per prop is how the post office came to have
 * one, and the next prop would have needed another.
 *
 * **Fixtures carry no collision.** What shape a fixture blocks is a real
 * question the format does not answer yet, so this pass adds geometry only and
 * says so; collision must become authored fixture data rather than another
 * per-prop runtime builder.
 */
export function buildAcreFixtures(this: TownMap): void {
  const island = ACTIVE_LAYOUT.acres;
  if (!island) return;

  const group = new THREE.Group();
  group.name = 'acre-fixtures';
  this.placedObjects.length = 0;
  for (const placed of islandFixtures(island, heightAt)) {
    if (placed.kind !== 'prop' || !placed.object) continue;
    const definition = activeGameObject(placed.object);
    if (!definition) {
      console.warn(
        `[fixtures] acre (${placed.acre.col},${placed.acre.row}) prop "${placed.id}" `
        + `names object type "${placed.object}", which this content pack does not define`,
      );
      continue;
    }
    const id = assets.idForFile(definition.model);
    if (!id) {
      // Named but not loadable: the file is on disk and `/acre` will happily
      // offer it, but the runtime only preloads what its own manifest lists.
      // Reported rather than thrown — one unbuildable prop should not cost the
      // whole island — and named, because "nothing appeared" is the symptom
      // that sent someone looking for this code in the first place.
      console.warn(
        `[fixtures] acre (${placed.acre.col},${placed.acre.row}) prop "${placed.id}" is a `
        + `"${placed.object}", whose model "${definition.model}" is not in the runtime `
        + 'asset manifest',
      );
      continue;
    }
    const model = assets.model(id);
    // Named by acre *and* fixture. A fixture id is only unique within its own
    // piece — marks are global and enforced, props are not — so two acres each
    // carrying a `prop-1` are perfectly legal and did both land here under one
    // name. The acre makes the handle unambiguous without making ids global,
    // which they have no reason to be.
    model.name = `acre-fixture-${placed.acre.col}-${placed.acre.row}-${placed.id}`;
    model.position.copy(placed.position);
    model.rotation.y = placed.yaw;
    group.add(model);
    this.placedObjects.push({
      id: `${placed.acre.col}-${placed.acre.row}-${placed.id}`,
      type: placed.object,
      definition,
      position: placed.position.clone(),
      yaw: placed.yaw,
      object: model,
    });

    // Collision comes from the object type, not from the instance: what a
    // bench blocks is a property of benches. Circles are traced in the object's
    // own frame, so each turns with the instance that placed it.
    for (const circle of componentsOf(definition, 'collide')) {
      const spun = new THREE.Vector3(circle.at.x, 0, circle.at.z)
        .applyAxisAngle(UP, placed.yaw);
      this.addCollider(placed.position.x + spun.x, placed.position.z + spun.z, circle.radius);
    }
  }
  this.group.add(group);
}
