import { refreshHarborWeather } from './HarborWeather';
import type { HarborState } from '../content/little-harbor/types';
import { sleepUntilMorning, type DayRolloverSteps, type SleepOutcome } from './DayRollover';
import { GameCommands } from './GameCommands';
import { settleJobDraft } from './JobSystem';
import { assessHousingContribution } from './HousingSystem';
import { refreshHarborStock } from './ShopSystem';
import { SimClock } from './SimClock';

/** Installed daily domains; remaining hooks are required from their owners. */
export function sleepHarborDay(commands: GameCommands<HarborState>, clock: SimClock,
  expectedDay: number,
  remaining: Pick<DayRolloverSteps<HarborState>, 'offers' | 'plants' | 'appointments' | 'residents'>,
): SleepOutcome {
  return sleepUntilMorning(commands, clock, expectedDay, {
    ...remaining,
    beforeDay(state, receipt) {
      for (const run of Object.values(state.jobs)) {
        if ((run.status === 'active' || run.status === 'readyToSettle') && run.dayIndex <= expectedDay) {
          settleJobDraft(state, run.runId, receipt, true);
        }
      }
    },
    stock: refreshHarborStock,
    rent: assessHousingContribution,
    weather: refreshHarborWeather,
  });
}
