import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { message } from 'ant-design-vue';
import {
  deleteLearningResource,
  getLearningResourceById,
  listLearningResources,
  type LearningResourceDetail,
} from '@/api/learningResources';
import { usePersonaStore } from '@/stores/persona';
import type { PersonaDocument } from '@/types/persona';
import LearningResourcesView from './LearningResourcesView.vue';

vi.mock('@/api/learningResources', () => ({
  createLearningResource: vi.fn(),
  updateLearningResource: vi.fn(),
  getLearningResourceById: vi.fn(),
  deleteLearningResource: vi.fn(),
  listLearningResources: vi.fn(),
}));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });
const mockedList = vi.mocked(listLearningResources);
const mockedDelete = vi.mocked(deleteLearningResource);
const mockedGetById = vi.mocked(getLearningResourceById);

function makeResource(overrides: Partial<LearningResourceDetail> = {}): LearningResourceDetail {
  return {
    id: 'r1',
    name: 'getting-started',
    displayName: 'Getting Started',
    description: 'A video resource.',
    resourceType: 'Video',
    categories: ['Discovery', 'DataQuality', 'AI'],
    contexts: [{ pageId: 'domain' }, { pageId: 'table' }, { pageId: 'glossary' }],
    source: { url: 'https://example.com/video', provider: 'YouTube' },
    status: 'Active',
    updatedAt: Date.UTC(2026, 10, 18, 12, 0, 0),
    estimatedDuration: 300,
    ...overrides,
  };
}

const videoResource = makeResource();
const linkResource = makeResource({
  id: 'r2',
  name: 'release-notes',
  displayName: 'Release Notes',
  resourceType: 'Link',
  categories: ['Administration'],
  contexts: [],
  source: { url: 'https://example.com/notes' },
});

function bodyQuery<T extends Element = HTMLElement>(selector: string): T {
  const element = document.body.querySelector(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

async function pickOption(testId: string, optionText: string): Promise<void> {
  const root = bodyQuery(`[data-testid="${testId}"]`);
  const selector = root.querySelector('.ant-select-selector') as HTMLElement;
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const options = [...document.querySelectorAll('.ant-select-item-option')];
  const option = options.find((item) => item.textContent?.includes(optionText));
  if (!option) {
    throw new Error(`Missing option: ${optionText}`);
  }
  option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
  await flushPromises();
}

describe('LearningResourcesView', () => {
  beforeEach(() => {
    mockedList.mockResolvedValue({
      data: [videoResource, linkResource],
      total: 2,
      after: undefined,
      before: undefined,
    });
    mockedGetById.mockImplementation(async (id) =>
      id === 'r2' ? linkResource : videoResource,
    );
    mockedDelete.mockResolvedValue(undefined);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function mountView(personaViewMode?: 'table' | 'card') {
    const pinia = createPinia();
    setActivePinia(pinia);
    if (personaViewMode) {
      const store = usePersonaStore();
      store.selectedPersonaId = 'p1';
      store.document = {
        name: 'persona.doc',
        fullyQualifiedName: 'persona.Analyst',
        entityType: 'document',
        data: {
          personaPreferences: [
            { personaId: 'p1', defaultViewModes: { learningResources: personaViewMode } },
          ],
        },
      } as unknown as PersonaDocument;
    }
    // The view renders a real SmBreadcrumb (RouterLink), so the mount needs
    // a real router — same pattern as TimeFormatSettingsView.test.ts: the
    // view route, the breadcrumb targets it links to by name
    // (admin-settings, settings-category), plus a catch-all keeping sibling
    // links resolvable.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/settings/preferences/learning-resources',
          name: 'settings-preferences-learning',
          component: LearningResourcesView,
        },
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        {
          path: '/settings/:category',
          name: 'settings-category',
          component: { template: '<div />' },
        },
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    });
    await router.push({ name: 'settings-preferences-learning' });
    await router.isReady();
    const wrapper = mount(LearningResourcesView, {
      global: {
        plugins: [router, i18n, pinia],
        stubs: {
          PreferencePageShell: {
            template: '<div data-testid="learning-resources-shell"><slot /></div>',
            props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
          },
        },
      },
      attachTo: document.body,
    });
    await nextTick();
    await flushPromises();
    return wrapper;
  }

  it('renders rows with badges, contexts, dates and actions', async () => {
    const wrapper = await mountView();
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 15,
        fields: 'categories,contexts,difficulty,estimatedDuration,owners',
      }),
    );
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Release Notes');
    expect(wrapper.text()).toContain('Discovery');
    expect(wrapper.text()).toContain('Data Quality');
    expect(wrapper.text()).toContain('+1');
    expect(wrapper.text()).toContain('Domain');
    expect(wrapper.text()).toContain('Table');
    expect(wrapper.text()).toContain('Nov 18, 2026');
    expect(wrapper.find('[data-testid="edit-getting-started"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-getting-started"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="getting-started"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the no-records text when the list is empty', async () => {
    mockedList.mockResolvedValue({ data: [], total: 0, after: undefined, before: undefined });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('settings.learning.noRecordsFound');
    wrapper.unmount();
  });

  it('has no Refresh button (deletion 11.13)', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="refresh-button"]').exists()).toBe(false);
    expect(wrapper.findAll('button').some((button) => /refresh/i.test(button.text()))).toBe(false);
    wrapper.unmount();
  });

  it('opens the player on row click for non-Link resources', async () => {
    const wrapper = await mountView();
    const row = wrapper.find('[data-testid="getting-started"]');
    await row.trigger('click');
    await nextTick();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="resource-player-dialog"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('opens Link resources in a new tab instead of the player', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = await mountView();
    const row = wrapper.find('[data-testid="release-notes"]');
    await row.trigger('click');
    await nextTick();
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/notes',
      '_blank',
      'noopener,noreferrer',
    );
    expect(document.body.querySelector('[data-testid="resource-player-dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it('debounces search and passes it to the list request', async () => {
    const wrapper = await mountView();
    mockedList.mockClear();
    const input = bodyQuery<HTMLInputElement>('[data-testid="learning-search"]');
    input.value = 'getting';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(mockedList).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ search: 'getting' }));
    wrapper.unmount();
  });

  it('passes selected filters to the list request and shows a chip', async () => {
    const wrapper = await mountView();
    mockedList.mockClear();
    await pickOption('filter-category', 'Discovery');
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ category: ['Discovery'] }),
    );
    expect(wrapper.find('[data-testid="filter-chip-category"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('switches to the card view', async () => {
    const wrapper = await mountView();
    const segments = wrapper.findAll('.ant-segmented-item');
    expect(segments).toHaveLength(2);
    await segments[1]?.trigger('click');
    await nextTick();
    expect(
      wrapper.find('[data-testid="learning-resource-card-getting-started"]').exists(),
    ).toBe(true);
    wrapper.unmount();
  });

  it('opens in the persona stored card view, and the toggle still overrides it (L8)', async () => {
    const wrapper = await mountView('card');
    expect(
      wrapper.find('[data-testid="learning-resource-card-getting-started"]').exists(),
    ).toBe(true);
    const segments = wrapper.findAll('.ant-segmented-item');
    await segments[0]?.trigger('click');
    await nextTick();
    expect(
      wrapper.find('[data-testid="learning-resource-card-getting-started"]').exists(),
    ).toBe(false);
    wrapper.unmount();
  });

  it('opens the form drawer from the create button', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="create-resource"]').trigger('click');
    await nextTick();
    expect(document.body.querySelector('[data-testid="name-input"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('deletes permanently with hardDelete and refetches', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="delete-getting-started"]').trigger('click');
    await nextTick();
    const modal = document.body.querySelector('.ant-modal');
    expect(modal?.textContent).toContain('settings.learning.delete Getting Started');
    expect(modal?.textContent).toContain('settings.learning.deletePermanently');
    mockedList.mockClear();
    const okButton = modal?.querySelector('.ant-btn-dangerous') as HTMLElement;
    okButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await flushPromises();
    expect(mockedDelete).toHaveBeenCalledWith('r1', true);
    expect(message.success).toHaveBeenCalled();
    expect(mockedList).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('toasts and keeps the old list when the fetch fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'));
    const wrapper = await mountView();
    expect(message.error).toHaveBeenCalledWith('boom');
    wrapper.unmount();
  });
});
