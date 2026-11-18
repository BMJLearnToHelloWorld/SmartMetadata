/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { Announcement } from '@/types/collaboration';
import type { SystemAnnouncementFormMode } from '@/utils/notifications/announcementUtils';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import AnnouncementColorSelect from './AnnouncementColorSelect.vue';
import AnnouncementDateField from './AnnouncementDateField.vue';
import AnnouncementTypeSelect from './AnnouncementTypeSelect.vue';
import SystemAnnouncementForm from './SystemAnnouncementForm.vue';

const saveSystemAnnouncement = vi.fn();

vi.mock('@/views/collaboration/useSystemAnnouncements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/collaboration/useSystemAnnouncements')>();
  return { ...actual, saveSystemAnnouncement: (...args: unknown[]) => saveSystemAnnouncement(...args) };
});

const START = new Date(2026, 10, 10).getTime();
const END = new Date(2026, 10, 12, 23, 59, 59, 999).getTime();

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    name: 'announcement-1',
    displayName: 'Downtime window',
    description: 'The cluster restarts.',
    startTime: START,
    endTime: END,
    type: 'Notice',
    createdBy: 'admin',
    ...overrides,
  } as Announcement;
}

const hooks = {
  t: ((key: string) => key) as unknown as TranslateFn,
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
};

const editorStub = {
  props: ['initialValue', 'placeHolder'],
  emits: ['text-change'],
  template:
    '<textarea data-testid="description" :value="initialValue" @input="$emit(\'text-change\', $event.target.value)" />',
};

function mountForm(props: { mode: SystemAnnouncementFormMode } & Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createTestI18n();
  const wrapper = mount(SystemAnnouncementForm, {
    props: { hooks, notifySuccess: vi.fn(), ...props },
    global: {
      plugins: [pinia, Antd, i18n],
      stubs: { SmRichTextEditor: editorStub },
    },
  });
  return { wrapper, i18n };
}

async function fillValid(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="title"]').setValue('Downtime window');
  const dates = wrapper.findAllComponents(AnnouncementDateField);
  await dates[0]?.vm.$emit('change', START);
  await dates[1]?.vm.$emit('change', END);
  await wrapper.find('[data-testid="description"]').setValue('The cluster restarts.');
  await flushPromises();
}

describe('SystemAnnouncementForm', () => {
  beforeEach(() => {
    saveSystemAnnouncement.mockReset();
    saveSystemAnnouncement.mockImplementation(async (args: { onSaved: (a: Announcement) => void }) => {
      args.onSaved(announcement());
    });
  });

  it('starts empty in create mode, with Notice selected and submit disabled', () => {
    const { wrapper } = mountForm({ mode: 'create' });
    expect((wrapper.find('[data-testid="title"]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.findComponent(AnnouncementTypeSelect).props('value')).toBe('Notice');
    expect(wrapper.find('[data-testid="custom-type-name"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="announcement-submit"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the title size error after the first edit, and the counter otherwise', async () => {
    const { wrapper } = mountForm({ mode: 'create' });
    const title = wrapper.find('[data-testid="title"]');
    await title.setValue('abc');
    expect(wrapper.find('.system-announcement-form__hint--error').text()).toContain(
      'Title size must be between 5 and 124',
    );
    await title.setValue('abcdef');
    expect(wrapper.find('.system-announcement-form__hint--error').exists()).toBe(false);
    expect(wrapper.find('.system-announcement-form__hint').text()).toBe('6/124');
  });

  it('requires colour and name for Custom, and drops them when leaving Custom', async () => {
    const { wrapper } = mountForm({ mode: 'create' });
    const typeSelect = wrapper.findComponent(AnnouncementTypeSelect);
    await typeSelect.vm.$emit('change', 'Custom');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="custom-type-name"]').exists()).toBe(true);
    // Touch both Custom fields: an empty name, and no colour picked.
    await wrapper.find('[data-testid="custom-type-name"]').setValue(' ');
    await wrapper.findComponent(AnnouncementColorSelect).vm.$emit('change', undefined);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="color-error"]').exists()).toBe(true);

    await typeSelect.vm.$emit('change', 'Notice');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="custom-type-name"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="color-error"]').exists()).toBe(false);
  });

  it('rejects an end that does not follow the start, and re-judges it on start change', async () => {
    const { wrapper } = mountForm({ mode: 'create' });
    const dates = wrapper.findAllComponents(AnnouncementDateField);
    await dates[0]?.vm.$emit('change', START);
    await dates[1]?.vm.$emit('change', START);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="endTime-error"]').text()).toContain(
      'Announcement start time must be earlier than the end time.',
    );
    await dates[1]?.vm.$emit('change', END);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="endTime-error"]').exists()).toBe(false);
    // Moving the start past the end re-judges the end immediately.
    await dates[0]?.vm.$emit('change', END + 1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="endTime-error"]').exists()).toBe(true);
  });

  it('creates with a trimmed title and the type fields, and emits saved', async () => {
    const { wrapper } = mountForm({ mode: 'create' });
    await wrapper.find('[data-testid="title"]').setValue('  Downtime window  ');
    const dates = wrapper.findAllComponents(AnnouncementDateField);
    await dates[0]?.vm.$emit('change', START);
    await dates[1]?.vm.$emit('change', END);
    await wrapper.find('[data-testid="description"]').setValue('The cluster restarts.');
    await wrapper.find('[data-testid="announcement-submit"]').trigger('click');
    await flushPromises();
    expect(saveSystemAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        original: undefined,
        request: {
          displayName: 'Downtime window',
          description: 'The cluster restarts.',
          startTime: START,
          endTime: END,
          type: 'Notice',
          color: undefined,
          customTypeName: undefined,
        },
      }),
    );
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 'a1' });
  });

  it('edits with the original announcement and the save-changes label', async () => {
    const { wrapper, i18n } = mountForm({ mode: 'edit', announcement: announcement() });
    expect((wrapper.find('[data-testid="title"]').element as HTMLInputElement).value).toBe(
      'Downtime window',
    );
    expect(wrapper.find('[data-testid="announcement-submit"]').text()).toBe(
      i18n.global.t('label.save-changes'),
    );
    await wrapper.find('[data-testid="announcement-submit"]').trigger('click');
    await flushPromises();
    expect(saveSystemAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ original: announcement() }),
    );
  });

  it('duplicates with the copy title and no original', async () => {
    const { wrapper, i18n } = mountForm({ mode: 'duplicate', announcement: announcement() });
    expect((wrapper.find('[data-testid="title"]').element as HTMLInputElement).value).toBe(
      i18n.global.t('label.entity-copy', { entity: 'Downtime window' }),
    );
    await wrapper.find('[data-testid="announcement-submit"]').trigger('click');
    await flushPromises();
    expect(saveSystemAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ original: undefined }),
    );
  });

  it('never submits while invalid', async () => {
    const { wrapper } = mountForm({ mode: 'create' });
    await fillValid(wrapper);
    // Break validity again: clear the description.
    await wrapper.find('[data-testid="description"]').setValue('');
    await wrapper.find('[data-testid="announcement-submit"]').trigger('click');
    await flushPromises();
    expect(saveSystemAnnouncement).not.toHaveBeenCalled();
  });

  it('emits cancel', async () => {
    const { wrapper } = mountForm({ mode: 'create' });
    await wrapper.find('[data-testid="announcement-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
