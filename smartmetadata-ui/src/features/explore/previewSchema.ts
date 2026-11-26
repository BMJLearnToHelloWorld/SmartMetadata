/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AssetDetail, EntityRef, SchemaRow } from '@/types/api';

/**
 * E-3d: pin `EntitySummaryPanelUtils.tsx` (a3012259ca)
 * `getChildComponentDetails` + `getDirectSummaryComponent`, for the
 * Schema tab's 11 types (`SCHEMA_TABS_SET`,
 * `EntityRightPanelVerticalNav.constants.ts:19-30`). The tab renders
 * from the entity the preview already fetched (E-3a `fetchAssetDetail`
 * requests every field below), never from a second fetch:
 *
 * - table / dashboardDataModel → paginated `ColumnSummaryList`
 *   (`:306-315`); topic → schema fields; container → columns;
 *   searchIndex → fields — all four read `AssetDetail.schemaRows`,
 *   which `api/entities.ts` maps from `columns` / `messageSchema`
 *   / `dataModel.columns` / `fields` respectively.
 * - pipeline → tasks (`detail.tasks`); database → its schemas
 *   (`detail.children`, mapped from `databaseSchemas`).
 * - dashboard → charts + data models (`detail.charts` /
 *   `detail.dataModels`, pin `getDashboardSummary`).
 * - apiEndpoint → request / response schema (`APIEndpointSummary`):
 *   formatted field rows when the schema record carries
 *   `schemaFields`, else the raw schema JSON.
 * - apiCollection / databaseSchema → pin renders nothing
 *   (`nullSummary`), so the builder returns no sections and the tab
 *   shows the no-data empty state.
 *
 * mlmodel / chart / metric / storedProcedure have child builders in
 * pin too, but `SCHEMA_TABS_SET` does not include them, so pin's
 * preview never shows them a Schema tab — neither does this builder.
 * Their builders serve other pin surfaces, not this tab.
 */

export interface PreviewSchemaListItem {
  key: string;
  name: string;
  dataType?: string;
  description?: string;
}

export interface PreviewSchemaRefItem {
  key: string;
  name: string;
  type?: string;
  fqn?: string;
}

export type PreviewSchemaSection =
  | {
      kind: 'rows';
      headingKey: string;
      rows: PreviewSchemaListItem[];
      pageSize: number;
    }
  | {
      kind: 'tasks';
      headingKey: string;
      tasks: PreviewSchemaListItem[];
    }
  | { kind: 'refs'; headingKey: string; refs: PreviewSchemaRefItem[] }
  | { kind: 'json'; headingKey: string; json: string };

/** Pin `ColumnSummaryList` pages at `PAGE_SIZE_LARGE` (50). */
export const PREVIEW_SCHEMA_PAGE_SIZE = 50;

function rowsOf(rows: SchemaRow[] | undefined): PreviewSchemaListItem[] {
  return (rows ?? []).map((row) => ({
    key: row.key,
    name: row.displayName || row.name,
    dataType: row.dataType || undefined,
    description: row.description || undefined,
  }));
}

function refsOf(refs: EntityRef[] | undefined): PreviewSchemaRefItem[] {
  return (refs ?? []).map((ref) => ({
    key: ref.fullyQualifiedName || ref.id || ref.name,
    name: ref.displayName || ref.name,
    type: ref.type || undefined,
    fqn: ref.fullyQualifiedName || undefined,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** API endpoint schema fields (`schemaFields`), when the record carries them. */
function schemaFieldRows(record: Record<string, unknown> | undefined): PreviewSchemaListItem[] | null {
  if (!record || !Array.isArray(record.schemaFields)) {
    return null;
  }
  const rows = record.schemaFields.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const name = typeof item.name === 'string' ? item.name : '';
    if (!name) {
      return [];
    }
    return [
      {
        key: name,
        name: typeof item.displayName === 'string' && item.displayName ? item.displayName : name,
        dataType: typeof item.dataType === 'string' ? item.dataType : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
      },
    ];
  });
  return rows.length ? rows : null;
}

export function buildPreviewSchemaSections(
  entityType: string,
  detail: AssetDetail | null,
): PreviewSchemaSection[] {
  if (!detail) {
    return [];
  }
  switch (entityType) {
    case 'table':
    case 'container':
    case 'topic':
      return [
        {
          kind: 'rows',
          headingKey: 'asset.tabs.schema',
          rows: rowsOf(detail.schemaRows),
          pageSize: PREVIEW_SCHEMA_PAGE_SIZE,
        },
      ];
    case 'dashboardDataModel':
      return [
        {
          kind: 'rows',
          headingKey: 'label.column-plural',
          rows: rowsOf(detail.schemaRows),
          pageSize: PREVIEW_SCHEMA_PAGE_SIZE,
        },
      ];
    case 'searchIndex':
      return [
        {
          kind: 'rows',
          headingKey: 'asset.tabs.fields',
          rows: rowsOf(detail.schemaRows),
          pageSize: PREVIEW_SCHEMA_PAGE_SIZE,
        },
      ];
    case 'pipeline':
      return [
        {
          kind: 'tasks',
          headingKey: 'asset.tabs.tasks',
          tasks: (detail.tasks ?? []).map((task) => ({
            key: task.fullyQualifiedName || task.name,
            name: task.displayName || task.name,
            dataType: task.taskType || undefined,
            description: task.description || undefined,
          })),
        },
      ];
    case 'database':
      return [{ kind: 'refs', headingKey: 'asset.tabs.schema', refs: refsOf(detail.children) }];
    case 'dashboard': {
      const sections: PreviewSchemaSection[] = [];
      sections.push({ kind: 'refs', headingKey: 'label.chart-plural', refs: refsOf(detail.charts) });
      sections.push({
        kind: 'refs',
        headingKey: 'label.dashboard-data-model-plural',
        refs: refsOf(detail.dataModels),
      });
      return sections;
    }
    case 'apiEndpoint': {
      const sections: PreviewSchemaSection[] = [];
      const schemas: { record: Record<string, unknown> | undefined; headingKey: string }[] = [
        { record: detail.apiRequestSchema, headingKey: 'asset.fields.apiRequestSchema' },
        { record: detail.apiResponseSchema, headingKey: 'asset.fields.apiResponseSchema' },
      ];
      for (const { record, headingKey } of schemas) {
        if (!record) {
          continue;
        }
        const rows = schemaFieldRows(record);
        if (rows) {
          sections.push({ kind: 'rows', headingKey, rows, pageSize: PREVIEW_SCHEMA_PAGE_SIZE });
        } else {
          sections.push({ kind: 'json', headingKey, json: JSON.stringify(record, null, 2) });
        }
      }
      return sections;
    }
    default:
      // apiCollection / databaseSchema: pin renders null (see header).
      return [];
  }
}
