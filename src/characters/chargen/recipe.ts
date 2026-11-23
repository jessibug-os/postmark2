export const SLOTS = ['hair', 'hat', 'top', 'bottom', 'shoes', 'bag', 'apron'] as const;
export type Slot = (typeof SLOTS)[number];

export const OPTIONAL_SLOTS: readonly Slot[] = ['hair', 'hat', 'bag', 'apron'];

export const CHANNELS = ['skin', 'hair', 'top', 'bottom', 'legs', 'shoes', 'hat', 'accent'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface FaceRecipe {
  iris: string;
  brow: string;
  blush: string;
  squint: number;
  lashes: boolean;
  freckles: boolean;
  age: boolean;
  glasses: boolean;
  moustache: boolean;
}

export interface CharacterRecipe {
  kit: 1;
  height: number;
  parts: Record<Slot, string | null>;
  colors: Partial<Record<Channel, string>>;
  face: FaceRecipe;
}

export const DEFAULT_SKIN = '#d6a86b';

export const DEFAULT_RECIPE: CharacterRecipe = {
  kit: 1,
  height: 1,
  parts: {
    hair: 'long',
    hat: 'headband',
    top: 'long-coat',
    bottom: 'skirt',
    shoes: 'tall-boots',
    bag: 'satchel',
    apron: null,
  },
  colors: {},
  face: {
    iris: '#0e131c',
    brow: '#2e241a',
    blush: '#e06642',
    squint: 1,
    lashes: true,
    freckles: false,
    age: false,
    glasses: false,
    moustache: false,
  },
};

export function normalizeRecipe(input: unknown): CharacterRecipe {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<CharacterRecipe>;
  return {
    kit: 1,
    height: typeof raw.height === 'number' ? raw.height : DEFAULT_RECIPE.height,
    parts: { ...DEFAULT_RECIPE.parts, ...(raw.parts ?? {}) },
    colors: { ...(raw.colors ?? {}) },
    face: { ...DEFAULT_RECIPE.face, ...(raw.face ?? {}) },
  };
}

export function formatRecipe(recipe: CharacterRecipe): string {
  return JSON.stringify(recipe, null, 2) + '\n';
}
