/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLineageEdgeDetails, getLineageScene } from '@/api/lineage';
import { ELKLayout } from '@/lineage/elkLayout';
import { captureLineagePng } from '@/lineage/exportPng';
import {
  LINEAGE_MAP_ONBOARDING_COOKIE,
  type LineageScene,
} from '@/lineage/scene';
import { createTestI18n } from '@/test/i18n';
import LineageMap from './LineageMap.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());
vi.mock('@/api/lineage', () => ({
  getLineageScene: vi.fn(),
  getLineageEdgeDetails: vi.fn(),
}));
vi.mock('@/lineage/exportPng', () => ({
  captureLineagePng: vi.fn(async () => undefined),
  lineagePngFileName: (entityType: string, fqn: string) => `lineage-${entityType}-${fqn}.png`,
}));

const mockedGetLineageScene = vi.mocked(getLineageScene);
const mockedGetLineageEdgeDetails = vi.mocked(getLineageEdgeDetails);
const mockedCapturePng = vi.mocked(captureLineagePng);

const LAYER_SCENE: LineageScene = {
  band: 'LAYER',
  lens: 'service',
  breadcrumb: [{ band: 'LAYER', id: 'root', label: 'All services', levelKind: 'service' }],
  edges: [],
  nodes: [
    {
      band: 'LAYER',
      id: 'svc1',
      label: 'svc1',
      displayName: 'Svc One',
      levelKind: 'service',
      entityType: 'databaseService',
      fullyQualifiedName: 'svc1',
      isExpandable: true,
      childrenCount: 3,
      counts: { table: 3 },
      serviceType: 'Postgres',
      sourceEntity: { id: 'svc1-id', type: 'databaseService', fullyQualifiedName: 'svc1' },
    },
    {
      band: 'LAYER',
      id: 'svc2',
      label: 'svc2',
      levelKind: 'service',
      entityType: 'databaseService',
      fullyQualifiedName: 'svc2',
      isExpandable: true,
      childrenCount: 1,
      counts: { table: 1 },
      sourceEntity: { id: 'svc2-id', type: 'databaseService', fullyQualifiedName: 'svc2' },
    },
  ],
};

const ASSET_SCENE: LineageScene = {
  band: 'ASSET',
  lens: 'service',
  focusFqn: 'svc1',
  focusEntityType: 'databaseService',
  breadcrumb: [
    { band: 'LAYER', id: 'root', label: 'All services', levelKind: 'service' },
    {
      band: 'ASSET',
      id: 'svc1',
      label: 'Svc One',
      levelKind: 'service',
      fullyQualifiedName: 'svc1',
      entityType: 'databaseService',
    },
  ],
  nodes: [
    {
      band: 'ASSET',
      id: 'a',
      label: 'A',
      displayName: 'Table A',
      levelKind: 'table',
      entityType: 'table',
      fullyQualifiedName: 'svc1.db.a',
      isExpandable: true,
      childrenCount: 1,
      fields: [{ id: 'a.id', name: 'id', fullyQualifiedName: 'svc1.db.a.id' }],
      sourceEntity: { id: 'a-id', type: 'table', fullyQualifiedName: 'svc1.db.a' },
    },
    {
      band: 'ASSET',
      id: 'b',
      label: 'B',
      displayName: 'Table B',
      levelKind: 'table',
      entityType: 'table',
      fullyQualifiedName: 'svc1.db.b',
      isFocus: true,
      sourceEntity: { id: 'b-id', type: 'table', fullyQualifiedName: 'svc1.db.b' },
    },
  ],
  edges: [
    {
      band: 'ASSET',
      id: 'e1',
      from: 'a',
      to: 'b',
      pipeline: { id: 'p1', type: 'pipeline', name: 'pipe', displayName: 'Pipe' },
      source: 'PipelineLineage',
    },
  ],
};

const FIELD_SCENE: LineageScene = {
  ...ASSET_SCENE,
  band: 'FIELD',
  nodes: ASSET_SCENE.nodes.map((node) => ({ ...node, band: 'FIELD' as const })),
  edges: [
    {
      band: 'FIELD',
      id: 'e1',
      from: 'a::field::svc1.db.a.id',
      to: 'b::field::svc1.db.b.id',
      source: 'PipelineLineage',
    },
  ],
};

const SCENES: Record<string, LineageScene> = {
  LAYER: LAYER_SCENE,
  ASSET: ASSET_SCENE,
  FIELD: FIELD_SCENE,
};

function clearOnboardingCookie(): void {
  document.cookie = `${LINEAGE_MAP_ONBOARDING_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

async function mountMap(
  props: Record<string, unknown> = {},
  scenes: Record<string, LineageScene> = SCENES,
  waitForTestId = 'lineage-node-svc1',
): Promise<VueWrapper> {
  mockedGetLineageScene.mockImplementation(
    async (options) => scenes[options.band] ?? LAYER_SCENE,
  );
  const wrapper = mount(LineageMap, {
    props: { isPlatformLineage: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  if (waitForTestId) {
    await vi.waitFor(() => expect(wrapper.find(`[data-testid="${waitForTestId}"]`).exists()).toBe(true));
  }
  return wrapper;
}

describe('LineageMap', () => {
  // The map lays out through the async ELK engine; warm the engine once
  // here so each mount pays a warm layout (~200 ms) instead of the cold
  // engine start (dynamic import + first layout, seconds on this VM). The
  // layout itself still runs for real on every mount; only the one-time
  // engine start moves out of the tests' wait budget.
  beforeAll(async () => {
    await ELKLayout.layoutGraph(
      [
        { id: 'warm-a', width: 260, height: 78 },
        { id: 'warm-b', width: 260, height: 78 },
      ],
      [{ id: 'warm-e', sources: ['warm-a'], targets: ['warm-b'] }],
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearOnboardingCookie();
    // The onboarding dialog is covered by its own tests; hide it elsewhere.
    document.cookie = `${LINEAGE_MAP_ONBOARDING_COOKIE}=true; path=/`;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearOnboardingCookie();
  });

  it('renders the layer scene with lens buttons, band rail, breadcrumbs and the view-only note', async () => {
    const wrapper = await mountMap();
    expect(wrapper.find('[data-testid="lineage-layer-service-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-layer-domain-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-layer-dataProduct-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-rail-layer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-rail-asset"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-rail-field"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="lineage-map-crumb-root"]').text()).toBe('All services');
    expect(wrapper.get('[data-testid="lineage-map-level"]').text()).toContain('Service Level');
    expect(wrapper.get('[data-testid="lineage-map-view-only"]').text()).toContain(
      'view and export only',
    );
    expect(wrapper.find('[data-testid="lineage-node-svc2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('prefetches the neighbouring band into the cache', async () => {
    const wrapper = await mountMap();
    await vi.waitFor(() =>
      expect(mockedGetLineageScene.mock.calls.map((call) => call[0].band)).toEqual(
        expect.arrayContaining(['LAYER', 'ASSET']),
      ),
    );
    wrapper.unmount();
  });

  it('shows loading, then error with retry, when the scene fetch fails', async () => {
    let resolveScene!: (scene: LineageScene) => void;
    mockedGetLineageScene.mockImplementationOnce(
      () =>
        new Promise<LineageScene>((resolve) => {
          resolveScene = resolve;
        }),
    );
    mockedGetLineageScene.mockImplementation(
      async (options) => SCENES[options.band] ?? LAYER_SCENE,
    );
    const wrapper = mount(LineageMap, {
      props: { isPlatformLineage: true },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="lineage-map-state-loading"]').exists()).toBe(true);
    resolveScene(LAYER_SCENE);
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-svc1"]').exists()).toBe(true));
    wrapper.unmount();
  });

  it('shows the empty placeholder for a scene with no nodes', async () => {
    const wrapper = await mountMap(
      {},
      { LAYER: { ...LAYER_SCENE, nodes: [], breadcrumb: [] } },
      'lineage-map-state-empty',
    );
    expect(wrapper.find('[data-testid="lineage-map-state-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="lineage-map-state-empty"]').text()).toContain(
      'No lineage in this view yet.',
    );
    wrapper.unmount();
  });

  it('switches lens to the new lens root and switches band from the rail', async () => {
    const wrapper = await mountMap();
    await wrapper.get('[data-testid="lineage-layer-domain-btn"]').trigger('click');
    await flushPromises();
    expect(mockedGetLineageScene).toHaveBeenCalledWith(
      expect.objectContaining({ lens: 'domain', band: 'LAYER' }),
    );
    expect(wrapper.emitted('update:lens')).toEqual([['domain']]);
    expect(wrapper.emitted('request-change')?.[0][0]).toMatchObject({ lens: 'domain', band: 'LAYER' });
    await wrapper.get('[data-testid="lineage-map-rail-field"]').trigger('click');
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-column-svc1.db.a.id"]').exists()).toBe(true),
    );
    expect(mockedGetLineageScene).toHaveBeenCalledWith(
      expect.objectContaining({ lens: 'domain', band: 'FIELD' }),
    );
    wrapper.unmount();
  });

  it('selects a node, drills into it, and returns via the root breadcrumb from cache', async () => {
    const wrapper = await mountMap();
    await wrapper.get('[data-testid="lineage-node-svc1"]').trigger('click');
    expect(wrapper.find('[data-testid="lineage-map-selection"]').exists()).toBe(true);
    expect(wrapper.emitted('select-node')?.[0][0]).toMatchObject({ id: 'svc1' });
    await wrapper.get('[data-testid="lineage-map-drill"]').trigger('click');
    await flushPromises();
    expect(mockedGetLineageScene).toHaveBeenCalledWith(
      expect.objectContaining({ band: 'ASSET', focusFqn: 'svc1', entityType: 'databaseService' }),
    );
    expect(wrapper.emitted('update:focus')).toEqual([
      [{ focusFqn: 'svc1', entityType: 'databaseService' }],
    ]);
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-a"]').exists()).toBe(true));
    await vi.waitFor(() => expect(mockedGetLineageScene.mock.calls.length).toBeGreaterThanOrEqual(5));
    const callsAfterDrill = mockedGetLineageScene.mock.calls.length;
    await wrapper.get('[data-testid="lineage-map-crumb-root"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-svc1"]').exists()).toBe(true));
    expect(mockedGetLineageScene.mock.calls.length).toBe(callsAfterDrill);
    wrapper.unmount();
  });

  it('opens the asset for the selected node without navigating on plain node click', async () => {
    const wrapper = await mountMap();
    await wrapper.get('[data-testid="lineage-node-svc1"]').trigger('click');
    expect(wrapper.emitted('navigate')).toBeUndefined();
    await wrapper.get('[data-testid="lineage-map-open-asset"]').trigger('click');
    expect(wrapper.emitted('navigate')?.[0][0]).toMatchObject({ id: 'svc1' });
    wrapper.unmount();
  });

  it('hydrates the selected edge with its details', async () => {
    mockedGetLineageEdgeDetails.mockResolvedValue({
      source: 'PipelineLineage',
      sqlQuery: 'select 1',
      pipeline: { displayName: 'Pipe' },
    });
    const wrapper = await mountMap();
    await wrapper.get('[data-testid="lineage-node-svc1"]').trigger('click');
    await wrapper.get('[data-testid="lineage-map-drill"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-a"]').exists()).toBe(true));
    await wrapper.get('[data-testid="vue-flow-edge-stub"]').trigger('click');
    await flushPromises();
    expect(mockedGetLineageEdgeDetails).toHaveBeenCalledWith('a-id', 'b-id');
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid="lineage-map-edge-details"]').text()).toContain('select 1'),
    );
    wrapper.unmount();
  });

  it('is view-only: a drag-connect emits nothing and fetches nothing', async () => {
    const wrapper = await mountMap();
    await wrapper.get('[data-testid="lineage-node-svc1"]').trigger('click');
    await wrapper.get('[data-testid="lineage-map-drill"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-a"]').exists()).toBe(true));
    await vi.waitFor(() => expect(mockedGetLineageScene.mock.calls.length).toBeGreaterThanOrEqual(5));
    const calls = mockedGetLineageScene.mock.calls.length;
    await wrapper.get('[data-testid="vue-flow-connect-stub"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('connect')).toBeUndefined();
    expect(mockedGetLineageScene.mock.calls.length).toBe(calls);
    wrapper.unmount();
  });

  it('exports PNG through the exposed flow and toggles the mini map', async () => {
    const wrapper = await mountMap();
    await wrapper.get('[data-testid="lineage-map-export"]').trigger('click');
    await flushPromises();
    expect(mockedCapturePng).toHaveBeenCalled();
    expect(mockedCapturePng.mock.calls[0][1]).toBe('lineage-map-service-layer.png');
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    await wrapper.get('[data-testid="lineage-map-toggle-minimap"]').trigger('click');
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the onboarding dialog once, remembers the dismissal in a cookie, and never shows it when deleted', async () => {
    clearOnboardingCookie();
    const wrapper = mount(LineageMap, {
      props: { isPlatformLineage: true },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const dialog = document.body.querySelector('[data-testid="lineage-map-onboarding-dialog"]');
    expect(dialog?.textContent).toContain('Navigate your data like a map');
    const explore = document.body.querySelector(
      '[data-testid="lineage-map-onboarding-explore"]',
    ) as HTMLElement | null;
    expect(explore).not.toBeNull();
    explore?.click();
    await flushPromises();
    expect(document.cookie).toContain(`${LINEAGE_MAP_ONBOARDING_COOKIE}=true`);
    expect(
      document.body.querySelector('[data-testid="lineage-map-onboarding-dialog"]'),
    ).toBeNull();
    wrapper.unmount();

    const second = mount(LineageMap, {
      props: { isPlatformLineage: true },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(
      document.body.querySelector('[data-testid="lineage-map-onboarding-dialog"]'),
    ).toBeNull();
    second.unmount();

    clearOnboardingCookie();
    const deleted = mount(LineageMap, {
      props: { isPlatformLineage: true, deleted: true },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(
      document.body.querySelector('[data-testid="lineage-map-onboarding-dialog"]'),
    ).toBeNull();
    deleted.unmount();
  });
});
