import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['main.js', 'world.js', 'shaders.js', 'audio.js', 'text.js']) {
  await cp(file, `dist/${file}`);
}
const html = await readFile('index.html', 'utf8');
await writeFile('dist/index.html', html.replaceAll('./node_modules/three/', './vendor/three/'));
for (const path of ['build', 'examples/jsm', 'LICENSE']) {
  await cp(`node_modules/three/${path}`, `dist/vendor/three/${path}`, { recursive: true });
}
await writeFile('dist/.nojekyll', '');
console.log('Static site built in dist/');
