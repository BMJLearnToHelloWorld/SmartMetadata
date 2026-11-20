/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Shared mount + fetch harness for the ServiceDetailView suites
 * (ServiceDetailView.test.ts and ServiceDetailView.gateMatrix.test.ts).
 * The stubbed fetch answers every endpoint the page reads; the
 * MockOptions knobs vary the role cells the §7.3 gate matrix asserts
 * (service permission ops, service owners, admin flag). Extracted
 * verbatim from ServiceDetailView.test.ts so both suites mount the
 * page the same way.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import ServiceDetailView from './ServiceDetailView.vue';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export interface FetchCall {
  method: string;
  url: string;
  body?: string;
}

export interface MockOptions {
  /** Pipelines the list endpoint returns. */
  pipelines?: Array<Record<string, unknown>>;
  pipelinesTotal?: number;
  /** Resource permission bits; both default to allow. */
  ingestionPipelineCreate?: boolean;
  applicationTrigger?: boolean;
  /** Workflow instances for the AutoPilot running check, or 'error' to fail the fetch. */
  workflowInstances?: Array<Record<string, unknown>> | 'error';
  /** States of the first instance's run, or 'error' to fail the states fetch. */
  workflowInstanceStates?: Array<Record<string, unknown>> | 'error';
  /** Status for the apps trigger POST. */
  triggerStatus?: number;
  /** Connection config overrides (supports* flags default to the Postgres set). */
  serviceConfig?: Record<string, unknown>;
  /** Entity version carried by the service body, when the test needs the version button. */
  serviceVersion?: number;
  /** Followers carried by the service body. */
  serviceFollowers?: Array<Record<string, unknown>>;
  /** Child rows the databases list endpoint returns; absent means the endpoint 404s. */
  childRows?: Array<Record<string, unknown>>;
  /** The service body carries deleted: true. */
  serviceDeleted?: boolean;
  /** Follow/unfollow requests fail with a 500. */
  followFails?: boolean;
  /** A /displayName PATCH echoes only { id, displayName }, to prove merge-only echo. */
  patchEchoPartial?: boolean;
  /** Entity permission ops the service-permission endpoint returns; defaults to the full editor set. */
  servicePermissionOps?: string[];
  /** Owners carried by the service body (drives the owner-role cells). */
  serviceOwners?: Array<Record<string, unknown>>;
}

export const DEFAULT_CONFIG = {
  type: 'Postgres',
  hostPort: 'localhost:5432',
  supportsMetadataExtraction: true,
  supportsUsageExtraction: true,
  supportsLineageExtraction: true,
  supportsProfiler: true,
  supportsDBTExtraction: true,
};

export const DEFAULT_PIPELINE = {
  id: 'p1',
  name: 'daily',
  fullyQualifiedName: 'pg.warehouse.daily',
  pipelineType: 'metadata',
  enabled: true,
  deployed: true,
  service: { id: 's1', type: 'databaseService', name: 'warehouse' },
};

export function permissionBody(resource: string, operations: string[]): Record<string, unknown> {
  return {
    resource,
    permissions: operations.map((operation) => ({ operation, access: 'allow' })),
  };
}

export function stubFetch(calls: FetchCall[], options: MockOptions = {}): void {
  // The service URL is matched generically (any `<kind>Services/s1`):
  // the stub answers every service kind, so a mount for a non-database
  // kind does not need the caller to repeat the kind here — the old
  // kind-derived servicePath defaulted to databaseServices and let
  // dashboard/metadata/security GETs fall through to the 404 default,
  // which blanked the page to "not found" with zero tabs rendered.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, body: String(init?.body ?? '') });
      // The followers URLs also contain the service prefix: answer
      // them before the plain service branch below.
      if (/\/api\/v1\/services\/[a-zA-Z]+Services\/s1\/followers/.test(url)) {
        if (options.followFails) {
          return new Response('boom', { status: 500 });
        }
        if (init?.method === 'PUT') {
          return jsonResponse({
            changeDescription: {
              fieldsAdded: [
                {
                  field: 'followers',
                  newValue: [{ id: 'u1', type: 'user', name: 'alice' }],
                },
              ],
            },
          });
        }
        return jsonResponse({
          changeDescription: {
            fieldsDeleted: [{ field: 'followers', oldValue: [{ id: 'u1' }] }],
          },
        });
      }
      if (/\/api\/v1\/services\/[a-zA-Z]+Services\/s1/.test(url)) {
        const body: Record<string, unknown> = {
          id: 's1',
          name: 'warehouse',
          displayName: 'Warehouse',
          fullyQualifiedName: 'pg.warehouse',
          serviceType: 'Postgres',
          connection: { config: { ...DEFAULT_CONFIG, ...(options.serviceConfig ?? {}) } },
        };
        if (options.serviceVersion !== undefined) {
          body.version = options.serviceVersion;
        }
        if (options.serviceFollowers !== undefined) {
          body.followers = options.serviceFollowers;
        }
        if (options.serviceOwners !== undefined) {
          body.owners = options.serviceOwners;
        }
        if (options.serviceDeleted) {
          body.deleted = true;
        }
        if (init?.method === 'PATCH') {
          // Apply a /displayName replace so rename tests see the echo.
          const ops = JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>;
          let displayNameOp: Record<string, unknown> | undefined;
          for (const op of ops) {
            if (op.path === '/displayName') {
              body.displayName = op.value;
              displayNameOp = op;
            }
          }
          if (options.patchEchoPartial && displayNameOp) {
            return jsonResponse({ id: 's1', displayName: displayNameOp.value });
          }
        }
        return jsonResponse(body);
      }
      if (url.includes('/api/v1/databases')) {
        if (options.childRows) {
          return jsonResponse({ data: options.childRows, paging: { total: options.childRows.length } });
        }
        return new Response('not found', { status: 404 });
      }
      // The progress stream URL also contains the ingestionPipelines
      // prefix: answer 503 (fatal, no reconnect loop) before the list branch.
      if (url.includes('/progress/service/')) {
        return new Response('no tracking', { status: 503 });
      }
      if (url.includes('/api/v1/services/ingestionPipelines/status')) {
        return jsonResponse({ code: 200, platform: 'airflow' });
      }
      if (url.includes('/api/v1/services/ingestionPipelines')) {
        const data = options.pipelines ?? [DEFAULT_PIPELINE];
        return jsonResponse({ data, paging: { total: options.pipelinesTotal ?? data.length } });
      }
      if (url.includes('/api/v1/permissions/ingestionPipeline/')) {
        return jsonResponse(
          permissionBody('ingestionPipeline', [
            'Trigger',
            'EditAll',
            'Delete',
            'ViewAll',
            'Deploy',
            'EditIngestionPipelineStatus',
          ]),
        );
      }
      if (url.includes('/api/v1/permissions/ingestionPipeline')) {
        return jsonResponse(
          permissionBody(
            'ingestionPipeline',
            options.ingestionPipelineCreate === false ? [] : ['Create'],
          ),
        );
      }
      if (url.includes('/api/v1/permissions/databaseService/name/')) {
        return jsonResponse(
          permissionBody(
            'databaseService',
            options.servicePermissionOps ?? ['EditAll', 'Delete', 'ViewAll', 'EditDisplayName'],
          ),
        );
      }
      // The other service kinds resolve their entity permission the
      // same way; answer them with the same knob so the gate-matrix
      // tests can vary ops per kind. Kept after the databaseService
      // branch above so the `/api/v1/permissions/database` child
      // branch below still sees its own URL first.
      const servicePermissionMatch =
        /\/api\/v1\/permissions\/(dashboardService|metadataService|securityService|messagingService|mlmodelService|pipelineService|searchService|driveService)\/name\//.exec(
          url,
        );
      if (servicePermissionMatch) {
        return jsonResponse(
          permissionBody(
            servicePermissionMatch[1]!,
            options.servicePermissionOps ?? ['EditAll', 'Delete', 'ViewAll', 'EditDisplayName'],
          ),
        );
      }
      // The child-resource permission (ViewUsage decides the
      // usageSummary field). Checked after the databaseService
      // entity branch above: that path also contains this prefix.
      if (url.includes('/api/v1/permissions/database')) {
        return jsonResponse(permissionBody('database', ['ViewAll', 'ViewUsage']));
      }
      if (url.includes('/api/v1/permissions/app')) {
        return jsonResponse(
          permissionBody('app', options.applicationTrigger === false ? [] : ['Trigger']),
        );
      }
      if (url.includes('/api/v1/governance/workflowInstances')) {
        if (options.workflowInstances === 'error') {
          return new Response('boom', { status: 500 });
        }
        const data = options.workflowInstances ?? [];
        return jsonResponse({ data, paging: { total: data.length } });
      }
      if (url.includes('/api/v1/governance/workflowInstanceStates/')) {
        if (options.workflowInstanceStates === 'error') {
          return new Response('boom', { status: 500 });
        }
        const data = options.workflowInstanceStates ?? [];
        return jsonResponse({ data, paging: { total: data.length } });
      }
      if (url.includes('/api/v1/apps/trigger/')) {
        return new Response('', { status: options.triggerStatus ?? 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

export const mounted: Array<{ unmount(): void }> = [];

export async function mountView(
  options: { tab?: string; kind?: string; id?: string; isAdmin?: boolean } = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'u1', name: 'alice', isAdmin: options.isAdmin ?? true };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/connections', name: 'connections', component: { template: '<div>list</div>' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div>category</div>' } },
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: ServiceDetailView,
        props: true,
      },
      {
        path: '/ingestion/services/:kind/:id/connection',
        name: 'ingestion-service-connection',
        component: { template: '<div>conn</div>' },
        props: true,
      },
      {
        path: '/ingestion/services/:kind/:id/versions/:version',
        name: 'ingestion-service-version',
        component: { template: '<div>version</div>' },
        props: true,
      },
      {
        path: '/ingestion/pipelines/:id',
        name: 'ingestion-pipeline',
        component: { template: '<div>pipe</div>' },
        props: true,
      },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
        props: true,
      },
      {
        path: '/ingestion/services/:kind/:id/add/:ingestionType',
        name: 'ingestion-service-add-ingestion',
        component: { template: '<div>add</div>' },
        props: true,
      },
    ],
  });
  const kind = options.kind ?? 'database';
  const tabQuery = options.tab ? `?tab=${options.tab}` : '';
  await router.push(`/ingestion/services/${kind}/${options.id ?? 's1'}${tabQuery}`);
  await router.isReady();
  const wrapper = mount(ServiceDetailView, {
    props: { kind, id: options.id ?? 's1' },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}
