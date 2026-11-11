import { isCatalog, isRecord, isTemplateRevision, isVersionPage } from './contracts.js';
import { BitavuApiError, BitavuTransportError } from './errors.js';
import type {
  BitavuClientOptions, JsonObject, RenderedPdf, RenderPdfInput, RequestOptions,
  SaveTemplateExampleInput, TemplateCatalog, TemplateRevision, TemplateVersionOptions,
  TemplateVersionPage,
} from './types.js';

const productionOrigin = 'https://api.bitavu.com';
const stagingOrigin = 'https://api-staging.bitavu.com';
const maxErrorBytes = 65_536;
const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export class BitavuClient {
  readonly #apiKey: string;
  readonly #apiOrigin: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor({ apiKey, apiOrigin = productionOrigin, timeoutMs = 120_000, fetch = globalThis.fetch }: BitavuClientOptions) {
    if (typeof apiKey !== 'string' || !/^[A-Za-z0-9_.~+/-]+=*(?![\s\S])/.test(apiKey)) {
      throw new TypeError('Provide a valid Bitavu API key.');
    }
    if (apiOrigin !== productionOrigin && apiOrigin !== stagingOrigin) {
      throw new TypeError('Use a supported Bitavu API origin.');
    }
    assertInteger(timeoutMs, 'timeoutMs', 2_147_483_647);
    this.#apiKey = apiKey;
    this.#apiOrigin = apiOrigin;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetch;
  }

  /** Checks authentication without reading templates or using render credits. */
  async checkCredentials(options: RequestOptions = {}): Promise<void> {
    await this.#json('/v1/credentials/check', options, isAuthenticated);
  }

  /** Lists accessible templates and their latest saved revisions. */
  listTemplates(options: RequestOptions = {}): Promise<TemplateCatalog> {
    return this.#json('/v1/templates', options, isCatalog);
  }

  /** Returns metadata, bindings and the saved example for the selected revision. */
  async getTemplate<TExample extends object = JsonObject>(
    templateId: string, revision: number, options: RequestOptions = {},
  ): Promise<TemplateRevision<TExample>> {
    assertInteger(revision, 'revision');
    const result = await this.#json(templatePath(templateId) + '?revision=' + revision, options, isTemplateRevision);
    return result as TemplateRevision<TExample>;
  }

  /** Returns a page of saved-version summaries, newest first. */
  async getTemplateVersions(
    templateId: string, { page = 1, pageSize = 10, revision, signal }: TemplateVersionOptions = {},
  ): Promise<TemplateVersionPage> {
    assertInteger(page, 'page', 10_000);
    assertInteger(pageSize, 'pageSize', 50);
    const query = new URLSearchParams({ summary: 'true', page: String(page), pageSize: String(pageSize) });
    if (revision !== undefined) {
      assertInteger(revision, 'revision');
      query.set('revision', String(revision));
    }
    return this.#json(templatePath(templateId) + '/versions?' + query, signal ? { signal } : {}, isVersionPage);
  }

  /** Saves example data as a new revision, using the latest saved revision as a precondition. */
  async saveTemplateExample<TExample extends object>(
    input: SaveTemplateExampleInput<TExample>, options: RequestOptions = {},
  ): Promise<TemplateRevision<TExample>> {
    const path = templatePath(input.templateId) + '/example';
    assertInteger(input.expectedRevision, 'expectedRevision', Number.MAX_SAFE_INTEGER - 1);
    const exampleJson = serializeObject(input.exampleJson, 'exampleJson');
    const result = await this.#json(path, options, isTemplateRevision, {
      expectedRevision: input.expectedRevision,
      exampleJson,
    });
    return result as TemplateRevision<TExample>;
  }

  /** Renders a PDF using an explicit revision or the latest compatible publication. */
  async renderPdf<TData extends object>(
    input: RenderPdfInput<TData>, options: RequestOptions = {},
  ): Promise<RenderedPdf> {
    templatePath(input.templateId);
    if (input.revision === 'latest-published') {
      if (input.baseRevision !== undefined) assertInteger(input.baseRevision, 'baseRevision');
    } else {
      assertInteger(input.revision, 'revision');
      if (input.baseRevision !== undefined) {
        throw new TypeError('baseRevision is only valid with latest-published.');
      }
    }
    if (typeof input.idempotencyKey !== 'string'
      || !/^[A-Za-z0-9_-]{16,128}(?![\s\S])/.test(input.idempotencyKey)) {
      throw new TypeError('Use 16 to 128 ASCII letters, digits, underscores or hyphens for idempotencyKey.');
    }
    if (input.mappingId !== undefined && (typeof input.mappingId !== 'string' || !input.mappingId.trim())) {
      throw new TypeError('mappingId must be a non-empty string.');
    }

    const data = serializeObject(input.data, 'data');
    return this.#request('/v1/render', options, 'application/pdf', async response => {
      if (!hasMediaType(response, 'application/pdf')) throw this.#unexpectedResponse(response);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!pdfSignature.every((byte, index) => bytes[index] === byte)) {
        throw this.#unexpectedResponse(response);
      }
      return {
        bytes,
        revision: positiveHeader(response, 'X-Bitavu-Revision'),
        pageCount: positiveHeader(response, 'X-Bitavu-Pages'),
        requestId: this.#requestId(response),
      };
    }, {
      templateId: input.templateId,
      revision: input.revision,
      baseRevision: input.baseRevision,
      mappingId: input.mappingId,
      data,
    }, input.idempotencyKey);
  }

  #json<T>(
    path: string, options: RequestOptions, isExpected: (value: unknown) => value is T,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.#request(path, options, 'application/json', async response => {
      if (!hasMediaType(response, 'application/json')) throw this.#unexpectedResponse(response);
      const text = await response.text();
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw this.#unexpectedResponse(response);
      }
      if (!isExpected(value)) throw this.#unexpectedResponse(response);
      return value;
    }, body);
  }

  async #request<T>(
    path: string, { signal }: RequestOptions, accept: string,
    read: (response: Response) => Promise<T>, body?: Record<string, unknown>, idempotencyKey?: string,
  ): Promise<T> {
    signal?.throwIfAborted();
    const deadline = AbortSignal.timeout(this.#timeoutMs);
    const headers = new Headers({ Accept: accept, Authorization: 'Bearer ' + this.#apiKey });
    if (idempotencyKey !== undefined) headers.set('Idempotency-Key', idempotencyKey);

    const init: RequestInit & { cache: 'no-store' } = {
      method: 'GET',
      headers,
      redirect: 'error',
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    };
    if (body !== undefined) {
      init.method = 'POST';
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(body);
    }

    let response: Response | undefined;
    try {
      response = await this.#fetch(this.#apiOrigin + path, init);
      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response);
        throw new BitavuApiError({
          status: response.status,
          code: await readErrorCode(response, this.#apiKey),
          requestId: this.#requestId(response),
          ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        });
      }
      return await read(response);
    } catch (error) {
      signal?.throwIfAborted();
      if (deadline.aborted) throw new BitavuTransportError('TIMEOUT');
      if (error instanceof BitavuApiError) throw error;
      throw new BitavuTransportError('NETWORK_ERROR');
    } finally {
      if (!response?.bodyUsed) void response?.body?.cancel().catch(() => {});
    }
  }

  #requestId(response: Response): string | null {
    const value = response.headers.get('X-Bitavu-Request-Id');
    return value && value !== this.#apiKey
      && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value) ? value : null;
  }

  #unexpectedResponse(response: Response): BitavuApiError {
    return new BitavuApiError({
      status: response.status, code: null, requestId: this.#requestId(response), invalidResponse: true,
    });
  }
}

function templatePath(id: string): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}(?![\s\S])/.test(id)) {
    throw new TypeError('Use 1 to 80 ASCII letters, digits, underscores or hyphens for templateId.');
  }
  return '/v1/templates/' + id;
}

function assertInteger(value: number, name: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(name + ' must be an integer from 1 to ' + maximum + '.');
  }
}

function serializeObject(value: unknown, name: string): Record<string, unknown> {
  let serialized: unknown;
  if (isRecord(value)) {
    try {
      serialized = JSON.parse(JSON.stringify(value));
    } catch {
      // Use a fixed message even when a user-defined serializer throws.
    }
  }
  if (!isRecord(serialized)) throw new TypeError(name + ' must be serializable as a JSON object.');
  return serialized;
}

function isAuthenticated(value: unknown): value is { authenticated: true } {
  return isRecord(value) && value.authenticated === true;
}

function hasMediaType(response: Response, expected: string): boolean {
  return response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() === expected;
}

function positiveHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - Date.now());
  return Number.isSafeInteger(ms) ? ms : undefined;
}

async function readErrorCode(response: Response, apiKey: string): Promise<string | null> {
  if (!hasMediaType(response, 'application/json') || !response.body) return null;
  const length = response.headers.get('Content-Length');
  if (length && Number(length) > maxErrorBytes) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxErrorBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const value: unknown = JSON.parse(text + decoder.decode());
    const code = isRecord(value) ? value.code : undefined;
    return typeof code === 'string' && code !== apiKey && /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}
