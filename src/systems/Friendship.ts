import { bus } from '../core/events';
import { ACTIVE_TASTES } from '../content/activePack';

/**
 * Hearts. Friendship grows from daily talks, gifts matched to each robot's
 * tastes, and little favor errands. Tiers gate the heart-moment cutscenes;
 * the top tier earns a keepsake and permanently warmer dialogue.
 *
 * Points → hearts: one heart per 50 points, capped at 5 (250).
 * Heart scenes trigger at 1 ♥ (scene 0), 3 ♥ (scene 1), 5 ♥ (scene 2).
 */

export interface FriendState {
  points: number;
  /** toDateString() of the last daily-talk bonus. */
  lastTalkDay: string;
  lastGiftDay: string;
  /** Indices of heart scenes already played (0,1,2). */
  seenScenes: number[];
  keepsakeGiven: boolean;
  /** Item id the villager currently wants (favor errand), if any. */
  favorItem: string | null;
}

export const MAX_POINTS = 250;
export const HEART_SIZE = 50;
export const SCENE_AT_HEARTS = [1, 3, 5];

export interface Tastes {
  loved: string[];
  liked: string[];
  disliked: string[];
}

/** Per-robot gift tastes. Categories prefix-match ("fish:*"). */
export const TASTES: Record<string, Tastes> = ACTIVE_TASTES;

export type GiftVerdict = 'loved' | 'liked' | 'disliked' | 'neutral';

export function giftVerdict(npcId: string, itemId: string, category: string): GiftVerdict {
  const t = TASTES[npcId];
  if (!t) return 'neutral';
  const matches = (list: string[]): boolean =>
    list.includes(itemId) || list.includes(`${category}:*`);
  if (matches(t.loved)) return 'loved';
  if (matches(t.liked)) return 'liked';
  if (matches(t.disliked)) return 'disliked';
  return 'neutral';
}

const GIFT_POINTS: Record<GiftVerdict, number> = {
  loved: 25,
  liked: 12,
  neutral: 6,
  disliked: 2,
};

export class Friendship {
  private states = new Map<string, FriendState>();

  state(npcId: string): FriendState {
    let s = this.states.get(npcId);
    if (!s) {
      s = {
        points: 0,
        lastTalkDay: '',
        lastGiftDay: '',
        seenScenes: [],
        keepsakeGiven: false,
        favorItem: null,
      };
      this.states.set(npcId, s);
    }
    return s;
  }

  hearts(npcId: string): number {
    return Math.min(5, Math.floor(this.state(npcId).points / HEART_SIZE));
  }

  points(npcId: string): number {
    return this.state(npcId).points;
  }

  private add(npcId: string, delta: number): void {
    const s = this.state(npcId);
    const before = this.hearts(npcId);
    s.points = Math.max(0, Math.min(MAX_POINTS, s.points + delta));
    const after = this.hearts(npcId);
    if (after > before) bus.emit('friendship:heart', { npcId, hearts: after });
  }

  /** First conversation each real day warms the friendship. */
  onTalk(npcId: string): boolean {
    const s = this.state(npcId);
    const today = new Date().toDateString();
    if (s.lastTalkDay === today) return false;
    s.lastTalkDay = today;
    this.add(npcId, 8);
    return true;
  }

  /** One counted gift per day; returns the verdict and whether it counted. */
  onGift(npcId: string, itemId: string, category: string): { verdict: GiftVerdict; counted: boolean; favor: boolean } {
    const s = this.state(npcId);
    const verdict = giftVerdict(npcId, itemId, category);
    const favor = s.favorItem === itemId;
    const today = new Date().toDateString();
    const counted = s.lastGiftDay !== today || favor;
    if (counted) {
      if (!favor) s.lastGiftDay = today;
      this.add(npcId, GIFT_POINTS[verdict] + (favor ? 20 : 0));
    }
    if (favor) s.favorItem = null;
    return { verdict, counted, favor };
  }

  /** Next unseen heart scene whose tier is reached, if any. */
  pendingScene(npcId: string): number | null {
    const s = this.state(npcId);
    const h = this.hearts(npcId);
    for (let i = 0; i < SCENE_AT_HEARTS.length; i++) {
      if (h >= SCENE_AT_HEARTS[i] && !s.seenScenes.includes(i)) return i;
    }
    return null;
  }

  markSceneSeen(npcId: string, index: number): void {
    const s = this.state(npcId);
    if (!s.seenScenes.includes(index)) s.seenScenes.push(index);
  }

  serialize(): Record<string, FriendState> {
    const out: Record<string, FriendState> = {};
    for (const [id, s] of this.states) out[id] = s;
    return out;
  }

  restore(data: Record<string, FriendState> | undefined): void {
    this.states.clear();
    if (!data) return;
    for (const [id, s] of Object.entries(data)) {
      this.states.set(id, {
        points: s.points ?? 0,
        lastTalkDay: s.lastTalkDay ?? '',
        lastGiftDay: s.lastGiftDay ?? '',
        seenScenes: s.seenScenes ?? [],
        keepsakeGiven: s.keepsakeGiven ?? false,
        favorItem: s.favorItem ?? null,
      });
    }
  }
}
