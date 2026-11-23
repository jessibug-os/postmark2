import { useState, type ReactNode } from 'react';
import { CharacterPreview } from './CharacterPreview';
import { BROW_STYLES, EYE_STYLES, MOUTH_STYLES, NOSE_STYLES, faceSpecFrom, type Expression } from './face/types';
import { BODIES, OPTIONAL_SLOTS_V2, type SlotV2 } from './contract';
import { ITEMS, itemById } from './items';
import { kit } from './kit';
import { HAIR_SWATCHES, IRIS_SWATCHES, SKIN_SWATCHES, randomRecipe } from './options';
import type { FaceRecipe } from './recipe';
import type { CharacterRecipeV2 } from './recipeV2';

const TABS = ['Body', 'Face', 'Hair', 'Clothes'] as const;
type Tab = (typeof TABS)[number];

const CLOTHES: Array<{ slot: SlotV2; label: string }> = [
  { slot: 'hat', label: 'Hat' },
  { slot: 'top', label: 'Top' },
  { slot: 'bottom', label: 'Bottom' },
  { slot: 'shoes', label: 'Shoes' },
  { slot: 'outer', label: 'Apron' },
  { slot: 'bag', label: 'Bag' },
];

const FACE_TOGGLES: Array<{ key: keyof FaceRecipe; label: string }> = [
  { key: 'lashes', label: 'Lashes' },
  { key: 'freckles', label: 'Freckles' },
  { key: 'age', label: 'Laugh lines' },
  { key: 'glasses', label: 'Glasses' },
  { key: 'moustache', label: 'Moustache' },
];

const FACE_STYLES = [
  { key: 'eyeStyle', label: 'Eye style', options: EYE_STYLES },
  { key: 'browStyle', label: 'Brow style', options: BROW_STYLES },
  { key: 'mouthStyle', label: 'Mouth', options: MOUTH_STYLES },
  { key: 'nose', label: 'Nose', options: NOSE_STYLES },
] as const;

const EXPRESSIONS: Expression[] = ['idle', 'happy', 'surprised', 'asleep'];

const label = (id: string): string => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (hex: string) => void }) {
  return (
    <div className="cc-swatches">
      {colors.map((hex) => (
        <button key={hex} className="cc-swatch" style={{ background: hex }} aria-pressed={value === hex} title={hex} onClick={() => onPick(hex)} />
      ))}
    </div>
  );
}

function Choices({ options, value, optional, onPick }: { options: Array<{ id: string; name: string }>; value: string | null; optional: boolean; onPick: (id: string | null) => void }) {
  return (
    <div className="cc-choices">
      {optional && <button aria-pressed={value === null} onClick={() => onPick(null)}>None</button>}
      {options.map(({ id, name }) => (
        <button key={id} aria-pressed={value === id} onClick={() => onPick(id)}>{name}</button>
      ))}
    </div>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cc-row">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function CreatorPanel({ recipe, onChange, children }: {
  recipe: CharacterRecipeV2;
  onChange: (recipe: CharacterRecipeV2) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('Body');
  const [expression, setExpression] = useState<Expression>('idle');
  const [talking, setTalking] = useState(false);
  const spec = faceSpecFrom(recipe.face);
  const { hairStyles } = kit();
  const setFace = (face: Partial<FaceRecipe>): void => onChange({ ...recipe, face: { ...recipe.face, ...face } });
  const setItem = (slot: SlotV2, id: string | null): void => {
    const item = id ? itemById(id) : undefined;
    onChange({ ...recipe, outfit: { ...recipe.outfit, [slot]: item ? { item: item.id, variant: item.variants[0].id } : null } });
  };
  const setVariant = (slot: SlotV2, item: string, variant: string): void =>
    onChange({ ...recipe, outfit: { ...recipe.outfit, [slot]: { item, variant } } });

  return (
    <div className="cc-creator">
      <CharacterPreview recipe={recipe} expression={expression} talking={talking} />
      <div className="cc-controls">
        <nav className="cc-tabs">
          {TABS.map((name) => (
            <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>
          ))}
        </nav>
        <div className="cc-tab-body">
          {tab === 'Body' && (
            <>
              <Row title="Body">
                <div className="cc-choices">
                  {BODIES.map((body) => (
                    <button key={body} disabled={body !== 'adult'} aria-pressed={recipe.body === body} onClick={() => onChange({ ...recipe, body })}>
                      {body === 'adult' ? label(body) : `${label(body)} · soon`}
                    </button>
                  ))}
                </div>
              </Row>
              <Row title="Skin">
                <Swatches colors={SKIN_SWATCHES} value={recipe.skin} onPick={(skin) => onChange({ ...recipe, skin })} />
              </Row>
              <Row title={`Height · ${Math.round(recipe.height * 100)}%`}>
                <input type="range" min={0.85} max={1.12} step={0.01} value={recipe.height} onChange={(e) => onChange({ ...recipe, height: Number(e.target.value) })} />
              </Row>
            </>
          )}
          {tab === 'Face' && (
            <>
              <Row title="Eyes">
                <Swatches colors={IRIS_SWATCHES} value={recipe.eyes} onPick={(eyes) => onChange({ ...recipe, eyes })} />
              </Row>
              <Row title="Eye shape">
                <input type="range" min={0.8} max={1.05} step={0.01} value={recipe.face.squint} onChange={(e) => setFace({ squint: Number(e.target.value) })} />
              </Row>
              <Row title="Brows">
                <Swatches colors={HAIR_SWATCHES} value={recipe.face.brow} onPick={(brow) => setFace({ brow })} />
              </Row>
              {FACE_STYLES.map(({ key, label: text, options }) => (
                <Row key={key} title={text}>
                  <Choices options={options.map((id) => ({ id, name: label(id) }))} value={spec[key]} optional={false} onPick={(id) => setFace({ [key]: id })} />
                </Row>
              ))}
              <Row title="Expression">
                <div className="cc-choices">
                  {EXPRESSIONS.map((name) => (
                    <button key={name} aria-pressed={expression === name} onClick={() => setExpression(name)}>{label(name)}</button>
                  ))}
                  <button aria-pressed={talking} onClick={() => setTalking(!talking)}>Talk</button>
                </div>
              </Row>
              <Row title="Details">
                <div className="cc-choices">
                  {FACE_TOGGLES.map(({ key, label: text }) => (
                    <button key={key} aria-pressed={Boolean(recipe.face[key])} onClick={() => setFace({ [key]: !recipe.face[key] })}>{text}</button>
                  ))}
                </div>
              </Row>
            </>
          )}
          {tab === 'Hair' && (
            <>
              <Row title="Style">
                <Choices options={hairStyles.map((id) => ({ id, name: label(id) }))} value={recipe.hair.style} optional onPick={(style) => onChange({ ...recipe, hair: { ...recipe.hair, style } })} />
              </Row>
              <Row title="Colour">
                <Swatches colors={HAIR_SWATCHES} value={recipe.hair.color} onPick={(color) => onChange({ ...recipe, hair: { ...recipe.hair, color } })} />
              </Row>
            </>
          )}
          {tab === 'Clothes' && CLOTHES.map(({ slot, label: text }) => {
            const entry = recipe.outfit[slot] ?? null;
            const item = entry ? itemById(entry.item) : undefined;
            return (
              <Row key={slot} title={text}>
                <Choices options={ITEMS.filter((i) => i.slot === slot)} value={entry?.item ?? null} optional={OPTIONAL_SLOTS_V2.includes(slot)} onPick={(id) => setItem(slot, id)} />
                {item && (
                  <div className="cc-swatches">
                    {item.variants.map((variant) => (
                      <button key={variant.id} className="cc-swatch" style={{ background: variant.colors.primary }} aria-pressed={entry?.variant === variant.id} title={label(variant.id)} onClick={() => setVariant(slot, item.id, variant.id)} />
                    ))}
                  </div>
                )}
              </Row>
            );
          })}
        </div>
        <footer className="cc-footer">
          <button onClick={() => onChange(randomRecipe())}>Surprise me</button>
          <span className="cc-gap" />
          {children}
        </footer>
      </div>
    </div>
  );
}

export const CREATOR_CSS = `
.cc-creator { display: grid; grid-template-columns: minmax(0, 1fr) 380px; height: 100%; min-height: 0; color: #e8dfc8; font-family: Baskerville, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif; }
.cc-preview { display: flex; flex-direction: column; min-height: 0; background: #2a2622; }
.cc-stage { flex: 1; min-height: 0; position: relative; cursor: grab; image-rendering: pixelated; }
.cc-stage canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; image-rendering: pixelated; }
.cc-stage-bar, .cc-footer { display: flex; gap: 6px; padding: 10px; align-items: center; border-top: 1px solid rgba(154,127,78,.35); }
.cc-gap { flex: 1; }
.cc-controls { display: flex; flex-direction: column; min-height: 0; background: rgba(30,25,20,.97); border-left: 2px solid #9a7f4e; }
.cc-tabs { display: flex; gap: 4px; padding: 10px 10px 0; }
.cc-tabs button { flex: 1; }
.cc-tab-body { flex: 1; overflow-y: auto; padding: 6px 14px 14px; }
.cc-row h3 { margin: 14px 0 6px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #c9b98f; font-weight: normal; }
.cc-row input[type=range] { width: 100%; accent-color: #9a7f4e; }
.cc-creator button { font: inherit; font-size: 14px; color: #e8dfc8; background: #3a332b; border: 1px solid #6a5a40; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
.cc-creator button:hover { border-color: #c9a96a; }
.cc-creator button:disabled { opacity: .45; cursor: default; border-color: #6a5a40; }
.cc-creator button[aria-pressed=true] { background: #9a7f4e; color: #1e1914; border-color: #e0c890; }
.cc-choices { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.cc-swatches { display: flex; flex-wrap: wrap; gap: 4px; }
.cc-creator .cc-swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid rgba(0,0,0,.35); }
.cc-creator .cc-swatch[aria-pressed=true] { border-color: #f4e2b0; box-shadow: 0 0 0 2px #9a7f4e; background-clip: padding-box; }
@media (max-width: 760px) { .cc-creator { grid-template-columns: 1fr; grid-template-rows: 45vh 1fr; } .cc-controls { border-left: 0; border-top: 2px solid #9a7f4e; } }
`;

let cssInjected = false;
export function ensureCreatorStyles(): void {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = CREATOR_CSS;
  document.head.appendChild(style);
}
