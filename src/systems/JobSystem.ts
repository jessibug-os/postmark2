import type { HarborState, JobRun } from '../content/little-harbor/types';
import { harborJob } from '../content/little-harbor/jobs';
import { GameCommands, type CommandOutcome, type CommandReceipt } from './GameCommands';

/** Job props live only in the run. Controller reservations/presentation are separate. */
export class JobSystem {
  constructor(private readonly commands: GameCommands<HarborState>) {}

  accept(commandId: string, jobDefId: string): CommandOutcome {
    return this.commands.execute(commandId, `job:accept:${jobDefId}`, state => {
      const def = harborJob(jobDefId);
      if (!def) throw new Error('Unknown job');
      if (state.player.position.placeId !== def.placeId) throw new Error('Visit the job location to accept');
      if (state.clock.minuteOfDay < def.hours.from || state.clock.minuteOfDay >= def.hours.to) throw new Error('This job is closed');
      if (Object.values(state.jobs).some(run => run.status === 'active' || run.status === 'readyToSettle')) {
        throw new Error('Finish the current job first');
      }
      const runId = `${def.kind}:day:${state.clock.dayIndex}`;
      if (Object.hasOwn(state.jobs, runId)) throw new Error('This paid job has already been taken today');
      state.jobs[runId] = { runId, jobDefId, kind: def.kind, dayIndex: state.clock.dayIndex,
        completedStepIds: [], workTokens: [], heldPropId: null,
        completionCoins: def.completionCoins, earlyCoins: def.earlyCoins, status: 'active', receipt: null };
    });
  }

  pickTray(commandId: string, runId: string, trayId: string): CommandOutcome {
    return this.commands.execute(commandId, `job:tray:${runId}:${trayId}`, state => {
      const run = this.activeRun(state, runId);
      const step = harborJob(run.jobDefId)!.steps[run.completedStepIds.length];
      if (!step || step.kind !== 'serve') throw new Error('Return the used cup before taking another tray');
      if (trayId !== step.trayId) throw new Error(`This order needs ${step.trayId}`);
      run.heldPropId = trayId;
      run.workTokens = [trayId];
    });
  }

  completeStep(commandId: string, runId: string, stepId: string, targetId: string): CommandOutcome {
    return this.commands.execute(commandId, `job:step:${runId}:${stepId}:${targetId}`, state => {
      const run = this.activeRun(state, runId);
      const step = harborJob(run.jobDefId)!.steps[run.completedStepIds.length];
      if (!step || step.id !== stepId) throw new Error('This is not the current order step');
      if (step.kind === 'serve') {
        if (targetId !== step.anchorId || run.heldPropId !== step.trayId) throw new Error('Match the tray to the assigned seat');
        run.heldPropId = `used-cup:${step.id}`;
        run.workTokens = [run.heldPropId];
      } else if (step.kind === 'return-cup') {
        if (targetId !== step.anchorId || !run.heldPropId?.startsWith('used-cup:')) throw new Error('Return the used cup here');
        run.heldPropId = null;
        run.workTokens = [];
      } else throw new Error('This job interaction is not installed');
      run.completedStepIds.push(step.id);
      if (run.completedStepIds.length === harborJob(run.jobDefId)!.steps.length) run.status = 'readyToSettle';
    });
  }

  settle(runId: string, finishEarly = false): CommandOutcome {
    const prior = this.commands.snapshot.state.jobs[runId];
    if (prior && (prior.status === 'settled' || prior.status === 'abandoned')) {
      return { ok: true, duplicate: true, receipt: { ...prior.receipt }, durability: this.commands.retrySave() };
    }
    // A run has exactly one settlement identity, including repeated UI confirmations.
    return this.commands.execute(`job:settle:${runId}`, 'job:settle', (state, receipt) => {
      settleJobDraft(state, runId, receipt, finishEarly);
    });
  }

  private activeRun(state: HarborState, runId: string): JobRun {
    const run = state.jobs[runId];
    if (!run || run.status !== 'active') throw new Error('This job is not active');
    const def = harborJob(run.jobDefId);
    if (!def || state.player.position.placeId !== def.placeId || state.clock.dayIndex !== run.dayIndex) {
      throw new Error('Continue this shift at its location on the same day');
    }
    return run;
  }
}

/** Shared settlement reducer used by explicit finish and the enclosing sleep command. */
export function settleJobDraft(state: HarborState, runId: string,
  receipt: Readonly<CommandReceipt>, finishEarly: boolean): void {
      const run = state.jobs[runId];
      if (!run || (run.status !== 'active' && run.status !== 'readyToSettle')) throw new Error('This job cannot be settled');
      if (!finishEarly && run.status !== 'readyToSettle') throw new Error('Complete the shift or choose finish early');
      const def = harborJob(run.jobDefId);
      if (!def) throw new Error('Missing job definition');
      const complete = run.status === 'readyToSettle';
      const coins = complete ? run.completionCoins :
        def.earlyPayAfterStepIds.every(id => run.completedStepIds.includes(id)) ? run.earlyCoins : 0;
      state.wallet.coins += coins;
      const settled: JobRun = { ...run, status: complete ? 'settled' : 'abandoned',
        heldPropId: null, workTokens: [], receipt: { ...receipt, coinsDelta: coins, appliedEffectIds: [`wage:${runId}`] } };
      state.jobs[runId] = settled;
}
