import * as GameLoopMethods from './modules/GameLoop';
import * as InteractionControllerMethods from './modules/InteractionController';
import * as FixtureInteractionMethods from './modules/FixtureInteraction';
import * as CommerceControllerMethods from './modules/CommerceController';
import * as ActivityControllerMethods from './modules/ActivityController';
import * as SceneDirectorMethods from './modules/SceneDirector';
import * as SocialControllerMethods from './modules/SocialController';
import * as CalendarMailControllerMethods from './modules/CalendarMailController';
import * as PersistenceControllerMethods from './modules/PersistenceController';
import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { audio, type ThemeName } from '../core/AudioSystem';
import { bus } from '../core/events';
import { RetroPipeline } from '../core/RetroPipeline';
import { Particles } from '../world/Particles';
import { NPC } from '../characters/NPC';
import { OpeningPlayer } from '../cutscene/OpeningPlayer';
import * as D from '../data/dialogue';
import { ITEMS } from '../data/items';
import { DialogueBox } from '../interaction/DialogueBox';
import { SpeechBubbles } from '../ui/SpeechBubbles';
import { Input } from '../player/Input';
import { Player, type ToolId } from '../player/Player';
import { BugSystem } from '../systems/BugSystem';
import { FishingSystem } from '../systems/FishingSystem';
import { DivingSystem } from '../systems/DivingSystem';
import { Friendship } from '../systems/Friendship';
import type { SceneStep } from '../data/heartScenes';
import { MailSystem } from '../systems/MailSystem';
import type { DeadLetter } from '../data/letters';
import { Calendar, type Season } from '../systems/Calendar';
import { Weather } from '../world/Weather';
import { baseTool } from '../data/crafting';
import { FurnitureSystem } from '../systems/FurnitureSystem';
import { Inventory } from '../systems/Inventory';
import { ItemDrops } from '../systems/ItemDrops';
import { QuestSystem } from '../systems/QuestSystem';
import {
  activeSaveSlot,
  listSaveSlots,
  type SaveData,
  type SaveSlotId,
} from '../systems/SaveSystem';
import { TimeSystem } from '../systems/TimeSystem';
import { ACTIVE_FIELD, ACTIVE_LAYOUT } from '../world/mapConstants';
import { AcreDebugLayer } from '../dev/AcreDebugLayer';
import { GridDebugLayer } from '../dev/GridDebugLayer';
import { CurveDebugLayer } from '../dev/CurveDebugLayer';
import { registerDevCommands } from '../dev/registerDevCommands';
import { DevConsole } from '../ui/DevConsole';
import { HUD } from '../ui/HUD';
import { InventoryUI } from '../ui/InventoryUI';
import { LedgerUI } from '../ui/LedgerUI';
import { el, ensureStyles } from '../ui/kit';
import { MuseumUI } from '../ui/MuseumUI';

export const FAVOR_WISHLISTS: Record<string, string[]> = {
  sparks: ['relic-teacup', 'orchard-apple', 'relic-letter'],
  reggie: ['scrap-metal', 'gear-beetle', 'relic-gearheart'],
  'cataloger-734': ['tin-mushroom', 'ivory-butterfly', 'bristle-pinecone', 'lantern-eel'],
  marigold: ['wild-chicory', 'ember-berry', 'orchard-apple'],
  buoy: ['brass-bream', 'lantern-eel', 'rust-carp'],
  wick: ['dusk-firefly', 'cinder-moth', 'bristle-pinecone'],
  fern: ['ember-berry', 'tin-mushroom', 'wild-chicory'],
  plink: ['meadow-hopper', 'orchard-apple', 'dusk-firefly'],
};
export const DAILY_SURPRISES = ['orchard-apple', 'wild-chicory', 'stone', 'scrap-metal'];
import { NameInput } from '../ui/NameInput';
import { PauseMenu } from '../ui/PauseMenu';
import { ShopUI } from '../ui/ShopUI';
import { TitleScreen } from '../ui/TitleScreen';
import { Ambience } from '../world/Ambience';
import { CameraRig } from '../world/CameraRig';
import { SubjectProtection } from '../world/SubjectProtection';
import { DayNight } from '../world/DayNight';
import { heightAt, TownMap, type MapFeature } from '../world/TownMap';
import {
  Interior,
} from '../world/Interior';

type GameState = 'title' | 'intro' | 'play';

export const TOOL_HOTKEYS: Array<[string, ToolId]> = [
  ['Digit1', 'tool-net'],
  ['Digit2', 'tool-rod'],
  ['Digit3', 'tool-shovel'],
  ['Digit4', 'tool-axe'],
];

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}

export class Game {
  state: GameState = 'title';
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  pipeline: RetroPipeline;
  rig: CameraRig;
  subjectProtection: SubjectProtection;
  input = new Input();
  clockThree = new THREE.Clock();
  /** Unsimulated real time carried between rendered frames. */
  simulationAccumulator = 0;

  map = new TownMap();
  dayNight: DayNight;
  ambience: Ambience;
  time = new TimeSystem();
  inventory = new Inventory();
  quests = new QuestSystem();
  player: Player;
  npcs = new Map<string, NPC>();
  fishing: FishingSystem;
  bugs: BugSystem;
  diving: DivingSystem;
  furniture: FurnitureSystem;
  drops: ItemDrops;

  hud: HUD;
  dialogue: DialogueBox;
  bubbles: SpeechBubbles;
  fx: Particles;
  inventoryUI: InventoryUI;
  shopUI: ShopUI;
  museumUI: MuseumUI;
  pauseMenu: PauseMenu;
  nameInput: NameInput;
  devConsole: DevConsole;
  acreView: AcreDebugLayer;
  gridView: GridDebugLayer;
  curveView: CurveDebugLayer;
  title: TitleScreen | null = null;
  intro: OpeningPlayer;
  prompt: HTMLDivElement;

  playerName = 'Postmaster';
  createdAt = Date.now();
  playedSeconds = 0;
  museumDonations = new Set<string>();
  discovered = new Set<string>();
  lastDigRefresh = 0;
  dailyLoop = { day: '', npcId: '', itemId: '', surprise: '' };
  autosaveTimer = 0;
  titleSpin = 0;
  particles: Particle[] = [];
  currentTalker: NPC | null = null;
  lastLineText = '';
  /** Latest substantial player activity; feeds villagers' immediate reactions. */
  recentAction: D.RecentAction | undefined;
  /** Blocks movement/interactions during staged sequences. */
  cutsceneHold = false;
  /**
   * Set when the game was booted into scene-preview mode (`?scene=`).
   *
   * The loop ticks it instead of the title screen. Kept as one nullable field
   * rather than a fourth game state: the preview shows the same world in the
   * same renderer, and giving it a state would mean auditing every branch that
   * already switches on one.
   */
  scenePreview: { update(dt: number): void; afterRender?(): void } | null = null;
  ceremonyUntil = 0;
  /** Set while a staged scene is running; overrides the hourly theme. */
  sceneTheme: ThemeName | null = null;
  equippedCoat = 'coat-postal';
  /** NPC-to-NPC conversation state. */
  social: {
    a: NPC;
    b: NPC;
    phase: 'approach' | 'chat';
    /** Written exchange for this pair, if they have one. */
    script?: Array<[string, string]> | null;
    /** Index of the next line to speak. */
    line: number;
    timer: number;
    exchange: number;
  } | null = null;
  socialCooldown = 12;
  /** Rotates which written exchange a pair performs. */
  overheardCounter = 0;
  scheduleTimer = 1;
  mailCheckTimer = 2;
  npcsPinned = false;
  achievements = new Set<string>();
  screenShake = true;

  // --- hearts
  friendship = new Friendship();
  ledgerUI!: LedgerUI;

  // --- mail / dead letter office
  mail = new MailSystem();

  // --- seasons & weather
  calendar = new Calendar();
  weather!: Weather;
  season: Season = 'summer';
  lastFestivalDay = '';
  festivalActive = false;
  festivalProps: THREE.Object3D[] = [];
  festivalTokens: Array<{ mesh: THREE.Mesh; x: number; z: number }> = [];
  festivalRewardGiven = false;
  /** NPC currently acting in a heart scene (exempt from cutscene freeze). */
  sceneActor: NPC | null = null;
  letterboxTop: HTMLDivElement | null = null;
  letterboxBottom: HTMLDivElement | null = null;

  // --- interiors
  interiors = new Map<string, Interior>();
  currentInterior: Interior | null = null;
  /** Outdoor position to restore on exit. */
  interiorReturn = new THREE.Vector3();
  stationedNpc: NPC | null = null;
  stationedReturn = new THREE.Vector3();
  doorFadeEl: HTMLDivElement | null = null;
  doorBusy = false;
  outdoorFog: { near: number; far: number } | null = null;
  houseTier = 0;
  housePaper = 'plaster';
  houseFloor = 'pine';
  concertTrack: number | null = null;
  saveSlot: SaveSlotId = activeSaveSlot();
  sceneProps: THREE.Object3D[] = [];
  sceneDim = 0;
  static SEASON_GRADE: Record<Season, { tint: number; strength: number; sat: number; ground: number; ambient: number }> = {
    spring: { tint: PALETTE_HEX.hffe4ee, strength: 0.12, sat: 1.06, ground: PALETTE_HEX.he8ecd8, ambient: PALETTE_HEX.hf6c6d8 },
    summer: { tint: PALETTE_HEX.hffffff, strength: 0.0, sat: 1.04, ground: PALETTE_HEX.hffffff, ambient: PALETTE_HEX.h9ec86a },
    autumn: { tint: PALETTE_HEX.hffce88, strength: 0.22, sat: 1.04, ground: PALETTE_HEX.hdcbc90, ambient: PALETTE_HEX.hc87a3a },
    winter: { tint: PALETTE_HEX.hd8e4f4, strength: 0.18, sat: 0.82, ground: PALETTE_HEX.hdfe6ee, ambient: PALETTE_HEX.heaf0f6 },
  };

  get toolUpgraded(): boolean {
    const equipped = this.player.equippedTool ?? '';
    return equipped !== baseTool(equipped);
  }

    constructor(container: HTMLElement) {
    ensureStyles();
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1); // the retro pipeline handles resolution
    container.appendChild(this.renderer.domElement);

    this.dayNight = new DayNight(this.scene);
    this.ambience = new Ambience(this.scene);
    this.weather = new Weather(this.scene);
    this.scene.add(this.map.group);
    // `constructBuilding('house-player')` stood here to raise the postmaster's
    // cottage on day one. `house-player` was one of POSTMARK's five fallback
    // plots; no pack names it, so the call had nothing to build.

    this.player = new Player(this.map);
    this.scene.add(this.player.object);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.subjectProtection = new SubjectProtection(this.scene, this.rig.camera, this.player.object);
    this.pipeline = new RetroPipeline(this.renderer, 480, 360);
    this.applySeason();

    this.fishing = new FishingSystem(this.scene, this.time, this.calendar);
    this.bugs = new BugSystem(this.scene, this.map, this.time, this.calendar);
    this.diving = new DivingSystem(this.scene, this.time, this.calendar);
    this.furniture = new FurnitureSystem(this.scene, this.map, this.inventory);
    this.furniture.canPlace = (x, z, radius) => {
      for (const npc of this.npcs.values()) {
        if (npc.hiddenInside) continue;
        if (Math.hypot(x - npc.position.x, z - npc.position.z) < radius + 0.75) return false;
      }
      return true;
    };
    this.drops = new ItemDrops(this.scene, this.inventory);

    this.fishing.onCatch = (itemId, pos) => this.landCatch(itemId, pos, true);
    this.fishing.onMiss = () => this.player.emote('sad');
    this.fishing.onCast = (pos) =>
      this.burst(pos, [PALETTE_HEX.hbcd8e8, PALETTE_HEX.hdfe8f0], 6, { speed: 0.8, up: 1.6, life: 0.5, size: 0.05 });
    this.bugs.onCatch = (itemId, pos) => this.landCatch(itemId, pos, false);
    this.diving.onCatch = (itemId,pos) => this.landCatch(itemId,pos,false);

    this.spawnNpcs();
    this.configureLightingLayers();

    // --- UI
    this.hud = new HUD(container);
    this.rig.blocked = (x, z, y) => !this.currentInterior && this.map.blocksCamera(x, z, y);
    this.dialogue = new DialogueBox(container);
    this.bubbles = new SpeechBubbles(container);
    this.fx = new Particles(this.scene);
    this.registerSpeakers();
    this.inventoryUI = new InventoryUI(container, this.inventory);
    this.inventoryUI.onUse = (i) => this.useInventorySlot(i);
    this.ledgerUI = new LedgerUI(container, this.friendship);
    this.shopUI = new ShopUI(container, this.inventory);
    this.museumUI = new MuseumUI(container);
    this.nameInput = new NameInput(container);
    this.pauseMenu = new PauseMenu(container, {
      onSave: () => this.save(false),
      musicToggle: () => {
        audio.setMusicEnabled(!audio.musicEnabled);
        return audio.musicEnabled;
      },
      sfxToggle: () => (audio.sfxEnabled = !audio.sfxEnabled),
      shakeToggle: () => (this.screenShake = !this.screenShake),
    });
    // --- debug layer. Constructed always, shown only when asked for: the
    // console is the game's single debug entry point and the overlays hang off
    // its command registry rather than off hidden key combinations.
    this.acreView = new AcreDebugLayer(ACTIVE_LAYOUT.acres ?? null, ACTIVE_FIELD);
    this.scene.add(this.acreView.group);
    this.gridView = new GridDebugLayer(
      ACTIVE_LAYOUT.cells ?? null,
      ACTIVE_FIELD,
      () => this.weather.kind === 'snow',
    );
    this.scene.add(this.gridView.group);
    this.curveView = new CurveDebugLayer(ACTIVE_LAYOUT.acres ?? null, ACTIVE_FIELD);
    this.scene.add(this.curveView.group);
    this.devConsole = new DevConsole(container, this.input);
    registerDevCommands(this);

    this.intro = new OpeningPlayer(container, this.dialogue, this.nameInput);
    // Kraft pill with wax-seal key badges ("[E]" renders as a red seal).
    this.prompt = el('div', 'pm-kraft');
    this.prompt.style.cssText += `
      left:50%; bottom:20%; transform:translateX(-50%);
      padding:7px 16px; font-size:14px; display:none; z-index:15;
      border-radius: 20px; white-space: nowrap;
    `;
    container.appendChild(this.prompt);
    this.hud.setVisible(false);

    // --- Title screen over the live town scene.
    audio.setTheme('title');
    this.title = new TitleScreen(container, {
      slots: listSaveSlots(),
      onContinue: (slot) => this.startFromSave(slot),
      onNewGame: (slot) => this.startNewGame(slot),
      musicToggle: () => {
        audio.setMusicEnabled(!audio.musicEnabled);
        return audio.musicEnabled;
      },
      sfxToggle: () => (audio.sfxEnabled = !audio.sfxEnabled),
    });
    this.rig.snapTo(new THREE.Vector3(-4, 0, 6));

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.rig.camera.aspect = window.innerWidth / window.innerHeight;
      this.rig.camera.updateProjectionMatrix();
    });
    window.addEventListener('click', () => audio.unlock(), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.save(true);
    });

    bus.on('quest:completed', ({ questId }) => this.onQuestCompleted(questId));
    bus.on('museum:donated', () => {
      this.checkTownLivesProgress();
      this.checkMuseumWings();
    });
    bus.on('friendship:heart', ({ npcId, hearts }) => {
      if (hearts >= 5) this.recordAchievement('first-bond', 'Kindred Spirits', 'Reached five hearts with a villager.');
      void npcId;
    });
    bus.on('friendship:heart', ({ npcId, hearts }) => {
      const npc = this.npcs.get(npcId);
      bus.emit('toast', {
        text: `${npc?.displayName ?? npcId} — ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}`,
        icon: '♥',
      });
      audio.sfx('gift');
      npc?.emote('love', 2.5);
    });

    // Debug/testing hooks (used by the smoke/visual scripts).
    (window as unknown as Record<string, unknown>).__postmark = {
      game: this,
      grant: (id: string, n = 1) => this.inventory.add(id, n),
      gears: (n: number) => this.inventory.addGears(n),
      timeOffset: (h: number) => (this.time.offsetHours = h),
      quests: this.quests,
      skipTitle: () => this.startNewGame(),
      warp: (x: number, z: number) => {
        if (this.currentInterior) this.clearInteriorState();
        this.player.position.set(x, heightAt(x, z), z);
        this.rig.snapTo(this.player.position);
      },
      pos: () => ({ x: this.player.position.x, z: this.player.position.z }),
      npcPos: (id: string) => {
        const npc = this.npcs.get(id);
        return npc ? { x: npc.position.x, z: npc.position.z } : null;
      },
      fish: () => ({ casting: this.fishing.isCasting, biting: this.fishing.isBiting }),
      collection: () => ({
        discovered:[...this.discovered], swimming:this.diving.swimming, diving:this.diving.diving,
        counts:{
          fish:Object.values(ITEMS).filter(i=>i.category==='fish').length,
          bugs:Object.values(ITEMS).filter(i=>i.category==='bug').length,
          sea:Object.values(ITEMS).filter(i=>i.category==='sea').length,
          fossils:Object.values(ITEMS).filter(i=>i.category==='fossil'&&!!i.archiveLabel).length,
          art:Object.values(ITEMS).filter(i=>i.category==='art').length,
        },
        artTells:Object.values(ITEMS).filter(i=>i.category==='art').every(i=>!!i.artTell),
      }),
      daily: () => ({ ...this.dailyLoop }),
      economy: () => ({
        shopTier: this.shopTier(),
        achievements: [...this.achievements],
        achievementReward: 200,
        houseTier: this.houseTier,
        remainingHouseSink: [3000, 8000].slice(this.houseTier).reduce((a, b) => a + b, 0),
      }),
      // The diegetic beds ride along with the audio manifest, for gates that
      // have to assert on sound they cannot hear: Web Audio offers no way to
      // read a parameter back mid-ramp, so `AudioSystem` records what each bed
      // was last asked for and this is where a harness reads it.
      audio: () => ({
        ...audio.manifest(),
        concertTrack: this.concertTrack,
        beds: Object.fromEntries([...audio.bedState].map(([name, state]) => [
          name, { ...state, running: audio.bedRunning(name) },
        ])),
      }),
      themeStats: (name: string) => audio.themeStats(name),
      occlusion: () => this.subjectProtection.status(),
      busy: () => this.cutsceneHold || this.player.busy,
      // Dialogue probes for the real-input feel harness. `busy()` only reflects
      // cutscene/celebration holds — ordinary villager dialogue sets neither, so
      // the harness needs a direct read of the dialogue box's state.
      dialogueOpen: () => this.dialogue.isOpen,
      dialogueText: () => this.dialogue.renderedText,
      dialogueTyping: () => this.dialogue.isTyping,
      // Face the player toward a world point (turns the model instantly). Used
      // by the harness so the recorded frame reads as addressing the villager.
      facePlayer: (x: number, z: number) => this.player.faceToward(x, z),
      inside: () => this.currentInterior?.id ?? null,
      house: () => ({ tier: this.houseTier, paper: this.housePaper, floor: this.houseFloor }),
      hearts: (id: string, points?: number) => {
        if (points !== undefined) this.friendship.state(id).points = points;
        return { hearts: this.friendship.hearts(id), points: this.friendship.points(id) };
      },
      mailDeliverAll: () => {
        // Test helper: mark every dead letter delivered (records fragments).
        for (const act of [1, 2, 3] as const) {
          for (const l of this.mail.actLetters(act)) this.mail.deliver(l.id);
        }
        return { delivered: this.mail.allDelivered(), fragments: this.mail.truthFragments.length };
      },
      mailState: () => ({
        carrying: this.mail.carrying,
        fragments: this.mail.truthFragments.length,
        allDelivered: this.mail.allDelivered(),
        act: this.mail.availableAct(this.storyDone(), this.totalHearts()),
      }),
      pinNpcs: (on: boolean) => {
        // Test determinism: hold every villager still, no schedules/wander.
        this.npcsPinned = on;
        for (const npc of this.npcs.values()) {
          npc.pinned = on;
          if (on) npc.schedule = null;
        }
        return on;
      },
      season: (month?: number, day?: number) => {
        this.calendar.setOverride(month ?? null, day);
        this.applySeason();
        return { season: this.calendar.season, label: this.calendar.label, weather: this.weather.kind };
      },
      weather: (kind: 'clear' | 'rain' | 'snow' | 'fog') => {
        this.weather.setWeather(kind);
        return this.weather.kind;
      },
      lighting: () => ({
        shadowDirection: this.dayNight.shadowDirection(),
        shadows: this.renderer.shadowMap.enabled,
      }),
    };
  }
}

export interface Game {
  configureLightingLayers(): void;
  applySchedules(): void;
  spawnNpcs(): void;
  registerSpeakers(): void;
  startNewGame(slot?: SaveSlotId): void;
  startFromSave(slot?: SaveSlotId): void;
  start(): void;
  frame(): void;
  fixedUpdate(dt: number): void;
  pressedConfirm(): boolean;
  currentTheme(): ThemeName;
  updatePlay(dt: number): void;
  updateResidences(): void;
  updateNpcSocial(dt: number): void;
  endSocial(): void;
  footSurface(): 'grass' | 'stone' | 'wood';
  afterModal(dt: number): void;
  emoteForLine(): void;
  updateInteractions(): void;
  /** Actions the nearby placed `.gameobj` instances offer. */
  fixtureActions(): Array<{ text: string; key: string; run: () => void }>;
  /** Leave the seat the player is on, stepping clear of it. */
  standUp(): void;
  runPrimaryAction(actions: Array<{ text: string; key: string; run: () => void }>): void;
  getInterior(id: string): Interior;
  doorFade(mid: () => void): void;
  enterInterior(id: string): void;
  clearInteriorState(): void;
  exitInterior(): void;
  rebuildPlayerHouse(): void;
  checkMuseumWings(): void;
  recordAchievement(id: string, title: string, blurb: string): void;
  shopTier(): number;
  openWorkbench(): void;
  openRenovationLedger(): void;
  openStylePicker(kind: 'wallpaper' | 'flooring'): void;
  openConcertPlayer(): void;
  browseShopItem(itemId: string): void;
  updateInteriorInteractions(): void;
  showPrompt(text: string): void;
  useTool(): void;
  landCatch(itemId: string, pos: THREE.Vector3, isFish: boolean): void;
  dig(spot: MapFeature): void;
  chop(tree: MapFeature): void;
  shakeTree(tree: MapFeature): void;
  pickFlower(flower: MapFeature): void;
  refreshDigSpots(): void;
  ownedTools(): Set<string>;
  useInventorySlot(index: number): void;
  plotRequirement(plotId: string): { text: string; mats: Array<[string, number]> } | null;
  tryBuild(plotId: string): void;
  onQuestCompleted(questId: string): void;
  checkTownLivesProgress(): void;
  burst(
    pos: THREE.Vector3,
    colors: number[],
    count: number,
    opts: { speed: number; up: number; life: number; size: number; gravity?: number },
  ): void;
  celebrateFireworks(): void;
  updateParticles(dt: number): void;
  setLetterbox(on: boolean): void;
  sceneWait(seconds: number): Promise<void>;
  sceneSay(npc: NPC, name: string, lines: string[]): Promise<void>;
  runSceneStep(step: SceneStep, npc: NPC, origin: THREE.Vector3): Promise<void>;
  walkPlayerTo(dest: THREE.Vector3): Promise<void>;
  facePlayerAt(look: THREE.Vector3): void;
  addSceneProp(kind: string, x: number, z: number, holder?: THREE.Object3D | null): void;
  clearSceneProps(): void;
  playHeartScene(npc: NPC, index: number): Promise<void>;
  idleTalk(npc: NPC): void;
  giftFlow(npc: NPC): void;
  offerFavor(npc: NPC): void;
  applySeason(): void;
  dayOfYear(): number;
  checkFestival(): void;
  startFestival(): void;
  buildFestivalProps(season: Season): void;
  endFestival(): void;
  updateFestival(dt: number): void;
  totalHearts(): number;
  storyDone(): boolean;
  letterAvailability(): import('../systems/MailSystem').LetterAvailability;
  openMailSack(npc: NPC): void;
  letterTargetLabel(l: DeadLetter): string;
  letterTargetPos(l: DeadLetter): { x: number; z: number } | null;
  deliverLetter(): Promise<void>;
  beginDailyLoop(day: string): void;
  showDayCard(): void;
  showTitleCard(lines: string[]): void;
  rollCredits(): Promise<void>;
  startTalkless(lines: string[]): void;
  startTalk(
    npc: NPC,
    lines: string[],
    opts?: Parameters<DialogueBox['open']>[2],
  ): void;
  talkTo(npc: NPC): void;
  talkSparks(npc: NPC): void;
  contextIdle(npc: NPC): string[];
  playReactivation(npc: NPC, wakeLines: string[], after?: () => void): void;
  talkReggie(npc: NPC): void;
  talkCataloger(npc: NPC): void;
  donateSpecimens(npc: NPC): void;
  talkDormantVillager(
    npc: NPC,
    lines: { dormant: string[]; wake: string[]; idle: string[][] },
    questVillager: boolean,
  ): void;
  save(auto: boolean): void;
  restore(data: SaveData): void;
}

Object.assign(Game.prototype, GameLoopMethods, InteractionControllerMethods, FixtureInteractionMethods, CommerceControllerMethods, ActivityControllerMethods, SceneDirectorMethods, SocialControllerMethods, CalendarMailControllerMethods, PersistenceControllerMethods);
