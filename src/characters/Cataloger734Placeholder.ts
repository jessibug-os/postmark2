import { PALETTE_CSS, PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { applyVertexSnap, makeRetroMaterial } from '../core/RetroMaterial';
import { FaceRig } from './FaceRig';
import { woodSheet } from '../core/texturePaint';

/**
 * CATALOGER 734: box torso (specimen cabinet with drawer insets), six
 * segmented daddy-long-legs limbs, a cluster of jeweler's lenses for eyes,
 * and a single warm amber lamp at the core.
 *
 * Follows the animator naming contract: 'body', 'head' (lens housing),
 * 'eyeL'/'eyeR' (the two largest lenses shutter like blinks), 'amber' lamp.
 */
export function createCataloger734Placeholder(): THREE.Group {
  const root = new THREE.Group();
  const group = new THREE.Group();
  group.name = 'body';
  root.add(group);

  const brass = makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e });
  const darkWood = makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h4a3a2c) });
  const ivory = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 });

  // --- Torso: tall specimen cabinet, raised high on the legs.
  const torsoY = 2.6;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.8), darkWood);
  torso.position.y = torsoY;
  group.add(torso);

  // Drawer faces: shallow inset boxes on the front, 3 rows x 2 columns.
  const drawerGeo = new THREE.BoxGeometry(0.42, 0.36, 0.06);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const drawer = new THREE.Mesh(drawerGeo, ivory);
      drawer.position.set((col - 0.5) * 0.5, torsoY + (row - 1) * 0.45, 0.42);
      group.add(drawer);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), brass);
      knob.position.set(drawer.position.x, drawer.position.y, 0.47);
      group.add(knob);
    }
  }

  // --- Amber core lamp: the one warm glow.
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffb347 })),
  );
  lamp.name = 'amber';
  lamp.position.set(0, torsoY + 0.15, 0.46);
  group.add(lamp);
  const lampLight = new THREE.PointLight(PALETTE_HEX.hffb347, 4, 6, 2);
  lampLight.position.copy(lamp.position);
  group.add(lampLight);

  // --- Head group: brass housing + jeweler's lens cluster.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = torsoY + 1.0;
  group.add(head);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), brass);
  head.add(housing);

  const lensMat = makeRetroMaterial({ color: PALETTE_HEX.h2a2622 });
  const lensSpots: Array<[number, number, number, string | null]> = [
    [0, 0.02, 0.13, null], // big central lens
    [-0.16, 0.08, 0.09, 'eyeL'],
    [0.16, 0.08, 0.09, 'eyeR'],
    [-0.12, -0.08, 0.08, null],
    [0.12, -0.08, 0.08, null],
  ];
  lensSpots.forEach(([x, y, radius, name], i) => {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 8), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y, 0.22 + (i === 0 ? 0.04 : 0));
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.11, 8),
      lensMat,
    );
    if (name) glass.name = name;
    glass.rotation.x = Math.PI / 2;
    glass.position.copy(rim.position);
    glass.position.z += 0.01;
    head.add(rim, glass);
  });

  // Painted amber irises inside the two primary lenses — the cluster stays
  // 3D brass; only the gaze itself is a painted expression-swap decal.
  const faceRig = new FaceRig({
    style: 'lens',
    eyeColor: PALETTE_CSS.hc9932e,
    mouth: 'none',
    spacing: 0.64,
    eyeScale: 2.0,
    width: 0.5,
    height: 0.3,
  });
  faceRig.mesh.position.set(0, 0.062, 0.34);
  head.add(faceRig.mesh);
  root.userData.faceRig = faceRig;

  // --- Six segmented legs, daddy-long-legs style.
  const legMat = brass;
  const upperGeo = new THREE.CylinderGeometry(0.045, 0.035, 1.6, 5);
  const lowerGeo = new THREE.CylinderGeometry(0.035, 0.02, 2.4, 5);
  const hipY = torsoY - 0.4;
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const angle = side * (Math.PI / 2) + (i % 3 - 1) * 0.55 * side;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);

    const knee = new THREE.Vector3(dirX * 1.3, hipY + 0.9, dirZ * 1.3);
    const hip = new THREE.Vector3(dirX * 0.5, hipY, dirZ * 0.5);
    const foot = new THREE.Vector3(dirX * 2.2, 0, dirZ * 2.2);

    const upper = new THREE.Mesh(upperGeo, legMat);
    placeSegment(upper, hip, knee);
    const lower = new THREE.Mesh(lowerGeo, legMat);
    placeSegment(lower, knee, foot);
    group.add(upper, lower);
  }

  return root;
}

/** Position and orient a unit-length-agnostic cylinder between two points. */
function placeSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const dir = b.clone().sub(a);
  mesh.scale.y = dir.length() / (mesh.geometry as THREE.CylinderGeometry).parameters.height;
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
}
