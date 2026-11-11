import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this check with npm run check:package.');
const exec = (args, cwd = root) => execFileSync(process.execPath, args, {
  cwd,
  encoding: 'utf8',
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const manifest = JSON.parse(await readFile('package.json', 'utf8'));

await mkdir('artifacts', { recursive: true });
const [packed] = JSON.parse(exec([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', 'artifacts']));
assert.equal(packed.name, '@bitavu/client');
assert.equal(packed.version, manifest.version);
assert.deepEqual(packed.files.map(file => file.path).sort(), [
  'LICENSE', 'README.md', 'package.json',
  ...['client', 'contracts', 'errors', 'index', 'types'].flatMap(name => [
    'dist/' + name + '.d.ts', 'dist/' + name + '.js',
  ]),
].sort());

const tarball = path.resolve('artifacts', packed.filename);
const consumer = await mkdtemp(path.join(root, 'artifacts', 'consumer-'));
await writeFile(path.join(consumer, 'package.json'), '{"private":true}');
exec([npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], consumer);
const installed = path.join(consumer, 'node_modules', '@bitavu', 'client');
const installedManifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
assert.equal(Object.keys(installedManifest.dependencies ?? {}).length, 0);
for (const { path: filename } of packed.files) {
  const text = await readFile(path.join(installed, filename), 'utf8');
  assert.ok(!/(?:\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{12,}|\bbk_(?:production|staging|development|test|live)_[A-Za-z0-9_-]{12,}|\b(?:ghp|gho|ghs)_[A-Za-z0-9]{20,}|-----BEGIN .*PRIVATE KEY-----|[A-Za-z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/[^/" ]+\/|@users\.noreply\.github\.com)/i.test(text),
    'Unexpected credential, identity, or local path in ' + filename);
}
exec(['--input-type=module', '-e', "import { BitavuClient } from '@bitavu/client'; if (typeof BitavuClient !== 'function') process.exit(1);"], consumer);
exec(['--input-type=commonjs', '-e', "if (typeof require('@bitavu/client').BitavuClient !== 'function') process.exit(1);"], consumer);
exec(['--conditions=browser', '--input-type=module', '-e',
  "try { await import('@bitavu/client/dist/client.js'); process.exit(1); } catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }"], consumer);

await writeFile(path.join(consumer, 'check.mts'), `
import { BitavuClient, type RenderPdfInput } from '@bitavu/client';
interface InvoiceData { invoice: { number: string } }
const client = new BitavuClient({ apiKey: 'fictional-api-key' });
const request: RenderPdfInput<InvoiceData> = {
  templateId: 'invoice', revision: 'latest-published', baseRevision: 2,
  data: { invoice: { number: 'INV-1001' } }, idempotencyKey: 'sample-operation-1',
};
const pdf = await client.renderPdf(request);
const result: Uint8Array<ArrayBuffer> = pdf.bytes;
const invoice = await client.getTemplate<InvoiceData>('invoice', 2);
const number: string | undefined = invoice.exampleJson?.invoice.number;
// @ts-expect-error A pinned revision cannot take a baseline revision.
const invalid: RenderPdfInput<InvoiceData> = { ...request, revision: 2 };
`);
await writeFile(path.join(consumer, 'check.cts'), `
import { BitavuClient } from '@bitavu/client';
const client: BitavuClient = new BitavuClient({ apiKey: 'fictional-api-key' });
`);
exec([path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit',
  '--strict', '--module', 'nodenext', 'check.mts', 'check.cts'], consumer);

const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
console.log(JSON.stringify({ name: packed.name, version: packed.version, filename: packed.filename, sha256, files: packed.files.length }));
