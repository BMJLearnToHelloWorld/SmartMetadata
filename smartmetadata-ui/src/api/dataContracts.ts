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
