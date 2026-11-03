import type { JobDef } from '../types';
import { HARBOR_ECONOMY } from '../economy';
export const CAFE_ORDER_LINES: Readonly<Record<string, string>> = {
  'serve-ada': 'Tea and bread for Ada at table one. She likes her tea strong. Bring the used cup back to the return tray when you’re done.',
  'serve-basil': 'Coffee and bread for Basil at table two. He finally found a moment to sit down. Bring his used cup back here afterward.',
  'serve-pip': 'Tea and toast for Pip at table three. That’s our last order. Return the cup, then come see me for your pay.',
};
export const CAFE_SHIFT: JobDef = {
  id: 'cafe-shift', kind: 'cafe', issuerId: 'june', placeId: 'cafe',
  hours: { from: 480, to: 1080 }, completionCoins: HARBOR_ECONOMY.wages.cafe,
  earlyCoins: 20, earlyPayAfterStepIds: ['serve-ada'],
  steps: [
    { id: 'serve-ada', kind: 'serve', residentId: 'ada', anchorId: 'cafe.table1.seat1', trayId: 'tea-bread' },
    { id: 'return-ada', kind: 'return-cup', anchorId: 'cafe.cup-return' },
    { id: 'serve-basil', kind: 'serve', residentId: 'basil', anchorId: 'cafe.table2.seat1', trayId: 'coffee-bread' },
    { id: 'return-basil', kind: 'return-cup', anchorId: 'cafe.cup-return' },
    { id: 'serve-pip', kind: 'serve', residentId: 'pip', anchorId: 'cafe.table3.seat1', trayId: 'tea-toast' },
    { id: 'return-pip', kind: 'return-cup', anchorId: 'cafe.cup-return' },
  ],
};
