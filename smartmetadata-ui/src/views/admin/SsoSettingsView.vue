<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Checkbox, Form, Input, Radio, Select, Spin, Tabs, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { setFieldPatch } from '@/admin/jsonPatch';
import {
  applySecurityFieldErrors,
  buildCandidateConfiguration,
  carriesOidcSecret,
  clearFieldErrorForKey,
  firstErrorControlKey,
  FORM_FIELD_ORDER,
  storedAcceptsOidcSecret,
} from '@/admin/ssoConfiguration';
import { requiresTestLogin } from '@/admin/ssoTestLogin';
import { ApiError } from '@/api/client';
import {
  getSecurityConfigurationDocument,
  getSettingsSource,
  mapSsoAuthConfiguration,
  parseSecurityValidationResponse,
  patchSecurityConfiguration,
  validateSecurityConfiguration,
  type SecurityConfigurationDocument,
  type SecurityFieldError,
  type SsoAuthConfiguration,
} from '@/api/system';
import {
  testLoginErrorText,
  useSsoTestLogin,
  type ConfigurationCheckOutcome,
} from '@/composables/useSsoTestLogin';
import SsoTestLoginModal from './SsoTestLoginModal.vue';

/**
 * Official SettingsSso, configuration page only (the login chain itself
 * is untouched). Overview tab shows the loaded configuration; the
 * configuration tab edits it through the official save path: JSON Patch
 * on the whole SecurityConfiguration document at
 * /v1/system/security/config (securityConfigAPI.patchSecurityConfiguration,
 * paths rooted at /authenticationConfiguration/...). An empty secret
 * sends no op, so the server keeps its masked stored value. Fields the
 * deployment owns (GET /v1/system/settings/source) are locked in the form
 * and never sent, so a stale form cannot produce a 409. A save-time 400
 * reports its errors back onto the fields they name (or a problems list
 * for paths with no control), and edits that change how users sign in
 * stay gated behind a passing Test Login until the admin either passes
 * one or explicitly saves anyway.
 */
const { t } = useI18n();

const SSO_PROVIDERS = [
  'basic',
  'azure',
  'google',
  'okta',
  'auth0',
  'aws-cognito',
  'custom-oidc',
  'ldap',
  'saml',
  'openmetadata',
] as const;

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const loaded = ref<SsoAuthConfiguration | undefined>();
const authEditable = ref(true);
const authManagedPaths = ref<string[]>([]);

/** True when the deployment owns this auth field (relative pointer, e.g. /provider). */
function isManagedField(field: string): boolean {
  return !authEditable.value || authManagedPaths.value.includes(`/${field}`);
}

const hasManagedFields = computed(() => !authEditable.value || authManagedPaths.value.length > 0);
const form = reactive({
  provider: 'basic',
  providerName: '',
  clientType: '',
  authority: '',
  clientId: '',
  clientSecret: '',
  callbackUrl: '',
  enableSelfSignup: false,
});
const activeTab = ref('overview');

const providerOptions = SSO_PROVIDERS.map((provider) => ({
  value: provider,
  label: t(`sso.providers.${provider}`),
}));
const clientTypeOptions = [
  { value: 'public', label: t('sso.clientTypes.public') },
  { value: 'confidential', label: t('sso.clientTypes.confidential') },
];
const showProviderName = computed(() => form.provider === 'custom-oidc');

/** The stored document as loaded, never mutated: the diff base for save, candidate, and gate. */
const rawDocument = ref<SecurityConfigurationDocument | undefined>();

/** Validation errors keyed by form field, plus the problems list for paths with no control. */
const fieldErrors = reactive<Record<string, string>>({});
const validationProblems = ref<string[]>([]);
const formRef = ref<InstanceType<typeof Form> | null>(null);

function clearAllValidation(): void {
  for (const key of Object.keys(fieldErrors)) {
    delete fieldErrors[key];
  }
  validationProblems.value = [];
}

async function scrollToFirstError(): Promise<void> {
  await nextTick();
  const key = firstErrorControlKey(fieldErrors, validationProblems.value, FORM_FIELD_ORDER);
  if (!key) {
    return;
  }
  const root = formRef.value?.$el as HTMLElement | undefined;
  if (!root) {
    return;
  }
  const target =
    key === 'problems'
      ? root.querySelector('[data-testid="sso-validation-problems"]')
      : root.querySelector('.ant-form-item-has-error');
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

function reportValidationErrors(errors: SecurityFieldError[]): void {
  const applied = applySecurityFieldErrors(errors);
  Object.assign(fieldErrors, applied.fieldErrors);
  validationProblems.value = applied.problems;
  void scrollToFirstError();
}

// Editing a field clears only that field's error: the admin has seen it,
// and the next save or check re-reports whatever is still wrong. The
// problems list is not cleared on edit — it names paths with no control.
for (const key of [
  'provider',
  'providerName',
  'clientType',
  'authority',
  'clientId',
  'callbackUrl',
  'enableSelfSignup',
] as const) {
  watch(
    () => form[key],
    () => clearFieldErrorForKey(fieldErrors, key),
  );
}

const managedInfo = computed(() => ({
  authenticationEditable: authEditable.value,
  authenticationManagedPaths: authManagedPaths.value,
}));

/**
 * The candidate the form describes, shared by the gate and Test Login so
 * the configuration that passes the test is the configuration the gate
 * unlocks. The empty document stands in before the first load finishes.
 */
const EMPTY_DOCUMENT: SecurityConfigurationDocument = {
  authenticationConfiguration: {},
  authorizerConfiguration: {},
};
const candidate = computed(() =>
  buildCandidateConfiguration(
    rawDocument.value ?? EMPTY_DOCUMENT,
    form,
    managedInfo.value,
    form.clientSecret,
  ),
);

const {
  isTesting: isTestingLogin,
  isAwaitingCredentials: isAwaitingCredentialsLogin,
  configurationCheck: testLoginCheck,
  result: testLoginResult,
  error: testLoginError,
  runTestLogin,
  submitCredentials: submitTestLoginCredentials,
  reset: resetTestLogin,
} = useSsoTestLogin();

const showTestLoginModal = ref(false);
/** The candidate content a Test Login passed for; a pass binds to content, not to the attempt. */
const passedTestLoginKey = ref<string | undefined>();
const testedPayloadKeyRef = ref<string | undefined>();

watch(testLoginResult, (next) => {
  if (next?.status === 'success' && testedPayloadKeyRef.value) {
    passedTestLoginKey.value = testedPayloadKeyRef.value;
  }
});

const canTestLogin = computed(() => !!form.provider && form.provider !== 'basic');
const hasExistingConfig = computed(() => {
  const provider = rawDocument.value?.authenticationConfiguration.provider;
  return typeof provider === 'string' && provider !== 'basic';
});
const isSaveGatedOnTestLogin = computed(() => {
  if (!canTestLogin.value) {
    return false;
  }
  return (
    requiresTestLogin(rawDocument.value, candidate.value) &&
    passedTestLoginKey.value !== JSON.stringify(candidate.value)
  );
});
const testLoginGateMessage = computed(() =>
  hasExistingConfig.value
    ? t('sso.testLogin.requiredForEdit')
    : t('sso.testLogin.requiredBeforeSave'),
);

async function checkConfiguration(
  candidateToCheck: SecurityConfigurationDocument,
): Promise<ConfigurationCheckOutcome> {
  clearAllValidation();
  try {
    const response = await validateSecurityConfiguration(candidateToCheck);
    const errors = response.errors ?? [];
    const passed = errors.length === 0 && response.status === 'success';
    if (!passed) {
      reportValidationErrors(errors);
    }
    return { passed, problems: errors.map((entry) => entry.error) };
  } catch (error) {
    if (error instanceof ApiError) {
      const errors = parseSecurityValidationResponse(error.body);
      if (errors.length > 0) {
        reportValidationErrors(errors);
        return { passed: false, problems: errors.map((entry) => entry.error) };
      }
    }
    return { passed: false, problems: [testLoginErrorText(error, t('sso.testLogin.error'))] };
  }
}

function handleTestLogin(): void {
  testedPayloadKeyRef.value = JSON.stringify(candidate.value);
  resetTestLogin();
  showTestLoginModal.value = true;
  void runTestLogin(candidate.value, checkConfiguration);
}

function closeTestLoginModal(): void {
  resetTestLogin();
  showTestLoginModal.value = false;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const document = await getSecurityConfigurationDocument();
    rawDocument.value = document;
    loaded.value = mapSsoAuthConfiguration(document.authenticationConfiguration);
    // Deployment-ownership is best-effort: a failed source read leaves the
    // form unlocked, and the server's 409 remains the final guard.
    try {
      const source = await getSettingsSource();
      authEditable.value = source.authenticationEditable;
      authManagedPaths.value = source.authenticationManagedPaths;
    } catch {
      authEditable.value = true;
      authManagedPaths.value = [];
    }
    const auth = loaded.value ?? {};
    form.provider = auth.provider ?? 'basic';
    form.providerName = auth.providerName ?? '';
    form.clientType = auth.clientType ?? '';
    form.authority = auth.authority ?? '';
    form.clientId = auth.clientId ?? '';
    form.clientSecret = '';
    form.callbackUrl = auth.callbackUrl ?? '';
    form.enableSelfSignup = auth.enableSelfSignup ?? false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('sso.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  clearAllValidation();
  try {
    // A typed secret the PATCH cannot carry must never save silently
    // under the stored secret while the gate proved the new one: when
    // the stored document cannot accept the secret op, refuse visibly
    // instead of sending a patch that stores something other than what
    // was tested. Clearing the secret saves the other changes.
    // ADR:2026-11-18-sso-candidate-secret-mapping.
    if (
      form.clientSecret &&
      carriesOidcSecret(form.provider, form.clientType) &&
      !storedAcceptsOidcSecret(rawDocument.value ?? EMPTY_DOCUMENT)
    ) {
      message.error(t('sso.secretSaveBlocked'));
      return;
    }
    const current = loaded.value ?? {};
    const ops: { op: 'add' | 'remove' | 'replace'; path: string; value?: unknown }[] = [];
    // Managed fields send no op at all: pinning them to the saved value
    // would still write a deployment-owned field back. Unmanaged fields
    // send an op only when changed, matching official's diff-then-patch.
    const pushField = (field: string, saved: unknown, next: unknown): void => {
      if (!isManagedField(field) && next !== saved) {
        ops.push(...setFieldPatch(`/authenticationConfiguration/${field}`, saved, next));
      }
    };
    pushField('provider', current.provider, form.provider);
    pushField('clientType', current.clientType, form.clientType || undefined);
    if (showProviderName.value) {
      pushField('providerName', current.providerName, form.providerName || undefined);
    }
    pushField('authority', current.authority, form.authority || undefined);
    pushField('clientId', current.clientId, form.clientId || undefined);
    pushField('callbackUrl', current.callbackUrl, form.callbackUrl || undefined);
    pushField('enableSelfSignup', current.enableSelfSignup, form.enableSelfSignup);
    // The secret op lands on the oidcConfiguration block, and only when
    // the server can accept it: a leaf add the patch filter would drop
    // or JSON Patch would reject must never be sent. 'add' is used
    // because RFC 6902 'add' replaces an existing member, so it works
    // for first-time and rotation alike; an empty secret sends no op,
    // so the server keeps its masked stored value.
    // ADR:2026-11-18-sso-candidate-secret-mapping.
    if (
      form.clientSecret &&
      carriesOidcSecret(form.provider, form.clientType) &&
      !isManagedField('oidcConfiguration/secret') &&
      storedAcceptsOidcSecret(rawDocument.value ?? EMPTY_DOCUMENT)
    ) {
      ops.push({ op: 'add', path: '/authenticationConfiguration/oidcConfiguration/secret', value: form.clientSecret });
    }
    if (ops.length > 0) {
      await patchSecurityConfiguration(ops);
    }
    message.success(t('sso.saved'));
    await load();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) {
        const errors = parseSecurityValidationResponse(error.body);
        if (errors.length > 0) {
          reportValidationErrors(errors);
        } else {
          message.error(t('sso.saveFailed'));
        }
      } else if (error.status === 409) {
        message.error(t('sso.saveManagedConflict'));
      } else if (error.status === 412) {
        message.error(t('sso.saveConflictRetry'));
        await load();
      } else {
        message.error(error.message || t('sso.saveFailed'));
      }
    } else {
      message.error(error instanceof Error ? error.message : t('sso.saveFailed'));
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout test-id="sso-settings-layout">
    <PageHeader :header="t('sso.title')" :sub-header="t('sso.lead')" />
    <Spin :spinning="loading">
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="sso-state"
        :error-text="errorMessage"
        show-retry
        @retry="load"
      />
      <Tabs v-else v-model:active-key="activeTab">
        <Tabs.TabPane key="overview" :tab="t('sso.overview')">
          <dl class="sso__facts">
            <div>
              <dt>{{ t('sso.currentProvider') }}</dt>
              <dd data-testid="sso-current-provider">{{ loaded?.provider ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sso.clientType') }}</dt>
              <dd>{{ loaded?.clientType ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sso.selfSignup') }}</dt>
              <dd>{{ loaded?.enableSelfSignup ? t('crud.yes') : t('crud.no') }}</dd>
            </div>
            <div>
              <dt>{{ t('sso.callbackUrl') }}</dt>
              <dd>{{ loaded?.callbackUrl ?? '—' }}</dd>
            </div>
          </dl>
        </Tabs.TabPane>
        <Tabs.TabPane key="configuration" :tab="t('sso.configuration')">
          <Form ref="formRef" layout="vertical" class="sso__form">
            <p v-if="hasManagedFields" data-testid="sso-managed-note">{{ t('sso.managedNote') }}</p>
            <Alert
              v-if="validationProblems.length > 0"
              type="error"
              show-icon
              data-testid="sso-validation-problems"
            >
              <template #description>
                <div v-for="problem in validationProblems" :key="problem">{{ problem }}</div>
              </template>
            </Alert>
            <Form.Item :label="t('sso.provider')" :validate-status="fieldErrors.provider ? 'error' : ''" :help="fieldErrors.provider">
              <Radio.Group v-model:value="form.provider" data-testid="sso-provider-group" :options="providerOptions" :disabled="isManagedField('provider')" />
            </Form.Item>
            <Form.Item v-if="showProviderName" :label="t('sso.providerName')" :validate-status="fieldErrors.providerName ? 'error' : ''" :help="fieldErrors.providerName">
              <Input v-model:value="form.providerName" data-testid="sso-provider-name" :disabled="isManagedField('providerName')" />
            </Form.Item>
            <Form.Item :label="t('sso.clientType')" :validate-status="fieldErrors.clientType ? 'error' : ''" :help="fieldErrors.clientType">
              <Select v-model:value="form.clientType" data-testid="sso-client-type" :options="clientTypeOptions" allow-clear :disabled="isManagedField('clientType')" />
            </Form.Item>
            <Form.Item :label="t('sso.authority')" :validate-status="fieldErrors.authority ? 'error' : ''" :help="fieldErrors.authority">
              <Input v-model:value="form.authority" data-testid="sso-authority" :disabled="isManagedField('authority')" />
            </Form.Item>
            <Form.Item :label="t('sso.clientId')" :validate-status="fieldErrors.clientId ? 'error' : ''" :help="fieldErrors.clientId">
              <Input v-model:value="form.clientId" data-testid="sso-client-id" :disabled="isManagedField('clientId')" />
            </Form.Item>
            <Form.Item :label="t('sso.clientSecret')" :extra="t('sso.clientSecretKeep')">
              <Input.Password v-model:value="form.clientSecret" data-testid="sso-client-secret" :disabled="isManagedField('oidcConfiguration/secret')" />
            </Form.Item>
            <Form.Item :label="t('sso.callbackUrl')" :validate-status="fieldErrors.callbackUrl ? 'error' : ''" :help="fieldErrors.callbackUrl">
              <Input v-model:value="form.callbackUrl" data-testid="sso-callback-url" :disabled="isManagedField('callbackUrl')" />
            </Form.Item>
            <Form.Item :validate-status="fieldErrors.enableSelfSignup ? 'error' : ''" :help="fieldErrors.enableSelfSignup">
              <Checkbox v-model:checked="form.enableSelfSignup" data-testid="sso-self-signup" :disabled="isManagedField('enableSelfSignup')">
                {{ t('sso.selfSignup') }}
              </Checkbox>
            </Form.Item>
            <Form.Item>
              <Button
                v-if="canTestLogin"
                data-testid="test-login-sso-configuration"
                :disabled="saving || isTestingLogin || !form.provider || !authEditable"
                :loading="isTestingLogin"
                @click="handleTestLogin"
              >
                {{ t('sso.testLogin.title') }}
              </Button>
              <Button type="primary" data-testid="sso-save" :loading="saving" :disabled="!authEditable || isSaveGatedOnTestLogin" @click="save">
                {{ t('sso.save') }}
              </Button>
            </Form.Item>
            <Alert
              v-if="isSaveGatedOnTestLogin"
              type="warning"
              show-icon
              data-testid="sso-test-login-required"
            >
              <template #description>
                <span>{{ testLoginGateMessage }}</span>
                <Button data-testid="save-anyway-sso-configuration" :disabled="saving" @click="save">
                  {{ t('sso.testLogin.saveAnyway') }}
                </Button>
              </template>
            </Alert>
          </Form>
        </Tabs.TabPane>
      </Tabs>
    </Spin>
    <SsoTestLoginModal
      :open="showTestLoginModal"
      :is-testing="isTestingLogin"
      :is-awaiting-credentials="isAwaitingCredentialsLogin"
      :configuration-check="testLoginCheck"
      :result="testLoginResult"
      :error="testLoginError"
      :on-submit-credentials="submitTestLoginCredentials"
      @close="closeTestLoginModal"
    />
  </PageLayout>
</template>

<style scoped>
.sso__facts {
  display: grid;
  gap: 12px;
  margin-block: 12px;
}

.sso__facts div {
  display: flex;
  gap: 12px;
}

.sso__facts dt {
  min-width: 160px;
  color: var(--sm-text-secondary);
}

.sso__form {
  max-width: 640px;
  margin-block: 12px;
}
</style>
