import 'server-only';
import { BitavuClient } from '@bitavu/client';

interface InvoiceData {
  invoice: { number: string; date: string; due: string };
  client: { name: string; address: string };
  items: { description: string; quantity: number; unitPrice: number }[];
  notes: string;
}

const invoice: InvoiceData = {
  invoice: { number: 'INV-1001', date: '2026-11-01', due: '2026-11-15' },
  client: { name: 'Example Customer', address: '100 Example Street' },
  items: [
    { description: 'Design consultation', quantity: 1, unitPrice: 240 },
    { description: 'Layout review', quantity: 2, unitPrice: 90 },
  ],
  notes: 'Fictional invoice for testing the integration.',
};

let client: BitavuClient | undefined;

export async function renderSampleInvoice(operationId: string, signal: AbortSignal) {
  const apiKey = process.env.BITAVU_API_KEY;
  const templateId = process.env.BITAVU_TEMPLATE_ID;
  const revision = Number(process.env.BITAVU_TEMPLATE_REVISION);

  if (!apiKey || !templateId || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('Configure the Bitavu API key, template ID and saved revision.');
  }

  client ??= new BitavuClient({ apiKey });
  return client.renderPdf({ templateId, revision, data: invoice, idempotencyKey: operationId }, { signal });
}
