import { GameCommands, type CommandOutcome, type ReceiptedState, type CommandReceipt } from './GameCommands';
import { clockBoundaries, MORNING_MINUTE, SimClock, type ClockBoundary, type ClockState } from './SimClock';

export interface ClockedState extends ReceiptedState { clock: ClockState }
export interface DayRolloverSteps<State> {
  beforeDay?(state: State, receipt: Readonly<CommandReceipt>): void;
  offers(state: State, nextDay: number): void;
  stock(state: State, nextDay: number): void;
  plants(state: State, nextDay: number): void;
  rent(state: State, nextDay: number): void;
  weather(state: State, nextDay: number): void;
  appointments(state: State, nextDay: number): void;
  residents(state: State, nextDay: number): void;
}
export type SleepOutcome = CommandOutcome & { boundaries?: ClockBoundary[] };

/**
 * Sleep is an explicitly confirmed command. Domain hooks mutate only the draft,
 * in the design's fixed order. Throwing rejects the entire rollover. Presentation
 * consumes boundaries only after this returns a successful, nonduplicate result.
 */
export function sleepUntilMorning<State extends ClockedState>(
  commands: GameCommands<State>, clock: SimClock, expectedDay: number,
  steps: DayRolloverSteps<State>,
): SleepOutcome {
  if (!Number.isSafeInteger(expectedDay) || expectedDay < 0 || expectedDay >= Number.MAX_SAFE_INTEGER) {
    return { ok: false, reason: 'Invalid sleep day' };
  }
  const commandId = `sleep:day:${expectedDay}`;
  const current = clock.state;
  let boundaries: ClockBoundary[] = [];
  const result = commands.execute(commandId, 'day:rollover', (draft, receipt) => {
    if (current.dayIndex !== expectedDay || draft.clock.dayIndex !== expectedDay) {
      throw new Error('This sleep confirmation belongs to a different day');
    }
    // Sleep may be confirmed from a menu, but not during another active task.
    if (clock.pauseReasons.some(reason => reason !== 'menu' && reason !== 'manual')) {
      throw new Error('Finish the current activity before sleeping');
    }
    const next = { dayIndex: expectedDay + 1, minuteOfDay: MORNING_MINUTE };
    boundaries = clockBoundaries(current, next);
    steps.beforeDay?.(draft, receipt);
    draft.clock = next;
    steps.offers(draft, next.dayIndex);
    steps.stock(draft, next.dayIndex);
    steps.plants(draft, next.dayIndex);
    steps.rent(draft, next.dayIndex);
    steps.weather(draft, next.dayIndex);
    steps.appointments(draft, next.dayIndex);
    steps.residents(draft, next.dayIndex);
  });
  if (result.ok && !result.duplicate) {
    // A failed storage write still commits the complete morning in memory.
    clock.restore(commands.snapshot.state.clock);
    return { ...result, boundaries };
  }
  return result;
}
