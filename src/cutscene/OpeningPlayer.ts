import * as THREE from 'three';
import { audio } from '../core/AudioSystem';
import { PALETTE_HEX } from '../art/palette';
import { SceneDirector } from './scene/SceneDirector';
import { GameSceneHost } from './scene/GameSceneHost';
import { parseScene, type Scene } from './scene/SceneFormat';
import { buildOpeningStage } from './OpeningStage';
import { officeMark, officePlacement } from './OpeningSet';
import { Wisp } from './Wisp';
import { approachRoute, standableAt } from './ApproachRoute';
import { strandLetters } from './StrandedLetters';
import { ACTIVE_LAYOUT } from '../world/mapConstants';
import type { DialogueBox } from '../interaction/DialogueBox';
import type { NameInput } from '../ui/NameInput';
import type { NPC } from '../characters/NPC';
import type { Player } from '../player/Player';
import type { CameraRig } from '../world/CameraRig';
import type { TimeSystem } from '../systems/TimeSystem';
import { el, ensureStyles } from '../ui/kit';
import openingSource from './scenes/kindly-opening.scene?raw';

/**
 * The opening, played from `kindly-opening.scene`.
 *
 * This replaces `IntroCutscene`, and the difference is the point: there is no
 * beat order here, no shot list, no dialogue and no staging. All of that is in
 * the `.scene` and the two `.set` files. What is left is the wiring — build the
 * stage the file names, hand it to a `SceneDirector`, and keep the surface
 * `GameLoop` already talks to.
 *
 * Deleting a beat from the file removes it from the game with no change here.
 */
export class OpeningPlayer {
  private host: GameSceneHost | null = null;
  private director: SceneDirector | null = null;
  private scene: Scene;
  private skipButton: HTMLButtonElement;
  private veil: HTMLDivElement;
  private skipRequested = false;
  private fogRest: { near: number; far: number } | null = null;
  /** The light that leads the walk inland. */
  private wisp: Wisp | null = null;
  /** Residents the opening hid, with the visibility it found them at. */
  private hiddenCast: Array<[THREE.Object3D, boolean]> = [];
  running = false;
  /** Shots that could not see their subject on this play, for the gate. */
  sightlineFailures: ReadonlyArray<{ shot: string; report: unknown }> = [];

  constructor(
    private container: HTMLElement,
    private dialogue: DialogueBox,
    private nameInput: NameInput,
  ) {
    // Parsed at construction, not on play: a broken scene should fail loudly
    // at boot rather than three beats into the sequence.
    this.scene = parseScene(openingSource, 'kindly-opening.scene');
    ensureStyles();
    // Transparent at rest — the title screen shows the live town behind it —
    // and it outlives any one play, so a capture can assert on it afterwards.
    this.veil = el('div', 'pm-fade');
    this.veil.style.opacity = '0';
    container.appendChild(this.veil);
    this.skipButton = document.createElement('button');
    this.skipButton.type = 'button';
    this.skipButton.textContent = 'Skip opening  [Esc]';
    this.skipButton.style.cssText = `
      position:absolute; right:18px; top:18px; z-index:70; display:none;
      border:1px solid var(--pm-h9a7f4e); border-radius:16px;
      padding:7px 13px; background:var(--pm-h201a14); color:var(--pm-he8dfc8);
      font:12px Georgia,serif; letter-spacing:0.06em; cursor:pointer;
    `;
    this.skipButton.addEventListener('click', () => this.requestSkip());
    container.appendChild(this.skipButton);
    document.addEventListener('keydown', (event) => {
      if (this.running && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.requestSkip();
      }
    }, true);
  }

  /** True while the player drives their own character mid-scene. */
  get playerControlled(): boolean {
    return this.host?.playerControlled ?? false;
  }

  /** Where the player is being led, for the capture harness to steer at. */
  get walkTarget(): THREE.Vector3 | null {
    return this.host?.walkTarget ?? null;
  }

  /**
   * What the director has played, for the capture harness to assert on.
   *
   * Kept after the scene ends rather than cleared with the director: the
   * capture asserts on the sequence *after* the opening has handed over, and a
   * playhead that emptied itself at the finish line would have nothing to say.
   */
  private lastPlayhead: SceneDirector['playhead'] | null = null;

  get playhead(): SceneDirector['playhead'] | null {
    return this.director?.playhead ?? this.lastPlayhead;
  }

  update(dt: number): void {
    this.nameInput.updateGamepad();
    this.host?.update(dt);
    this.director?.tick(dt);
    this.host?.animate(dt);
  }

  private requestSkip(): void {
    if (!this.running || this.skipRequested) return;
    this.skipRequested = true;
    this.dialogue.finish();
    this.nameInput.cancelAssignment();
    this.director?.abort();
    this.host?.release();
  }

  /** Kindly Forward vertical slice. Resolves with the chosen player name. */
  async run(
    player: Player,
    openingNpc: NPC,
    rig: CameraRig,
    time: TimeSystem,
    cast: Iterable<NPC> = [],
    setSceneTheme: (name: string | null) => void = () => {},
  ): Promise<string> {
    this.skipRequested = false;
    this.nameInput.resetAssignmentCancellation();
    this.running = true;
    this.skipButton.style.display = 'block';
    const scene = player.object.parent as THREE.Scene;
    const worldFog = scene.fog;
    this.fogRest = worldFog instanceof THREE.Fog
      ? { near: worldFog.near, far: worldFog.far }
      : null;

    const island = ACTIVE_LAYOUT.acres;
    if (!island) throw new Error('the active layout carries no island to stage on');

    // The world's own birdsong is not welcome here. The sequence is four
    // minutes at sea and then on an island whose whole claim is that nobody is
    // left, and land birds were chirping through the fog and the walk inland.
    // The gulls this scene *does* want are fired by name, from the deck, and
    // stop when the ferry does.
    audio.wildlife = 0;

    // --- clear the island of everyone who is not in this scene.
    //
    // The opening's whole claim is that she is alone: the berth is empty, the
    // crew is gone, the voice in the fog has nobody attached to it, and the
    // Keeper's own account is that the island's dead are *still waiting* to be
    // told they may go. Seven residents were walking around behind all of it —
    // they are placed at world start, and one of them stands about seven metres
    // from the spring, in frame, during the beat where he says there is nobody
    // left to carry anything to them.
    //
    // Hidden rather than moved or removed, and their previous state is kept:
    // the opening is a scene, not a world edit, and every one of them has to be
    // exactly where and how it found them when it hands over.
    this.hiddenCast = [];
    for (const npc of cast) {
      if (npc === openingNpc) continue;
      this.hiddenCast.push([npc.object, npc.object.visible]);
      npc.object.visible = false;
    }

    // --- seat every set the scene names, and build what stands in them.
    openingNpc.object.visible = false;
    const { placements, groups, actors, islandMarks, islandApertures } = buildOpeningStage(
      this.scene, scene, island, player, openingNpc, 'kindly-opening.scene',
    );

    // --- the light that leads her inland, and wakes what it was for.
    const wisp = new Wisp(scene);
    this.wisp = wisp;

    // --- the backlog, on the ground, where she has to walk through it.
    //
    // Not staging and deliberately not struck at the title card: undelivered
    // mail lying in the grass is a fact about the island that is still true
    // after the opening, and the first thing the player is asked to do is start
    // clearing it. See `StrandedLetters` for why this stays where the lantern
    // trail did not.
    const berth = placements.get('ferry')?.markWorld('dock.wake') ?? player.position.clone();
    const inland = approachRoute(berth, islandMarks.get('spring.approach')?.position ?? berth);
    if (inland) strandLetters(scene, inland);

    const host = new GameSceneHost({
      scene, rig, player, dialogue: this.dialogue, nameInput: this.nameInput,
      container: this.container,
      occluders: scene,
      veil: this.veil,
      placements, actors, groups, islandMarks, islandApertures,
      // No cut. The walk inland *is* the beat now — the player follows the
      // wisp the whole way, and cutting past the middle of it would cut past
      // the only stretch of the game where she is alone with the island. The
      // reason a cut was wanted in the first place was that the walk was
      // unnavigable, and the wisp is the fix for that.
      walkCutIn: () => null,
      wisp,
      standable: standableAt,
      setSceneTheme: (name) => { setSceneTheme(name); },
      // Only put it back if the scene is still going. The opening's card is
      // its last beat, so the frame after it fades is the handoff — and
      // flicking the button back on for that frame is a flash of cutscene
      // furniture over the game.
      onCard: (shown) => {
        this.skipButton.style.display = shown || !this.running ? 'none' : 'block';
      },
      hour: () => time.hour,
      setHour: (hour) => time.setLocalHour(hour),
    });
    this.host = host;
    host.setVeilColour(`#${PALETTE_HEX.hbcd0e8.toString(16).padStart(6, '0')}`);
    rig.snapTo(player.position);

    const director = new SceneDirector(this.scene, host);
    this.director = director;
    this.lastPlayhead = director.playhead;
    if (typeof window !== 'undefined') {
      // The capture harness reads this instead of the old `__introShots`.
      (window as unknown as { __scenePlayhead?: unknown }).__scenePlayhead = director.playhead;
    }
    await director.play();
    this.sightlineFailures = [...host.sightlineFailures];

    if (this.skipRequested) this.landSkipped(player, openingNpc, rig, scene, host, time);
    else openingNpc.object.visible = true;

    // The wisp is staging, not world content: it went into the Keeper, and
    // anything left of it belongs to the scene that spawned it.
    this.wisp?.dispose();
    this.wisp = null;
    // The island gets its people back exactly as they were.
    for (const [object, wasVisible] of this.hiddenCast) object.visible = wasVisible;
    this.hiddenCast = [];

    const { name } = host.playerAnswers;
    this.running = false;
    this.skipButton.style.display = 'none';
    rig.clearFocus();
    audio.clearLayers(0.4);
    audio.wildlife = 1;
    // The boat is gone; so is its engine, and so is whatever the Keeper was.
    // Forced off here rather than trusted to the scene, because the skip path
    // never reaches the cues that stop them — and an engine still running on
    // the island afterwards is a ferry nobody can see.
    audio.clearBeds(0.3);
    // Hand the score back to the clock. The opening claims it for its own
    // beats — an ordinary afternoon that drains to dusk and then to whatever
    // the Keeper is — and holding the claim past the title card would leave
    // the island playing the cutscene's music for the rest of the game.
    setSceneTheme(null);
    host.dispose();
    this.host = null;
    this.director = null;
    return name;
  }

  /**
   * Land a skipped opening in the same durable state as playing it through.
   *
   * Which means Albert on his mark behind the counter, the player outside the
   * office door — not the default spawn — and the clock where the scene would
   * have left it, because the first objective is to walk in and start
   * reopening the place.
   */
  private landSkipped(
    player: Player,
    openingNpc: NPC,
    rig: CameraRig,
    scene: THREE.Scene,
    host: GameSceneHost,
    time: TimeSystem,
  ): void {
    scene.getObjectByName('kindly-forward-ferry')?.removeFromParent();
    this.host?.clearVeil();
    if (scene.fog instanceof THREE.Fog && this.fogRest) {
      scene.fog.near = this.fogRest.near;
      scene.fog.far = this.fogRest.far;
    }
    // Including the hour. The sequence leaves at mid-afternoon and arrives at
    // dusk, so a skip that kept the departure light would hand the player an
    // island four hours earlier than the one the story put her on — and the
    // first thing she does is walk to a lit window.
    if (host.clockTarget !== null) time.setLocalHour(host.clockTarget);
    const desk = officeMark('office.counter');
    openingNpc.object.visible = true;
    openingNpc.object.rotation.z = 0;
    openingNpc.object.position.copy(desk);
    openingNpc.home.set(desk.x, desk.y, desk.z);
    const arrival = officeMark('office.approach');
    player.position.copy(arrival);
    player.object.rotation.set(0, officePlacement().yaw + Math.PI, 0);
    rig.clearFocus();
    rig.snapTo(player.position);
    audio.clearLayers(0.1);
  }

  /** Skip straight to gameplay (loading a save). */
  async fadeInOnly(): Promise<void> {
    this.veil.style.transition = 'none';
    this.veil.style.opacity = '1';
    void this.veil.offsetHeight;
    this.veil.style.transition = 'opacity 1.5s ease';
    this.veil.style.opacity = '0';
    await new Promise((resolve) => { window.setTimeout(resolve, 1600); });
  }
}
