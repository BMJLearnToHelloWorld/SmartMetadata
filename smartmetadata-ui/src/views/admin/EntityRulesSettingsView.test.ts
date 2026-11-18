import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { message } from 'ant-design-vue';
import { getTypedSetting, updateSetting } from '@/api/system';
import type { SystemSetting } from '@/types/admin';
import SmTable from '@/components/shared/SmTable.vue';
import type { SemanticsRule } from '@/types/admin';
import EntityRulesSettingsView from './EntityRulesSettingsView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return { ...actual, getTypedSetting: vi.fn(), updateSetting: vi.fn() };
});

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });
const mockedGetTypedSetting = vi.mocked(getTypedSetting);
const mockedUpdateSetting = vi.mocked(updateSetting);

const storedRule: SemanticsRule = {
  name: 'alpha',
  description: 'A **bold** rule.',
  rule: '{"and":[{"==":[{"var":"tags.tagFQN"},"Tier.Tier1"]}]}',
  enabled: true,
  entityType: 'table',
  jsonTree: '{"id":"root"}',
  provider: 'system',
};

function bodyQuery<T extends Element = HTMLElement>(selector: string): T {
  const element = document.body.querySelector(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

async function setBodyInput(testId: string, value: string): Promise<void> {
  const input = bodyQuery<HTMLInputElement | HTMLTextAreaElement>(
    `[data-testid="${testId}"]`,
  );
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

describe('EntityRulesSettingsView', () => {
  beforeEach(() => {
    mockedGetTypedSetting.mockResolvedValue({ entitySemantics: [storedRule] });
    mockedUpdateSetting.mockResolvedValue(undefined as never);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function mountView() {
    const wrapper = mount(EntityRulesSettingsView, {
      global: {
        plugins: [i18n],
        stubs: {
          PreferencePageShell: {
            template: '<div data-testid="entity-rules-shell"><slot /></div>',
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

  it('renders exactly the three official columns with a rich-text description', async () => {
    const wrapper = await mountView();
    const headers = wrapper.findAll('th').map((th) => th.text());
    expect(headers).toEqual([
      'settings.entityRules.name',
      'settings.entityRules.description',
      'settings.entityRules.enabled',
    ]);
    expect(wrapper.text()).not.toContain('settings.entityRules.entityType');
    expect(wrapper.find('[data-testid="sm-markdown"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sm-markdown"] strong').text()).toBe('bold');
    expect(wrapper.find('.ant-switch').exists()).toBe(true);
    wrapper.unmount();
  });

  it('has no batch Save button (deletion 10.4a)', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="entity-rules-save"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the whole table immediately on toggle, preserving unedited fields', async () => {
    const wrapper = await mountView();
    mockedUpdateSetting.mockClear();
    mockedGetTypedSetting.mockClear();
    await wrapper.find('.ant-switch').trigger('click');
    await nextTick();
    await flushPromises();
    expect(mockedUpdateSetting).toHaveBeenCalledTimes(1);
    expect(mockedUpdateSetting).toHaveBeenCalledWith('entityRulesSettings', {
      entitySemantics: [{ ...storedRule, enabled: false }],
    });
    expect(mockedGetTypedSetting).toHaveBeenCalledTimes(1);
    expect(message.success).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the switch on the stored value when the toggle save fails', async () => {
    mockedUpdateSetting.mockRejectedValueOnce(new Error('boom'));
    const wrapper = await mountView();
    await wrapper.find('.ant-switch').trigger('click');
    await nextTick();
    await flushPromises();
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(wrapper.find('.ant-switch').classes()).toContain('ant-switch-checked');
    wrapper.unmount();
  });

  it('shows the table loading state while a toggle save is in flight', async () => {
    let resolveSave: (value: SystemSetting | PromiseLike<SystemSetting>) => void = () =>
      undefined;
    mockedUpdateSetting.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );
    const wrapper = await mountView();
    await wrapper.find('.ant-switch').trigger('click');
    await nextTick();
    expect(wrapper.findComponent(SmTable).props('loading')).toBe(true);
    resolveSave({ configType: 'entityRules', configValue: { entitySemantics: [] } });
    await flushPromises();
    expect(wrapper.findComponent(SmTable).props('loading')).toBe(false);
    wrapper.unmount();
  });

  it('shows the quick-add instead of the table when the list is empty', async () => {
    mockedGetTypedSetting.mockResolvedValue({ entitySemantics: [] });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="add-widget-button"]').exists()).toBe(true);
    expect(wrapper.findComponent(SmTable).exists()).toBe(false);
    wrapper.unmount();
  });

  it('creates a rule from the quick-add modal and closes on success', async () => {
    mockedGetTypedSetting.mockResolvedValue({ entitySemantics: [] });
    const wrapper = await mountView();
    await wrapper.find('[data-testid="add-widget-button"]').trigger('click');
    await nextTick();
    await setBodyInput('rule-name-input', 'beta');
    await setBodyInput('rule-description-input', 'Second rule.');
    await setBodyInput('rule-input', '{"==":[{"var":"tags.tagFQN"},"Tier.Tier1"]}');
    const okButton = bodyQuery('.ant-modal-footer .ant-btn-primary');
    okButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await flushPromises();
    expect(mockedUpdateSetting).toHaveBeenCalledWith('entityRulesSettings', {
      entitySemantics: [
        {
          name: 'beta',
          description: 'Second rule.',
          enabled: true,
          rule: '{"==":[{"var":"tags.tagFQN"},"Tier.Tier1"]}',
        },
      ],
    });
    // Antd keeps hidden modal DOM after close; the open prop is the
    // authoritative closed signal.
    const modals = wrapper.findAllComponents({ name: 'AModal' });
    expect(modals[0]?.props('open')).toBe(false);
    wrapper.unmount();
  });

  it('blocks saving when a required field is empty and keeps the modal open', async () => {
    mockedGetTypedSetting.mockResolvedValue({ entitySemantics: [] });
    const wrapper = await mountView();
    await wrapper.find('[data-testid="add-widget-button"]').trigger('click');
    await nextTick();
    const okButton = bodyQuery('.ant-modal-footer .ant-btn-primary');
    okButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(document.body.querySelectorAll('.ant-form-item-explain-error')).toHaveLength(3);
    expect(mockedUpdateSetting).not.toHaveBeenCalled();
    expect(document.body.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });

  it('keeps the modal open when the save fails', async () => {
    mockedGetTypedSetting.mockResolvedValue({ entitySemantics: [] });
    mockedUpdateSetting.mockRejectedValueOnce(new Error('boom'));
    const wrapper = await mountView();
    await wrapper.find('[data-testid="add-widget-button"]').trigger('click');
    await nextTick();
    await setBodyInput('rule-name-input', 'beta');
    await setBodyInput('rule-description-input', 'Second rule.');
    await setBodyInput('rule-input', '{}');
    const okButton = bodyQuery('.ant-modal-footer .ant-btn-primary');
    okButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await flushPromises();
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(document.body.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });

  it('exposes no delete trigger entries (the delete modal is unreachable)', async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll('button').some((button) => /delete/i.test(button.text()))).toBe(false);
    expect(wrapper.find('[data-testid*="delete"]').exists()).toBe(false);
    expect(document.body.querySelector('.ant-modal')).toBeNull();
    wrapper.unmount();
  });

  it('toasts on load failure and shows the quick-add', async () => {
    mockedGetTypedSetting.mockRejectedValueOnce(new Error('boom'));
    const wrapper = await mountView();
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(wrapper.find('[data-testid="add-widget-button"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
