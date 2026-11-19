import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { message } from 'ant-design-vue';
import {
  createLearningResource,
  updateLearningResource,
  type LearningResourceDetail,
} from '@/api/learningResources';
import LearningResourceFormDrawer from './LearningResourceFormDrawer.vue';

vi.mock('@/api/learningResources', () => ({
  createLearningResource: vi.fn(),
  updateLearningResource: vi.fn(),
}));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

const mockedCreate = vi.mocked(createLearningResource);
const mockedUpdate = vi.mocked(updateLearningResource);

function makeResource(overrides: Partial<LearningResourceDetail> = {}): LearningResourceDetail {
  return {
    id: 'r1',
    name: 'getting-started',
    displayName: 'Getting Started',
    description: 'Existing description.',
    resourceType: 'Video',
    categories: ['Discovery'],
    contexts: [{ pageId: 'all', componentId: 'comp-1' }],
    difficulty: 'Beginner',
    source: { url: 'https://example.com/video', provider: 'YouTube' },
    status: 'Active',
    updatedAt: Date.UTC(2026, 10, 18, 12, 0, 0),
    estimatedDuration: 300,
    ...overrides,
  };
}

function bodyQuery<T extends Element = HTMLElement>(selector: string): T {
  const element = document.body.querySelector(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

async function setInput(testId: string, value: string): Promise<void> {
  const input = bodyQuery<HTMLInputElement>(`[data-testid="${testId}"]`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
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
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function clickButton(testId: string): Promise<void> {
  bodyQuery(`[data-testid="${testId}"]`).dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
  await nextTick();
  await flushPromises();
}

describe('LearningResourceFormDrawer', () => {
  beforeEach(() => {
    mockedCreate.mockResolvedValue(makeResource());
    mockedUpdate.mockResolvedValue(makeResource());
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function mountDrawer(resource: LearningResourceDetail | null) {
    return mount(LearningResourceFormDrawer, {
      props: { open: true, resource },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
  }

  it('requires the first six fields before saving', async () => {
    const wrapper = mountDrawer(null);
    await nextTick();
    await clickButton('save-resource');
    expect(document.body.querySelectorAll('.ant-form-item-explain-error')).toHaveLength(6);
    expect(mockedCreate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rejects a non-http(s) source url', async () => {
    const wrapper = mountDrawer(null);
    await nextTick();
    await setInput('name-input', 'new-resource');
    await setInput('description-input', 'A description.');
    await pickOption('resource-type-select', 'settings.learning.typeVideo');
    await pickOption('categories-select', 'Discovery');
    await pickOption('contexts-select', 'Domain');
    await setInput('source-url-input', 'notaurl');
    await clickButton('save-resource');
    expect(document.body.textContent).toContain('settings.learning.invalidUrl');
    expect(mockedCreate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('creates with the official payload shape', async () => {
    const wrapper = mountDrawer(null);
    await nextTick();
    await setInput('name-input', 'new-resource');
    await setInput('description-input', 'A description.');
    await pickOption('resource-type-select', 'settings.learning.typeVideo');
    await pickOption('categories-select', 'Discovery');
    await pickOption('contexts-select', 'Domain');
    await setInput('source-url-input', 'https://example.com/video');
    await setInput('source-provider-input', 'YouTube');
    await pickOption('duration-select', '5 mins');
    await clickButton('save-resource');
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith({
      name: 'new-resource',
      description: 'A description.',
      resourceType: 'Video',
      categories: ['Discovery'],
      contexts: [{ pageId: 'domain', componentId: undefined }],
      difficulty: undefined,
      estimatedDuration: 300,
      source: { url: 'https://example.com/video', provider: 'YouTube' },
      status: 'Active',
    });
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('edits with the name locked and carries difficulty and componentIds', async () => {
    const wrapper = mountDrawer(makeResource());
    await nextTick();
    const nameInput = bodyQuery<HTMLInputElement>('[data-testid="name-input"]');
    expect(nameInput.disabled).toBe(true);
    expect(nameInput.value).toBe('getting-started');
    await setInput('description-input', 'Updated description.');
    await clickButton('save-resource');
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate).toHaveBeenCalledWith({
      name: 'getting-started',
      description: 'Updated description.',
      resourceType: 'Video',
      categories: ['Discovery'],
      contexts: [{ pageId: 'all', componentId: 'comp-1' }],
      difficulty: 'Beginner',
      estimatedDuration: 300,
      source: { url: 'https://example.com/video', provider: 'YouTube' },
      status: 'Active',
    });
    expect(mockedCreate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the drawer open and toasts on save failure', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('boom'));
    const wrapper = mountDrawer(null);
    await nextTick();
    await setInput('name-input', 'new-resource');
    await setInput('description-input', 'A description.');
    await pickOption('resource-type-select', 'settings.learning.typeVideo');
    await pickOption('categories-select', 'Discovery');
    await pickOption('contexts-select', 'Domain');
    await setInput('source-url-input', 'https://example.com/video');
    await clickButton('save-resource');
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits close on cancel without saving', async () => {
    const wrapper = mountDrawer(null);
    await nextTick();
    await clickButton('cancel-resource');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(mockedCreate).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
