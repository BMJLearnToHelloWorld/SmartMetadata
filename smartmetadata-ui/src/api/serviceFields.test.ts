/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import type { CatalogService, ServiceKind } from '@/types/ingestion';
import {
  API_SERVICE_FIELDS,
  listApiServices,
  mapApiService,
} from './apiServices';
import {
  DASHBOARD_SERVICE_FIELDS,
  listDashboardServices,
  mapDashboardService,
} from './dashboardServices';
import {
  DATABASE_SERVICE_FIELDS,
  listDatabaseServices,
  mapDatabaseService,
} from './databaseServices';
import {
  DRIVE_SERVICE_FIELDS,
  listDriveServices,
  mapDriveService,
} from './driveServices';
import { listLlmServices, LLM_SERVICE_FIELDS, mapLlmService } from './llmServices';
import { listMcpServices, mapMcpService, MCP_SERVICE_FIELDS } from './mcpServices';
import {
  listMessagingServices,
  mapMessagingService,
  MESSAGING_SERVICE_FIELDS,
} from './messagingServices';
import {
  listMetadataServices,
  mapMetadataService,
  METADATA_SERVICE_FIELDS,
} from './metadataServices';
import {
  listMlModelServices,
  mapMlModelService,
  MLMODEL_SERVICE_FIELDS,
} from './mlmodelServices';
import {
  listPipelineServices,
  mapPipelineService,
  PIPELINE_SERVICE_FIELDS,
} from './pipelineServices';
import {
  listSearchServices,
  mapSearchService,
  SEARCH_SERVICE_FIELDS,
} from './searchServices';
import {
  listSecurityServices,
  mapSecurityService,
  SECURITY_SERVICE_FIELDS,
} from './securityServices';
import {
  listStorageServices,
  mapStorageService,
  STORAGE_SERVICE_FIELDS,
} from './storageServices';

/**
 * Pin getServiceByFQN fields (ServiceDetailsPage fetchServiceDetails):
 * owners,tags,followers,domains,dataProducts — except metadata
 * services, which omit dataProducts. `pipelines` is the pre-existing
 * product field and is kept on every kind.
 */
const FULL_FIELDS = 'owners,pipelines,tags,followers,domains,dataProducts';
const METADATA_FIELDS = 'owners,pipelines,tags,followers,domains';

type ServiceRow = {
  kind: ServiceKind;
  collection: string;
  fields: string;
  map: (raw: Record<string, unknown>) => CatalogService | null;
  list: () => Promise<unknown>;
};

const ROWS: ServiceRow[] = [
  { kind: 'api', collection: 'apiServices', fields: API_SERVICE_FIELDS, map: mapApiService, list: listApiServices },
  { kind: 'dashboard', collection: 'dashboardServices', fields: DASHBOARD_SERVICE_FIELDS, map: mapDashboardService, list: listDashboardServices },
  { kind: 'database', collection: 'databaseServices', fields: DATABASE_SERVICE_FIELDS, map: mapDatabaseService, list: listDatabaseServices },
  { kind: 'drive', collection: 'driveServices', fields: DRIVE_SERVICE_FIELDS, map: mapDriveService, list: listDriveServices },
  { kind: 'llm', collection: 'llmServices', fields: LLM_SERVICE_FIELDS, map: mapLlmService, list: listLlmServices },
  { kind: 'mcp', collection: 'mcpServices', fields: MCP_SERVICE_FIELDS, map: mapMcpService, list: listMcpServices },
  { kind: 'messaging', collection: 'messagingServices', fields: MESSAGING_SERVICE_FIELDS, map: mapMessagingService, list: listMessagingServices },
  { kind: 'metadata', collection: 'metadataServices', fields: METADATA_SERVICE_FIELDS, map: mapMetadataService, list: listMetadataServices },
  { kind: 'mlmodel', collection: 'mlmodelServices', fields: MLMODEL_SERVICE_FIELDS, map: mapMlModelService, list: listMlModelServices },
  { kind: 'pipeline', collection: 'pipelineServices', fields: PIPELINE_SERVICE_FIELDS, map: mapPipelineService, list: listPipelineServices },
  { kind: 'search', collection: 'searchServices', fields: SEARCH_SERVICE_FIELDS, map: mapSearchService, list: listSearchServices },
  { kind: 'security', collection: 'securityServices', fields: SECURITY_SERVICE_FIELDS, map: mapSecurityService, list: listSecurityServices },
  { kind: 'storage', collection: 'storageServices', fields: STORAGE_SERVICE_FIELDS, map: mapStorageService, list: listStorageServices },
];

describe('service fields and mappers (all 13 kinds)', () => {
  it.each(ROWS)('$kind requests the pin field set', ({ kind, fields }) => {
    expect(fields).toBe(kind === 'metadata' ? METADATA_FIELDS : FULL_FIELDS);
  });

  it.each(ROWS)('$kind maps tags, followers, domains, dataProducts, version, and attributes', ({ kind, map }) => {
    const mapped = map({
      id: 'svc-1',
      name: 'warehouse',
      serviceType: 'Postgres',
      owners: [{ id: 'u1', name: 'analyst', type: 'user' }],
      tags: [
        { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Suggested', state: 'Suggested' },
      ],
      followers: [{ id: 'u2', name: 'follower', type: 'user' }],
      domains: [{ id: 'd1', name: 'finance', type: 'domain' }],
      dataProducts: [{ id: 'dp1', name: 'revenue', type: 'dataProduct' }],
      version: 3,
      serviceAttributes: { environment: 'Production', region: 'us-east-1', deployment: 'prod-01' },
    });
    expect(mapped).toMatchObject({
      kind,
      tags: [
        { tagFQN: 'Tier.Tier1', labelType: 'Manual', state: 'Confirmed' },
        { tagFQN: 'PII.Sensitive', labelType: 'Suggested', state: 'Suggested' },
      ],
      followers: [{ id: 'u2', name: 'follower' }],
      domains: [{ id: 'd1', name: 'finance' }],
      dataProducts: [{ id: 'dp1', name: 'revenue' }],
      version: 3,
      serviceAttributes: { environment: 'Production', region: 'us-east-1', deployment: 'prod-01' },
    });
  });

  it.each(ROWS)('$kind maps a minimal payload to empty collections and undefined scalars', ({ map }) => {
    const mapped = map({ id: 'svc-1', name: 'warehouse', serviceType: 'Postgres' });
    expect(mapped).toMatchObject({
      owners: [],
      tags: [],
      followers: [],
      domains: [],
      dataProducts: [],
      version: undefined,
      serviceAttributes: undefined,
    });
  });

  describe('list requests carry the field set', () => {
    beforeEach(() => {
      localStorage.clear();
      persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it.each(ROWS)('$kind lists with fields=$fields', async ({ collection, fields, list }) => {
      await list();
      const call = vi.mocked(fetch).mock.calls.at(-1);
      const url = new URL(String(call?.[0]), 'http://localhost');
      expect(url.pathname).toBe(`/api/v1/services/${collection}`);
      expect(url.searchParams.get('fields')).toBe(fields);
    });
  });
});
