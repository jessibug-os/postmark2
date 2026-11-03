/** Initial tuning; model references are resolved separately by presentation. */
export interface HarborItem {
  id: string;
  label: string;
  category: 'furniture' | 'food' | 'clothing';
  buyPrice: number;
  stackLimit: number;
}
export const HARBOR_ITEMS: readonly HarborItem[] = Object.freeze([
  { id: 'chair', label: 'Wooden chair', category: 'furniture', buyPrice: 35, stackLimit: 1 },
  { id: 'lamp', label: 'Reading lamp', category: 'furniture', buyPrice: 45, stackLimit: 1 },
  { id: 'table', label: 'Small table', category: 'furniture', buyPrice: 90, stackLimit: 1 },
  { id: 'shelf', label: 'Wall shelf', category: 'furniture', buyPrice: 70, stackLimit: 1 },
  { id: 'workbench', label: 'Home workbench', category: 'furniture', buyPrice: 180, stackLimit: 1 },
  { id: 'bed', label: 'Simple bed', category: 'furniture', buyPrice: 120, stackLimit: 1 },
  { id: 'trunk', label: 'Storage trunk', category: 'furniture', buyPrice: 70, stackLimit: 1 },
  { id: 'planter', label: 'Window planter', category: 'furniture', buyPrice: 25, stackLimit: 1 },
  { id: 'bread', label: 'Fresh bread', category: 'food', buyPrice: 5, stackLimit: 9 },
  { id: 'arrival-coat', label: 'Everyday coat', category: 'clothing', buyPrice: 40, stackLimit: 1 },
] satisfies HarborItem[]);
const byId = new Map(HARBOR_ITEMS.map(item => [item.id, Object.freeze(item)]));
export const harborItem = (id: string): Readonly<HarborItem> | undefined => byId.get(id);
