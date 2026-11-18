import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import type { LearningResourceDetail } from '@/api/learningResources';
import LearningResourceCard from './LearningResourceCard.vue';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

function makeResource(overrides: Partial<LearningResourceDetail> = {}): LearningResourceDetail {
  return {
    id: 'r1',
    name: 'getting-started',
    displayName: 'Getting Started',
    description: 'Short description.',
    resourceType: 'Video',
    categories: ['Discovery', 'DataQuality', 'AI'],
    contexts: [],
    source: { url: 'https://example.com/video', provider: 'YouTube' },
    status: 'Active',
    updatedAt: Date.UTC(2026, 10, 18, 12, 0, 0),
    estimatedDuration: 300,
    ...overrides,
  };
}

function mountCard(resource: LearningResourceDetail) {
  return mount(LearningResourceCard, {
    props: { resource },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

describe('LearningResourceCard', () => {
  it('renders the type icon, title and meta line', () => {
    const wrapper = mountCard(makeResource());
    expect(wrapper.find('[data-testid="learning-resource-card-getting-started"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resource-type-icon-Video"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Nov 18, 2026');
    expect(wrapper.text()).toContain('|');
    wrapper.unmount();
  });

  it('shows at most two category badges plus a +N popover button', () => {
    const wrapper = mountCard(makeResource());
    expect(wrapper.text()).toContain('Discovery');
    expect(wrapper.text()).toContain('Data Quality');
    expect(wrapper.find('[data-testid="more-categories"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="more-categories"]').text()).toContain('+1');
    wrapper.unmount();
  });

  it('shows the no-category fallback when no categories exist', () => {
    const wrapper = mountCard(makeResource({ categories: [] }));
    expect(wrapper.find('[data-testid="more-categories"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('settings.learning.noCategoryAdded');
    wrapper.unmount();
  });

  it('shows a view-more button only for long descriptions', async () => {
    const long = mountCard(makeResource({ description: 'x'.repeat(101) }));
    expect(long.find('[data-testid="learning-resource-description"]').exists()).toBe(true);
    const viewMore = long.findAll('button').find((button) => button.text().includes('settings.learning.viewMore'));
    expect(viewMore?.exists()).toBe(true);
    await viewMore?.trigger('click');
    expect(long.emitted('click')).toHaveLength(1);
    long.unmount();

    const short = mountCard(makeResource({ description: 'short' }));
    expect(
      short.findAll('button').some((button) => button.text().includes('settings.learning.viewMore')),
    ).toBe(false);
    short.unmount();
  });

  it('emits click on card click and on Enter/Space', async () => {
    const resource = makeResource();
    const wrapper = mountCard(resource);
    const card = wrapper.find('[data-testid="learning-resource-card-getting-started"]');
    await card.trigger('click');
    await card.trigger('keydown', { key: 'Enter' });
    await card.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('click')).toHaveLength(3);
    expect(wrapper.emitted('click')?.[0]).toEqual([resource]);
    wrapper.unmount();
  });

  it('falls back to the name when displayName is missing', () => {
    const wrapper = mountCard(makeResource({ displayName: undefined }));
    expect(wrapper.text()).toContain('getting-started');
    wrapper.unmount();
  });
});
