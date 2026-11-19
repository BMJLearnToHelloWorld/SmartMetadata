/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { Modal, message } from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth';
import type { EntityRef, LoginUser } from '@/types/api';
import PersonaDetailView from './PersonaDetailView.vue';

const getEntityPermissionByFqn = vi.fn(async (): Promise<Record<string, boolean>> => ({}));
const getEntityPermissionById = vi.fn(async (): Promise<Record<string, boolean>> => ({}));
const invalidateEntityPermission = vi.fn();
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getEntityPermissionById,
    getEntityPermissionByFqn,
    invalidateEntityPermission,
  }),
}));

const ManageMenuStub = defineComponent({
  props: {
    persona: { type: Object, required: true },
    canEditDescription: Boolean,
    canDelete: Boolean,
    onEditDisplayName: { type: Function, required: true },
    onDefaultActionClick: { type: Function, required: true },
    afterDeleteAction: { type: Function, required: true },
  },
  template:
    '<div data-testid="manage-menu-stub">' +
    '<button data-testid="stub-rename" type="button" @click="onEditDisplayName({ name: \'Analyst\', displayName: \'Renamed\' })">rename</button>' +
    '<button data-testid="stub-default" type="button" @click="onDefaultActionClick()">default</button>' +
    '<button data-testid="stub-delete" type="button" @click="afterDeleteAction()">delete</button>' +
    '</div>',
});

const DescriptionModalStub = defineComponent({
  props: {
    open: Boolean,
    header: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    value: { type: String, default: '' },
    onCancel: { type: Function, required: true },
    onSave: { type: Function, required: true },
  },
  template:
    '<div v-if="open" data-testid="description-modal-stub">' +
    '<span data-testid="stub-header">{{ header }}</span>' +
    '<span data-testid="stub-placeholder">{{ placeholder }}</span>' +
    '<span data-testid="stub-value">{{ value }}</span>' +
    '<button data-testid="stub-save-desc" type="button" @click="onSave(\'new desc\')">save</button>' +
    '<button data-testid="stub-clear-desc" type="button" @click="onSave(\'\')">clear</button>' +
    '</div>',
});

const UsersTabStub = defineComponent({
  props: {
    users: { type: Array, default: () => [] },
    onRemoveUser: { type: Function, required: true },
  },
  template:
    '<div data-testid="users-tab-stub">' +
    '<button v-for="u in users" :key="u.id" :data-testid="`stub-remove-${u.id}`" type="button" @click="onRemoveUser(u.id)">remove {{ u.name }}</button>' +
    '</div>',
});

const SelectorStub = defineComponent({
  props: {
    hasPermission: Boolean,
    multiSelect: Boolean,
    selectedUsers: { type: Array, default: () => [] },
    onUpdate: { type: Function, required: true },
  },
  template:
    '<div data-testid="selector-stub">' +
    '<slot />' +
    '<button data-testid="stub-add-user" type="button" @click="onUpdate([{ id: \'u2\', name: \'grace\', type: \'user\' }, { id: \'u3\', name: \'heidi\', type: \'user\' }, { id: \'u4\', name: \'ivan\', type: \'user\' }])">add</button>' +
    '</div>',
});

const MESSAGES = {
  en: {
    label: {
      'persona-plural': 'Personas',
      'customize-ui': 'Customize UI',
      'user-plural': 'Users',
      user: 'User',
      'add-entity': 'Add {entity}',
      'edit-entity': 'Edit {entity}',
      description: 'Description',
      'edit-description-for': 'Edit description for {entityName}',
      'enter-entity': 'Enter {entity}',
      governance: 'Governance',
      'remove-default': 'Remove Default',
      'set-as-default': 'Set as Default',
      yes: 'Yes',
      cancel: 'Cancel',
    },
    settings: {
      registry: {
        persona: {
          title: 'Personas',
        },
      },
    },
    persona: {
      customizeCategoryGovernance: 'Governance',
    },
    message: {
      'remove-default-persona-confirmation': 'Remove {persona} as the default persona?',
      'set-default-persona-confirmation': 'Set {persona} as the default persona?',
      'default-persona-set-successfully': 'Default persona set successfully',
      'default-persona-removed-successfully': 'Default persona removed successfully',
      'default-persona-update-error': 'Failed to update the default persona',
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PERSONA = {
  id: 'p1',
  name: 'Analyst',
  fullyQualifiedName: 'Analyst',
  displayName: 'Data Analyst',
  description: 'old desc',
  users: [
    { id: 'u2', name: 'grace', type: 'user' },
    { id: 'u3', name: 'heidi', type: 'user' },
  ],
};

interface Fixture {
  requests: Array<{ url: string; init?: RequestInit }>;
  persona?: Record<string, unknown> | null;
  patchResponse?: Record<string, unknown>;
  failPatch?: boolean;
  failDetail?: boolean;
  resolveDetail?: (body: unknown) => void;
}

async function mountDetail(fixture: Fixture, hash = '') {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'u1', name: 'alice', isAdmin: true } as LoginUser;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/persona', name: 'admin-settings-persona', component: { template: '<div>list</div>' } },
      {
        path: '/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: PersonaDetailView,
        props: true,
      },
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: { template: '<div>customize</div>' },
      },
    ],
  });
  await router.push(`/settings/persona/Analyst${hash}`);
  await router.isReady();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fixture.requests.push({ url, init });
      if (url.includes('/v1/personas/name/')) {
        if (fixture.failDetail) {
          return jsonResponse({ message: 'detail boom' }, 404);
        }
        if (fixture.resolveDetail === undefined && fixture.persona === undefined) {
          // Deferred: the loading test resolves it manually.
          return new Promise<Response>((resolve) => {
            fixture.resolveDetail = (body: unknown) => resolve(jsonResponse(body));
          });
        }
        return jsonResponse(fixture.persona ?? PERSONA);
      }
      if (url.includes('/v1/personas/p1') && init?.method === 'PATCH') {
        if (fixture.failPatch) {
          return jsonResponse({ message: 'patch boom' }, 500);
        }
        return jsonResponse(fixture.patchResponse ?? PERSONA);
      }
      if (url.includes('/v1/users/u1')) {
        return jsonResponse({ id: 'u1', name: 'alice', personas: [] });
      }
      return jsonResponse({});
    }),
  );
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  const wrapper = mount(PersonaDetailView, {
    attachTo: document.body,
    global: {
      plugins: [Antd, router, i18n],
      stubs: {
        PersonaManageMenu: ManageMenuStub,
        PersonaDescriptionModal: DescriptionModalStub,
        PersonaUsersTab: UsersTabStub,
        UserSelectableList: SelectorStub,
      },
    },
    props: { fqn: 'Analyst' },
  });
  return { wrapper, router };
}

function patchBodies(fixture: Fixture): unknown[] {
  return fixture.requests
    .filter((request) => request.init?.method === 'PATCH')
    .map((request) => JSON.parse(String(request.init?.body)));
}

function userRefreshCount(fixture: Fixture): number {
  return fixture.requests.filter((request) => request.url.includes('/v1/users/u1')).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  getEntityPermissionByFqn.mockResolvedValue({ EditAll: true });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PersonaDetailView', () => {
  it('adds the customize-ui hash on a hash-less visit', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper, router } = await mountDetail(fixture);
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.hash).toBe('#customize-ui');
    expect(wrapper.find('[data-testid="persona-tab-customize"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('activates the users tab from the hash and shows the Add button only there', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#users');
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="persona-tab-users"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-persona-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="selector-stub"]').exists()).toBe(true);
    await wrapper.find('[data-testid="customize-ui"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="persona-tab-customize"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-persona-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the two-segment breadcrumb with no Settings prefix and no Back button', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    const items = wrapper.findAll('.ant-breadcrumb li');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('Personas');
    expect(items[1].text()).toContain('Data Analyst');
    expect(wrapper.text()).not.toContain('Settings');
    expect(wrapper.text()).not.toContain('Back');
    expect(wrapper.find('[data-testid="default-persona-tag"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('appends the category segment only for a known category, and drops it on active-tab click', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper, router } = await mountDetail(fixture, '#customize-ui.governance');
    await flushPromises();
    await nextTick();
    const items = wrapper.findAll('.ant-breadcrumb li');
    expect(items).toHaveLength(3);
    expect(items[2].text()).toContain('Governance');
    await wrapper.find('[data-testid="customize-ui"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.hash).toBe('#customize-ui');
    expect(wrapper.findAll('.ant-breadcrumb li')).toHaveLength(2);
    wrapper.unmount();

    const unknown: Fixture = { requests: [], persona: PERSONA };
    const second = await mountDetail(unknown, '#customize-ui.bogus');
    await flushPromises();
    await nextTick();
    expect(second.wrapper.findAll('.ant-breadcrumb li')).toHaveLength(2);
    second.wrapper.unmount();
  });

  it('gates the description edit and menu permissions from the fetched grants', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    expect(getEntityPermissionByFqn).toHaveBeenCalledWith('persona', 'Analyst');
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    const menu = wrapper.findComponent(ManageMenuStub);
    expect(menu.props('canEditDescription')).toBe(true);
    expect(menu.props('canDelete')).toBe(true);
    wrapper.unmount();

    getEntityPermissionByFqn.mockResolvedValue({ Delete: true });
    const deleteOnly: Fixture = { requests: [], persona: PERSONA };
    const second = await mountDetail(deleteOnly, '#customize-ui');
    await flushPromises();
    await nextTick();
    // Delete-only: no description edit, but the OR-ed canDelete stays true.
    expect(second.wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(second.wrapper.findComponent(ManageMenuStub).props('canDelete')).toBe(true);
    expect(second.wrapper.findComponent(ManageMenuStub).props('canEditDescription')).toBe(false);
    second.wrapper.unmount();

    getEntityPermissionByFqn.mockResolvedValue({});
    const denied: Fixture = { requests: [], persona: PERSONA };
    const third = await mountDetail(denied, '#customize-ui');
    await flushPromises();
    await nextTick();
    expect(third.wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(third.wrapper.findComponent(ManageMenuStub).props('canDelete')).toBe(false);
    third.wrapper.unmount();
  });

  it('toasts and hides all actions when the permission fetch fails', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    getEntityPermissionByFqn.mockRejectedValue(new Error('perm boom'));
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    expect(errorSpy).toHaveBeenCalledWith('perm boom');
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(wrapper.findComponent(ManageMenuStub).props('canDelete')).toBe(false);
    wrapper.unmount();
  });

  it('shows only a spinner while loading', async () => {
    const fixture: Fixture = { requests: [] };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await nextTick();
    expect(wrapper.find('.ant-spin').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-tab-customize"]').exists()).toBe(false);
    fixture.resolveDetail?.(PERSONA);
    await flushPromises();
    wrapper.unmount();
  });

  it('toasts on detail failure and shows the empty placeholder with no error paragraph', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const fixture: Fixture = { requests: [], failDetail: true };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('detail boom');
    wrapper.unmount();
  });

  it('saves a description edit as a diff-only replace with no user refresh', async () => {
    const fixture: Fixture = {
      requests: [],
      persona: PERSONA,
      patchResponse: { ...PERSONA, description: 'new desc' },
    };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await nextTick();
    const modal = wrapper.findComponent(DescriptionModalStub);
    expect(modal.props('header')).toBe('Edit description for Analyst');
    expect(modal.props('placeholder')).toBe('Enter Description');
    expect(modal.props('value')).toBe('old desc');
    await wrapper.find('[data-testid="stub-save-desc"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(patchBodies(fixture)).toEqual([
      [{ op: 'replace', path: '/description', value: 'new desc' }],
    ]);
    expect(userRefreshCount(fixture)).toBe(0);
    expect(wrapper.find('[data-testid="description-modal-stub"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('sends a remove op when the description is cleared', async () => {
    const fixture: Fixture = {
      requests: [],
      persona: PERSONA,
      patchResponse: { ...PERSONA, description: undefined },
    };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="stub-clear-desc"]').trigger('click');
    await flushPromises();
    expect(patchBodies(fixture)).toEqual([[{ op: 'remove', path: '/description' }]]);
    wrapper.unmount();
  });

  it('sets the default persona through the confirm modal and refreshes the current user', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const fixture: Fixture = {
      requests: [],
      persona: PERSONA,
      patchResponse: { ...PERSONA, default: true },
    };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="stub-default"]').trigger('click');
    await nextTick();
    const modal = wrapper.findComponent(Modal);
    expect(modal.props('open')).toBe(true);
    expect(modal.props('title')).toBe('Set as Default');
    expect(document.body.textContent).toContain('Set Data Analyst as the default persona?');
    (document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await flushPromises();
    await nextTick();
    expect(patchBodies(fixture)).toEqual([[{ op: 'add', path: '/default', value: true }]]);
    expect(successSpy).toHaveBeenCalledWith('Default persona set successfully');
    expect(userRefreshCount(fixture)).toBe(1);
    expect(wrapper.findComponent(Modal).props('open')).toBe(false);
    wrapper.unmount();
  });

  it('keeps the default confirm modal open on patch failure with the update-error toast', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const fixture: Fixture = { requests: [], persona: PERSONA, failPatch: true };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="stub-default"]').trigger('click');
    await nextTick();
    (document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await flushPromises();
    await nextTick();
    expect(errorSpy).toHaveBeenCalledWith('Failed to update the default persona');
    expect(wrapper.findComponent(Modal).props('open')).toBe(true);
    expect(userRefreshCount(fixture)).toBe(0);
    wrapper.unmount();
  });

  it('removes a user with a filtered users patch and refreshes the current user', async () => {
    const fixture: Fixture = {
      requests: [],
      persona: PERSONA,
      patchResponse: { ...PERSONA, users: [{ id: 'u3', name: 'heidi', type: 'user' }] },
    };
    const { wrapper } = await mountDetail(fixture, '#users');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="stub-remove-u2"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(patchBodies(fixture)).toEqual([
      [{ op: 'replace', path: '/users', value: [{ id: 'u3', name: 'heidi', type: 'user' }] }],
    ]);
    expect(userRefreshCount(fixture)).toBe(1);
    wrapper.unmount();
  });

  it('adds a user through the selector with a users patch and refresh', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA, patchResponse: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#users');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="stub-add-user"]').trigger('click');
    await flushPromises();
    await nextTick();
    const ops = patchBodies(fixture)[0] as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('replace');
    expect(ops[0].path).toBe('/users');
    expect(ops[0].value as EntityRef[]).toHaveLength(3);
    expect(userRefreshCount(fixture)).toBe(1);
    wrapper.unmount();
  });

  it('renames through the manage menu with a displayName-only patch and refresh', async () => {
    const fixture: Fixture = {
      requests: [],
      persona: PERSONA,
      patchResponse: { ...PERSONA, displayName: 'Renamed' },
    };
    const { wrapper } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="stub-rename"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(patchBodies(fixture)).toEqual([
      [{ op: 'replace', path: '/displayName', value: 'Renamed' }],
    ]);
    expect(userRefreshCount(fixture)).toBe(1);
    wrapper.unmount();
  });

  it('refreshes the current user and navigates to the list after delete', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper, router } = await mountDetail(fixture, '#customize-ui');
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="stub-delete"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(userRefreshCount(fixture)).toBe(1);
    expect(router.currentRoute.value.name).toBe('admin-settings-persona');
    wrapper.unmount();
  });

  it('renders the detail header and customize cards', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture);
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="persona-detail-name"]').text()).toBe('Data Analyst');
    expect(wrapper.find('[data-testid="persona-customize-app-layout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-customize-DataMarketplace"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-customize-askCollateSidebar"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it('navigates a leaf customize card to the top-level customize route', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper, router } = await mountDetail(fixture);
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="persona-customize-app-layout"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.name).toBe('customize-page');
    expect(router.currentRoute.value.params).toEqual({ fqn: 'Analyst', pageFqn: 'app-layout' });
    wrapper.unmount();
  });

  it('drilling into a parent card only changes the hash and swaps in the sub-options', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper, router } = await mountDetail(fixture);
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="persona-customize-data-assets"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.hash).toBe('#customize-ui.data-assets');
    expect(wrapper.findAll('[data-testid^="persona-customize-option-"]')).toHaveLength(19);
    expect(wrapper.find('[data-testid="persona-customize-navigation"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('honours a drilled-in hash on load', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#customize-ui.governance');
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll('[data-testid^="persona-customize-option-"]')).toHaveLength(4);
    wrapper.unmount();
  });

  it('renders the row-1 breadcrumb trail without a Settings root', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture);
    await flushPromises();
    await nextTick();
    const crumbs = wrapper.find('[data-testid="persona-breadcrumb"]');
    expect(crumbs.exists()).toBe(true);
    const links = crumbs.findAll('a');
    expect(links.map((link) => link.text())).toEqual(['Personas', 'Data Analyst']);
    expect(links[0].attributes('href')).toBe('/settings/persona');
    expect(links[1].attributes('href')).toBe('/settings/persona/Analyst#customize-ui');
    expect(crumbs.text()).not.toContain('Settings');
    wrapper.unmount();
  });

  it('appends the drilled-in category label to the breadcrumb trail', async () => {
    const fixture: Fixture = { requests: [], persona: PERSONA };
    const { wrapper } = await mountDetail(fixture, '#customize-ui.governance');
    await flushPromises();
    await nextTick();
    const crumbs = wrapper.find('[data-testid="persona-breadcrumb"]');
    expect(crumbs.text()).toContain('Governance');
    expect(crumbs.findAll('a')).toHaveLength(2);
    wrapper.unmount();
  });
});
