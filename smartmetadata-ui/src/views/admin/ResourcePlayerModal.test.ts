import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { message } from 'ant-design-vue';
import {
  getLearningResourceById,
  type LearningResourceDetail,
} from '@/api/learningResources';
import ResourcePlayerModal from './ResourcePlayerModal.vue';

vi.mock('@/api/learningResources', () => ({
  getLearningResourceById: vi.fn(),
}));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });
const mockedGetById = vi.mocked(getLearningResourceById);

function makeResource(overrides: Partial<LearningResourceDetail> = {}): LearningResourceDetail {
  return {
    id: 'r1',
    name: 'getting-started',
    displayName: 'Getting Started',
    description: 'A video resource.',
    resourceType: 'Video',
    categories: ['Discovery'],
    contexts: [{ pageId: 'all' }],
    source: { url: 'https://www.youtube.com/watch?v=abc123', provider: 'YouTube' },
    status: 'Active',
    updatedAt: Date.UTC(2026, 10, 18, 12, 0, 0),
    estimatedDuration: 300,
    ...overrides,
  };
}

describe('ResourcePlayerModal', () => {
  beforeEach(() => {
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  async function mountPlayer(resource: LearningResourceDetail) {
    mockedGetById.mockResolvedValue(resource);
    const wrapper = mount(ResourcePlayerModal, {
      props: { open: true, resource },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await nextTick();
    await flushPromises();
    return wrapper;
  }

  it('renders a sandboxed YouTube embed for Video resources', async () => {
    const wrapper = await mountPlayer(makeResource());
    const iframe = document.body.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe(
      `https://www.youtube.com/embed/abc123?enablejsapi=1&origin=${window.location.origin}`,
    );
    expect(iframe?.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-presentation allow-popups',
    );
    expect(document.body.textContent).toContain('Getting Started');
    expect(document.body.querySelector('[data-testid="resource-date-duration"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('shows the invalid-url message for a Video with an unsafe url', async () => {
    const wrapper = await mountPlayer(
      makeResource({ source: { url: 'javascript:alert(1)' } }),
    );
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(document.body.textContent).toContain('settings.learning.invalidUrl');
    wrapper.unmount();
  });

  it('renders a sandboxed Storylane iframe with form access', async () => {
    const wrapper = await mountPlayer(
      makeResource({
        resourceType: 'Storylane',
        source: { url: 'https://storylane.io/tour/abc' },
      }),
    );
    const iframe = document.body.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://storylane.io/tour/abc');
    expect(iframe?.getAttribute('sandbox')).toContain('allow-forms');
    wrapper.unmount();
  });

  it('renders sanitized embedded article content without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const wrapper = await mountPlayer(
      makeResource({
        resourceType: 'Article',
        source: {
          url: 'https://example.com/article',
          embedConfig: { content: '<p>Hello</p><script>alert(1)</script>' },
        },
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Hello');
    expect(document.body.querySelector('script')).toBeNull();
    wrapper.unmount();
  });

  it('fetches and sanitizes article content from an http url', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<p>Fetched</p>',
    });
    vi.stubGlobal('fetch', fetchSpy);
    const wrapper = await mountPlayer(
      makeResource({
        resourceType: 'Article',
        source: { url: 'https://example.com/article' },
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/article');
    expect(document.body.textContent).toContain('Fetched');
    wrapper.unmount();
  });

  it('renders an unsandboxed PDF iframe with a new-tab link', async () => {
    const wrapper = await mountPlayer(
      makeResource({
        resourceType: 'PDF',
        source: { url: 'https://example.com/doc.pdf' },
      }),
    );
    const iframe = document.body.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://example.com/doc.pdf');
    expect(iframe?.getAttribute('sandbox')).toBeNull();
    const link = document.body.querySelector('a[target="_blank"]');
    expect(link?.getAttribute('href')).toBe('https://example.com/doc.pdf');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    wrapper.unmount();
  });

  it('reports unsupported resource types', async () => {
    const wrapper = await mountPlayer(makeResource({ resourceType: 'Other' }));
    expect(document.body.textContent).toContain('settings.learning.unsupportedResourceType');
    wrapper.unmount();
  });

  it('falls back to the list row silently when the refetch fails', async () => {
    mockedGetById.mockRejectedValue(new Error('boom'));
    const wrapper = mount(ResourcePlayerModal, {
      props: { open: true, resource: makeResource() },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await nextTick();
    await flushPromises();
    expect(document.body.textContent).toContain('Getting Started');
    expect(message.error).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the fetched resource once the refetch resolves', async () => {
    mockedGetById.mockResolvedValue(makeResource({ displayName: 'Refetched Title' }));
    const wrapper = mount(ResourcePlayerModal, {
      props: { open: true, resource: makeResource() },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await nextTick();
    await flushPromises();
    expect(document.body.textContent).toContain('Refetched Title');
    wrapper.unmount();
  });

  it('toggles the fullscreen button when the fullscreen request fails', async () => {
    const wrapper = await mountPlayer(makeResource());
    const maximize = document.body.querySelector('[data-testid="maximize-button"]');
    expect(maximize).not.toBeNull();
    maximize?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="minimize-button"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('emits close from the close button', async () => {
    const wrapper = await mountPlayer(makeResource());
    document.body
      .querySelector('[data-testid="close-resource-player"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
