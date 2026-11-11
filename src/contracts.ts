import type { TemplateCatalog, TemplateRevision, TemplateVersionPage } from './types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isList(value: unknown, check: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(check);
}

function isInteger(value: unknown, minimum: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isRevisionSummary(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && isString(value.id) && isString(value.name) && isString(value.studioUrl)
    && isInteger(value.revision, 1)
    && (value.createdAt === null || isInteger(value.createdAt, 0))
    && (value.updatedAt === null || isInteger(value.updatedAt, 0));
}

export function isCatalog(value: unknown): value is TemplateCatalog {
  return isRecord(value) && isList(value.templates, item => isRecord(item)
    && isString(item.id) && isString(item.name) && isString(item.studioUrl)
    && isList(item.path, isString) && isInteger(item.latestRevision, 1));
}

export function isVersionPage(value: unknown): value is TemplateVersionPage {
  return isRecord(value)
    && isList(value.versions, version => isRevisionSummary(version)
      && (version.title === null || isString(version.title)))
    && isRevisionSummary(value.latest)
    && (value.selected === null || isRevisionSummary(value.selected))
    && isInteger(value.page, 1) && isInteger(value.pageSize, 1)
    && isInteger(value.total, 0) && isInteger(value.pages, 0);
}

function isMissingInput(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isString(value.path) && typeof value.required === 'boolean';
}

export function isTemplateRevision(value: unknown): value is TemplateRevision {
  if (!isRevisionSummary(value)) return false;
  const review = value.inputReview;
  return isList(value.bindings, item => isMissingInput(item) && isString(item.type))
    && (value.exampleJson === null || isRecord(value.exampleJson))
    && (review === null || (isRecord(review)
      && isList(review.missing, isMissingInput) && isList(review.unused, isString)));
}
