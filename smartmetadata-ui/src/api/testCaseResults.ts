/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { TestCaseResult } from '@/types/quality';
import { apiRequest } from './client';
import { mapTestCaseResult } from './testCases';

export interface ListTestCaseResultsQuery {
  startTs?: number;
  endTs?: number;
}

export function listTestCaseResults(
  testCaseFqn: string,
  query: ListTestCaseResultsQuery = {},
): Promise<Paged<TestCaseResult>> {
  return apiRequest<unknown>(`/v1/dataQuality/testCases/testCaseResults/${encodeURIComponent(testCaseFqn)}`, {
    query: {
      startTs: query.startTs,
      endTs: query.endTs,
    },
  }).then((payload) => parsePaged(payload, (raw) => mapTestCaseResult(raw) ?? null));
}
