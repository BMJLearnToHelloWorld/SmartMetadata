/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official GlossaryVersion: glossary and glossary-term version surfaces.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import GlossaryVersion from './GlossaryVersion.vue';

const listGovernanceVersions = vi.fn();
const getGovernanceVersion = vi.fn();

vi.mock('@/api/limits', () => ({
  getLimitByResource: vi.fn(async () => ({ featureLimitStatuses: [{ configuredLimit: { maxVersions: -1 } }] })),
}));

vi.mock('@/api/governanceVersions', () => ({
  listGovernanceVersions: (...args: unknown[]) => listGovernanceVersions(...args),
  getGovernanceVersion: (...args: unknown[]) => getGovernanceVersion(...args),
}));

vi.mock('@/components/customize/GenericTab.vue', () => ({
  default: {
    name: 'GenericTab',
    props: ['layout', 'pageType'],
    template: '<div data-testid="generic-tab">{{ pageType }}</div>',
  },
}));

vi.mock('@/components/lists/GlossaryTermsWidget.vue', () => ({
  default: { name: 'GlossaryTermsWidget', props: ['glossary', 'deleted'], template: '<div data-testid="widget-terms-table-stub" />' },
}));

vi.mock('@/composables/useCustomPages', () => ({
  useCustomPages: () => ({ customizedPage: { value: null } }),
}));

const versionsList = [
  { version: 1.0, updatedAt: 20, updatedBy: 'ada' },
  { version: 0.1, updatedAt: 10, updatedBy: 'ada' },
];

function createVersionRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/glossary/:id/versions/:version',
        name: 'glossary-version',
        component: GlossaryVersion,
        props: (route) => ({
          isGlossary: true,
          id: route.params.id as string,
          version: route.params.version as string,
        }),
      },
      {
        path: '/glossary-term/:id/versions/:version',
        name: 'glossary-term-version',
        component: GlossaryVersion,
        props: (route) => ({
          isGlossary: false,
          id: route.params.id as string,
          version: route.params.version as string,
        }),
      },
      {
        path: '/glossary-term/:id/versions/:version/:tab',
        name: 'glossary-term-version-tab',
        component: GlossaryVersion,
        props: (route) => ({
          isGlossary: false,
          id: route.params.id as string,
          version: route.params.version as string,
          tab: route.params.tab as string,
        }),
      },
      { path: '/governance/glossaries/:id', name: 'governance-glossary', component: { template: '<div>glossary live</div>' } },
      { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div>term live</div>' } },
    ],
  });
}

async function mountPage(path: string, props: { isGlossary?: boolean; id: string; version: string; tab?: string }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createVersionRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(GlossaryVersion, {
    props,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('official GlossaryVersion', () => {
  beforeEach(() => {
    listGovernanceVersions.mockReset().mockResolvedValue(versionsList);
    getGovernanceVersion.mockReset().mockResolvedValue({
      id: 'g1',
      name: 'Business_Glossary',
      displayName: 'Business Glossary',
      description: 'Business Glossary',
      version: 1.0,
    });
  });

  it('fetches official glossary versions and keeps only the Terms tab', async () => {
    const { wrapper } = await mountPage('/glossary/g1/versions/1.0', {
      isGlossary: true,
      id: 'g1',
      version: '1.0',
    });
    expect(listGovernanceVersions).toHaveBeenCalledWith('glossary', 'g1');
    expect(getGovernanceVersion).toHaveBeenCalledWith('glossary', 'g1', '1.0');
    expect(wrapper.text()).toContain('Business Glossary Version');
    expect(wrapper.find('[data-testid="glossary-tab-terms"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-tab-overview"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="generic-tab"]').text()).toBe('Glossary');
    expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="versions-list-container"]').attributes('aria-label')).toBe(
      'Versions History',
    );
    expect(wrapper.find('[data-testid="version-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="exit-version-history"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-new-tag-button-header"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="glossary-term-add-button-menu"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="domain-mismatch-alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="widget-custom-properties"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('fetches official term versions and keeps only the Overview tab', async () => {
    getGovernanceVersion.mockResolvedValue({
      id: 't1',
      name: 'Customer',
      displayName: 'Customer',
      version: 0.3,
      changeDescription: {
        fieldsUpdated: [{ name: 'displayName', oldValue: 'Client', newValue: 'Customer' }],
      },
    });
    const { wrapper } = await mountPage('/glossary-term/t1/versions/0.3/overview', {
      isGlossary: false,
      id: 't1',
      version: '0.3',
      tab: 'overview',
    });
    expect(listGovernanceVersions).toHaveBeenCalledWith('term', 't1');
    expect(getGovernanceVersion).toHaveBeenCalledWith('term', 't1', '0.3');
    expect(wrapper.find('[data-testid="glossary-tab-overview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-tab-terms"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="generic-tab"]').text()).toBe('GlossaryTerm');
    wrapper.unmount();
  });

  it('navigates version changes on the official glossary path and back to the product live page', async () => {
    const { wrapper, router } = await mountPage('/glossary/g1/versions/1.0', {
      isGlossary: true,
      id: 'g1',
      version: '1.0',
    });
    await wrapper.get('[data-testid="version-selector-v0.1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/glossary/g1/versions/0.1');
    await wrapper.get('[data-testid="version-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/governance/glossaries/g1');
    wrapper.unmount();
  });

  it('returns a term version to the already-mounted product term page', async () => {
    getGovernanceVersion.mockResolvedValue({ id: 't1', name: 'Customer', version: 0.3 });
    const { wrapper, router } = await mountPage('/glossary-term/t1/versions/0.3', {
      isGlossary: false,
      id: 't1',
      version: '0.3',
    });
    await wrapper.get('[data-testid="version-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/governance/terms/t1');
    wrapper.unmount();
  });
});
