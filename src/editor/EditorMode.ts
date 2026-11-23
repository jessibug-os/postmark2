import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Game } from '../game/Game';
import type { PlacedObject } from '../world/TownMap';
import { heightAt } from '../world/terrain';
import { ACRE_SIZE, GRID_COLS, GRID_ROWS, acreCentre } from '../world/island/AcreLibrary';
import { FIXTURE_LIMIT, islandMarks } from '../world/island/AcreFixtures';
import { setOverride } from '../world/island/PieceOverrides';
import { seatWorld } from '../game/modules/FixtureInteraction';
import { placementsById } from '../world/island/PieceLibrary';
import { formatAcre, parseAcre } from '../world/island/AcreFormat';
import { componentsOf, type GameObject } from '../world/objects/GameObjectFormat';
import type { AcreFixture } from '../world/island/AcrePiece';
import { ACTIVE_GAME_OBJECTS } from '../content/activePack';
import { ACTIVE_LAYOUT } from '../world/mapConstants';
import { assets } from '../core/AssetLoader';
import { mountEditorPanel } from './EditorPanel';
import { applyVertexSnap } from '../core/RetroMaterial';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const SESSION_KEY = 'postmark.editor';
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const round = (value: number): number => Math.round(value * 100) / 100;
const wrap = (degrees: number): number => ((Math.round(degrees) % 360) + 360) % 360;

export type TransformMode = 'translate' | 'rotate';
export type Field = 'x' | 'z' | 'turn';

export interface Source {
  x: number;
  z: number;
  turn: number;
}

export interface Editor {
  readonly camera: THREE.PerspectiveCamera;
  readonly active: boolean;
  readonly selected: PlacedObject | null;
  readonly mode: TransformMode;
  readonly status: string;
  toggle(): void;
  resume(): void;
  update(): void;
  objects(): readonly PlacedObject[];
  select(object: PlacedObject | null): void;
  focus(): void;
  types(): readonly GameObject[];
  add(type: string): Promise<void>;
  remove(object: PlacedObject): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  setMode(mode: TransformMode): void;
  source(object: PlacedObject): Source;
  setField(object: PlacedObject, field: Field, value: number): void;
  isDirty(object: PlacedObject): boolean;
  dirtyCount(): number;
  save(): Promise<void>;
  subscribe(listener: () => void): () => void;
  version(): number;
}

interface Pose {
  x: number;
  z: number;
  yaw: number;
}

type Step =
  | { kind: 'pose'; object: PlacedObject; from: Pose; to: Pose }
  | { kind: 'exists'; object: PlacedObject; exists: boolean };

const samePose = (a: Pose, b: Pose): boolean => a.x === b.x && a.z === b.z && a.yaw === b.yaw;

function overlayMaterial(color: number): THREE.LineBasicMaterial {
  return applyVertexSnap(new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }), { snap: false });
}

const COLLIDE_MAT = overlayMaterial(0xff5544);
const SEAT_MAT = overlayMaterial(0x44ddff);
const MARK_MAT = overlayMaterial(0xffdd55);
const BORDER_MAT = overlayMaterial(0xffffff);
BORDER_MAT.opacity = 0.25;

function line(points: THREE.Vector3[], material: THREE.LineBasicMaterial, loop = false): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const result = loop ? new THREE.LineLoop(geometry, material) : new THREE.LineSegments(geometry, material);
  result.renderOrder = 999;
  return result;
}

function ring(x: number, z: number, r: number): THREE.Line {
  const y = heightAt(x, z) + 0.05;
  const points = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return new THREE.Vector3(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
  });
  return line(points, COLLIDE_MAT, true);
}

function acreBorders(): THREE.Line {
  const points: THREE.Vector3[] = [];
  const halfX = (GRID_COLS * ACRE_SIZE) / 2;
  const halfZ = (GRID_ROWS * ACRE_SIZE) / 2;
  const dash = (ax: number, az: number, bx: number, bz: number): void => {
    points.push(new THREE.Vector3(ax, heightAt(ax, az) + 0.05, az), new THREE.Vector3(bx, heightAt(bx, bz) + 0.05, bz));
  };
  for (let col = 0; col <= GRID_COLS; col++) {
    const x = col * ACRE_SIZE - halfX;
    for (let z = -halfZ; z < halfZ; z += 1) dash(x, z, x, z + 0.5);
  }
  for (let row = 0; row <= GRID_ROWS; row++) {
    const z = row * ACRE_SIZE - halfZ;
    for (let x = -halfX; x < halfX; x += 1) dash(x, z, x + 0.5, z);
  }
  return line(points, BORDER_MAT);
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    (child as THREE.Line).geometry?.dispose();
    group.remove(child);
  }
}

interface Session {
  camera: [number, number, number];
  target: [number, number, number];
  selected: string | null;
}

function placement(object: PlacedObject): { base: string; quarter: number } {
  const [base, quarter] = object.piece.split('@');
  return { base, quarter: Number(quarter ?? 0) };
}

function fixtureOf(object: PlacedObject) {
  return placementsById().get(object.piece)?.fixtures?.find((fixture) => fixture.id === object.fixture);
}

export function createEditor(game: Game, container: HTMLElement): Editor {
  const canvas = game.renderer.domElement;
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.layers.mask = game.rig.camera.layers.mask;
  const orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false;
  const transform = new TransformControls(camera, canvas);
  transform.enabled = false;
  transform.setTranslationSnap(0.05);
  transform.setRotationSnap(15 * DEG);
  const gizmo = transform.getHelper();
  const box = new THREE.BoxHelper(new THREE.Object3D(), 0xffcc33);
  box.visible = false;
  applyVertexSnap(box.material as THREE.Material, { snap: false });
  const raycaster = new THREE.Raycaster();
  const dirty = new Set<PlacedObject>();
  const added = new Set<PlacedObject>();
  const removed = new Set<PlacedObject>();
  const undoStack: Step[] = [];
  const redoStack: Step[] = [];
  const overlay = new THREE.Group();
  const marks = new THREE.Group();
  let dragFrom: Pose | null = null;
  const held = new Set<string>();
  const clock = new THREE.Clock();
  let fast = false;
  const listeners = new Set<() => void>();
  let active = false;
  let selected: PlacedObject | null = null;
  let mode: TransformMode = 'translate';
  let status = '';
  let revision = 0;
  let pointerDown: { x: number; y: number } | null = null;

  const style = document.createElement('style');
  style.textContent = '.pm-editing > :not(canvas) { visibility: hidden !important; }';
  document.head.appendChild(style);

  const drawOverlay = (): void => {
    clearGroup(overlay);
    for (const object of game.map.placedObjects) {
      for (const collider of object.colliders) {
        if (collider.active) overlay.add(ring(collider.x, collider.z, collider.r));
      }
      for (const seat of componentsOf(object.definition, 'seat')) {
        const { position, facing } = seatWorld(object, seat);
        const tip = position.clone().add(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(0.6));
        const s = 0.15;
        overlay.add(line([
          position, tip,
          position.clone().add({ x: -s, y: 0, z: 0 }), position.clone().add({ x: s, y: 0, z: 0 }),
          position.clone().add({ x: 0, y: 0, z: -s }), position.clone().add({ x: 0, y: 0, z: s }),
        ], SEAT_MAT));
      }
    }
  };

  const drawMarks = (): void => {
    clearGroup(marks);
    marks.add(acreBorders());
    const island = ACTIVE_LAYOUT.acres;
    if (!island) return;
    try {
      for (const mark of islandMarks(island, heightAt).values()) {
        const p = mark.position;
        const top = p.clone().add({ x: 0, y: 0.8, z: 0 });
        const d = 0.15;
        marks.add(line([
          p, top,
          top.clone().add({ x: -d, y: 0, z: 0 }), top.clone().add({ x: d, y: 0, z: 0 }),
          top.clone().add({ x: 0, y: 0, z: -d }), top.clone().add({ x: 0, y: 0, z: d }),
        ], MARK_MAT));
      }
    } catch (error) {
      status = String((error as Error).message ?? error);
    }
  };

  const notify = (): void => {
    revision += 1;
    if (active) drawOverlay();
    for (const listener of listeners) listener();
  };

  const poseOf = (object: PlacedObject): Pose => ({
    x: object.object.position.x,
    z: object.object.position.z,
    yaw: object.object.rotation.y,
  });

  const record = (step: Step): void => {
    undoStack.push(step);
    redoStack.length = 0;
  };

  const applyMode = (): void => {
    transform.setMode(mode);
    transform.showX = mode === 'translate';
    transform.showZ = mode === 'translate';
    transform.showY = mode === 'rotate';
  };

  const sync = (object: PlacedObject): void => {
    const node = object.object;
    const centre = acreCentre(object.acre.col, object.acre.row);
    node.position.x = THREE.MathUtils.clamp(node.position.x, centre.x - FIXTURE_LIMIT, centre.x + FIXTURE_LIMIT);
    node.position.z = THREE.MathUtils.clamp(node.position.z, centre.z - FIXTURE_LIMIT, centre.z + FIXTURE_LIMIT);
    const fixture = fixtureOf(object);
    if (!fixture || fixture.ground === 'conform') {
      node.position.y = heightAt(node.position.x, node.position.z) + (fixture?.position.y ?? 0);
    }
    object.position.copy(node.position);
    object.yaw = node.rotation.y;
    componentsOf(object.definition, 'collide').forEach((circle, index) => {
      const collider = object.colliders[index];
      if (!collider) return;
      const spun = new THREE.Vector3(circle.at.x, 0, circle.at.z).applyAxisAngle(UP, object.yaw);
      collider.x = object.position.x + spun.x;
      collider.z = object.position.z + spun.z;
    });
    for (const deck of object.decks) {
      deck.x = object.position.x;
      deck.z = object.position.z;
      deck.yaw = object.yaw;
      deck.top = object.position.y;
    }
    dirty.add(object);
    box.update();
  };

  const source = (object: PlacedObject): Source => {
    const { quarter } = placement(object);
    const centre = acreCentre(object.acre.col, object.acre.row);
    let x = object.object.position.x - centre.x;
    let z = object.object.position.z - centre.z;
    for (let turn = 0; turn < quarter; turn++) [x, z] = [z, -x];
    return { x: round(x), z: round(z), turn: wrap(-object.object.rotation.y / DEG - quarter * 90) };
  };

  const setField = (object: PlacedObject, field: Field, value: number): void => {
    if (!Number.isFinite(value)) return;
    const from = poseOf(object);
    const next = { ...source(object), [field]: value };
    const { quarter } = placement(object);
    const centre = acreCentre(object.acre.col, object.acre.row);
    let { x, z } = next;
    for (let turn = 0; turn < quarter; turn++) [x, z] = [-z, x];
    object.object.position.x = centre.x + x;
    object.object.position.z = centre.z + z;
    object.object.rotation.y = -(next.turn + quarter * 90) * DEG;
    sync(object);
    const to = poseOf(object);
    if (!samePose(from, to)) record({ kind: 'pose', object, from, to });
    notify();
  };

  const applyPose = (object: PlacedObject, pose: Pose): void => {
    object.object.position.x = pose.x;
    object.object.position.z = pose.z;
    object.object.rotation.y = pose.yaw;
    sync(object);
  };

  const select = (object: PlacedObject | null): void => {
    selected = object;
    if (object) {
      transform.attach(object.object);
      box.setFromObject(object.object);
      box.visible = true;
    } else {
      transform.detach();
      box.visible = false;
    }
    notify();
  };

  const focus = (): void => {
    if (!selected) return;
    const offset = camera.position.clone().sub(orbit.target).setLength(9);
    orbit.target.copy(selected.position);
    camera.position.copy(selected.position).add(offset);
    orbit.update();
    notify();
  };

  const add = async (type: string): Promise<void> => {
    const definition = ACTIVE_GAME_OBJECTS.get(type);
    const point = orbit.target;
    const col = Math.round(point.x / ACRE_SIZE + (GRID_COLS - 1) / 2);
    const row = Math.round(point.z / ACRE_SIZE + (GRID_ROWS - 1) / 2);
    const acre = ACTIVE_LAYOUT.acres?.acres.find((candidate) => candidate.col === col && candidate.row === row);
    const assetId = definition ? assets.idForFile(definition.model) : null;
    if (!definition || !assetId) {
      status = `"${type}" has no loadable model.`;
      return notify();
    }
    if (!acre?.pieceId) {
      status = 'The camera focus is not over an authored acre.';
      return notify();
    }
    await assets.preload([assetId]);
    const taken = new Set([
      ...(placementsById().get(acre.pieceId)?.fixtures ?? []).map((fixture) => fixture.id),
      ...game.map.placedObjects.filter((object) => object.piece === acre.pieceId).map((object) => object.fixture),
    ]);
    let n = 1;
    while (taken.has(`${type}-${n}`)) n += 1;
    const object = game.map.spawnFixture({
      acre: { col, row },
      family: acre.kind,
      kind: 'prop',
      id: `${type}-${n}`,
      object: type,
      position: new THREE.Vector3(point.x, heightAt(point.x, point.z), point.z),
      yaw: 0,
      turn: 0,
      piece: acre.pieceId,
    });
    if (!object) return;
    added.add(object);
    sync(object);
    record({ kind: 'exists', object, exists: true });
    const base = placement(object).base;
    const copies = ACTIVE_LAYOUT.acres?.acres.filter((candidate) => candidate.pieceId?.split('@')[0] === base).length ?? 1;
    status = copies > 1
      ? `Added ${object.fixture} to ${base}, which ${copies} acres use; it will appear in all of them.`
      : `Added ${object.fixture} to ${base}.`;
    select(object);
  };

  const setExists = (object: PlacedObject, exists: boolean): void => {
    if (exists) {
      game.map.respawnFixture(object);
      if (!removed.delete(object)) added.add(object);
    } else {
      if (selected === object) select(null);
      game.map.despawnFixture(object);
      if (!added.delete(object)) removed.add(object);
    }
  };

  const remove = (object: PlacedObject): void => {
    setExists(object, false);
    record({ kind: 'exists', object, exists: false });
    status = `Deleted ${object.fixture}.`;
    notify();
  };

  const replay = (step: Step, forward: boolean): void => {
    if (step.kind === 'pose') {
      applyPose(step.object, forward ? step.to : step.from);
      select(step.object);
    } else {
      const exists = forward ? step.exists : !step.exists;
      setExists(step.object, exists);
      select(exists ? step.object : null);
    }
  };

  const undo = (): void => {
    const step = undoStack.pop();
    if (!step) return;
    replay(step, false);
    redoStack.push(step);
    status = 'Undo.';
    notify();
  };

  const redo = (): void => {
    const step = redoStack.pop();
    if (!step) return;
    replay(step, true);
    undoStack.push(step);
    status = 'Redo.';
    notify();
  };

  const writeSession = (): void => {
    const session: Session = {
      camera: camera.position.toArray() as Session['camera'],
      target: orbit.target.toArray() as Session['target'],
      selected: selected?.id ?? null,
    };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      return;
    }
  };

  const enter = (session?: Session): void => {
    if (active) return;
    active = true;
    if (session) {
      camera.position.fromArray(session.camera);
      orbit.target.fromArray(session.target);
    } else {
      const facing = game.rig.camera.getWorldDirection(new THREE.Vector3());
      orbit.target.copy(game.player.position);
      camera.position.copy(game.player.position).addScaledVector(facing, -24);
    }
    camera.lookAt(orbit.target);
    orbit.enabled = true;
    orbit.update();
    transform.enabled = true;
    applyMode();
    drawMarks();
    game.scene.add(gizmo, box, overlay, marks);
    container.classList.add('pm-editing');
    const restored = session?.selected
      ? game.map.placedObjects.find((object) => object.id === session.selected) ?? null
      : selected;
    select(restored);
    writeSession();
  };

  const exit = (): void => {
    if (!active) return;
    active = false;
    held.clear();
    orbit.enabled = false;
    transform.enabled = false;
    transform.detach();
    game.scene.remove(gizmo, box, overlay, marks);
    container.classList.remove('pm-editing');
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      void 0;
    }
    notify();
  };

  const pick = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const objects = game.map.placedObjects;
    const hit = raycaster.intersectObjects(objects.map((object) => object.object), true)[0];
    if (!hit) return select(null);
    let node: THREE.Object3D | null = hit.object;
    while (node && !objects.some((object) => object.object === node)) node = node.parent;
    select(objects.find((object) => object.object === node) ?? null);
  };

  const save = async (): Promise<void> => {
    const pieces = new Set<string>(
      [...dirty, ...added, ...removed].map((object) => placement(object).base).filter(Boolean),
    );
    if (pieces.size === 0) {
      status = 'Nothing to save.';
      return notify();
    }
    status = 'Saving…';
    notify();
    try {
      for (const id of pieces) {
        const inPiece = (object: PlacedObject): boolean => placement(object).base === id;
        const response = await fetch(`/acre/pieces/${encodeURIComponent(id)}`);
        const body = await response.json() as { text?: string; group?: string; error?: string };
        if (!response.ok || body.text === undefined) throw new Error(body.error ?? `could not load ${id}`);
        const piece = parseAcre(body.text, `${id}.acre`);
        const gone = new Set([...removed].filter(inPiece).map((object) => object.fixture));
        const moved = [...dirty].filter((object) => inPiece(object) && !added.has(object) && !removed.has(object));
        const kept = (piece.fixtures ?? []).filter((fixture) => !gone.has(fixture.id)).map((fixture) => {
          const object = moved.find((candidate) => candidate.fixture === fixture.id);
          if (!object) return fixture;
          const next = source(object);
          return { ...fixture, position: { ...fixture.position, x: next.x, z: next.z }, turn: next.turn };
        });
        const fresh: AcreFixture[] = [...added].filter(inPiece).map((object) => {
          const next = source(object);
          return { kind: 'prop', id: object.fixture, object: object.type, position: { x: next.x, y: 0, z: next.z }, turn: next.turn, ground: 'conform' };
        });
        const put = await fetch(`/acre/pieces/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: formatAcre({ ...piece, fixtures: [...kept, ...fresh] }), group: body.group, quiet: true }),
        });
        const result = await put.json() as { text?: string; error?: string };
        if (!put.ok || result.text === undefined) throw new Error(result.error ?? `could not save ${id}`);
        setOverride(id, parseAcre(result.text, `${id}.acre`));
        for (const set of [dirty, added, removed]) {
          for (const object of [...set]) if (inPiece(object)) set.delete(object);
        }
      }
      status = `Saved ${[...pieces].join(', ')}.`;
    } catch (error) {
      status = String((error as Error).message ?? error);
    }
    notify();
  };

  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = active ? { x: event.clientX, y: event.clientY } : null;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!active || !pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved < 4 && !transform.dragging && transform.axis === null) pick(event);
  });
  transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value;
    if (!selected) return;
    if (event.value) {
      dragFrom = poseOf(selected);
    } else if (dragFrom) {
      const to = poseOf(selected);
      if (!samePose(dragFrom, to)) record({ kind: 'pose', object: selected, from: dragFrom, to });
      dragFrom = null;
      notify();
    }
  });
  transform.addEventListener('objectChange', () => {
    if (!selected) return;
    sync(selected);
    notify();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'F1') {
      event.preventDefault();
      toggle();
      return;
    }
    if (!active || event.target instanceof HTMLInputElement) return;
    const command = event.metaKey || event.ctrlKey;
    fast = event.shiftKey;
    if (!command && MOVE_KEYS[event.code]) {
      event.preventDefault();
      held.add(event.code);
    } else if (command && event.code === 'KeyS') {
      event.preventDefault();
      void save();
    } else if (command && (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey))) {
      event.preventDefault();
      redo();
    } else if (command && event.code === 'KeyZ') {
      event.preventDefault();
      undo();
    } else if (event.code === 'KeyG') {
      setMode('translate');
    } else if (event.code === 'KeyR') {
      setMode('rotate');
    } else if (event.code === 'KeyF') {
      focus();
    } else if ((event.code === 'Delete' || event.code === 'Backspace') && selected) {
      remove(selected);
    } else if (event.code === 'Escape') {
      select(null);
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
    fast = event.shiftKey;
  });
  window.addEventListener('blur', () => held.clear());
  window.addEventListener('beforeunload', () => {
    if (active) writeSession();
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const setMode = (next: TransformMode): void => {
    mode = next;
    applyMode();
    notify();
  };

  const toggle = (): void => (active ? exit() : enter());

  const editor: Editor = {
    camera,
    get active() { return active; },
    get selected() { return selected; },
    get mode() { return mode; },
    get status() { return status; },
    toggle,
    resume() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) enter(JSON.parse(raw) as Session);
      } catch {
        void 0;
      }
    },
    update() {
      const dt = Math.min(clock.getDelta(), 0.1);
      let strafe = 0;
      let ahead = 0;
      for (const code of held) {
        strafe += MOVE_KEYS[code][0];
        ahead += MOVE_KEYS[code][1];
      }
      if (strafe || ahead) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, UP);
        const speed = Math.max(4, camera.position.distanceTo(orbit.target) * 0.6) * (fast ? 3 : 1);
        const step = forward.multiplyScalar(ahead).add(right.multiplyScalar(strafe)).normalize().multiplyScalar(speed * dt);
        camera.position.add(step);
        orbit.target.add(step);
      }
      orbit.update();
      if (box.visible) box.update();
    },
    objects: () => game.map.placedObjects,
    select,
    focus,
    types: () => [...ACTIVE_GAME_OBJECTS.values()],
    add,
    remove,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    setMode,
    source,
    setField,
    isDirty: (object) => dirty.has(object),
    dirtyCount: () => new Set([...dirty, ...added, ...removed]).size,
    save,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => revision,
  };
  mountEditorPanel(editor);
  return editor;
}
