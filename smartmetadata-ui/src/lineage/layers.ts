/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Layers panel model, mapped from the official canvas
 * (`openmetadata-ui/.../Entity/EntityLineage/LineageLayers/LineageLayers.tsx`
 * at pin a3012259ca, plus `hooks/lineage/types.ts` and
 * `constants/ServiceType.constant.ts`).
 *
 * The panel offers two kinds of selection, exactly like pin:
 * - overlays (multi-select): ColumnLevelLineage + DataObservability, which
 *   live in the lineage store's `activeLayer`;
 * - platform views (one at a time): Service / Domain / DataProduct, which
 *   live in the store's `platformView` and re-center the graph on the
 *   container entity (pin `resolvePlatformViewEntityFetchArgs`,
 *   `Lineage.tsx:439-452`).
 */

import type { LineageLayer } from './config';

/** Pin `LineagePlatformView` (`hooks/lineage/types.ts`). */
export type LineagePlatformView = 'None' | 'Service' | 'Domain' | 'DataProduct';

export const LINEAGE_PLATFORM_VIEW_NONE: LineagePlatformView = 'None';

/**
 * Pin `SERVICE_TYPES` (`constants/ServiceType.constant.ts:312-323`): the
 * eleven `*Service` entity types. Service entities get no overlays and no
 * platform views — and the canvas disables editing on them
 * (pin `EntityLineageCanvas canEdit`).
 */
export const LINEAGE_SERVICE_ENTITY_TYPES: ReadonlyArray<string> = [
  'databaseService',
  'dashboardService',
  'messagingService',
  'pipelineService',
  'mlmodelService',
  'metadataService',
  'storageService',
  'searchService',
  'apiService',
  'securityService',
  'driveService',
];

export function isLineageServiceEntityType(entityType: string): boolean {
  return LINEAGE_SERVICE_ENTITY_TYPES.includes(entityType);
}

/**
 * The entity context the Layers gating needs: the focus entity's service,
 * domains and data products. The canvas fetches just these fields from the
 * entity detail endpoint (`fields=domains,dataProducts,service`); a failed
 * or unwired fetch yields an empty context, which only hides the
 * Domain/DataProduct views — never the overlays or the Service view.
 */
export interface LineageEntityContext {
  service?: { fullyQualifiedName: string; type: string };
  domains?: { fullyQualifiedName: string; type: string }[];
  dataProducts?: { fullyQualifiedName: string; type: string }[];
}

interface EntityRefLike {
  fullyQualifiedName?: unknown;
  type?: unknown;
}

function asEntityRef(value: unknown): { fullyQualifiedName: string; type: string } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const rec = value as EntityRefLike;
  const fqn = typeof rec.fullyQualifiedName === 'string' ? rec.fullyQualifiedName : '';
  if (!fqn) {
    return undefined;
  }
  return {
    fullyQualifiedName: fqn,
    type: typeof rec.type === 'string' ? rec.type : '',
  };
}

function asEntityRefList(value: unknown): { fullyQualifiedName: string; type: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const ref = asEntityRef(item);
    return ref ? [ref] : [];
  });
}

/** Extract the Layers context from an entity-detail payload (unknown shape). */
export function parseLineageEntityContext(payload: unknown): LineageEntityContext {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const rec = payload as Record<string, unknown>;
  const service = asEntityRef(rec.service);
  const domains = asEntityRefList(rec.domains);
  const dataProducts = asEntityRefList(rec.dataProducts);
  return {
    ...(service ? { service } : {}),
    ...(domains.length > 0 ? { domains } : {}),
    ...(dataProducts.length > 0 ? { dataProducts } : {}),
  };
}

/** Every key the Layers panel can offer, in pin's menu order. */
export type LineageLayerKey = LineageLayer | LineagePlatformView;

export const LINEAGE_LAYER_OVERLAYS: ReadonlyArray<LineageLayer> = [
  'ColumnLevelLineage',
  'DataObservability',
];

export const LINEAGE_PLATFORM_VIEWS: ReadonlyArray<LineagePlatformView> = [
  'Service',
  'Domain',
  'DataProduct',
];

/**
 * Pin `getAssetLayerKeys` (LineageLayers.tsx), verbatim:
 * - column + observability overlays only for non-service types;
 * - Service view for non-service types;
 * - Domain view only when the entity type is not `domain` and the entity
 *   has domains;
 * - DataProduct view only when the entity type is not `domain` and the
 *   (Table) entity has data products.
 */
export function getAssetLayerKeys(
  entityType: string,
  entity: LineageEntityContext | undefined,
): LineageLayerKey[] {
  const isServiceType = isLineageServiceEntityType(entityType);
  const hasDomainContext = Boolean(entityType && entityType !== 'domain');
  const keys: LineageLayerKey[] = [];
  if (entityType && !isServiceType) {
    keys.push('ColumnLevelLineage', 'DataObservability');
  }
  if (!isServiceType) {
    keys.push('Service');
  }
  if (hasDomainContext && (entity?.domains?.length ?? 0) > 0) {
    keys.push('Domain');
  }
  if (hasDomainContext && (entity?.dataProducts?.length ?? 0) > 0) {
    keys.push('DataProduct');
  }
  return keys;
}

/** Focus for a platform-view fetch: the container entity to re-center on. */
export interface PlatformViewFetchArgs {
  fqn: string;
  type: string;
}

/**
 * Pin `resolvePlatformViewEntityFetchArgs` (Lineage.tsx:439-452), verbatim:
 * Service → the entity's service; Domain → the first domain; DataProduct →
 * the first data product; None → undefined. The canvas refetches lineage
 * centered on the returned entity; when it returns undefined the view
 * cannot be entered and the panel reports it instead of fetching blind.
 */
export function resolvePlatformViewFetchArgs(
  platformView: LineagePlatformView,
  entity: LineageEntityContext | undefined,
): PlatformViewFetchArgs | undefined {
  if (platformView === 'Service') {
    const service = entity?.service;
    return service ? { fqn: service.fullyQualifiedName, type: service.type } : undefined;
  }
  if (platformView === 'Domain') {
    const domain = entity?.domains?.[0];
    return domain ? { fqn: domain.fullyQualifiedName, type: domain.type || 'domain' } : undefined;
  }
  if (platformView === 'DataProduct') {
    const product = entity?.dataProducts?.[0];
    return product
      ? { fqn: product.fullyQualifiedName, type: product.type || 'dataProduct' }
      : undefined;
  }
  return undefined;
}
