/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RestClient } from './client.js';

/**
 * The RDF tools (`shacl_validate`, `ontology_describe`) over the /v1/rdf
 * REST endpoints.
 *
 * Two deliberate gaps versus the server-side tools, both recorded in the
 * ADR: the REST validate endpoint reports conformance only through the
 * `OM-SHACL-Conforms` header, so `violationCount` is unavailable here and
 * is omitted rather than counted out of the report text; and a
 * `resource` DESCRIBE reads instance data through the triplestore, which
 * has no REST counterpart this batch — it fails with an explicit Batch C
 * error instead of a silent fallback or a fabricated DESCRIBE.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

/** Smallest maxBytes the tools accept. */
export const RDF_MIN_BYTES = 1024;
/** Default maxBytes for the RDF tools — the pin's RdfBody.maxBytes() is
 * 80000 (0.8 × the 100000 dispatch cap), not the review's 100000. */
export const RDF_MAX_BYTES_DEFAULT = 80_000;
/** Longest IRI the validator accepts. */
export const RDF_IRI_MAX_LENGTH = 2048;

export function clampRdfMaxBytes(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : RDF_MAX_BYTES_DEFAULT;
  return Math.min(Math.max(raw, RDF_MIN_BYTES), RDF_MAX_BYTES_DEFAULT);
}

export interface BoundedBody {
  value: string;
  truncated: boolean;
  byteCount: number;
}

/**
 * Cut a response to `maxBytes` on a UTF-8 boundary, so the cut never splits
 * a code point. `byteCount` is the ORIGINAL byte length — the caller needs
 * to know how much was withheld, not just what survived.
 */
export function boundBody(response: string, maxBytes: number): BoundedBody {
  const bytes = new TextEncoder().encode(response ?? '');
  let end = Math.min(bytes.length, maxBytes);
  // Back off any UTF-8 continuation byte (0b10xxxxxx).
  while (end < bytes.length && end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
    end -= 1;
  }
  return {
    value: new TextDecoder().decode(bytes.subarray(0, end)),
    truncated: bytes.length > maxBytes,
    byteCount: bytes.length,
  };
}

/**
 * An entity IRI must be a hierarchical http(s)://host/... form. Requiring a
 * host rejects opaque URIs such as `https:foo` that would otherwise slip
 * past a scheme-only check. Unsafe characters (control characters,
 * whitespace, angle brackets, quotes, backticks) are rejected because they
 * could break out of an angle-bracket-delimited IRI reference.
 */
export function validateEntityIri(raw: string | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const candidate = raw.trim();
  if (candidate === '' || candidate.length > RDF_IRI_MAX_LENGTH) {
    return null;
  }
  for (let i = 0; i < candidate.length; i++) {
    const code = candidate.charCodeAt(i);
    const ch = candidate[i];
    if (
      code < 0x20 ||
      code === 0x7f ||
      ch === ' ' ||
      ch === '<' ||
      ch === '>' ||
      ch === '"' ||
      ch === "'" ||
      ch === '`'
    ) {
      return null;
    }
  }
  try {
    // A valid entity IRI is a hierarchical http(s)://host/... form. The
    // '//' is load-bearing: WHATWG URL parsing would otherwise read the
    // opaque 'https:foo' as host 'foo', which java.net.URI rightly rejects
    // for having no authority.
    if (!/^https?:\/\//i.test(candidate)) {
      return null;
    }
    const url = new URL(candidate);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '') {
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function createBaseUriCache(): { get: (client: RestClient) => Promise<string> } {
  let cached: string | null = null;
  return {
    async get(client: RestClient): Promise<string> {
      if (cached !== null) {
        return cached;
      }
      // A wrong base URI would validate the wrong entity; a failed status
      // call is an explicit error, never a guessed base.
      const status = await client.request<{ baseUri?: string }>('/v1/rdf/status');
      if (typeof status.baseUri !== 'string' || status.baseUri === '') {
        throw new Error('RDF status did not report a baseUri, so the entity URI cannot be built');
      }
      cached = status.baseUri;
      return cached;
    },
  };
}

/** The RDF base URI, cached in-process for the lifetime of the server. */
export const baseUriCache = createBaseUriCache();

export interface ShaclValidateArgs {
  entityId?: string;
  entityType?: string;
  entityUri?: string;
  fullGraph?: boolean;
  format?: string;
  maxBytes?: number;
}

export interface ShaclValidateResult {
  scope: 'entity' | 'full-graph';
  entityUri?: string;
  conforms: boolean;
  format: string;
  mediaType: string;
  report: string;
  truncated: boolean;
  byteCount: number;
}

function normalizeShaclFormat(format: string | undefined): 'turtle' | 'jsonld' {
  const normalized = (format ?? 'turtle').toLowerCase();
  if (normalized === 'turtle' || normalized === 'jsonld') {
    return normalized;
  }
  throw new Error(`'format' must be 'turtle' or 'jsonld', got '${format}'`);
}

/**
 * Validate one entity's subgraph, or the whole dataset, against the
 * canonical SHACL shapes. The three inputs are mutually exclusive, and a
 * full-graph run must say so explicitly: it loads the entire triplestore
 * into memory.
 */
export async function shaclValidate(
  client: RestClient,
  args: ShaclValidateArgs,
): Promise<ShaclValidateResult> {
  const hasUri = typeof args.entityUri === 'string' && args.entityUri.trim() !== '';
  const hasId = typeof args.entityId === 'string' && args.entityId.trim() !== '';
  const hasType = typeof args.entityType === 'string' && args.entityType.trim() !== '';
  if (hasUri && (hasId || hasType)) {
    throw new Error("Use either 'entityUri' or 'entityId' with 'entityType', not both");
  }
  if (hasId !== hasType) {
    throw new Error("'entityId' and 'entityType' must be given together");
  }
  if (!hasUri && !hasId && args.fullGraph !== true) {
    throw new Error(
      'Full-graph SHACL validation requires fullGraph=true because it loads the entire triplestore into memory',
    );
  }
  const format = normalizeShaclFormat(args.format);
  const maxBytes = clampRdfMaxBytes(args.maxBytes);
  let entityUri: string | undefined;
  if (hasUri) {
    entityUri = args.entityUri!.trim();
  } else if (hasId && hasType) {
    const baseUri = await baseUriCache.get(client);
    entityUri = `${baseUri}entity/${args.entityType!.trim()}/${args.entityId!.trim()}`;
  }
  const { text, headers } = await client.requestText('/v1/rdf/validate', {
    method: 'POST',
    query: {
      ...(entityUri ? { entityUri } : {}),
      format,
    },
  });
  const bounded = boundBody(text, maxBytes);
  return {
    scope: entityUri ? 'entity' : 'full-graph',
    ...(entityUri ? { entityUri } : {}),
    conforms: headers.get('OM-SHACL-Conforms') === 'true',
    format,
    mediaType: headers.get('Content-Type') ?? '',
    report: bounded.value,
    truncated: bounded.truncated,
    byteCount: bounded.byteCount,
  };
}

export interface OntologyDescribeArgs {
  resource?: string;
  format?: string;
  maxBytes?: number;
}

export interface OntologyDescribeResult {
  scope: 'full-ontology';
  resource: string | null;
  format: string;
  mediaType: string;
  body: string;
  truncated: boolean;
  byteCount: number;
}

function normalizeOntologyFormat(format: string | undefined): string {
  const normalized = (format ?? 'turtle').toLowerCase();
  if (
    normalized === 'turtle' ||
    normalized === 'rdfxml' ||
    normalized === 'ntriples' ||
    normalized === 'jsonld'
  ) {
    return normalized;
  }
  throw new Error(
    `'format' must be one of 'turtle', 'rdfxml', 'ntriples', 'jsonld', got '${format}'`,
  );
}

/**
 * The bundled ontology document. A `resource` DESCRIBE reads instance data
 * through the triplestore and has no REST counterpart this batch — it fails
 * with an explicit error pointing at Batch C, never a silent fallback.
 * The default path works even with RDF off: the document is the same static
 * file the unauthenticated ontology endpoint serves.
 */
export async function ontologyDescribe(
  client: RestClient,
  args: OntologyDescribeArgs,
): Promise<OntologyDescribeResult> {
  if (typeof args.resource === 'string' && args.resource.trim() !== '') {
    const validated = validateEntityIri(args.resource);
    if (validated === null) {
      throw new Error("'resource' must be a valid absolute http(s) IRI");
    }
    throw new Error(
      'DESCRIBE of a single resource is not available in this batch (Batch C): ' +
        'it reads instance data through the triplestore, which has no REST counterpart yet',
    );
  }
  const format = normalizeOntologyFormat(args.format);
  const maxBytes = clampRdfMaxBytes(args.maxBytes);
  const { text, headers } = await client.requestText('/v1/rdf/ontology', {
    query: { format },
  });
  const bounded = boundBody(text, maxBytes);
  return {
    scope: 'full-ontology',
    resource: null,
    format,
    mediaType: headers.get('Content-Type') ?? '',
    body: bounded.value,
    truncated: bounded.truncated,
    byteCount: bounded.byteCount,
  };
}
