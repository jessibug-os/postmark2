/**
 * Little Harbor design contracts v0.1. NOT imported by the runtime.
 * Proposed API boundaries, checked with tsc by build-direction.py's companion command.
 * Runtime validation, persistence and renderer adapters remain implementation work.
 */
export type ResidentId = string;
export type PlaceId = string;
export type ItemId = string;
export type AnchorId = string;
export type InstanceId = string;
export type DayIndex = number; // integer >= 0; day 0 = Spring 1
export type Minute = number; // 0 <= value <= 1380 during playable days
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type JobKind = 'cafe' | 'delivery' | 'repair';
export type ClockPauseReason = 'menu' | 'dialogue' | 'placement' | 'scene' | 'transition' | 'hidden' | 'manual';

export interface BootstrapContext {
  readonly contentId: 'kindly-forward' | 'little-harbor';
  readonly mapId: string;
  readonly saveNamespace: 'postmark-save-v3' | 'little-harbor-save-v1';
  readonly slotId: 1 | 2 | 3;
}
export interface ClockState { dayIndex: DayIndex; minuteOfDay: Minute }
export interface ClockPort {
  readonly state: Readonly<ClockState>;
  readonly hour: number;
  readonly season: Season;
  acquirePause(reason: ClockPauseReason): () => void; // idempotent release; nested owners supported
  tick(realSeconds: number): void;
  waitUntil(minute: Minute): CommandResult;
  sleep(commandId: string): CommandResult;
}
export interface LocalTransform { x: number; z: number; yaw: number }
export interface PlacePosition extends LocalTransform { placeId: PlaceId }
export interface PlaceDef {
  id: PlaceId;
  entranceAnchor?: AnchorId; // absent for town root
  roomFactoryId?: string;
  spawnAnchor: AnchorId;
  exitAnchor?: AnchorId;
  openingHours?: { from: Minute; to: Minute };
  access: 'public' | 'home' | 'invited';
  capacity: number;
}
export interface AnchorDef {
  id: AnchorId;
  placeId: PlaceId;
  transform: LocalTransform;
  capacity: number;
  kind: 'door' | 'seat' | 'work' | 'view' | 'safe-spawn';
}
export interface ScheduleBlock {
  id: string;
  from: Minute;
  to: Minute;
  placeId: PlaceId;
  anchorId: AnchorId;
  activity: 'work' | 'walk' | 'sit' | 'eat' | 'sleep' | 'social';
  fallbackAnchorId: AnchorId;
  weather?: 'any' | 'dry' | 'rain';
}
export interface ResidentDef {
  id: ResidentId;
  displayNameKey: string;
  assetId: string; // validate against runtime manifest; does not define identity
  homePlaceId: PlaceId;
  schedule: readonly ScheduleBlock[];
  relationships: readonly ResidentId[];
}
export interface ResidentState {
  position: PlacePosition;
  activityId: string;
  facts: Record<string, boolean | number | string>;
}
export interface Reservation {
  ownerId: string;
  anchorId: AnchorId;
  priority: 'scene' | 'appointment' | 'job' | 'calendar' | 'routine';
} // runtime-derived; do not serialize reservations

export type Condition =
  | { kind: 'fact'; id: string; equals: boolean | number | string }
  | { kind: 'relationship'; residentId: ResidentId; minimum: number }
  | { kind: 'event'; eventId: string; status: InvitationStatus }
  | { kind: 'place'; placeId: PlaceId }
  | { kind: 'season'; season: Season }
  | { kind: 'time'; from: Minute; to: Minute }
  | { kind: 'job-settled'; kindId: JobKind };
export interface DialogueRule {
  id: string;
  participants: readonly ResidentId[];
  when: readonly Condition[]; // AND, no arbitrary functions
  priority: number;
  cooldownDays: number;
  lineKeys: readonly string[];
  choices?: readonly { id: string; labelKey: string; responseKeys: readonly string[]; command?: Command }[];
}
export interface RelationshipState {
  familiarity: number; // 0..100
  memories: string[];
  creditedByDay: Record<string, { total: number; gifts: number; sources: string[] }>;
  seenSceneIds: string[];
  recentExchangeIds: string[];
}
export interface Stack { itemId: ItemId; count: number }
export interface InventoryDelta {
  remove: readonly Stack[];
  add: readonly Stack[];
  coins: number;
  destination: 'pockets' | 'home-storage';
}
export interface PlacedInstance {
  instanceId: InstanceId;
  itemId: ItemId;
  placeId: PlaceId;
  localX: number;
  localZ: number;
  rotationQuarter: 0 | 1 | 2 | 3;
  displayedItemIds: ItemId[];
}
export interface PlantState {
  potInstanceId: InstanceId;
  seedId: ItemId;
  plantedDay: DayIndex;
  wateredDays: DayIndex[];
  stage: number;
}
export interface HousingState {
  homePlaceId: PlaceId;
  ownedResidenceIds: PlaceId[];
  storage: Stack[];
  finishes: Record<PlaceId, { floorId: string; wallId: string }>;
  payment: { lastAssessedDay: DayIndex; outstanding: null | { dueDay: DayIndex; coins: number } };
}

export type StepDef =
  | { id: string; kind: 'serve'; residentId: ResidentId; anchorId: AnchorId; trayId: string }
  | { id: string; kind: 'return-cup'; anchorId: AnchorId }
  | { id: string; kind: 'handoff'; recipientId: ResidentId; destinationId: PlaceId; parcelId: string }
  | { id: string; kind: 'repair'; anchorId: AnchorId; toolId: string; partToken: string };
export interface JobDef {
  id: string;
  kind: JobKind;
  issuerId: ResidentId;
  placeId: PlaceId;
  hours: { from: Minute; to: Minute };
  steps: readonly StepDef[];
  completionCoins: number;
  earlyCoins: number;
  earlyPayAfterStepIds: readonly string[];
}
export interface Receipt {
  commandId: string;
  revision: number;
  coinsDelta: number;
  appliedEffectIds: string[];
}
export type JobRun = {
  runId: string;
  jobDefId: string;
  kind: JobKind;
  dayIndex: DayIndex;
  completedStepIds: string[];
  workTokens: string[];
  heldPropId: string | null;
  completionCoins: number;
  earlyCoins: number;
} & (
  | { status: 'offered' | 'active' | 'readyToSettle'; receipt: null }
  | { status: 'settled' | 'abandoned'; receipt: Receipt }
);
export type InvitationStatus = 'offered' | 'accepted' | 'active' | 'completed' | 'declined' | 'missed';
export interface InvitationState {
  occurrenceId: string;
  hostId: ResidentId | 'player';
  guestIds: ResidentId[];
  placeId: PlaceId;
  dayIndex: DayIndex;
  from: Minute;
  to: Minute;
  status: InvitationStatus;
  completedEffectIds: string[];
}
export interface StockState {
  shopId: string;
  dayIndex: DayIndex;
  offers: { itemId: ItemId; price: number; remaining: number | null }[];
}
export type SceneOutcome =
  | { kind: 'completed' | 'skipped'; sceneId: string; completedCheckpointIds: string[] }
  | { kind: 'cancelled' | 'failed'; sceneId: string; completedCheckpointIds: string[]; reason: string };
export type Command =
  | { type: 'job.accept'; commandId: string; jobDefId: string }
  | { type: 'job.step'; commandId: string; runId: string; stepId: string; targetId: string }
  | { type: 'job.settle'; commandId: string; runId: string; finishEarly: boolean }
  | { type: 'shop.buy'; commandId: string; shopId: string; itemId: ItemId; destination: 'pockets' | 'home-storage' }
  | { type: 'furniture.place'; commandId: string; instance: PlacedInstance }
  | { type: 'invitation.reply'; commandId: string; occurrenceId: string; accept: boolean }
  | { type: 'clock.sleep'; commandId: string }
  | { type: 'scene.finish'; commandId: string; outcome: SceneOutcome };
export type CommandResult =
  | { ok: true; receipt: Receipt; durability: 'saved' | 'pending-retry' }
  | { ok: false; reason: 'invalid-state' | 'blocked' | 'missing-content' | 'no-capacity' | 'insufficient-coins'; messageKey: string };
export interface GameSettings {
  music: number;
  effects: number;
  ambience: number;
  textScale: number;
  instantText: boolean;
  reducedMotion: boolean;
  clockRate: 0.5 | 1;
  bindings: Record<string, string[]>;
}
export interface HarborState {
  clock: ClockState;
  world: { seed: number; mapId: string; layoutVersion: number };
  player: { name: string; position: PlacePosition; clothingId: ItemId };
  wallet: { coins: number };
  pockets: Array<Stack | null>;
  keyring: string[];
  housing: HousingState;
  placements: PlacedInstance[];
  plants: PlantState[];
  residents: Record<ResidentId, ResidentState>;
  relationships: Record<ResidentId, RelationshipState>;
  story: Record<string, 'eligible' | 'active' | 'completed' | 'recapped'>;
  facts: Record<string, boolean | number | string>;
  invitations: Record<string, InvitationState>;
  calendarOccurrences: Record<string, { occurred: boolean; attended: boolean; effects: string[] }>;
  projects: Record<string, { stage: number; contributionIds: string[] }>;
  jobs: Record<string, JobRun>;
  receipts: Record<string, Receipt>;
  stock: Record<string, StockState>;
  weather: { dayIndex: DayIndex; kind: 'clear' | 'rain' | 'fog' | 'snow'; intensity: number };
  collectedSpawnIds: string[];
  journal: { discoveredIds: string[]; readCorrespondenceIds: string[]; pinnedPlanId: string | null };
  settings: GameSettings;
}
export interface HarborSave {
  gameId: 'little-harbor';
  schemaVersion: 1;
  contentVersion: string;
  revision: number;
  savedAt: number; // wall time: metadata only
  state: HarborState;
}
export interface StorageGeneration { payload: HarborSave; checksum: string }
export interface SaveHead { generation: 'a' | 'b'; revision: number }
export interface SavePort {
  load(slotId: 1 | 2 | 3): Promise<{ save: HarborSave | null; recovered: boolean }>;
  write(slotId: 1 | 2 | 3, next: HarborSave): Promise<{ ok: true } | { ok: false; reason: string }>;
}
export interface CommandPort {
  execute(command: Command): Promise<CommandResult>;
  retrySave(): Promise<boolean>; // retries snapshot, not command effects
}

// Concrete authoring examples. IDs are proposed, not current runtime objects.
export const june: ResidentDef = {
  id: 'june', displayNameKey: 'resident.june.name', assetId: 'liliane', homePlaceId: 'june-home',
  relationships: ['omar', 'pip'],
  schedule: [
    { id: 'june-am', from: 480, to: 840, placeId: 'cafe', anchorId: 'cafe.counter.staff', activity: 'work', fallbackAnchorId: 'cafe.safe', weather: 'any' },
    { id: 'june-break', from: 840, to: 960, placeId: 'town', anchorId: 'breakwater.seat', activity: 'sit', fallbackAnchorId: 'cafe.window', weather: 'dry' },
  ],
};
export const cafeTrial: JobDef = {
  id: 'cafe-first-shift', kind: 'cafe', issuerId: 'june', placeId: 'cafe',
  hours: { from: 480, to: 1080 }, completionCoins: 60, earlyCoins: 20,
  earlyPayAfterStepIds: ['serve-ada'],
  steps: [
    { id: 'serve-ada', kind: 'serve', residentId: 'ada', anchorId: 'cafe.table1.seat1', trayId: 'tea-bread' },
    { id: 'return-ada', kind: 'return-cup', anchorId: 'cafe.cup-return' },
    { id: 'serve-basil', kind: 'serve', residentId: 'basil', anchorId: 'cafe.table2.seat1', trayId: 'coffee-bread' },
    { id: 'return-basil', kind: 'return-cup', anchorId: 'cafe.cup-return' },
    { id: 'serve-pip', kind: 'serve', residentId: 'pip', anchorId: 'cafe.table3.seat1', trayId: 'tea-toast' },
    { id: 'return-pip', kind: 'return-cup', anchorId: 'cafe.cup-return' },
  ],
};
export const sampleGiftResponse: DialogueRule = {
  id: 'basil-first-room-visit', participants: ['basil'],
  when: [{ kind: 'place', placeId: 'starter-room' }, { kind: 'fact', id: 'basil-invited', equals: true }],
  priority: 30, cooldownDays: 7,
  lineKeys: ['basil.room.first.1', 'basil.room.first.2'],
};
