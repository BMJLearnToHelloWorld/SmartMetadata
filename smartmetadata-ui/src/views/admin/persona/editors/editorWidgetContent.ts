/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import type { PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import type { AssetDetail } from '@/types/api';
import type {
  AssetDetailPieceContext,
  AssetDetailPieceId,
} from '@/views/AssetDetailPiece.vue';
import type { DummyEntityData } from './customizeTypes';

/**
 * Content-key → shared content piece for the EDIT view, mirroring
 * `WIDGET_CONTENT_PIECES` in `AssetDetailView.vue` (the read view
 * owns that map; the editor mirrors it because the view file is
 * outside this lane's scope and cannot be imported from). Keep the
 * two in sync: a key added to the read map belongs here too, and a
 * key with no product pane stays absent in both, so its cell stays
 * empty. Keys resolve through the same `resolveWidgetContentKey`
 * dispatch the read-side GenericTab uses. The marketplace editor is
 * not wired to the slot: if a marketplace piece is ever added to
 * the read map, the editor must be wired separately or it will
 * silently not render.
 */
export const EDITOR_WIDGET_CONTENT_PIECES: Record<string, AssetDetailPieceId> = {
  [DetailWidgetKeys.TABLE_SCHEMA]: 'schemaTable',
  [DetailWidgetKeys.TOPIC_SCHEMA]: 'schemaTable',
  [DetailWidgetKeys.CONTAINER_SCHEMA]: 'schemaTable',
  [DetailWidgetKeys.SEARCH_INDEX_FIELDS]: 'schemaTable',
  [DetailWidgetKeys.DATA_MODEL]: 'schemaTable',
  [DetailWidgetKeys.DATABASE_SCHEMA]: 'related',
  [DetailWidgetKeys.TABLES]: 'related',
  [DetailWidgetKeys.CONTAINER_CHILDREN]: 'related',
  [DetailWidgetKeys.FREQUENTLY_JOINED_TABLES]: 'frequentlyJoined',
  [DetailWidgetKeys.CHARTS_TABLE]: 'chartsTables',
  [DetailWidgetKeys.PIPELINE_TASKS]: 'tasks',
  [DetailWidgetKeys.STORED_PROCEDURE_CODE]: 'code',
  [DetailWidgetKeys.ML_MODEL_FEATURES]: 'features',
  [DetailWidgetKeys.API_ENDPOINTS]: 'apiEndpoints',
  [DetailWidgetKeys.API_SCHEMA]: 'apiSchema',
  [DetailWidgetKeys.METRIC_DEFINITION]: 'metricExpression',
  [DetailWidgetKeys.CUSTOM_PROPERTIES]: 'customProperties',
  [DetailWidgetKeys.DESCRIPTION]: 'description',
  [DetailWidgetKeys.TAGS]: 'tags',
  [DetailWidgetKeys.GLOSSARY_TERMS]: 'glossaryTerms',
  [DetailWidgetKeys.OWNERS]: 'owners',
  [DetailWidgetKeys.DOMAIN]: 'domains',
};

export function pieceForEditorContentKey(
  contentKey: string | null,
): AssetDetailPieceId | null {
  return contentKey ? (EDITOR_WIDGET_CONTENT_PIECES[contentKey] ?? null) : null;
}

const EMPTY_TASK_GRAPH: PipelineTaskGraphModel = { nodes: [], edges: [] };

/**
 * Dummy `AssetDetailPieceContext` for the edit view (official
 * GenericWidget renders its matched component with
 * `getDummyDataByPage` data inside a GenericProvider): the dummy
 * asset carries only the page's dummy fields, every list is empty,
 * and every callback is a no-op — the pieces are prop-driven and
 * fetch nothing, so the preview renders live content without any
 * network call.
 */
export function buildEditorPieceContext(
  dummy: DummyEntityData,
  entityType: string,
): AssetDetailPieceContext {
  const asset: AssetDetail = {
    entityType,
    name: dummy.name ?? '',
    fullyQualifiedName: dummy.fullyQualifiedName ?? '',
    displayName: dummy.displayName,
    description: dummy.description,
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: '',
  };
  return {
    asset,
    entityType,
    schemaColumns: [],
    schemaExpandable: { rowExpandable: () => false },
    featureColumns: [],
    hyperColumns: [],
    refColumns: [],
    apiEndpointColumns: [],
    taskGraph: EMPTY_TASK_GRAPH,
    taskGraphEmpty: true,
    customProperties: [],
    customPropsError: '',
    apiEndpoints: [],
    apiEndpointsError: '',
    apiEndpointSchemaJson: () => '',
    onApiEndpointClick: () => {},
    descriptionAccess: false,
    descriptionExpanded: false,
    onDescriptionUpdate: () => {},
    customPropsCanView: false,
    schemaTagOptions: [],
    schemaTagAccess: { canEditTags: false, canEditGlossaryTerms: false, readOnly: false },
    onSchemaTagChange: () => {},
    schemaTagFilterOptions: { classification: [], glossary: [] },
    onSchemaTableChange: () => {},
    // D-2 batch 2 widget cells: the editor preview renders the pieces
    // read-only, so the catalog is empty, every edit gate is off, and
    // every save is a no-op (the fields are required by the context
    // type because the live view always provides them).
    catalogOwners: [],
    catalogTags: [],
    catalogDomains: [],
    tagsAccess: false,
    glossaryTermsAccess: false,
    ownersAccess: false,
    domainsAccess: false,
    dataProductsAccess: false,
    customPropsCanEdit: false,
    onTagsChange: async () => {},
    onOwnersChange: async () => {},
    onDomainsChange: async () => {},
    onDataProductsChange: async () => {},
    onCustomPropertySave: async () => {},
  };
}
