import { useState, type ReactNode } from 'react';
import { CharacterPreview } from './CharacterPreview';
import { kit } from './kit';
import { CHANNEL_SWATCHES, IRIS_SWATCHES, HAIR_SWATCHES, randomRecipe } from './options';
import { OPTIONAL_SLOTS, type Channel, type CharacterRecipe, type FaceRecipe, type Slot } from './recipe';

const TABS = ['Body', 'Face', 'Hair', 'Clothes'] as const;
type Tab = (typeof TABS)[number];

const CLOTHES: Array<{ slot: Slot; label: string; channel: Channel | null }> = [
  { slot: 'hat', label: 'Hat', channel: 'hat' },
  { slot: 'top', label: 'Top', channel: 'top' },
  { slot: 'bottom', label: 'Bottom', channel: 'bottom' },
  { slot: 'shoes', label: 'Shoes', channel: 'shoes' },
  { slot: 'apron', label: 'Apron', channel: null },
  { slot: 'bag', label: 'Bag', channel: null },
];

const FACE_TOGGLES: Array<{ key: keyof FaceRecipe; label: string }> = [
  { key: 'lashes', label: 'Lashes' },
  { key: 'freckles', label: 'Freckles' },
  { key: 'age', label: 'Laugh lines' },
  { key: 'glasses', label: 'Glasses' },
  { key: 'moustache', label: 'Moustache' },
];

const label = (id: string): string => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Swatches({ colors, value, onPick }: { colors: string[]; value: string | undefined; onPick: (hex: string | undefined) => void }) {
  return (
    <div className="cc-swatches">
      <button className="cc-swatch cc-swatch-original" aria-pressed={value === undefined} title="As painted" onClick={() => onPick(undefined)} />
      {colors.map((hex) => (
        <button key={hex} className="cc-swatch" style={{ background: hex }} aria-pressed={value === hex} title={hex} onClick={() => onPick(hex)} />
      ))}
    </div>
  );
}

function Choices({ options, value, optional, onPick }: { options: string[]; value: string | null; optional: boolean; onPick: (id: string | null) => void }) {
  return (
    <div className="cc-choices">
      {optional && <button aria-pressed={value === null} onClick={() => onPick(null)}>None</button>}
      {options.map((id) => (
        <button key={id} aria-pressed={value === id} onClick={() => onPick(id)}>{label(id)}</button>
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
  recipe: CharacterRecipe;
  onChange: (recipe: CharacterRecipe) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('Body');
  const { options } = kit();
  const setPart = (slot: Slot, id: string | null): void => onChange({ ...recipe, parts: { ...recipe.parts, [slot]: id } });
  const setColor = (channel: Channel, hex: string | undefined): void => {
    const colors = { ...recipe.colors };
    if (hex) colors[channel] = hex;
    else delete colors[channel];
    onChange({ ...recipe, colors });
  };
  const setFace = (face: Partial<FaceRecipe>): void => onChange({ ...recipe, face: { ...recipe.face, ...face } });

  return (
    <div className="cc-creator">
      <CharacterPreview recipe={recipe} />
      <div className="cc-controls">
        <nav className="cc-tabs">
          {TABS.map((name) => (
            <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>
          ))}
        </nav>
        <div className="cc-tab-body">
          {tab === 'Body' && (
            <>
              <Row title="Skin">
                <Swatches colors={CHANNEL_SWATCHES.skin} value={recipe.colors.skin} onPick={(hex) => setColor('skin', hex)} />
              </Row>
              <Row title={`Height · ${Math.round(recipe.height * 100)}%`}>
                <input type="range" min={0.85} max={1.12} step={0.01} value={recipe.height} onChange={(e) => onChange({ ...recipe, height: Number(e.target.value) })} />
              </Row>
              <Row title="Legs">
                <Swatches colors={CHANNEL_SWATCHES.legs} value={recipe.colors.legs} onPick={(hex) => setColor('legs', hex)} />
              </Row>
            </>
          )}
          {tab === 'Face' && (
            <>
              <Row title="Eyes">
                <div className="cc-swatches">
                  {IRIS_SWATCHES.map((hex) => (
                    <button key={hex} className="cc-swatch" style={{ background: hex }} aria-pressed={recipe.face.iris === hex} onClick={() => setFace({ iris: hex })} />
                  ))}
                </div>
              </Row>
              <Row title="Eye shape">
                <input type="range" min={0.8} max={1.05} step={0.01} value={recipe.face.squint} onChange={(e) => setFace({ squint: Number(e.target.value) })} />
              </Row>
              <Row title="Brows">
                <div className="cc-swatches">
                  {HAIR_SWATCHES.map((hex) => (
                    <button key={hex} className="cc-swatch" style={{ background: hex }} aria-pressed={recipe.face.brow === hex} onClick={() => setFace({ brow: hex })} />
                  ))}
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
                <Choices options={options.hair} value={recipe.parts.hair} optional onPick={(id) => setPart('hair', id)} />
              </Row>
              <Row title="Colour">
                <Swatches colors={CHANNEL_SWATCHES.hair} value={recipe.colors.hair} onPick={(hex) => setColor('hair', hex)} />
              </Row>
            </>
          )}
          {tab === 'Clothes' && (
            <>
              {CLOTHES.map(({ slot, label: text, channel }) => (
                <Row key={slot} title={text}>
                  <Choices options={options[slot]} value={recipe.parts[slot]} optional={OPTIONAL_SLOTS.includes(slot)} onPick={(id) => setPart(slot, id)} />
                  {channel && recipe.parts[slot] && (
                    <Swatches colors={CHANNEL_SWATCHES[channel]} value={recipe.colors[channel]} onPick={(hex) => setColor(channel, hex)} />
                  )}
                </Row>
              ))}
              {(recipe.parts.apron || recipe.parts.top) && (
                <Row title="Collar & apron">
                  <Swatches colors={CHANNEL_SWATCHES.accent} value={recipe.colors.accent} onPick={(hex) => setColor('accent', hex)} />
                </Row>
              )}
            </>
          )}
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
.cc-creator button[aria-pressed=true] { background: #9a7f4e; color: #1e1914; border-color: #e0c890; }
.cc-choices { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.cc-swatches { display: flex; flex-wrap: wrap; gap: 4px; }
.cc-creator .cc-swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid rgba(0,0,0,.35); }
.cc-creator .cc-swatch[aria-pressed=true] { border-color: #f4e2b0; box-shadow: 0 0 0 2px #9a7f4e; background-clip: padding-box; }
.cc-creator .cc-swatch-original { background: repeating-linear-gradient(45deg, #6a5a40 0 4px, #3a332b 4px 8px); }
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
