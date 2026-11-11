export type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface BitavuClientOptions {
  /** An API key loaded by your application from server-side configuration. */
  apiKey: string;
  /** Defaults to the public Bitavu API. Use a key for the selected environment. */
  apiOrigin?: 'https://api.bitavu.com' | 'https://api-staging.bitavu.com';
  /** Deadline for the HTTP request and response body, in milliseconds. Defaults to 120000. */
  timeoutMs?: number;
  /** Custom transport. This function receives the authenticated request. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface TemplateListItem {
  readonly id: string;
  readonly name: string;
  readonly path: readonly string[];
  readonly latestRevision: number;
  readonly studioUrl: string;
}

export interface TemplateCatalog {
  readonly templates: readonly TemplateListItem[];
}

export interface TemplateRevisionSummary {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  /** Unix time in milliseconds. */
  readonly createdAt: number | null;
  /** Unix time in milliseconds. */
  readonly updatedAt: number | null;
  readonly studioUrl: string;
}

export interface TemplateVersion extends TemplateRevisionSummary {
  readonly title: string | null;
}

export interface TemplateVersionPage {
  readonly versions: readonly TemplateVersion[];
  readonly latest: TemplateRevisionSummary;
  readonly selected: TemplateRevisionSummary | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pages: number;
}

export interface TemplateVersionOptions extends RequestOptions {
  page?: number;
  pageSize?: number;
  /** Ask the server to include the summary of this revision, even on another page. */
  revision?: number;
}

export interface DataBinding {
  readonly path: string;
  readonly type: string;
  readonly required: boolean;
}

export interface MissingInput {
  readonly path: string;
  readonly required: boolean;
}

export interface InputReview {
  readonly missing: readonly MissingInput[];
  readonly unused: readonly string[];
}

export interface TemplateRevision<TExample extends object = JsonObject>
  extends TemplateRevisionSummary {
  readonly bindings: readonly DataBinding[];
  /** The JSON shape is determined by the template. A supplied type is a caller assertion. */
  readonly exampleJson: TExample | null;
  readonly inputReview: InputReview | null;
}

export interface SaveTemplateExampleInput<TExample extends object = JsonObject> {
  templateId: string;
  expectedRevision: number;
  exampleJson: TExample;
}

export type RenderSelection =
  | { revision: number; baseRevision?: never }
  | { revision: 'latest-published'; baseRevision?: number };

export type RenderPdfInput<TData extends object = JsonObject> = RenderSelection & {
  templateId: string;
  data: TData;
  /** Reuse this key only when retrying the same render with the same input. */
  idempotencyKey: string;
  mappingId?: string;
};

export interface RenderedPdf {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly revision: number | null;
  readonly pageCount: number | null;
  readonly requestId: string | null;
}
