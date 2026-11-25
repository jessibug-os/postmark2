import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assets } from '../src/core/AssetLoader';
import { CreatorPanel, ensureCreatorStyles } from '../src/characters/chargen/CreatorPanel';
import { randomRecipe, seededRandom } from '../src/characters/chargen/options';
import { DEFAULT_RECIPE_V2, formatRecipeV2, upgradeRecipe, type CharacterRecipeV2 } from '../src/characters/chargen/recipeV2';
import { KINDLY_FORWARD_CAST_IDS } from '../src/content/kindly-forward/cast';

const API = '/chargen/recipes';

interface SavedRecipe {
  id: string;
  recipe: unknown;
}

function App() {
  const [recipe, setRecipe] = useState<CharacterRecipeV2>(DEFAULT_RECIPE_V2);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [id, setId] = useState('');
  const [seed, setSeed] = useState('1');
  const [json, setJson] = useState(formatRecipeV2(DEFAULT_RECIPE_V2));
  const [status, setStatus] = useState('');

  const refresh = async (): Promise<void> => {
    const response = await fetch(API);
    if (response.ok) setSaved(await response.json());
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { setJson(formatRecipeV2(recipe)); }, [recipe]);

  const save = async (): Promise<void> => {
    if (!/^[a-z0-9-]+$/.test(id)) {
      setStatus('Id must be lowercase letters, digits and dashes');
      return;
    }
    const response = await fetch(`${API}/${id}`, { method: 'PUT', body: formatRecipeV2(recipe) });
    const body = await response.json();
    setStatus(response.ok ? `Saved ${id}.json` : body.error);
    if (response.ok) void refresh();
  };

  return (
    <>
      <header className="cg-top">
        <b>CHARGEN</b>
        <span className="sub">One kit · the player and every resident</span>
        <a href="/">Back to the game ↗</a>
      </header>
      <div className="cg-main">
        <CreatorPanel recipe={recipe} onChange={setRecipe} />
        <aside className="cg-side">
          <h3>Saved recipes</h3>
          <select
            value=""
            onChange={(e) => {
              const entry = saved.find((s) => s.id === e.target.value);
              if (!entry) return;
              setRecipe(upgradeRecipe(entry.recipe));
              setId(entry.id);
              setStatus(`Loaded ${entry.id}`);
            }}
          >
            <option value="">{saved.length ? 'Load…' : 'None yet'}</option>
            {saved.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
          <h3>Save as</h3>
          <div className="row">
            <input list="cast-ids" value={id} placeholder="recipe id" onChange={(e) => setId(e.target.value.trim())} />
            <button onClick={() => void save()}>Save</button>
          </div>
          <datalist id="cast-ids">
            {Object.values(KINDLY_FORWARD_CAST_IDS).map((castId) => <option key={castId} value={castId} />)}
          </datalist>
          <p className="cg-note">Saving with a resident's id (e.g. <code>mira</code>) makes that resident recipe-built in the game.</p>
          <h3>Seeded townsfolk</h3>
          <div className="row">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
            <button onClick={() => setRecipe(randomRecipe(seededRandom(Number(seed) || 0)))}>Roll</button>
            <button onClick={() => { const next = String((Number(seed) || 0) + 1); setSeed(next); setRecipe(randomRecipe(seededRandom(Number(next)))); }}>Next</button>
          </div>
          <h3>Recipe</h3>
          <textarea value={json} spellCheck={false} onChange={(e) => setJson(e.target.value)} />
          <div className="row">
            <button onClick={() => {
              try {
                setRecipe(upgradeRecipe(JSON.parse(json)));
                setStatus('Applied');
              } catch (error) {
                setStatus(String((error as Error).message));
              }
            }}>Apply JSON</button>
            <button onClick={() => void navigator.clipboard.writeText(json).then(() => setStatus('Copied'))}>Copy</button>
            <button onClick={() => setRecipe(DEFAULT_RECIPE_V2)}>Reset</button>
          </div>
          <div className="cg-status">{status}</div>
        </aside>
      </div>
    </>
  );
}

ensureCreatorStyles();
await assets.preload(['chargen-kit']);
createRoot(document.getElementById('app')!).render(<App />);
