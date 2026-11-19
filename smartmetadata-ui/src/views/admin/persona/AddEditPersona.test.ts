/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { defineComponent, nextTick } from 'vue';
import { createPersona } from '@/api/persona';
import { getUserById } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import AddEditPersona from './AddEditPersona.vue';

vi.mock('@/api/persona', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/persona')>()),
  createPersona: vi.fn(),
}));

vi.mock('@/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/users')>()),
  getUserById: vi.fn(),
}));

const createPersonaMock = vi.mocked(createPersona);
const getUserByIdMock = vi.mocked(getUserById);

const RichTextStub = defineComponent({
  emits: ['text-change'],
  template:
    '<button data-testid="editor-stub" type="button" @click="$emit(\'text-change\', \'<p>  spaced  </p>\')">editor</button>',
});

const SelectorStub = defineComponent({
  props: { selectedUsers: { type: Array, default: () => [] }, onUpdate: { type: Function, required: true } },
  template:
    '<div><slot /><button data-testid="selector-stub" type="button" @click="onUpdate([{ id: \'u2\', name: \'grace\', displayName: \'Grace\', type: \'user\' }])">select</button></div>',
});

const MESSAGES = {
  en: {
    label: {
      name: 'Name',
      'display-name': 'Display Name',
      description: 'Description',
      'user-plural': 'Users',
      persona: 'Persona',
      cancel: 'Cancel',
      create: 'Create',
      'add-entity': 'Add {entity}',
      'field-required': '{field} is required',
    },
    message: {
      'entity-size-in-between': '{entity} size must be between {min} and {max}',
      'entity-name-validation': 'Name must contain only letters, numbers, underscores, hyphens, periods, parenthesis, and ampersands.',
      'enter-display-name': 'Enter display name',
    },
  },
};

function mountForm(props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'u1', name: 'alice' } as LoginUser;
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  return mount(AddEditPersona, {
    attachTo: document.body,
    global: {
      plugins: [Antd, i18n],
      stubs: { SmRichTextEditor: RichTextStub, UserSelectableList: SelectorStub },
    },
    props: { open: true, onSave: vi.fn(), onCancel: vi.fn(), ...props },
  });
}

function bodyQuery(selector: string): HTMLElement | null {
  return document.body.querySelector(selector) as HTMLElement | null;
}

async function setInput(testid: string, value: string) {
  const input = bodyQuery(`[data-testid="${testid}"]`) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function clickOk() {
  (bodyQuery('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
  await flushPromises();
  await nextTick();
}

beforeEach(() => {
  vi.clearAllMocks();
  createPersonaMock.mockResolvedValue({ id: 'p9', name: 'Auditor', fullyQualifiedName: 'Auditor' } as never);
  getUserByIdMock.mockResolvedValue({ id: 'u1', name: 'alice' } as never);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AddEditPersona', () => {
  it('rejects an empty name with the required message', async () => {
    const onSave = vi.fn();
    const wrapper = mountForm({ onSave });
    await clickOk();
    expect(bodyQuery('[data-testid="add-edit-persona-modal"]')?.textContent).toContain(
      'Name is required',
    );
    expect(createPersonaMock).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rejects an over-long name with the size message', async () => {
    const wrapper = mountForm();
    await setInput('name', 'x'.repeat(129));
    await clickOk();
    expect(bodyQuery('[data-testid="add-edit-persona-modal"]')?.textContent).toContain(
      'Name size must be between 1 and 128',
    );
    expect(createPersonaMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rejects names with :: or > with the pattern message', async () => {
    const wrapper = mountForm();
    await setInput('name', 'a::b');
    await clickOk();
    expect(bodyQuery('[data-testid="add-edit-persona-modal"]')?.textContent).toContain(
      'Name must contain only letters',
    );
    await setInput('name', 'a>b');
    await clickOk();
    expect(bodyQuery('[data-testid="add-edit-persona-modal"]')?.textContent).toContain(
      'Name must contain only letters',
    );
    expect(createPersonaMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rejects an over-long displayName but accepts an empty one', async () => {
    const wrapper = mountForm();
    await setInput('name', 'Auditor');
    await setInput('displayName', 'x'.repeat(129));
    await clickOk();
    expect(bodyQuery('[data-testid="add-edit-persona-modal"]')?.textContent).toContain(
      'Display Name size must be between 1 and 128',
    );
    await setInput('displayName', '');
    await clickOk();
    expect(createPersonaMock).toHaveBeenCalledTimes(1);
    // Pin's payload carries `displayName: trim || undefined`; the key is
    // present with an undefined value and drops at JSON serialization.
    expect(createPersonaMock.mock.calls[0][0].displayName).toBeUndefined();
    wrapper.unmount();
  });

  it('submits trimmed name/displayName, raw description, and user ids, then refreshes and saves', async () => {
    const onSave = vi.fn();
    const successSpy = vi.spyOn(message, 'success');
    const wrapper = mountForm({ onSave });
    await setInput('name', '  Auditor  ');
    await setInput('displayName', '  Audit Team  ');
    (bodyQuery('[data-testid="editor-stub"]') as HTMLElement).click();
    await nextTick();
    (bodyQuery('[data-testid="selector-stub"]') as HTMLElement).click();
    await nextTick();
    expect(bodyQuery('[data-testid="users-container"]')?.textContent).toContain('Grace');
    await clickOk();
    expect(createPersonaMock).toHaveBeenCalledWith({
      name: 'Auditor',
      displayName: 'Audit Team',
      description: '<p>  spaced  </p>',
      users: ['u2'],
    });
    expect(getUserByIdMock).toHaveBeenCalledWith('u1', { fields: ['personas'], include: 'all' });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(successSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('sends an empty users array when no users are selected', async () => {
    const wrapper = mountForm();
    await setInput('name', 'Auditor');
    await clickOk();
    expect(createPersonaMock).toHaveBeenCalledWith(
      expect.objectContaining({ users: [] }),
    );
    wrapper.unmount();
  });

  it('keeps the modal open and toasts on create failure without refreshing', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    createPersonaMock.mockRejectedValue(new Error('create boom'));
    const onSave = vi.fn();
    const wrapper = mountForm({ onSave });
    await setInput('name', 'Auditor');
    await clickOk();
    expect(errorSpy).toHaveBeenCalledWith('create boom');
    expect(getUserByIdMock).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(bodyQuery('[data-testid="add-edit-persona-modal"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('still saves when the current-user refresh fails', async () => {
    getUserByIdMock.mockRejectedValue(new Error('refresh boom'));
    const onSave = vi.fn();
    const wrapper = mountForm({ onSave });
    await setInput('name', 'Auditor');
    await clickOk();
    expect(onSave).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
