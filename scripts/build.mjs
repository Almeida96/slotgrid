import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';

await build({ entryPoints: ['src/index.ts'], outfile: 'dist/slot-grid.js', bundle: true, format: 'esm', target: 'es2022' });
await build({ entryPoints: ['src/model.ts'], outfile: 'dist/model.js', bundle: true, format: 'esm', target: 'es2022' });
await mkdir('site', { recursive: true });
await cp('demo', 'site', { recursive: true });
await cp('dist', 'site/dist', { recursive: true });
