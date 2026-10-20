import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const name = `slotgrid-${JSON.parse(readFileSync('package.json', 'utf8')).version}.tgz`;
const files = execFileSync('tar', ['-tf', name], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(file => !file.endsWith('/')).sort();
assert.deepEqual(files, [
  'package/LICENSE', 'package/README.md', 'package/package.json',
  'package/dist/index.d.ts', 'package/dist/model.d.ts', 'package/dist/model.js',
  'package/dist/slot-grid.d.ts', 'package/dist/slot-grid.js',
].sort());
const manifest = JSON.parse(execFileSync('tar', ['-xOf', name, 'package/package.json'], { encoding: 'utf8' }));
assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
const source = execFileSync('tar', ['-xOf', name, 'package/dist/slot-grid.js'], { encoding: 'utf8' });
assert.ok(source.includes('customElements.define'));
assert.ok(!/C:\\Users\\|\/Users\/|node_modules\//.test(source));
console.log(`Package verified: ${files.length} files, no runtime dependencies.`);
