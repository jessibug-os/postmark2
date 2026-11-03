import type { PlacePosition, Reservation } from '../content/little-harbor/types';
import { CAFE_ANCHORS } from '../content/little-harbor/cafeRoom';
import { CAFE_SHIFT, CAFE_ORDER_LINES } from '../content/little-harbor/jobs/cafe';
import type { InteractionCandidate } from '../interaction/InteractionResolver';
import type { CommandOutcome } from '../systems/GameCommands';
import type { openHarborServices } from './HarborServices';

type Services = Pick<ReturnType<typeof openHarborServices>, 'commands' | 'jobs' | 'time'>;
/** Reconstructs the shift from canonical state, including after reload. Positions
 * and candidate anchors use place-local corner coordinates. The host converts
 * them to world coordinates at its rendering/interaction boundary. */
export class HarborCafeController {
  private outcome: CommandOutcome | null = null;
  constructor(private readonly services: Services, private readonly position: () => PlacePosition,
    private readonly commandId: () => string) {}
  get lastOutcome() { return structuredClone(this.outcome); }
  private get run() {
    return Object.values(this.services.commands.snapshot.state.jobs).find(run =>
      run.jobDefId === CAFE_SHIFT.id && (run.status === 'active' || run.status === 'readyToSettle'));
  }
  get heldPropId(): string | null { return this.run?.heldPropId ?? null; }
  get journal(): { summary: string; orders: { id: string; text: string; status: string }[] } {
    const run = this.run ?? this.services.commands.snapshot.state.jobs[`cafe:day:${this.services.time.state.dayIndex}`];
    if (!run) return { summary: this.instruction, orders: [] };
    return {
      summary: run.status === 'settled' || run.status === 'abandoned'
        ? `Shift finished. Earned ${run.receipt?.coinsDelta ?? 0} coins.` : this.instruction,
      orders: CAFE_SHIFT.steps.flatMap((step, index) => {
        if (step.kind !== 'serve') return [];
        const returned = CAFE_SHIFT.steps[index + 1];
        const served = run.completedStepIds.includes(step.id);
        const complete = returned && run.completedStepIds.includes(returned.id);
        return [{ id: step.id, text: CAFE_ORDER_LINES[step.id], status: complete ? 'Complete'
          : run.status === 'abandoned' ? 'Ended early' : served ? 'Return the used cup'
          : index === run.completedStepIds.length ? 'Current order' : 'Upcoming' }];
      }),
    };
  }
  get earlyFinishMessage(): string | null {
    const run = this.run;
    if (!run || run.status !== 'active') return null;
    const coins = CAFE_SHIFT.earlyPayAfterStepIds.every(id => run.completedStepIds.includes(id)) ? run.earlyCoins : 0;
    return `You will receive ${coins} coins. This ends today’s shift and returns any work props. You can take another paid café shift tomorrow.`;
  }
  get orderMessage(): string | null {
    const run = this.run;
    if (!run || run.status !== 'active' || run.heldPropId) return null;
    const step = CAFE_SHIFT.steps[run.completedStepIds.length];
    if (step.kind !== 'serve') return null;
    return CAFE_ORDER_LINES[step.id] ?? null;
  }
  get reservations(): Reservation[] {
    const run = this.run;
    if (!run || run.status !== 'active') return [];
    const index = run.completedStepIds.length;
    const current = CAFE_SHIFT.steps[index];
    const customer = current?.kind === 'serve' ? current : CAFE_SHIFT.steps[index - 1];
    return customer?.kind === 'serve'
      ? [{ ownerId: customer.residentId, anchorId: customer.anchorId, priority: 'job' }] : [];
  }
  get instruction(): string {
    const run = this.run;
    if (!run) {
      if (this.services.commands.snapshot.state.jobs[`cafe:day:${this.services.time.state.dayIndex}`])
        return 'Your shift is finished for today. Come back tomorrow.';
      return 'Ask June at the counter about a café shift.';
    }
    if (run.status === 'readyToSettle') return `Return to June for your ${run.completionCoins}-coin pay.`;
    const step = CAFE_SHIFT.steps[run.completedStepIds.length];
    if (step.kind === 'return-cup') return 'Take the used cup to the return tray.';
    if (step.kind === 'serve') return run.heldPropId
      ? `Serve ${step.residentId} at the assigned table.` : `Collect ${step.trayId.replaceAll('-', ' and ')} from the counter.`;
    return 'Return to June.';
  }
  candidates(): InteractionCandidate[] {
    const position = this.position();
    const state = this.services.commands.snapshot.state;
    if (position.placeId !== 'cafe' || state.player.position.placeId !== 'cafe' || this.services.time.paused) return [];
    const run = this.run;
    const signature = () => {
      const r = this.run;
      return r ? `${r.runId}:${r.status}:${r.completedStepIds.length}:${r.heldPropId}` : 'no-run';
    };
    const expected = signature();
    const make = (anchorId: string, label: string, act: () => CommandOutcome): InteractionCandidate => {
      const anchor = CAFE_ANCHORS.find(a => a.id === anchorId)!;
      const radius = anchor.kind === 'seat' ? 1.1 : 0.65;
      return { id: `cafe:${expected}:${anchorId}`, ownerId: run?.runId ?? 'june',
        anchor: { x: anchor.transform.x, z: anchor.transform.z }, radius, kind: 'job', priority: 0, promptKey: label,
        command: () => {
          const p = this.position();
          const distance = Math.hypot(p.x - anchor.transform.x, p.z - anchor.transform.z);
          if (this.services.time.paused || p.placeId !== 'cafe' ||
              this.services.commands.snapshot.state.player.position.placeId !== 'cafe' ||
              !Number.isFinite(distance) || distance > radius * 1.15 || signature() !== expected) return;
          this.outcome = act();
        } };
    };
    if (!run) {
      if (state.jobs[`cafe:day:${this.services.time.state.dayIndex}`] ||
          this.services.time.state.minuteOfDay < CAFE_SHIFT.hours.from ||
          this.services.time.state.minuteOfDay >= CAFE_SHIFT.hours.to) return [];
      return [make('cafe.counter', `Start a café shift · ${CAFE_SHIFT.completionCoins} coins`, () => this.services.jobs.accept(this.commandId(), CAFE_SHIFT.id))];
    }
    if (run.dayIndex !== this.services.time.state.dayIndex) return [];
    if (run.status === 'readyToSettle') return [make('cafe.counter', `Collect ${run.completionCoins} coins`, () => this.services.jobs.settle(run.runId))];
    const coins = CAFE_SHIFT.earlyPayAfterStepIds.every(id => run.completedStepIds.includes(id)) ? run.earlyCoins : 0;
    const candidates = [make('cafe.counter', `Finish early · ${coins} coins`, () => this.services.jobs.settle(run.runId, true))];
    const step = CAFE_SHIFT.steps[run.completedStepIds.length];
    if (step.kind === 'serve') {
      if (!run.heldPropId) candidates.push(make('cafe.tray-pickup', `Collect ${step.trayId.replaceAll('-', ' and ')}`,
        () => this.services.jobs.pickTray(this.commandId(), run.runId, step.trayId)));
      else candidates.push(make(step.anchorId, `Serve ${step.residentId}`,
        () => this.services.jobs.completeStep(this.commandId(), run.runId, step.id, step.anchorId)));
    } else if (step.kind === 'return-cup') candidates.push(make(step.anchorId, 'Return used cup',
      () => this.services.jobs.completeStep(this.commandId(), run.runId, step.id, step.anchorId)));
    return candidates;
  }
}
