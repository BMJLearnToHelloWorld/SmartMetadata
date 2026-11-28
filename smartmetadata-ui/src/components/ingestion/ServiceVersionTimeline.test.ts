/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Tooltip } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import type { EntityVersion } from '@/api/entities';
import ServiceVersionTimeline from './ServiceVersionTimeline.vue';

const getLimitByResource = vi.fn();

vi.mock('@/api/limits', () => ({
  getLimitByResource: (...args: unknown[]) => getLimitByResource(...args),
}));

const MESSAGES = {
  'en-US': {
    label: {
      'version-plural-history': 'Versions History',
    },
    settings: {
      services: {
        version: {
          historyTitle: 'Versions History',
          major: 'Major',
          moreVersions: '+{count} more versions',
          unlockAllHistory: 'Unlock all of your version history',
          upgradeToPaidPlan: 'Upgrade to paid plan for access to all of your version history.',
        },
        summary: {
          added: 'Added',
          addedLowercase: 'added',
          edited: 'Edited',
          updatedLowercase: 'updated',
          removed: 'Removed',
          deletedLowercase: 'deleted',
          restoredLowercase: 'restored',
          dataAssetHasBeenActionType: 'Data Asset has been {actionType}',
          columnPlural: 'columns',
          tagPlural: 'tags',
        },
      },
    },
  },
};

function entry(
  version: string,
  previousVersion: string | undefined,
  updatedBy = 'admin',
): EntityVersion {
  return {
    version,
    updatedAt: 1700000000000,
    updatedBy,
    changeDescription: {
      fieldsUpdated: [{ field: 'description', oldValue: 'old', newValue: 'new' }],
      previousVersion,
    },
  };
}

const VERSIONS = [entry('1.1', '0.1'), entry('0.2', '0.1'), entry('0.1', undefined)];

async function mountTimeline(props: Record<string, unknown>): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  return mount(ServiceVersionTimeline, {
    props: { versions: VERSIONS, currentVersion: '0.2', ...props },
    attachTo: document.body,
    global: {
      plugins: [Antd, pinia, router, createI18n({ legacy: false, locale: 'en-US', messages: MESSAGES })],
    },
  });
}

describe('ServiceVersionTimeline', () => {

  beforeEach(() => {
    getLimitByResource.mockReset().mockResolvedValue({
      featureLimitStatuses: [{ configuredLimit: { maxVersions: -1 } }],
    });
  });

  it('renders the aside, title, entries, summaries, and user links', async () => {
    const wrapper = await mountTimeline({});
    const aside = wrapper.find('[data-testid="versions-list-container"]');
    expect(aside.attributes('role')).toBe('dialog');
    expect(wrapper.text()).toContain('Versions History');
    expect(wrapper.find('[data-testid="version-entry-v1.1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-entry-v0.2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-entry-v0.1"]').exists()).toBe(true);
    const descriptions = wrapper.findAll('[data-testid="version-change-description"]');
    expect(descriptions.length).toBe(3);
    expect(descriptions[0].text()).toContain('description');
    expect(wrapper.text()).toContain('admin');
  });

  it('marks major versions with the Major badge', async () => {
    const wrapper = await mountTimeline({});
    expect(wrapper.find('[data-testid="version-entry-v1.1"]').text()).toContain('Major');
    expect(wrapper.find('[data-testid="version-entry-v0.2"]').text()).not.toContain('Major');
  });

  it('emits select on click and Enter, and close on the close button', async () => {
    const wrapper = await mountTimeline({});
    await wrapper.find('[data-testid="version-entry-v1.1"]').trigger('click');
    await wrapper.find('[data-testid="version-entry-v0.1"]').trigger('keydown.enter');
    expect(wrapper.emitted('select')).toEqual([['1.1'], ['0.1']]);
    await wrapper.find('[data-testid="versions-list-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('renders everything with no upgrade prompt when maxVersions is -1 or 0', async () => {
    for (const maxVersions of [-1, 0, undefined]) {
      const wrapper = await mountTimeline({ maxVersions });
      expect(wrapper.findAll('[data-testid^="version-entry-"]').length).toBe(3);
      expect(wrapper.text()).not.toContain('Unlock all of your version history');
    }
  });

  it('truncates only on actual overflow and shows a CTA-free upgrade prompt', async () => {
    const wrapper = await mountTimeline({ maxVersions: 2 });
    expect(wrapper.findAll('[data-testid^="version-entry-"]').length).toBe(3);
    expect(wrapper.text()).toContain('Unlock all of your version history');
    expect(wrapper.text()).toContain('Upgrade to paid plan');
    const tooltip = wrapper.findComponent(Tooltip);
    expect(tooltip.props('title')).toBe('+1 more versions');
    // No clickable CTA, no empty button, no dead link in the prompt.
    const upgrade = wrapper.find('.service-version-timeline__upgrade');
    expect(upgrade.find('button').exists()).toBe(false);
    expect(upgrade.find('a').exists()).toBe(false);
  });

  it('shows no prompt when the limit exceeds the list', async () => {
    const wrapper = await mountTimeline({ maxVersions: 5 });
    expect(wrapper.text()).not.toContain('Unlock all of your version history');
  });

  it('uses official label.version-plural-history and fetches maxVersions for entityType', async () => {
    getLimitByResource.mockResolvedValue({
      featureLimitStatuses: [{ configuredLimit: { maxVersions: 1 } }],
    });
    const wrapper = await mountTimeline({ entityType: 'glossary' });
    await flushPromises();
    expect(getLimitByResource).toHaveBeenCalledWith('glossary');
    expect(wrapper.text()).toContain('Versions History');
    expect(wrapper.find('[data-testid="versions-list-container"]').attributes('aria-label')).toBe(
      'Versions History',
    );
    // Official maxAllowed > 0 truncates the visible list to one entry;
    // hidden remainder stays in the +N more versions tooltip.
    expect(wrapper.findAll('.service-version-timeline__body > [data-testid^="version-entry-"]').length).toBe(1);
    expect(wrapper.find('.service-version-timeline__hidden').exists()).toBe(true);
    wrapper.unmount();
  });
});
