export interface Deck {
  x: number;
  z: number;
  yaw: number;
  halfX: number;
  halfZ: number;
  top: number;
  open: boolean;
  active: boolean;
}

export type Footing = 'ground' | 'deck' | 'step';

const decks: Deck[] = [];

export function addDeck(deck: Omit<Deck, 'active'>): Deck {
  const added = { ...deck, active: true };
  decks.push(added);
  return added;
}

function deckAt(x: number, z: number): Deck | null {
  let best: Deck | null = null;
  for (const deck of decks) {
    if (!deck.active) continue;
    const dx = x - deck.x;
    const dz = z - deck.z;
    const cos = Math.cos(deck.yaw);
    const sin = Math.sin(deck.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) > deck.halfX || Math.abs(lz) > deck.halfZ) continue;
    if (!best || deck.top > best.top) best = deck;
  }
  return best;
}

export function overDeck(x: number, z: number): boolean {
  return deckAt(x, z) !== null;
}

export function deckTopAt(x: number, z: number): number | null {
  return deckAt(x, z)?.top ?? null;
}

export function footingAt(x: number, z: number): Footing {
  const deck = deckAt(x, z);
  return !deck ? 'ground' : deck.open ? 'step' : 'deck';
}

export function canCross(from: Footing, to: Footing): boolean {
  return from === to || from === 'step' || to === 'step';
}

export function crossable(ax: number, az: number, bx: number, bz: number): boolean {
  const samples = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
  let current = footingAt(ax, az);
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const next = footingAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (!canCross(current, next)) return false;
    current = next;
  }
  return true;
}
