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
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { deletePersona } from '@/api/persona';
import type { Persona } from '@/types/persona';
import PersonaManageMenu from './PersonaManageMenu.vue';

vi.mock('@/api/persona', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/persona')>()),
  deletePersona: vi.fn(),
}));

const deletePersonaMock = vi.mocked(deletePersona);

const MESSAGES = {
  en: {
    label: {
      persona: 'Persona',
      rename: 'Rename',
      'remove-default': 'Remove Default',
      'set-as-default': 'Set as Default',
      delete: 'Delete',
      cancel: 'Cancel',
      'display-name': 'Display Name',
      name: 'Name',
      'manage-entity': 'Manage {entity}',
      'edit-entity': 'Edit {entity}',
    },
    message: {
      'update-displayName-entity': 'Update display name for {entity}',
      'remove-default-persona-description': 'Remove this persona as the default',
      'set-default-persona-menu-description': 'Set this persona as the default',
      'delete-entity-type-action-description': 'Delete this {entityType} permanently',
      'entity-size-in-between': '{entity} size must be between {min} and {max}',
      'enter-display-name': 'Enter display name',
      'permanently-delete-common-message': 'This will permanently delete {entity}.',
    },
    server: {
      'entity-deleted-successfully': '{entity} deleted successfully',
      'delete-entity-error': 'Failed to delete {entity}',
    },
  },
};

function mountMenu(props: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  return mount(PersonaManageMenu, {
    attachTo: document.body,
    global: { plugins: [Antd, i18n] },
    props: {
      persona: {
        id: 'p1',
        name: 'Analyst',
        fullyQualifiedName: 'Analyst',
        displayName: 'Data Analyst',
      } as Persona,
      canEditDescription: true,
      canDelete: true,
      onEditDisplayName: vi.fn(async () => {}),
      onDefaultActionClick: vi.fn(),
      afterDeleteAction: vi.fn(),
      ...props,
    },
  });
}

async function openMenu(wrapper: ReturnType<typeof mountMenu>): Promise<void> {
  (wrapper.find('button').element as HTMLElement).click();
  await waitFor(
    () => document.body.querySelector('[data-testid="set-as-default-button"]') !== null,
    'menu items',
  );
}

async function waitFor(fn: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function clickMenuItem(testid: string): Promise<void> {
  (document.body.querySelector(`[data-testid="${testid}"]`) as HTMLElement).click();
  await nextTick();
  await flushPromises();
}

async function setInput(testid: string, value: string) {
  const input = document.body.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

beforeEach(() => {
  vi.clearAllMocks();
  deletePersonaMock.mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PersonaManageMenu', () => {
  it('renders the trigger label and menu items in pin order', async () => {
    const wrapper = mountMenu();
    expect(wrapper.find('button').text()).toContain('Manage Persona');
    await openMenu(wrapper);
    const items = [...document.body.querySelectorAll('[data-testid$="-button"]')]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id) => ['rename-button', 'set-as-default-button', 'delete-button'].includes(id ?? ''));
    expect(items).toEqual(['rename-button', 'set-as-default-button', 'delete-button']);
    expect(document.body.textContent).toContain('Update display name for Analyst');
    expect(document.body.textContent).toContain('Delete this persona permanently');
    wrapper.unmount();
  });

  it('hides Rename without edit permission and Delete without delete permission', async () => {
    const wrapper = mountMenu({ canEditDescription: false, canDelete: false });
    await openMenu(wrapper);
    expect(document.body.querySelector('[data-testid="rename-button"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="delete-button"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="set-as-default-button"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('offers remove-default for the default persona', async () => {
    const wrapper = mountMenu({
      persona: { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst', default: true } as Persona,
    });
    (wrapper.find('button').element as HTMLElement).click();
    await waitFor(
      () => document.body.querySelector('[data-testid="remove-default-button"]') !== null,
      'remove-default item',
    );
    expect(document.body.querySelector('[data-testid="set-as-default-button"]')).toBeNull();
    wrapper.unmount();
  });

  it('forwards the default action click to the caller', async () => {
    const onDefaultActionClick = vi.fn();
    const wrapper = mountMenu({ onDefaultActionClick });
    await openMenu(wrapper);
    await clickMenuItem('set-as-default-button');
    expect(onDefaultActionClick).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('renames with the full name + displayName payload and closes on save', async () => {
    const onEditDisplayName = vi.fn(async () => {});
    const wrapper = mountMenu({ onEditDisplayName });
    await openMenu(wrapper);
    await clickMenuItem('rename-button');
    const modal = document.body.querySelector('[data-testid="entity-name-modal"]');
    expect(modal).not.toBeNull();
    expect((document.body.querySelector('[data-testid="name"]') as HTMLInputElement).disabled).toBe(true);
    expect((document.body.querySelector('[data-testid="name"]') as HTMLInputElement).value).toBe('Analyst');
    await setInput('displayName', 'Governance Analyst');
    (document.body.querySelector('[data-testid="save-button"]') as HTMLElement).click();
    await flushPromises();
    expect(onEditDisplayName).toHaveBeenCalledWith({
      name: 'Analyst',
      displayName: 'Governance Analyst',
    });
    wrapper.unmount();
  });

  it('rejects empty and over-long displayNames in the rename modal', async () => {
    const onEditDisplayName = vi.fn(async () => {});
    const wrapper = mountMenu({ onEditDisplayName });
    await openMenu(wrapper);
    await clickMenuItem('rename-button');
    await setInput('displayName', '');
    (document.body.querySelector('[data-testid="save-button"]') as HTMLElement).click();
    await nextTick();
    expect(document.body.querySelector('[data-testid="entity-name-modal"]')?.textContent).toContain(
      'Display Name size must be between 1 and 128',
    );
    await setInput('displayName', 'x'.repeat(129));
    (document.body.querySelector('[data-testid="save-button"]') as HTMLElement).click();
    await nextTick();
    expect(document.body.querySelector('[data-testid="entity-name-modal"]')?.textContent).toContain(
      'Display Name size must be between 1 and 128',
    );
    expect(onEditDisplayName).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('deletes with the lowercased entity message, toasts, and runs the after-delete action', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const afterDeleteAction = vi.fn();
    const wrapper = mountMenu({ afterDeleteAction });
    await openMenu(wrapper);
    await clickMenuItem('delete-button');
    const header = document.body.querySelector('[data-testid="modal-header"]');
    expect(header?.textContent).toContain('Delete Data Analyst');
    expect(header?.textContent).toContain('data analyst');
    (document.body.querySelector('[data-testid="confirm-button"]') as HTMLElement).click();
    await flushPromises();
    expect(deletePersonaMock).toHaveBeenCalledWith('p1');
    expect(successSpy).toHaveBeenCalledWith('Data Analyst deleted successfully');
    expect(afterDeleteAction).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('toasts the delete error and does not run the after-delete action on failure', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    deletePersonaMock.mockRejectedValue(new Error('delete boom'));
    const afterDeleteAction = vi.fn();
    const wrapper = mountMenu({ afterDeleteAction });
    await openMenu(wrapper);
    await clickMenuItem('delete-button');
    (document.body.querySelector('[data-testid="confirm-button"]') as HTMLElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Failed to delete Data Analyst');
    expect(afterDeleteAction).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
