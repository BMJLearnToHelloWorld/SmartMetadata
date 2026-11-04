/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCsvAsyncImportResult,
  getCsvDocumentation,
  importCsvUrl,
  importEntityCsv,
} from './csvImport';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('importCsvUrl', () => {
  it('uses the naive plural route by default', () => {
    expect(
      importCsvUrl({ entityType: 'table', name: 'svc.db.schema.t', data: 'a,b', dryRun: true }),
    ).toBe('/v1/tables/name/svc.db.schema.t/importAsync?dryRun=true');
  });

  it('uses the special routes for service, glossary, glossaryTerm, and testCase', () => {
    expect(
      importCsvUrl({ entityType: 'databaseService', name: 'svc', data: '', recursive: true }),
    ).toBe('/v1/services/databaseServices/name/svc/importAsync?dryRun=true&recursive=true');
    expect(importCsvUrl({ entityType: 'glossary', name: 'g', data: '' })).toBe(
      '/v1/glossaries/name/g/importAsync?dryRun=true',
    );
    expect(importCsvUrl({ entityType: 'glossaryTerm', name: 'g.t', data: '' })).toBe(
      '/v1/glossaryTerms/name/g.t/importAsync?dryRun=true',
    );
    expect(
      importCsvUrl({
        entityType: 'testCase',
        name: 'svc.db.schema.t.col.test',
        data: '',
        targetEntityType: 'table',
      }),
    ).toBe(
      '/v1/dataQuality/testCases/name/svc.db.schema.t.col.test/importAsync?dryRun=true&targetEntityType=table',
    );
  });
});

describe('csvImport api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits CSV as text/plain PUT and returns the job id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ jobId: '42', message: 'queued' }),
    );
    const result = await importEntityCsv({
      entityType: 'table',
      name: 'svc.db.schema.t',
      data: 'name,description\nfoo,bar',
      dryRun: true,
    });
    expect(result).toEqual({ jobId: '42', message: 'queued' });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/tables/name/svc.db.schema.t/importAsync?dryRun=true');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'Content-Type': 'text/plain' });
    expect(init.body).toBe('name,description\nfoo,bar');
  });

  it('falls back to the entity documentation route on 404', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          headers: [{ name: 'name', required: true, description: 'Entity name' }],
        }),
      );
    const doc = await getCsvDocumentation('glossary');
    expect(doc.headers).toEqual([{ name: 'name', required: true, description: 'Entity name', examples: undefined }]);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/v1/glossaries/documentation/csv');
  });

  it('maps the import result counts', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        dryRun: false,
        status: 'partialSuccess',
        numberOfRowsProcessed: 3,
        numberOfRowsPassed: 2,
        numberOfRowsFailed: 1,
        importResultsCsv: 'name,status,details\nfoo,success,Entity created\nbar,failure,denied\n',
      }),
    );
    const result = await getCsvAsyncImportResult('42');
    expect(result.numberOfRowsProcessed).toBe(3);
    expect(result.numberOfRowsPassed).toBe(2);
    expect(result.numberOfRowsFailed).toBe(1);
    expect(result.status).toBe('partialSuccess');
    expect(result.importResultsCsv).toContain('bar,failure,denied');
  });
});
