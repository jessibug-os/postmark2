import type { ResidentDialogue } from '../../systems/DialogueSelector';
import { EXCHANGES } from './locales/en';
const ordinary: Record<string, string[]> = {
  basil: ['flour', 'mornings', 'window', 'recipe', 'errands', 'quiet'],
  june: ['tea', 'music', 'cups', 'break', 'regulars', 'chalk'],
  ada: ['tools', 'ferry', 'cards', 'repairs', 'weather', 'lunch'],
  pip: ['map', 'jobs', 'room', 'market', 'ferry', 'tomorrow'],
};
const places: Record<string, [string, string][]> = {
  basil: [['place-work', 'bakery'], ['place-home', 'starter-room']],
  june: [['place-work', 'cafe'], ['place-outside', 'town']],
  ada: [['place-work', 'town'], ['place-bath', 'bathhouse']],
  pip: [['place-room', 'pip-room'], ['place-cafe', 'cafe']],
};
function rule(resident: string, suffix: string, category: ResidentDialogue['category'], when: ResidentDialogue['when'] = [], once = false): ResidentDialogue {
  const id = `${resident}.${suffix}` as keyof typeof EXCHANGES;
  return { id, participants: [resident], category, when, once, priority: 0, cooldownDays: 1,
    lineKeys: EXCHANGES[id].map((_, i) => `${id}.${i + 1}`) };
}
export const HARBOR_DIALOGUE: readonly ResidentDialogue[] = Object.keys(ordinary).flatMap(resident => [
  rule(resident, 'intro', 'story', [], true),
  ...ordinary[resident].map(id => rule(resident, id, 'ordinary')),
  ...places[resident].map(([id, placeId]) => rule(resident, id, 'place', [{ kind: 'place', placeId }])),
  rule(resident, 'work', 'response', [{ kind: 'fact', id: `response:${resident}:work`, equals: true }]),
  rule(resident, 'visit', 'response', [{ kind: 'fact', id: `response:${resident}:visit`, equals: true }]),
  rule(resident, 'busy', 'response', [{ kind: 'fact', id: `resident:${resident}:busy`, equals: true }]),
]);
export const HARBOR_OVERHEARD = [
  { id: 'overheard.basil-ada', participants: ['basil', 'ada'], lineKeys: [1, 2, 3].map(i => `overheard.basil-ada.${i}`) },
  { id: 'overheard.june-pip', participants: ['june', 'pip'], lineKeys: [1, 2, 3].map(i => `overheard.june-pip.${i}`) },
] as const;
