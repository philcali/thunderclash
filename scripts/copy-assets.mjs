// Postbuild: copy runtime assets (portraits, floors, icons) into dist/
// so the production build can load them at the same './assets/...' paths.
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const src = resolve(root, 'assets');
const dest = resolve(root, 'dist', 'assets');

if (!existsSync(src)) {
  console.warn('⚠ assets/ not found — nothing to copy');
  process.exit(0);
}

// recursive copy merges with dist/assets/ (bundle JS lives there too)
cpSync(src, dest, { recursive: true });
console.log('✓ copied assets/ → dist/assets/');
