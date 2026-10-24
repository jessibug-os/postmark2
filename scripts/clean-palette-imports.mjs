import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = resolve(directory, name);
  return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
});

for (const path of walk('src')) {
  if (path.includes('/src/art/')) continue;
  let source = readFileSync(path, 'utf8');
  const line = source.split('\n')[0];
  if (!line.includes('art/palette')) continue;
  const body = source.slice(line.length + 1);
  const names = ['PALETTE_CSS', 'PALETTE_HEX'].filter((name) => body.includes(name));
  const importLine = names.length
    ? line.replace(/\{[^}]+\}/, `{ ${names.join(', ')} }`)
    : '';
  source = `${importLine}\n${body}`;
  writeFileSync(path, source);
}

