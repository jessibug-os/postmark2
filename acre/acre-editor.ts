/**
 * The acre editor — `/acre`.
 *
 * A level editor for the pieces the island generator arranges
 * (`docs/ACRE_EDITOR_PLAN.md`, phases E3–E5). Phase L wants ~148 authored
 * acres; hand-writing that many `.acre` files is what this exists to prevent.
 *
 * Three things it is careful about, all of them lessons the acre migration
 * already paid for:
 *
 * - **Nothing is validated twice.** Every readout on this page is the game's own
 *   function — `pieceWellFormed`, `pieceRoleKey`, `pieceLowPattern`,
 *   `pieceRampEdge`, `edgeCode`, `edgeRunsCompatible`. A second implementation
 *   here would eventually disagree with the solver, and the editor would be
 *   certifying pieces the placer then rejects.
 * - **The 3D pane is the real path.** `previewIsland` → `sampleIsland` →
 *   `buildGroundGeometry` / `buildCliffWallGeometry`, exactly as the game builds
 *   its ground. A preview renderer that read the bitmap itself would agree with
 *   a broken piece.
 * - **Edits are live, not saved.** They go in as `PieceOverrides`, so the
 *   tiling pane and both 3D panes answer for the unsaved bitmap. Saving is an
 *   explicit `PUT` through `formatAcre`, so the file on disk is canonical.
 *
 * The tiling pane is the one that earns the tool. The standing authoring rule is
 * *vary the interior, leave the edges alone — an edge is a contract with a
 * neighbour that has not been placed yet*, and it is the rule authors keep
 * breaking. A side with no legal continuation turns red in the same frame.
 */
import * as THREE from 'three';
import {
  CELL_TERRAINS, DEPTH_DEFAULT, DEPTH_MAX, PIECE_SIZE, TERRAIN_CHARS,
  cellAt, cellIndex, edgeCells, edgeCode, edgeRunsCompatible,
  CROSSING_OFFSETS, OPPOSITE_DIR, pieceLowPattern, pieceRampEdge, pieceRoleKey, pieceTiers,
  pieceWellFormed, placements, rotatePiece,
  type AcreFixture, type AcrePiece, type CellTerrain, type PieceCell,
} from '../src/world/island/AcrePiece';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { placeFixture } from '../src/world/island/AcreFixtures';
import { ACTIVE_GAME_OBJECTS } from '../src/content/activePack';
import { componentsOf, type GameObject } from '../src/world/objects/GameObjectFormat';

/** What an object type can do, in a line, for the inspector's read-only row. */
function describeComponents(object: GameObject): string {
  const counts = new Map<string, number>();
  for (const component of object.components) {
    // Comments ride in the component list so they can be written back in place;
    // they are not something the object *does*.
    if (component.kind === 'comment') continue;
    counts.set(component.kind, (counts.get(component.kind) ?? 0) + 1);
  }
  const parts = [...counts].map(([kind, n]) => (n === 1 ? kind : `${kind} ×${n}`));
  return parts.length > 0 ? `${object.model} · ${parts.join(', ')}` : object.model;
}
import { formatAcre, parseAcre } from '../src/world/island/AcreFormat';
import { allPlacements, libraryProblems } from '../src/world/island/PieceLibrary';
import { clearOverride, setOverride } from '../src/world/island/PieceOverrides';
import { previewIsland, PREVIEW_COL, PREVIEW_ROW } from '../src/world/island/AcrePreview';
import { SEA_LEVEL, sampleIsland } from '../src/world/island/IslandRuntime';
import { buildCliffWallGeometry, buildGroundGeometry } from '../src/world/terrain';
import { ACRE_SIZE, acreCentre, type PieceKind, type Tier } from '../src/world/island/AcreLibrary';

const API = '/acre/pieces';

/** Colours for the paint grid. Deliberately not the game palette: this is a map, not a render. */
const TERRAIN_COLOURS: Record<CellTerrain, string> = {
  'ocean': '#2d5c74',
  'sand': '#d8c48c',
  'grass': '#557c3c',
  'dirt': '#7a5a3a',
  'river': '#4a8fa8',
  'pond': '#3f7f96',
  'ramp': '#b8a06a',
};

const TIER_TINTS = ['rgba(0,0,0,0.34)', 'rgba(0,0,0,0)', 'rgba(255,255,255,0.26)'];

interface Listing {
  id: string; file: string; group: string; family: string; weight: number;
  tags: string[]; rotatable: boolean; offset: number | null; bytes: number;
}

const dom = {
  list: document.getElementById('catalog-list')!,
  count: document.getElementById('catalog-count')!,
  filter: document.getElementById('filter') as HTMLInputElement,
  newPiece: document.getElementById('new-piece') as HTMLButtonElement,
  grid: document.getElementById('grid') as HTMLCanvasElement,
  cursor: document.getElementById('cursor-read')!,
  swatches: document.getElementById('swatches')!,
  status: document.getElementById('status')!,
  derived: document.getElementById('derived')!,
  edges: document.getElementById('edges')!,
  sides: document.getElementById('sides')!,
  problems: document.getElementById('problems')!,
  stage: document.getElementById('stage')!,
  stageNote: document.getElementById('stage-note')!,
  undo: document.getElementById('undo') as HTMLButtonElement,
  redo: document.getElementById('redo') as HTMLButtonElement,
  save: document.getElementById('save') as HTMLButtonElement,
  revert: document.getElementById('revert') as HTMLButtonElement,
  rotate: document.getElementById('rotate') as HTMLButtonElement,
  del: document.getElementById('delete') as HTMLButtonElement,
  hId: document.getElementById('h-id') as HTMLInputElement,
  hGroup: document.getElementById('h-group') as HTMLSelectElement,
  hWeight: document.getElementById('h-weight') as HTMLInputElement,
  hTags: document.getElementById('h-tags') as HTMLInputElement,
  hOffset: document.getElementById('h-offset') as HTMLSelectElement,
  hRotatable: document.getElementById('h-rotatable') as HTMLInputElement,
  hUnique: document.getElementById('h-unique') as HTMLInputElement,
  fixtureHint: document.getElementById('fixture-hint')!,
  fixtureTree: document.getElementById('fixture-tree')!,
  fixtureForm: document.getElementById('fixture-form')!,
  fixtureAddProp: document.getElementById('fixture-add-prop') as HTMLButtonElement,
  fixtureAddMark: document.getElementById('fixture-add-mark') as HTMLButtonElement,
  fixtureDelete: document.getElementById('fixture-delete') as HTMLButtonElement,
};

const state = {
  listing: [] as Listing[],
  piece: null as AcrePiece | null,
  /** The piece as it is on disk, for revert and for the dirty flag. */
  saved: null as AcrePiece | null,
  /** Ids the editor has changed and not yet written. */
  dirty: new Set<string>(),
  /** Ids that exist only in the editor. */
  fresh: new Set<string>(),
  /** Folders the author has made, including empty ones the listing cannot know about. */
  groups: new Set<string>(),
  layer: 'terrain' as 'terrain' | 'tier' | 'depth',
  tool: 'brush' as 'brush' | 'fill' | 'rect',
  terrain: 'grass' as CellTerrain,
  tier: 1 as Tier,
  /** Depth digit the depth brush paints, 0 (shallow) to 9 (full). */
  depth: DEPTH_DEFAULT,
  undo: [] as (readonly PieceCell[])[],
  redo: [] as (readonly PieceCell[])[],
  /** The fixture being edited, by id. */
  fixture: null as string | null,
};

// --- library helpers -------------------------------------------------------

/** The authored id behind a placement id: `cliff-straight-01@2` → `cliff-straight-01`. */
const baseId = (id: string): string => id.split('@')[0];

function setStatus(text: string, tone: '' | 'good' | 'bad' = ''): void {
  dom.status.textContent = text;
  dom.status.className = `banner${tone ? ` ${tone}` : ''}`;
}

/** Push the current bitmap into the live library so every pane sees the edit. */
function publish(): void {
  if (state.piece) setOverride(state.piece.id, state.piece);
}

// --- the paint grid (E3.1) -------------------------------------------------

const CELL_PX = dom.grid.width / PIECE_SIZE;

function drawGrid(): void {
  const ctx = dom.grid.getContext('2d')!;
  ctx.clearRect(0, 0, dom.grid.width, dom.grid.height);
  const piece = state.piece;
  if (!piece) return;
  for (let row = 0; row < PIECE_SIZE; row++) {
    for (let col = 0; col < PIECE_SIZE; col++) {
      const cell = cellAt(piece, col, row);
      const x = col * CELL_PX;
      const y = row * CELL_PX;
      ctx.fillStyle = TERRAIN_COLOURS[cell.terrain];
      ctx.fillRect(x, y, CELL_PX, CELL_PX);
      // Tier as a light/dark wash over the terrain, so both layers are legible
      // at once — a wall drawn on the wrong side of a step is the mistake this
      // grid has to make obvious, and it is invisible in either layer alone.
      ctx.fillStyle = TIER_TINTS[cell.tier];
      ctx.fillRect(x, y, CELL_PX, CELL_PX);
      if (state.layer === 'tier') {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(CELL_PX * 0.5)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cell.tier), x + CELL_PX / 2, y + CELL_PX / 2);
      }
      if (state.layer === 'depth') {
        const depth = cell.depth ?? DEPTH_DEFAULT;
        // Dry cells are dimmed rather than hidden. Depth does nothing on dry
        // ground, and an author needs to see *where* it does nothing — the
        // alternative is painting a lagoon onto grass and wondering why the
        // sea did not move.
        const wet = cell.terrain === 'ocean' || cell.terrain === 'river' || cell.terrain === 'pond';
        const k = depth / DEPTH_MAX;
        ctx.fillStyle = wet
          ? `rgba(${Math.round(196 - k * 128)},${Math.round(224 - k * 128)},${Math.round(232 - k * 108)},0.88)`
          : 'rgba(20,20,20,0.55)';
        ctx.fillRect(x, y, CELL_PX, CELL_PX);
        if (wet) {
          ctx.fillStyle = k > 0.55 ? '#eef4f6' : '#1d2a2e';
          ctx.font = `${Math.round(CELL_PX * 0.5)}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(depth), x + CELL_PX / 2, y + CELL_PX / 2);
        }
      }
    }
  }
  // Cell lattice.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (let i = 1; i < PIECE_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_PX, 0); ctx.lineTo(i * CELL_PX, dom.grid.height);
    ctx.moveTo(0, i * CELL_PX); ctx.lineTo(dom.grid.width, i * CELL_PX);
    ctx.stroke();
  }
  drawCrossingGuide(ctx);
  drawFixtureHandles(ctx);
}

/**
 * The crossing-offset guide (E3.3).
 *
 * A wall's offset **is** its edge: it decides which cells of a border the wall
 * occupies, and every wall on an island uses the same crossing. A wall drawn
 * anywhere else is a piece the placer can never ask for, so the legal crossings
 * are marked on all four borders — `TierSolver.CROSSING_OFFSETS`, which ships at
 * `[7]`, with `[3, 7, 11]` the alphabet the mechanism was built for.
 */
function drawCrossingGuide(ctx: CanvasRenderingContext2D): void {
  const legal = new Set<number>(CROSSING_OFFSETS as readonly number[]);
  for (let i = 0; i < PIECE_SIZE; i++) {
    const on = legal.has(i);
    ctx.fillStyle = on ? '#ffd27a' : 'rgba(255,255,255,0.13)';
    const t = on ? 6 : 3;
    ctx.fillRect(i * CELL_PX, 0, CELL_PX, t);
    ctx.fillRect(i * CELL_PX, dom.grid.height - t, CELL_PX, t);
    ctx.fillRect(0, i * CELL_PX, t, CELL_PX);
    ctx.fillRect(dom.grid.width - t, i * CELL_PX, t, CELL_PX);
  }
}

function cellAtEvent(event: PointerEvent): { col: number; row: number } | null {
  const rect = dom.grid.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * PIECE_SIZE);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * PIECE_SIZE);
  if (col < 0 || row < 0 || col >= PIECE_SIZE || row >= PIECE_SIZE) return null;
  return { col, row };
}

function pushUndo(): void {
  if (!state.piece) return;
  state.undo.push(state.piece.cells);
  if (state.undo.length > 128) state.undo.shift();
  state.redo.length = 0;
}

/** Apply the current brush to one cell, in whichever layer is being painted. */
function painted(cell: PieceCell): PieceCell {
  if (state.layer === 'terrain') return { ...cell, terrain: state.terrain };
  if (state.layer === 'tier') return { ...cell, tier: state.tier };
  return { ...cell, depth: state.depth };
}

function paintCells(targets: readonly number[]): void {
  const piece = state.piece;
  if (!piece) return;
  const cells = [...piece.cells];
  let changed = false;
  for (const i of targets) {
    const next = painted(cells[i]);
    if (next.terrain === cells[i].terrain && next.tier === cells[i].tier
      && (next.depth ?? DEPTH_DEFAULT) === (cells[i].depth ?? DEPTH_DEFAULT)) continue;
    cells[i] = next;
    changed = true;
  }
  if (!changed) return;
  state.piece = { ...piece, cells };
  markDirty();
  refresh();
}

/** Four-connected flood over cells matching the one under the cursor, in the painted layer. */
function floodTargets(col: number, row: number): number[] {
  const piece = state.piece!;
  const start = cellIndex(col, row);
  const same = (i: number): boolean => {
    if (state.layer === 'terrain') return piece.cells[i].terrain === piece.cells[start].terrain;
    if (state.layer === 'tier') return piece.cells[i].tier === piece.cells[start].tier;
    return (piece.cells[i].depth ?? DEPTH_DEFAULT) === (piece.cells[start].depth ?? DEPTH_DEFAULT);
  };
  const seen = new Set<number>([start]);
  const stack = [start];
  const out: number[] = [];
  while (stack.length > 0) {
    const at = stack.pop()!;
    out.push(at);
    const c = at % PIECE_SIZE;
    const r = Math.floor(at / PIECE_SIZE);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= PIECE_SIZE || nr >= PIECE_SIZE) continue;
      const ni = cellIndex(nc, nr);
      if (seen.has(ni) || !same(ni)) continue;
      seen.add(ni);
      stack.push(ni);
    }
  }
  return out;
}

let stroke: { from: { col: number; row: number }; painting: boolean } | null = null;

/** The fixture being dragged on the grid, if any. */
let fixtureDrag: string | null = null;

dom.grid.addEventListener('pointerdown', (event) => {
  const at = cellAtEvent(event);
  if (!at || !state.piece) return;
  // A fixture handle wins over the brush. Painting under a handle is still
  // possible — move the fixture, paint, move it back — and the alternative
  // costs the direct manipulation entirely, which is the whole point of drawing
  // the handles on the grid rather than listing coordinates beside it.
  const handle = fixtureAtEvent(event);
  if (handle) {
    dom.grid.setPointerCapture(event.pointerId);
    fixtureDrag = handle.id;
    state.fixture = handle.id;
    refresh();
    return;
  }
  dom.grid.setPointerCapture(event.pointerId);
  pushUndo();
  if (state.tool === 'fill') { paintCells(floodTargets(at.col, at.row)); return; }
  stroke = { from: at, painting: true };
  if (state.tool === 'brush') paintCells([cellIndex(at.col, at.row)]);
});

dom.grid.addEventListener('pointermove', (event) => {
  if (fixtureDrag) {
    const to = gridToFixture(event);
    editFixture(fixtureDrag, (fixture) => ({
      ...fixture, position: { ...fixture.position, x: to.x, z: to.z },
    }));
    dom.cursor.textContent = `${fixtureDrag} · ${to.x}m ${to.z}m`;
    return;
  }
  const at = cellAtEvent(event);
  if (at && state.piece) {
    const cell = cellAt(state.piece, at.col, at.row);
    dom.cursor.textContent = `${at.col},${at.row} · ${cell.terrain} @${cell.tier}`;
  }
  if (!stroke || !at || state.tool !== 'brush') return;
  paintCells([cellIndex(at.col, at.row)]);
});

dom.grid.addEventListener('pointerup', (event) => {
  if (fixtureDrag) {
    dom.grid.releasePointerCapture(event.pointerId);
    fixtureDrag = null;
    return;
  }
  const at = cellAtEvent(event);
  if (stroke && at && state.tool === 'rect') {
    const c0 = Math.min(stroke.from.col, at.col);
    const c1 = Math.max(stroke.from.col, at.col);
    const r0 = Math.min(stroke.from.row, at.row);
    const r1 = Math.max(stroke.from.row, at.row);
    const targets: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) targets.push(cellIndex(c, r));
    paintCells(targets);
  }
  stroke = null;
});

// --- readouts (E3.2) -------------------------------------------------------

const DIR_NAMES = ['north', 'east', 'south', 'west'];

function row(dl: HTMLElement, term: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

function drawReadouts(): void {
  const piece = state.piece;
  dom.derived.replaceChildren();
  dom.edges.replaceChildren();
  dom.problems.replaceChildren();
  if (!piece) return;

  const low = pieceLowPattern(piece);
  const ramp = pieceRampEdge(piece);
  row(dom.derived, 'role', pieceRoleKey(piece));
  row(dom.derived, 'tiers', pieceTiers(piece).join(', '));
  row(dom.derived, 'downhill', low.downhill.length ? low.downhill.map((d) => DIR_NAMES[d]).join(', ') : '—');
  row(dom.derived, 'notches', low.notches.length ? low.notches.join(', ') : '—');
  row(dom.derived, 'ramp', ramp === null ? '—' : DIR_NAMES[ramp]);
  row(dom.derived, 'placements', String(placements(piece).length));
  const cliffEdges = piece.cells.reduce((count, cell, i) => {
    const col = i % PIECE_SIZE;
    const row = Math.floor(i / PIECE_SIZE);
    if (col + 1 < PIECE_SIZE && piece.cells[i + 1].tier !== cell.tier) count++;
    if (row + 1 < PIECE_SIZE && piece.cells[i + PIECE_SIZE].tier !== cell.tier) count++;
    return count;
  }, 0);
  row(dom.derived, 'cliff edges', String(cliffEdges));

  for (let d = 0; d < 4; d++) row(dom.edges, DIR_NAMES[d], edgeCode(piece, d));

  const problems = pieceWellFormed(piece);
  if (problems.length === 0) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = 'well formed';
    dom.problems.append(li);
  } else {
    for (const problem of problems) {
      const li = document.createElement('li');
      li.textContent = problem;
      dom.problems.append(li);
    }
  }
  // The library-wide check, which catches what a single piece cannot: a
  // duplicate id, most often from "new acre" before it has been renamed.
  for (const problem of libraryProblems()) {
    if (!problem.startsWith(`${piece.id}: `)) continue;
    if (problems.some((p) => problem.endsWith(p))) continue;
    const li = document.createElement('li');
    li.textContent = problem;
    dom.problems.append(li);
  }
}

// --- neighbour tiling (E4.1) ----------------------------------------------

/**
 * Every placement that could sit across compass `d` from this one.
 *
 * This is `lookup`'s edge clause with no role attached, and that is deliberate:
 * the pane asks *"can anything continue this edge"*, not "can a shore continue
 * it". A role request would need a family and a tier the centre piece has no
 * business choosing for its neighbour, and a zero would then mean "no shore
 * fits" rather than the thing the author needs to see, which is that they have
 * drawn an edge nothing in the library can meet.
 */
function continuations(piece: AcrePiece, d: number): AcrePiece[] {
  const mine = edgeCells(piece, d);
  return allPlacements().filter((candidate) => {
    if (baseId(candidate.id) === piece.id) return false;
    return edgeRunsCompatible(mine, edgeCells(candidate, OPPOSITE_DIR[d]));
  });
}

/** The best neighbour for a diagonal: compatible with both of its adjacent sides. */
function diagonalPick(
  piece: AcrePiece, dc: number, dr: number, chosen: (AcrePiece | null)[],
): AcrePiece | null {
  const horizontal = chosen[dc > 0 ? 1 : 3];
  const vertical = chosen[dr > 0 ? 2 : 0];
  for (const candidate of allPlacements()) {
    if (baseId(candidate.id) === piece.id) continue;
    if (vertical && !edgeRunsCompatible(
      edgeCells(candidate, dc > 0 ? 3 : 1), edgeCells(vertical, dc > 0 ? 1 : 3))) continue;
    if (horizontal && !edgeRunsCompatible(
      edgeCells(candidate, dr > 0 ? 0 : 2), edgeCells(horizontal, dr > 0 ? 2 : 0))) continue;
    return candidate;
  }
  return null;
}

/** The nine acres of the tiling pane: index 4 is the piece being edited. */
function tiling(piece: AcrePiece): { pieces: (AcrePiece | null)[]; counts: number[] } {
  const sides: (AcrePiece | null)[] = [null, null, null, null];
  const counts = [0, 0, 0, 0];
  for (let d = 0; d < 4; d++) {
    const candidates = continuations(piece, d);
    counts[d] = candidates.length;
    sides[d] = candidates[0] ?? null;
  }
  const pieces: (AcrePiece | null)[] = new Array(9).fill(null);
  pieces[4] = piece;
  pieces[1] = sides[0];
  pieces[5] = sides[1];
  pieces[7] = sides[2];
  pieces[3] = sides[3];
  pieces[0] = diagonalPick(piece, -1, -1, sides);
  pieces[2] = diagonalPick(piece, 1, -1, sides);
  pieces[6] = diagonalPick(piece, -1, 1, sides);
  pieces[8] = diagonalPick(piece, 1, 1, sides);
  return { pieces, counts };
}

let lastTiling: { pieces: (AcrePiece | null)[]; counts: number[] } = { pieces: [], counts: [] };

/**
 * Recompute what tiles with this acre.
 *
 * The nine-square canvas this used to draw is gone — the live 3D pane answers
 * the same question better, and in the frame the acre is actually authored in.
 * What it fed is not gone: `lastTiling` is what `previewIsland` builds the 3D
 * pane's neighbours from, and the per-side counts are still the Continuations
 * readout, which is the part that says *a side with no legal continuation* and
 * is the standing authoring rule made visible.
 */
function tilingPass(): void {
  dom.sides.replaceChildren();
  const piece = state.piece;
  if (!piece) return;
  lastTiling = tiling(piece);
  for (let d = 0; d < 4; d++) {
    const box = document.createElement('div');
    if (lastTiling.counts[d] === 0) box.className = 'zero';
    box.textContent = `${DIR_NAMES[d].slice(0, 1).toUpperCase()} ${lastTiling.counts[d]}`;
    box.title = `${lastTiling.counts[d]} placements can sit across the ${DIR_NAMES[d]} border`;
    dom.sides.append(box);
  }
}

// --- live 3D (E5) ----------------------------------------------------------

interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  group: THREE.Group;
  orbit: { azimuth: number; distance: number; target: THREE.Vector3 };
}

/** A stage at the gameplay camera's own angle: 35° lens, 40° down, due south. */
function makeStage(host: HTMLElement, distance: number): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#20242c');
  scene.add(new THREE.HemisphereLight(0xd9e6ff, 0x4a4436, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(-12, 20, 8);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
  const group = new THREE.Group();
  scene.add(group);
  const stage: Stage = {
    scene, camera, renderer, group,
    orbit: { azimuth: 0, distance, target: new THREE.Vector3() },
  };

  let dragging = false;
  let lastX = 0;
  host.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    stage.orbit.azimuth += (e.clientX - lastX) * 0.4;
    lastX = e.clientX;
    place(stage);
  });
  host.addEventListener('wheel', (e) => {
    e.preventDefault();
    stage.orbit.distance = Math.max(6, Math.min(320, stage.orbit.distance * (1 + Math.sign(e.deltaY) * 0.12)));
    place(stage);
  }, { passive: false });
  return stage;
}

function place(stage: Stage): void {
  const pitch = THREE.MathUtils.degToRad(40);
  const az = THREE.MathUtils.degToRad(stage.orbit.azimuth);
  const ground = Math.cos(pitch) * stage.orbit.distance;
  const height = Math.sin(pitch) * stage.orbit.distance;
  const t = stage.orbit.target;
  stage.camera.position.set(t.x + Math.sin(az) * ground, t.y + height, t.z + Math.cos(az) * ground);
  stage.camera.lookAt(t);
}

function resize(stage: Stage, host: HTMLElement): void {
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (w === 0 || h === 0) return;
  stage.renderer.setSize(w, h, false);
  stage.camera.aspect = w / h;
  stage.camera.updateProjectionMatrix();
}

const GROUND_MAT = new THREE.MeshLambertMaterial({ color: 0x4c6b3a, flatShading: true });
const WALL_MAT = new THREE.MeshLambertMaterial({ color: 0x8b8378, flatShading: true });
const WATER_MAT = new THREE.MeshLambertMaterial({
  color: 0x3f6f86, transparent: true, opacity: 0.72, flatShading: true,
});

/**
 * The island's meshes, built by the game's own builders.
 *
 * `buildGroundGeometry` and `buildCliffWallGeometry` emit geometry in the
 * renderer's own frame — x east, y *north* (they negate z), z up — which is why
 * the group is rotated back rather than the vertices being rewritten here. The
 * builders are shared with the game and must not grow a preview mode.
 */
function renderIsland(
  stage: Stage,
  island: ReturnType<typeof previewIsland>,
  centre: { x: number; z: number },
): void {
  stage.group.clear();
  const ground = new THREE.Mesh(
    buildGroundGeometry(island, (x, z) => sampleIsland(island, x, z).height),
    GROUND_MAT,
  );
  const walls = new THREE.Mesh(buildCliffWallGeometry(island), WALL_MAT);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(ACRE_SIZE * 20, ACRE_SIZE * 20), WATER_MAT);
  water.position.z = SEA_LEVEL;
  const shell = new THREE.Group();
  shell.add(ground, walls, water);
  shell.rotation.x = -Math.PI / 2;
  stage.group.add(shell);
  // Rotating the shell upright maps the builders' (x, y, z) to world
  // (x, height, z) with the world centred on the map, so a world point is its
  // own camera target — but its *height* has to be sampled, or the camera
  // frames a tier-2 acre from underneath it.
  stage.orbit.target.set(centre.x, sampleIsland(island, centre.x, centre.z).height, centre.z);
  place(stage);
}

const pieceStage = makeStage(dom.stage, ACRE_SIZE * 1.9);

/**
 * Fixtures live beside the terrain shell, not inside it.
 *
 * `renderIsland` clears `stage.group` and rebuilds the ground every pass, and
 * the shell it adds is rotated upright — so anything parented to it would be
 * both destroyed on the next repaint and rotated out of world space.
 */
const fixtureGroup = new THREE.Group();
pieceStage.scene.add(fixtureGroup);

function frame(): void {
  resize(pieceStage, dom.stage);
  pieceStage.renderer.render(pieceStage.scene, pieceStage.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function drawPreview(): void {
  const piece = state.piece;
  if (!piece) return;
  if (pieceWellFormed(piece).length > 0) {
    dom.stageNote.textContent = 'not well formed — the 3D pane holds the last legal bitmap';
    return;
  }
  const island = previewIsland(piece, lastTiling.pieces);
  renderIsland(pieceStage, island, acreCentre(PREVIEW_COL, PREVIEW_ROW));
  const fixtures = renderFixtures(piece, island);
  const pending = propsPending();
  dom.stageNote.textContent = pending > 0
    ? `loading ${pending} model${pending === 1 ? '' : 's'}…`
    : `the real sampler, mesh and ${fixtures} fixture${fixtures === 1 ? '' : 's'}`
      + ' · drag to turn · scroll to zoom';
}

const MARK_MAT = new THREE.MeshBasicMaterial({
  color: 0x8fd0ff, depthTest: false, transparent: true, opacity: 0.9,
});

/**
 * Put this acre's fixtures into the 3D pane, where they actually stand.
 *
 * Resolved through `placeFixture` — the same function the game uses — rather
 * than by repeating the maths here. That is the standing rule of this page: the
 * 3D pane is the real path, so a preview that agreed with a broken transform
 * would be worse than no preview.
 *
 * Marks are octahedra with `depthTest` off, matching the scene editor's mark
 * gizmos, because a mark inside a building is exactly the one you most need to
 * see. Props are the real model.
 */
function renderFixtures(piece: AcrePiece, island: ReturnType<typeof previewIsland>): number {
  fixtureGroup.clear();
  const acre = { col: PREVIEW_COL, row: PREVIEW_ROW, kind: piece.family };
  const ground = (x: number, z: number): number => sampleIsland(island, x, z).height;
  let shown = 0;
  for (const fixture of piece.fixtures ?? []) {
    const placed = placeFixture(fixture, acre, ground);
    if (fixture.kind === 'mark') {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), MARK_MAT);
      mesh.renderOrder = 999;
      mesh.position.copy(placed.position);
      fixtureGroup.add(mesh);
      shown += 1;
      continue;
    }
    const model = propModel(modelOf(fixture.object));
    if (!model) continue;
    const instance = model.object.clone(true);
    instance.position.copy(placed.position);
    instance.rotation.y = placed.yaw;
    fixtureGroup.add(instance);
    shown += 1;
  }
  return shown;
}


// --- prop models ------------------------------------------------------------

/**
 * The `.glb` behind a prop fixture, loaded once and kept.
 *
 * Two panes need it and neither can do its job without the real thing. The
 * bitmap needs the model's **footprint** — a pin says where a prop is and
 * nothing about whether it fits in the acre, which is the question you are
 * actually asking while you drag it. The 3D pane needs the model itself, or it
 * is a picture of the ground with the building left out.
 *
 * Loaded here rather than read from `/models/manifest.json` because the
 * manifest carries sizes in bytes, not metres; a bounding box is a property of
 * the geometry and the only honest way to get one is to load it.
 */
interface PropModel {
  object: THREE.Object3D;
  /** Bounding-box extents in metres, in the model's own frame. */
  size: THREE.Vector3;
  /** Centre offset, since a model need not be built around its origin. */
  centre: THREE.Vector3;
  /**
   * The model seen from directly above, rendered once and kept.
   *
   * A bounding box says how much room a prop takes; it does not say what the
   * prop *is*. Two buildings of the same extent read identically as boxes and
   * not at all alike from above, and the whole question being asked on the
   * bitmap is what this acre looks like — so the bitmap composites the real
   * silhouette instead.
   *
   * Square, spanning the model's larger horizontal extent, so compositing it
   * needs one scale and no aspect bookkeeping.
   */
  top: HTMLCanvasElement | null;
  /** The metres that square spans, for placing it on the grid. */
  topSpan: number;
}

/**
 * One small renderer for the top-down thumbnails, kept off-screen.
 *
 * Separate from the live 3D pane's renderer because it draws a different thing
 * with a different camera and would otherwise have to save and restore that
 * pane's state on every repaint.
 */
const TOP_PX = 384;
let topRenderer: THREE.WebGLRenderer | null = null;

/**
 * Render a model from directly above, into its own 2D canvas.
 *
 * The camera is orthographic and framed exactly to the model's larger extent,
 * so the returned square maps one-to-one onto the footprint the bitmap draws it
 * at — no fitting, no guessing at scale.
 *
 * `up` is `-z`, which puts world +z at the **bottom** of the image. That is the
 * bitmap's own convention (row 0 is north, +z is south), and getting it wrong
 * would mirror every building on the grid while looking entirely plausible.
 */
function topDownCanvas(object: THREE.Object3D, size: THREE.Vector3, centre: THREE.Vector3): {
  canvas: HTMLCanvasElement; span: number;
} | null {
  const span = Math.max(size.x, size.z);
  if (!(span > 0)) return null;
  if (!topRenderer) {
    topRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    topRenderer.setSize(TOP_PX, TOP_PX, false);
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd9e6ff, 0x4a4436, 1.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.2);
  sun.position.set(0.4, 1, 0.25);
  scene.add(sun);
  scene.add(object);

  const half = span / 2;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, size.y + 20);
  camera.up.set(0, 0, -1);
  camera.position.set(centre.x, centre.y + size.y / 2 + 5, centre.z);
  camera.lookAt(centre.x, centre.y, centre.z);

  topRenderer.setClearAlpha(0);
  topRenderer.render(scene, camera);
  // Copied out immediately: without `preserveDrawingBuffer` the WebGL canvas is
  // cleared after the frame, and the bitmap redraws far more often than models
  // load.
  const canvas = document.createElement('canvas');
  canvas.width = TOP_PX;
  canvas.height = TOP_PX;
  canvas.getContext('2d')!.drawImage(topRenderer.domElement, 0, 0);
  // The model belongs to the caller's cache, not to this throwaway scene.
  scene.remove(object);
  return { canvas, span };
}

const propModels = new Map<string, PropModel | 'loading' | 'missing'>();
const gltf = new GLTFLoader();

/**
 * The props a fixture may name, from the model catalog.
 *
 * `/models/manifest.json` already answers "what sort of model is this" — the
 * same field the model lab shelves by — so the dropdown is derived rather than
 * listed here. Typing a filename was the last place in this page where you
 * could name something that does not exist and only find out when the pane
 * stayed empty.
 *
 * Empty until it loads, and a fixture's current value is always offered even if
 * the catalog has no such file, so a hand-edited or renamed model shows up as
 * wrong rather than being silently rewritten to something else.
 */
const propCatalog: Array<{ id: string; name: string; model: string }> =
  [...ACTIVE_GAME_OBJECTS.values()]
    .map((object) => ({ id: object.id, name: object.name, model: object.model }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** The `.glb` behind an object type, for the footprint render and the 3D pane. */
const modelOf = (type: string | undefined): string | undefined =>
  (type ? ACTIVE_GAME_OBJECTS.get(type)?.model : undefined);

/**
 * The model for a fixture, kicking off a load the first time it is asked for.
 *
 * Returns null while loading or if the file is missing, and calls `refresh()`
 * when one arrives so both panes redraw with it. A missing model is left as a
 * pin and a note rather than an exception: half-authored acres are normal, and
 * a typo in the model field should not take the editor down.
 */
function propModel(model: string | undefined): PropModel | null {
  if (!model) return null;
  const cached = propModels.get(model);
  if (cached === 'missing' || cached === 'loading') return null;
  if (cached) return cached;

  propModels.set(model, 'loading');
  gltf.load(
    `/assets/${model}`,
    (loaded) => {
      const object = loaded.scene;
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const top = topDownCanvas(object, size, centre);
      propModels.set(model, {
        object,
        size,
        centre,
        top: top?.canvas ?? null,
        topSpan: top?.span ?? 0,
      });
      refresh();
    },
    undefined,
    () => {
      propModels.set(model, 'missing');
      refresh();
    },
  );
  return null;
}

/** True once every prop on this piece has resolved, for the pane's note. */
function propsPending(): number {
  return fixturesOf()
    .filter((fixture) => fixture.kind === 'prop'
      && propModels.get(modelOf(fixture.object) ?? '') === 'loading')
    .length;
}

// --- fixtures (props and marks a unique piece owns) -------------------------

/**
 * Acre-local metres to grid pixels.
 *
 * The paint grid is `PIECE_SIZE` cells across and an acre is `ACRE_SIZE` metres
 * across, so a cell is not a metre and the two must not be conflated — a
 * fixture at x=7 is at the acre's east edge, not at column 7.
 */
function fixtureToGrid(position: { x: number; z: number }): { x: number; y: number } {
  return {
    x: ((position.x / ACRE_SIZE) + 0.5) * dom.grid.width,
    y: ((position.z / ACRE_SIZE) + 0.5) * dom.grid.height,
  };
}

function gridToFixture(event: PointerEvent): { x: number; z: number } {
  const rect = dom.grid.getBoundingClientRect();
  const clamp = (value: number): number =>
    Math.max(-ACRE_SIZE / 2, Math.min(ACRE_SIZE / 2, value));
  return {
    // Rounded to a centimetre: a drag is a placement, not a measurement, and
    // fifteen decimal places in a `.acre` diff hides the edit that mattered.
    x: Math.round(clamp((((event.clientX - rect.left) / rect.width) - 0.5) * ACRE_SIZE) * 100) / 100,
    z: Math.round(clamp((((event.clientY - rect.top) / rect.height) - 0.5) * ACRE_SIZE) * 100) / 100,
  };
}

const fixturesOf = (): readonly AcreFixture[] => state.piece?.fixtures ?? [];

function setFixtures(next: AcreFixture[]): void {
  const piece = state.piece;
  if (!piece) return;
  state.piece = next.length > 0
    ? { ...piece, fixtures: next }
    : (() => { const copy = { ...piece }; delete (copy as { fixtures?: unknown }).fixtures; return copy; })();
  markDirty();
  refresh();
}

function editFixture(id: string, edit: (fixture: AcreFixture) => AcreFixture): void {
  setFixtures(fixturesOf().map((fixture) => (fixture.id === id ? edit(fixture) : fixture)));
}

/** A name no sibling is using, so a fresh fixture is always legal. */
function freshFixtureId(kind: 'prop' | 'mark'): string {
  const taken = new Set(fixturesOf().map((fixture) => fixture.id));
  for (let n = 1; ; n++) {
    const id = kind === 'prop' ? `prop-${n}` : `mark-${n}`;
    if (!taken.has(id)) return id;
  }
}

function addFixture(kind: 'prop' | 'mark'): void {
  const piece = state.piece;
  if (!piece) return;
  if (!piece.unique) {
    setStatus('only a unique piece may carry fixtures — tick "unique" first', 'bad');
    return;
  }
  const id = freshFixtureId(kind);
  const fresh: AcreFixture = {
    kind,
    id,
    // A fresh prop names a real type rather than nothing: the format requires
    // one, so an empty prop could be placed and then refuse to save.
    ...(kind === 'prop' ? { object: propCatalog[0]?.id ?? 'bench' } : {}),
    position: { x: 0, y: 0, z: 0 },
    turn: 0,
    ground: kind === 'prop' ? 'conform' : 'conform',
  };
  state.fixture = id;
  setFixtures([...fixturesOf(), fresh]);
  setStatus(`added ${kind} "${id}" at the acre centre`, 'good');
}

function deleteFixture(): void {
  const id = state.fixture;
  if (!id) { setStatus('select a fixture first', 'bad'); return; }
  setFixtures(fixturesOf().filter((fixture) => fixture.id !== id));
  state.fixture = null;
  setStatus(`removed "${id}"`, '');
}

dom.fixtureAddProp.addEventListener('click', () => addFixture('prop'));
dom.fixtureAddMark.addEventListener('click', () => addFixture('mark'));
dom.fixtureDelete.addEventListener('click', deleteFixture);

/**
 * The model picker: a dropdown of the catalog's props, or a text box without one.
 *
 * The current value is offered even when the catalog does not have it, marked
 * as unknown — the same bargain the scene editor's `choice` strikes. A dangling
 * reference should be visible and editable, never quietly replaced by whichever
 * model happened to sort first.
 */
function modelControl(fixture: AcreFixture): HTMLElement {
  const current = fixture.object ?? '';
  const select = document.createElement('select');
  // The current value is offered even when the pack does not define it, marked
  // unknown — the same bargain the scene editor's `choice` strikes. A dangling
  // type should be visible and editable, never quietly replaced by whichever
  // object happened to sort first.
  if (!propCatalog.some((entry) => entry.id === current)) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = current === '' ? '— choose an object —' : `${current} (unknown)`;
    option.selected = true;
    select.append(option);
  }
  for (const entry of propCatalog) {
    const option = document.createElement('option');
    option.value = entry.id;
    // The name reads, the id is what the `.acre` stores; showing both keeps the
    // file's contents guessable from the picker.
    option.textContent = entry.name === entry.id ? entry.id : `${entry.name} · ${entry.id}`;
    option.selected = entry.id === current;
    select.append(option);
  }
  select.addEventListener('change', () => {
    editFixture(fixture.id, (f) => ({ ...f, object: select.value }));
  });
  return select;
}

/** A labelled control, matching the header fields above it. */
function fixtureField(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field';
  const name = document.createElement('span');
  name.className = 'label';
  name.textContent = label;
  row.append(name, control);
  return row;
}

function fixtureNumber(
  value: number, step: number, onChange: (value: number) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('change', () => onChange(Number(input.value) || 0));
  return input;
}

function drawFixtures(): void {
  const piece = state.piece;
  dom.fixtureTree.replaceChildren();
  dom.fixtureForm.replaceChildren();
  dom.fixtureAddProp.disabled = !piece?.unique;
  dom.fixtureAddMark.disabled = !piece?.unique;
  dom.fixtureDelete.disabled = state.fixture === null;

  if (!piece) { dom.fixtureHint.textContent = ''; return; }
  if (!piece.unique) {
    // The rule, stated where someone would otherwise wonder why the buttons are
    // dead: a fixture on a piece placed twice is two post offices.
    dom.fixtureHint.textContent = 'only a unique piece may carry fixtures — '
      + 'a piece the map can place twice would build them twice.';
    return;
  }
  dom.fixtureHint.textContent = fixturesOf().length === 0
    ? 'no fixtures — add a prop or a mark, then drag it on the grid.'
    : 'drag a fixture on the paint grid to move it. positions are metres from the acre centre.';

  for (const fixture of fixturesOf()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-current', String(fixture.id === state.fixture));
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = fixture.kind;
    const name = document.createElement('span');
    name.textContent = fixture.id;
    button.append(kind, name);
    button.addEventListener('click', () => {
      state.fixture = fixture.id;
      refresh();
    });
    dom.fixtureTree.append(button);
  }

  const selected = fixturesOf().find((fixture) => fixture.id === state.fixture);
  if (!selected) return;

  const id = document.createElement('input');
  id.value = selected.id;
  id.addEventListener('change', () => {
    const wanted = id.value.trim();
    if (!wanted) { refresh(); return; }
    if (fixturesOf().some((f) => f.id === wanted && f !== selected)) {
      setStatus(`"${wanted}" is already used in this acre`, 'bad');
      refresh();
      return;
    }
    state.fixture = wanted;
    editFixture(selected.id, (fixture) => ({ ...fixture, id: wanted }));
  });
  dom.fixtureForm.append(fixtureField('id', id));

  if (selected.kind === 'prop') {
    dom.fixtureForm.append(fixtureField('object', modelControl(selected)));
  }

  for (const axis of ['x', 'y', 'z'] as const) {
    dom.fixtureForm.append(fixtureField(axis, fixtureNumber(
      selected.position[axis],
      axis === 'y' ? 0.1 : 0.25,
      (value) => editFixture(selected.id, (fixture) => ({
        ...fixture, position: { ...fixture.position, [axis]: value },
      })),
    )));
  }

  dom.fixtureForm.append(fixtureField('turn', fixtureNumber(
    selected.turn, 15,
    (value) => editFixture(selected.id, (fixture) => ({ ...fixture, turn: value })),
  )));

  const ground = document.createElement('select');
  for (const mode of ['conform', 'rigid']) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    option.selected = selected.ground === mode;
    ground.append(option);
  }
  ground.addEventListener('change', () => {
    editFixture(selected.id, (fixture) => ({
      ...fixture, ground: ground.value as 'conform' | 'rigid',
    }));
  });
  dom.fixtureForm.append(fixtureField('ground', ground));

  // What a prop *is* — its collision, its clear radius, whether it can be sat
  // on — belongs to its `.gameobj` type, not to this instance. Shown read-only
  // so an author can see what they placed without being invited to edit it here.
  if (selected.kind === 'prop') {
    const summary = document.createElement('span');
    summary.className = 'label';
    const definition = ACTIVE_GAME_OBJECTS.get(selected.object ?? '');
    summary.textContent = definition
      ? describeComponents(definition)
      : 'unknown object type';
    dom.fixtureForm.append(fixtureField('type', summary));
  }
}

/**
 * Fixture handles over the paint grid.
 *
 * Drawn on the same canvas as the terrain rather than in the 3D pane: the grid
 * is the acre's own frame seen square-on, which is exactly the frame a fixture
 * is authored in, and a drag here needs no camera to un-project through.
 */
function drawFixtureHandles(ctx: CanvasRenderingContext2D): void {
  const perMetre = dom.grid.width / ACRE_SIZE;
  for (const fixture of fixturesOf()) {
    const at = fixtureToGrid(fixture.position);
    const selected = fixture.id === state.fixture;
    const yaw = (fixture.turn * Math.PI) / 180;

    // The prop as it actually looks from above, composited at its own footprint
    // and turned with it. A box says how much room a prop takes and nothing
    // about what it is; two buildings of equal extent read identically as boxes
    // and not at all alike from above, and what this acre looks like is the
    // whole question the pane is being asked.
    const model = fixture.kind === 'prop' ? propModel(modelOf(fixture.object)) : null;
    if (model?.top) {
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(-yaw);
      // Drawn about the model's own centre, which need not be its origin — a
      // building modelled off-origin would otherwise sit half a footprint from
      // where it actually stands.
      const ox = model.centre.x * perMetre;
      const oz = model.centre.z * perMetre;
      const px = model.topSpan * perMetre;
      // Nearest-neighbour, to match the pixelated bitmap it lands on rather
      // than blurring against it.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(model.top, ox - px / 2, oz - px / 2, px, px);
      if (selected) {
        // A selected prop gets an outline, because the silhouette alone does
        // not say which of two overlapping props the inspector is editing.
        ctx.strokeStyle = '#ffc65a';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          ox - (model.size.x * perMetre) / 2, oz - (model.size.z * perMetre) / 2,
          model.size.x * perMetre, model.size.z * perMetre,
        );
      }
      ctx.restore();
    }

    // The scatter radius, which is a footprint of a different kind: it is how
    // much room the prop takes out of the world's planting. Read off the object
    // type, since that is where it lives.
    const clear = componentsOf(ACTIVE_GAME_OBJECTS.get(fixture.object ?? ''), 'clear')[0];
    if (clear) {
      ctx.beginPath();
      ctx.arc(at.x, at.y, clear.radius * perMetre, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,198,90,0.34)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const radius = selected ? 7 : 5;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fixture.kind === 'prop' ? '#ffc65a' : '#8fd0ff';
    ctx.fill();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,0.55)';
    ctx.stroke();
    // A prop's facing, so a turn is visible rather than only typed.
    if (fixture.kind === 'prop') {
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      ctx.lineTo(at.x - Math.sin(yaw) * radius * 2.6, at.y + Math.cos(yaw) * radius * 2.6);
      ctx.stroke();
    }
    // Outlined, because a label now lands on whatever the prop render put
    // under it — pale roof, dark interior, grass — and white-on-anything is
    // only legible with something behind it.
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(fixture.id, at.x, at.y - radius - 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(fixture.id, at.x, at.y - radius - 2);
  }
}

/** The fixture under the pointer, if any — hit-tested in grid pixels. */
function fixtureAtEvent(event: PointerEvent): AcreFixture | null {
  const rect = dom.grid.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * dom.grid.width;
  const y = ((event.clientY - rect.top) / rect.height) * dom.grid.height;
  for (const fixture of [...fixturesOf()].reverse()) {
    const at = fixtureToGrid(fixture.position);
    if (Math.hypot(at.x - x, at.y - y) <= 9) return fixture;
  }
  return null;
}

// --- header fields ---------------------------------------------------------

for (const offset of ['—', ...CROSSING_OFFSETS.map(String), '3', '11']) {
  if ([...dom.hOffset.options].some((o) => o.value === offset)) continue;
  const option = document.createElement('option');
  option.value = offset;
  option.textContent = offset;
  dom.hOffset.append(option);
}

function readHeader(): void {
  const piece = state.piece;
  if (!piece) return;
  const offset = dom.hOffset.value === '—' ? undefined : Number(dom.hOffset.value);
  const id = dom.hId.value.trim() || piece.id;
  if (id !== piece.id) {
    clearOverride(piece.id);
    state.dirty.delete(piece.id);
    if (state.fresh.delete(piece.id)) state.fresh.add(id);
  }
  state.piece = {
    ...piece,
    id,
    weight: Number(dom.hWeight.value) || 1,
    tags: dom.hTags.value.split(/[,\s]+/).filter((s) => s.length > 0),
    rotatable: dom.hRotatable.checked,
    ...(dom.hUnique.checked ? { unique: true } : {}),
    ...(offset === undefined ? {} : { offset }),
  };
  if (offset === undefined) delete (state.piece as { offset?: number }).offset;
  if (!dom.hUnique.checked) {
    delete (state.piece as { unique?: boolean }).unique;
    // Fixtures cannot outlive uniqueness: the format refuses to parse them back,
    // so a piece that drops the flag would fail to reload after it saved.
    if (piece.fixtures?.length) {
      delete (state.piece as { fixtures?: unknown }).fixtures;
      state.fixture = null;
      setStatus(`"${piece.id}" is no longer unique — its fixtures were removed`, 'bad');
    }
  }
  markDirty();
  refresh();
}

for (const input of [dom.hId, dom.hWeight, dom.hTags, dom.hOffset, dom.hRotatable, dom.hUnique]) {
  input.addEventListener('change', readHeader);
}

function currentGroup(): string {
  const id = state.piece?.id;
  const savedId = state.saved?.id;
  return state.listing.find((entry) => entry.id === id)?.group
    ?? state.listing.find((entry) => entry.id === savedId)?.group
    ?? 'unsorted';
}

function writeGroup(): void {
  const selected = currentGroup();
  const groups = [...new Set([...state.groups, selected])].sort();
  dom.hGroup.replaceChildren(...groups.map((group) => {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = group;
    return option;
  }));
  dom.hGroup.value = selected;
}

dom.hGroup.addEventListener('change', () => {
  const piece = state.piece;
  if (!piece) return;
  const group = dom.hGroup.value;
  if (state.fresh.has(piece.id)) {
    const entry = state.listing.find((candidate) => candidate.id === piece.id);
    if (entry) entry.group = group;
    drawCatalog();
    setStatus(`${piece.id} will be filed under ${group} when saved`, '');
    return;
  }
  void refile(piece.id, group);
});

function writeHeader(): void {
  const piece = state.piece;
  if (!piece) return;
  dom.hId.value = piece.id;
  writeGroup();
  dom.hWeight.value = String(piece.weight);
  dom.hTags.value = piece.tags.join(' ');
  dom.hOffset.value = piece.offset === undefined ? '—' : String(piece.offset);
  dom.hRotatable.checked = piece.rotatable;
  dom.hUnique.checked = piece.unique === true;
}

// --- catalog ---------------------------------------------------------------

/**
 * The palette, grouped by the folder each acre is filed under.
 *
 * **Folders are organization and carry no meaning.** They used to be
 * `family` — a `PieceKind` that also decided which acre was the dock and which
 * ground could hold a building — so re-filing the palette changed what the game
 * did with the acre. A folder is just where an author put it, and dragging one
 * group to another moves the file on disk and nothing else.
 */
function drawCatalog(): void {
  const filter = dom.filter.value.trim().toLowerCase();
  const shown = state.listing.filter((entry) => entry.id.toLowerCase().includes(filter)
    || entry.group.toLowerCase().includes(filter));
  const groups = [...new Set([...shown.map((e) => e.group), ...state.groups])].sort();
  dom.list.replaceChildren();

  for (const group of groups) {
    const box = document.createElement('div');
    box.className = 'catalog-group';
    const heading = document.createElement('h2');
    heading.textContent = group;
    // The heading is the drop target: dropping an acre on it files it there.
    heading.addEventListener('dragover', (event) => {
      event.preventDefault();
      heading.classList.add('drop');
    });
    heading.addEventListener('dragleave', () => heading.classList.remove('drop'));
    heading.addEventListener('drop', (event) => {
      event.preventDefault();
      heading.classList.remove('drop');
      const id = event.dataTransfer?.getData('text/plain');
      if (id) void refile(id, group);
    });
    box.append(heading);

    for (const entry of shown.filter((e) => e.group === group)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.draggable = true;
      button.textContent = entry.id;
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', entry.id);
      });
      if (state.piece?.id === entry.id) button.setAttribute('aria-current', 'true');
      if (state.dirty.has(entry.id)) {
        const dot = document.createElement('span');
        dot.className = 'dirty';
        dot.textContent = state.fresh.has(entry.id) ? 'new' : 'edited';
        button.append(dot);
      }
      button.addEventListener('click', () => { void select(entry.id); });
      box.append(button);
    }
    dom.list.append(box);
  }
  dom.count.textContent = `${shown.length} of ${state.listing.length} acres · ${groups.length} groups`;
}

/**
 * Move an acre into a folder.
 *
 * A `PUT` with a group and no text: the server rewrites the file at the new
 * path and unlinks the old one, in that order, so a failed move leaves the acre
 * where it was rather than nowhere.
 */
async function refile(id: string, group: string): Promise<void> {
  const response = await fetch(`${API}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group }),
  });
  if (!response.ok) {
    setStatus(`could not file ${id} under ${group}`, 'bad');
    writeGroup();
    return;
  }
  await loadListing();
  writeGroup();
  setStatus(`${id} filed under ${group}`, 'good');
}

dom.filter.addEventListener('input', drawCatalog);

async function loadListing(): Promise<void> {
  const response = await fetch(API);
  state.listing = (await response.json()) as Listing[];
  for (const entry of state.listing) state.groups.add(entry.group);
  drawCatalog();
}

async function select(id: string): Promise<void> {
  if (state.fresh.has(id) || state.dirty.has(id)) {
    // An unsaved piece lives only in the override map; re-read it from there.
    const held = allPlacements().find((p) => p.id === id);
    if (held) {
      state.piece = held;
      state.saved = state.saved?.id === id ? state.saved : null;
      afterSelect();
      return;
    }
  }
  const response = await fetch(`${API}/${encodeURIComponent(id)}`);
  if (!response.ok) { setStatus(`could not load ${id}`, 'bad'); return; }
  const body = (await response.json()) as { text: string };
  state.piece = parseAcre(body.text, `${id}.acre`);
  state.saved = state.piece;
  afterSelect();
}

function afterSelect(): void {
  state.undo.length = 0;
  state.redo.length = 0;
  publish();
  writeHeader();
  refresh();
  setStatus(`${state.piece!.id} loaded`, '');
}

// --- dirty / save / revert -------------------------------------------------

function markDirty(): void {
  if (!state.piece) return;
  const same = state.saved !== null
    && formatAcre(state.saved) === formatAcre(state.piece)
    && state.saved.id === state.piece.id;
  if (same) state.dirty.delete(state.piece.id);
  else state.dirty.add(state.piece.id);
}

dom.save.addEventListener('click', () => { void save(); });

async function save(): Promise<void> {
  const piece = state.piece;
  if (!piece) return;
  const problems = pieceWellFormed(piece);
  if (problems.length > 0) { setStatus(`refusing to save: ${problems[0]}`, 'bad'); return; }
  const response = await fetch(`${API}/${encodeURIComponent(piece.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: formatAcre(piece), group: currentGroup() }),
  });
  const body = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || body.error) { setStatus(body.error ?? 'save failed', 'bad'); return; }
  state.piece = parseAcre(body.text!, `${piece.id}.acre`);
  state.saved = state.piece;
  state.dirty.delete(piece.id);
  state.fresh.delete(piece.id);
  publish();
  await loadListing();
  refresh();
  const group = currentGroup();
  const path = group === 'unsorted' ? `${piece.id}.acre` : `${group}/${piece.id}.acre`;
  setStatus(`${piece.id} written to pieces/${path}`, 'good');
}

dom.revert.addEventListener('click', () => {
  if (!state.saved) return;
  pushUndo();
  state.piece = state.saved;
  state.dirty.delete(state.saved.id);
  writeHeader();
  refresh();
  setStatus(`${state.saved.id} reverted to disk`, '');
});

dom.del.addEventListener('click', () => {
  const piece = state.piece;
  if (!piece) return;
  if (!window.confirm(`Delete pieces/${piece.id}.acre? The generator loses this shape.`)) return;
  void (async () => {
    if (!state.fresh.has(piece.id)) {
      const response = await fetch(`${API}/${encodeURIComponent(piece.id)}`, { method: 'DELETE' });
      if (!response.ok) { setStatus(`could not delete ${piece.id}`, 'bad'); return; }
    }
    clearOverride(piece.id);
    state.dirty.delete(piece.id);
    state.fresh.delete(piece.id);
    state.piece = null;
    state.saved = null;
    await loadListing();
    refresh();
    setStatus(`${piece.id} deleted`, '');
  })();
});

dom.rotate.addEventListener('click', () => {
  if (!state.piece) return;
  pushUndo();
  // The id is the piece's own, not the rotation's: this turns the *authored*
  // bitmap, which is a different act from the free rotations `placements` adds.
  state.piece = { ...rotatePiece(state.piece, 1), id: state.piece.id };
  markDirty();
  refresh();
});

dom.undo.addEventListener('click', () => {
  const cells = state.undo.pop();
  if (!cells || !state.piece) return;
  state.redo.push(state.piece.cells);
  state.piece = { ...state.piece, cells };
  markDirty();
  refresh();
});

dom.redo.addEventListener('click', () => {
  const cells = state.redo.pop();
  if (!cells || !state.piece) return;
  state.undo.push(state.piece.cells);
  state.piece = { ...state.piece, cells };
  markDirty();
  refresh();
});

window.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key === 'z' && !event.shiftKey) { event.preventDefault(); dom.undo.click(); }
  else if (event.key === 'z' || event.key === 'y') { event.preventDefault(); dom.redo.click(); }
  else if (event.key === 's') { event.preventDefault(); dom.save.click(); }
});

document.getElementById('new-group')!.addEventListener('click', () => {
  const name = window.prompt('Folder name (letters, digits and dashes):', '')?.trim();
  if (!name) return;
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(name)) { setStatus(`"${name}" is not a legal folder`, 'bad'); return; }
  // An empty folder exists only in the editor until something is dropped into
  // it — there is no directory on disk to create, and creating one would leave
  // an empty folder behind if the author changed their mind.
  state.groups.add(name);
  drawCatalog();
  writeGroup();
  setStatus(`${name} added — drag an acre onto it to file it there`, '');
});

dom.newPiece.addEventListener('click', () => {
  let n = 1;
  while (state.listing.some((e) => e.id === `new-acre-${n}`) || state.fresh.has(`new-acre-${n}`)) n++;
  const id = `new-acre-${n}`;
  state.piece = {
    id,
    family: 'inland' as PieceKind,
    cells: Array.from({ length: PIECE_SIZE * PIECE_SIZE }, () => ({ terrain: 'grass' as CellTerrain, tier: 1 as Tier })),
    rotatable: true,
    weight: 1,
    tags: [],
  };
  state.saved = null;
  state.fresh.add(id);
  state.dirty.add(id);
  state.listing = [...state.listing, {
    id, file: `${id}.acre`, group: 'unsorted', family: 'inland', weight: 1,
    tags: [], rotatable: true, offset: null, bytes: 0,
  }];
  state.undo.length = 0;
  state.redo.length = 0;
  publish();
  writeHeader();
  drawCatalog();
  refresh();
  setStatus(`${id} — unsaved, live in the library`, '');
});

// --- toolbar ---------------------------------------------------------------

function toggle(button: HTMLElement, on: boolean): void {
  button.setAttribute('aria-pressed', String(on));
}

const LAYERS = ['terrain', 'tier', 'depth'] as const;
for (const layer of LAYERS) {
  document.getElementById(`layer-${layer}`)!.addEventListener('click', () => setLayer(layer));
}

function setLayer(layer: (typeof LAYERS)[number]): void {
  state.layer = layer;
  for (const other of LAYERS) {
    toggle(document.getElementById(`layer-${other}`)!, other === layer);
  }
  drawSwatches();
  drawGrid();
}

for (const tool of ['brush', 'fill', 'rect'] as const) {
  document.getElementById(`tool-${tool}`)!.addEventListener('click', () => {
    state.tool = tool;
    for (const other of ['brush', 'fill', 'rect'] as const) {
      toggle(document.getElementById(`tool-${other}`)!, other === tool);
    }
  });
}

function drawSwatches(): void {
  dom.swatches.replaceChildren();
  if (state.layer === 'terrain') {
    for (const terrain of CELL_TERRAINS) {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.type = 'button';
      button.style.background = TERRAIN_COLOURS[terrain];
      button.title = terrain;
      button.setAttribute('aria-pressed', String(state.terrain === terrain));
      const label = document.createElement('span');
      label.textContent = TERRAIN_CHARS[terrain];
      button.append(label);
      button.addEventListener('click', () => { state.terrain = terrain; drawSwatches(); });
      dom.swatches.append(button);
    }
    return;
  }
  if (state.layer === 'depth') {
    // Ten swatches, shallow to deep, shaded so the ramp is readable as a ramp.
    // 9 is the default: a cell nobody has touched is at the runtime's own shelf
    // profile, and painting 9 back onto a cell removes the author's opinion.
    for (let depth = 0; depth <= DEPTH_MAX; depth++) {
      const k = depth / DEPTH_MAX;
      const button = document.createElement('button');
      button.className = 'swatch';
      button.type = 'button';
      button.style.background =
        `rgb(${Math.round(196 - k * 128)},${Math.round(224 - k * 128)},${Math.round(232 - k * 108)})`;
      button.title = depth === DEPTH_DEFAULT ? `depth ${depth} (default)` : `depth ${depth}`;
      button.setAttribute('aria-pressed', String(state.depth === depth));
      const label = document.createElement('span');
      label.textContent = String(depth);
      button.append(label);
      button.addEventListener('click', () => { state.depth = depth; drawSwatches(); });
      dom.swatches.append(button);
    }
    return;
  }
  for (const tier of [0, 1, 2] as Tier[]) {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.type = 'button';
    button.style.background = ['#2f2f2f', '#6f6a5c', '#c9c2ae'][tier];
    button.title = `tier ${tier}`;
    button.setAttribute('aria-pressed', String(state.tier === tier));
    const label = document.createElement('span');
    label.textContent = String(tier);
    button.append(label);
    button.addEventListener('click', () => { state.tier = tier; drawSwatches(); });
    dom.swatches.append(button);
  }
}

// --- the refresh ------------------------------------------------------------

/**
 * One pass over every pane, in dependency order.
 *
 * The tiling runs before the 3D because the preview island is built from its
 * nine acres, and both run after `publish()` so they read the edited bitmap
 * rather than the one on disk.
 */
function refresh(): void {
  publish();
  drawGrid();
  drawReadouts();
  tilingPass();
  drawPreview();
  drawFixtures();
  drawCatalog();
  dom.undo.disabled = state.undo.length === 0;
  dom.redo.disabled = state.redo.length === 0;
  const dirty = state.piece !== null && state.dirty.has(state.piece.id);
  dom.save.disabled = !dirty;
  dom.revert.disabled = !dirty || state.saved === null;
  dom.del.disabled = state.piece === null;
}

drawSwatches();
void (async () => {
  await loadListing();
  const first = state.listing[0];
  if (first) await select(first.id);
  setStatus(`${state.listing.length} pieces on disk · edits are live and unsaved until you press save`, '');
})();
