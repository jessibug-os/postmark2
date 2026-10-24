/**
 * Acre view — the island generator's grid drawn onto the world itself.
 *
 * Every line and every label here lies *on the ground*: the wireframe follows
 * the sampled surface across cliffs and river channels, and each acre's readout
 * is painted onto a mesh that conforms to the same heights. That is the whole
 * point of it. A side panel can tell you the acre you are in is a `cliff`; only
 * a mesh over the terrain tells you the cliff face is a metre north of where
 * you expected it, or that two acres disagree about where their shared edge is.
 *
 * Two rules:
 *  - It reads. Every height comes back through `IslandFieldQuery`, the same
 *    path `IslandBuilder` built the ground mesh from, so a line that floats or
 *    sinks is a real disagreement between the field and the mesh and not an
 *    artefact of this file.
 *  - It wears the scene's shaders. The retro pipeline bends distant geometry
 *    down in the vertex shader (`uCurvature`); an overlay built from stock
 *    materials would stay straight and peel away from the terrain with
 *    distance, which would look exactly like a generation bug.
 */
import * as THREE from 'three';
import {
  ACRE_SIZE, GRID_COLS, GRID_ROWS, TIER_HEIGHT, acreCentre,
  type Acre, type Edge, type PieceKind, type Surface, type Tier,
} from '../world/island/AcreLibrary';
import type { IslandMap } from '../world/island/IslandMap';
import { PIECE_PROFILES, pieceRotation, type IslandFieldQuery } from '../world/island/IslandRuntime';
import { applyVertexSnap } from '../core/RetroMaterial';
import { PALETTE_CSS, palette } from '../art/palette';

/** How far above the sampled ground the overlay floats, in world units. */
const LIFT = 0.06;

/** Samples per acre edge. The wire has to bend where the ground bends. */
const EDGE_STEPS = 14;

/** Grid resolution of a label patch — enough to sit down onto a cascade. */
const PATCH_STEPS = 10;

/** Labels only exist near the player; this is the radius, in acres. */
const LABEL_RADIUS = 2;

/**
 * Debug colours use the brightest separated entries in the shared palette.
 */
const TIER_COLOR: Readonly<Record<Tier, number>> = {
  0: palette.seasons.spring.accent,
  1: palette.glass,
  2: palette.amber,
};
const WATER_COLOR = palette.patina;
const BLOCKED_COLOR = palette.postalRed;

const EDGE_NAMES = ['N', 'E', 'S', 'W'] as const;

/**
 * A socket as one short token.
 *
 * Cliff sockets name their pair and, against the acre's own tier, which way the
 * ground goes: `cliff1v0` falls away across this edge, `cliff1^2` climbs. They
 * used to print as a bare `cliff`, which is exactly what made the ridge hard to
 * read on screen — an acre with a drop west and a rise east showed `W-cliff`
 * and `E-cliff` and looked symmetric.
 */
function surfaceText(s: Surface, tier: Tier): string {
  if (s.kind === 'cliff') {
    return s.high === tier ? `cliff${tier}v${s.low}` : `cliff${tier}^${s.high}`;
  }
  const t = (s as { tier?: number }).tier;
  return t === undefined ? s.kind : `${s.kind}${t}`;
}

/** A border, as one label. */
function socketText(edge: Edge, tier: Tier): string {
  return surfaceText(edge, tier);
}

export class AcreDebugLayer {
  readonly group = new THREE.Group();

  private wire: THREE.LineSegments | null = null;
  /** Built label patches, by `col,row`. Built once, then kept. */
  private labels = new Map<string, THREE.Mesh>();
  private labelMaterials: THREE.MeshBasicMaterial[] = [];
  private visible = false;
  /** The acre the labels were last centred on, so we only rebuild on a move. */
  private lastCentre = '';

  get isVisible(): boolean {
    return this.visible;
  }

  constructor(
    private readonly island: IslandMap | null,
    private readonly field: IslandFieldQuery | null,
  ) {
    this.group.visible = false;
    this.group.renderOrder = 3;
    if (this.island && this.field) this.buildWire();
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.group.visible = on;
    if (!on) this.lastCentre = '';
  }

  /** True when the layer has an island to draw at all. */
  get available(): boolean {
    return this.island !== null && this.field !== null;
  }

  /** Called each frame while visible; cheap unless the player changed acre. */
  update(x: number, z: number): void {
    if (!this.visible || !this.island || !this.field) return;
    const here = this.field.acreAt(x, z);
    const key = here ? `${here.col},${here.row}` : 'off';
    if (key === this.lastCentre) return;
    this.lastCentre = key;
    this.refreshLabels(here);
  }

  // --- the wireframe -------------------------------------------------------

  /**
   * One `LineSegments` for the whole grid.
   *
   * Edges are emitted once each rather than once per adjoining acre — drawing
   * both would double every interior line and make the seams that matter
   * (where two acres disagree) impossible to see against the doubling.
   */
  private buildWire(): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const drawn = new Set<string>();
    const colour = new THREE.Color();

    const emit = (
      x0: number, z0: number, x1: number, z1: number, acre: Acre,
    ): void => {
      const profile = PIECE_PROFILES[acre.kind];
      colour.setHex(
        !profile.walkable ? BLOCKED_COLOR
          : profile.water !== 'none' ? WATER_COLOR
            : TIER_COLOR[acre.tier],
      );
      for (let s = 0; s < EDGE_STEPS; s++) {
        const t0 = s / EDGE_STEPS;
        const t1 = (s + 1) / EDGE_STEPS;
        for (const t of [t0, t1]) {
          const px = x0 + (x1 - x0) * t;
          const pz = z0 + (z1 - z0) * t;
          positions.push(px, this.groundAt(px, pz), pz);
          colors.push(colour.r, colour.g, colour.b);
        }
      }
    };

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const acre = this.island!.at(col, row);
        if (!acre) continue;
        const { x, z } = acreCentre(col, row);
        const h = ACRE_SIZE / 2;
        // Each acre offers its north and west edges, plus the south and east
        // edges of the grid's far side, so every edge is claimed exactly once.
        const sides: Array<[string, number, number, number, number]> = [
          [`h${col},${row}`, x - h, z - h, x + h, z - h],
          [`v${col},${row}`, x - h, z - h, x - h, z + h],
          [`h${col},${row + 1}`, x - h, z + h, x + h, z + h],
          [`v${col + 1},${row}`, x + h, z - h, x + h, z + h],
        ];
        for (const [id, x0, z0, x1, z1] of sides) {
          if (drawn.has(id)) continue;
          drawn.add(id);
          emit(x0, z0, x1, z1, acre);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = applyVertexSnap(new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }));
    this.wire = new THREE.LineSegments(geometry, material);
    this.wire.frustumCulled = false;
    this.group.add(this.wire);
  }

  /**
   * Where the overlay sits: on the ground, or on the water covering it.
   *
   * Following the seabed put every ocean acre 1.4 units under the sea, so the
   * half of the grid that is water read as blank — you could see an acre's
   * wireframe only where the ocean plane happened to be sagging off it, which
   * was itself the bug. The overlay is a readout, not scenery, so over water it
   * floats on the surface instead of drowning under it.
   */
  private groundAt(x: number, z: number): number {
    const h = this.field!.heightAt(x, z);
    const water = this.field!.waterAt(x, z);
    return (water !== null && water > h ? water : h) + LIFT;
  }

  // --- labels --------------------------------------------------------------

  /**
   * Show the readouts for the acres around `here` and hide the rest.
   *
   * Labels are built on first approach and then kept: there are only a couple
   * of hundred acres, a patch is a small canvas, and rebuilding one every time
   * the player crosses a boundary would stutter on exactly the walk this view
   * exists to support.
   */
  private refreshLabels(here: Acre | null): void {
    for (const mesh of this.labels.values()) mesh.visible = false;
    if (!here) return;
    for (let dr = -LABEL_RADIUS; dr <= LABEL_RADIUS; dr++) {
      for (let dc = -LABEL_RADIUS; dc <= LABEL_RADIUS; dc++) {
        const acre = this.island!.at(here.col + dc, here.row + dr);
        if (!acre) continue;
        const key = `${acre.col},${acre.row}`;
        let mesh = this.labels.get(key);
        if (!mesh) {
          mesh = this.buildLabel(acre);
          this.labels.set(key, mesh);
          this.group.add(mesh);
        }
        mesh.visible = true;
      }
    }
  }

  /** A terrain-conforming patch carrying the acre's readout as a texture. */
  private buildLabel(acre: Acre): THREE.Mesh {
    const { x: cx, z: cz } = acreCentre(acre.col, acre.row);
    const size = ACRE_SIZE * 0.96;
    const geometry = new THREE.PlaneGeometry(size, size, PATCH_STEPS, PATCH_STEPS);
    geometry.rotateX(-Math.PI / 2);
    // Sit the patch down onto the ground vertex by vertex. A flat quad would
    // bury itself in any acre with a step in it, which is most of them.
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.groundAt(cx + pos.getX(i), cz + pos.getZ(i)));
    }
    pos.needsUpdate = true;
    geometry.translate(cx, 0, cz);

    const material = applyVertexSnap(new THREE.MeshBasicMaterial({
      map: this.paintLabel(acre),
      transparent: true,
      depthWrite: false,
      // The patch and the ground are the same surface; nudge the overlay
      // toward the camera so the two do not fight over the pixel.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }));
    this.labelMaterials.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  /**
   * Paint one acre's readout.
   *
   * Sized and weighted for the 480×360 render target: the scene is drawn small
   * and upscaled with nearest-neighbour, so thin text dissolves. Few lines,
   * heavy strokes, hard contrast against a dark plate.
   */
  private paintLabel(acre: Acre): THREE.CanvasTexture {
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const profile = PIECE_PROFILES[acre.kind];

    // An acre is 14 units across and the camera sits close, so a full-bleed
    // plate would black out the ground this view exists to show. The readout
    // takes the middle of the acre and the corners stay see-through.
    // The readout sits in the southern half of the acre, not its centre. The
    // camera looks down from the south, so the player's own body covers the
    // ground *north* of where she stands — dead centre is the one part of an
    // acre you cannot read while standing in it.
    ctx.fillStyle = 'rgba(14,11,8,0.45)';
    ctx.fillRect(40, 126, S - 80, 104);

    const centre = (text: string, y: number, size: number, colour: string): void => {
      ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(3, size * 0.28);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(text, S / 2, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, S / 2, y);
    };

    centre(`${acre.col},${acre.row}`, 150, 26, PALETTE_CSS.hffb347);
    centre(acre.kind, 172, 18, PALETTE_CSS.hf2ead6);
    centre(`t${acre.tier} ${acre.pieceId ?? '-'} r${pieceRotation(acre)} h${TIER_HEIGHT[acre.tier].toFixed(2)}`,
      190, 15, PALETTE_CSS.hbcd0e8);
    centre(profile.walkable ? profile.water === 'none' ? 'walk' : `walk/${profile.water}` : 'BLOCKED',
      207, 15, profile.walkable ? PALETTE_CSS.h8a9a5a : PALETTE_CSS.ha8402f);

    // Sockets go where the edges they describe are: north at the top of the
    // patch, and so on. Reading a mismatch is then a matter of standing on the
    // seam and looking down, rather than comparing two panels.
    ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.fillStyle = PALETTE_CSS.h9a7f4e;
    const at = (text: string, x: number, y: number, align: CanvasTextAlign): void => {
      ctx.textAlign = align;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    };
    const edge = (i: number): string => `${EDGE_NAMES[i]}·${socketText(acre.edges[i], acre.tier)}`;
    at(edge(0), S / 2, 20, 'center');
    at(edge(2), S / 2, S - 4, 'center');
    at(edge(3), 6, 118, 'left');
    at(edge(1), S - 6, 118, 'right');

    // The last line of the plate is whichever of these the acre has; an acre
    // with both a river and an anchor is rare enough to lose the river to the
    // anchor rather than pay a line of plate for it everywhere.
    const anchor = this.anchorLabel(acre);
    if (anchor) centre(anchor, 225, 16, PALETTE_CSS.hffb347);
    else if (acre.riverEdges?.length) {
      centre(`river ${acre.riverEdges.map((e) => EDGE_NAMES[e]).join('→')}`, 225, 15, PALETTE_CSS.hbcd0e8);
    }

    const texture = new THREE.CanvasTexture(canvas);
    // Nearest sampling, to match everything else in the scene.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** Which authored landmark, if any, claims this acre. */
  private anchorLabel(acre: Acre): string | null {
    const { dock, postOffice, summit } = this.island!.anchors;
    const here = (a: { col: number; row: number }): boolean => a.col === acre.col && a.row === acre.row;
    if (here(dock)) return '⚓ dock';
    if (here(postOffice)) return '✉ post office';
    if (here(summit)) return '▲ summit';
    const bridge = this.island!.bridges.find(here);
    return bridge ? `bridge ${bridge.id}` : null;
  }

  /** One-line summary for the console, so `acre` can answer without the view. */
  describe(x: number, z: number): string[] {
    if (!this.island || !this.field) return ['No generated island is active on this map.'];
    const acre = this.field.acreAt(x, z);
    if (!acre) return ['Off the acre grid.'];
    const kinds = new Map<PieceKind, number>();
    for (const a of this.island.acres) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
    return [
      `here  [${acre.col},${acre.row}] ${acre.kind} tier ${acre.tier}`,
      `map   ${this.island.id}  ${GRID_COLS}×${GRID_ROWS} acres of ${ACRE_SIZE}`,
      `mix   ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ')}`,
    ];
  }

  dispose(): void {
    this.wire?.geometry.dispose();
    (this.wire?.material as THREE.Material | undefined)?.dispose();
    for (const mesh of this.labels.values()) mesh.geometry.dispose();
    for (const material of this.labelMaterials) {
      material.map?.dispose();
      material.dispose();
    }
    this.labels.clear();
    this.labelMaterials = [];
    this.group.clear();
  }
}
