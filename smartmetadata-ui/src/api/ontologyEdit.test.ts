/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  acquireOntologyEditLock,
  applyOntologyChangeSet,
  cancelOntologyBulkJob,
  captureOntologyRelease,
  createOntologyChangeSet,
  deleteGlossaryTermWithImpact,
  explainOntologyInference,
  getOntologyBulkResultArtifact,
  getOntologyEditLock,
  getOntologyReleaseReview,
  getOntologyState,
  installOntologyPack,
  listOntologyChangeSets,
  listOntologyReleaseReviews,
  previewGlossaryTermDeleteImpact,
  releaseOntologyEditLock,
  renewOntologyEditLock,
  replaceOntologyChangeOperations,
  submitOntologyBulkOperation,
  suggestOntologyMappings,
  suggestOntologyRelationships,
  undoOntologyChangeSet,
} from './ontologyEdit';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

function bodyOf(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

const LEASE = { sessionId: 'sess-1', version: 3 };

describe('ontologyEdit API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('acquires, renews, reads and releases edit locks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ resourceType: 'ontology', resourceId: 'o1', holder: 'amy', sessionId: 'sess-1', version: 3, acquiredAt: 1, renewedAt: 2, expiresAt: 9 })),
    );
    const lock = await acquireOntologyEditLock({ resourceType: 'ontology', resourceId: 'o1', sessionId: 'sess-1' });
    expect(lock.holder).toBe('amy');
    expect(lastFetch().url).toContain('/api/v1/ontologyEditLocks/acquire');
    expect(lastFetch().init?.method).toBe('POST');
    await renewOntologyEditLock({ resourceType: 'ontology', resourceId: 'o1', sessionId: 'sess-1' });
    expect(lastFetch().url).toContain('/api/v1/ontologyEditLocks/renew');
    expect(lastFetch().init?.method).toBe('PUT');
    await getOntologyEditLock('ontology', 'o1');
    expect(lastFetch().url).toContain('/api/v1/ontologyEditLocks/ontology/o1');
    await releaseOntologyEditLock('ontology', 'o1', 'sess-1');
    expect(lastFetch().url).toContain('/api/v1/ontologyEditLocks/ontology/o1?sessionId=sess-1');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('creates change sets and runs the draft lifecycle', async () => {
    const draft = {
      id: 'cs-1',
      name: 'draft-1',
      displayName: 'Draft 1',
      fullyQualifiedName: 'draft-1',
      description: 'd',
      state: 'DRAFT',
      operations: [{ id: 'op-1', operationType: 'UPSERT_CONCEPT', state: 'ACTIVE', rationale: 'new' }],
      undoCursor: 1,
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(draft)));
    const created = await createOntologyChangeSet({ name: 'draft-1', displayName: 'Draft 1', description: 'd' });
    expect(created.operations).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/ontologyChangeSets');
    expect(lastFetch().init?.method).toBe('POST');
    await replaceOntologyChangeOperations('cs-1', { lease: LEASE, operations: [], undoCursor: 0 });
    expect(lastFetch().url).toContain('/api/v1/ontologyChangeSets/cs-1/operations');
    expect(lastFetch().init?.method).toBe('PUT');
    expect(bodyOf(lastFetch().init).lease).toEqual(LEASE);
    await undoOntologyChangeSet('cs-1', LEASE);
    expect(lastFetch().url).toContain('/api/v1/ontologyChangeSets/cs-1/undo');
    expect(bodyOf(lastFetch().init).lease).toEqual(LEASE);
    await applyOntologyChangeSet('cs-1', LEASE);
    expect(lastFetch().url).toContain('/api/v1/ontologyChangeSets/cs-1/apply');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [draft], paging: { total: 1 } })));
    const page = await listOntologyChangeSets({ state: 'DRAFT' });
    expect(page.data).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/ontologyChangeSets?state=DRAFT');
  });

  it('submits bulk operations and reads jobs and artifacts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ executionMode: 'SYNC', job: { id: 7, operation: 'UPSERT', status: 'COMPLETED', glossary: 'g1', dryRun: true, progress: 5, total: 5 } })),
    );
    const submission = await submitOntologyBulkOperation({
      glossaryId: 'g1',
      operation: 'UPSERT',
      dryRun: true,
      changeSetName: 'bulk-1',
      changeSetDescription: 'bulk',
      csv: 'name,description\na,b',
    });
    expect(submission.job?.id).toBe(7);
    expect(bodyOf(lastFetch().init).csv).toContain('name,description');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 7, operation: 'UPSERT', glossary: 'g1', dryRun: true, totalRows: 5, validRows: 4, invalidRows: 1, unchangedRows: 0, createCount: 4, updateCount: 0, findReplaceCount: 0, retypeCount: 0, errors: [{ row: 3, message: 'bad' }], errorsTruncated: false, generatedAt: 1, generatedBy: 'amy' })),
    );
    const artifact = await getOntologyBulkResultArtifact(7);
    expect(artifact.validRows).toBe(4);
    expect(artifact.errors).toEqual([{ row: 3, message: 'bad' }]);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 7, operation: 'UPSERT', status: 'CANCELLED', glossary: 'g1', dryRun: false, progress: 0, total: 0 })));
    const cancelled = await cancelOntologyBulkJob(7);
    expect(cancelled.status).toBe('CANCELLED');
    expect(lastFetch().url).toContain('/api/v1/ontology/bulk/jobs/7/cancel');
    expect(lastFetch().init?.method).toBe('PUT');
  });

  it('requests AI suggestions, reasoning explanations and domain drafts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ modelId: 'm1', generatedAt: 1, suggestions: [{ id: 's1', operation: { type: 'ADD_RELATIONSHIP' }, confidence: 0.9, rationale: 'why' }] })),
    );
    const rel = await suggestOntologyRelationships({ glossary: 'g1', sourceTermIds: ['t1'], candidateTermIds: ['t2'], relationshipTypeIds: ['r1'], maxSuggestions: 5 });
    expect(rel.suggestions[0]?.confidence).toBe(0.9);
    expect(lastFetch().url).toContain('/api/v1/ontology/ai/relationships/suggestions');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ modelId: 'm1', generatedAt: 1, suggestions: [{ id: 's2', operation: { type: 'UPSERT_MAPPING' }, targetLabel: 'ISO', confidence: 0.8, rationale: 'map' }] })),
    );
    const mappings = await suggestOntologyMappings({ glossary: 'g1', sourceTermIds: ['t1'], standards: ['ISO'], maxSuggestions: 5 });
    expect(mappings.suggestions[0]?.targetLabel).toBe('ISO');
    expect(lastFetch().url).toContain('/api/v1/ontology/ai/mappings/suggestions');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ glossary: 'g1', statement: 'A implies B', asserted: ['A'], inferred: ['B'], explanations: [{ statement: 'B', derivation: ['A', 'rule1'] }] })),
    );
    const explanation = await explainOntologyInference({ glossaryId: 'g1', statement: 'A implies B' });
    expect(explanation.inferred).toEqual(['B']);
    expect(lastFetch().url).toContain('/api/v1/ontology/reasoning/explanations');
  });

  it('installs packs and runs the publication flow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ packId: 'fhir', version: '1.0', moduleIds: ['m1'], targetGlossaryName: 'g1', dryRun: true, conceptCount: 10, relationshipCount: 2, importResults: [] })),
    );
    const installed = await installOntologyPack('fhir', { moduleIds: ['m1'], targetGlossaryName: 'g1', dryRun: true });
    expect(installed.conceptCount).toBe(10);
    expect(lastFetch().url).toContain('/api/v1/ontologyPacks/fhir/install');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ontologyId: 'o1', workingRevision: 12, lastReleaseRevision: 3, activationRevision: 3 })));
    const state = await getOntologyState('o1');
    expect(state.workingRevision).toBe(12);
    expect(lastFetch().url).toContain('/api/v1/ontologies/o1/state');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'rel-1', name: 'v1.2.0' })));
    await captureOntologyRelease('o1', { expectedWorkingRevision: 12, versionBump: 'MINOR', releaseNotes: 'notes' });
    expect(lastFetch().url).toContain('/api/v1/ontologies/o1/releases');
    expect(bodyOf(lastFetch().init).expectedWorkingRevision).toBe(12);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [{ release: { id: 'rel-1', name: 'v1.2.0' }, ontology: { id: 'o1' }, taskId: 't1', status: 'OPEN', assignees: [], callerCanVote: true, callerCompletesRule: false }] })),
    );
    const reviews = await listOntologyReleaseReviews('assigned');
    expect(reviews).toHaveLength(1);
    expect(lastFetch().url).toContain('/api/v1/ontologies/reviews?view=assigned');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ release: { id: 'rel-1' }, status: 'OPEN', assignees: [{ user: 'amy', vote: 'APPROVE' }], callerCanVote: true, callerCompletesRule: false })),
    );
    const review = await getOntologyReleaseReview('rel-1');
    expect(review.assignees[0]?.vote).toBe('APPROVE');
    expect(lastFetch().url).toContain('/api/v1/ontologyReleases/rel-1/review');
  });

  it('executes the impact delete with the preview token, cascade flag and reassignment target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toEqual({
          cascadeConfirmed: false,
          hardDelete: false,
          impactToken: 'tok-1',
          reassignChildrenTo: { id: 't2', type: 'glossaryTerm' },
        });
        return jsonResponse({ deleted: true });
      }),
    );
    await deleteGlossaryTermWithImpact('t1', {
      cascadeConfirmed: false,
      hardDelete: false,
      impactToken: 'tok-1',
      reassignChildrenTo: { id: 't2', type: 'glossaryTerm' },
    });
    expect(lastFetch().url).toContain('/api/v1/ontology/impacts/glossaryTerms/t1/delete');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('maps delete impact previews to the real report shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ resource: { id: 't1', type: 'glossaryTerm', name: 'term' }, operation: 'DELETE', baseVersion: 2, impactToken: 'tok-1', expiresAt: 99, children: [{ id: 'c1', name: 'child' }], relationships: [{}, {}], boundAssets: [{ id: 'a1' }], boundAssetCount: 3, boundAssetsTruncated: true, conceptMappings: [{}], shaclRecheckRequired: true })),
    );
    const impact = await previewGlossaryTermDeleteImpact('t1');
    expect(impact.boundAssetCount).toBe(3);
    expect(impact.boundAssetsTruncated).toBe(true);
    expect(impact.relationshipCount).toBe(2);
    expect(impact.mappingCount).toBe(1);
    expect(lastFetch().url).toContain('/api/v1/ontology/impacts/glossaryTerms/t1/delete');
  });
});
