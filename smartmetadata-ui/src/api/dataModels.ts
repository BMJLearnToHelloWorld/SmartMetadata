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
import type { IncludeFilter, Paged } from '@/types/admin';
import { apiRequest } from './client';
import { mapServicePageData, type ServicePageData } from './servicePageData';

export interface ListDataModelsQuery {
  service?: string;
  fields?: string;
  after?: string;
  before?: string;
  include?: IncludeFilter;
  limit?: number;
}

/**
 * Pin getDataModels (rest/dashboardAPI.ts): GET
 * /v1/dashboard/datamodels with service, fields, cursor, include,
 * and limit forwarded as given.
 */
export async function listDataModels(
  query: ListDataModelsQuery,
): Promise<Paged<ServicePageData>> {
  const payload = await apiRequest<unknown>('/v1/dashboard/datamodels', {
    query: {
      service: query.service,
      fields: query.fields,
      after: query.after,
      before: query.before,
      include: query.include,
      limit: query.limit,
    },
  });
  return parsePaged(payload, mapServicePageData);
}

/**
 * Pin secondary-count pattern for data models: limit 0, no fields —
 * only the paging total is read.
 */
export async function countDataModels(
  service: string,
  include: IncludeFilter,
): Promise<number> {
  const page = await listDataModels({ service, include, limit: 0 });
  return page.total ?? 0;
}
