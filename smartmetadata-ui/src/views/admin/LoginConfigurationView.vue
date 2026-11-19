<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LoginConfigurationPage (LoginConfigurationDetails):
  read-only detail + Edit button that navigates to the standalone
  edit route (R-FIXUP2-1, A4 §14 项 7). The edit face lives in
  EditLoginConfigurationView.vue; this view never edits in place.
  Load reads the dedicated login-config endpoint.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Col,
  Row,
  Space,
  Tooltip,
  Typography,
  message,
  Spin,
} from 'ant-design-vue';
import { fetchLoginConfig } from '@/api/system';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import type { LoginConfiguration } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.loginConfiguration');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.loginConfiguration');
}
const header = computed(() => registryTitle(settingsTranslator, registryEntry));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'preferences',
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);

type LoginField = 'maxLoginFailAttempts' | 'accessBlockTime' | 'jwtTokenExpiryTime';
const LOGIN_FIELDS: LoginField[] = [
  'maxLoginFailAttempts',
  'accessBlockTime',
  'jwtTokenExpiryTime',
];

const config = ref<LoginConfiguration | undefined>(undefined);
const loading = ref(false);

const labels = computed<Record<LoginField, string>>(() => ({
  maxLoginFailAttempts: t('settings.system.maxFail'),
  accessBlockTime: t('settings.system.blockTime'),
  jwtTokenExpiryTime: t('settings.system.jwtExpiry'),
}));

const hints = computed<Record<LoginField, string>>(() => ({
  maxLoginFailAttempts: t('settings.login.maxFailHint'),
  accessBlockTime: t('settings.login.blockTimeHint'),
  jwtTokenExpiryTime: t('settings.login.jwtHint'),
}));

const valueTestIds: Record<LoginField, string> = {
  maxLoginFailAttempts: 'max-login-fail-attempts',
  accessBlockTime: 'access-block-time',
  jwtTokenExpiryTime: 'jwt-token-expiry-time',
};

// Official loads via the dedicated login-config endpoint, which returns
// the LoginConfiguration object directly (not wrapped in config_value).
async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    config.value = await fetchLoginConfig();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.login.loadFailed'));
  } finally {
    loading.value = false;
  }
}

// Pin handleEditClick (LoginConfigurationPage.tsx:69-71) navigates to the
// standalone edit route; the detail page never edits in place.
function goToEdit(): void {
  void router.push({ name: 'settings-preferences-login-edit' });
}

onMounted(() => {
  void loadConfig();
});
</script>

<template>
  <div data-testid="login-configuration">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="login-configuration"
    />
    <Spin :spinning="loading">
      <div class="login-actions">
        <Button type="default" data-testid="edit-button" @click="goToEdit">
          <EditOutlined />
          {{ t('settings.login.edit') }}
        </Button>
      </div>
      <Row :gutter="[16, 16]">
        <Col v-for="field in LOGIN_FIELDS" :key="field" :span="12">
          <Space>
            <Typography.Text type="secondary">{{ labels[field] }}</Typography.Text>
            <Tooltip placement="top" :title="hints[field]">
              <InfoCircleOutlined :data-testid="`${valueTestIds[field]}-info`" />
            </Tooltip>
          </Space>
          <div :data-testid="valueTestIds[field]">
            <template v-if="field === 'jwtTokenExpiryTime'">
              {{ config?.jwtTokenExpiryTime ?? '--' }} {{ t('settings.login.seconds') }}
            </template>
            <template v-else>{{ config?.[field] ?? '--' }}</template>
          </div>
        </Col>
      </Row>
    </Spin>
  </div>
</template>

<style scoped>
.login-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
</style>
