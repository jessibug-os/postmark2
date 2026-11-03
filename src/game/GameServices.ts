import type { BootstrapContext } from '../content/BootstrapContext';
import { QuestSystem } from '../systems/QuestSystem';
import { MailSystem } from '../systems/MailSystem';
import { Calendar } from '../systems/Calendar';
import { TimeSystem } from '../systems/TimeSystem';
import { Friendship } from '../systems/Friendship';
import type { Inventory } from '../systems/Inventory';
import { OpeningPlayer } from '../cutscene/OpeningPlayer';
import type { DialogueBox } from '../interaction/DialogueBox';
import type { NameInput } from '../ui/NameInput';

/** Legacy progression is one explicit bundle, not default behavior for any pack. */
export interface KindlyForwardServices {
  readonly contentId: 'kindly-forward';
  readonly quests: QuestSystem;
  readonly mail: MailSystem;
  readonly calendar: Calendar;
  readonly time: TimeSystem;
  readonly friendship: Friendship;
  createOpening(container: HTMLElement, dialogue: DialogueBox, nameInput: NameInput): OpeningPlayer;
}

export function createGameServices(
  contentId: BootstrapContext['contentId'], inventory: Inventory,
): KindlyForwardServices {
  if (contentId !== 'kindly-forward') {
    throw new Error(`Game services for ${contentId} are not installed; refusing legacy progression fallback`);
  }
  return {
    contentId,
    quests: new QuestSystem(),
    // Bind explicitly: another inventory instance must never become this game's mail owner.
    mail: new MailSystem(inventory),
    calendar: new Calendar(),
    time: new TimeSystem(),
    friendship: new Friendship(),
    createOpening: (container, dialogue, nameInput) => new OpeningPlayer(container, dialogue, nameInput),
  };
}
