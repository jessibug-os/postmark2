import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreatorPanel, ensureCreatorStyles } from './CreatorPanel';
import type { CharacterRecipeV2 } from './recipeV2';

function Chooser({ initial, onDone }: { initial: CharacterRecipeV2; onDone: (recipe: CharacterRecipeV2) => void }) {
  const [recipe, setRecipe] = useState(initial);
  return (
    <CreatorPanel recipe={recipe} onChange={setRecipe}>
      <button aria-pressed onClick={() => onDone(recipe)}>Board the ferry →</button>
    </CreatorPanel>
  );
}

export function chooseLook(container: HTMLElement, initial: CharacterRecipeV2): Promise<CharacterRecipeV2> {
  ensureCreatorStyles();
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:4vh 4vw;z-index:50;border:2px solid #9a7f4e;border-radius:10px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.56);';
  container.appendChild(host);
  const root = createRoot(host);
  return new Promise((resolve) => {
    root.render(
      <Chooser
        initial={initial}
        onDone={(recipe) => {
          root.unmount();
          host.remove();
          resolve(recipe);
        }}
      />,
    );
  });
}
