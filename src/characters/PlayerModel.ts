import { PALETTE_CSS, PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { fabricSheet } from '../core/texturePaint';
import { FaceRig } from './FaceRig';

/**
 * The postmaster: Animal Crossing proportions (oversized head, small body)
 * with the Homura look — long ink-black hair panels, red headband, violet
 * eyes, and a tintable long coat. Named nodes let Player.ts animate the walk
 * and re-tint the coat when clothing changes.
 */
export interface PlayerModelParts {
  root: THREE.Group;
  coatMats: THREE.MeshLambertMaterial[];
  hairPivot: THREE.Group;
  backHair: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  satchel: THREE.Mesh;
  body: THREE.Group;
}

export function createPlayerModel(coatColor = PALETTE_HEX.h4a5a78): PlayerModelParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const skin = makeRetroMaterial({ color: PALETTE_HEX.he8d5c0 });
  const hairMat = makeRetroMaterial({ color: PALETTE_HEX.h201f26 }); // ink black
  // Coat cloth: near-white painted fold sheet, tinted live by material.color
  // so equipping a different coat still just re-tints.
  const coatCloth = fabricSheet(PALETTE_CSS.hdcdcdc, { folds: 6 });
  const coatMat = makeRetroMaterial({ color: coatColor, map: coatCloth });
  const coatMat2 = makeRetroMaterial({ color: coatColor, map: coatCloth });

  // --- Legs (dark tights + shoes)
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.38, 5);
  const legMat = makeRetroMaterial({ color: PALETTE_HEX.h2a2630 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.name = 'legL';
  legL.position.set(-0.14, 0.19, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.name = 'legR';
  legR.position.set(0.14, 0.19, 0);
  const shoeGeo = new THREE.BoxGeometry(0.16, 0.1, 0.26);
  const shoeMat = makeRetroMaterial({ color: PALETTE_HEX.h3c3430 });
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
  shoeL.position.set(0, -0.19, 0.05);
  legL.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
  shoeR.position.set(0, -0.19, 0.05);
  legR.add(shoeR);
  body.add(legL, legR);

  // --- Torso: long coat (slightly flared cylinder), belt
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.62, 8), coatMat);
  torso.position.y = 0.66;
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 8), makeRetroMaterial({ color: PALETTE_HEX.h3c352c }));
  belt.position.y = 0.72;
  body.add(belt);

  // --- Arms: shoulder pivot -> upper arm -> elbow pivot -> forearm + hand.
  const upperGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.24, 5);
  const forearmGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.22, 5);
  const handGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const buildArm = (name: 'armL' | 'armR', sideX: number): [THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    const upper = new THREE.Mesh(upperGeo, coatMat2);
    upper.position.y = -0.12;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    const forearm = new THREE.Mesh(forearmGeo, coatMat2);
    forearm.position.y = -0.11;
    const hand = new THREE.Mesh(handGeo, skin);
    hand.position.y = -0.24;
    elbow.add(forearm, hand);
    elbow.rotation.x = -0.3; // natural resting bend
    shoulder.add(elbow);
    shoulder.position.set(sideX, 0.94, 0);
    body.add(shoulder);
    return [shoulder, elbow];
  };
  const [armL, elbowL] = buildArm('armL', -0.3);
  const [armR, elbowR] = buildArm('armR', 0.3);

  // --- Satchel (postal bag, crossbody)
  const satchel = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.28, 0.12),
    makeRetroMaterial({ map: fabricSheet(PALETTE_CSS.h8a6b45, { folds: 3 }) }),
  );
  satchel.position.set(0.3, 0.55, 0.12);
  satchel.rotation.z = -0.1;
  body.add(satchel);
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), makeRetroMaterial({ color: PALETTE_HEX.h54432f }));
  strap.position.set(0.12, 0.82, 0.1);
  strap.rotation.z = 0.65;
  body.add(strap);

  // --- Head: AC-style oversized
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.28;
  body.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), skin);
  face.scale.set(1, 0.92, 0.95);
  head.add(face);

  // Painted face: calm violet Homura eyes, soft blush, small smile — with
  // expression swaps (blink / happy / surprised / asleep) via the FaceRig.
  const faceRig = new FaceRig({
    style: 'human',
    eyeColor: PALETTE_CSS.h6a4a8a,
    lashes: true,
    blush: PALETTE_CSS.hd8886a,
    mouth: 'smile',
    mouthColor: PALETTE_CSS.ha8746a,
    spacing: 0.36,
    eyeScale: 1.45,
    width: 0.46,
    height: 0.3,
    curve: 0.06,
  });
  faceRig.mesh.position.set(0, 0.02, 0.35);
  head.add(faceRig.mesh);
  root.userData.faceRig = faceRig;

  // --- Hair: sleek cap + long straight back/side panels + center-parted bangs
  const hairPivot = new THREE.Group();
  head.add(hairPivot);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.37, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  cap.position.y = 0.04;
  hairPivot.add(cap);
  // A lighter sheen across the crown. Ink-black hair under flat shading is a
  // silhouette with no interior — one lifted tone gives the head form.
  const sheenMat = makeRetroMaterial({ color: PALETTE_HEX.h3b3947 });
  const sheen = new THREE.Mesh(
    new THREE.SphereGeometry(0.375, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.3),
    sheenMat,
  );
  sheen.position.y = 0.055;
  hairPivot.add(sheen);
  // Bangs: a pointed centre lock with two swept sides, so the front reads as
  // a hairline instead of the smooth edge of a dome.
  const bangGeo = new THREE.BoxGeometry(0.17, 0.15, 0.07);
  const bangL = new THREE.Mesh(bangGeo, hairMat);
  bangL.position.set(-0.13, 0.2, 0.29);
  bangL.rotation.z = 0.3;
  const bangR = new THREE.Mesh(bangGeo, hairMat);
  bangR.position.set(0.13, 0.2, 0.29);
  bangR.rotation.z = -0.3;
  const bangC = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), hairMat);
  bangC.position.set(0, 0.19, 0.31);
  bangC.rotation.set(Math.PI, Math.PI / 4, 0);
  hairPivot.add(bangL, bangR, bangC);
  // Swept locks in front of each ear, tapering to a point at the jaw.
  for (const side of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 4), hairMat);
    lock.position.set(side * 0.29, -0.06, 0.19);
    lock.rotation.set(0.12, Math.PI / 4, side * -0.16);
    hairPivot.add(lock);
  }
  // Long back panel reaching the waist, tapering to a point rather than
  // ending in a slab — the silhouette from behind is half the character.
  const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.14), hairMat);
  backHair.position.set(0, -0.42, -0.28);
  hairPivot.add(backHair);
  const backTip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.34, 4), hairMat);
  backTip.position.set(0, -1.02, -0.28);
  backTip.rotation.set(Math.PI, Math.PI / 4, 0);
  hairPivot.add(backTip);
  // Side panels framing the face.
  const sideGeo = new THREE.BoxGeometry(0.12, 0.75, 0.16);
  const sideL = new THREE.Mesh(sideGeo, hairMat);
  sideL.position.set(-0.34, -0.26, 0.06);
  const sideR = new THREE.Mesh(sideGeo, hairMat);
  sideR.position.set(0.34, -0.26, 0.06);
  hairPivot.add(sideL, sideR);
  // Red headband ribbon.
  const bandMat = makeRetroMaterial({ color: PALETTE_HEX.ha8302f });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 5, 12, Math.PI), bandMat);
  band.position.y = 0.2;
  band.rotation.x = -0.5;
  hairPivot.add(band);
  const bowL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), bandMat);
  bowL.position.set(-0.24, 0.3, 0.16);
  bowL.rotation.z = 0.5;
  hairPivot.add(bowL);

  return {
    root,
    coatMats: [coatMat, coatMat2],
    hairPivot,
    backHair,
    legL,
    legR,
    armL,
    armR,
    elbowL,
    elbowR,
    satchel,
    body,
  };
}
