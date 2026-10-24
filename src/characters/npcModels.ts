import { PALETTE_CSS, PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { applyVertexSnap, makeRetroMaterial } from '../core/RetroMaterial';
import { FaceRig, type FaceSpec } from './FaceRig';
import { metalSheet, woodSheet } from '../core/texturePaint';

/**
 * Procedural low-poly models for the clockwork townsfolk. Aged brass + ivory
 * + ink, exactly one warm amber glow per character.
 *
 * Hierarchy contract (consumed by CharacterAnimator):
 *   root -> 'body' group -> torso meshes, 'head' group (with 'eyeL'/'eyeR'),
 *   'armL'/'armR' groups pivoted at the shoulder, optional 'legL'/'legR',
 *   plus flourishes ('bell', 'drawer', 'crank'). The 'amber' mesh is the glow.
 */

function amberGlow(radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6),
    applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffb347 })),
  );
  mesh.name = 'amber';
  return mesh;
}

/** Attach a painted expression-swap face to a head and register it on root. */
function paintedFace(
  root: THREE.Group,
  head: THREE.Group,
  spec: FaceSpec,
  at: [number, number, number],
): void {
  const rig = new FaceRig(spec);
  rig.mesh.position.set(at[0], at[1], at[2]);
  head.add(rig.mesh);
  root.userData.faceRig = rig;
}

/** Arm group pivoted at the shoulder; the limb mesh hangs below the pivot. */
function arm(
  name: 'armL' | 'armR',
  length: number,
  radiusTop: number,
  radiusBottom: number,
  mat: THREE.Material,
  handMat?: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 5),
    mat,
  );
  limb.position.y = -length / 2;
  g.add(limb);
  if (handMat) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(radiusBottom * 1.5, 6, 5), handMat);
    hand.position.y = -length;
    g.add(hand);
  }
  return g;
}

/** SPARKS — round cheerful admin-bot; brass kettle body, bell antenna, clipboard. */
export function createSparks(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const brass = makeRetroMaterial({ map: metalSheet(PALETTE_CSS.hb08d52) });
  const brassDark = makeRetroMaterial({ color: PALETTE_HEX.h8a6f42 });
  const ivory = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 });

  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), brass);
  kettle.position.y = 0.7;
  kettle.scale.set(1, 1.05, 0.95);
  body.add(kettle);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.06), ivory);
  plate.position.set(0, 0.66, 0.52);
  body.add(plate);
  const core = amberGlow(0.09);
  core.position.set(0, 0.95, 0.5);
  body.add(core);

  // Stubby feet (named legs so the animator patters them).
  const footGeo = new THREE.BoxGeometry(0.24, 0.16, 0.34);
  const footL = new THREE.Mesh(footGeo, brassDark);
  footL.name = 'legL';
  footL.position.set(-0.24, 0.08, 0.05);
  const footR = new THREE.Mesh(footGeo, brassDark);
  footR.name = 'legR';
  footR.position.set(0.24, 0.08, 0.05);
  body.add(footL, footR);

  // Arms with shoulder pivots; right hand holds the clipboard.
  const armL = arm('armL', 0.42, 0.06, 0.05, brassDark);
  armL.position.set(-0.5, 0.92, 0.08);
  armL.rotation.z = 0.45;
  const armR = arm('armR', 0.42, 0.06, 0.05, brassDark);
  armR.position.set(0.5, 0.92, 0.08);
  armR.rotation.z = -0.45;
  const clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.04), ivory);
  clipboard.position.set(0.04, -0.42, 0.12);
  clipboard.rotation.x = -0.5;
  armR.add(clipboard);
  body.add(armL, armR);

  // Head group: dome, eyes with ivory dial-rings, bell antenna.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.42;
  body.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), brass);
  dome.position.y = 0.08;
  head.add(dome);
  // Painted dial-eye face with ivory rings and a warm little smile.
  paintedFace(root, head, {
    style: 'lens',
    eyeColor: PALETTE_CSS.hc9932e,
    blush: PALETTE_CSS.hc97a4a,
    mouth: 'smile',
    mouthColor: PALETTE_CSS.h6a5232,
    spacing: 0.38,
    eyeScale: 1.8,
    width: 0.52,
    height: 0.34,
    curve: 0.07,
  }, [0, 0.12, 0.43]);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 4), brassDark);
  antenna.position.y = 0.56;
  head.add(antenna);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }));
  bell.position.y = 0.76;
  bell.name = 'bell';
  head.add(bell);

  return root;
}

/** REGGIE — cash-register/jukebox fusion, hip-hop styling, brass chain. */
export function createReggie(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const burgundy = makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h6a3540, { vertical: true, planks: 4 }) });
  const brass = makeRetroMaterial({ color: PALETTE_HEX.hb08d52 });
  const dark = makeRetroMaterial({ color: PALETTE_HEX.h2e2a26 });
  const ivory = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.9), burgundy);
  torso.position.y = 1.0;
  body.add(torso);
  const torsoTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.65, 0.9, 10, 1, false, 0, Math.PI),
    burgundy,
  );
  torsoTop.rotation.z = Math.PI / 2;
  torsoTop.rotation.x = Math.PI / 2;
  torsoTop.position.y = 1.65;
  body.add(torsoTop);
  const grill = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10), dark);
  grill.position.set(0, 1.1, 0.46);
  body.add(grill);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12 + i * 0.11, 0.015, 4, 10), brass);
    ring.position.set(0, 1.1, 0.47);
    body.add(ring);
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.1), brass);
  drawer.position.set(0, 0.5, 0.48);
  drawer.name = 'drawer';
  body.add(drawer);
  const archMat = makeRetroMaterial({ color: PALETTE_HEX.hc9a227 });
  for (let i = -2; i <= 2; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), archMat);
    const a = (i / 2) * 0.9;
    bulb.position.set(Math.sin(a) * 0.62, 1.68 + Math.cos(a) * 0.55, 0.46);
    body.add(bulb);
  }
  const windowGlow = amberGlow(0.12);
  windowGlow.position.set(0, 1.78, 0.4);
  body.add(windowGlow);

  // Head group: register-key face, amber eyes, backwards cap.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 2.35;
  body.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.6), dark);
  head.add(skull);
  const keyGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6);
  for (let kx = -1; kx <= 1; kx++) {
    const key = new THREE.Mesh(keyGeo, ivory);
    key.rotation.x = Math.PI / 2;
    key.position.set(kx * 0.2, -0.21, 0.32);
    head.add(key);
  }
  // Painted amber display-bar eyes and a lit grin — a face like a marquee.
  paintedFace(root, head, {
    style: 'glow',
    glowShape: 'bar',
    eyeColor: PALETTE_CSS.hffb347,
    mouth: 'grin',
    mouthColor: PALETTE_CSS.he8983f,
    spacing: 0.46,
    eyeScale: 1.35,
    width: 0.72,
    height: 0.44,
  }, [0, 0.06, 0.315]);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.16, 8), makeRetroMaterial({ color: PALETTE_HEX.h3f4a5a }));
  cap.position.y = 0.33;
  head.add(cap);
  const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), makeRetroMaterial({ color: PALETTE_HEX.h3f4a5a }));
  capBrim.position.set(0, 0.27, -0.5);
  head.add(capBrim);

  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 4, 12), brass);
  chain.position.set(0, 1.62, 0.44);
  chain.rotation.x = 0.35;
  body.add(chain);
  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8), brass);
  medallion.rotation.x = Math.PI / 2 + 0.35;
  medallion.position.set(0, 1.28, 0.55);
  body.add(medallion);

  // Arms (chunky), shoulder-pivoted.
  const armL = arm('armL', 0.6, 0.09, 0.07, dark, brass);
  armL.position.set(-0.75, 1.5, 0);
  armL.rotation.z = 0.25;
  const armR = arm('armR', 0.6, 0.09, 0.07, dark, brass);
  armR.position.set(0.75, 1.5, 0);
  armR.rotation.z = -0.25;
  body.add(armL, armR);

  // Legs + fresh kicks.
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.4), dark);
    leg.name = side === -1 ? 'legL' : 'legR';
    leg.position.set(side * 0.35, 0.25, 0);
    body.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.6), ivory);
    shoe.position.set(0, -0.16, 0.12);
    leg.add(shoe);
  }
  return root;
}

/** MARIGOLD — rotund boiler-bodied gardener; copper, planter hat. */
export function createMarigold(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const copper = makeRetroMaterial({ map: metalSheet(PALETTE_CSS.h9c6a4a) });
  const copperDark = makeRetroMaterial({ color: PALETTE_HEX.h7a5238 });
  const green = makeRetroMaterial({ color: PALETTE_HEX.h5a6b3f });

  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.2, 10), copper);
  boiler.position.y = 0.85;
  body.add(boiler);
  for (const y of [0.5, 0.9, 1.3]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(y === 0.9 ? 0.63 : 0.66, 0.03, 4, 10), copperDark);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    body.add(band);
  }
  const door = amberGlow(0.11);
  door.position.set(0, 0.8, 0.62);
  body.add(door);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.8;
  body.add(head);
  const noggin = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), copper);
  noggin.position.y = 0.05;
  head.add(noggin);
  // Painted gardener's face: warm dial eyes, sun-blush, gentle smile.
  paintedFace(root, head, {
    style: 'lens',
    eyeColor: PALETTE_CSS.h4a3527,
    blush: PALETTE_CSS.hc96a3f,
    mouth: 'smile',
    mouthColor: PALETTE_CSS.h6a4632,
    spacing: 0.36,
    eyeScale: 1.5,
    width: 0.5,
    height: 0.32,
    curve: 0.07,
  }, [0, 0.12, 0.45]);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.24, 8), makeRetroMaterial({ color: PALETTE_HEX.h8a5a3c }));
  pot.position.y = 0.5;
  head.add(pot);
  const sprout = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), green);
  sprout.position.y = 0.68;
  head.add(sprout);
  const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }));
  bloom.position.set(0.08, 0.76, 0.05);
  head.add(bloom);

  const armL = arm('armL', 0.55, 0.07, 0.06, copperDark, green);
  armL.position.set(-0.62, 1.15, 0.05);
  armL.rotation.z = 0.4;
  const armR = arm('armR', 0.55, 0.07, 0.06, copperDark, green);
  armR.position.set(0.62, 1.15, 0.05);
  armR.rotation.z = -0.4;
  body.add(armL, armR);

  const tread = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), copperDark);
  tread.rotation.z = Math.PI / 2;
  tread.position.y = 0.3;
  body.add(tread);
  return root;
}

/** BUOY — bathysphere fisher-bot; porthole face, cork fenders, rod on back. */
export function createBuoy(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const steel = makeRetroMaterial({ map: metalSheet(PALETTE_CSS.h6a7a82, { patina: PALETTE_CSS.h4a6a72 }) });
  const steelDark = makeRetroMaterial({ color: PALETTE_HEX.h4c5a62 });
  const cork = makeRetroMaterial({ color: PALETTE_HEX.hb09a6a });

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), steel);
  sphere.position.y = 0.95;
  body.add(sphere);

  // Porthole face doubles as the head node (the whole sphere can't turn, but
  // the lamp housing glances around inside the porthole).
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.05, 0.55);
  body.add(head);
  const porthole = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 5, 12), makeRetroMaterial({ color: PALETTE_HEX.hb08d52 }));
  porthole.position.z = 0.13;
  head.add(porthole);
  const lamp = amberGlow(0.2);
  lamp.position.z = 0.05;
  head.add(lamp);
  // Painted pupils on the lamp glass, so BUOY has a gaze that can blink.
  paintedFace(root, head, {
    style: 'lens',
    eyeColor: PALETTE_CSS.h3a3026,
    mouth: 'none',
    spacing: 0.42,
    eyeScale: 0.85,
    width: 0.34,
    height: 0.22,
    curve: 0.05,
  }, [0, 0.03, 0.26]);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), steelDark);
    rivet.position.set(Math.cos(a) * 0.75, 0.95, Math.sin(a) * 0.75);
    body.add(rivet);
  }
  for (const side of [-1, 1] as const) {
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 7), cork);
    fender.position.set(side * 0.8, 0.95, 0);
    body.add(fender);
  }
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 5), steelDark);
    leg.name = side === -1 ? 'legL' : 'legR';
    leg.position.set(side * 0.3, 0.2, 0);
    body.add(leg);
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.5), cork);
    flipper.position.set(0, -0.16, 0.15);
    leg.add(flipper);
  }
  const armL = arm('armL', 0.5, 0.07, 0.06, steelDark);
  armL.position.set(-0.78, 1.05, 0.15);
  armL.rotation.z = 0.5;
  const armR = arm('armR', 0.5, 0.07, 0.06, steelDark);
  armR.position.set(0.78, 1.05, 0.15);
  armR.rotation.z = -0.5;
  body.add(armL, armR);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.8, 4), makeRetroMaterial({ color: PALETTE_HEX.h8a6b45 }));
  rod.position.set(-0.1, 1.35, -0.72);
  rod.rotation.z = 0.9;
  body.add(rod);
  const anchor = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 4, 8), makeRetroMaterial({ color: PALETTE_HEX.hb08d52 }));
  anchor.position.set(0.4, 0.45, 0.62);
  body.add(anchor);
  return root;
}

/** WICK — the lamplighter: tall, thin, a hurricane-lamp for a head. */
export function createWick(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const iron = makeRetroMaterial({ color: PALETTE_HEX.h4a443c });
  const brass = makeRetroMaterial({ map: metalSheet(PALETTE_CSS.hb08d52) });
  const ivory = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 });

  // Candlestick torso: slender fluted column with a drip-tray collar.
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 7), brass);
  column.position.y = 1.15;
  body.add(column);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 8), iron);
  collar.position.y = 1.85;
  body.add(collar);
  const skirtBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.5, 8), iron);
  skirtBase.position.y = 0.55;
  body.add(skirtBase);

  // Long stilt legs.
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.65, 5), iron);
    leg.name = side === -1 ? 'legL' : 'legR';
    leg.position.set(side * 0.14, 0.32, 0);
    body.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.28), brass);
    foot.position.set(0, -0.3, 0.06);
    leg.add(foot);
  }

  // Head: hurricane lamp with a flame that IS his amber glow.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 2.1;
  body.add(head);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 6, 1, true), brass);
  head.add(cage);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 0.44, 6),
    applyVertexSnap(new THREE.MeshLambertMaterial({ color: PALETTE_HEX.hfff4dc, transparent: true, opacity: 0.35 })),
  );
  head.add(glass);
  const flame = amberGlow(0.11);
  flame.position.y = 0.02;
  flame.scale.y = 1.5;
  head.add(flame);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 6), iron);
  cap.position.y = 0.36;
  head.add(cap);
  // Squinting slit-eyes etched on the glass front.
  paintedFace(root, head, {
    style: 'glow',
    glowShape: 'slit',
    eyeColor: PALETTE_CSS.h3a2e22,
    mouth: 'none',
    spacing: 0.4,
    width: 0.32,
    height: 0.22,
    curve: 0.04,
  }, [0, 0.05, 0.25]);

  // Arms; right holds the lighting pole.
  const armL = arm('armL', 0.5, 0.05, 0.04, iron);
  armL.position.set(-0.3, 1.75, 0);
  armL.rotation.z = 0.3;
  const armR = arm('armR', 0.5, 0.05, 0.04, iron);
  armR.position.set(0.3, 1.75, 0);
  armR.rotation.z = -0.3;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 4), brass);
  pole.position.set(0.05, -0.55, 0.1);
  pole.rotation.x = 0.25;
  armR.add(pole);
  const poleTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }));
  poleTip.position.set(0.05, -1.38, 0.32);
  armR.add(poleTip);
  body.add(armL, armR);

  const bowtie = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), ivory);
  bowtie.position.set(0, 1.78, 0.3);
  bowtie.rotation.z = 0.1;
  body.add(bowtie);
  return root;
}

/** FERN — the herbalist: a copper teapot with a leaf-sprout lid. */
export function createFern(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const copper = makeRetroMaterial({ map: metalSheet(PALETTE_CSS.h8a6a52) });
  const copperDark = makeRetroMaterial({ color: PALETTE_HEX.h6a4f3c });
  const green = makeRetroMaterial({ color: PALETTE_HEX.h5a7a4a });
  const cream = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 });

  // Teapot body.
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), copper);
  pot.position.y = 0.75;
  pot.scale.y = 0.9;
  body.add(pot);
  // Spout (left side) and handle (right side).
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.55, 6), copperDark);
  spout.position.set(-0.62, 0.9, 0.1);
  spout.rotation.z = 1.0;
  body.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 5, 10, Math.PI), copperDark);
  handle.position.set(0.6, 0.8, 0);
  handle.rotation.z = -Math.PI / 2;
  body.add(handle);
  // Painted cream band with little leaves.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.585, 0.585, 0.18, 12), cream);
  band.position.y = 0.78;
  body.add(band);
  const steam = amberGlow(0.07);
  steam.position.set(-0.78, 1.18, 0.12);
  body.add(steam);

  // Head: the lid, with a sprout.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.38;
  body.add(head);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.34, 9, 7, 0, Math.PI * 2, 0, Math.PI / 2), copper);
  head.add(lid);
  // Painted herbalist face: small kind eyes and a leaf-tea blush.
  paintedFace(root, head, {
    style: 'lens',
    eyeColor: PALETTE_CSS.h3a2c20,
    blush: PALETTE_CSS.hb06a4a,
    mouth: 'smile',
    mouthColor: PALETTE_CSS.h5c4432,
    spacing: 0.38,
    eyeScale: 1.2,
    width: 0.42,
    height: 0.28,
    curve: 0.06,
  }, [0, 0.08, 0.37]);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 4), green);
  stem.position.y = 0.32;
  head.add(stem);
  for (const side of [-1, 1] as const) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), green);
    leaf.position.set(side * 0.1, 0.44, 0);
    leaf.scale.set(1.3, 0.5, 0.7);
    leaf.rotation.z = side * 0.5;
    head.add(leaf);
  }

  const armL = arm('armL', 0.42, 0.055, 0.05, copperDark, green);
  armL.position.set(-0.5, 0.95, 0.2);
  armL.rotation.z = 0.5;
  const armR = arm('armR', 0.42, 0.055, 0.05, copperDark, green);
  armR.position.set(0.5, 0.95, 0.2);
  armR.rotation.z = -0.5;
  // A woven basket on the left arm.
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.16, 7), makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }));
  basket.position.set(-0.05, -0.45, 0.08);
  armL.add(basket);
  body.add(armL, armR);

  // Little rounded feet under a skirt rim.
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.16, 10), copperDark);
  rim.position.y = 0.22;
  body.add(rim);
  for (const side of [-1, 1] as const) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), copperDark);
    foot.name = side === -1 ? 'legL' : 'legR';
    foot.position.set(side * 0.2, 0.08, 0.1);
    body.add(foot);
  }
  return root;
}

/** PLINK — the street musician: a barrel organ on legs, crank and all. */
export function createPlink(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const walnut = makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h6a4a34) });
  const walnutDark = makeRetroMaterial({ color: PALETTE_HEX.h503626 });
  const brass = makeRetroMaterial({ color: PALETTE_HEX.hb08d52 });
  const ivory = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 });

  // Barrel-organ torso with pipe rows.
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.7), walnut);
  box.position.y = 0.95;
  body.add(box);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.1, 0.76), brass);
  trim.position.y = 1.36;
  body.add(trim);
  for (let i = 0; i < 5; i++) {
    const pipeHeight = 0.3 + Math.abs(i - 2) * -0.06 + 0.3;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, pipeHeight, 6), brass);
    pipe.position.set(-0.36 + i * 0.18, 1.4 + pipeHeight / 2, 0);
    body.add(pipe);
  }
  // Crank on the right side — spins when he plays.
  const crank = new THREE.Group();
  crank.name = 'crank';
  crank.position.set(0.56, 0.95, 0);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), walnutDark);
  crankArm.position.y = 0.12;
  const crankKnob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), brass);
  crankKnob.position.y = 0.28;
  crank.add(crankArm, crankKnob);
  body.add(crank);
  // Ivory key row across the front.
  for (let i = 0; i < 6; i++) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.06), i % 2 ? ivory : walnutDark);
    key.position.set(-0.32 + i * 0.13, 0.72, 0.37);
    body.add(key);
  }
  const roll = amberGlow(0.1);
  roll.position.set(0, 1.1, 0.38);
  body.add(roll);

  // Head: round speaker face with a jaunty tilt.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 2.0;
  head.rotation.z = -0.08;
  body.add(head);
  const noggin = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 7), walnut);
  head.add(noggin);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 9), walnutDark);
  face.position.z = 0.29;
  head.add(face);
  // Painted busker face on the speaker plate: lit gold eyes, singing 'o'.
  paintedFace(root, head, {
    style: 'glow',
    glowShape: 'dot',
    eyeColor: PALETTE_CSS.hc9a227,
    mouth: 'o',
    mouthColor: PALETTE_CSS.hc9a227,
    spacing: 0.4,
    eyeScale: 1.1,
    width: 0.38,
    height: 0.26,
    curve: 0.04,
  }, [0, 0.07, 0.35]);
  // Tiny cymbal hat.
  const cymbal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 9), brass);
  cymbal.position.y = 0.32;
  cymbal.rotation.z = 0.15;
  head.add(cymbal);

  const armL = arm('armL', 0.45, 0.05, 0.045, walnutDark, brass);
  armL.position.set(-0.58, 1.3, 0);
  armL.rotation.z = 0.4;
  const armR = arm('armR', 0.45, 0.05, 0.045, walnutDark, brass);
  armR.position.set(0.58, 1.3, 0);
  armR.rotation.z = -0.6;
  body.add(armL, armR);

  for (const side of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 5), walnutDark);
    leg.name = side === -1 ? 'legL' : 'legR';
    leg.position.set(side * 0.28, 0.25, 0);
    body.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.34), brass);
    boot.position.set(0, -0.24, 0.06);
    leg.add(boot);
  }
  return root;
}
