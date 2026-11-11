import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BitavuApiError, BitavuClient, BitavuTransportError } from '@bitavu/client';

const requestId = '34b12b79-e683-4118-b671-c116592c0001';
const credentials = 'fictional-api-key';
const summary = {
  id: 'invoice', name: 'Invoice', revision: 2, createdAt: 1000, updatedAt: null,
  studioUrl: 'https://studio.bitavu.com/?view=template&template=invoice&revision=2',
};
const data = { invoice: { number: 'INV-1001' }, items: [{ quantity: 2 }] };
const operation = { templateId: 'invoice', data, idempotencyKey: 'sample-operation-1' };
const detail = {
  ...summary,
  bindings: [{ path: 'invoice.number', type: 'string', required: true }],
  exampleJson: data,
  inputReview: { missing: [], unused: ['items[].quantity'] },
};

function transport(respond, options = {}) {
  const calls = [];
  const client = new BitavuClient({
    apiKey: credentials,
    ...options,
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return respond(url, init);
    },
  });
  return { client, calls };
}

test('uses bearer authentication and reads the supported template contracts', async () => {
  const catalog = { templates: [{
    id: 'invoice', name: 'Invoice', path: ['Billing', 'Invoice'], latestRevision: 2, studioUrl: summary.studioUrl,
  }] };
  const versions = { versions: [{ ...summary, title: null }], latest: summary, selected: summary, page: 1, pageSize: 5, total: 1, pages: 1 };
  const { client, calls } = transport(url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/check')) return Response.json({ authenticated: true });
    if (path.endsWith('/versions')) return Response.json(versions);
    if (path.endsWith('/templates')) return Response.json(catalog);
    return Response.json(detail);
  });

  await client.checkCredentials();
  assert.deepEqual(await client.listTemplates(), catalog);
  assert.deepEqual(await client.getTemplateVersions('invoice', { pageSize: 5, revision: 2 }), versions);
  assert.deepEqual(await client.getTemplate('invoice', 2), detail);
  assert.deepEqual(await client.saveTemplateExample({ templateId: 'invoice', expectedRevision: 1, exampleJson: data }), detail);
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname + new URL(url).search), [
    '/v1/credentials/check',
    '/v1/templates',
    '/v1/templates/invoice/versions?summary=true&page=1&pageSize=5&revision=2',
    '/v1/templates/invoice?revision=2',
    '/v1/templates/invoice/example',
  ]);
  assert.ok(calls.every(({ headers, cache, redirect }) =>
    headers.get('authorization') === 'Bearer ' + credentials && cache === 'no-store' && redirect === 'error'));
  assert.equal(calls[4].method, 'POST');
  assert.deepEqual(JSON.parse(calls[4].body), { expectedRevision: 1, exampleJson: data });
});

test('sends each render mode explicitly and returns binary bytes and resolved metadata', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\n');
  const { client, calls } = transport(() => new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'X-Bitavu-Revision': '2', 'X-Bitavu-Pages': '3', 'X-Bitavu-Request-Id': requestId },
  }));

  for (const selection of [{ revision: 2 }, { revision: 'latest-published', baseRevision: 1 }, { revision: 'latest-published' }]) {
    const pdf = await client.renderPdf({ ...operation, ...selection });
    assert.deepEqual(pdf, { bytes, revision: 2, pageCount: 3, requestId });
    const request = calls.at(-1);
    assert.equal(request.url, 'https://api.bitavu.com/v1/render');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('idempotency-key'), operation.idempotencyKey);
    assert.equal(request.headers.get('content-type'), 'application/json');
    assert.equal(request.headers.get('accept'), 'application/pdf');
    assert.deepEqual(JSON.parse(request.body), { templateId: 'invoice', data, ...selection });
  }
});

test('rejects invalid inputs before sending any authenticated request', async () => {
  const { client, calls } = transport(() => Response.json({}));
  assert.throws(() => new BitavuClient({ apiKey: credentials + '\n' }), /valid Bitavu API key/);
  assert.throws(() => new BitavuClient({ apiKey: credentials, apiOrigin: 'https://example.test' }), /supported Bitavu API origin/);
  await assert.rejects(client.getTemplate('../other', 1), /templateId/);
  await assert.rejects(client.getTemplate('invoice', Number.MAX_SAFE_INTEGER + 1), /revision/);
  await assert.rejects(client.renderPdf({ ...operation, revision: 2, baseRevision: 1 }), /baseRevision/);
  await assert.rejects(client.renderPdf({ ...operation, revision: 2, data: new Date() }), /JSON object/);
  await assert.rejects(client.renderPdf({ ...operation, revision: 2, data: { amount: 1n } }), /JSON object/);
  await assert.rejects(client.renderPdf({ ...operation, revision: 2, idempotencyKey: 'short' }), /idempotencyKey/);
  assert.equal(calls.length, 0);
});

test('exposes safe failure metadata and does not retry a render', async () => {
  const { client, calls } = transport(() => Response.json({
    code: 'RENDER_BUSY', message: 'Echo of ' + credentials,
  }, { status: 429, headers: { 'Retry-After': '2', 'X-Bitavu-Request-Id': requestId } }));
  await assert.rejects(client.renderPdf({ ...operation, revision: 2 }), error => {
    assert.ok(error instanceof BitavuApiError);
    assert.equal(error.status, 429);
    assert.equal(error.code, 'RENDER_BUSY');
    assert.equal(error.requestId, requestId);
    assert.equal(error.retryAfterMs, 2000);
    assert.ok(!String(error).includes(credentials) && !JSON.stringify(error).includes(credentials));
    return true;
  });
  assert.equal(calls.length, 1);
});

test('rejects a malformed contract or a non-PDF successful response', async () => {
  const { client } = transport(url => url.endsWith('/render')
    ? new Response('invalid', { headers: { 'Content-Type': 'application/pdf' } })
    : Response.json({ ...detail, bindings: [{}] }));
  await assert.rejects(client.getTemplate('invoice', 2), BitavuApiError);
  await assert.rejects(client.renderPdf({ ...operation, revision: 2 }), BitavuApiError);
});

test('cancels with the caller signal and sanitizes transport errors', async () => {
  const controller = new AbortController();
  const { client, calls } = transport(() => { throw new Error(credentials); });
  controller.abort();
  await assert.rejects(client.checkCredentials({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
  await assert.rejects(client.checkCredentials(), error => {
    assert.ok(error instanceof BitavuTransportError);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.ok(!String(error).includes(credentials));
    return true;
  });
});
