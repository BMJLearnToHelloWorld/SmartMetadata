<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Form, Input, Radio, Select, Spin, Tabs, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { setFieldPatch } from '@/admin/jsonPatch';
import { ApiError } from '@/api/client';
import {
  getSecurityConfig,
  getSettingsSource,
  parseSecurityValidationErrors,
  patchSecurityConfiguration,
  type SsoAuthConfiguration,
} from '@/api/system';

/**
 * Official SettingsSso, configuration page only (the login chain itself
 * is untouched). Overview tab shows the loaded configuration; the
 * configuration tab edits it through the official save path: JSON Patch
 * on the whole SecurityConfiguration document at
 * /v1/system/security/config (securityConfigAPI.patchSecurityConfiguration,
 * paths rooted at /authenticationConfiguration/...). An empty secret
 * sends no op, so the server keeps its masked stored value. Fields the
 * deployment owns (GET /v1/system/settings/source) are locked in the form
 * and never sent, so a stale form cannot produce a 409.
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

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const config = await getSecurityConfig();
    loaded.value = config.authenticationConfiguration;
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
  try {
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
    // Empty secret sends no op: the server keeps its masked stored value.
    // 'add' is used for a supplied secret because RFC 6902 'add' replaces
    // an existing member, so it works for first-time and rotation alike.
    if (form.clientSecret && !isManagedField('clientSecret')) {
      ops.push({ op: 'add', path: '/authenticationConfiguration/clientSecret', value: form.clientSecret });
    }
    if (ops.length > 0) {
      await patchSecurityConfiguration(ops);
    }
    message.success(t('sso.saved'));
    await load();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) {
        message.error(parseSecurityValidationErrors(error.body) ?? t('sso.saveFailed'));
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
          <Form layout="vertical" class="sso__form">
            <p v-if="hasManagedFields" data-testid="sso-managed-note">{{ t('sso.managedNote') }}</p>
            <Form.Item :label="t('sso.provider')">
              <Radio.Group v-model:value="form.provider" data-testid="sso-provider-group" :options="providerOptions" :disabled="isManagedField('provider')" />
            </Form.Item>
            <Form.Item v-if="showProviderName" :label="t('sso.providerName')">
              <Input v-model:value="form.providerName" data-testid="sso-provider-name" :disabled="isManagedField('providerName')" />
            </Form.Item>
            <Form.Item :label="t('sso.clientType')">
              <Select v-model:value="form.clientType" data-testid="sso-client-type" :options="clientTypeOptions" allow-clear :disabled="isManagedField('clientType')" />
            </Form.Item>
            <Form.Item :label="t('sso.authority')">
              <Input v-model:value="form.authority" data-testid="sso-authority" :disabled="isManagedField('authority')" />
            </Form.Item>
            <Form.Item :label="t('sso.clientId')">
              <Input v-model:value="form.clientId" data-testid="sso-client-id" :disabled="isManagedField('clientId')" />
            </Form.Item>
            <Form.Item :label="t('sso.clientSecret')" :extra="t('sso.clientSecretKeep')">
              <Input.Password v-model:value="form.clientSecret" data-testid="sso-client-secret" :disabled="isManagedField('clientSecret')" />
            </Form.Item>
            <Form.Item :label="t('sso.callbackUrl')">
              <Input v-model:value="form.callbackUrl" data-testid="sso-callback-url" :disabled="isManagedField('callbackUrl')" />
            </Form.Item>
            <Form.Item>
              <Checkbox v-model:checked="form.enableSelfSignup" data-testid="sso-self-signup" :disabled="isManagedField('enableSelfSignup')">
                {{ t('sso.selfSignup') }}
              </Checkbox>
            </Form.Item>
            <Form.Item>
              <Button type="primary" data-testid="sso-save" :loading="saving" :disabled="!authEditable" @click="save">
                {{ t('sso.save') }}
              </Button>
            </Form.Item>
          </Form>
        </Tabs.TabPane>
      </Tabs>
    </Spin>
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
