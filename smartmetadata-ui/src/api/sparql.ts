/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord } from '@/api/json';
import { apiRequest } from './client';

/** Result serializations the playground can request, mirroring SparqlResultFormat. */
export type SparqlPlaygroundFormat =
  | 'json'
  | 'csv'
  | 'tsv'
  | 'xml'
  | 'turtle'
  | 'jsonld'
  | 'ntriples'
  | 'rdfxml';

export type SparqlPlaygroundInference = 'none' | 'rdfs' | 'owl' | 'custom';

export interface SparqlPlaygroundParams {
  query: string;
  format?: SparqlPlaygroundFormat;
  inference?: SparqlPlaygroundInference;
}

export interface RDFTerm {
  type?: string;
  value?: string | Record<string, unknown>;
  datatype?: string;
  'xml:lang'?: string;
  'its:dir'?: string;
}

export interface SparqlResponse {
  head?: { vars?: string[] };
  results?: { bindings?: Array<Record<string, RDFTerm>> };
}

export interface SparqlPlaygroundResult {
  format: SparqlPlaygroundFormat;
  body: string;
  parsed?: SparqlResponse;
  contentType: string;
  durationMs: number;
}

export interface SavedSparqlQuery {
  id: string;
  name: string;
  query: string;
  format: SparqlPlaygroundFormat;
  inference: SparqlPlaygroundInference;
  savedAt: number;
}

interface PersistedSparqlQuery {
  id?: unknown;
  name?: unknown;
  query?: unknown;
  format?: unknown;
  inference?: unknown;
  savedAt?: unknown;
}

export const DEFAULT_SPARQL_PREFIXES = [
  'PREFIX om: <https://open-metadata.org/ontology/>',
  'PREFIX dcat: <http://www.w3.org/ns/dcat#>',
  'PREFIX dct: <http://purl.org/dc/terms/>',
  'PREFIX prov: <http://www.w3.org/ns/prov#>',
  'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
  'PREFIX foaf: <http://xmlns.com/foaf/0.1/>',
  'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
  'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
  'PREFIX dqv: <http://www.w3.org/ns/dqv#>',
].join('\n');

export const DEFAULT_SPARQL_QUERY =
  `${DEFAULT_SPARQL_PREFIXES}\n\nSELECT ?s ?p ?o WHERE {\n  ?s ?p ?o\n} LIMIT 10`;

export const FORMAT_EXTENSIONS: Record<SparqlPlaygroundFormat, string> = {
  json: 'json',
  csv: 'csv',
  tsv: 'tsv',
  xml: 'xml',
  turtle: 'ttl',
  jsonld: 'jsonld',
  ntriples: 'nt',
  rdfxml: 'rdf',
};

const SPARQL_RESULT_MIME: Record<SparqlPlaygroundFormat, string> = {
  json: 'application/sparql-results+json',
  xml: 'application/sparql-results+xml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  turtle: 'text/turtle',
  rdfxml: 'application/rdf+xml',
  ntriples: 'application/n-triples',
  jsonld: 'application/ld+json',
};

const SPARQL_FORMATS: SparqlPlaygroundFormat[] = [
  'json',
  'csv',
  'tsv',
  'xml',
  'turtle',
  'jsonld',
  'ntriples',
  'rdfxml',
];

const SPARQL_INFERENCES: SparqlPlaygroundInference[] = ['none', 'rdfs', 'owl', 'custom'];

function normalizeSparqlFormat(format: unknown): SparqlPlaygroundFormat {
  return typeof format === 'string' &&
    (SPARQL_FORMATS as string[]).includes(format)
    ? (format as SparqlPlaygroundFormat)
    : 'json';
}

function normalizeSparqlInference(inference: unknown): SparqlPlaygroundInference {
  return typeof inference === 'string' &&
    (SPARQL_INFERENCES as string[]).includes(inference)
    ? (inference as SparqlPlaygroundInference)
    : 'none';
}

function normalizeSavedSparqlQuery(raw: PersistedSparqlQuery): SavedSparqlQuery | null {
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.query !== 'string' ||
    typeof raw.savedAt !== 'number'
  ) {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    query: raw.query,
    format: normalizeSparqlFormat(raw.format),
    inference: normalizeSparqlInference(raw.inference),
    savedAt: raw.savedAt,
  };
}

function normalizeQueryList(payload: unknown, key: string): SavedSparqlQuery[] {
  const rec = asRecord(payload);
  const rows = rec && Array.isArray(rec[key]) ? (rec[key] as PersistedSparqlQuery[]) : [];
  return rows.flatMap((item) => {
    const mapped = normalizeSavedSparqlQuery(item);
    return mapped ? [mapped] : [];
  });
}

/** Official rdfAPI: GET /v1/rdf/queries/saved. */
export function getSavedSparqlQueries(): Promise<SavedSparqlQuery[]> {
  return apiRequest<unknown>('/v1/rdf/queries/saved').then((payload) =>
    normalizeQueryList(payload, 'queries'),
  );
}

/** Official rdfAPI: PUT /v1/rdf/queries/saved with the full list. */
export function replaceSavedSparqlQueries(
  queries: SavedSparqlQuery[],
): Promise<SavedSparqlQuery[]> {
  return apiRequest<unknown>('/v1/rdf/queries/saved', {
    method: 'PUT',
    json: { queries },
  }).then((payload) => normalizeQueryList(payload, 'queries'));
}

/** Official rdfAPI: GET /v1/rdf/queries/templates. */
export function getSparqlQueryTemplates(): Promise<SavedSparqlQuery[]> {
  return apiRequest<unknown>('/v1/rdf/queries/templates').then((payload) =>
    normalizeQueryList(payload, 'queryTemplates'),
  );
}

/**
 * Official rdfAPI: PUT /v1/system/settings with config_type
 * sparqlQuerySettings. The endpoint is the same one the product
 * updateSetting helper targets; the response shape here is read
 * directly so the template list round-trips exactly.
 */
export function replaceSparqlQueryTemplates(
  queryTemplates: SavedSparqlQuery[],
): Promise<SavedSparqlQuery[]> {
  return apiRequest<unknown>('/v1/system/settings', {
    method: 'PUT',
    json: {
      config_type: 'sparqlQuerySettings',
      config_value: { queryTemplates },
    },
  }).then((payload) => {
    const rec = asRecord(payload);
    return normalizeQueryList(rec?.config_value, 'queryTemplates');
  });
}

export interface RdfStatus {
  enabled?: boolean;
  inference?: { availableLevels?: string[] };
}

/** Official rdfAPI: GET /v1/rdf/status. */
export function fetchRdfConfig(): Promise<RdfStatus> {
  return apiRequest<RdfStatus>('/v1/rdf/status');
}

/**
 * Official rdfAPI executeSparqlQuery: POST /v1/rdf/sparql. The server
 * returns the result body in the requested serialization (JSON/XML/CSV/
 * TSV for SELECT/ASK; Turtle/N-Triples/RDF-XML/JSON-LD for
 * CONSTRUCT/DESCRIBE), so the body is read as text and only the JSON
 * shape is parsed for the tabular view.
 */
export async function runSparqlQuery(
  params: SparqlPlaygroundParams,
): Promise<SparqlPlaygroundResult> {
  const format = params.format ?? 'json';
  const inference = params.inference ?? 'none';
  const acceptMime = SPARQL_RESULT_MIME[format];
  const start = performance.now();
  const body = await apiRequest<string>('/v1/rdf/sparql', {
    json: { query: params.query, format, inference },
    headers: { Accept: acceptMime },
    response: 'text',
  });
  const durationMs = Math.round(performance.now() - start);
  let parsed: SparqlResponse | undefined;
  if (format === 'json') {
    try {
      parsed = JSON.parse(body) as SparqlResponse;
    } catch {
      parsed = undefined;
    }
  }
  return { format, body, parsed, contentType: acceptMime, durationMs };
}

/** Maps RDF status reasoning levels to the inference options a query can request. */
const PLAYGROUND_INFERENCE_BY_STATUS_LEVEL: Record<string, SparqlPlaygroundInference> = {
  CUSTOM: 'custom',
  NONE: 'none',
  OWL_DL: 'owl',
  OWL_LITE: 'owl',
  RDFS: 'rdfs',
};

export function getAvailableSparqlInferences(
  availableLevels: readonly string[] = [],
): SparqlPlaygroundInference[] {
  const available = new Set<SparqlPlaygroundInference>(['none']);
  for (const level of availableLevels) {
    const inference = PLAYGROUND_INFERENCE_BY_STATUS_LEVEL[level];
    if (inference) {
      available.add(inference);
    }
  }
  return [...available];
}

/**
 * Saved queries and templates can carry a level the server no longer
 * offers, so fall back to querying without inference rather than send a
 * level the server rejects.
 */
export function resolveSparqlInference(
  requested: SparqlPlaygroundInference,
  available: readonly SparqlPlaygroundInference[],
): SparqlPlaygroundInference {
  return available.includes(requested) ? requested : 'none';
}

function getTermLexicalValue(term?: RDFTerm): string {
  return typeof term?.value === 'string' ? term.value : '';
}

function escapeLexicalForm(lexicalForm: string): string {
  return lexicalForm
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function getLiteralSuffix(term?: RDFTerm): string {
  const language = term?.['xml:lang'] ?? '';
  const direction = term?.['its:dir'] ?? '';
  if (language) {
    return direction ? `@${language}--${direction}` : `@${language}`;
  }
  return term?.datatype ? `^^<${term.datatype}>` : '';
}

function getLiteralSyntax(term?: RDFTerm): string {
  return `"${escapeLexicalForm(getTermLexicalValue(term))}"${getLiteralSuffix(term)}`;
}

function getTermSyntax(term?: RDFTerm): string {
  switch (term?.type) {
    case 'uri':
      return `<${getTermLexicalValue(term)}>`;
    case 'bnode':
      return `_:${getTermLexicalValue(term)}`;
    case 'triple': {
      const triple = term?.value as
        | { subject?: RDFTerm; predicate?: RDFTerm; object?: RDFTerm }
        | undefined;
      if (!triple) {
        return '';
      }
      return `<<( ${getTermSyntax(triple.subject)} ${getTermSyntax(triple.predicate)} ${getTermSyntax(triple.object)} )>>`;
    }
    default:
      return getLiteralSyntax(term);
  }
}

/**
 * Renders a result term: a nested triple term uses full N-Triples syntax
 * (a bare lexical form inside a triple cannot be told apart from an IRI),
 * any other term renders as its lexical value.
 */
export function getTermDisplayText(term?: RDFTerm): string {
  return term?.type === 'triple' ? getTermSyntax(term) : getTermLexicalValue(term);
}
