# Generate an invoice PDF with Next.js

Use a saved Bitavu invoice template from a Next.js App Router application. The sample page submits a POST request to a Node.js Route Handler. The handler calls Bitavu from the server and returns `invoice.pdf` to the browser.

## 1. Prepare the invoice in Bitavu Studio

1. Open the **Studio invoice** starter report in [Bitavu Studio](https://studio.bitavu.com/) or choose your own invoice template. Preview it with example data and save a version.
2. In **Integrations → Prepare a template request**, select the saved revision. Open **Use in your app** and copy the `templateId` and numeric `revision`.
3. In **Integrations → API keys**, create a key scoped to your invoice template with **Generate PDFs** permission. Copy it when Studio displays it.

The sample data uses `invoice.number`, `invoice.date`, `invoice.due`, customer details under `client`, and line items under `items`. Compare these keys with the bindings in your saved revision.

## 2. Run the example

From the root of this repository, build the client and install the example:

```sh
npm ci
npm run build
npm ci --prefix examples/nextjs-invoice
```

Copy `examples/nextjs-invoice/.env.example` to `examples/nextjs-invoice/.env.local`. Fill in the API key, template ID, and saved revision. The `.env.local` file is ignored by Git.

```dotenv
BITAVU_API_KEY=<your Bitavu API key>
BITAVU_TEMPLATE_ID=<your template ID>
BITAVU_TEMPLATE_REVISION=<your saved revision number>
```

Start the local server:

```sh
npm run dev --prefix examples/nextjs-invoice
```

Open [http://127.0.0.1:3030](http://127.0.0.1:3030) and choose **Download invoice PDF**. Open `invoice.pdf` to see the fictional invoice `INV-1001` with two line items.

## 3. Add it to an existing Next.js app

Install the client and the server-only marker in your application:

```sh
npm install @bitavu/client server-only
```

Use [lib/invoice.ts](./lib/invoice.ts) as a starting point for your invoice service. It uses `import 'server-only'` so Next.js catches an accidental import from a Client Component. Read `BITAVU_API_KEY` from the server environment. Keep the key in your host's secret store in production and reserve `NEXT_PUBLIC_` variables for public values.

Use the [Route Handler](./app/api/invoices/sample/%5BoperationId%5D/route.ts) as a starting point for your download endpoint. Set `runtime = 'nodejs'` and pass `request.signal` to the SDK. Return the bytes with `Content-Type: application/pdf` and use `Cache-Control: no-store` for private invoices. The sample handler accepts requests from the local demo. In your app, authenticate the user, check their access to the invoice, and load its data from your server before rendering it. Apply your application's request forgery protection to the POST route.

The sample pins a saved revision. Its form keeps one operation ID for the current page so a repeat submission can reuse it. In a production job, store the operation ID alongside the render input. On retry, send the same ID with the same input. Assign a new ID to a new invoice render.

## Troubleshooting

- **The request fails.** Check the server console for the Bitavu status, code, and request ID. A 401 can indicate an invalid or expired key. A 403 can mean the key lacks **Generate PDFs** permission or template access.
- **The PDF is missing fields.** Compare the invoice object with the bindings for the saved revision in Studio. Check names, nested objects, and the line-item array.
- **The app cannot read the key.** Confirm that `.env.local` is at the example's project root and restart Next.js after editing it.
