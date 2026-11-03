import type { HarborState } from '../content/little-harbor/types';
import { HARBOR_ECONOMY } from '../content/little-harbor/economy';
import { GameCommands, type CommandOutcome } from './GameCommands';

/** Daily rollover hook. Assess once per week; unpaid contributions never compound. */
export function assessHousingContribution(state: HarborState, dayIndex: number): void {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0) throw new Error('Invalid housing assessment day');
  const interval = HARBOR_ECONOMY.contributionInterval;
  if (dayIndex < interval) return;
  const boundary = dayIndex - dayIndex % interval;
  const payment = state.housing.payment;
  if (boundary <= payment.lastAssessedDay) return;
  payment.lastAssessedDay = boundary;
  if (payment.outstanding === null) {
    payment.outstanding = { dueDay: boundary, coins: HARBOR_ECONOMY.contribution };
  }
}

export class HousingSystem {
  constructor(private readonly commands: GameCommands<HarborState>) {}

  /** The UI confirms a particular obligation, not whichever debt exists later. */
  payContribution(commandId: string, dueDay: number): CommandOutcome {
    return this.commands.execute(commandId, `housing:pay:${dueDay}`, state => {
      const outstanding = state.housing.payment.outstanding;
      if (!outstanding || outstanding.dueDay !== dueDay) throw new Error('This contribution is no longer due');
      if (state.wallet.coins < outstanding.coins) throw new Error('insufficient-coins');
      state.wallet.coins -= outstanding.coins;
      state.housing.payment.outstanding = null;
    });
  }
}
