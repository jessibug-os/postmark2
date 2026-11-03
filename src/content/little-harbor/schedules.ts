import type { ScheduleBlock } from './types';
const block = (id: string, from: number, to: number, placeId: string, anchorId: string,
  activity: ScheduleBlock['activity'], fallbackAnchorId: string, weather: ScheduleBlock['weather'] = 'any'): ScheduleBlock =>
  ({ id, from: from * 60, to: to * 60, placeId, anchorId, activity, fallbackAnchorId, weather });
export const HARBOR_SCHEDULES: Readonly<Record<string, readonly ScheduleBlock[]>> = {
  basil: [
    block('basil-bakery-morning', 7, 12, 'bakery', 'bakery.counter', 'work', 'basil-home.safe'),
    block('basil-errands', 12, 14, 'town', 'market.errands', 'walk', 'bakery.counter'),
    block('basil-bakery-afternoon', 14, 18, 'bakery', 'bakery.counter', 'work', 'basil-home.safe'),
    block('basil-evening', 18, 23, 'basil-home', 'basil-home.safe', 'eat', 'basil-home.safe'),
  ],
  june: [
    block('june-cafe-morning', 8, 14, 'cafe', 'cafe.counter.staff', 'work', 'june-home.safe'),
    block('june-breakwater', 14, 16, 'town', 'breakwater.seat', 'sit', 'cafe.window', 'dry'),
    block('june-cafe-afternoon', 16, 19, 'cafe', 'cafe.counter.staff', 'work', 'june-home.safe'),
    block('june-rehearsal', 19, 21, 'bathhouse', 'bathhouse.rehearsal', 'social', 'june-home.safe'),
  ],
  ada: [
    block('ada-dock', 7, 12, 'town', 'dock.work', 'work', 'ada-home.safe'),
    block('ada-lunch', 12, 15, 'ada-home', 'ada-home.safe', 'eat', 'ada-home.safe'),
    block('ada-yard', 15, 18, 'town', 'repair-yard.work', 'work', 'ada-home.safe'),
    block('ada-bathhouse', 18, 20, 'bathhouse', 'bathhouse.cards', 'social', 'ada-home.safe'),
  ],
  pip: [
    block('pip-morning', 7, 10, 'pip-room', 'pip-room.safe', 'eat', 'pip-room.safe'),
    block('pip-market', 10, 13, 'town', 'market.errands', 'walk', 'pip-room.safe'),
    block('pip-odd-job', 13, 17, 'town', 'dock.errands', 'work', 'pip-room.safe'),
    block('pip-cafe', 17, 20, 'cafe', 'cafe.pip-seat', 'social', 'pip-room.safe'),
  ],
};
