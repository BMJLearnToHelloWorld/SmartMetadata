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

/** Minimal DataContract read shape: only what the AssetHealth row needs. */
export interface DataContract {
  id: string;
  name: string;
  fullyQualifiedName?: string;
  latestResult?: DataContractLatestResult;
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
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    latestResult: mapLatestResult(rec.latestResult),
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
