<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Form,
  Input,
  Radio,
  Select,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { fetchAuthConfig } from '@/api/system';
import { createBot, getBotByName } from '@/api/bots';
import {
  createUser,
  createUserWithPut,
  generateRandomPassword,
  getJwtTokenExpiryOptions,
} from '@/api/users';
import { EMAIL_PATTERN, isValidPassword } from '@/auth/validation';
import { useDomainStore } from '@/stores/domain';
import { usePermissionStore } from '@/stores/permissions';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { AdminEntityRef, JwtTokenExpiry } from '@/types/admin';
import { getSettingPath } from '@/utils/fqnPaths';
import MembersDomainLabel from './MembersDomainLabel.vue';
import MembersEntityPicker from './MembersEntityPicker.vue';
import {
  buildCreateUserPayload,
  getTokenExpiryLabel,
  getUserCreationErrorKind,
  type CreateUserFormValues,
} from './userLogic';

/**
 * CreateUserPage + CreateUser equivalent (pin pages/CreateUserPage +
 * components/Settings/Users/CreateUser). Centred 800px card, page-
 * local 2-level slashed breadcrumb (no Settings root), page-local
 * InlineAlert for submit errors (never a global message), no name
 * input (the name derives from the email prefix).
 *
 * Branches: bot (route /create-user/bot) shows the token-expiry +
 * allow-impersonation fields and hides the whole !forceBot block;
 * the Admins entry (router state isAdminPage) presets isAdmin and
 * hides teams/roles/personas; the password section shows only for
 * Basic/LDAP providers. The isAdmin Toggle also clears isBot.
 *
 * Submit: bot → checkBotInUse pre-check (getBotByName try/catch),
 * then createUserWithPut (PUT, botName) + createBot, limit refresh,
 * success toast, navigate to the Bots settings page; non-bot →
 * createUser + limit refresh, no success toast, navigate back.
 * The limit refresh mirrors pin CreateUserPage.component.tsx:108/131
 * (`getResourceLimit('bot'|'user', true, true)` after a successful
 * create, inside the same try); the product equivalent is the
 * resource-agnostic shellConfig.refreshLimitConfig, which is
 * fail-open and never throws.
 *
 * Domains default to the active domain (pin CreateUser.component.tsx
 * :159/:170: form defaultValues carry activeDomainEntityRef), so a
 * bot payload carries the active domain FQN even though the domains
 * selector itself is hidden in the bot branch (pin :528 `!isBot`).
 *
 * Roles search adaptation: listRoles has no server search parameter
 * (api/roles.ts is outside 02 ownership); the picker filters the
 * limit-100 fetch client-side. Server-side role search is a
 * residual (see the batch report).
 */

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
const domainStore = useDomainStore();
const shellConfig = useShellConfigStore();

const forceBot = computed(
  () => route.params.bot === 'bot' || route.path === '/create-user/bot',
);
const isAdminPage = computed(() => {
  const state = window.history.state as { isAdminPage?: boolean } | null;
  return state?.isAdminPage === true;
});
const isAdminUser = computed(() => permissionStore.isAdminUser);

// --- Breadcrumb (3 branches, page-local) ---
const listCrumb = computed(() => {
  if (forceBot.value) {
    return { name: t('label.bot'), url: getSettingPath('bots') };
  }
  if (isAdminPage.value) {
    return { name: t('label.admin'), url: getSettingPath('members', 'admins') };
  }
  return { name: t('label.user'), url: getSettingPath('members', 'users') };
});

// --- Form state ---
const email = ref('');
const displayName = ref('');
const description = ref('');
const selectedTeamIds = ref<string[]>([]);
const selectedRoleIds = ref<string[]>([]);
const selectedPersonaIds = ref<string[]>([]);
const selectedDomains = ref<AdminEntityRef[]>([]);
const isAdmin = ref(false);
const isBot = ref(false);
const tokenExpiry = ref<JwtTokenExpiry | undefined>(undefined);
const allowImpersonation = ref(false);
const passwordGenerator = ref<'automatic' | 'manual'>('automatic');
const generatedPassword = ref('');
const password = ref('');
const confirmPassword = ref('');
const fieldErrors = ref<Record<string, string>>({});
const isLoading = ref(false);
const inlineAlert = ref<string | undefined>();

const teamPickerOpen = ref(false);
const rolePickerOpen = ref(false);
const personaPickerOpen = ref(false);

const isAuthProviderBasic = ref(false);

onMounted(async () => {
  isAdmin.value = isAdminPage.value;
  isBot.value = forceBot.value;
  // Pin CreateUser.component.tsx:170: domains default to the active
  // domain. Read once at mount like pin's form defaultValues; when the
  // domain store has not loaded yet there is no active domain and the
  // selection stays empty (same as pin's undefined default).
  const active = domainStore.activeDomain;
  if (active) {
    selectedDomains.value = [
      {
        id: active.id,
        name: active.name,
        fullyQualifiedName: active.fullyQualifiedName,
        type: 'domain',
      },
    ];
  }
  try {
    const config = await fetchAuthConfig();
    isAuthProviderBasic.value = config.provider === 'basic' || config.provider === 'ldap';
  } catch {
    isAuthProviderBasic.value = false;
  }
  if (!forceBot.value) {
    await regeneratePassword();
  }
});

async function regeneratePassword(): Promise<void> {
  try {
    generatedPassword.value = await generateRandomPassword();
  } catch {
    generatedPassword.value = '';
  }
}

function copyGeneratedPassword(): void {
  if (!generatedPassword.value) {
    return;
  }
  navigator.clipboard
    .writeText(generatedPassword.value)
    .then(() => {
      message.success(t('message.copied-to-clipboard'));
    })
    .catch(() => undefined);
}

function onAdminToggle(value: boolean): void {
  isAdmin.value = value;
  isBot.value = false;
}

// --- Validation (pin field rules) ---
function validate(): boolean {
  const errors: Record<string, string> = {};
  if (!email.value.trim()) {
    errors.email = t('label.field-required', { field: t('label.email') });
  } else if (!EMAIL_PATTERN.test(email.value.trim())) {
    errors.email = t('message.field-text-is-invalid', { fieldText: t('label.email') });
  }
  if (forceBot.value && !tokenExpiry.value) {
    errors.tokenExpiry = t('label.field-required', { field: t('label.token-expiration') });
  }
  if (!forceBot.value && isAuthProviderBasic.value && passwordGenerator.value === 'manual') {
    if (!password.value) {
      errors.password = t('label.field-required', { field: t('label.password') });
    } else if (!isValidPassword(password.value)) {
      errors.password = t('message.password-error-message');
    }
    if (password.value !== confirmPassword.value) {
      errors.confirmPassword = t('label.password-not-match');
    }
  }
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

// --- Submit ---
function goToUserListPage(): void {
  if (forceBot.value) {
    void router.push(getSettingPath('bots'));
  } else {
    router.back();
  }
}

async function checkBotInUse(name: string): Promise<boolean> {
  try {
    await getBotByName(name);
    return true;
  } catch {
    return false;
  }
}

function creationErrorMessage(error: unknown, entityKey: string, entityLowerKey: string): string {
  const input =
    error instanceof Error
      ? { message: error.message, status: (error as { status?: number }).status }
      : undefined;
  const kind = getUserCreationErrorKind(input);
  if (kind === 'email-already-exist') {
    return t('server.email-already-exist', {
      entity: t(entityKey),
      entityLowercase: t(entityLowerKey),
      entityName: email.value.split('@')[0],
    });
  }
  if (kind === 'entity-limit-reached') {
    return t('server.entity-limit-reached');
  }
  return t('server.create-entity-error', { entity: t(entityKey) });
}

async function handleSave(): Promise<void> {
  if (!validate()) {
    return;
  }
  const values: CreateUserFormValues = {
    email: email.value.trim(),
    displayName: displayName.value,
    description: description.value || undefined,
    roles: selectedRoleIds.value,
    teams: selectedTeamIds.value,
    personas: selectedPersonaIds.value,
    domains: selectedDomains.value.map(
      (domain) => domain.fullyQualifiedName ?? domain.name,
    ),
    isAdmin: isAdmin.value,
    isBot: isBot.value,
    passwordGenerator: passwordGenerator.value,
    generatedPassword: generatedPassword.value,
    password: password.value || undefined,
    confirmPassword: confirmPassword.value || undefined,
    tokenExpiry: tokenExpiry.value,
    allowImpersonation: allowImpersonation.value,
  };
  const payload = buildCreateUserPayload(values, {
    forceBot: forceBot.value,
    isAuthProviderBasic: isAuthProviderBasic.value,
  });
  const { allowImpersonation: impersonation, ...userPayload } = payload;
  isLoading.value = true;
  inlineAlert.value = undefined;
  try {
    if (forceBot.value) {
      const exists = await checkBotInUse(userPayload.name);
      if (exists) {
        message.error(
          t('server.email-already-exist', {
            entity: t('label.bot-lowercase'),
            name: userPayload.name,
          }),
        );
        return;
      }
      const userResponse = await createUserWithPut({
        ...userPayload,
        botName: userPayload.name,
      });
      await createBot({
        botUser: userResponse.fullyQualifiedName ?? userResponse.name,
        name: userResponse.name,
        displayName: userResponse.displayName,
        description: userResponse.description,
        allowImpersonation: impersonation,
      });
      // Pin CreateUserPage.component.tsx:107-108: refresh the limit
      // counts after a successful create, before the toast/navigate.
      await shellConfig.refreshLimitConfig();
      message.success(t('server.create-entity-success', { entity: t('label.bot') }));
      goToUserListPage();
    } else {
      await createUser(userPayload);
      // Pin CreateUserPage.component.tsx:130-131: same refresh for users.
      await shellConfig.refreshLimitConfig();
      goToUserListPage();
    }
  } catch (error) {
    inlineAlert.value = forceBot.value
      ? creationErrorMessage(error, 'label.bot', 'label.bot-lowercase')
      : creationErrorMessage(error, 'label.user', 'label.user-lowercase');
  } finally {
    isLoading.value = false;
  }
}

const expiryOptions = computed(() => getJwtTokenExpiryOptions(false));
</script>

<template>
  <div class="create-user">
    <Breadcrumb data-testid="create-user-breadcrumb">
      <Breadcrumb.Item>
        <RouterLink :to="listCrumb.url">{{ listCrumb.name }}</RouterLink>
      </Breadcrumb.Item>
      <Breadcrumb.Item>{{ t('label.create') }} {{ listCrumb.name }}</Breadcrumb.Item>
    </Breadcrumb>
    <Typography.Title :level="3">
      {{ t('label.create-entity', { entity: t('label.user') }) }}
    </Typography.Title>
    <Card class="create-user__card">
      <Alert
        v-if="inlineAlert"
        type="error"
        closable
        :message="t('label.error')"
        :description="inlineAlert"
        data-testid="create-user-inline-alert"
        style="margin-bottom: 16px"
        @close="inlineAlert = undefined"
      />
      <Form layout="vertical" @submit.prevent="handleSave">
        <Form.Item
          :label="t('label.email')"
          required
          :validate-status="fieldErrors.email ? 'error' : undefined"
          :help="fieldErrors.email"
        >
          <Input
            v-model:value="email"
            :placeholder="t('label.email')"
            data-testid="email"
          />
        </Form.Item>
        <Form.Item :label="t('label.display-name')">
          <Input
            v-model:value="displayName"
            :placeholder="t('label.display-name')"
            data-testid="displayName"
          />
        </Form.Item>
        <template v-if="forceBot">
          <Form.Item
            :label="t('label.token-expiration')"
            required
            :validate-status="fieldErrors.tokenExpiry ? 'error' : undefined"
            :help="fieldErrors.tokenExpiry"
          >
            <Select v-model:value="tokenExpiry" style="width: 100%">
              <Select.Option
                v-for="option in expiryOptions"
                :key="option"
                :value="option"
              >
                {{ getTokenExpiryLabel(option, (key, params) => t(key, params ?? {})) }}
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item v-if="isAdminUser" :label="t('label.allow-impersonation')">
            <Switch v-model:checked="allowImpersonation" />
          </Form.Item>
        </template>
        <Form.Item :label="t('label.description')">
          <SmRichTextEditor
            :initial-value="description"
            data-testid="description"
            @text-change="description = $event"
          />
        </Form.Item>
        <template v-if="!forceBot">
          <template v-if="!isAdminPage">
            <Form.Item :label="t('label.team-plural')">
              <Button data-testid="select-teams-button" @click="teamPickerOpen = true">
                {{
                  t('label.please-select-entity', { entity: t('label.team-plural') })
                }}
                <span v-if="selectedTeamIds.length">({{ selectedTeamIds.length }})</span>
              </Button>
            </Form.Item>
            <Form.Item :label="t('label.role-plural')">
              <Button data-testid="select-roles-button" @click="rolePickerOpen = true">
                {{
                  t('label.please-select-entity', { entity: t('label.role-plural') })
                }}
                <span v-if="selectedRoleIds.length">({{ selectedRoleIds.length }})</span>
              </Button>
            </Form.Item>
            <Form.Item :label="t('label.persona-plural')">
              <Button data-testid="select-personas-button" @click="personaPickerOpen = true">
                {{
                  t('label.please-select-entity', { entity: t('label.persona-plural') })
                }}
                <span v-if="selectedPersonaIds.length">({{ selectedPersonaIds.length }})</span>
              </Button>
            </Form.Item>
          </template>
          <Form.Item :label="t('label.admin')">
            <Switch :checked="isAdmin" @change="onAdminToggle(Boolean($event))" />
          </Form.Item>
          <Form.Item :label="t('label.domain-plural')">
            <MembersDomainLabel
              :domains="selectedDomains"
              can-edit
              @save="(_ids, options) => { selectedDomains = options.map((o) => ({ id: o.id, name: o.name ?? '', fullyQualifiedName: o.fullyQualifiedName, type: 'domain' })); }"
            />
          </Form.Item>
          <template v-if="isAuthProviderBasic">
            <Form.Item :label="t('label.password')">
              <Radio.Group v-model:value="passwordGenerator">
                <Radio value="automatic">{{ t('label.automatically-generate') }}</Radio>
                <Radio value="manual">{{
                  t('label.password-type', { type: t('label.create') })
                }}</Radio>
              </Radio.Group>
            </Form.Item>
            <template v-if="passwordGenerator === 'automatic'">
              <Form.Item :label="t('label.password-type', { type: t('label.generate') })">
                <Input :value="generatedPassword" readonly>
                  <template #suffix>
                    <Tooltip :title="t('label.regenerate')">
                      <Button
                        type="text"
                        size="small"
                        :aria-label="t('label.regenerate')"
                        @click="regeneratePassword"
                      >
                        <ReloadOutlined />
                      </Button>
                    </Tooltip>
                    <Tooltip :title="t('label.copy')">
                      <Button
                        type="text"
                        size="small"
                        :aria-label="t('label.copy')"
                        @click="copyGeneratedPassword"
                      >
                        <CopyOutlined />
                      </Button>
                    </Tooltip>
                  </template>
                </Input>
              </Form.Item>
            </template>
            <template v-else>
              <Form.Item
                :label="t('label.password')"
                :validate-status="fieldErrors.password ? 'error' : undefined"
                :help="fieldErrors.password"
              >
                <Input.Password
                  v-model:value="password"
                  :placeholder="t('label.password-type', { type: t('label.enter') })"
                  autocomplete="new-password"
                />
              </Form.Item>
              <Form.Item
                :label="t('label.password-type', { type: t('label.confirm') })"
                :validate-status="fieldErrors.confirmPassword ? 'error' : undefined"
                :help="fieldErrors.confirmPassword"
              >
                <Input.Password
                  v-model:value="confirmPassword"
                  :placeholder="t('label.password-type', { type: t('label.confirm') })"
                  autocomplete="new-password"
                />
              </Form.Item>
            </template>
          </template>
        </template>
        <div class="create-user__actions">
          <Button data-testid="cancel-user" @click="goToUserListPage">
            {{ t('label.cancel') }}
          </Button>
          <Button type="primary" :loading="isLoading" html-type="submit">
            {{ t('label.create') }}
          </Button>
        </div>
      </Form>
    </Card>

    <MembersEntityPicker
      :open="teamPickerOpen"
      kind="team"
      multiple
      :selected-ids="selectedTeamIds"
      :title="t('label.team-plural')"
      @cancel="teamPickerOpen = false"
      @save="(ids) => { selectedTeamIds = ids; teamPickerOpen = false; }"
    />
    <MembersEntityPicker
      :open="rolePickerOpen"
      kind="role"
      multiple
      :selected-ids="selectedRoleIds"
      :title="t('label.role-plural')"
      @cancel="rolePickerOpen = false"
      @save="(ids) => { selectedRoleIds = ids; rolePickerOpen = false; }"
    />
    <MembersEntityPicker
      :open="personaPickerOpen"
      kind="persona"
      multiple
      :selected-ids="selectedPersonaIds"
      :title="t('label.persona-plural')"
      @cancel="personaPickerOpen = false"
      @save="(ids) => { selectedPersonaIds = ids; personaPickerOpen = false; }"
    />
  </div>
</template>

<style scoped>
.create-user__card {
  width: 800px;
  max-width: 100%;
  margin: 0 auto;
}
.create-user__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
