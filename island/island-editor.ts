/**
 * The island editor — `/island`.
 *
 * `/acre` manages the vocabulary; this places it. A map is a 16x12 grid of
 * authored acres and nothing else, so this page is a tile stamper: pick an acre
 * from the palette, stamp it, and the island is whatever you drew.
 *
 * It replaces six solver passes. That is worth stating plainly because it
 * changes what "wrong" means. The placer used to guarantee that neighbouring
 * acres tiled — it could only ever choose a piece whose edges fit — so a
 * mismatched seam was impossible by construction. Authoring by hand makes it
 * possible again, and this page's one non-obvious job is to make it *visible*:
 * a seam whose facing edges disagree is drawn in red on the map, over the acres
 * that disagree, in the same frame as the stamp that caused it.
 *
 * Everything else is the same discipline as `/acre`. Nothing is validated twice
 * — seams come from `templateProblems`, the surface from `templateToIsland` and
 * the game's own mesh builders — and edits are live in memory until saved,
 * which for a map means the 3D pane is showing the island you are drawing
 * rather than the one on disk.
 */
import * as THREE from 'three';
import {
  PIECE_SIZE, cellAt, placements,
  type AcrePiece, type CellTerrain,
} from '../src/world/island/AcrePiece';
import { GRID_COLS, GRID_ROWS, ACRE_SIZE } from '../src/world/island/AcreLibrary';
import {
  authoredPieces, libraryFingerprint, pieceGroup, placementsById,
} from '../src/world/island/PieceLibrary';
import {
  TEMPLATE_CELLS, blankTemplate, formatIsland, parseIsland, templateProblems, templateToIsland,
  type IslandTemplate,
} from '../src/world/island/IslandTemplate';
import { SEA_LEVEL, sampleIsland } from '../src/world/island/IslandRuntime';
import { buildCliffWallGeometry, buildGroundGeometry } from '../src/world/terrain';

const API = '/island/templates';

/** Map colours. Same key as `/acre`, so the two pages read as one tool. */
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

interface Listing { id: string; file: string; name: string; acres: number; bytes: number }

const dom = {
  mapList: document.getElementById('map-list')!,
  paletteList: document.getElementById('palette-list')!,
  paletteCount: document.getElementById('palette-count')!,
  paletteSelection: document.getElementById('palette-selection')!,
  filter: document.getElementById('filter') as HTMLInputElement,
  newMap: document.getElementById('new-map') as HTMLButtonElement,
  map: document.getElementById('map') as HTMLCanvasElement,
  cursor: document.getElementById('cursor-read')!,
  brush: document.getElementById('brush') as HTMLCanvasElement,
  brushId: document.getElementById('brush-id')!,
  rot: document.getElementById('rot') as HTMLButtonElement,
  undo: document.getElementById('undo') as HTMLButtonElement,
  redo: document.getElementById('redo') as HTMLButtonElement,
  save: document.getElementById('save') as HTMLButtonElement,
  del: document.getElementById('delete') as HTMLButtonElement,
  gridToggle: document.getElementById('grid-toggle') as HTMLButtonElement,
  stage: document.getElementById('stage')!,
  stageNote: document.getElementById('stage-note')!,
  status: document.getElementById('status')!,
  detailsSummary: document.getElementById('details-summary')!,
  hId: document.getElementById('h-id') as HTMLInputElement,
  hName: document.getElementById('h-name') as HTMLInputElement,
  derived: document.getElementById('derived')!,
  problems: document.getElementById('problems')!,
};

const state = {
  listing: [] as Listing[],
  template: null as IslandTemplate | null,
  saved: null as string | null,
  fresh: new Set<string>(),
  tool: 'stamp' as 'stamp' | 'erase' | 'pick',
  /** The authored piece on the brush, and how many quarter-turns to stamp it with. */
  brush: null as AcrePiece | null,
  rotation: 0,
  grid: true,
  undo: [] as (readonly (string | null)[])[],
  redo: [] as (readonly (string | null)[])[],
};

const ACRE_PX = dom.map.width / GRID_COLS;

function setStatus(text: string, tone: '' | 'good' | 'bad' = ''): void {
  dom.status.textContent = text;
  dom.status.className = `banner${tone ? ` ${tone}` : ''}`;
}

/** The placement id the brush currently stamps, or null with nothing selected. */
function brushId(): string | null {
  if (!state.brush) return null;
  const turns = placements(state.brush);
  // `placements` dedups: a symmetric acre has one placement and rotating it is
  // a no-op rather than an error, so the rotation wraps into what exists.
  return turns[state.rotation % turns.length].id;
}

// --- drawing ---------------------------------------------------------------

function drawPieceInto(
  ctx: CanvasRenderingContext2D,
  piece: AcrePiece,
  x: number,
  y: number,
  size: number,
): void {
  const px = size / PIECE_SIZE;
  for (let row = 0; row < PIECE_SIZE; row++) {
    for (let col = 0; col < PIECE_SIZE; col++) {
      const cell = cellAt(piece, col, row);
      ctx.fillStyle = TERRAIN_COLOURS[cell.terrain];
      ctx.fillRect(x + col * px, y + row * px, px + 0.5, px + 0.5);
      const tint = TIER_TINTS[cell.tier];
      if (tint !== 'rgba(0,0,0,0)') {
        ctx.fillStyle = tint;
        ctx.fillRect(x + col * px, y + row * px, px + 0.5, px + 0.5);
      }
    }
  }
}

function drawMap(): void {
  const ctx = dom.map.getContext('2d')!;
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, dom.map.width, dom.map.height);
  const template = state.template;
  if (!template) return;
  const byId = placementsById();

  for (let i = 0; i < TEMPLATE_CELLS; i++) {
    const id = template.cells[i];
    if (id === null) continue;
    const piece = byId.get(id);
    const x = (i % GRID_COLS) * ACRE_PX;
    const y = Math.floor(i / GRID_COLS) * ACRE_PX;
    if (!piece) {
      // A named acre the library no longer has. Not silently ocean: a hole in
      // the map has to look like a hole.
      ctx.fillStyle = '#5a1f16';
      ctx.fillRect(x, y, ACRE_PX, ACRE_PX);
      continue;
    }
    drawPieceInto(ctx, piece, x, y, ACRE_PX);
  }

  if (state.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    for (let c = 1; c < GRID_COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * ACRE_PX, 0); ctx.lineTo(c * ACRE_PX, dom.map.height); ctx.stroke();
    }
    for (let r = 1; r < GRID_ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * ACRE_PX); ctx.lineTo(dom.map.width, r * ACRE_PX); ctx.stroke();
    }
  }

  // Seams last, over everything: this is the thing the page exists to show.
  const { seams } = templateProblems(template);
  ctx.strokeStyle = '#e0503c';
  ctx.lineWidth = 4;
  for (const seam of seams) {
    const x = seam.col * ACRE_PX;
    const y = seam.row * ACRE_PX;
    ctx.beginPath();
    if (seam.dir === 1) { ctx.moveTo(x + ACRE_PX, y); ctx.lineTo(x + ACRE_PX, y + ACRE_PX); }
    else { ctx.moveTo(x, y + ACRE_PX); ctx.lineTo(x + ACRE_PX, y + ACRE_PX); }
    ctx.stroke();
  }
}

function drawBrush(): void {
  const ctx = dom.brush.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);
  const id = brushId();
  dom.brushId.textContent = id ?? '—';
  if (!state.brush) return;
  const piece = placementsById().get(id!) ?? state.brush;
  drawPieceInto(ctx, piece, 0, 0, 32);
}

// --- editing ---------------------------------------------------------------

function pushUndo(): void {
  if (!state.template) return;
  state.undo.push(state.template.cells);
  if (state.undo.length > 200) state.undo.shift();
  state.redo.length = 0;
}

function acreAtEvent(event: PointerEvent): number | null {
  const rect = dom.map.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_COLS);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_ROWS);
  if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
  return row * GRID_COLS + col;
}

function apply(index: number): void {
  const template = state.template;
  if (!template) return;
  if (state.tool === 'pick') {
    const id = template.cells[index];
    if (id === null) return;
    // The palette holds authored pieces; a placement id carries its rotation.
    const [base, turn] = id.split('@');
    state.brush = authoredPieces().find((p) => p.id === base) ?? null;
    state.rotation = turn ? Number(turn) : 0;
    drawBrush();
    drawPalette();
    return;
  }
  const next = state.tool === 'erase' ? null : brushId();
  if (next === undefined) return;
  if (template.cells[index] === next) return;
  const cells = [...template.cells];
  cells[index] = next;
  state.template = { ...template, cells };
  refresh();
}

let painting = false;
dom.map.addEventListener('pointerdown', (event) => {
  const index = acreAtEvent(event);
  if (index === null || !state.template) return;
  dom.map.setPointerCapture(event.pointerId);
  if (state.tool !== 'pick') pushUndo();
  painting = true;
  apply(index);
});
dom.map.addEventListener('pointermove', (event) => {
  const index = acreAtEvent(event);
  if (index !== null && state.template) {
    const id = state.template.cells[index];
    dom.cursor.textContent = `${index % GRID_COLS},${Math.floor(index / GRID_COLS)} · ${id ?? 'open water'}`;
  }
  if (painting && index !== null && state.tool !== 'pick') apply(index);
});
dom.map.addEventListener('pointerup', () => { painting = false; });

// --- 3D --------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
dom.stage.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#20242c');
scene.add(new THREE.HemisphereLight(0xd9e6ff, 0x4a4436, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
sun.position.set(-12, 20, 8);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 900);
const group = new THREE.Group();
scene.add(group);
const orbit = { azimuth: 0, distance: 210 };

const GROUND_MAT = new THREE.MeshLambertMaterial({ color: 0x4c6b3a, flatShading: true });
const WALL_MAT = new THREE.MeshLambertMaterial({ color: 0x8b8378, flatShading: true });
const WATER_MAT = new THREE.MeshLambertMaterial({
  color: 0x3f6f86, transparent: true, opacity: 0.72, flatShading: true,
});

function place(): void {
  const pitch = THREE.MathUtils.degToRad(40);
  const az = THREE.MathUtils.degToRad(orbit.azimuth);
  camera.position.set(
    Math.sin(az) * Math.cos(pitch) * orbit.distance,
    Math.sin(pitch) * orbit.distance,
    Math.cos(az) * Math.cos(pitch) * orbit.distance,
  );
  camera.lookAt(0, 0, 0);
}

let dragging = false;
let lastX = 0;
dom.stage.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbit.azimuth += (e.clientX - lastX) * 0.4;
  lastX = e.clientX;
  place();
});
dom.stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  orbit.distance = Math.max(40, Math.min(600, orbit.distance * (1 + Math.sign(e.deltaY) * 0.12)));
  place();
}, { passive: false });

/**
 * Rebuild the island from the map, through the game's own path.
 *
 * `templateToIsland` then `sampleIsland` then the real mesh builders — the same
 * chain the game runs at boot. Rebuilding the whole island on every stamp is
 * affordable (a few milliseconds for 192 acres) and it is what makes the pane
 * trustworthy: there is no incremental update that could drift from the file.
 */
function drawIsland(): void {
  const template = state.template;
  if (!template) return;
  const island = templateToIsland(template);
  group.clear();
  const shell = new THREE.Group();
  shell.add(
    new THREE.Mesh(
      buildGroundGeometry(island, (x, z) => sampleIsland(island, x, z).height),
      GROUND_MAT,
    ),
    new THREE.Mesh(buildCliffWallGeometry(island), WALL_MAT),
  );
  const water = new THREE.Mesh(new THREE.PlaneGeometry(ACRE_SIZE * 40, ACRE_SIZE * 40), WATER_MAT);
  water.position.z = SEA_LEVEL;
  shell.add(water);
  shell.rotation.x = -Math.PI / 2;
  group.add(shell);
  dom.stageNote.textContent = `${island.acres.length} acres · drag to turn · scroll to zoom`;
}

function frame(): void {
  const w = dom.stage.clientWidth;
  const h = dom.stage.clientHeight;
  if (w > 0 && h > 0) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
place();
requestAnimationFrame(frame);

// --- palette ---------------------------------------------------------------

function drawPalette(): void {
  const filter = dom.filter.value.trim().toLowerCase();
  // Grouped by the folder each acre is filed under in `/acre`, which is
  // organization only — the same list an author arranged, in the same order.
  const shown = authoredPieces().filter((piece) => piece.id.toLowerCase().includes(filter)
    || pieceGroup(piece.id).toLowerCase().includes(filter));
  const groups = [...new Set(shown.map((p) => pieceGroup(p.id)))].sort();
  dom.paletteList.replaceChildren();
  dom.paletteCount.textContent = `${shown.length} / ${authoredPieces().length}`;
  dom.paletteSelection.textContent = state.brush ? `Brush: ${state.brush.id}` : 'No brush selected';
  for (const group of groups) {
    const section = document.createElement('details');
    section.className = 'palette-group';
    section.open = filter.length > 0 || shown.some((piece) => pieceGroup(piece.id) === group && state.brush?.id === piece.id);
    const heading = document.createElement('summary');
    const inGroup = shown.filter((piece) => pieceGroup(piece.id) === group);
    heading.textContent = `${group} · ${inGroup.length}`;
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    section.append(heading, grid);
    for (const piece of inGroup) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-card';
      button.title = piece.id;
      const swatch = document.createElement('canvas');
      swatch.width = 52;
      swatch.height = 52;
      drawPieceInto(swatch.getContext('2d')!, piece, 0, 0, 52);
      const label = document.createElement('span');
      label.textContent = piece.id;
      button.append(swatch, label);
      if (state.brush?.id === piece.id) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => {
        state.brush = piece;
        state.tool = 'stamp';
        setTool('stamp');
        drawBrush();
        drawPalette();
      });
      grid.append(button);
    }
    dom.paletteList.append(section);
  }
}

dom.filter.addEventListener('input', drawPalette);

// --- catalog ---------------------------------------------------------------

function drawCatalog(): void {
  dom.mapList.replaceChildren();
  for (const entry of state.listing) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.id;
    if (state.template?.id === entry.id) button.setAttribute('aria-current', 'true');
    if (state.fresh.has(entry.id) || (state.template?.id === entry.id && isDirty())) {
      const dot = document.createElement('span');
      dot.className = 'dirty';
      dot.textContent = state.fresh.has(entry.id) ? 'new' : 'edited';
      button.append(dot);
    }
    button.addEventListener('click', () => { void open(entry.id); });
    dom.mapList.append(button);
  }
}

function isDirty(): boolean {
  return state.template !== null && formatIsland(state.template) !== state.saved;
}

async function loadListing(): Promise<void> {
  state.listing = (await (await fetch(API)).json()) as Listing[];
  drawCatalog();
}

async function open(id: string): Promise<void> {
  const response = await fetch(`${API}/${encodeURIComponent(id)}`);
  if (!response.ok) { setStatus(`could not load ${id}`, 'bad'); return; }
  const body = (await response.json()) as { text: string };
  state.template = parseIsland(body.text, `${id}.island`);
  state.saved = body.text;
  state.fresh.delete(id);
  state.undo.length = 0;
  state.redo.length = 0;
  dom.hId.value = state.template.id;
  dom.hName.value = state.template.name;
  refresh();
  setStatus(`${id} loaded`, '');
}

// --- toolbar ---------------------------------------------------------------

function setTool(tool: 'stamp' | 'erase' | 'pick'): void {
  state.tool = tool;
  for (const other of ['stamp', 'erase', 'pick'] as const) {
    document.getElementById(`tool-${other}`)!.setAttribute('aria-pressed', String(other === tool));
  }
}
for (const tool of ['stamp', 'erase', 'pick'] as const) {
  document.getElementById(`tool-${tool}`)!.addEventListener('click', () => setTool(tool));
}

dom.rot.addEventListener('click', () => {
  state.rotation = (state.rotation + 1) % 4;
  dom.rot.textContent = `${state.rotation * 90}°`;
  drawBrush();
});

dom.gridToggle.addEventListener('click', () => {
  state.grid = !state.grid;
  dom.gridToggle.setAttribute('aria-pressed', String(state.grid));
  drawMap();
});

dom.undo.addEventListener('click', () => {
  const cells = state.undo.pop();
  if (!cells || !state.template) return;
  state.redo.push(state.template.cells);
  state.template = { ...state.template, cells };
  refresh();
});
dom.redo.addEventListener('click', () => {
  const cells = state.redo.pop();
  if (!cells || !state.template) return;
  state.undo.push(state.template.cells);
  state.template = { ...state.template, cells };
  refresh();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'r' && !event.metaKey && !event.ctrlKey
    && !(event.target instanceof HTMLInputElement)) { dom.rot.click(); return; }
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key === 'z' && !event.shiftKey) { event.preventDefault(); dom.undo.click(); }
  else if (event.key === 'z' || event.key === 'y') { event.preventDefault(); dom.redo.click(); }
  else if (event.key === 's') { event.preventDefault(); dom.save.click(); }
});

for (const input of [dom.hId, dom.hName]) {
  input.addEventListener('change', () => {
    if (!state.template) return;
    state.template = {
      ...state.template,
      id: dom.hId.value.trim() || state.template.id,
      name: dom.hName.value.trim() || state.template.name,
    };
    refresh();
  });
}

dom.newMap.addEventListener('click', () => {
  let n = 1;
  while (state.listing.some((e) => e.id === `map-${n}`)) n++;
  const id = `map-${n}`;
  state.template = blankTemplate(id, `Map ${n}`);
  state.saved = null;
  state.fresh.add(id);
  state.listing = [...state.listing, { id, file: `${id}.island`, name: `Map ${n}`, acres: 0, bytes: 0 }];
  state.undo.length = 0;
  state.redo.length = 0;
  dom.hId.value = id;
  dom.hName.value = `Map ${n}`;
  refresh();
  setStatus(`${id} — blank, unsaved`, '');
});

dom.save.addEventListener('click', () => { void save(); });

async function save(): Promise<void> {
  const template = state.template;
  if (!template) return;
  // The fingerprint is stamped at save, so a map records the library it was
  // last known good against rather than the one it was created against.
  const text = formatIsland({ ...template, library: libraryFingerprint() });
  const response = await fetch(`${API}/${encodeURIComponent(template.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok || body.error) { setStatus(body.error ?? 'save failed', 'bad'); return; }
  state.saved = text;
  state.template = parseIsland(text, `${template.id}.island`);
  state.fresh.delete(template.id);
  await loadListing();
  refresh();
  setStatus(`${template.id} written to templates/${template.id}.island`, 'good');
}

dom.del.addEventListener('click', () => {
  const template = state.template;
  if (!template) return;
  if (!window.confirm(`Delete templates/${template.id}.island?`)) return;
  void (async () => {
    if (!state.fresh.has(template.id)) {
      const response = await fetch(`${API}/${encodeURIComponent(template.id)}`, { method: 'DELETE' });
      if (!response.ok) { setStatus(`could not delete ${template.id}`, 'bad'); return; }
    }
    state.fresh.delete(template.id);
    state.template = null;
    state.saved = null;
    await loadListing();
    refresh();
    setStatus(`${template.id} deleted`, '');
  })();
});

// --- readouts and refresh --------------------------------------------------

function row(term: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dom.derived.append(dt, dd);
}

function refresh(): void {
  drawMap();
  drawIsland();
  drawCatalog();
  dom.derived.replaceChildren();
  dom.problems.replaceChildren();

  const template = state.template;
  if (template) {
    const problems = templateProblems(template);
    const island = templateToIsland(template);
    const placed = template.cells.filter((id) => id !== null).length;
    const distinct = new Set(template.cells.filter(Boolean)).size;
    row('acres', `${placed} placed, ${TEMPLATE_CELLS - placed} open water`);
    row('distinct', String(distinct));
    row('dock', `${island.anchors.dock.col},${island.anchors.dock.row}`);
    row('office', `${island.anchors.postOffice.col},${island.anchors.postOffice.row}`);
    row('summit', `${island.anchors.summit.col},${island.anchors.summit.row}`);
    row('library', template.library === libraryFingerprint() ? 'current' : `${template.library} (stale)`);

    const entries: { text: string; at?: number }[] = [
      ...problems.missing.map((id) => ({ text: `missing acre: ${id}` })),
      ...problems.seams.map((seam) => ({
        text: `${seam.col},${seam.row} ${seam.message}`,
        at: seam.row * GRID_COLS + seam.col,
      })),
    ];
    dom.detailsSummary.textContent = entries.length > 0
      ? `Map details · ${entries.length} problem${entries.length === 1 ? '' : 's'}`
      : 'Map details · no problems';
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'ok';
      li.textContent = placed === 0 ? 'empty map' : 'every seam tiles';
      dom.problems.append(li);
    } else {
      for (const entry of entries.slice(0, 40)) {
        const li = document.createElement('li');
        li.textContent = entry.text;
        dom.problems.append(li);
      }
      if (entries.length > 40) {
        const li = document.createElement('li');
        li.textContent = `…and ${entries.length - 40} more`;
        dom.problems.append(li);
      }
    }
  } else {
    dom.detailsSummary.textContent = 'Map details';
  }

  dom.undo.disabled = state.undo.length === 0;
  dom.redo.disabled = state.redo.length === 0;
  dom.save.disabled = state.template === null || !isDirty();
  dom.del.disabled = state.template === null;
}

drawBrush();
drawPalette();
void (async () => {
  await loadListing();
  const first = state.listing[0];
  if (first) await open(first.id);
  state.brush = authoredPieces()[0] ?? null;
  drawBrush();
  drawPalette();
  setStatus(`${state.listing.length} maps · ${authoredPieces().length} acres in the palette`, '');
})();
