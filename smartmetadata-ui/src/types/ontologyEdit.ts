/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface OntologyEditLock {
  resourceType?: string;
  resourceId?: string;
  holder?: string;
  sessionId?: string;
  version?: number;
  acquiredAt?: number;
  renewedAt?: number;
  expiresAt?: number;
}

export interface AcquireOntologyEditLockRequest {
  resourceType: string;
  resourceId: string;
  sessionId: string;
  expectedVersion?: number;
  leaseSeconds?: number;
}

export type OntologyChangeOperationType =
  | 'CREATE_GLOSSARY'
  | 'CREATE_TERM'
  | 'UPDATE_TERM'
  | 'DELETE_TERM'
  | 'ADD_RELATIONSHIP'
  | 'UPDATE_RELATIONSHIP'
  | 'DELETE_RELATIONSHIP'
  | 'UPSERT_MAPPING'
  | 'DELETE_MAPPING'
  | 'UPSERT_AXIOM'
  | 'DELETE_AXIOM'
  | 'UPSERT_CONCEPT'
  | 'DELETE_CONCEPT'
  | 'UPSERT_PROPERTY'
  | 'DELETE_PROPERTY';

export type OntologyChangeOperationState = 'ACTIVE' | 'UNDONE';

export interface OntologyChangeOperation {
  id: string;
  operationType: OntologyChangeOperationType;
  state: OntologyChangeOperationState;
  targetId?: string;
  baseVersion?: number;
  relationship?: Record<string, unknown>;
  mapping?: Record<string, unknown>;
  axiom?: Record<string, unknown>;
  term?: Record<string, unknown>;
  glossary?: Record<string, unknown>;
  concept?: Record<string, unknown>;
  property?: Record<string, unknown>;
  sourceMemoryIds?: string[];
  confidence?: number;
  rationale?: string;
  modelId?: string;
}

export type OntologyChangeSetState = 'DRAFT' | 'SUBMITTED' | 'APPLIED' | 'APPLY_FAILED' | 'DISCARDED';

export interface OntologyChangeSet {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  state?: OntologyChangeSetState;
  operations: OntologyChangeOperation[];
  undoCursor?: number;
  ontology?: { id?: string; name?: string; fullyQualifiedName?: string };
  baseWorkingRevision?: number;
  sourcePack?: string;
  owners?: { id?: string; name?: string; type?: string }[];
  version?: number;
  updatedAt?: number;
  updatedBy?: string;
}

export interface CreateOntologyChangeSetRequest {
  name: string;
  displayName: string;
  description: string;
  glossaries?: string[];
  ontology?: string;
  baseWorkingRevision?: number;
  operations?: OntologyChangeOperation[];
  owners?: { id: string; type: string }[];
}

export interface OntologyBulkTemplate {
  fileName?: string;
  mediaType?: string;
  headers: string[];
  csv?: string;
  maximumSynchronousRows?: number;
}

export type OntologyBulkOperation = 'UPSERT' | 'FIND_REPLACE' | 'RETYPE' | string;

export interface OntologyBulkRequest {
  glossaryId: string;
  operation: OntologyBulkOperation;
  dryRun: boolean;
  changeSetName: string;
  changeSetDescription: string;
  changeSetDisplayName?: string;
  csv?: string;
  findReplace?: Record<string, unknown>;
  retype?: Record<string, unknown>;
}

export interface OntologyBulkSubmission {
  executionMode?: string;
  result?: Record<string, unknown>;
  job?: OntologyBulkJob;
}

export interface OntologyBulkJob {
  id: number;
  operation?: string;
  status?: string;
  glossary?: string;
  dryRun?: boolean;
  progress?: number;
  total?: number;
  result?: Record<string, unknown>;
  error?: string;
  message?: string;
  cancelRequested?: boolean;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
}

export interface OntologyBulkResultArtifact {
  id?: number;
  operation?: string;
  glossary?: string;
  dryRun?: boolean;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  unchangedRows?: number;
  createCount?: number;
  updateCount?: number;
  findReplaceCount?: number;
  retypeCount?: number;
  errors: { row?: number; message?: string }[];
  errorsTruncated?: boolean;
  changeSet?: { id?: string; name?: string };
  generatedAt?: number;
  generatedBy?: string;
}

export interface OntologyRelationshipSuggestion {
  id: string;
  operation: Record<string, unknown>;
  confidence?: number;
  rationale?: string;
}

export interface OntologyMappingSuggestion {
  id: string;
  operation: Record<string, unknown>;
  targetLabel?: string;
  confidence?: number;
  rationale?: string;
}

export interface OntologySuggestionList<T> {
  modelId?: string;
  generatedAt?: number;
  suggestions: T[];
}

export interface OntologyDomainDraftResult {
  modelId?: string;
  generatedAt?: number;
  draft?: Record<string, unknown>;
}

export interface OntologyInferenceExplanation {
  glossary?: string;
  statement?: string;
  asserted?: string[];
  inferred?: string[];
  explanations: { statement?: string; derivation?: string[]; rule?: string }[];
}

export interface OntologyPackInstallResult {
  packId?: string;
  version?: string;
  moduleIds: string[];
  targetGlossaryName?: string;
  dryRun?: boolean;
  conceptCount?: number;
  relationshipCount?: number;
  importResults?: Record<string, unknown>[];
  installation?: Record<string, unknown>;
}

export interface OntologyState {
  ontologyId?: string;
  workingRevision?: number;
  lastReleaseRevision?: number;
  activeReleaseId?: string;
  activationRevision?: number;
}

export interface OntologyReleaseReviewAssignee {
  user?: string;
  team?: string;
  vote?: string;
  votedAt?: number;
  reason?: string;
}

export interface OntologyReleaseReview {
  release?: { id?: string; name?: string };
  ontology?: { id?: string; name?: string };
  task?: { id?: string; name?: string };
  taskId?: string;
  requester?: string;
  approvalRule?: Record<string, unknown>;
  status?: string;
  assignees: OntologyReleaseReviewAssignee[];
  latestDecision?: { vote?: string; reason?: string; by?: string };
  callerCanVote?: boolean;
  callerCompletesRule?: boolean;
}

export interface OntologyReleaseValidation {
  valid?: boolean;
  errors?: { message?: string; path?: string }[];
  warnings?: { message?: string; path?: string }[];
}

export interface CreateOntologyConceptRequest {
  name: string;
  ontology: string;
  conceptType: string;
  displayName?: string;
  description?: string;
  iri?: string;
  synonyms?: string[];
  abstract?: boolean;
  deprecated?: boolean;
  owners?: { id: string; type: string }[];
}

export interface CreateOntologyPropertyRequest {
  name: string;
  ontology: string;
  kind?: string;
  displayName?: string;
  description?: string;
  iri?: string;
  domain?: string;
  range?: string;
  unit?: string;
  isIdentifier?: boolean;
  enumValues?: string[];
  owners?: { id: string; type: string }[];
}

export interface CreateOntologyAxiomRequest {
  name: string;
  ontology: string;
  axiomType?: string;
  displayName?: string;
  description?: string;
  subjectIri?: string;
  expressions?: string[];
  propertyIri?: string;
  targetIri?: string;
  literal?: string;
  owners?: { id: string; type: string }[];
}

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
}

export interface OntologyDeleteImpact {
  resource?: { id?: string; name?: string; type?: string; fullyQualifiedName?: string };
  operation?: string;
  baseVersion?: number;
  impactToken?: string;
  expiresAt?: number;
  children?: { id?: string; name?: string; type?: string; fullyQualifiedName?: string }[];
  relationshipCount?: number;
  boundAssets?: { id?: string; name?: string; type?: string; fullyQualifiedName?: string }[];
  boundAssetCount?: number;
  boundAssetsTruncated?: boolean;
  mappingCount?: number;
  shaclRecheckRequired?: boolean;
}
