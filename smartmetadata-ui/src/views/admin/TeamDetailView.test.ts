/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd, { Checkbox, Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import TeamDetailView from './TeamDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let teamGrant: 'deny' | 'grant' = 'deny';

async function mountTeam(asAdmin: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/teams', name: 'admin-teams', component: { template: '<div>teams</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: TeamDetailView, props: true },
    ],
  });
  await router.push({ name: 'admin-team', params: { id: 't1' } });
  await router.isReady();
  const wrapper = mount(TeamDetailView, {
    props: { id: 't1' },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return wrapper;
}

describe('TeamDetailView P1 dual line', () => {
  beforeEach(() => {
    teamGrant = 'deny';
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/team/t1')) {
          if (teamGrant === 'grant') {
            return jsonResponse({
              resource: 'team',
              permissions: [{ operation: 'EditAll', access: 'allow' }],
            });
          }
          return new Response('not found', { status: 404 });
        }
        if (url.includes('/api/v1/teams/t1')) {
          return jsonResponse({ id: 't1', name: 'Engineering', teamType: 'Group', users: [] });
        }
        if (url.includes('/api/v1/roles')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/users')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the edit button for an admin', async () => {
    const wrapper = await mountTeam(true);
    expect(wrapper.find('[data-testid="edit-team"]').exists()).toBe(true);
  });

  it('hides the edit button for a non-admin without a grant', async () => {
    const wrapper = await mountTeam(false);
    expect(wrapper.find('[data-testid="edit-team"]').exists()).toBe(false);
  });

  it('shows the edit button for a non-admin with an EditAll grant', async () => {
    teamGrant = 'grant';
    const wrapper = await mountTeam(false);
    expect(wrapper.find('[data-testid="edit-team"]').exists()).toBe(true);
  });
});

describe('TeamDetailView edit saves with JSON Patch', () => {
  let teamResponse: Record<string, unknown>;

  const defaultTeamResponse = (): Record<string, unknown> => ({
    id: 't1',
    name: 'Engineering',
    displayName: 'Engineering',
    description: 'Eng team',
    teamType: 'Group',
    isJoinable: true,
    users: [{ id: 'u1', name: 'amy', type: 'user' }],
    defaultRoles: [
      { id: 'r1', name: 'DataConsumer', type: 'role' },
      { id: 'r2', name: 'DataSteward', type: 'role' },
    ],
    parents: [{ id: 'p1', name: 'Org', type: 'team' }],
    policies: [{ id: 'pol1', name: 'P', type: 'policy' }],
  });

  beforeEach(() => {
    teamResponse = defaultTeamResponse();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/teams/t1')) {
          return jsonResponse(teamResponse);
        }
        if (url.includes('/api/v1/roles')) {
          return jsonResponse({
            data: [
              { id: 'r1', name: 'DataConsumer' },
              { id: 'r2', name: 'DataSteward' },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/api/v1/users')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  async function openEdit(wrapper: Awaited<ReturnType<typeof mountTeam>>) {
    await wrapper.find('[data-testid="edit-team"]').trigger('click');
    await flushPromises();
  }

  async function saveModal() {
    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
  }

  function patchCalls() {
    return vi
      .mocked(fetch)
      .mock.calls.map(([input, init]) => ({ url: String(input), init }))
      .filter((call) => call.init?.method === 'PATCH' && call.url.includes('/api/v1/teams/t1'));
  }

  it('sends only the changed display name as a JSON Patch, never a PUT', async () => {
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    const input = Array.from(document.body.querySelectorAll('.ant-modal input')).find(
      (element) => (element as HTMLInputElement).value === 'Engineering',
    );
    expect(input).toBeDefined();
    await new DOMWrapper(input as HTMLInputElement).setValue('Eng');
    await saveModal();
    const patches = patchCalls();
    expect(patches).toHaveLength(1);
    expect(patches[0]!.init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
    expect(JSON.parse(String(patches[0]!.init?.body))).toEqual([
      { op: 'replace', path: '/displayName', value: 'Eng' },
    ]);
    const calls = vi.mocked(fetch).mock.calls.map(([, init]) => init?.method);
    expect(calls).not.toContain('PUT');
  });

  it('sends a remove op when the description is cleared', async () => {
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    const textarea = document.body.querySelector('.ant-modal textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    await new DOMWrapper(textarea!).setValue('');
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]!.init?.body))).toEqual([
      { op: 'remove', path: '/description' },
    ]);
  });

  it('sends type, joinable, and default-role ops without touching unowned fields', async () => {
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    const typeSelect = wrapper
      .findAllComponents(Select)
      .find((select) => select.props('value') === 'Group');
    expect(typeSelect).toBeDefined();
    await typeSelect!.vm.$emit('update:value', 'Department');
    const rolesSelect = wrapper
      .findAllComponents(Select)
      .find((select) => JSON.stringify(select.props('value')) === JSON.stringify(['r1', 'r2']));
    expect(rolesSelect).toBeDefined();
    await rolesSelect!.vm.$emit('update:value', ['r2']);
    const checkbox = wrapper.findComponent(Checkbox);
    expect(checkbox.exists()).toBe(true);
    await checkbox.vm.$emit('update:checked', false);
    await flushPromises();
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    const ops = JSON.parse(String(patchCalls()[0]!.init?.body)) as Array<{ path: string }>;
    expect(ops).toEqual([
      { op: 'replace', path: '/teamType', value: 'Department' },
      { op: 'replace', path: '/isJoinable', value: false },
      { op: 'replace', path: '/defaultRoles', value: [{ id: 'r2', type: 'role' }] },
    ]);
    const paths = ops.map((op) => op.path);
    for (const forbidden of ['/users', '/parents', '/children', '/policies', '/defaultPersona', '/email', '/profile']) {
      expect(paths).not.toContain(forbidden);
    }
  });

  it('sends an empty patch array when nothing changed', async () => {
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]!.init?.body))).toEqual([]);
  });

  it('sends no op for whitespace-only edits or reordered default roles', async () => {
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    const input = Array.from(document.body.querySelectorAll('.ant-modal input')).find(
      (element) => (element as HTMLInputElement).value === 'Engineering',
    );
    expect(input).toBeDefined();
    await new DOMWrapper(input as HTMLInputElement).setValue('  Engineering  ');
    const rolesSelect = wrapper
      .findAllComponents(Select)
      .find((select) => JSON.stringify(select.props('value')) === JSON.stringify(['r1', 'r2']));
    expect(rolesSelect).toBeDefined();
    await rolesSelect!.vm.$emit('update:value', ['r2', 'r1']);
    await flushPromises();
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]!.init?.body))).toEqual([]);
  });

  it('sends no isJoinable op when the stored value is missing and the form stays joinable', async () => {
    teamResponse = { ...defaultTeamResponse(), isJoinable: undefined };
    delete teamResponse.isJoinable;
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]!.init?.body))).toEqual([]);
  });

  it('sends no op when the stored value only differs by surrounding whitespace', async () => {
    teamResponse = { ...defaultTeamResponse(), displayName: '  Engineering  ', description: '  Eng team  ' };
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    const input = Array.from(document.body.querySelectorAll('.ant-modal input')).find(
      (element) => (element as HTMLInputElement).value === '  Engineering  ',
    );
    expect(input).toBeDefined();
    await new DOMWrapper(input as HTMLInputElement).setValue('Engineering');
    const textarea = document.body.querySelector('.ant-modal textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    await new DOMWrapper(textarea!).setValue('Eng team');
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]!.init?.body))).toEqual([]);
  });

  it('sends the trimmed form value when a stored padded value really changes', async () => {
    teamResponse = { ...defaultTeamResponse(), displayName: '  Engineering  ', description: '  Eng team  ' };
    const wrapper = await mountTeam(true);
    await openEdit(wrapper);
    const input = Array.from(document.body.querySelectorAll('.ant-modal input')).find(
      (element) => (element as HTMLInputElement).value === '  Engineering  ',
    );
    expect(input).toBeDefined();
    await new DOMWrapper(input as HTMLInputElement).setValue('  Eng  ');
    const textarea = document.body.querySelector('.ant-modal textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    await new DOMWrapper(textarea!).setValue('  New desc  ');
    await saveModal();
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String(patchCalls()[0]!.init?.body))).toEqual([
      { op: 'replace', path: '/displayName', value: 'Eng' },
      { op: 'replace', path: '/description', value: 'New desc' },
    ]);
  });
});
