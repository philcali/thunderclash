import { defineConfig } from 'vite';

// Relative base: the build works at the site root, under a GitHub Pages
// subpath (e.g. /thundrclash/), or anywhere else — no repo name hard-coded.
export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
  },
});
