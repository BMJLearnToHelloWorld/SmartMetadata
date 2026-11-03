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
import {
  getSecurityConfig,
  patchAuthenticationConfiguration,
  type SsoAuthConfiguration,
} from '@/api/system';

/**
 * Official SettingsSso, configuration page only (the login chain itself
 * is untouched). Overview tab shows the loaded configuration; the
 * configuration tab edits it through the official save path: JSON Patch
 * on /v1/system/settings/authenticationConfiguration
 * (securityConfigAPI.patchAuthenticationConfiguration). An empty secret
 * sends no op, so the server keeps its masked stored value.
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
    const ops = [
      ...setFieldPatch('/provider', current.provider, form.provider),
      ...setFieldPatch('/clientType', current.clientType, form.clientType || undefined),
      ...(showProviderName.value
        ? setFieldPatch('/providerName', current.providerName, form.providerName || undefined)
        : []),
      ...setFieldPatch('/authority', current.authority, form.authority || undefined),
      ...setFieldPatch('/clientId', current.clientId, form.clientId || undefined),
      ...setFieldPatch('/callbackUrl', current.callbackUrl, form.callbackUrl || undefined),
      ...setFieldPatch('/enableSelfSignup', current.enableSelfSignup, form.enableSelfSignup),
    ];
    // Empty secret sends no op: the server keeps its masked stored value.
    // 'add' is used for a supplied secret because RFC 6902 'add' replaces
    // an existing member, so it works for first-time and rotation alike.
    if (form.clientSecret) {
      ops.push({ op: 'add', path: '/clientSecret', value: form.clientSecret });
    }
    await patchAuthenticationConfiguration(ops);
    message.success(t('sso.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('sso.saveFailed'));
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
            <Form.Item :label="t('sso.provider')">
              <Radio.Group v-model:value="form.provider" data-testid="sso-provider-group" :options="providerOptions" />
            </Form.Item>
            <Form.Item v-if="showProviderName" :label="t('sso.providerName')">
              <Input v-model:value="form.providerName" data-testid="sso-provider-name" />
            </Form.Item>
            <Form.Item :label="t('sso.clientType')">
              <Select v-model:value="form.clientType" data-testid="sso-client-type" :options="clientTypeOptions" allow-clear />
            </Form.Item>
            <Form.Item :label="t('sso.authority')">
              <Input v-model:value="form.authority" data-testid="sso-authority" />
            </Form.Item>
            <Form.Item :label="t('sso.clientId')">
              <Input v-model:value="form.clientId" data-testid="sso-client-id" />
            </Form.Item>
            <Form.Item :label="t('sso.clientSecret')" :extra="t('sso.clientSecretKeep')">
              <Input.Password v-model:value="form.clientSecret" data-testid="sso-client-secret" />
            </Form.Item>
            <Form.Item :label="t('sso.callbackUrl')">
              <Input v-model:value="form.callbackUrl" data-testid="sso-callback-url" />
            </Form.Item>
            <Form.Item>
              <Checkbox v-model:checked="form.enableSelfSignup" data-testid="sso-self-signup">
                {{ t('sso.selfSignup') }}
              </Checkbox>
            </Form.Item>
            <Form.Item>
              <Button type="primary" data-testid="sso-save" :loading="saving" @click="save">
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
