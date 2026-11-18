// Bundles src/ into one self-contained dist/index.html (styles and script inlined), which is the
// file published as the artifact.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const CSS_TAG = '<link rel="stylesheet" href="./styles.css">';
const JS_TAG = '<script type="module" src="./main.js"></script>';

const { outputFiles } = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/styles.css', 'utf8');
const html = await readFile('src/index.html', 'utf8');

for (const tag of [CSS_TAG, JS_TAG]) {
  if (!html.includes(tag)) throw new Error(`src/index.html no longer contains ${tag}`);
}
const out = html
  .replace(CSS_TAG, () => `<style>\n${css}</style>`)
  .replace(JS_TAG, () => `<script>\n${js}</script>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
console.log(`dist/index.html  ${(out.length / 1024).toFixed(1)} KB`);
