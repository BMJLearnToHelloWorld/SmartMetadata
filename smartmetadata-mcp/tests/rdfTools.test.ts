/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { RestClient } from '../src/client.js';
import type { RuntimeConfig } from '../src/config.js';
import {
  boundBody,
  clampRdfMaxBytes,
  ontologyDescribe,
  shaclValidate,
  validateEntityIri,
} from '../src/rdf.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
  readOnly: false,
  disabledTools: [],
};

function textResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

describe('boundBody', () => {
  it('cuts on a UTF-8 boundary and reports the original byte length', () => {
    const body = 'a'.repeat(10) + 'é'.repeat(10);
    const bounded = boundBody(body, 12);
    // 10 ASCII bytes + 2 bytes of é fit in 12; the third é would split.
    expect(bounded.value).toBe('a'.repeat(10) + 'é');
    expect(bounded.truncated).toBe(true);
    expect(bounded.byteCount).toBe(30);
  });

  it('leaves a short body untouched', () => {
    const bounded = boundBody('hello', 1024);
    expect(bounded).toEqual({ value: 'hello', truncated: false, byteCount: 5 });
  });
});

describe('clampRdfMaxBytes', () => {
  it('defaults to the pin cap 80000 and clamps to [1024, 80000]', () => {
    expect(clampRdfMaxBytes(undefined)).toBe(80_000);
    expect(clampRdfMaxBytes(100_000)).toBe(80_000);
    expect(clampRdfMaxBytes(512)).toBe(1024);
    expect(clampRdfMaxBytes(4096)).toBe(4096);
  });
});

describe('validateEntityIri', () => {
  it('accepts hierarchical http(s) IRIs with a host', () => {
    expect(validateEntityIri('https://example.com/entity/table/123')).toBe(
      'https://example.com/entity/table/123',
    );
    expect(validateEntityIri('  http://example.com/x  ')).toBe('http://example.com/x');
  });

  it('rejects opaque, relative and unsafe IRIs', () => {
    expect(validateEntityIri('https:foo')).toBeNull();
    expect(validateEntityIri('/relative/path')).toBeNull();
    expect(validateEntityIri('ftp://example.com/x')).toBeNull();
    expect(validateEntityIri('https://example.com/a b')).toBeNull();
    expect(validateEntityIri('https://example.com/a<b')).toBeNull();
    expect(validateEntityIri(undefined)).toBeNull();
    expect(validateEntityIri('x'.repeat(2049))).toBeNull();
  });
});

describe('shaclValidate', () => {
  it('builds the entity URI from the cached baseUri and reads conformance from the header', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/rdf/status')) {
        return new Response(JSON.stringify({ baseUri: 'https://catalog.example.com/' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      expect(init?.method).toBe('POST');
      expect(url).toContain(
        '/v1/rdf/validate?entityUri=https%3A%2F%2Fcatalog.example.com%2Fentity%2Ftable%2Fabc&format=turtle',
      );
      return textResponse('@prefix sh: <http://www.w3.org/ns/shacl#> .', 200, {
        'Content-Type': 'text/turtle',
        'OM-SHACL-Conforms': 'true',
      });
    });
    const result = await shaclValidate(new RestClient(config, fetchImpl), {
      entityId: 'abc',
      entityType: 'table',
    });
    expect(result.scope).toBe('entity');
    expect(result.entityUri).toBe('https://catalog.example.com/entity/table/abc');
    expect(result.conforms).toBe(true);
    expect(result.format).toBe('turtle');
    expect(result.mediaType).toBe('text/turtle');
    expect(result.truncated).toBe(false);
    // violationCount is not available from the REST endpoint.
    expect('violationCount' in result).toBe(false);
  });

  it('rejects the three-way exclusivity violations before any HTTP call', async () => {
    const fetchImpl = vi.fn(async () => textResponse(''));
    const client = new RestClient(config, fetchImpl);
    await expect(
      shaclValidate(client, { entityUri: 'https://example.com/e/1', entityId: '1', entityType: 'table' }),
    ).rejects.toThrow(/either 'entityUri' or 'entityId'/);
    await expect(shaclValidate(client, { entityId: '1' })).rejects.toThrow(/must be given together/);
    await expect(shaclValidate(client, {})).rejects.toThrow(/fullGraph=true/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('validates the full graph when fullGraph is true', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/rdf/validate')) {
        return textResponse('report', 200, { 'OM-SHACL-Conforms': 'false' });
      }
      throw new Error(`unexpected ${url}`);
    });
    const result = await shaclValidate(new RestClient(config, fetchImpl), {
      fullGraph: true,
      format: 'jsonld',
      maxBytes: 1024,
    });
    expect(result.scope).toBe('full-graph');
    expect(result.conforms).toBe(false);
    expect(result.entityUri).toBeUndefined();
  });

  it('truncates an over-long report and reports the original byte length', async () => {
    const fetchImpl = vi.fn(async () => textResponse('r'.repeat(5000), 200, {
      'OM-SHACL-Conforms': 'true',
    }));
    const result = await shaclValidate(new RestClient(config, fetchImpl), {
      fullGraph: true,
      maxBytes: 1024,
    });
    expect(result.report).toBe('r'.repeat(1024));
    expect(result.truncated).toBe(true);
    expect(result.byteCount).toBe(5000);
  });
});

describe('ontologyDescribe', () => {
  it('returns the full ontology document with its media type', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/v1/rdf/ontology?format=ntriples');
      return textResponse('<http://example.com/a> <http://example.com/b> <http://example.com/c> .', 200, {
        'Content-Type': 'application/n-triples',
      });
    });
    const result = await ontologyDescribe(new RestClient(config, fetchImpl), {
      format: 'ntriples',
    });
    expect(result.scope).toBe('full-ontology');
    expect(result.resource).toBeNull();
    expect(result.format).toBe('ntriples');
    expect(result.mediaType).toBe('application/n-triples');
    expect(result.truncated).toBe(false);
  });

  it('rejects an illegal resource IRI before the Batch C error', async () => {
    const fetchImpl = vi.fn(async () => textResponse(''));
    const client = new RestClient(config, fetchImpl);
    await expect(ontologyDescribe(client, { resource: 'not an iri' })).rejects.toThrow(
      /must be a valid absolute http\(s\) IRI/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails a valid resource DESCRIBE with an explicit Batch C error', async () => {
    const fetchImpl = vi.fn(async () => textResponse(''));
    await expect(
      ontologyDescribe(new RestClient(config, fetchImpl), {
        resource: 'https://example.com/entity/table/1',
      }),
    ).rejects.toThrow(/Batch C/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
