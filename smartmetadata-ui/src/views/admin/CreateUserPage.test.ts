/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { message, Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import CreateUserPage from './CreateUserPage.vue';
import { useDomainStore } from '@/stores/domain';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { Domain } from '@/types/governance';
import { getSettingPath } from '@/utils/fqnPaths';

const routeState = vi.hoisted(() => ({ params: {} as Record<string, string>, path: '/create-user' }));
const pushMock = vi.hoisted(() => vi.fn());
const backMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock, back: backMock }),
}));

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return { ...actual, fetchAuthConfig: vi.fn() };
});

vi.mock('@/api/bots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/bots')>();
  return { ...actual, getBotByName: vi.fn(), createBot: vi.fn() };
});

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>();
  return {
    ...actual,
    createUser: vi.fn(),
    createUserWithPut: vi.fn(),
    generateRandomPassword: vi.fn(),
    getJwtTokenExpiryOptions: vi.fn(),
  };
});

import { fetchAuthConfig } from '@/api/system';
import { createBot, getBotByName } from '@/api/bots';
import {
  createUser,
  createUserWithPut,
  generateRandomPassword,
  getJwtTokenExpiryOptions,
} from '@/api/users';

const fetchAuthConfigMock = fetchAuthConfig as unknown as ReturnType<typeof vi.fn>;
const getBotByNameMock = getBotByName as unknown as ReturnType<typeof vi.fn>;
const createBotMock = createBot as unknown as ReturnType<typeof vi.fn>;
const createUserMock = createUser as unknown as ReturnType<typeof vi.fn>;
const createUserWithPutMock = createUserWithPut as unknown as ReturnType<typeof vi.fn>;
const generateRandomPasswordMock = generateRandomPassword as unknown as ReturnType<typeof vi.fn>;
const getJwtTokenExpiryOptionsMock = getJwtTokenExpiryOptions as unknown as ReturnType<
  typeof vi.fn
>;

const DOMAIN_FIXTURE: Domain = {
  id: 'd1',
  name: 'Sales',
  fullyQualifiedName: 'Sales',
  domainType: 'Aggregate',
  owners: [],
  experts: [],
  tags: [],
};

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      label: {
        bot: 'Bot',
        'bot-lowercase': 'bot',
        user: 'User',
        'user-lowercase': 'user',
        admin: 'Admin',
        create: 'Create',
        'create-entity': 'Create {entity}',
        email: 'Email',
        'display-name': 'Display Name',
        description: 'Description',
        'token-expiration': 'Token Expiration',
        'allow-impersonation': 'Allow Impersonation',
        'team-plural': 'Teams',
        'role-plural': 'Roles',
        'persona-plural': 'Personas',
        'domain-plural': 'Domains',
        password: 'Password',
        'automatically-generate': 'Automatically generate',
        'password-type': '{type} password',
        generate: 'Generate',
        regenerate: 'Regenerate',
        copy: 'Copy',
        cancel: 'Cancel',
        error: 'Error',
        'field-required': '{field} is required',
        'please-select-entity': 'Please select {entity}',
      },
      message: {
        'field-text-is-invalid': '{fieldText} is invalid',
        'password-error-message': 'Password is invalid',
        'password-not-match': 'Passwords do not match',
        'copied-to-clipboard': 'Copied',
      },
      server: {
        'email-already-exist': '{entity} already exists',
        'entity-limit-reached': 'Limit reached',
        'create-entity-error': 'Failed to create {entity}',
        'create-entity-success': '{entity} created',
      },
    },
  },
});

function mountPage(options: { bot: boolean; activeDomain: boolean }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  routeState.params = options.bot ? { bot: 'bot' } : {};
  routeState.path = options.bot ? '/create-user/bot' : '/create-user';
  if (options.activeDomain) {
    // Mutator-form $patch: the object form's DeepPartial cannot type
    // the Domain `extension` index signature.
    useDomainStore().$patch((state) => {
      state.domains = [DOMAIN_FIXTURE];
      state.activeDomainId = 'd1';
    });
  }
  const refreshSpy = vi
    .spyOn(useShellConfigStore(), 'refreshLimitConfig')
    .mockResolvedValue(undefined);
  const wrapper = mount(CreateUserPage, {
    global: {
      plugins: [i18n, pinia],
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        SmRichTextEditor: {
          props: ['initialValue'],
          template: '<div />',
        },
        MembersEntityPicker: {
          props: ['open', 'kind', 'multiple', 'selectedIds', 'title'],
          template: '<div />',
        },
        MembersDomainLabel: {
          props: ['domains', 'canEdit'],
          template:
            '<div data-testid="domain-label">{{ domains.map((d) => d.fullyQualifiedName ?? d.name).join(",") }}</div>',
        },
      },
    },
  });
  return { wrapper, refreshSpy };
}

async function fillEmail(wrapper: ReturnType<typeof mountPage>['wrapper'], value: string) {
  await wrapper.find('[data-testid="email"]').setValue(value);
  await flushPromises();
}

async function submit(wrapper: ReturnType<typeof mountPage>['wrapper']) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('CreateUserPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
    backMock.mockReset();
    fetchAuthConfigMock.mockReset();
    getBotByNameMock.mockReset();
    createBotMock.mockReset();
    createUserMock.mockReset();
    createUserWithPutMock.mockReset();
    generateRandomPasswordMock.mockReset();
    getJwtTokenExpiryOptionsMock.mockReset();
    fetchAuthConfigMock.mockResolvedValue({ provider: 'basic' });
    generateRandomPasswordMock.mockResolvedValue('generated-pw');
    getJwtTokenExpiryOptionsMock.mockReturnValue(['30']);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  it('creates a bot carrying the active domain FQN and refreshes limits', async () => {
    getBotByNameMock.mockRejectedValue(new Error('not found'));
    createUserWithPutMock.mockResolvedValue({
      name: 'jdoe',
      fullyQualifiedName: 'jdoe',
      displayName: 'John',
      description: undefined,
    });
    createBotMock.mockResolvedValue({});
    const { wrapper, refreshSpy } = mountPage({ bot: true, activeDomain: true });
    await flushPromises();
    await fillEmail(wrapper, 'jdoe@example.com');
    await wrapper.find('[data-testid="displayName"]').setValue('John');
    await wrapper.findComponent(Select).vm.$emit('update:value', '30');
    await flushPromises();
    await submit(wrapper);

    expect(createUserWithPutMock).toHaveBeenCalledTimes(1);
    expect(createUserWithPutMock).toHaveBeenCalledWith({
      name: 'jdoe',
      email: 'jdoe@example.com',
      displayName: 'John',
      description: undefined,
      roles: [],
      teams: undefined,
      personas: [],
      domains: ['Sales'],
      isAdmin: false,
      isBot: true,
      botName: 'jdoe',
      authenticationMechanism: { authType: 'JWT', config: { JWTTokenExpiry: '30' } },
    });
    expect(createBotMock).toHaveBeenCalledWith({
      botUser: 'jdoe',
      name: 'jdoe',
      displayName: 'John',
      description: undefined,
      allowImpersonation: false,
    });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(message.success).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith(getSettingPath('bots'));
    expect(backMock).not.toHaveBeenCalled();
  });

  it('sends no domains for a bot when no domain is active', async () => {
    getBotByNameMock.mockRejectedValue(new Error('not found'));
    createUserWithPutMock.mockResolvedValue({ name: 'jdoe', fullyQualifiedName: 'jdoe' });
    createBotMock.mockResolvedValue({});
    const { wrapper } = mountPage({ bot: true, activeDomain: false });
    await flushPromises();
    await fillEmail(wrapper, 'jdoe@example.com');
    await wrapper.findComponent(Select).vm.$emit('update:value', '30');
    await flushPromises();
    await submit(wrapper);

    expect(createUserWithPutMock).toHaveBeenCalledWith(
      expect.objectContaining({ domains: undefined }),
    );
  });

  it('shows an error toast and creates nothing when the bot already exists', async () => {
    getBotByNameMock.mockResolvedValue({ name: 'jdoe' });
    const { wrapper, refreshSpy } = mountPage({ bot: true, activeDomain: true });
    await flushPromises();
    await fillEmail(wrapper, 'jdoe@example.com');
    await wrapper.findComponent(Select).vm.$emit('update:value', '30');
    await flushPromises();
    await submit(wrapper);

    expect(message.error).toHaveBeenCalled();
    expect(createUserWithPutMock).not.toHaveBeenCalled();
    expect(createBotMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('blocks a bot save without a token expiry', async () => {
    const { wrapper, refreshSpy } = mountPage({ bot: true, activeDomain: false });
    await flushPromises();
    await fillEmail(wrapper, 'jdoe@example.com');
    await submit(wrapper);

    expect(createUserWithPutMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Token Expiration is required');
  });

  it('creates a user with the prefilled domain, refreshes limits, and goes back', async () => {
    createUserMock.mockResolvedValue({});
    const { wrapper, refreshSpy } = mountPage({ bot: false, activeDomain: true });
    await flushPromises();
    // The active domain is prefilled and displayed in the domains field.
    expect(wrapper.find('[data-testid="domain-label"]').text()).toBe('Sales');
    await fillEmail(wrapper, 'jane@example.com');
    await wrapper.find('[data-testid="displayName"]').setValue('Jane');
    await submit(wrapper);

    expect(createUserMock).toHaveBeenCalledTimes(1);
    expect(createUserMock).toHaveBeenCalledWith({
      name: 'jane',
      email: 'jane@example.com',
      displayName: 'Jane',
      description: undefined,
      roles: [],
      teams: undefined,
      personas: [],
      domains: ['Sales'],
      isAdmin: false,
      isBot: false,
      password: 'generated-pw',
      confirmPassword: 'generated-pw',
      createPasswordType: 'ADMIN_CREATE',
    });
    expect(createUserWithPutMock).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(message.success).not.toHaveBeenCalled();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows the inline alert and skips the limit refresh when user creation fails', async () => {
    createUserMock.mockRejectedValue(new Error('boom'));
    const { wrapper, refreshSpy } = mountPage({ bot: false, activeDomain: false });
    await flushPromises();
    await fillEmail(wrapper, 'jane@example.com');
    await submit(wrapper);

    const alert = wrapper.find('[data-testid="create-user-inline-alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Failed to create User');
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it('blocks save on an empty email', async () => {
    const { wrapper, refreshSpy } = mountPage({ bot: false, activeDomain: false });
    await flushPromises();
    await submit(wrapper);

    expect(createUserMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Email is required');
  });
});
