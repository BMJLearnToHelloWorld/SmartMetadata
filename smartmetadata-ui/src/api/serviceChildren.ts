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
import type { ServiceKind } from '@/types/ingestion';
import { apiRequest } from './client';
import { listDriveAssets } from './driveAssets';
import { mapServicePageData, type ServicePageData } from './servicePageData';

/**
 * Pin `commonTableFields` (utils/DatasetDetailsUtils.ts): the field
 * set every child-entity list request asks for. Certification is
 * included because the main-tab columns read it.
 */
export const SERVICE_CHILDREN_FIELDS = 'tags,owners,domains,dataProducts,certification';

/**
 * Pin classic fetch field strings (ServiceDetailsPage.tsx): database
 * prepends usageSummary, dashboard appends it, pipeline always asks
 * for state and appends usageSummary, and the remaining kinds ask
 * for the common set only. The ordering is preserved exactly —
 * usageSummary placement differs per kind in the pin.
 */
export function buildServiceChildrenFields(kind: ServiceKind, canViewUsage: boolean): string {
  switch (kind) {
    case 'database':
      return canViewUsage ? `usageSummary,${SERVICE_CHILDREN_FIELDS}` : SERVICE_CHILDREN_FIELDS;
    case 'dashboard':
      return canViewUsage ? `${SERVICE_CHILDREN_FIELDS},usageSummary` : SERVICE_CHILDREN_FIELDS;
    case 'pipeline':
      return canViewUsage
        ? `${SERVICE_CHILDREN_FIELDS},state,usageSummary`
        : `${SERVICE_CHILDREN_FIELDS},state`;
    default:
      return SERVICE_CHILDREN_FIELDS;
  }
}

export interface ServiceChildrenParams {
  /** Service FQN, sent as the `service` query parameter. */
  service: string;
  fields: string;
  paging?: { limit?: number; after?: string; before?: string };
  include: IncludeFilter;
}

export type ServiceChildrenFetcher = (
  params: ServiceChildrenParams,
) => Promise<Paged<ServicePageData>>;

async function listChildren(
  collection: string,
  params: ServiceChildrenParams,
  extra?: Record<string, string | number | boolean | undefined>,
): Promise<Paged<ServicePageData>> {
  const payload = await apiRequest<unknown>(`/v1/${collection}`, {
    query: {
      service: params.service,
      fields: params.fields,
      include: params.include,
      limit: params.paging?.limit,
      after: params.paging?.after,
      before: params.paging?.before,
      ...extra,
    },
  });
  return parsePaged(payload, mapServicePageData);
}

/**
 * The single kind → child-entity table for the service main tab.
 * Pin dispatches the same nine categories in getOtherDetails and
 * callServicePatchAPI (classic ServiceDetailsPage): each service
 * kind lists one child entity type from one collection. Containers,
 * search indexes, and drive directories ask for root entities only;
 * drive lists through the drives API. Kinds without a child list
 * (metadata, security, llm, mcp) have no entry. Both the fetch
 * dispatch below and the main tab's patch dispatch read this table
 * — there is exactly one copy of the nine-way mapping.
 */
interface ServiceChildDescriptor {
  kind: ServiceKind;
  entityType: string;
  collection: string;
  root?: boolean;
  viaDriveApi?: boolean;
}

const SERVICE_CHILD_DESCRIPTORS: readonly ServiceChildDescriptor[] = [
  { kind: 'database', entityType: 'database', collection: 'databases' },
  { kind: 'messaging', entityType: 'topic', collection: 'topics' },
  { kind: 'dashboard', entityType: 'dashboard', collection: 'dashboards' },
  { kind: 'pipeline', entityType: 'pipeline', collection: 'pipelines' },
  { kind: 'mlmodel', entityType: 'mlmodel', collection: 'mlmodels' },
  { kind: 'storage', entityType: 'container', collection: 'containers', root: true },
  { kind: 'search', entityType: 'searchIndex', collection: 'searchIndexes', root: true },
  { kind: 'api', entityType: 'apiCollection', collection: 'apiCollections' },
  {
    kind: 'drive',
    entityType: 'directory',
    collection: 'directories',
    root: true,
    viaDriveApi: true,
  },
];

/** Child entity type per service kind; undefined for kinds without a child table. */
export const CHILD_ENTITY_TYPE_BY_KIND: Readonly<Partial<Record<ServiceKind, string>>> =
  Object.fromEntries(SERVICE_CHILD_DESCRIPTORS.map((d) => [d.kind, d.entityType]));

/**
 * Pin `getServiceChildren` dispatch (utils/connectionServiceChildren.
 * utils.ts): a Map from service category to the child-entity fetcher,
 * derived from the single descriptor table above.
 */
export const SERVICE_CHILDREN_FETCHERS: Map<ServiceKind, ServiceChildrenFetcher> = new Map(
  SERVICE_CHILD_DESCRIPTORS.map((descriptor) => [
    descriptor.kind,
    (params: ServiceChildrenParams): Promise<Paged<ServicePageData>> =>
      descriptor.viaDriveApi
        ? listDriveAssets('directory', {
            service: params.service,
            fields: params.fields,
            paging: params.paging,
            include: params.include,
            root: true,
          })
        : listChildren(
            descriptor.collection,
            params,
            descriptor.root ? { root: true } : undefined,
          ),
  ]),
);

export function fetchServiceChildren(
  kind: ServiceKind,
  params: ServiceChildrenParams,
): Promise<Paged<ServicePageData>> | undefined {
  return SERVICE_CHILDREN_FETCHERS.get(kind)?.(params);
}

/**
 * Pin count pattern: no fields, limit 0 — only the paging total is
 * read. Returns undefined for kinds without a child list.
 */
export function countServiceChildren(
  kind: ServiceKind,
  service: string,
  include: IncludeFilter,
): Promise<number> | undefined {
  const page = fetchServiceChildren(kind, {
    service,
    fields: '',
    paging: { limit: 0 },
    include,
  });
  return page?.then((result) => result.total ?? 0);
}
