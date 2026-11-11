# Bitavu for Node.js

Generate PDF invoices, reports, and other documents from a saved Bitavu template and JSON data. The client includes TypeScript declarations and runs on Node.js 22.13 or newer in the Node.js 22, 24, and 26 release lines. It has no runtime dependencies.

```sh
npm install @bitavu/client
```

## Render a PDF

In [Bitavu Studio](https://studio.bitavu.com/), save a template revision. Use **Integrations → Prepare a template request** to get its ID, revision, and example JSON. Create an API key with **Generate PDFs** permission for that template.

Load the key from your application's server environment. Keep it in an ignored local environment file during development and in your hosting provider's secret store in production.

```ts
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { BitavuClient } from '@bitavu/client';

const apiKey = process.env.BITAVU_API_KEY;
if (!apiKey) throw new Error('Configure BITAVU_API_KEY.');

const client = new BitavuClient({ apiKey });
const operationId = randomUUID();

const pdf = await client.renderPdf({
  templateId: 'your-template-id',
  revision: 1,
  data: {
    invoice: { number: 'INV-1001' },
    items: [{ description: 'Design consultation', quantity: 1, unitPrice: 240 }],
  },
  idempotencyKey: operationId,
});

await writeFile('invoice.pdf', pdf.bytes);
console.log('Rendered revision', pdf.revision);
```

Replace the template ID, revision, and data with the values for your template. The client preserves the property names in your JSON. It returns the PDF bytes as a `Uint8Array` and includes the resolved revision, page count, and request ID when the API supplies them.

## Choose a revision

Set `revision` to a number to render that saved revision. Set `revision: 'latest-published'` and pass `baseRevision` to follow the current publication while checking compatibility against a revision you tested. If you omit `baseRevision`, Bitavu compares the current publication against the first published revision.

```ts
const pdf = await client.renderPdf({
  templateId,
  revision: 'latest-published',
  baseRevision: testedRevision,
  data,
  idempotencyKey: operationId,
}, { signal });
```

If the published revision is incompatible, the API returns HTTP 409 with `JSON_COMPATIBILITY`. If there is no publication, it returns HTTP 404 with `NOT_PUBLISHED`. You can pass `mappingId` in either mode when you use a mapping saved in Studio.

## Read templates and save examples

| Method | Returns |
| --- | --- |
| `checkCredentials()` | Completes if the key is valid. |
| `listTemplates()` | The accessible templates, including each folder path, latest saved revision, and Studio link. |
| `getTemplateVersions(templateId, { page, pageSize, revision })` | A page of saved-version summaries with the latest revision and an optional selected revision. |
| `getTemplate(templateId, revision)` | A saved revision's Studio link, data bindings, example JSON, and input review. |
| `saveTemplateExample({ templateId, expectedRevision, exampleJson })` | The new saved revision and its updated input review. |

Template reads require **Read templates**. Saving examples requires **Save template examples**. Use the latest saved revision as `expectedRevision`. On a conflict, fetch the latest revision and check its bindings before deciding whether to save again.

Fixed response fields are typed. Template data can be your own TypeScript interface. When you call `getTemplate<YourData>(…)`, the type argument describes the JSON shape you expect. Validate the saved example in your app if its shape is uncertain.

```ts
interface InvoiceData {
  invoice: { number: string };
  items: { description: string; quantity: number; unitPrice: number }[];
}

const { exampleJson, inputReview, studioUrl } =
  await client.getTemplate<InvoiceData>(templateId, testedRevision);
```

`inputReview.missing` lists bindings absent from the saved example. `inputReview.unused` lists paths the template does not use. Both `exampleJson` and `inputReview` are `null` if the revision has no saved example.

## Errors and retries

`BitavuApiError` contains the HTTP status, API code, request ID, and retry delay when available. `BitavuTransportError` identifies timeouts and network failures. Pass an `AbortSignal` to cancel a request.

A request uses a deadline of two minutes by default. The caller controls retries. For the same render, reuse the operation ID with the same template, revision selection, and data. Respect `retryAfterMs` if returned. Use a new operation ID for a different render.

## Node.js and Next.js guide

Follow the [Bitavu Node.js and Next.js guide](https://bitavu.com/support/nodejs) to generate an invoice PDF with the Node.js client and return it as a download from a Next.js App Router Route Handler.

## License

MIT
