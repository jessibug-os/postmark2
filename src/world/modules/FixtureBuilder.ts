import * as THREE from 'three';
import type { Collider, PlacedObject, TownMap } from '../TownMap';
import { assets } from '../../core/AssetLoader';
import { ACTIVE_LAYOUT } from '../mapConstants';
import { heightAt } from '../terrain';
import { islandFixtures, type PlacedFixture } from '../island/AcreFixtures';
import { activeGameObject } from '../../content/activePack';
import { componentsOf } from '../objects/GameObjectFormat';
import { addDeck, type Deck } from '../decks';

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
  this.group.add(group);
  this.placedObjects.length = 0;
  for (const placed of islandFixtures(island, heightAt)) this.spawnFixture(placed);
}

export function spawnFixture(this: TownMap, placed: PlacedFixture): PlacedObject | null {
  if (placed.kind !== 'prop' || !placed.object) return null;
  const definition = activeGameObject(placed.object);
  if (!definition) {
    console.warn(
      `[fixtures] acre (${placed.acre.col},${placed.acre.row}) prop "${placed.id}" `
      + `names object type "${placed.object}", which this content pack does not define`,
    );
    return null;
  }
  const id = assets.idForFile(definition.model);
  if (!id) {
    console.warn(
      `[fixtures] acre (${placed.acre.col},${placed.acre.row}) prop "${placed.id}" is a `
      + `"${placed.object}", whose model "${definition.model}" is not in the runtime `
      + 'asset manifest',
    );
    return null;
  }
  const model = assets.model(id);
  model.name = `acre-fixture-${placed.acre.col}-${placed.acre.row}-${placed.id}`;
  model.position.copy(placed.position);
  model.rotation.y = placed.yaw;
  this.group.getObjectByName('acre-fixtures')?.add(model);
  const colliders: Collider[] = [];
  const decks: Deck[] = componentsOf(definition, 'deck').map((deck) => addDeck({
    x: placed.position.x, z: placed.position.z, yaw: placed.yaw,
    halfX: deck.halfX, halfZ: deck.halfZ, top: placed.position.y, open: deck.open,
  }));
  const object: PlacedObject = {
    id: `${placed.acre.col}-${placed.acre.row}-${placed.id}`,
    type: placed.object,
    definition,
    position: placed.position.clone(),
    yaw: placed.yaw,
    object: model,
    acre: placed.acre,
    piece: placed.piece ?? '',
    fixture: placed.id,
    colliders,
    decks,
  };
  this.placedObjects.push(object);
  for (const circle of componentsOf(definition, 'collide')) {
    const spun = new THREE.Vector3(circle.at.x, 0, circle.at.z)
      .applyAxisAngle(UP, placed.yaw);
    colliders.push(this.addCollider(placed.position.x + spun.x, placed.position.z + spun.z, circle.radius));
  }
  return object;
}

export function despawnFixture(this: TownMap, object: PlacedObject): void {
  object.object.removeFromParent();
  for (const collider of object.colliders) this.removeCollider(collider);
  for (const deck of object.decks) deck.active = false;
  const index = this.placedObjects.indexOf(object);
  if (index >= 0) this.placedObjects.splice(index, 1);
}

export function respawnFixture(this: TownMap, object: PlacedObject): void {
  this.group.getObjectByName('acre-fixtures')?.add(object.object);
  for (const collider of object.colliders) collider.active = true;
  for (const deck of object.decks) deck.active = true;
  if (!this.placedObjects.includes(object)) this.placedObjects.push(object);
}
