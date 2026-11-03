import * as THREE from 'three';
import { buildAuthoredInterior, type Interior } from './Interior';
import { CAFE_ANCHORS, CAFE_ROOM, CAFE_TABLES, cafeLocalToInterior } from '../content/little-harbor/cafeRoom';

/** Authored slice furnishings. The host owns room lifetime and command dispatch. */
export function furnishHarborCafe(room: Interior): void {
  if (room.group.getObjectByName('harbor-cafe-furnishings')) throw new Error('Cafe already furnished');
  const group = new THREE.Group(); group.name = 'harbor-cafe-furnishings';
  const wood = new THREE.MeshLambertMaterial({ color: 0x835c42 });
  const cream = new THREE.MeshLambertMaterial({ color: 0xe8d8b5 });
  const teal = new THREE.MeshLambertMaterial({ color: 0x477b78 });
  const ceramic = new THREE.MeshLambertMaterial({ color: 0xf5ebd7 });
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number,
    material: THREE.Material) => {
    const local = cafeLocalToInterior(x, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(local.x, y, local.z); group.add(mesh); return mesh;
  };
  const block = (x: number, z: number, w: number, d: number) => {
    const local = cafeLocalToInterior(x, z); room.addBoxCollider(local.x, local.z, w, d);
  };
  const cup = (name: string, x: number, y: number, z: number) => {
    const local = cafeLocalToInterior(x, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.16, 10), ceramic);
    body.name = name; body.position.set(local.x, y, local.z); group.add(body);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 5, 10), ceramic);
    handle.position.set(local.x + 0.09, y, local.z); group.add(handle);
  };
  box('counter-base', 5, 0.48, 1.8, 4, 0.96, 0.8, teal);
  box('counter-top', 5, 1.01, 1.8, 4.1, 0.1, 0.9, wood); block(5, 1.8, 4.1, 0.9);
  box('tray-pickup', 3.5, 1.09, 1.8, 0.65, 0.06, 0.45, cream);
  box('cup-return-base', 8.5, 0.48, 1.8, 1, 0.96, 0.8, teal);
  box('cup-return-tray', 8.5, 1.01, 1.8, 1.1, 0.1, 0.9, wood); block(8.5, 1.8, 1.1, 0.9);
  box('return-washing-tray', 8.5, 1.09, 1.8, 0.8, 0.06, 0.55, cream);
  cup('returned-cup', 8.3, 1.2, 1.8);
  cup('clean-cup', 6.5, 1.14, 1.8);
  for (const table of CAFE_TABLES) {
    box(`${table.id}.top`, table.x, 0.77, table.z, 1, 0.12, 0.8, wood);
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.25, 0.25])
      box(`${table.id}.leg`, table.x + dx, 0.35, table.z + dz, 0.08, 0.7, 0.08, wood);
    block(table.x, table.z, 1, 0.8);
    cup(`${table.id}.cup`, table.x + 0.2, 0.91, table.z);
  }
  for (const seat of CAFE_ANCHORS.filter(a => a.kind === 'seat')) {
    const { x, z, yaw } = seat.transform;
    const chair = new THREE.Group(); chair.name = seat.id;
    const local = cafeLocalToInterior(x, z); chair.position.set(local.x, 0, local.z); chair.rotation.y = yaw;
    const part = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      mesh.position.set(px, py, pz); chair.add(mesh);
    };
    part(0.48, 0.09, 0.48, 0, 0.45, 0);
    part(0.48, 0.48, 0.07, 0, 0.71, 0.22);
    for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) part(0.06, 0.42, 0.06, x, 0.21, z);
    group.add(chair); block(x, z, 0.48, 0.48);
  }
  room.group.add(group);
  for (const [id, label, action] of [
    ['counter', 'Talk to June', 'cafe:counter'],
    ['tray-pickup', 'Collect the order', 'cafe:pickup'],
    ['cup-return', 'Return the cup', 'cafe:return'],
  ]) {
    const anchor = CAFE_ANCHORS.find(a => a.id === `cafe.${id}`)!;
    const local = cafeLocalToInterior(anchor.transform.x, anchor.transform.z);
    room.hotspots.push({ ...local, radius: 0.65, label, action });
  }
}
export function buildHarborCafe(index: number): Interior {
  const room = buildAuthoredInterior('cafe', index, CAFE_ROOM.width, CAFE_ROOM.depth, 0);
  room.doorDepth = 0.35;
  const spawn = CAFE_ANCHORS.find(a => a.id === 'cafe.safe')!.transform;
  const local = cafeLocalToInterior(spawn.x, spawn.z); room.spawn.set(local.x, 0, local.z);
  furnishHarborCafe(room);
  return room;
}
