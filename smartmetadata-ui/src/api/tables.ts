/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString } from '@/api/json';
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import { apiRequest } from './client';

export interface TableColumnRef {
  name: string;
  dataType?: string;
}

export interface TableColumns {
  fullyQualifiedName: string;
  name: string;
  columns: TableColumnRef[];
}

/**
 * Official GET /v1/tables/name/{fqn} (TableResource.getByName): the only
 * read the tableDiff form needs — a table's columns, by FQN. Used for both
 * sides: table1 (the case's own entity) and table2 (the selected table).
 * ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
 */
export async function getTableByName(fqn: string): Promise<TableColumns> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/tables/name/${encodeFqnForApi(fqn)}`,
    { query: { fields: 'columns' } },
  );
  const columns = Array.isArray(raw.columns)
    ? raw.columns.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        const name = asString(rec.name);
        if (!name) {
          return [];
        }
        return [{ name, dataType: asString(rec.dataType) || undefined }];
      })
    : [];
  return {
    fullyQualifiedName: asString(raw.fullyQualifiedName) || fqn,
    name: asString(raw.name) || fqn,
    columns,
  };
}
