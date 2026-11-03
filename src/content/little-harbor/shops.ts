export interface HarborShop {
  id: string;
  essentials: readonly string[];
  rotation: readonly string[];
  rotatingOffers: number;
}
export const HARBOR_SHOPS: readonly HarborShop[] = [
  { id: 'secondhand', essentials: ['chair', 'lamp', 'table', 'arrival-coat'],
    rotation: ['shelf', 'workbench', 'bed', 'trunk', 'planter'], rotatingOffers: 2 },
  { id: 'bakery', essentials: ['bread'], rotation: [], rotatingOffers: 0 },
];
