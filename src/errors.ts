export class BitavuApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;

  /** @internal */
  constructor(options: {
    status: number;
    code: string | null;
    requestId: string | null;
    retryAfterMs?: number;
    invalidResponse?: boolean;
  }) {
    super(options.invalidResponse
      ? 'Bitavu returned an unexpected response.'
      : 'Bitavu API returned HTTP ' + options.status + '.');
    this.name = 'BitavuApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export class BitavuTransportError extends Error {
  readonly code: 'TIMEOUT' | 'NETWORK_ERROR';

  /** @internal */
  constructor(code: 'TIMEOUT' | 'NETWORK_ERROR') {
    super(code === 'TIMEOUT'
      ? 'The Bitavu request timed out.'
      : 'The Bitavu request could not be completed.');
    this.name = 'BitavuTransportError';
    this.code = code;
  }
}
