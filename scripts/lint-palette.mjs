import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('src');
const art = resolve('src/art');
const failures = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (path === art) continue;
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|css|html)$/.test(path)) {
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (/0x[0-9a-f]{6}\b|#[0-9a-f]{3,8}\b/i.test(line)) {
          failures.push(`${path.slice(root.length + 1)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
};
walk(root);
if (failures.length) {
  console.error('Palette literals must live in src/art/:');
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PALETTE LINT: clean');

