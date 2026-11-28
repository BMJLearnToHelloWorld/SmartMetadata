/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString } from '@/api/json';
import { ApiError, apiRequest } from './client';

/**
 * Official ContractExecutionStatus (generated/entity/data/dataContract.ts):
 * the latest execution result of a data contract.
 */
export type ContractExecutionStatus =
  | 'Aborted'
  | 'Failed'
  | 'PartialSuccess'
  | 'Queued'
  | 'Running'
  | 'Success';

/** Official LatestResult (generated/entity/data/dataContract.ts:336). */
export interface DataContractLatestResult {
  message?: string;
  resultId?: string;
  status?: ContractExecutionStatus;
  timestamp?: number;
}

/** Official EntityReference subset used by contracts. */
export interface EntityRefLike {
  id: string;
  type: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  inherited?: boolean;
}

export interface ContractColumn {
  name: string;
  fullyQualifiedName?: string;
  displayName?: string;
  dataType?: string;
  description?: string;
  constraint?: string;
  children?: ContractColumn[];
}

export interface SemanticsRule {
  name: string;
  description?: string;
  enabled?: boolean;
  rule: string;
  jsonTree?: string;
  inherited?: boolean;
}

export interface ContractRowFilter {
  columnName?: string;
  values?: string[];
}

export interface ContractSecurityPolicy {
  accessPolicy?: string;
  identities?: string[];
  rowFilters?: ContractRowFilter[];
}

export interface ContractSecurity {
  dataClassification?: string;
  inherited?: boolean;
  policies?: ContractSecurityPolicy[];
}

export interface ContractSLA {
  availabilityTime?: string;
  columnName?: string;
  inherited?: boolean;
  maxLatency?: { unit: string; value: number };
  refreshFrequency?: { interval: number; unit: string };
  retention?: { period: number; unit: string };
  timezone?: string;
}

export interface TermsOfUse {
  content?: string;
  inherited?: boolean;
}

/** Official DataContract read/write shape used by AddDataContract. */
export interface DataContract {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  entityStatus?: string;
  latestResult?: DataContractLatestResult;
  inherited?: boolean;
  deleted?: boolean;
  entity?: EntityRefLike;
  owners?: EntityRefLike[];
  schema?: ContractColumn[];
  semantics?: SemanticsRule[];
  security?: ContractSecurity;
  qualityExpectations?: EntityRefLike[];
  sla?: ContractSLA;
  termsOfUse?: TermsOfUse | string;
  createdBy?: string;
  createdAt?: number;
  updatedBy?: string;
  updatedAt?: number;
  version?: number;
  testSuite?: EntityRefLike;
}

const CONTRACT_EXECUTION_STATUSES: ReadonlySet<string> = new Set([
  'Aborted',
  'Failed',
  'PartialSuccess',
  'Queued',
  'Running',
  'Success',
]);

function mapLatestResult(value: unknown): DataContractLatestResult | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const status = asString(rec.status);
  const result: DataContractLatestResult = {
    message: asString(rec.message) || undefined,
    resultId: asString(rec.resultId) || undefined,
    status:
      status && CONTRACT_EXECUTION_STATUSES.has(status)
        ? (status as ContractExecutionStatus)
        : undefined,
    timestamp: asNumber(rec.timestamp),
  };
  return result.message || result.resultId || result.status || result.timestamp !== undefined
    ? result
    : undefined;
}

function mapRef(value: unknown): EntityRefLike | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const id = asString(rec.id);
  const type = asString(rec.type);
  if (!id || !type) {
    return undefined;
  }
  return {
    id,
    type,
    name: asString(rec.name) || undefined,
    displayName: asString(rec.displayName) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    description: asString(rec.description) || undefined,
    inherited: rec.inherited === true || undefined,
  };
}

function mapRefList(value: unknown): EntityRefLike[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map(mapRef).filter((item): item is EntityRefLike => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function mapColumns(value: unknown): ContractColumn[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : "";
    if (!rec || !name) {
      return [];
    }
    return [{
      name,
      fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
      displayName: asString(rec.displayName) || undefined,
      dataType: asString(rec.dataType) || undefined,
      description: asString(rec.description) || undefined,
      constraint: asString(rec.constraint) || undefined,
      children: mapColumns(rec.children),
    }];
  });
  return items.length > 0 ? items : undefined;
}

function mapSemantics(value: unknown): SemanticsRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : "";
    if (!rec || !name) {
      return [];
    }
    return [{
      name,
      description: asString(rec.description) || undefined,
      enabled: rec.enabled === undefined ? undefined : rec.enabled === true,
      rule: asString(rec.rule) || "",
      jsonTree: asString(rec.jsonTree) || undefined,
      inherited: rec.inherited === true || undefined,
    }];
  });
  return items.length > 0 ? items : undefined;
}

function mapRowFilters(value: unknown): ContractRowFilter[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    return [{
      columnName: asString(rec.columnName) || undefined,
      values: Array.isArray(rec.values) ? rec.values.map((entry) => String(entry)).filter(Boolean) : undefined,
    }];
  });
  return items.length > 0 ? items : undefined;
}

function mapSecurity(value: unknown): ContractSecurity | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const policies = Array.isArray(rec.policies)
    ? rec.policies.flatMap((item) => {
        const policy = asRecord(item);
        if (!policy) {
          return [];
        }
        return [{
          accessPolicy: asString(policy.accessPolicy) || undefined,
          identities: Array.isArray(policy.identities)
            ? policy.identities.map((entry) => String(entry)).filter(Boolean)
            : undefined,
          rowFilters: mapRowFilters(policy.rowFilters),
        }];
      })
    : undefined;
  const security: ContractSecurity = {
    dataClassification: asString(rec.dataClassification) || undefined,
    inherited: rec.inherited === true || undefined,
    policies,
  };
  return security.dataClassification || security.inherited || (security.policies && security.policies.length > 0)
    ? security
    : undefined;
}

function mapSla(value: unknown): ContractSLA | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const maxLatency = asRecord(rec.maxLatency);
  const refreshFrequency = asRecord(rec.refreshFrequency);
  const retention = asRecord(rec.retention);
  const sla: ContractSLA = {
    availabilityTime: asString(rec.availabilityTime) || undefined,
    columnName: asString(rec.columnName) || undefined,
    inherited: rec.inherited === true || undefined,
    maxLatency: maxLatency
      ? { unit: asString(maxLatency.unit) || "", value: asNumber(maxLatency.value) ?? 0 }
      : undefined,
    refreshFrequency: refreshFrequency
      ? { interval: asNumber(refreshFrequency.interval) ?? 0, unit: asString(refreshFrequency.unit) || "" }
      : undefined,
    retention: retention
      ? { period: asNumber(retention.period) ?? 0, unit: asString(retention.unit) || "" }
      : undefined,
    timezone: asString(rec.timezone) || undefined,
  };
  return sla.availabilityTime || sla.columnName || sla.inherited || sla.maxLatency || sla.refreshFrequency || sla.retention || sla.timezone
    ? sla
    : undefined;
}

function mapTerms(value: unknown): TermsOfUse | string | undefined {
  if (typeof value === "string") {
    return value;
  }
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    content: asString(rec.content) || undefined,
    inherited: rec.inherited === true || undefined,
  };
}

export function mapDataContract(raw: unknown): DataContract | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const id = asString(rec.id);
  const name = asString(rec.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(rec.displayName) || undefined,
    description: asString(rec.description) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    entityStatus: asString(rec.entityStatus) || undefined,
    latestResult: mapLatestResult(rec.latestResult),
    inherited: rec.inherited === true || undefined,
    deleted: rec.deleted === true || undefined,
    entity: mapRef(rec.entity),
    owners: mapRefList(rec.owners),
    schema: mapColumns(rec.schema),
    semantics: mapSemantics(rec.semantics),
    security: mapSecurity(rec.security),
    qualityExpectations: mapRefList(rec.qualityExpectations),
    sla: mapSla(rec.sla),
    termsOfUse: mapTerms(rec.termsOfUse),
    createdBy: asString(rec.createdBy) || undefined,
    createdAt: asNumber(rec.createdAt),
    updatedBy: asString(rec.updatedBy) || undefined,
    updatedAt: asNumber(rec.updatedAt),
    version: asNumber(rec.version),
    testSuite: mapRef(rec.testSuite),
  };
}

/**
 * Official getContractByEntityId (rest/contractAPI.ts): GET
 * /v1/dataContracts/entity?entityId=&entityType=. The `fields` param is
 * dropped entirely when empty: the backend treats an empty `fields=`
 * as a request to evaluate every field, which can time out at 1 minute
 * on heavyweight contracts. A 404 is the common "no contract" case and
 * returns null (the AssetHealth contract row renders its Create CTA);
 * any other failure propagates.
 */
export async function getContractByEntityId(
  entityId: string,
  entityType = 'table',
  fields: string[] = [],
): Promise<DataContract | null> {
  try {
    const payload = await apiRequest<unknown>('/v1/dataContracts/entity', {
      query: {
        entityId,
        entityType,
        fields: fields.length > 0 ? fields.join(',') : undefined,
      },
    });
    return mapDataContract(payload);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export interface CreateDataContractRequest {
  name: string;
  displayName?: string;
  description?: string;
  entity: { id: string; type: string };
  entityStatus?: string;
  owners?: EntityRefLike[];
  schema?: ContractColumn[];
  semantics?: SemanticsRule[];
  security?: ContractSecurity;
  qualityExpectations?: EntityRefLike[];
  sla?: ContractSLA;
  termsOfUse?: string;
}

/** Official updateContract (rest/contractAPI.ts): PATCH /v1/dataContracts/{id}. */
export async function updateContract(id: string, patch: unknown[]): Promise<DataContract> {
  const raw = await apiRequest<unknown>(`/v1/dataContracts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: patch,
    contentType: "application/json-patch+json",
  });
  const mapped = mapDataContract(raw);
  if (!mapped) {
    throw new Error("Update data contract succeeded but the response had no contract");
  }
  return mapped;
}

/** Official createContract (rest/contractAPI.ts): POST /v1/dataContracts. */
export async function createContract(body: CreateDataContractRequest): Promise<DataContract> {
  const raw = await apiRequest<unknown>('/v1/dataContracts', { method: 'POST', json: body });
  const mapped = mapDataContract(raw);
  if (!mapped) {
    throw new Error('Create data contract succeeded but the response had no contract');
  }
  return mapped;
}

/** Official deleteContractById: DELETE /v1/dataContracts/{id}?hardDelete=true&recursive=true. */
export function deleteContractById(id: string): Promise<void> {
  return apiRequest<void>(`/v1/dataContracts/${encodeURIComponent(id)}?hardDelete=true&recursive=true`, {
    method: 'DELETE',
  });
}


/** Official SchemaValidation / SemanticsValidation / QualityValidation / SlaValidation. */
export interface SchemaValidation {
  duplicateFields?: string[];
  failed?: number;
  failedFields?: string[];
  passed?: number;
  total?: number;
  typeMismatchFields?: string[];
}

export interface FailedRule {
  reason?: string;
  ruleName?: string;
}

export interface SemanticsValidation {
  failed?: number;
  failedRules?: FailedRule[];
  passed?: number;
  skipped?: number;
  total?: number;
}

export interface QualityValidation {
  failed?: number;
  passed?: number;
  qualityScore?: number;
  total?: number;
}

export type RefreshedAtSource = 'lifeCycle' | 'slaColumnProfile' | 'systemProfile';

export interface SlaValidation {
  actualLatency?: number;
  availabilityMet?: boolean;
  lastRefreshedAt?: number;
  latencyMet?: boolean;
  message?: string;
  refreshedAtSource?: RefreshedAtSource;
  refreshFrequencyMet?: boolean;
}

/** Official DataContractResult (generated/entity/datacontract/dataContractResult.ts). */
export interface DataContractResult {
  contractExecutionStatus: ContractExecutionStatus;
  dataContractFQN?: string;
  executionTime?: number;
  id?: string;
  incidentId?: string;
  qualityValidation?: QualityValidation;
  result?: string;
  schemaValidation?: SchemaValidation;
  semanticsValidation?: SemanticsValidation;
  slaValidation?: SlaValidation;
  timestamp: number;
}

export interface ContractResultList {
  data: DataContractResult[];
  paging?: { total?: number; after?: string; before?: string };
}

export interface OdcsImportIssue {
  category?: string;
  field?: string;
  message: string;
  occurrences?: number;
  path?: string;
  severity?: 'blocking' | 'info' | 'warning';
}

export interface OdcsQualityRuleOutcome {
  column?: string;
  name?: string;
  outcome: 'notExecuted' | 'sla' | 'testCase';
  reason?: string;
  testCaseName?: string;
  testDefinition?: string;
}

export interface ODCSImportReport {
  canCreateTestCases?: boolean;
  canImport?: boolean;
  issues?: OdcsImportIssue[];
  odcsVersion?: string;
  qualityRules?: OdcsQualityRuleOutcome[];
}

/** Official ContractValidation. */
export interface ContractValidation {
  constraintErrors?: string[];
  entityErrors?: string[];
  odcsImportReport?: ODCSImportReport;
  schemaValidation?: SchemaValidation;
  valid?: boolean;
}

export interface ODCSParseResult {
  name?: string;
  version?: string;
  status?: string;
  schemaObjects?: string[];
  hasMultipleObjects?: boolean;
}

function mapFailedRules(value: unknown): FailedRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    return [{ reason: asString(rec.reason) || undefined, ruleName: asString(rec.ruleName) || undefined }];
  });
  return items;
}

function mapSchemaValidation(value: unknown): SchemaValidation | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    duplicateFields: Array.isArray(rec.duplicateFields) ? rec.duplicateFields.map((entry) => String(entry)) : undefined,
    failed: asNumber(rec.failed),
    failedFields: Array.isArray(rec.failedFields) ? rec.failedFields.map((entry) => String(entry)) : undefined,
    passed: asNumber(rec.passed),
    total: asNumber(rec.total),
    typeMismatchFields: Array.isArray(rec.typeMismatchFields) ? rec.typeMismatchFields.map((entry) => String(entry)) : undefined,
  };
}

function mapSemanticsValidation(value: unknown): SemanticsValidation | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    failed: asNumber(rec.failed),
    failedRules: mapFailedRules(rec.failedRules),
    passed: asNumber(rec.passed),
    skipped: asNumber(rec.skipped),
    total: asNumber(rec.total),
  };
}

function mapQualityValidation(value: unknown): QualityValidation | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    failed: asNumber(rec.failed),
    passed: asNumber(rec.passed),
    qualityScore: asNumber(rec.qualityScore),
    total: asNumber(rec.total),
  };
}

const REFRESHED_AT_SOURCES: ReadonlySet<string> = new Set(['lifeCycle', 'slaColumnProfile', 'systemProfile']);

function mapSlaValidation(value: unknown): SlaValidation | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const source = asString(rec.refreshedAtSource);
  return {
    actualLatency: asNumber(rec.actualLatency),
    availabilityMet: rec.availabilityMet === undefined ? undefined : rec.availabilityMet === true,
    lastRefreshedAt: asNumber(rec.lastRefreshedAt),
    latencyMet: rec.latencyMet === undefined ? undefined : rec.latencyMet === true,
    message: asString(rec.message) || undefined,
    refreshedAtSource: source && REFRESHED_AT_SOURCES.has(source) ? (source as RefreshedAtSource) : undefined,
    refreshFrequencyMet: rec.refreshFrequencyMet === undefined ? undefined : rec.refreshFrequencyMet === true,
  };
}

export function mapDataContractResult(raw: unknown): DataContractResult | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const status = asString(rec.contractExecutionStatus);
  const timestamp = asNumber(rec.timestamp);
  if (!status || !CONTRACT_EXECUTION_STATUSES.has(status) || timestamp === undefined) {
    return null;
  }
  return {
    contractExecutionStatus: status as ContractExecutionStatus,
    dataContractFQN: asString(rec.dataContractFQN) || undefined,
    executionTime: asNumber(rec.executionTime),
    id: asString(rec.id) || undefined,
    incidentId: asString(rec.incidentId) || undefined,
    qualityValidation: mapQualityValidation(rec.qualityValidation),
    result: asString(rec.result) || undefined,
    schemaValidation: mapSchemaValidation(rec.schemaValidation),
    semanticsValidation: mapSemanticsValidation(rec.semanticsValidation),
    slaValidation: mapSlaValidation(rec.slaValidation),
    timestamp,
  };
}

function mapContractValidation(raw: unknown): ContractValidation {
  const rec = asRecord(raw) ?? {};
  const report = asRecord(rec.odcsImportReport);
  return {
    constraintErrors: Array.isArray(rec.constraintErrors) ? rec.constraintErrors.map((entry) => String(entry)) : undefined,
    entityErrors: Array.isArray(rec.entityErrors) ? rec.entityErrors.map((entry) => String(entry)) : undefined,
    schemaValidation: mapSchemaValidation(rec.schemaValidation),
    valid: rec.valid === undefined ? undefined : rec.valid === true,
    odcsImportReport: report
      ? {
          canCreateTestCases: report.canCreateTestCases === undefined ? undefined : report.canCreateTestCases === true,
          canImport: report.canImport === undefined ? undefined : report.canImport === true,
          odcsVersion: asString(report.odcsVersion) || undefined,
          issues: Array.isArray(report.issues)
            ? report.issues.flatMap((item) => {
                const issue = asRecord(item);
                const message = issue ? asString(issue.message) : '';
                if (!issue || !message) {
                  return [];
                }
                return [{
                  category: asString(issue.category) || undefined,
                  field: asString(issue.field) || undefined,
                  message,
                  occurrences: asNumber(issue.occurrences),
                  path: asString(issue.path) || undefined,
                  severity: asString(issue.severity) as OdcsImportIssue['severity'],
                }];
              })
            : undefined,
          qualityRules: Array.isArray(report.qualityRules)
            ? report.qualityRules.flatMap((item) => {
                const rule = asRecord(item);
                if (!rule) {
                  return [];
                }
                const outcome = asString(rule.outcome);
                if (outcome !== 'notExecuted' && outcome !== 'sla' && outcome !== 'testCase') {
                  return [];
                }
                return [{
                  column: asString(rule.column) || undefined,
                  name: asString(rule.name) || undefined,
                  outcome: outcome as OdcsQualityRuleOutcome['outcome'],
                  reason: asString(rule.reason) || undefined,
                  testCaseName: asString(rule.testCaseName) || undefined,
                  testDefinition: asString(rule.testDefinition) || undefined,
                }];
              })
            : undefined,
        }
      : undefined,
  };
}

/** Official validateContractById: POST /v1/dataContracts/{id}/validate. */
export function validateContractById(contractId: string): Promise<void> {
  return apiRequest<void>(`/v1/dataContracts/${encodeURIComponent(contractId)}/validate`, { method: 'POST' });
}

/** Official validateContractByEntityId — inherited contracts materialize results on the asset. */
export function validateContractByEntityId(entityId: string, entityType: string): Promise<void> {
  return apiRequest<void>('/v1/dataContracts/entity/validate', {
    method: 'POST',
    query: { entityId, entityType },
  });
}

/** Official getContractResultByResultId: GET /v1/dataContracts/{id}/results/{resultId}. */
export async function getContractResultByResultId(contractId: string, resultId: string): Promise<DataContractResult> {
  const raw = await apiRequest<unknown>(
    `/v1/dataContracts/${encodeURIComponent(contractId)}/results/${encodeURIComponent(resultId)}`,
  );
  const mapped = mapDataContractResult(raw);
  if (!mapped) {
    throw new Error('Contract result was missing or invalid');
  }
  return mapped;
}

/** Official getAllContractResults: GET /v1/dataContracts/{id}/results. */
export async function getAllContractResults(
  contractId: string,
  params: { startTs?: number; endTs?: number; limit?: number },
): Promise<ContractResultList> {
  const raw = await apiRequest<unknown>(`/v1/dataContracts/${encodeURIComponent(contractId)}/results`, {
    query: params,
  });
  const rec = asRecord(raw);
  const list = Array.isArray(raw) ? raw : rec && Array.isArray(rec.data) ? rec.data : [];
  const data = list.map(mapDataContractResult).filter((item): item is DataContractResult => Boolean(item));
  return { data, paging: rec && asRecord(rec.paging) ? { total: asNumber(asRecord(rec.paging)?.total) } : undefined };
}

/** Official exportContractToODCSYaml: GET /v1/dataContracts/{id}/odcs/yaml. */
export function exportContractToODCSYaml(contractId: string, fields?: string): Promise<string> {
  return apiRequest<string>(`/v1/dataContracts/${encodeURIComponent(contractId)}/odcs/yaml`, {
    query: { fields },
    headers: { Accept: 'application/yaml' },
    response: 'text',
  });
}

/** Official parseODCSYaml: POST /v1/dataContracts/odcs/parse/yaml. */
export async function parseODCSYaml(yamlContent: string): Promise<ODCSParseResult> {
  const raw = await apiRequest<unknown>('/v1/dataContracts/odcs/parse/yaml', {
    method: 'POST',
    text: yamlContent,
    contentType: 'application/yaml',
  });
  const rec = asRecord(raw) ?? {};
  return {
    name: asString(rec.name) || undefined,
    version: asString(rec.version) || undefined,
    status: asString(rec.status) || undefined,
    schemaObjects: Array.isArray(rec.schemaObjects) ? rec.schemaObjects.map((entry) => String(entry)) : undefined,
    hasMultipleObjects: rec.hasMultipleObjects === undefined ? undefined : rec.hasMultipleObjects === true,
  };
}

/** Official importContractFromODCSYaml: POST /v1/dataContracts/odcs/yaml. */
export async function importContractFromODCSYaml(
  yamlContent: string,
  entityId: string,
  entityType: string,
  objectName?: string,
  createTestCases = true,
): Promise<DataContract> {
  const raw = await apiRequest<unknown>('/v1/dataContracts/odcs/yaml', {
    method: 'POST',
    text: yamlContent,
    contentType: 'application/yaml',
    query: { entityId, entityType, objectName, createTestCases },
  });
  const mapped = mapDataContract(raw);
  if (!mapped) {
    throw new Error('Import ODCS contract succeeded but the response had no contract');
  }
  return mapped;
}

/** Official createOrUpdateContractFromODCSYaml: PUT /v1/dataContracts/odcs/yaml. */
export async function createOrUpdateContractFromODCSYaml(
  yamlContent: string,
  entityId: string,
  entityType: string,
  mode: 'merge' | 'replace' = 'merge',
  objectName?: string,
  createTestCases = true,
): Promise<DataContract> {
  const raw = await apiRequest<unknown>('/v1/dataContracts/odcs/yaml', {
    method: 'PUT',
    text: yamlContent,
    contentType: 'application/yaml',
    query: { entityId, entityType, mode, objectName, createTestCases },
  });
  const mapped = mapDataContract(raw);
  if (!mapped) {
    throw new Error('Update ODCS contract succeeded but the response had no contract');
  }
  return mapped;
}

/** Official validateODCSYaml: POST /v1/dataContracts/odcs/validate/yaml. */
export async function validateODCSYaml(
  yamlContent: string,
  entityId: string,
  entityType: string,
  objectName?: string,
  createTestCases = true,
): Promise<ContractValidation> {
  const raw = await apiRequest<unknown>('/v1/dataContracts/odcs/validate/yaml', {
    method: 'POST',
    text: yamlContent,
    contentType: 'application/yaml',
    query: { entityId, entityType, objectName, createTestCases },
  });
  return mapContractValidation(raw);
}

/** Official validateContractYaml: POST /v1/dataContracts/validate/yaml. */
export async function validateContractYaml(yamlContent: string): Promise<ContractValidation> {
  const raw = await apiRequest<unknown>('/v1/dataContracts/validate/yaml', {
    method: 'POST',
    text: yamlContent,
    contentType: 'application/yaml',
  });
  return mapContractValidation(raw);
}
