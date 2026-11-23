import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { PlacedObject } from '../world/TownMap';
import type { Editor, Field } from './EditorMode';

const CSS = `
.pme {
  --bg: rgba(24, 21, 19, 0.94);
  --card: rgba(255, 244, 225, 0.04);
  --line: rgba(255, 236, 205, 0.09);
  --text: #efe6d6;
  --muted: rgba(239, 230, 214, 0.55);
  --faint: rgba(239, 230, 214, 0.32);
  --brass: #d9b36c;
  --brass-soft: rgba(217, 179, 108, 0.16);
  --danger: #e2735f;
  position: fixed; top: 12px; right: 12px; bottom: 12px; width: 300px;
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
  font: 12.5px/1.45 -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  z-index: 1000; overflow: hidden; user-select: none;
}
.pme * { box-sizing: border-box; }
.pme button { font: inherit; color: inherit; cursor: pointer; }
.pme button:disabled { cursor: default; opacity: 0.35; }
.pme-head { padding: 14px 14px 10px; border-bottom: 1px solid var(--line); }
.pme-title { display: flex; align-items: baseline; gap: 8px; }
.pme-title h1 { margin: 0; font: 600 18px/1 Baskerville, 'Iowan Old Style', Georgia, serif; letter-spacing: 0.01em; }
.pme-title span { color: var(--faint); font-size: 11px; }
.pme-bar { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.pme-seg { display: flex; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); border-radius: 8px; padding: 2px; }
.pme-seg button { border: 0; background: none; padding: 4px 10px; border-radius: 6px; color: var(--muted); }
.pme-seg button.on { background: var(--brass-soft); color: var(--brass); }
.pme-icon { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--line); background: none; border-radius: 8px; color: var(--text); }
.pme-icon:not(:disabled):hover { background: var(--card); }
.pme-save { margin-left: auto; display: flex; align-items: center; gap: 6px; border: 0; border-radius: 8px; padding: 6px 12px; background: var(--brass); color: #2a2016 !important; font-weight: 600; }
.pme-save:disabled { background: rgba(255, 255, 255, 0.08); color: var(--muted) !important; opacity: 1 !important; }
.pme-badge { background: rgba(42, 32, 22, 0.25); border-radius: 10px; padding: 0 6px; font-size: 11px; }
.pme-status { margin-top: 10px; font-size: 11.5px; color: var(--muted); }
.pme-body { flex: 1; overflow-y: auto; padding: 4px 0 8px; }
.pme-body::-webkit-scrollbar { width: 8px; }
.pme-body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }
.pme-section { padding: 0 14px; }
.pme-section > button { display: flex; align-items: center; width: 100%; gap: 6px; border: 0; background: none; padding: 12px 0 8px; color: var(--muted); font-size: 10.5px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; }
.pme-section > button i { font-style: normal; transition: transform 0.15s; display: inline-block; }
.pme-section > button i.open { transform: rotate(90deg); }
.pme-section > button em { margin-left: auto; font-style: normal; color: var(--faint); letter-spacing: 0; text-transform: none; font-weight: 400; }
.pme-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.pme-tile { text-align: left; border: 1px solid var(--line); background: var(--card); border-radius: 9px; padding: 8px 10px; }
.pme-tile:hover { border-color: rgba(217, 179, 108, 0.45); background: var(--brass-soft); }
.pme-tile b { display: block; font-weight: 500; }
.pme-tile small { color: var(--faint); font-size: 10.5px; }
.pme-group { margin-bottom: 6px; }
.pme-group > div { display: flex; justify-content: space-between; color: var(--faint); font-size: 11px; padding: 4px 2px; }
.pme-row { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; text-align: left; padding: 5px 8px 5px 14px; border-radius: 7px; }
.pme-row:hover { background: var(--card); }
.pme-row.on { background: var(--brass-soft); color: var(--brass); }
.pme-row { cursor: pointer; }
.pme-row small { color: var(--faint); margin-left: auto; }
.pme-x { border: 0; background: none; color: var(--faint) !important; padding: 0 2px; border-radius: 4px; line-height: 1; visibility: hidden; }
.pme-row:hover .pme-x { visibility: visible; }
.pme-x:hover { color: var(--danger) !important; }
.pme-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brass); flex: none; }
.pme-name { font: 600 16px/1.2 Baskerville, 'Iowan Old Style', Georgia, serif; }
.pme-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.pme-chip { font-size: 10.5px; color: var(--muted); border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; }
.pme-note { margin-top: 8px; color: var(--muted); font-size: 11.5px; }
.pme-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 12px; }
.pme-field { display: flex; align-items: center; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); border-radius: 8px; padding: 0 0 0 8px; }
.pme-field:focus-within { border-color: var(--brass); }
.pme-field span { color: var(--brass); font-size: 10.5px; font-weight: 600; text-transform: uppercase; }
.pme-field input { width: 100%; min-width: 0; border: 0; background: none; color: var(--text); font: 12px ui-monospace, Menlo, monospace; padding: 6px 6px; outline: none; }
.pme-comp { border: 1px solid var(--line); background: var(--card); border-radius: 9px; padding: 7px 10px; margin-bottom: 6px; }
.pme-comp header { display: flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 3px; }
.pme-comp dl { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; margin: 0; font-size: 11.5px; }
.pme-comp dt { color: var(--faint); }
.pme-comp dd { margin: 0; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--muted); }
.pme-danger { margin-top: 12px; width: 100%; border: 1px solid rgba(226, 115, 95, 0.35); background: none; color: var(--danger) !important; border-radius: 8px; padding: 6px; }
.pme-danger:hover { background: rgba(226, 115, 95, 0.12); }
.pme-empty { color: var(--faint); font-size: 11.5px; padding: 4px 2px 8px; }
.pme-foot { border-top: 1px solid var(--line); padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 6px 10px; color: var(--faint); font-size: 11px; }
.pme-foot kbd { font: 10.5px ui-monospace, Menlo, monospace; color: var(--muted); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; margin-right: 3px; }
.pme-legend { display: flex; gap: 10px; margin-top: 8px; font-size: 11px; color: var(--muted); }
.pme-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
`;

function Arrow({ flip }: { flip?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M6 3.5 2.5 7 6 10.5" />
      <path d="M2.5 7h7a4 4 0 0 1 0 8H8" />
    </svg>
  );
}

const COMPONENT_COLORS: Record<string, string> = {
  collide: '#ff5544',
  seat: '#44ddff',
  interact: '#d9b36c',
};

export function mountEditorPanel(editor: Editor): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const host = document.createElement('div');
  document.body.appendChild(host);
  createRoot(host).render(<EditorPanel editor={editor} />);
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pme-section">
      <button onClick={() => setOpen(!open)}>
        <i className={open ? 'open' : ''}>›</i>
        {title}
        {aside && <em>{aside}</em>}
      </button>
      {open && children}
    </div>
  );
}

function EditorPanel({ editor }: { editor: Editor }) {
  useSyncExternalStore(editor.subscribe, editor.version);
  if (!editor.active) return null;

  const objects = editor.objects();
  const groups = new Map<string, PlacedObject[]>();
  for (const object of objects) {
    const key = `${object.piece}|${object.acre.col},${object.acre.row}`;
    groups.set(key, [...(groups.get(key) ?? []), object]);
  }
  const pending = editor.dirtyCount();

  return (
    <div className="pme">
      <div className="pme-head">
        <div className="pme-title">
          <h1>Editor</h1>
          <span>St. Mystere</span>
        </div>
        <div className="pme-bar">
          <div className="pme-seg">
            <button className={editor.mode === 'translate' ? 'on' : ''} title="Move (G)" onClick={() => editor.setMode('translate')}>Move</button>
            <button className={editor.mode === 'rotate' ? 'on' : ''} title="Rotate (R)" onClick={() => editor.setMode('rotate')}>Rotate</button>
          </div>
          <button className="pme-icon" title="Undo (Ctrl+Z)" onClick={() => editor.undo()} disabled={!editor.canUndo()}>
            <Arrow />
          </button>
          <button className="pme-icon" title="Redo (Ctrl+Shift+Z)" onClick={() => editor.redo()} disabled={!editor.canRedo()}>
            <Arrow flip />
          </button>
          <button className="pme-save" onClick={() => void editor.save()} disabled={pending === 0}>
            Save{pending > 0 && <span className="pme-badge">{pending}</span>}
          </button>
        </div>
        {editor.status && <div className="pme-status">{editor.status}</div>}
        <div className="pme-legend">
          <span><i style={{ background: '#ff5544' }} />Collide</span>
          <span><i style={{ background: '#44ddff' }} />Seat</span>
          <span><i style={{ background: '#ffdd55' }} />Mark</span>
        </div>
      </div>

      <div className="pme-body">
        <Section title="Palette" aside="adds at camera focus">
          <div className="pme-tiles">
            {editor.types().map((type) => (
              <button key={type.id} className="pme-tile" onClick={() => void editor.add(type.id)}>
                <b>{type.name}</b>
                <small>{type.id}</small>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Hierarchy" aside={`${objects.length} objects`}>
          {[...groups].map(([key, members]) => {
            const [piece, acre] = key.split('|');
            return (
              <div key={key} className="pme-group">
                <div><span>{piece}</span><span>acre {acre}</span></div>
                {members.map((object) => (
                  <div
                    key={object.id}
                    className={`pme-row${object === editor.selected ? ' on' : ''}`}
                    onClick={() => editor.select(object)}
                    onDoubleClick={() => editor.focus()}
                  >
                    {editor.isDirty(object) && <span className="pme-dot" title="Unsaved" />}
                    {object.fixture}
                    <small>{object.type}</small>
                    <button
                      className="pme-x"
                      title="Delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        editor.remove(object);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >×</button>
                  </div>
                ))}
              </div>
            );
          })}
        </Section>

        <Section title="Inspector">
          {editor.selected
            ? <Inspector editor={editor} object={editor.selected} />
            : <div className="pme-empty">Click an object in the scene or the hierarchy.</div>}
        </Section>
      </div>

      <div className="pme-foot">
        <span><kbd>F1</kbd>exit</span>
        <span><kbd>WASD</kbd>fly</span>
        <span><kbd>⇧</kbd>faster</span>
        <span><kbd>G</kbd>move</span>
        <span><kbd>R</kbd>rotate</span>
        <span><kbd>F</kbd>focus</span>
        <span><kbd>Del</kbd>delete</span>
        <span><kbd>⌘S</kbd>save</span>
      </div>
    </div>
  );
}

function describe(value: unknown): string {
  if (value && typeof value === 'object') return Object.values(value).join(', ');
  return String(value);
}

function Inspector({ editor, object }: { editor: Editor; object: PlacedObject }) {
  const source = editor.source(object);
  const fields: Array<[Field, number, number]> = [['x', source.x, 0.05], ['z', source.z, 0.05], ['turn', source.turn, 15]];
  const components = object.definition.components.filter((component) => component.kind !== 'comment');

  return (
    <>
      <div className="pme-name">{object.definition.name}</div>
      <div className="pme-chips">
        <span className="pme-chip">{object.type}</span>
        <span className="pme-chip">{object.definition.model}</span>
        <span className="pme-chip">{object.fixture}</span>
      </div>
      {object.definition.note && <div className="pme-note">{object.definition.note}</div>}
      <div className="pme-fields">
        {fields.map(([field, value, step]) => (
          <label key={field} className="pme-field">
            <span>{field === 'turn' ? '°' : field}</span>
            <input
              type="number"
              step={step}
              value={value}
              onChange={(event) => editor.setField(object, field, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      {components.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {components.map((component, index) => {
            const { kind, line: _line, ...rest } = component as { kind: string; line?: number };
            return (
              <div key={index} className="pme-comp">
                <header>
                  <span className="pme-dot" style={{ background: COMPONENT_COLORS[kind] ?? 'var(--muted)' }} />
                  {kind}
                </header>
                <dl>
                  {Object.entries(rest).map(([key, value]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <dt>{key}</dt>
                      <dd>{describe(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <button className="pme-danger" onClick={() => editor.remove(object)}>Delete object</button>
    </>
  );
}
