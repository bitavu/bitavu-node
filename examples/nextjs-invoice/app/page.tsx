import { randomUUID } from 'node:crypto';
import { connection } from 'next/server';

export default async function Home() {
  await connection();
  const operationId = randomUUID();

  return (
    <main>
      <h1>Generate a sample invoice</h1>
      <p>Download an invoice PDF with fictional customer details and two line items.</p>
      <form method="post" action={'/api/invoices/sample/' + operationId}>
        <button type="submit">Download invoice PDF</button>
      </form>
    </main>
  );
}
