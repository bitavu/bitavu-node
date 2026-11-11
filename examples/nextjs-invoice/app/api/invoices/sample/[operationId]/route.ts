import { BitavuApiError, BitavuTransportError } from '@bitavu/client';
import { renderSampleInvoice } from '../../../../../lib/invoice';

export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store' };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin');
  if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)
    || (origin !== null && origin !== 'http://' + host)) {
    return Response.json({ error: 'This sample is for local use.' }, { status: 403, headers: noStore });
  }

  const { operationId } = await params;
  if (!uuid.test(operationId)) {
    return Response.json({ error: 'Use a UUID for the operation ID.' }, { status: 400, headers: noStore });
  }

  try {
    const pdf = await renderSampleInvoice(operationId, request.signal);
    return new Response(pdf.bytes, {
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="invoice.pdf"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof BitavuApiError) {
      console.warn('Bitavu render failed', { status: error.status, code: error.code, requestId: error.requestId });
    } else if (error instanceof BitavuTransportError) {
      console.warn('Bitavu transport failed', { code: error.code });
    } else {
      console.warn('The sample render could not run. Check the server configuration.');
    }
    return Response.json({ error: 'Could not generate the invoice PDF.' }, { status: 502, headers: noStore });
  }
}
