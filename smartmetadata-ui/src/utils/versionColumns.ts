/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SchemaRow } from '@/types/api';
import type { VersionColumn } from '@/ingestion/versionDiff';

export function schemaRowsToVersionColumns(rows: SchemaRow[] | undefined): VersionColumn[] {
  return (rows ?? []).map((row) => ({
    name: row.name,
    displayName: row.displayName,
    dataType: row.dataType,
    dataTypeDisplay: row.dataType,
    description: row.description,
    constraint: row.constraint,
    tags: row.tags,
    fullyQualifiedName: row.fullyQualifiedName,
    key: row.key || row.fullyQualifiedName || row.name,
    children: row.children?.length ? schemaRowsToVersionColumns(row.children) : undefined,
  }));
}
