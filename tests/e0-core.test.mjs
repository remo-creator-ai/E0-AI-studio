import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const directory = path.resolve('.tmp/e0-core-tests');
await mkdir(directory, { recursive: true });
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network call'); };

async function load(env, name, contents) {
  const file = path.join(directory, `${name}.mjs`);
  await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, outfile: file, bundle: true,
    platform: 'node', packages: 'external', format: 'esm', define: { 'import.meta.env': JSON.stringify(env) } });
  return import(pathToFileURL(file).href);
}

const production = await load({ DEV: false }, 'production', "export { MOCK_MODE } from './lib/mockAuth';");
assert.equal(production.MOCK_MODE, false, 'Production cannot implicitly enable mock accounts');
const preview = await load({ DEV: true, VITE_MOCK_AUTH: 'true' }, 'preview', `
  export * from './services/projectService';
  export * from './lib/localProjects';
  export { supabase } from './lib/supabase';
  export { generateStudioVideo } from './services/videoStudioService';
  export { CONTENT_STARTS } from './lib/brand';
`);
const project = { id: 'project-1', title: 'E0 product', idea: 'Test', duration: 15, style: 'Cinematic', scenes: [], grid_images: [], layout: '2x5' };
await preview.saveProject('user-1', project);
await preview.renameProject(project.id, 'Updated E0 product');
assert.equal((await preview.loadProject(project.id)).title, 'Updated E0 product');
assert.equal(preview.localProjects().length, 1);
assert.equal(await preview.isOwnProject(project.id), true);
await preview.deleteProject(project.id);
assert.equal(await preview.loadProject(project.id), null);
const originalSetter = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
await assert.rejects(preview.saveProject('user-1', project), /QuotaExceeded/);
localStorage.setItem = originalSetter;
const blocked = await preview.supabase.from('projects').select('*');
assert.equal(blocked.error.code, 'PREVIEW_ONLY');
assert.equal((await preview.generateStudioVideo({ prompt: 'Product' })).ok, false);
assert.equal(networkCalls, 0, 'Preview must not contact external services');
assert.equal(new Set(preview.CONTENT_STARTS.map(item => item.id)).size, 3);
assert.ok(preview.CONTENT_STARTS.every(item => item.brief && item.briefEn));
console.log('PASS: production mode, preview CRUD, quota failures, no external calls, generation unavailable, bilingual briefs');
await rm(directory, { recursive: true });
