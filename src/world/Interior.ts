import { PALETTE_CSS, PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { applyVertexSnap, makeRetroMaterial } from '../core/RetroMaterial';
import { brickSheet, fabricSheet, paintCanvas, plasterSheet, stripeSheet, toTexture, woodSheet } from '../core/texturePaint';
import type { ItemDef } from '../data/items';

/** Wallpaper and flooring styles for the player's house. */
export const WALLPAPERS: Array<{ id: string; name: string; make: () => THREE.Texture }> = [
  { id: 'plaster', name: 'Whitewash Plaster', make: () => plasterSheet(PALETTE_CSS.hd8cdb4) },
  { id: 'sage', name: 'Sage Green', make: () => plasterSheet(PALETTE_CSS.hb8c0a0) },
  { id: 'rose', name: 'Rose Stripe', make: () => stripeSheet(PALETTE_CSS.hd8bcb4, PALETTE_CSS.hc8a49c) },
  { id: 'postal', name: 'Postal Blue Stripe', make: () => stripeSheet(PALETTE_CSS.ha8b4c4, PALETTE_CSS.h93a2b6) },
  { id: 'ochre', name: 'Ochre Wash', make: () => plasterSheet(PALETTE_CSS.hd3b483) },
  { id: 'ink', name: 'Ink Blue', make: () => plasterSheet(PALETTE_CSS.h8a99b4) },
  { id: 'ember', name: 'Ember Rose', make: () => plasterSheet(PALETTE_CSS.hc99a8e) },
  { id: 'moss', name: 'Deep Moss', make: () => plasterSheet(PALETTE_CSS.h93a583) },
  { id: 'ticking', name: 'Mattress Ticking', make: () => stripeSheet(PALETTE_CSS.he0d8c4, PALETTE_CSS.hb0a894) },
  { id: 'brick-wall', name: 'Exposed Brick', make: () => brickSheet(PALETTE_CSS.ha06248, PALETTE_CSS.h84705c) },
  { id: 'panel', name: 'Oak Panelling', make: () => woodSheet(PALETTE_CSS.h9a7f56) },
  { id: 'canvas', name: 'Canvas Duck', make: () => fabricSheet(PALETTE_CSS.hcbbf9e, { folds: 2, hem: false }) },
];
export const FLOORS: Array<{ id: string; name: string; make: () => THREE.Texture }> = [
  { id: 'pine', name: 'Pine Boards', make: () => woodSheet(PALETTE_CSS.h8a7455) },
  { id: 'walnut', name: 'Walnut Boards', make: () => woodSheet(PALETTE_CSS.h6a4a34) },
  { id: 'brick', name: 'Hearth Brick', make: () => brickSheet(PALETTE_CSS.h9c5a3c, PALETTE_CSS.h7a6a58) },
  { id: 'slate', name: 'Slate Tile', make: () => brickSheet(PALETTE_CSS.h6a7078, PALETTE_CSS.h575c62) },
  { id: 'ash', name: 'Bleached Ash', make: () => woodSheet(PALETTE_CSS.hc4b294) },
  { id: 'ebony', name: 'Smoked Ebony', make: () => woodSheet(PALETTE_CSS.h4a3c30) },
  { id: 'cherry', name: 'Cherry Boards', make: () => woodSheet(PALETTE_CSS.h9c6146) },
  { id: 'flagstone', name: 'Flagstone', make: () => brickSheet(PALETTE_CSS.h9a9488, PALETTE_CSS.h7c766c) },
  { id: 'tile-check', name: 'Chequer Tile', make: () => brickSheet(PALETTE_CSS.hd8cdb4, PALETTE_CSS.h5c554a) },
  { id: 'sandstone', name: 'Sandstone', make: () => brickSheet(PALETTE_CSS.hc4a882, PALETTE_CSS.ha88f6e) },
  { id: 'rush', name: 'Rush Matting', make: () => fabricSheet(PALETTE_CSS.hb8a678, { folds: 1, hem: false }) },
  { id: 'carpet', name: 'Wine Carpet', make: () => fabricSheet(PALETTE_CSS.h7a4a42, { folds: 2, hem: false }) },
];

/**
 * Building interiors. Every room is a Group parked far east of the town map
 * (fog is camera-relative, so once the camera follows the player inside, the
 * room renders normally). Entering a door fades, teleports the player to the
 * room's spawn point, and swaps collision to the room walls.
 */

export interface InteriorHotspot {
  /** Local position inside the room. */
  x: number;
  z: number;
  radius: number;
  /** Prompt label, e.g. "[E] Browse the shelves". */
  label: string;
  action: string;
}

export class Interior {
  readonly group = new THREE.Group();
  readonly id: string;
  /** World origin this room is parked at. */
  readonly origin: THREE.Vector3;
  /** Player spawn (local), just inside the door. */
  readonly spawn = new THREE.Vector3(0, 0, 2.4);
  /** Where the occupant stands (local), if any. */
  occupantSpot: THREE.Vector3 | null = null;
  hotspots: InteriorHotspot[] = [];
  halfW: number;
  halfD: number;
  private colliders: Array<{ x: number; z: number; r: number }> = [];

  constructor(id: string, index: number, halfW: number, halfD: number) {
    this.id = id;
    this.halfW = halfW;
    this.halfD = halfD;
    this.origin = new THREE.Vector3(400 + index * 60, 0, 0);
    this.group.position.copy(this.origin);
    // Spawn safely clear of the door-exit zone, whatever the room size.
    this.spawn.set(0, 0, halfD - 1.6);
  }

  get floorY(): number {
    return this.origin.y;
  }

  /** Door zone: near the south wall center → walk out. */
  atDoor(worldPos: THREE.Vector3): boolean {
    const lx = worldPos.x - this.origin.x;
    const lz = worldPos.z - this.origin.z;
    return Math.abs(lx) < 1.0 && lz > this.halfD - 0.9;
  }

  toWorld(local: THREE.Vector3): THREE.Vector3 {
    return local.clone().add(this.origin);
  }

  addCollider(x: number, z: number, r: number): () => void {
    const collider = { x, z, r };
    this.colliders.push(collider);
    return () => {
      const index = this.colliders.indexOf(collider);
      if (index >= 0) this.colliders.splice(index, 1);
    };
  }

  collide(pos: THREE.Vector3): void {
    // Walls (leave a gap at the south door so the exit zone is reachable).
    const lx = pos.x - this.origin.x;
    const lz = pos.z - this.origin.z;
    const m = 0.45; // body margin
    pos.x = this.origin.x + THREE.MathUtils.clamp(lx, -this.halfW + m, this.halfW - m);
    pos.z = this.origin.z + THREE.MathUtils.clamp(lz, -this.halfD + m, this.halfD - m + 0.35);
    // Furniture circles.
    for (const c of this.colliders) {
      const dx = pos.x - (this.origin.x + c.x);
      const dz = pos.z - (this.origin.z + c.z);
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.35;
      if (d < min && d > 1e-4) {
        pos.x = this.origin.x + c.x + (dx / d) * min;
        pos.z = this.origin.z + c.z + (dz / d) * min;
      }
    }
  }
}

// --- shared furnishing builders --------------------------------------------

const wood = (): THREE.MeshLambertMaterial => makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h8a7455) });
const woodDark = (): THREE.MeshLambertMaterial => makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h5c4a38) });

/**
 * Painted daylight for the exit doorway. The cutaway removes the near wall, so
 * a flat unlit rectangle there just reads as a blank cream slab floating at the
 * front of the room. This paints it instead as warm light spilling in: a soft
 * sky up top, a sunlit band pooling at the threshold, and a vignette that
 * darkens toward the jambs so the opening recedes into a framed doorway rather
 * than sitting forward as a bright block.
 */
let daylightTex: THREE.CanvasTexture | null = null;
function doorwayDaylight(): THREE.CanvasTexture {
  if (daylightTex) return daylightTex;
  const p = paintCanvas(96, 128);
  const { ctx, w, h } = p;
  // Vertical wash: muted warm at the head, brightening to a sunlit threshold.
  const v = ctx.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, PALETTE_CSS.hc3b083);
  v.addColorStop(0.45, PALETTE_CSS.hd8c090);
  v.addColorStop(0.8, PALETTE_CSS.heedaa8);
  v.addColorStop(0.92, PALETTE_CSS.hf2dfae);
  v.addColorStop(1, PALETTE_CSS.hd2bc93);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  // A faint hint of the world outside: a paler light pooling low-centre where
  // the ground catches the sun, kept soft so it never resolves into detail.
  const pool = ctx.createRadialGradient(w / 2, h * 0.82, w * 0.05, w / 2, h * 0.82, w * 0.6);
  pool.addColorStop(0, 'rgba(255,244,214,0.55)');
  pool.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);
  // Vignette toward the jambs so the light recedes into the frame.
  const vig = ctx.createRadialGradient(w / 2, h * 0.55, w * 0.18, w / 2, h * 0.55, w * 0.82);
  vig.addColorStop(0, 'rgba(58,42,24,0)');
  vig.addColorStop(1, 'rgba(58,42,24,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  daylightTex = toTexture(p);
  return daylightTex;
}

function lampGlow(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.2, 7),
    applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffd58a })),
  );
  shade.position.y = 0.1;
  const light = new THREE.PointLight(PALETTE_HEX.hffc87a, 5, 9, 1.8);
  g.add(shade, light);
  g.position.set(x, y, z);
  return g;
}

function table(w: number, d: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
  top.position.y = 0.72;
  g.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), mat);
      leg.position.set(sx * (w / 2 - 0.1), 0.36, sz * (d / 2 - 0.1));
      g.add(leg);
    }
  }
  return g;
}

function rug(w: number, d: number, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    makeRetroMaterial({ map: fabricSheet(color, { folds: 2, hem: false }) }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}

function shelf(w: number, h: number, mat: THREE.Material, itemColors: number[]): THREE.Group {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat);
  back.position.y = h / 2;
  g.add(back);
  const rows = Math.floor(h / 0.5);
  for (let r = 0; r < rows; r++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.34), mat);
    board.position.set(0, 0.4 + r * 0.5, 0.14);
    g.add(board);
    // Little goods on each shelf.
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const c = itemColors[Math.floor(Math.random() * itemColors.length)];
      const item = new THREE.Mesh(
        Math.random() < 0.5
          ? new THREE.BoxGeometry(0.16, 0.22, 0.16)
          : new THREE.CylinderGeometry(0.09, 0.09, 0.22, 6),
        makeRetroMaterial({ color: c }),
      );
      item.position.set(-w / 2 + 0.3 + (i + Math.random() * 0.4) * (w - 0.6) / n, 0.55 + r * 0.5, 0.14);
      g.add(item);
    }
  }
  return g;
}

/** Build the empty shell: floor, walls, ceiling trim, door on the south wall. */
function buildShell(
  room: Interior,
  opts: {
    wall: THREE.Texture;
    floor: THREE.Texture;
    trim?: number;
    /** Local z positions to put a window at on each side wall. */
    windowsAt?: number[];
  },
): void {
  const { halfW, halfD } = room;
  const wallH = 3.1;
  const wallMat = makeRetroMaterial({ map: opts.wall });
  const floorMat = makeRetroMaterial({ map: opts.floor });
  const trimMat = makeRetroMaterial({ color: opts.trim ?? PALETTE_HEX.h54432f });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  room.group.add(floor);

  const mkWall = (w: number, x: number, z: number, rotY: number): void => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat);
    wall.position.set(x, wallH / 2, z);
    wall.rotation.y = rotY;
    room.group.add(wall);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.06), trimMat);
    base.position.set(x, 0.09, z);
    base.rotation.y = rotY;
    base.translateZ(0.04);
    room.group.add(base);
  };
  mkWall(halfW * 2, 0, -halfD, 0); // north
  mkWall(halfD * 2, -halfW, 0, Math.PI / 2); // west
  mkWall(halfD * 2, halfW, 0, -Math.PI / 2); // east
  // South wall in two pieces with a doorway gap.
  const side = halfW - 0.9;
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(side, wallH), wallMat);
  s1.position.set(-(0.9 + side / 2), wallH / 2, halfD);
  s1.rotation.y = Math.PI;
  const s2 = s1.clone();
  s2.position.x = 0.9 + side / 2;
  room.group.add(s1, s2);
  // Finish the near (cut-away) edge like the other three walls: the two south
  // segments get the same baseboard + picture rail, so the room reads as ending
  // at trimmed molding instead of a raw open lip at the front of frame.
  for (const seg of [s1, s2]) {
    const segBase = new THREE.Mesh(new THREE.BoxGeometry(side, 0.18, 0.06), trimMat);
    segBase.position.set(seg.position.x, 0.09, halfD);
    segBase.rotation.y = Math.PI;
    segBase.translateZ(0.04);
    room.group.add(segBase);
    const segRail = new THREE.Mesh(new THREE.BoxGeometry(side, 0.12, 0.07), trimMat);
    segRail.position.set(seg.position.x, wallH - 0.28, halfD);
    segRail.rotation.y = Math.PI;
    segRail.translateZ(0.05);
    room.group.add(segRail);
  }
  // Door casing: jambs + a compact timber header and threshold. The old
  // wall-filled lintel occupied the full metre between the door and ceiling;
  // from the elevated camera that foreshortened into a large blank rectangle
  // floating over the entry. Keeping the cutaway open above a proper header
  // makes this read as a finished dollhouse edge instead.
  const jambH = 2.16;
  for (const jx of [-0.95, 0.95]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, jambH, 0.18), trimMat);
    jamb.position.set(jx, jambH / 2, halfD - 0.02);
    room.group.add(jamb);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.18, 0.2), trimMat);
  header.position.set(0, jambH + 0.02, halfD - 0.02);
  room.group.add(header);
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.1, 0.42), trimMat);
  threshold.position.set(0, 0.05, halfD - 0.2);
  room.group.add(threshold);
  // Warm daylight spilling in, painted (gradient + threshold pool + vignette)
  // so it recedes into the doorway instead of reading as a flat cream slab at
  // the cutaway edge. Unlit, so it still glows like an open door to outside.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.64, 2.02),
    applyVertexSnap(new THREE.MeshBasicMaterial({ map: doorwayDaylight() })),
  );
  glow.position.set(0, 1.06, halfD - 0.05);
  room.group.add(glow);
  const doormat = rug(1.6, 0.9, PALETTE_CSS.h8a6b45);
  doormat.position.set(0, 0.02, halfD - 0.7);
  room.group.add(doormat);

  // Ceiling: faces down, so the game's elevated camera looks straight through
  // it into the room while the space still closes overhead from any low angle.
  const ceilingMat = makeRetroMaterial({ map: plasterSheet(PALETTE_CSS.h7a6a54), side: THREE.FrontSide });
  const ceilPlane = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), ceilingMat);
  ceilPlane.rotation.x = Math.PI / 2;
  ceilPlane.position.y = wallH;
  room.group.add(ceilPlane);
  // No exposed beams: the camera looks down through the open ceiling, so
  // anything spanning the room crosses the whole frame. The top edge comes
  // from a picture rail hugging the walls instead.
  for (const [rw, rx, rz, rrot] of [
    [halfW * 2, 0, -halfD, 0],
    [halfD * 2, -halfW, 0, Math.PI / 2],
    [halfD * 2, halfW, 0, -Math.PI / 2],
  ] as Array<[number, number, number, number]>) {
    const railMesh = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.12, 0.07), trimMat);
    railMesh.position.set(rx, wallH - 0.28, rz);
    railMesh.rotation.y = rrot;
    railMesh.translateZ(0.05);
    room.group.add(railMesh);
  }

  // Windows with painted daylight: a warm pane, a frame, a sill, and a soft
  // patch of light thrown onto the floor beneath.
  const paneMat = applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hf6e2b4 }));
  const addWindow = (wx: number, wz: number, rotY: number, floorX: number, floorZ: number): void => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.1), trimMat);
    frame.position.set(wx, 1.75, wz);
    frame.rotation.y = rotY;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.15), paneMat);
    pane.position.set(wx, 1.75, wz);
    pane.rotation.y = rotY;
    pane.translateZ(0.07);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.15, 0.04), trimMat);
    mullion.position.set(wx, 1.75, wz);
    mullion.rotation.y = rotY;
    mullion.translateZ(0.1);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.24), trimMat);
    sill.position.set(wx, 1.0, wz);
    sill.rotation.y = rotY;
    sill.translateZ(0.06);
    room.group.add(frame, pane, mullion, sill);
    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.2),
      applyVertexSnap(new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.hffe9b8, transparent: true, opacity: 0.14, depthWrite: false,
      })),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(floorX, 0.03, floorZ);
    spill.rotation.z = rotY;
    room.group.add(spill);
  };
  // Each room says where its walls are actually free; a window hidden behind
  // a bookcase just puts an unmotivated patch of light on the floor.
  for (const wz of opts.windowsAt ?? [halfD * 0.55]) {
    addWindow(-halfW + 0.06, wz, Math.PI / 2, -halfW + 1.4, wz);
    addWindow(halfW - 0.06, wz, -Math.PI / 2, halfW - 1.4, wz);
  }

  // Interior light: rooms are their own little lighting world.
  room.group.add(lampGlow(0, 2.6, -0.5));
  // A second, dimmer lamp near the door keeps the entry from going murky.
  const doorLamp = new THREE.PointLight(PALETTE_HEX.hffbe78, 2.2, 7, 1.8);
  doorLamp.position.set(0, 2.3, halfD - 1.4);
  room.group.add(doorLamp);
}

// --- room recipes -----------------------------------------------------------

/** W2 vertical-slice office: structurally usable, visibly neglected. */
export function buildRuinedPostOfficeInterior(index: number): Interior {
  const room = new Interior('post-office-ruined', index, 4.8, 4.2);
  buildShell(room, {
    wall: plasterSheet(PALETTE_CSS.h9a8a68),
    floor: woodSheet(PALETTE_CSS.h5c4a38),
  });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 0.65), woodDark());
  counter.position.set(-0.4, 0.45, -1.8);
  counter.rotation.z = -0.035;
  room.group.add(counter);
  room.addCollider(-0.4, -1.8, 1.2);

  const pigeonholes = shelf(3.2, 2.4, woodDark(), [
    PALETTE_HEX.h9a7f4e,
    PALETTE_HEX.hd8cdb4,
    PALETTE_HEX.ha8402f,
  ]);
  pigeonholes.position.set(-4.5, 0, -0.8);
  pigeonholes.rotation.y = Math.PI / 2;
  room.group.add(pigeonholes);
  room.addCollider(-4.3, -0.8, 0.6);

  for (const [x, z, turn] of [[2.8, -2.8, 0.2], [3.4, 2.4, -0.4], [-2.8, 2.6, 0.1]] as const) {
    const debris = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.5), wood());
    debris.position.set(x, 0.12, z);
    debris.rotation.y = turn;
    room.group.add(debris);
  }
  room.occupantSpot = new THREE.Vector3(1.4, 0, -2.7);
  room.hotspots.push({
    x: -0.4,
    z: -1.2,
    radius: 1.4,
    label: '[E] Inspect the broken summons ledger',
    action: 'summons-ledger',
  });
  return room;
}

export function buildEmporiumInterior(index: number): Interior {
  const room = new Interior('emporium', index, 5.2, 4.2);
  buildShell(room, {
    wall: plasterSheet(PALETTE_CSS.hd8c8a8),
    floor: woodSheet(PALETTE_CSS.h8a7154),
  });
  // Counter across the north side; Reggie stands behind it.
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.95, 0.7), woodDark());
  counter.position.set(0, 0.48, -2.2);
  room.group.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.07, 0.85), wood());
  counterTop.position.set(0, 0.98, -2.2);
  room.group.add(counterTop);
  room.addCollider(0, -2.2, 1.1);
  room.occupantSpot = new THREE.Vector3(0, 0, -3.2);
  // Shelves of goods along the walls.
  const goods = [PALETTE_HEX.hc0553f, PALETTE_HEX.hc9a227, PALETTE_HEX.h5a7a8a, PALETTE_HEX.h8a9a5a, PALETTE_HEX.hd8cdb4];
  const shelfL = shelf(3.4, 2.2, woodDark(), goods);
  shelfL.position.set(-5.0, 0, -1.2);
  shelfL.rotation.y = Math.PI / 2;
  room.group.add(shelfL);
  room.addCollider(-4.8, -1.2, 0.5);
  const shelfR = shelf(3.4, 2.2, woodDark(), goods);
  shelfR.position.set(5.0, 0, -1.2);
  shelfR.rotation.y = -Math.PI / 2;
  room.group.add(shelfR);
  room.addCollider(4.8, -1.2, 0.5);
  // Crates and a barrel — shop clutter.
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), wood());
  crate.position.set(-3.6, 0.35, 2.6);
  room.group.add(crate);
  room.addCollider(-3.6, 2.6, 0.55);
  const crate2 = crate.clone();
  crate2.position.set(-3.0, 0.35, 3.1);
  crate2.rotation.y = 0.4;
  room.group.add(crate2);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.85, 9), woodDark());
  barrel.position.set(3.8, 0.42, 2.8);
  room.group.add(barrel);
  room.addCollider(3.8, 2.8, 0.5);
  room.group.add(rug(3.4, 2.4, PALETTE_CSS.h7a4a42));
  // A gramophone horn on the counter — Reggie's touch.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 9), makeRetroMaterial({ color: PALETTE_HEX.hb08d52 }));
  horn.position.set(1.6, 1.35, -2.2);
  horn.rotation.z = -0.9;
  room.group.add(horn);

  // --- Stock. A shop with two shelves and a barrel reads as a room that
  // happens to contain a counter; a shop should look like it would take an
  // afternoon to inventory.
  const goodsMats = goods.map((c) => makeRetroMaterial({ color: c }));
  const pick = (i: number): THREE.Material => goodsMats[i % goodsMats.length];

  // Produce table in the middle of the floor, heaped in crates.
  const produce = table(2.2, 1.1, wood());
  produce.position.set(-1.6, 0, 0.9);
  room.group.add(produce);
  room.addCollider(-1.6, 0.9, 0.9);
  for (let i = 0; i < 3; i++) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.5), woodDark());
    tray.position.set(-2.3 + i * 0.72, 0.84, 0.9);
    room.group.add(tray);
    for (let f = 0; f < 5; f++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), pick(i + f));
      fruit.position.set(
        -2.45 + i * 0.72 + (f % 3) * 0.14,
        0.97,
        0.78 + Math.floor(f / 3) * 0.2,
      );
      room.group.add(fruit);
    }
  }

  // Bolts of cloth leaning in the corner.
  for (let b = 0; b < 4; b++) {
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 1.5, 7),
      makeRetroMaterial({ map: fabricSheet([PALETTE_CSS.ha8402f, PALETTE_CSS.h4a5a78, PALETTE_CSS.h8a9a5a, PALETTE_CSS.hc9a227][b]) }),
    );
    bolt.position.set(-4.5 + b * 0.26, 0.75, -3.4);
    bolt.rotation.z = 0.16 - b * 0.05;
    room.group.add(bolt);
  }

  // Goods hanging from the picture rail behind the counter: pans, lanterns.
  for (let h = 0; h < 5; h++) {
    const hx = -1.9 + h * 0.95;
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.04), woodDark());
    hook.position.set(hx, 2.5, -4.0);
    room.group.add(hook);
    if (h % 2 === 0) {
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.12, 9), makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }));
      pan.position.set(hx, 2.28, -4.0);
      room.group.add(pan);
    } else {
      const lantern = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.3, 0.22),
        applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffc470 })),
      );
      lantern.position.set(hx, 2.2, -4.0);
      room.group.add(lantern);
    }
  }

  // Counter clutter: a register, a jar of sweets, a stack of paper bags, and
  // the ledger Reggie pretends to keep.
  const register = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), makeRetroMaterial({ color: PALETTE_HEX.h7a4a42 }));
  register.position.set(-1.5, 1.21, -2.2);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.2), makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 }));
  keys.position.set(-1.5, 1.44, -2.06);
  const jar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.3, 9),
    applyVertexSnap(new THREE.MeshLambertMaterial({ color: PALETTE_HEX.he8c86a, transparent: true, opacity: 0.7 })),
  );
  jar.position.set(-0.6, 1.16, -2.2);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.26), makeRetroMaterial({ color: PALETTE_HEX.h6a3540 }));
  ledger.position.set(0.6, 1.04, -2.1);
  room.group.add(register, keys, jar, ledger);
  for (let s = 0; s < 3; s++) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.3), makeRetroMaterial({ color: PALETTE_HEX.hcbbf9e }));
    bag.position.set(1.15, 1.03 + s * 0.035, -2.3);
    bag.rotation.y = s * 0.1;
    room.group.add(bag);
  }

  // A chalkboard of today's prices, and a rack of brooms by the door.
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.06), makeRetroMaterial({ color: PALETTE_HEX.h3f4a45 }));
  boardMesh.position.set(3.2, 1.9, -4.1);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 0.04), woodDark());
  boardFrame.position.set(3.2, 1.9, -4.14);
  room.group.add(boardMesh, boardFrame);
  for (let c = 0; c < 4; c++) {
    const chalkLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 + (c % 2) * 0.3, 0.05, 0.02),
      makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 }),
    );
    chalkLine.position.set(3.0, 2.2 - c * 0.19, -4.06);
    room.group.add(chalkLine);
  }
  for (let b = 0; b < 3; b++) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), wood());
    handle.position.set(4.6, 0.65, 3.2 + b * 0.16);
    handle.rotation.z = 0.14;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.1), makeRetroMaterial({ color: PALETTE_HEX.hb8a45c }));
    head.position.set(4.51, 0.12, 3.2 + b * 0.16);
    room.group.add(handle, head);
  }

  room.hotspots.push({ x: 0, z: -1.1, radius: 1.4, label: 'Sell at REGGIE’s counter', action: 'shop-sell' });
  return room;
}

/** Put today's actual buyable objects on the Emporium's two display racks. */
export function setEmporiumStock(room: Interior, stock: readonly ItemDef[]): void {
  room.group.getObjectByName('daily-stock')?.removeFromParent();
  room.hotspots = room.hotspots.filter((spot) => !spot.action.startsWith('shop-item:'));
  const layer = new THREE.Group();
  layer.name = 'daily-stock';
  const hashColor = (id: string): number => {
    let hash = 0;
    for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 2654435761);
    const palette = [PALETTE_HEX.ha8402f, PALETTE_HEX.h4a6f78, PALETTE_HEX.h8a9a5a, PALETTE_HEX.hc08a42, PALETTE_HEX.h765b85, PALETTE_HEX.hb66f69, PALETTE_HEX.h647a58, PALETTE_HEX.h9a7f4e];
    return palette[Math.abs(hash) % palette.length];
  };
  stock.slice(0, 9).forEach((def, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const x = side * 3.65;
    const z = -2.65 + row * 1.25;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.58, 0.72), woodDark());
    plinth.position.set(x, 0.29, z);
    layer.add(plinth);
    const color = hashColor(def.id);
    const mat = makeRetroMaterial({ color });
    let product: THREE.Object3D;
    if (def.id.startsWith('concert-')) {
      product = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 12), makeRetroMaterial({ color: PALETTE_HEX.h352f38 }));
      product.rotation.x = Math.PI / 2;
    } else if (def.category === 'clothing') {
      product = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 0.62, 8), mat);
    } else if (def.category === 'tool') {
      const tool = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.7, 6), wood());
      handle.rotation.z = 0.45;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.12), mat);
      head.position.set(-0.14, 0.27, 0);
      tool.add(handle, head);
      product = tool;
    } else {
      const furn = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.44), mat);
      body.position.y = 0.16;
      furn.add(body);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), woodDark());
        leg.position.set(sx * 0.2, -0.16, 0);
        furn.add(leg);
      }
      product = furn;
    }
    product.position.set(x, 0.92, z);
    product.rotation.y = side * -0.35;
    layer.add(product);
    room.hotspots.push({
      x: side * 2.9,
      z,
      radius: 0.72,
      label: `Inspect ${def.name} · ${def.buyPrice ?? 0}g`,
      action: `shop-item:${def.id}`,
    });
  });
  room.group.add(layer);
}

export function buildArchiveInterior(index: number): Interior {
  const room = new Interior('archive', index, 4.6, 4.6);
  buildShell(room, {
    wall: plasterSheet(PALETTE_CSS.hc8c4b4),
    floor: brickSheet(PALETTE_CSS.h8a8478, PALETTE_CSS.h6a655c),
    trim: PALETTE_HEX.h4a4438,
    windowsAt: [3.5], // the only stretch of wall not behind a cabinet
  });
  // Specimen cabinets around the walls (Cataloger's drawers, human-sized).
  const ivory = makeRetroMaterial({ map: plasterSheet(PALETTE_CSS.hd8cdb4) });
  for (const [x, z, rot] of [
    [-4.4, -1.5, Math.PI / 2],
    [-4.4, 1.5, Math.PI / 2],
    [4.4, -1.5, -Math.PI / 2],
    [4.4, 1.5, -Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const cab = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 0.5), woodDark());
    box.position.y = 1.0;
    cab.add(box);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.52, 0.06), ivory);
        face.position.set(-0.7 + c * 0.7, 0.42 + r * 0.6, 0.26);
        cab.add(face);
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 5, 4),
          makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }),
        );
        knob.position.set(face.position.x, face.position.y, 0.31);
        cab.add(knob);
      }
    }
    cab.position.set(x, 0, z);
    cab.rotation.y = rot;
    room.group.add(cab);
    room.addCollider(x, z, 0.6);
  }
  // Central display case: glass box on a plinth with a glowing relic.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), woodDark());
  plinth.position.set(0, 0.45, -1.2);
  room.group.add(plinth);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.8, 1.0),
    applyVertexSnap(new THREE.MeshLambertMaterial({ color: PALETTE_HEX.hdfe8f0, transparent: true, opacity: 0.25 })),
  );
  glass.position.set(0, 1.35, -1.2);
  room.group.add(glass);
  const relic = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 0),
    applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffb347 })),
  );
  relic.position.set(0, 1.3, -1.2);
  room.group.add(relic);
  const relicLight = new THREE.PointLight(PALETTE_HEX.hffb347, 3, 5, 2);
  relicLight.position.set(0, 1.6, -1.2);
  room.group.add(relicLight);
  room.addCollider(0, -1.2, 0.85);
  // Reading desk with a ledger.
  const desk = table(1.6, 0.9, woodDark());
  desk.position.set(2.6, 0, 2.4);
  room.group.add(desk);
  room.addCollider(2.6, 2.4, 0.8);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.36), makeRetroMaterial({ color: PALETTE_HEX.h6a3540 }));
  ledger.position.set(2.6, 0.8, 2.4);
  ledger.rotation.y = 0.3;
  room.group.add(ledger);
  room.occupantSpot = new THREE.Vector3(-2.2, 0, 2.0);
  room.group.add(rug(2.6, 2.0, PALETTE_CSS.h5a6b6a));

  // --- Exhibit halls. The Archive is a museum, so it needs things ON DISPLAY:
  // mounted specimens under glass, each with a little label card, plus the
  // apparatus of a naturalist who has been cataloguing alone for forty years.
  const brass = makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e });
  const cardMat = makeRetroMaterial({ color: PALETTE_HEX.he8dfc8 });
  const specimenColors = [PALETTE_HEX.hc0553f, PALETTE_HEX.h5a7a8a, PALETTE_HEX.hc9a227, PALETTE_HEX.h8a9a5a, PALETTE_HEX.hd8b8c8, PALETTE_HEX.h9aa0a8];
  const exhibit = (ex: number, ez: number, i: number): void => {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.85, 8), woodDark());
    stand.position.set(ex, 0.42, ez);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 8), brass);
    top.position.set(ex, 0.88, ez);
    // Bell jar.
    const jarGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.62, 10),
      applyVertexSnap(new THREE.MeshLambertMaterial({
        color: PALETTE_HEX.hdfe8f0, transparent: true, opacity: 0.22, depthWrite: false,
      })),
    );
    jarGlass.position.set(ex, 1.22, ez);
    const jarCap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), applyVertexSnap(
      new THREE.MeshLambertMaterial({ color: PALETTE_HEX.hdfe8f0, transparent: true, opacity: 0.22, depthWrite: false }),
    ));
    jarCap.position.set(ex, 1.53, ez);
    const knob2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), brass);
    knob2.position.set(ex, 1.62, ez);
    // The specimen itself, pinned on a brass rod.
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), brass);
    rod.position.set(ex, 1.12, ez);
    const body = new THREE.Mesh(
      i % 2 ? new THREE.IcosahedronGeometry(0.11, 0) : new THREE.ConeGeometry(0.1, 0.26, 6),
      makeRetroMaterial({ color: specimenColors[i % specimenColors.length] }),
    );
    body.position.set(ex, 1.3, ez);
    body.rotation.set(0.4, i * 0.9, 0.2);
    // Label card angled on the plinth lip.
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.16), cardMat);
    card.position.set(ex, 0.93, ez + 0.26);
    card.rotation.x = -0.35;
    const inkLine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.02), makeRetroMaterial({ color: PALETTE_HEX.h54432f }));
    inkLine.position.set(ex, 0.96, ez + 0.25);
    inkLine.rotation.x = -0.35;
    room.group.add(stand, top, jarGlass, jarCap, knob2, rod, body, card, inkLine);
    room.addCollider(ex, ez, 0.42);
  };
  exhibit(-2.9, -3.2, 0);
  exhibit(-1.1, -3.4, 1);
  exhibit(1.1, -3.4, 2);
  exhibit(2.9, -3.2, 3);
  exhibit(-3.3, 0.4, 4);
  exhibit(3.3, 0.4, 5);

  // Framed field-plates hung between the cabinets.
  for (let f = 0; f < 4; f++) {
    const fx = -2.7 + f * 1.8;
    const frame2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.05), woodDark());
    frame2.position.set(fx, 2.35, -4.5);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.03), cardMat);
    plate.position.set(fx, 2.35, -4.46);
    const sketch = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 9),
      makeRetroMaterial({ color: specimenColors[f] }),
    );
    sketch.position.set(fx, 2.35, -4.43);
    room.group.add(frame2, plate, sketch);
  }

  // Cataloger's working corner: a specimen trolley, a stack of field journals,
  // a magnifier on a stand, and a pinning tray of unsorted finds.
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), woodDark());
  trolley.position.set(-3.4, 0.55, 2.9);
  for (const wx of [-0.32, 0.32]) {
    for (const wz of [-0.22, 0.22]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), makeRetroMaterial({ color: PALETTE_HEX.h3c352c }));
      wheel.position.set(-3.4 + wx, 0.12, 2.9 + wz);
      wheel.rotation.z = Math.PI / 2;
      room.group.add(wheel);
    }
  }
  room.group.add(trolley);
  room.addCollider(-3.4, 2.9, 0.6);
  for (let j = 0; j < 4; j++) {
    const journal = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.07, 0.28),
      makeRetroMaterial({ color: [PALETTE_HEX.h6a3540, PALETTE_HEX.h3f4a45, PALETTE_HEX.h54432f, PALETTE_HEX.h5a6b6a][j] }),
    );
    journal.position.set(-3.4, 0.89 + j * 0.075, 2.9);
    journal.rotation.y = (j % 2 ? 0.14 : -0.1);
    room.group.add(journal);
  }
  const magStand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.7, 5), brass);
  magStand.position.set(2.6, 1.15, 2.4);
  const magRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 5, 10), brass);
  magRing.position.set(2.6, 1.5, 2.35);
  magRing.rotation.x = 0.5;
  const magLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 10),
    applyVertexSnap(new THREE.MeshLambertMaterial({ color: PALETTE_HEX.hdfe8f0, transparent: true, opacity: 0.35 })),
  );
  magLens.position.copy(magRing.position);
  magLens.rotation.x = 0.5 - Math.PI / 2;
  room.group.add(magStand, magRing, magLens);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), woodDark());
  tray.position.set(2.0, 0.8, 2.4);
  room.group.add(tray);
  for (let p = 0; p < 6; p++) {
    const find = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.05, 0),
      makeRetroMaterial({ color: specimenColors[(p + 2) % specimenColors.length] }),
    );
    find.position.set(1.78 + (p % 3) * 0.22, 0.87, 2.28 + Math.floor(p / 3) * 0.2);
    room.group.add(find);
  }

  room.hotspots.push({ x: 0, z: -0.2, radius: 1.5, label: 'Study the collection', action: 'museum' });
  room.hotspots.push({ x: 2.6, z: 2.0, radius: 1.2, label: 'Read the specimen ledger', action: 'museum' });
  return room;
}

function cozyBed(color: string): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 2.0), woodDark());
  frame.position.y = 0.2;
  g.add(frame);
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.18, 1.9),
    makeRetroMaterial({ map: fabricSheet(PALETTE_CSS.he8e0cc, { folds: 2 }) }),
  );
  mattress.position.y = 0.44;
  g.add(mattress);
  const blanket = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.1, 1.2),
    makeRetroMaterial({ map: fabricSheet(color, { folds: 3 }) }),
  );
  blanket.position.set(0, 0.52, 0.3);
  g.add(blanket);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.12, 0.4),
    makeRetroMaterial({ color: PALETTE_HEX.hf0ead8 }),
  );
  pillow.position.set(0, 0.56, -0.65);
  g.add(pillow);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), woodDark());
  post.position.set(-0.5, 0.4, -0.95);
  const post2 = post.clone();
  post2.position.x = 0.5;
  g.add(post, post2);
  return g;
}

/** Villager cottages: same shell, furnishings express the owner. */
export function buildCottageInterior(owner: 'marigold' | 'buoy', index: number): Interior {
  const room = new Interior(`house-${owner}`, index, 3.8, 3.4);
  if (owner === 'marigold') {
    buildShell(room, { wall: plasterSheet(PALETTE_CSS.hc8c89a), floor: woodSheet(PALETTE_CSS.h8a7154) });
    // A gardener's parlor: potted plants everywhere, seed table, watering can.
    const green = makeRetroMaterial({ color: PALETTE_HEX.h5a7a3f });
    for (const [x, z] of [[-3.0, -2.4], [3.0, -2.6], [-3.2, 1.8], [2.4, -0.4]] as Array<[number, number]>) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.35, 8), makeRetroMaterial({ color: PALETTE_HEX.h8a5a3c }));
      pot.position.set(x, 0.17, z);
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.15, 0), green);
      plant.position.set(x, 0.62, z);
      room.group.add(pot, plant);
      room.addCollider(x, z, 0.35);
    }
    const bed = cozyBed(PALETTE_CSS.h8a9a5a);
    bed.position.set(-2.6, 0, -1.6);
    bed.rotation.y = Math.PI / 2;
    room.group.add(bed);
    room.addCollider(-2.6, -1.6, 0.9);
    const seedTable = table(1.8, 0.9, wood());
    seedTable.position.set(1.8, 0, -2.4);
    room.group.add(seedTable);
    room.addCollider(1.8, -2.4, 0.8);
    for (let i = 0; i < 4; i++) {
      const sack = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 6, 5),
        makeRetroMaterial({ map: fabricSheet(PALETTE_CSS.hb09a6a, { folds: 2 }) }),
      );
      sack.position.set(1.3 + (i % 2) * 0.4, 0.85, -2.5 + Math.floor(i / 2) * 0.3);
      sack.scale.y = 0.8;
      room.group.add(sack);
    }
    room.group.add(rug(2.2, 1.8, PALETTE_CSS.h8a9a5a));
  } else {
    buildShell(room, { wall: plasterSheet(PALETTE_CSS.ha8b8c0), floor: woodSheet(PALETTE_CSS.h6e5a42) });
    // A fisher's cabin: nets, buoys, a tackle table, sea chest.
    const bed = cozyBed(PALETTE_CSS.h5a7a8a);
    bed.position.set(2.6, 0, -1.6);
    bed.rotation.y = -Math.PI / 2;
    room.group.add(bed);
    room.addCollider(2.6, -1.6, 0.9);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), woodDark());
    chest.position.set(-3.0, 0.28, 2.2);
    room.group.add(chest);
    room.addCollider(-3.0, 2.2, 0.6);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.58), makeRetroMaterial({ color: PALETTE_HEX.hb08d52 }));
    band.position.set(-3.0, 0.42, 2.2);
    room.group.add(band);
    const tackle = table(1.6, 0.8, wood());
    tackle.position.set(-2.6, 0, -2.4);
    room.group.add(tackle);
    room.addCollider(-2.6, -2.4, 0.75);
    // Hanging net on the west wall (a sagging plane).
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.4, 6, 4),
      makeRetroMaterial({ color: PALETTE_HEX.h9a8a68, wireframe: true }),
    );
    net.position.set(-3.72, 1.7, -0.5);
    net.rotation.y = Math.PI / 2;
    room.group.add(net);
    for (const [x, z, c] of [[0.6, -2.6, PALETTE_HEX.ha8402f], [1.2, -2.4, PALETTE_HEX.hd8cdb4]] as Array<[number, number, number]>) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), makeRetroMaterial({ color: c }));
      b.position.set(x, 0.22, z);
      room.group.add(b);
    }
    room.group.add(rug(2.0, 1.6, PALETTE_CSS.h4c5a62));
  }
  dressCottage(room, owner);
  room.occupantSpot = new THREE.Vector3(0, 0, -1.0);
  return room;
}

/**
 * Everything that makes a cottage feel occupied rather than furnished: the
 * shelf of things they kept, the meal half-finished, the coat by the door.
 * A villager's room should be readable as THEIRS with the lights off.
 */
function dressCottage(room: Interior, owner: 'marigold' | 'buoy'): void {
  const { halfW, halfD } = room;
  const brass = makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e });
  const accent = owner === 'marigold' ? PALETTE_HEX.h8a9a5a : PALETTE_HEX.h5a7a8a;

  // A hearth on the north wall with a mantel and a lit fire.
  const hearth = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.5, 0.5),
    makeRetroMaterial({ map: brickSheet(PALETTE_CSS.h8a7a6a, PALETTE_CSS.h6a5c50) }),
  );
  hearth.position.set(halfW - 1.3, 0.75, -halfD + 0.3);
  const mantel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.68), woodDark());
  mantel.position.set(halfW - 1.3, 1.55, -halfD + 0.34);
  const fireHole = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.7, 0.06),
    applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hff9a3c })),
  );
  fireHole.position.set(halfW - 1.3, 0.45, -halfD + 0.56);
  const fireLight = new THREE.PointLight(PALETTE_HEX.hff8a30, 2.6, 5, 2);
  fireLight.position.set(halfW - 1.3, 0.7, -halfD + 0.9);
  room.group.add(hearth, mantel, fireHole, fireLight);
  room.addCollider(halfW - 1.3, -halfD + 0.3, 0.85);
  // Mantel keepsakes: a clock, a framed picture, a jar.
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), brass);
  clock.position.set(halfW - 1.9, 1.7, -halfD + 0.34);
  clock.rotation.x = Math.PI / 2;
  const pic = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.04), woodDark());
  pic.position.set(halfW - 1.3, 1.74, -halfD + 0.34);
  const picIn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.02), makeRetroMaterial({ color: accent }));
  picIn.position.set(halfW - 1.3, 1.74, -halfD + 0.31);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8), makeRetroMaterial({ color: accent }));
  jar.position.set(halfW - 0.75, 1.72, -halfD + 0.34);
  room.group.add(clock, pic, picIn, jar);

  // A wall shelf of small kept things, and pegs by the door with a coat.
  const shelfBoard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.3), woodDark());
  shelfBoard.position.set(-halfW + 1.2, 2.0, -halfD + 0.18);
  room.group.add(shelfBoard);
  for (let i = 0; i < 5; i++) {
    const trinket = new THREE.Mesh(
      i % 2 ? new THREE.BoxGeometry(0.13, 0.19, 0.13) : new THREE.CylinderGeometry(0.08, 0.08, 0.2, 7),
      makeRetroMaterial({ color: [PALETTE_HEX.hc0553f, PALETTE_HEX.hc9a227, accent, PALETTE_HEX.hd8cdb4, PALETTE_HEX.h8a5a3c][i] }),
    );
    trinket.position.set(-halfW + 0.45 + i * 0.38, 2.14, -halfD + 0.2);
    room.group.add(trinket);
  }
  for (let p = 0; p < 2; p++) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 5), woodDark());
    peg.position.set(-halfW + 0.5 + p * 0.45, 1.85, halfD - 0.12);
    peg.rotation.x = Math.PI / 2;
    room.group.add(peg);
  }
  const coat = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.85, 0.12),
    makeRetroMaterial({ map: fabricSheet(owner === 'marigold' ? PALETTE_CSS.h7d8f5c : PALETTE_CSS.h4a6478, { folds: 3 }) }),
  );
  coat.position.set(-halfW + 0.5, 1.4, halfD - 0.16);
  room.group.add(coat);

  // A small table with a half-finished meal and a chair pushed back.
  const sideTable = table(0.9, 0.9, wood());
  sideTable.position.set(-halfW + 1.4, 0, halfD - 1.5);
  room.group.add(sideTable);
  room.addCollider(-halfW + 1.4, halfD - 1.5, 0.6);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 }));
  bowl.position.set(-halfW + 1.4, 0.78, halfD - 1.5);
  bowl.rotation.x = Math.PI;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 7), makeRetroMaterial({ color: accent }));
  cup.position.set(-halfW + 1.75, 0.83, halfD - 1.3);
  room.group.add(bowl, cup);
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.44), wood());
  seat.position.y = 0.45;
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.07), wood());
  chairBack.position.set(0, 0.72, -0.19);
  chair.add(seat, chairBack);
  for (const cx of [-0.17, 0.17]) {
    for (const cz of [-0.17, 0.17]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), wood());
      leg.position.set(cx, 0.22, cz);
      chair.add(leg);
    }
  }
  chair.position.set(-halfW + 1.5, 0, halfD - 0.6);
  chair.rotation.y = 2.7;
  room.group.add(chair);

  // A rag rug, a broom leaning in the corner, and a basket.
  const broom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), wood());
  broom.position.set(halfW - 0.35, 0.65, halfD - 0.7);
  broom.rotation.z = 0.2;
  const broomHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.12), makeRetroMaterial({ color: PALETTE_HEX.hb8a45c }));
  broomHead.position.set(halfW - 0.48, 0.13, halfD - 0.7);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.3, 9), makeRetroMaterial({ color: PALETTE_HEX.hb09a6a }));
  basket.position.set(halfW - 0.9, 0.15, halfD - 1.4);
  room.group.add(broom, broomHead, basket);
}

/** The player's house: starts bare; upgrades widen it. Furniture placement
 * and wallpaper/flooring are applied by the FurnitureSystem/Game on top. */
export function buildPlayerHouseInterior(
  index: number,
  tier: number,
  paperId = 'plaster',
  floorId = 'pine',
): Interior {
  const sizes: Array<[number, number]> = [
    [3.2, 2.8],
    [4.4, 3.6],
    [5.4, 4.4],
  ];
  const [halfW, halfD] = sizes[Math.min(tier, sizes.length - 1)];
  const room = new Interior('house-player', index, halfW, halfD);
  const paper = WALLPAPERS.find((w) => w.id === paperId) ?? WALLPAPERS[0];
  const floorStyle = FLOORS.find((f) => f.id === floorId) ?? FLOORS[0];
  buildShell(room, {
    wall: paper.make(),
    floor: floorStyle.make(),
  });
  // A bare starter room: one candle crate and the renovation ledger pinned
  // to the wall. Everything else is the player's to add.
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), woodDark());
  crate.position.set(-halfW + 1.0, 0.28, -halfD + 1.0);
  room.group.add(crate);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 6), makeRetroMaterial({ color: PALETTE_HEX.he8e0cc }));
  candle.position.set(-halfW + 1.0, 0.66, -halfD + 1.0);
  room.group.add(candle);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 5, 4),
    applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffb347 })),
  );
  flame.position.set(-halfW + 1.0, 0.8, -halfD + 1.0);
  flame.scale.y = 1.6;
  room.group.add(flame);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), makeRetroMaterial({ map: plasterSheet(PALETTE_CSS.he8dfc8) }));
  ledger.position.set(halfW - 1.2, 1.5, -halfD + 0.05);
  room.group.add(ledger);
  room.hotspots.push({
    x: halfW - 1.2,
    z: -halfD + 0.9,
    radius: 1.1,
    label: 'Renovation ledger',
    action: 'renovate',
  });
  // A workbench along the west wall: crafting.
  const bench = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.7), woodDark());
  top.position.y = 0.78;
  const vise = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), makeRetroMaterial({ color: PALETTE_HEX.h6a7a82 }));
  vise.position.set(0.5, 0.9, 0.2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), woodDark());
      leg.position.set(sx * 0.7, 0.39, sz * 0.28);
      bench.add(leg);
    }
  }
  const tools = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.05), makeRetroMaterial({ color: PALETTE_HEX.h54432f }));
  tools.position.set(0, 1.4, -0.32);
  bench.add(top, vise, tools);
  bench.position.set(-halfW + 1.0, 0, -halfD + 1.0);
  bench.rotation.y = 0.4;
  room.group.add(bench);
  room.addCollider(-halfW + 1.0, -halfD + 1.0, 0.8);
  room.hotspots.push({
    x: -halfW + 1.0,
    z: -halfD + 1.9,
    radius: 1.3,
    label: 'Use the workbench',
    action: 'craft',
  });
  // A permanent gramophone keeps the concert collection useful even in a
  // completely undecorated starter cottage.
  const gramophone = new THREE.Group();
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.5), woodDark());
  cabinet.position.y = 0.36;
  const horn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.38, 0.48, 8, 1, true),
    makeRetroMaterial({ color: PALETTE_HEX.hb47832, side: THREE.DoubleSide }),
  );
  horn.position.set(0, 0.94, 0);
  horn.rotation.x = Math.PI / 2;
  gramophone.add(cabinet, horn);
  gramophone.position.set(halfW - 0.7, 0, halfD - 0.75);
  room.group.add(gramophone);
  room.addCollider(halfW - 0.7, halfD - 0.75, 0.45);
  room.hotspots.push({
    x: halfW - 0.7,
    z: halfD - 1.45,
    radius: 1.2,
    label: 'Choose a record',
    action: 'concert',
  });
  return room;
}
