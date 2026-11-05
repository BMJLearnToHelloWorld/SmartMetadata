/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  AcquireOntologyEditLockRequest,
  CreateOntologyAxiomRequest,
  CreateOntologyConceptRequest,
  CreateOntologyPropertyRequest,
  CreateOntologyChangeSetRequest,
  JsonPatchOperation,
  OntologyBulkJob,
  OntologyBulkRequest,
  OntologyBulkResultArtifact,
  OntologyBulkSubmission,
  OntologyBulkTemplate,
  OntologyChangeOperation,
  OntologyChangeSet,
  OntologyDeleteImpact,
  OntologyDomainDraftResult,
  OntologyEditLock,
  OntologyInferenceExplanation,
  OntologyMappingSuggestion,
  OntologyPackInstallResult,
  OntologyRelationshipSuggestion,
  OntologyReleaseReview,
  OntologyReleaseValidation,
  OntologyState,
  OntologySuggestionList,
} from '@/types/ontologyEdit';
import { apiRequest } from './client';

/**
 * Ontology studio edit surfaces (openmetadata-ui rest/ontologyAPI.ts):
 * edit locks, change sets, bulk authoring, AI suggestions, reasoning,
 * pack install, release capture/activation and release reviews. All paths
 * are the /v1 forms of the official client's relative paths.
 */
const EDIT_LOCKS_PATH = '/v1/ontologyEditLocks';
const CHANGE_SETS_PATH = '/v1/ontologyChangeSets';
const BULK_PATH = '/v1/ontology/bulk';
const AI_PATH = '/v1/ontology/ai';
const REASONING_PATH = '/v1/ontology/reasoning';
const PACKS_PATH = '/v1/ontologyPacks';
const ONTOLOGIES_PATH = '/v1/ontologies';
const RELEASES_PATH = '/v1/ontologyReleases';
const IMPACTS_PATH = '/v1/ontology/impacts/glossaryTerms';

/* ------------------------------------------------------------------ */
/* Edit locks                                                          */
/* ------------------------------------------------------------------ */

function mapEditLock(raw: Record<string, unknown>): OntologyEditLock {
  return {
    resourceType: asString(raw.resourceType) || undefined,
    resourceId: asString(raw.resourceId) || undefined,
    holder: asString(raw.holder) || undefined,
    sessionId: asString(raw.sessionId) || undefined,
    version: asNumber(raw.version),
    acquiredAt: asNumber(raw.acquiredAt),
    renewedAt: asNumber(raw.renewedAt),
    expiresAt: asNumber(raw.expiresAt),
  };
}

/**
 * Official acquireOntologyEditLock: POST /ontologyEditLocks/acquire.
 * AcquireOntologyEditLock requires resourceType + resourceId + sessionId;
 * the session id is client-generated (a UUID) and is the lease token the
 * caller must present again to renew, release, and to run change-set
 * commands (OntologyChangeSetCommand.lease = {sessionId, version}).
 */
export async function acquireOntologyEditLock(
  request: AcquireOntologyEditLockRequest,
): Promise<OntologyEditLock> {
  const raw = await apiRequest<Record<string, unknown>>(`${EDIT_LOCKS_PATH}/acquire`, {
    method: 'POST',
    json: request,
  });
  return mapEditLock(asRecord(raw) ?? {});
}

/** Official renewOntologyEditLock: PUT /ontologyEditLocks/renew, same body. */
export async function renewOntologyEditLock(
  request: AcquireOntologyEditLockRequest,
): Promise<OntologyEditLock> {
  const raw = await apiRequest<Record<string, unknown>>(`${EDIT_LOCKS_PATH}/renew`, {
    method: 'PUT',
    json: request,
  });
  return mapEditLock(asRecord(raw) ?? {});
}

/** Official getOntologyEditLock: GET /ontologyEditLocks/{resourceType}/{resourceId}. */
export async function getOntologyEditLock(
  resourceType: string,
  resourceId: string,
): Promise<OntologyEditLock> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${EDIT_LOCKS_PATH}/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
  );
  return mapEditLock(asRecord(raw) ?? {});
}

/**
 * Official releaseOntologyEditLock: DELETE with ?sessionId=. Only the
 * holder's session releases the lock; a 4xx here means the lock belongs
 * to someone else (or already expired) and must be surfaced, not hidden.
 */
export async function releaseOntologyEditLock(
  resourceType: string,
  resourceId: string,
  sessionId: string,
): Promise<void> {
  await apiRequest<void>(
    `${EDIT_LOCKS_PATH}/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
    { method: 'DELETE', query: { sessionId } },
  );
}

/* ------------------------------------------------------------------ */
/* Change sets (drafts)                                                */
/* ------------------------------------------------------------------ */

function mapChangeOperation(raw: Record<string, unknown>): OntologyChangeOperation | null {
  const id = asString(raw.id);
  const operationType = asString(raw.operationType);
  const state = asString(raw.state);
  if (!id || !operationType || (state !== 'ACTIVE' && state !== 'UNDONE')) {
    return null;
  }
  const ref = (value: unknown): Record<string, unknown> | undefined => {
    const rec = asRecord(value);
    return rec ?? undefined;
  };
  return {
    id,
    operationType: operationType as OntologyChangeOperation['operationType'],
    state,
    targetId: asString(raw.targetId) || undefined,
    baseVersion: asNumber(raw.baseVersion),
    relationship: ref(raw.relationship),
    mapping: ref(raw.mapping),
    axiom: ref(raw.axiom),
    term: ref(raw.term),
    glossary: ref(raw.glossary),
    concept: ref(raw.concept),
    property: ref(raw.property),
    sourceMemoryIds: Array.isArray(raw.sourceMemoryIds)
      ? raw.sourceMemoryIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    confidence: asNumber(raw.confidence),
    rationale: asString(raw.rationale) || undefined,
    modelId: asString(raw.modelId) || undefined,
  };
}

function mapChangeSet(raw: Record<string, unknown>): OntologyChangeSet | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) {
    return null;
  }
  const ontologyRefs = mapEntityRefs(raw.ontology ? [raw.ontology] : []);
  const operations = Array.isArray(raw.operations)
    ? raw.operations.flatMap((item) => {
        const mapped = mapChangeOperation(asRecord(item) ?? {});
        return mapped ? [mapped] : [];
      })
    : [];
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
    state: asString(raw.state) as OntologyChangeSet['state'],
    operations,
    undoCursor: asNumber(raw.undoCursor),
    ontology: ontologyRefs[0]
      ? {
          id: ontologyRefs[0].id,
          name: ontologyRefs[0].name,
          fullyQualifiedName: ontologyRefs[0].fullyQualifiedName,
        }
      : undefined,
    baseWorkingRevision: asNumber(raw.baseWorkingRevision),
    sourcePack: asString(raw.sourcePack) || undefined,
    owners: mapEntityRefs(raw.owners),
    version: asNumber(raw.version),
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
  };
}

/** Official listOntologyChangeSets: GET /v1/ontologyChangeSets?state=&limit=&after=. */
export function listOntologyChangeSets(query: {
  state?: string;
  limit?: number;
  after?: string;
}): Promise<Paged<OntologyChangeSet>> {
  return apiRequest<unknown>(CHANGE_SETS_PATH, {
    query: { state: query.state, limit: query.limit, after: query.after },
  }).then((payload) => parsePaged(payload, mapChangeSet));
}

/** Official getOntologyChangeSet: GET /v1/ontologyChangeSets/{id}. */
export async function getOntologyChangeSet(id: string): Promise<OntologyChangeSet> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${CHANGE_SETS_PATH}/${encodeURIComponent(id)}`,
  );
  const mapped = mapChangeSet(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Change set response was missing id and name');
  }
  return mapped;
}

/**
 * Official createOntologyChangeSet: POST /v1/ontologyChangeSets.
 * CreateOntologyChangeSet requires name + displayName + description.
 */
export async function createOntologyChangeSet(
  request: CreateOntologyChangeSetRequest,
): Promise<OntologyChangeSet> {
  const raw = await apiRequest<Record<string, unknown>>(CHANGE_SETS_PATH, {
    method: 'POST',
    json: request,
  });
  const mapped = mapChangeSet(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Create change set succeeded but the response had no change set');
  }
  return mapped;
}

/**
 * Official replaceOntologyChangeOperations: PUT /v1/ontologyChangeSets/{id}/operations.
 * UpdateOntologyChangeSet requires lease + operations + undoCursor: the
 * lease is the edit lock's {sessionId, version} and the cursor is the
 * caller's position in the operation list (operations beyond the cursor
 * are dropped on replace, which is also how undo/redo move the cursor).
 */
export async function replaceOntologyChangeOperations(
  id: string,
  request: { lease: { sessionId: string; version: number }; operations: OntologyChangeOperation[]; undoCursor: number },
): Promise<OntologyChangeSet> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${CHANGE_SETS_PATH}/${encodeURIComponent(id)}/operations`,
    { method: 'PUT', json: request },
  );
  const mapped = mapChangeSet(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Replace operations succeeded but the response had no change set');
  }
  return mapped;
}

async function changeSetCommand(
  id: string,
  action: 'undo' | 'redo' | 'submit' | 'discard' | 'apply',
  lease: { sessionId: string; version: number },
): Promise<OntologyChangeSet> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${CHANGE_SETS_PATH}/${encodeURIComponent(id)}/${action}`,
    { method: 'POST', json: { lease } },
  );
  const mapped = mapChangeSet(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error(`Change set ${action} succeeded but the response had no change set`);
  }
  return mapped;
}

/** Official undo/redo/submit/discard/apply: POST /v1/ontologyChangeSets/{id}/{action} with {lease}. */
export const undoOntologyChangeSet = (id: string, lease: { sessionId: string; version: number }) =>
  changeSetCommand(id, 'undo', lease);
export const redoOntologyChangeSet = (id: string, lease: { sessionId: string; version: number }) =>
  changeSetCommand(id, 'redo', lease);
export const submitOntologyChangeSet = (id: string, lease: { sessionId: string; version: number }) =>
  changeSetCommand(id, 'submit', lease);
export const discardOntologyChangeSet = (id: string, lease: { sessionId: string; version: number }) =>
  changeSetCommand(id, 'discard', lease);
export const applyOntologyChangeSet = (id: string, lease: { sessionId: string; version: number }) =>
  changeSetCommand(id, 'apply', lease);

/** Official deleteOntologyChangeSet: DELETE /v1/ontologyChangeSets/{id}. */
export async function deleteOntologyChangeSet(id: string): Promise<void> {
  await apiRequest<void>(`${CHANGE_SETS_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ */
/* Concept / property / axiom writes (graph canvas editing)           */
/* ------------------------------------------------------------------ */

/**
 * Official createOntologyConcept: POST /v1/ontologyConcepts.
 * CreateOntologyConcept requires name + ontology + conceptType.
 * The studio's canvas editing writes through the change-set draft where
 * the server applies them (see ChangeSetPanel); direct creates are for
 * the standalone concept editor and are real writes, not drafts.
 */
export async function createOntologyConcept(request: CreateOntologyConceptRequest): Promise<unknown> {
  return apiRequest<unknown>('/v1/ontologyConcepts', { method: 'POST', json: request });
}

/** Official patchOntologyConcept: PATCH /v1/ontologyConcepts/{id} (JSON Patch). */
export async function patchOntologyConcept(id: string, patch: JsonPatchOperation[]): Promise<unknown> {
  return apiRequest<unknown>(`/v1/ontologyConcepts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

/** Official createOntologyProperty: POST /v1/ontologyProperties. */
export async function createOntologyProperty(request: CreateOntologyPropertyRequest): Promise<unknown> {
  return apiRequest<unknown>('/v1/ontologyProperties', { method: 'POST', json: request });
}

/** Official patchOntologyProperty: PATCH /v1/ontologyProperties/{id} (JSON Patch). */
export async function patchOntologyProperty(id: string, patch: JsonPatchOperation[]): Promise<unknown> {
  return apiRequest<unknown>(`/v1/ontologyProperties/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

/** Official createOntologyAxiom: POST /v1/ontologyAxioms. */
export async function createOntologyAxiom(request: CreateOntologyAxiomRequest): Promise<unknown> {
  return apiRequest<unknown>('/v1/ontologyAxioms', { method: 'POST', json: request });
}

/** Official patchOntologyAxiom: PATCH /v1/ontologyAxioms/{id} (JSON Patch). */
export async function patchOntologyAxiom(id: string, patch: JsonPatchOperation[]): Promise<unknown> {
  return apiRequest<unknown>(`/v1/ontologyAxioms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

/* ------------------------------------------------------------------ */
/* Bulk authoring                                                      */
/* ------------------------------------------------------------------ */

function mapBulkTemplate(raw: Record<string, unknown>): OntologyBulkTemplate {
  return {
    fileName: asString(raw.fileName) || undefined,
    mediaType: asString(raw.mediaType) || undefined,
    headers: Array.isArray(raw.headers)
      ? raw.headers.filter((item): item is string => typeof item === 'string')
      : [],
    csv: asString(raw.csv) || undefined,
    maximumSynchronousRows: asNumber(raw.maximumSynchronousRows),
  };
}

/** Official getOntologyBulkTemplate: GET /v1/ontology/bulk/template. */
export async function getOntologyBulkTemplate(): Promise<OntologyBulkTemplate> {
  const raw = await apiRequest<Record<string, unknown>>(`${BULK_PATH}/template`);
  return mapBulkTemplate(asRecord(raw) ?? {});
}

function mapBulkJob(raw: Record<string, unknown>): OntologyBulkJob | null {
  const id = asNumber(raw.id);
  if (id === undefined) {
    return null;
  }
  return {
    id,
    operation: asString(raw.operation) || undefined,
    status: asString(raw.status) || undefined,
    glossary: asString(raw.glossary) || undefined,
    dryRun: asBoolean(raw.dryRun) ?? undefined,
    progress: asNumber(raw.progress),
    total: asNumber(raw.total),
    result: asRecord(raw.result) ?? undefined,
    error: asString(raw.error) || undefined,
    message: asString(raw.message) || undefined,
    cancelRequested: asBoolean(raw.cancelRequested) ?? undefined,
    createdBy: asString(raw.createdBy) || undefined,
    createdAt: asNumber(raw.createdAt),
    updatedAt: asNumber(raw.updatedAt),
    completedAt: asNumber(raw.completedAt),
  };
}

/**
 * Official submitOntologyBulkOperation: POST /v1/ontology/bulk.
 * OntologyBulkRequest requires glossaryId + operation + dryRun +
 * changeSetName + changeSetDescription; the csv text rides in the same
 * JSON body (no multipart form — the server parses the csv field).
 */
export async function submitOntologyBulkOperation(request: OntologyBulkRequest): Promise<OntologyBulkSubmission> {
  const raw = await apiRequest<Record<string, unknown>>(BULK_PATH, { method: 'POST', json: request });
  const root = asRecord(raw) ?? {};
  const job = asRecord(root.job);
  return {
    executionMode: asString(root.executionMode) || undefined,
    result: asRecord(root.result) ?? undefined,
    job: job ? (mapBulkJob(job) ?? undefined) : undefined,
  };
}

/** Official listOntologyBulkJobs: GET /v1/ontology/bulk/jobs?limit=. */
export function listOntologyBulkJobs(limit = 20): Promise<Paged<OntologyBulkJob>> {
  return apiRequest<unknown>(`${BULK_PATH}/jobs`, { query: { limit } }).then((payload) =>
    parsePaged(payload, mapBulkJob),
  );
}

/** Official getOntologyBulkJob: GET /v1/ontology/bulk/jobs/{jobId}. */
export async function getOntologyBulkJob(jobId: number): Promise<OntologyBulkJob> {
  const raw = await apiRequest<Record<string, unknown>>(`${BULK_PATH}/jobs/${jobId}`);
  const mapped = mapBulkJob(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Bulk job response was missing id');
  }
  return mapped;
}

/** Official cancelOntologyBulkJob: PUT /v1/ontology/bulk/jobs/{jobId}/cancel. */
export async function cancelOntologyBulkJob(jobId: number): Promise<OntologyBulkJob> {
  const raw = await apiRequest<Record<string, unknown>>(`${BULK_PATH}/jobs/${jobId}/cancel`, {
    method: 'PUT',
  });
  const mapped = mapBulkJob(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Cancel bulk job succeeded but the response had no job');
  }
  return mapped;
}

/** Official getOntologyBulkResultArtifact: GET /v1/ontology/bulk/jobs/{jobId}/artifact. */
export async function getOntologyBulkResultArtifact(jobId: number): Promise<OntologyBulkResultArtifact> {
  const raw = await apiRequest<Record<string, unknown>>(`${BULK_PATH}/jobs/${jobId}/artifact`);
  const root = asRecord(raw) ?? {};
  const errors = Array.isArray(root.errors)
    ? root.errors.flatMap((item) => {
        const rec = asRecord(item);
        return rec ? [{ row: asNumber(rec.row), message: asString(rec.message) || undefined }] : [];
      })
    : [];
  const changeSet = asRecord(root.changeSet);
  return {
    id: asNumber(root.id),
    operation: asString(root.operation) || undefined,
    glossary: asString(root.glossary) || undefined,
    dryRun: asBoolean(root.dryRun) ?? undefined,
    totalRows: asNumber(root.totalRows),
    validRows: asNumber(root.validRows),
    invalidRows: asNumber(root.invalidRows),
    unchangedRows: asNumber(root.unchangedRows),
    createCount: asNumber(root.createCount),
    updateCount: asNumber(root.updateCount),
    findReplaceCount: asNumber(root.findReplaceCount),
    retypeCount: asNumber(root.retypeCount),
    errors,
    errorsTruncated: asBoolean(root.errorsTruncated) ?? undefined,
    changeSet: changeSet
      ? { id: asString(changeSet.id) || undefined, name: asString(changeSet.name) || undefined }
      : undefined,
    generatedAt: asNumber(root.generatedAt),
    generatedBy: asString(root.generatedBy) || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* AI suggestions + domain drafts                                      */
/* ------------------------------------------------------------------ */

function mapRelationshipSuggestion(raw: Record<string, unknown>): OntologyRelationshipSuggestion | null {
  const id = asString(raw.id);
  const operation = asRecord(raw.operation);
  if (!id || !operation) {
    return null;
  }
  return {
    id,
    operation,
    confidence: asNumber(raw.confidence),
    rationale: asString(raw.rationale) || undefined,
  };
}

function mapMappingSuggestion(raw: Record<string, unknown>): OntologyMappingSuggestion | null {
  const id = asString(raw.id);
  const operation = asRecord(raw.operation);
  if (!id || !operation) {
    return null;
  }
  return {
    id,
    operation,
    targetLabel: asString(raw.targetLabel) || undefined,
    confidence: asNumber(raw.confidence),
    rationale: asString(raw.rationale) || undefined,
  };
}

/**
 * Official suggestOntologyRelationships: POST /v1/ontology/ai/relationships/suggestions.
 * Requires glossary + sourceTermIds + candidateTermIds + relationshipTypeIds + maxSuggestions.
 */
export async function suggestOntologyRelationships(request: {
  glossary: string;
  sourceTermIds: string[];
  candidateTermIds: string[];
  relationshipTypeIds: string[];
  instructions?: string;
  maxSuggestions: number;
}): Promise<OntologySuggestionList<OntologyRelationshipSuggestion>> {
  const raw = await apiRequest<Record<string, unknown>>(`${AI_PATH}/relationships/suggestions`, {
    method: 'POST',
    json: request,
  });
  const root = asRecord(raw) ?? {};
  return {
    modelId: asString(root.modelId) || undefined,
    generatedAt: asNumber(root.generatedAt),
    suggestions: Array.isArray(root.suggestions)
      ? root.suggestions.flatMap((item) => {
          const mapped = mapRelationshipSuggestion(asRecord(item) ?? {});
          return mapped ? [mapped] : [];
        })
      : [],
  };
}

/**
 * Official suggestOntologyMappings: POST /v1/ontology/ai/mappings/suggestions.
 * Requires glossary + sourceTermIds + standards + maxSuggestions.
 */
export async function suggestOntologyMappings(request: {
  glossary: string;
  sourceTermIds: string[];
  standards: string[];
  instructions?: string;
  maxSuggestions: number;
}): Promise<OntologySuggestionList<OntologyMappingSuggestion>> {
  const raw = await apiRequest<Record<string, unknown>>(`${AI_PATH}/mappings/suggestions`, {
    method: 'POST',
    json: request,
  });
  const root = asRecord(raw) ?? {};
  return {
    modelId: asString(root.modelId) || undefined,
    generatedAt: asNumber(root.generatedAt),
    suggestions: Array.isArray(root.suggestions)
      ? root.suggestions.flatMap((item) => {
          const mapped = mapMappingSuggestion(asRecord(item) ?? {});
          return mapped ? [mapped] : [];
        })
      : [],
  };
}

/**
 * Official generateOntologyDomainDraft: POST /v1/ontology/ai/drafts.
 * Requires glossary + changeSetName + displayName + description +
 * domainDescription + maxConcepts. The returned draft is a change-set
 * creation payload the caller posts to /v1/ontologyChangeSets — it is
 * not itself applied, so the user reviews it first (review-gated AI).
 */
export async function generateOntologyDomainDraft(request: {
  glossary: string;
  changeSetName: string;
  displayName: string;
  description: string;
  domainDescription: string;
  maxConcepts: number;
}): Promise<OntologyDomainDraftResult> {
  const raw = await apiRequest<Record<string, unknown>>(`${AI_PATH}/drafts`, {
    method: 'POST',
    json: request,
  });
  const root = asRecord(raw) ?? {};
  return {
    modelId: asString(root.modelId) || undefined,
    generatedAt: asNumber(root.generatedAt),
    draft: asRecord(root.draft) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Reasoning explanations                                              */
/* ------------------------------------------------------------------ */

/**
 * Official explainOntologyInference: POST /v1/ontology/reasoning/explanations.
 * Requires glossaryId + statement.
 */
export async function explainOntologyInference(request: {
  glossaryId: string;
  statement: string;
}): Promise<OntologyInferenceExplanation> {
  const raw = await apiRequest<Record<string, unknown>>(`${REASONING_PATH}/explanations`, {
    method: 'POST',
    json: request,
  });
  const root = asRecord(raw) ?? {};
  const explanations = Array.isArray(root.explanations)
    ? root.explanations.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        return [
          {
            statement: asString(rec.statement) || undefined,
            derivation: Array.isArray(rec.derivation)
              ? rec.derivation.filter((entry): entry is string => typeof entry === 'string')
              : undefined,
            rule: asString(rec.rule) || undefined,
          },
        ];
      })
    : [];
  return {
    glossary: asString(root.glossary) || undefined,
    statement: asString(root.statement) || undefined,
    asserted: Array.isArray(root.asserted)
      ? root.asserted.filter((item): item is string => typeof item === 'string')
      : undefined,
    inferred: Array.isArray(root.inferred)
      ? root.inferred.filter((item): item is string => typeof item === 'string')
      : undefined,
    explanations,
  };
}

/* ------------------------------------------------------------------ */
/* Pack install                                                        */
/* ------------------------------------------------------------------ */

/**
 * Official installOntologyPack: POST /v1/ontologyPacks/{packId}/install.
 * InstallOntologyPack requires moduleIds + targetGlossaryName + dryRun.
 * dryRun=true previews counts without writing; dryRun=false installs.
 */
export async function installOntologyPack(
  packId: string,
  request: { moduleIds: string[]; targetGlossaryName: string; dryRun: boolean },
): Promise<OntologyPackInstallResult> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${PACKS_PATH}/${encodeURIComponent(packId)}/install`,
    { method: 'POST', json: request },
  );
  const root = asRecord(raw) ?? {};
  return {
    packId: asString(root.packId) || undefined,
    version: asString(root.version) || undefined,
    moduleIds: Array.isArray(root.moduleIds)
      ? root.moduleIds.filter((item): item is string => typeof item === 'string')
      : [],
    targetGlossaryName: asString(root.targetGlossaryName) || undefined,
    dryRun: asBoolean(root.dryRun) ?? undefined,
    conceptCount: asNumber(root.conceptCount),
    relationshipCount: asNumber(root.relationshipCount),
    importResults: Array.isArray(root.importResults)
      ? root.importResults.flatMap((item) => {
          const rec = asRecord(item);
          return rec ? [rec] : [];
        })
      : undefined,
    installation: asRecord(root.installation) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Publication: capture / state / activation / reviews                 */
/* ------------------------------------------------------------------ */

/**
 * Publication path, resolved against server + official code (the E-batch
 * open question): release creation is NOT in OntologyReleaseResource
 * (GET-only). The create path is POST /v1/ontologies/{id}/releases
 * (captureOntologyRelease, OntologyResource.java) — it captures immutable
 * release content from the working tree. CaptureOntologyRelease requires
 * expectedWorkingRevision, taken from GET /v1/ontologies/{id}/state.
 */
export async function getOntologyState(ontologyId: string): Promise<OntologyState> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${ONTOLOGIES_PATH}/${encodeURIComponent(ontologyId)}/state`,
  );
  const root = asRecord(raw) ?? {};
  return {
    ontologyId: asString(root.ontologyId) || undefined,
    workingRevision: asNumber(root.workingRevision),
    lastReleaseRevision: asNumber(root.lastReleaseRevision),
    activeReleaseId: asString(root.activeReleaseId) || undefined,
    activationRevision: asNumber(root.activationRevision),
  };
}

export async function captureOntologyRelease(
  ontologyId: string,
  request: {
    expectedWorkingRevision: number;
    expectedActivationRevision?: number;
    expectedLatestReleaseRevision?: number;
    versionBump?: string;
    releaseNotes?: string;
  },
): Promise<Record<string, unknown>> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${ONTOLOGIES_PATH}/${encodeURIComponent(ontologyId)}/releases`,
    { method: 'POST', json: request },
  );
  return asRecord(raw) ?? {};
}

/**
 * Official activateOntologyRelease: PUT /v1/ontologies/{id}/activation.
 * ActivateOntologyRelease requires releaseId + expectedActivationRevision.
 * Activation is EDIT_ALL-gated server-side; the UI gates the button the
 * same way (see OntologyStudioView).
 */
export async function activateOntologyRelease(
  ontologyId: string,
  request: { releaseId: string; expectedActivationRevision: number },
): Promise<OntologyState> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${ONTOLOGIES_PATH}/${encodeURIComponent(ontologyId)}/activation`,
    { method: 'PUT', json: request },
  );
  const root = asRecord(raw) ?? {};
  return {
    ontologyId: asString(root.ontologyId) || undefined,
    workingRevision: asNumber(root.workingRevision),
    lastReleaseRevision: asNumber(root.lastReleaseRevision),
    activeReleaseId: asString(root.activeReleaseId) || undefined,
    activationRevision: asNumber(root.activationRevision),
  };
}

/**
 * Official listOntologyReleaseReviews: GET /v1/ontologies/reviews?view=.
 * view=assigned lists open reviews assigned to the caller (or their
 * teams), created lists the caller's own, pending lists assigned reviews
 * the caller can still vote on. A decided review is read through its
 * release (getOntologyReleaseReview).
 */
export function listOntologyReleaseReviews(view: 'assigned' | 'created' | 'pending', limit = 25) {
  return apiRequest<unknown>(`${ONTOLOGIES_PATH}/reviews`, {
    query: { view, limit },
  }).then((payload) => {
    const root = asRecord(payload) ?? {};
    const data = Array.isArray(root.data) ? root.data : [];
    return data.flatMap((item) => {
      const mapped = mapReleaseReview(asRecord(item) ?? {});
      return mapped ? [mapped] : [];
    });
  });
}

function mapReleaseReview(raw: Record<string, unknown>): OntologyReleaseReview | null {
  const release = asRecord(raw.release);
  const ontology = asRecord(raw.ontology);
  const task = asRecord(raw.task);
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        return [
          {
            user: asString(rec.user) || undefined,
            team: asString(rec.team) || undefined,
            vote: asString(rec.vote) || undefined,
            votedAt: asNumber(rec.votedAt),
            reason: asString(rec.reason) || undefined,
          },
        ];
      })
    : [];
  const latestDecision = asRecord(raw.latestDecision);
  return {
    release: release
      ? { id: asString(release.id) || undefined, name: asString(release.name) || undefined }
      : undefined,
    ontology: ontology
      ? { id: asString(ontology.id) || undefined, name: asString(ontology.name) || undefined }
      : undefined,
    task: task
      ? { id: asString(task.id) || undefined, name: asString(task.name) || undefined }
      : undefined,
    taskId: asString(raw.taskId) || undefined,
    requester: asString(raw.requester) || undefined,
    approvalRule: asRecord(raw.approvalRule) ?? undefined,
    status: asString(raw.status) || undefined,
    assignees,
    latestDecision: latestDecision
      ? {
          vote: asString(latestDecision.vote) || undefined,
          reason: asString(latestDecision.reason) || undefined,
          by: asString(latestDecision.by) || undefined,
        }
      : undefined,
    callerCanVote: asBoolean(raw.callerCanVote) ?? undefined,
    callerCompletesRule: asBoolean(raw.callerCompletesRule) ?? undefined,
  };
}

/** Official getOntologyReleaseReview: GET /v1/ontologyReleases/{id}/review. */
export async function getOntologyReleaseReview(releaseId: string): Promise<OntologyReleaseReview> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${RELEASES_PATH}/${encodeURIComponent(releaseId)}/review`,
  );
  const mapped = mapReleaseReview(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Release review response was empty');
  }
  return mapped;
}

/** Official getOntologyReleaseValidation: GET /v1/ontologyReleases/{id}/validation. */
export async function getOntologyReleaseValidation(releaseId: string): Promise<OntologyReleaseValidation> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${RELEASES_PATH}/${encodeURIComponent(releaseId)}/validation`,
  );
  const root = asRecord(raw) ?? {};
  const issues = (value: unknown): { message?: string; path?: string }[] =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const rec = asRecord(item);
          return rec
            ? [{ message: asString(rec.message) || undefined, path: asString(rec.path) || undefined }]
            : [];
        })
      : [];
  return {
    valid: asBoolean(root.valid) ?? undefined,
    errors: issues(root.errors),
    warnings: issues(root.warnings),
  };
}

/* ------------------------------------------------------------------ */
/* Delete impact preview                                               */
/* ------------------------------------------------------------------ */

/**
 * Official previewGlossaryTermDeleteImpact: GET
 * /v1/ontology/impacts/glossaryTerms/{id}/delete. Read-only safety check
 * shown before a term delete is offered from the studio. The response is
 * OntologyImpactReport: bound assets (capped sample + total), child
 * concepts that must be reassigned or cascaded, relationships and
 * mappings removed with the term, plus a short-lived impact token.
 */
export async function previewGlossaryTermDeleteImpact(termId: string): Promise<OntologyDeleteImpact> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${IMPACTS_PATH}/${encodeURIComponent(termId)}/delete`,
  );
  const root = asRecord(raw) ?? {};
  const refs = (value: unknown): { id?: string; name?: string; type?: string; fullyQualifiedName?: string }[] =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const rec = asRecord(item);
          if (!rec) {
            return [];
          }
          return [
            {
              id: asString(rec.id) || undefined,
              name: asString(rec.name) || undefined,
              type: asString(rec.type) || undefined,
              fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
            },
          ];
        })
      : [];
  const resource = asRecord(root.resource);
  return {
    resource: resource
      ? {
          id: asString(resource.id) || undefined,
          name: asString(resource.name) || undefined,
          type: asString(resource.type) || undefined,
          fullyQualifiedName: asString(resource.fullyQualifiedName) || undefined,
        }
      : undefined,
    operation: asString(root.operation) || undefined,
    baseVersion: asNumber(root.baseVersion),
    impactToken: asString(root.impactToken) || undefined,
    expiresAt: asNumber(root.expiresAt),
    children: refs(root.children),
    relationshipCount: Array.isArray(root.relationships) ? root.relationships.length : undefined,
    boundAssets: refs(root.boundAssets),
    boundAssetCount: asNumber(root.boundAssetCount),
    boundAssetsTruncated: asBoolean(root.boundAssetsTruncated) ?? undefined,
    mappingCount: Array.isArray(root.conceptMappings) ? root.conceptMappings.length : undefined,
    shaclRecheckRequired: asBoolean(root.shaclRecheckRequired) ?? undefined,
  };
}

/**
 * Official deleteGlossaryTermWithImpact (rest/ontologyAPI.ts:863-873,
 * OntologyDeleteImpactPanel.tsx:106-116): POST to the same
 * /v1/ontology/impacts/glossaryTerms/{id}/delete path as the preview,
 * carrying the preview's impactToken plus cascadeConfirmed / hardDelete /
 * reassignChildrenTo ({id, type: 'glossaryTerm'}). The preview token is
 * the execution token: without it the preview and the delete are
 * disconnected, which is exactly the gap this closes. The response is
 * the OntologyDeleteResult; callers only need success/failure, so the
 * raw payload is returned unmapped.
 */
export interface DeleteGlossaryTermWithImpactRequest {
  cascadeConfirmed?: boolean;
  hardDelete?: boolean;
  impactToken?: string;
  reassignChildrenTo?: { id: string; type: string };
}

export async function deleteGlossaryTermWithImpact(
  termId: string,
  request: DeleteGlossaryTermWithImpactRequest,
): Promise<unknown> {
  return apiRequest<unknown>(`${IMPACTS_PATH}/${encodeURIComponent(termId)}/delete`, {
    method: 'POST',
    json: {
      cascadeConfirmed: request.cascadeConfirmed ?? false,
      hardDelete: request.hardDelete ?? false,
      impactToken: request.impactToken,
      reassignChildrenTo: request.reassignChildrenTo,
    },
  });
}
