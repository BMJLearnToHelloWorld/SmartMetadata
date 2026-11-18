/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Modal, Select, message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { LimitConfig } from '@/api/limits';
import BotDetailView from './BotDetailView.vue';

// Local messages: the view references NEW keys the integration line has
// not written yet. Asserting rendered copy pins the exact key names.
function createDetailI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        product: { name: 'iSmart' },
        label: {
          'bot-plural': 'Bots',
          'bot-detail': 'Bot detail',
          'display-name': 'Display Name',
          description: 'Description',
          'role-plural': 'Roles',
          'inherited-role-plural': 'Inherited Roles',
          'token-security': 'Token Security',
          'om-jwt-token': '{brandName} JWT Token',
          'revoke-token': 'Revoke token',
          'generate-new-token': 'Generate New Token',
          'auth-mechanism': 'Auth Mechanism',
          'token-expiration': 'Token Expiration',
          'select-field': 'Select {field}',
          '1-hr': '1 hour',
          '1-day': '1 day',
          'number-day-plural': '{number} days',
          unlimited: 'Unlimited',
          cancel: 'Cancel',
          generate: 'Generate',
          confirm: 'Confirm',
          save: 'Save',
          token: 'Token',
          'view-entity': 'View {entity}',
          'edit-entity': 'Edit {entity}',
          'add-entity': 'Add {entity}',
          'edit-description-for': 'Edit Description for {entityName}',
          'enter-entity': 'Enter {entity}',
          'no-description': 'No description',
          'impersonation-enabled': 'Impersonation Enabled',
          'generate-new-token-placeholder': 'Generate new token...',
          resource: 'Resource',
        },
        message: {
          'token-security-description':
            'Tokens for {brandName} are secured. Keep them safe.',
          'jwt-token': 'Token you have generated that can be used to access the {brandName} API.',
          'no-token-available': 'No token available',
          'token-has-no-expiry': 'This token has no expiration date.',
          'token-expired-on': 'Expired on {date}.',
          'token-expires-on': 'Expires on {date}.',
          'allow-impersonation-help': 'Allows the bot to impersonate users.',
          'are-you-sure-to-revoke-access': 'Are you sure you want to revoke access for JWT Token?',
          'are-you-sure': 'Are you sure?',
          'no-entity-available-with-name': 'No {entity} available with name',
          'no-roles-assigned': 'No roles assigned',
          'no-inherited-roles-found': 'No inherited roles found',
          'field-text-is-required': '{fieldText} is required.',
          'select-token-expiration': 'Select Token Expiration',
          'copy-to-clipboard': 'Copy to clipboard',
          'copied-to-clipboard': 'Copied to the clipboard',
          'no-data-available': 'No data available.',
          'no-access-placeholder':
            "You don't have necessary permissions. Please check with the admin to get the <0>{entity}</0> permission.",
          'upgrade-to-use-feature': 'Upgrade to use this feature',
        },
        server: {
          'unexpected-error': 'An unexpected error occurred.',
        },
      },
    },
  });
}

// The rich-text editor is Wave-1 tested; stub it so the description
// tests exercise this page's wiring (draft -> PATCH on save) only.
const EditorStub = defineComponent({
  name: 'SmRichTextEditor',
  props: {
    initialValue: { type: String, default: '' },
    placeHolder: { type: String, default: '' },
  },
  emits: ['text-change', 'focus'],
  template: '<div data-testid="editor-stub" />',
});

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function permissionResponse(operations: string[]) {
  return {
    resource: 'bot',
    permissions: operations.map((operation) => ({ operation, access: 'allow' })),
  };
}

const FULL_PERMISSIONS = permissionResponse([
  'ViewAll',
  'EditAll',
  'EditDescription',
  'EditDisplayName',
]);
const VIEW_ONLY_PERMISSIONS = permissionResponse(['ViewBasic']);
const NO_PERMISSIONS = permissionResponse([]);

const BOT_FIXTURE = {
  id: 'b1',
  name: 'ingest-bot',
  displayName: 'Ingest Bot',
  description: 'Does **things**.',
  fullyQualifiedName: 'ingest-bot',
  provider: 'user',
  botUser: { id: 'u1', name: 'ingest-bot', fullyQualifiedName: 'ingest-bot', type: 'user' },
};

function botUserFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'ingest-bot',
    fullyQualifiedName: 'ingest-bot',
    isAdmin: false,
    isBot: true,
    allowImpersonation: true,
    roles: [{ id: 'r1', name: 'DataSteward', type: 'role' }],
    inheritedRoles: [{ id: 'r2', name: 'Catalog', type: 'role' }],
    profile: {},
    ...overrides,
  };
}

const ROLES_FIXTURE = {
  data: [
    { id: 'r1', name: 'DataSteward', displayName: 'Data Steward', policies: [], users: [], teams: [] },
    { id: 'r3', name: 'Viewer', displayName: 'Viewer', policies: [], users: [], teams: [] },
  ],
  paging: { total: 2 },
};

const LIMIT_CONFIG_ENABLED: LimitConfig = {
  enable: true,
  limits: {
    config: {
      version: '1',
      plan: 'PRO',
      installationType: 'OSS',
      deployment: 'local',
      companyName: '',
      domain: '',
      instances: 1,
      featureLimits: [],
    },
  },
};

let permissionFixture: unknown;
let botShouldFail: boolean;
let botUserOverrides: Record<string, unknown>;
let mechanismFixture: unknown;
let featuresFixture: unknown;
let calls: FetchCall[];
let botState: Record<string, unknown>;
let userState: Record<string, unknown>;

function applyPatch(target: Record<string, unknown>, ops: Array<{ op: string; path: string; value?: unknown }>) {
  const next = { ...target };
  for (const op of ops) {
    const key = op.path.slice(1).replaceAll('~1', '/').replaceAll('~0', '~');
    if (op.op === 'remove') {
      delete next[key];
    } else {
      next[key] = op.value;
    }
  }
  return next;
}

async function settled(wrapper: VueWrapper): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await flushPromises();
  }
  await wrapper.vm.$nextTick();
}

async function mountDetail(options: {
  props?: { fqn?: string; id?: string };
  asAdmin?: boolean;
  seedLimit?: boolean;
} = {}): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = options.asAdmin === false
    ? { id: 'u9', name: 'bob' }
    : { id: 'admin', name: 'admin', isAdmin: true };
  if (options.seedLimit) {
    useShellConfigStore().limit = LIMIT_CONFIG_ENABLED;
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/bots', name: 'admin-bots', component: { template: '<div />' } },
      { path: '/bots/:fqn', name: 'bot-detail', component: BotDetailView },
    ],
  });
  await router.push('/bots/ingest-bot');
  await router.isReady();
  const wrapper = mount(BotDetailView, {
    props: options.props ?? { fqn: 'ingest-bot' },
    global: {
      plugins: [pinia, router, Antd, createDetailI18n()],
      stubs: { SmRichTextEditor: EditorStub },
    },
  });
  await settled(wrapper);
  return { wrapper, router };
}

function findModal(wrapper: VueWrapper, title: string) {
  const modals = wrapper.findAllComponents(Modal);
  const found = modals.find((modal) => modal.props('title') === title);
  expect(found?.exists()).toBe(true);
  return found!;
}

function findSelectByPlaceholder(wrapper: VueWrapper, placeholder: string) {
  const selects = wrapper.findAllComponents(Select);
  const found = selects.find((select) => select.props('placeholder') === placeholder);
  expect(found?.exists()).toBe(true);
  return found!;
}

describe('BotDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    permissionFixture = FULL_PERMISSIONS;
    botShouldFail = false;
    botUserOverrides = {};
    mechanismFixture = {
      authType: 'JWT',
      config: { JWTToken: 'jwt-token-value', JWTTokenExpiry: '7', JWTTokenExpiresAt: Date.now() + 86400000 },
    };
    featuresFixture = { featureLimitStatuses: [] };
    calls = [];
    botState = { ...BOT_FIXTURE };
    userState = botUserFixture();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/api/v1/permissions/bot/name/')) {
          return jsonResponse(permissionFixture);
        }
        if (url.includes('/api/v1/users/generateToken')) {
          return jsonResponse({ config: { JWTToken: 'new-token', JWTTokenExpiry: '30' } });
        }
        if (url.includes('/api/v1/users/revokeToken')) {
          return jsonResponse(userState);
        }
        if (url.includes('/api/v1/users/auth-mechanism/')) {
          return jsonResponse(mechanismFixture);
        }
        if (url.includes('/api/v1/users/name/')) {
          return jsonResponse(botUserFixture(botUserOverrides));
        }
        if (url.includes('/api/v1/roles/search')) {
          return jsonResponse(ROLES_FIXTURE);
        }
        if (url.includes('/api/v1/limits/features/bot')) {
          return jsonResponse(featuresFixture);
        }
        if (url.includes('/api/v1/bots/name/')) {
          if (botShouldFail) {
            return new Response('not found', { status: 404 });
          }
          return jsonResponse(botState);
        }
        if (url.includes('/api/v1/bots/') && init?.method === 'PATCH') {
          botState = applyPatch(botState, JSON.parse(String(init.body ?? '[]')) as Array<{ op: string; path: string; value?: unknown }>);
          return jsonResponse(botState);
        }
        if (url.includes('/api/v1/users/') && init?.method === 'PATCH') {
          userState = applyPatch(userState, JSON.parse(String(init.body ?? '[]')) as Array<{ op: string; path: string; value?: unknown }>);
          return jsonResponse(userState);
        }
        if (url.includes('/api/v1/bots/b1')) {
          return jsonResponse(botState);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the three panels with fetched data', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="left-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="center-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="right-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Ingest Bot');
    expect(wrapper.text()).toContain('Does things.');
    expect(wrapper.text()).toContain('DataSteward');
    expect(wrapper.text()).toContain('Catalog');
    expect(wrapper.text()).toContain('Token Security');
    expect(wrapper.text()).toContain('Tokens for iSmart are secured.');
    expect(wrapper.text()).toContain('Expires on');
    expect(document.title).toBe('Ingest Bot');
    const breadcrumb = wrapper.find('[data-testid="sm-breadcrumb"]');
    expect(breadcrumb.text()).toContain('Bots');
    expect(breadcrumb.text()).toContain('ingest-bot');
  });

  it('fetches permission, then bot, then bot user with the official params', async () => {
    await mountDetail();
    const permissionCall = calls.find((call) => call.url.includes('/api/v1/permissions/bot/name/ingest-bot'));
    expect(permissionCall).toBeDefined();
    const botCall = calls.find((call) => call.url.includes('/api/v1/bots/name/ingest-bot'));
    expect(botCall).toBeDefined();
    expect(new URL(botCall!.url, 'http://test.local').searchParams.get('include')).toBe('all');
    const userCall = calls.find((call) => call.url.includes('/api/v1/users/name/ingest-bot'));
    expect(userCall).toBeDefined();
    const userQuery = new URL(userCall!.url, 'http://test.local').searchParams;
    expect(userQuery.get('fields')).toBe('roles,profile');
    expect(userQuery.get('include')).toBe('all');
    expect(calls.indexOf(botCall!)).toBeLessThan(calls.indexOf(userCall!));
    expect(calls.some((call) => call.url.includes('/api/v1/roles/search'))).toBe(true);
  });

  it('renders the empty detail when an admin lacks the view permission', async () => {
    permissionFixture = NO_PERMISSIONS;
    const { wrapper } = await mountDetail();
    expect(calls.some((call) => call.url.includes('/api/v1/bots/name/'))).toBe(false);
    expect(wrapper.find('[data-testid="left-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Add Display Name');
    expect(document.title).toBe('Bot detail');
  });

  it('shows the error placeholder when the fetch fails', async () => {
    botShouldFail = true;
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper } = await mountDetail();
    expect(errorSpy).toHaveBeenCalled();
    expect(calls.some((call) => call.url.includes('/api/v1/users/name/'))).toBe(false);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('No Bots available with name');
    expect(wrapper.find('[data-testid="username"]').text()).toBe('ingest-bot');
  });

  it('shows the permission placeholder for non-admins after fetching', async () => {
    const { wrapper } = await mountDetail({ asAdmin: false });
    expect(calls.some((call) => call.url.includes('/api/v1/bots/name/'))).toBe(true);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('View Bot detail');
    expect(wrapper.find('[data-testid="left-panel"]').exists()).toBe(false);
  });

  it('edits the display name with a change-guarded PATCH', async () => {
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="edit-displayName"]').trigger('click');
    const input = wrapper.find('[data-testid="displayName"]');
    await input.setValue('Renamed Bot');
    await wrapper.find('[data-testid="save-displayName"]').trigger('click');
    await settled(wrapper);
    const patches = calls.filter((call) => call.url.includes('/api/v1/bots/b1') && call.init?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0].init?.body))).toEqual([
      { op: 'replace', path: '/displayName', value: 'Renamed Bot' },
    ]);
    expect(wrapper.text()).toContain('Renamed Bot');
  });

  it('saves nothing when the display name is unchanged and cancels on mousedown', async () => {
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="edit-displayName"]').trigger('click');
    await wrapper.find('[data-testid="save-displayName"]').trigger('click');
    await settled(wrapper);
    expect(calls.filter((call) => call.init?.method === 'PATCH')).toHaveLength(0);

    await wrapper.find('[data-testid="edit-displayName"]').trigger('click');
    const input = wrapper.find('[data-testid="displayName"]');
    await input.setValue('Discarded');
    await wrapper.find('[data-testid="cancel-displayName"]').trigger('mousedown');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="displayName"]').exists()).toBe(false);
    expect(calls.filter((call) => call.init?.method === 'PATCH')).toHaveLength(0);
  });

  it('edits the description through the modal and PATCHes on save', async () => {
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await wrapper.vm.$nextTick();
    const modal = findModal(wrapper, 'Edit Description for Ingest Bot');
    expect(modal.props('open')).toBe(true);
    const editor = wrapper.findComponent(EditorStub);
    expect(editor.props('initialValue')).toBe('Does **things**.');
    expect(editor.props('placeHolder')).toBe('Enter Description');
    await editor.vm.$emit('text-change', 'New description');
    await modal.vm.$emit('ok');
    await settled(wrapper);
    const patches = calls.filter((call) => call.url.includes('/api/v1/bots/b1') && call.init?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0].init?.body))).toEqual([
      { op: 'replace', path: '/description', value: 'New description' },
    ]);
  });

  it('hides edit affordances without edit permissions', async () => {
    permissionFixture = VIEW_ONLY_PERMISSIONS;
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="edit-displayName"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
  });

  it('saves roles with the admin pseudo-role filtered out and isAdmin set', async () => {
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="edit-roles"]').trigger('click');
    await wrapper.vm.$nextTick();
    const select = findSelectByPlaceholder(wrapper, 'Roles...');
    await select.vm.$emit('update:value', ['r3', 'admin']);
    await wrapper.find('[data-testid="save-roles"]').trigger('click');
    await settled(wrapper);
    const patches = calls.filter((call) => call.url.includes('/api/v1/users/u1') && call.init?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    const ops = JSON.parse(String(patches[0].init?.body)) as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(2);
    expect(ops).toContainEqual({ op: 'replace', path: '/isAdmin', value: true });
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/roles',
      value: [{ id: 'r3', type: 'role', name: 'Viewer' }],
    });
  });

  it('shows the Admin row and the empty roles text', async () => {
    botUserOverrides = { isAdmin: true, roles: [] };
    const { wrapper } = await mountDetail();
    expect(wrapper.text()).toContain('Admin');
    expect(wrapper.text()).not.toContain('No roles assigned');

    botUserOverrides = { isAdmin: false, roles: [], inheritedRoles: [] };
    const second = await mountDetail();
    expect(second.wrapper.text()).toContain('No roles assigned');
    expect(second.wrapper.text()).toContain('No inherited roles found');
  });

  it('shows the impersonation badge only when allowed', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="impersonation-enabled-badge"]').exists()).toBe(true);
    botUserOverrides = { allowImpersonation: false };
    const second = await mountDetail();
    expect(second.wrapper.find('[data-testid="impersonation-enabled-badge"]').exists()).toBe(false);
  });

  it('renders the three token expiry states', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="token-expiry"]').text()).toContain('Expires on');

    mechanismFixture = {
      authType: 'JWT',
      config: { JWTToken: 'old', JWTTokenExpiresAt: Date.now() - 1000 },
    };
    const expired = await mountDetail();
    expect(expired.wrapper.find('[data-testid="token-expiry"]').text()).toContain('Expired on');

    mechanismFixture = { authType: 'JWT', config: { JWTToken: 'noexp', JWTTokenExpiresAt: 0 } };
    const noExpiry = await mountDetail();
    const paragraph = noExpiry.wrapper.find('[data-testid="token-expiry"]');
    expect(paragraph.text()).toContain('This token has no expiration date.');
    expect(paragraph.find('svg').exists()).toBe(true);
  });

  it('copies the token to the clipboard', async () => {
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="copy-secret"]').trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('jwt-token-value');
  });

  it('shows the no-token state with a Generate button', async () => {
    mechanismFixture = { authType: 'JWT' };
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="no-token"]').text()).toBe('No token available');
    expect(wrapper.find('[data-testid="auth-mechanism"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="token"]').exists()).toBe(false);
  });

  it('generates a token via POST and displays the refetched mechanism', async () => {
    mechanismFixture = {};
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="auth-mechanism"]').trigger('click');
    await wrapper.vm.$nextTick();
    const mechanismSelect = findSelectByPlaceholder(wrapper, 'Select Auth Mechanism');
    expect(mechanismSelect.props('disabled')).toBe(true);
    expect(mechanismSelect.props('value')).toBe('JWT');
    const expirySelect = findSelectByPlaceholder(wrapper, 'Select Token Expiration');
    expect(expirySelect.props('value')).toBe('OneHour');
    // Cancel hides when the mechanism object is empty.
    expect(wrapper.find('[data-testid="cancel-edit"]').exists()).toBe(false);

    await expirySelect.vm.$emit('update:value', '30');
    mechanismFixture = {
      authType: 'JWT',
      config: { JWTToken: 'new-token', JWTTokenExpiry: '30', JWTTokenExpiresAt: Date.now() + 86400000 },
    };
    await wrapper.find('[data-testid="save-edit"]').trigger('click');
    await settled(wrapper);

    const generates = calls.filter((call) => call.url.includes('/api/v1/users/generateToken'));
    expect(generates).toHaveLength(1);
    expect(generates[0].init?.method).toBe('POST');
    expect(JSON.parse(String(generates[0].init?.body))).toEqual({ id: 'u1', JWTTokenExpiry: '30' });
    const tokenHost = wrapper.find('[data-testid="token"]');
    expect(tokenHost.exists()).toBe(true);
    const tokenInput =
      tokenHost.element.tagName === 'INPUT' ? tokenHost : tokenHost.find('input');
    expect((tokenInput.element as HTMLInputElement).value).toBe('new-token');
  });

  it('shows Cancel in the token form when the mechanism is non-empty', async () => {
    mechanismFixture = { authType: 'JWT', config: {} };
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="auth-mechanism"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="cancel-edit"]').exists()).toBe(true);
    await wrapper.find('[data-testid="cancel-edit"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="save-edit"]').exists()).toBe(false);
  });

  it('revokes via the confirm modal and switches to the form state', async () => {
    const { wrapper } = await mountDetail();
    await wrapper.find('[data-testid="revoke-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const modal = findModal(wrapper, 'Are you sure?');
    expect(modal.props('open')).toBe(true);
    await modal.vm.$emit('ok');
    await settled(wrapper);
    const revokes = calls.filter((call) => call.url.includes('/api/v1/users/revokeToken'));
    expect(revokes).toHaveLength(1);
    expect(revokes[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(revokes[0].init?.body))).toEqual({ id: 'u1' });
    expect(findModal(wrapper, 'Are you sure?').props('open')).toBe(false);
    expect(wrapper.find('[data-testid="save-edit"]').exists()).toBe(true);
  });

  it('keeps the loader and skips the mechanism fetch when the token field is disabled', async () => {
    featuresFixture = {
      featureLimitStatuses: [
        {
          name: 'bot',
          limitReached: false,
          currentCount: 0,
          configuredLimit: {
            name: 'bot',
            disableFields: ['token'],
            disabledFields: ['token'],
            limits: { softLimit: 0, hardLimit: 0 },
          },
        },
      ],
    };
    const { wrapper } = await mountDetail({ seedLimit: true });
    expect(calls.some((call) => call.url.includes('/api/v1/users/auth-mechanism/'))).toBe(false);
    expect(wrapper.find('[data-testid="token-card-loader"]').exists()).toBe(true);
  });

  it('resolves the FQN from the legacy id prop', async () => {
    const { wrapper } = await mountDetail({ props: { id: 'b1' } });
    expect(calls.some((call) => call.url.includes('/api/v1/bots/b1'))).toBe(true);
    expect(calls.some((call) => call.url.includes('/api/v1/permissions/bot/name/ingest-bot'))).toBe(true);
    expect(wrapper.text()).toContain('Ingest Bot');
  });
});
