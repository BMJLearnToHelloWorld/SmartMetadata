/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { FILTER_LUCENE_FIELD, luceneTerm, type FacetId } from './searchQuery';

/**
 * Advanced search builder, Lucene surface edition.
 *
 * The official builder (AdvanceSearchModal + QueryBuilder) produces an ES
 * QueryFilter JSON, but this console's only verified search surface is
 * GET /v1/search/query?q=<Lucene> (see search.ts / composeSearchQuery).
 * This builder therefore composes Lucene clauses from the same facet-field
 * table the console already searches on, instead of emitting a query_filter
 * payload whose backend acceptance is unverified. Nested groups, OR and
 * multi-operator trees are outside that surface and stay residual.
 */
export interface AdvancedSearchRow {
  field: FacetId;
  value: string;
}

/** Field options are the FILTER_LUCENE_FIELD keys, in table order. */
export const ADVANCED_SEARCH_FIELDS = Object.keys(FILTER_LUCENE_FIELD) as FacetId[];

export function advancedClauses(rows: AdvancedSearchRow[]): string[] {
  return rows
    .map((row) => ({ field: FILTER_LUCENE_FIELD[row.field], value: row.value.trim() }))
    .filter((row) => row.value.length > 0)
    .map((row) => luceneTerm(row.field, row.value));
}

const LUCENE_FIELD_BY_NAME = new Map(Object.entries(FILTER_LUCENE_FIELD).map(([id, field]) => [field, id as FacetId]));

/** Split on top-level ` AND `, keeping quoted segments (which may contain AND) intact. */
function splitTopLevelAnd(query: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const char of query) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    current += char;
    if (!quoted && current.endsWith(' AND ')) {
      parts.push(current.slice(0, -5));
      current = '';
    }
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

const CLAUSE_PATTERN = /^([A-Za-z0-9_.]+):(?:"((?:\\.|[^"\\])*)"|(\S+))$/;

function unescapeLucene(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

export interface ParsedAdvancedQuery {
  freeText: string;
  rows: AdvancedSearchRow[];
}

/**
 * Parse back only clauses this builder can produce: a field from
 * FILTER_LUCENE_FIELD with a quoted or bare value. Anything else stays in
 * freeText, so hand-written Lucene is never silently dropped or rewritten.
 */
export function parseAdvancedQuery(query: string): ParsedAdvancedQuery {
  const freeParts: string[] = [];
  const rows: AdvancedSearchRow[] = [];
  for (const part of splitTopLevelAnd(query.trim())) {
    const match = CLAUSE_PATTERN.exec(part);
    const fieldId = match ? LUCENE_FIELD_BY_NAME.get(match[1]) : undefined;
    if (match && fieldId) {
      rows.push({ field: fieldId, value: unescapeLucene(match[2] ?? match[3] ?? '') });
    } else {
      freeParts.push(part);
    }
  }
  return { freeText: freeParts.join(' AND '), rows };
}

export function composeAdvancedQuery(freeText: string, rows: AdvancedSearchRow[]): string {
  const clauses = [...advancedClauses(rows)];
  const trimmed = freeText.trim();
  if (trimmed && trimmed !== '*') {
    clauses.unshift(trimmed);
  }
  return clauses.length ? clauses.join(' AND ') : '*';
}
