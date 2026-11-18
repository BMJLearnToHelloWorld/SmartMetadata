<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LoginConfiguration details + edit fields.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, InputNumber, Spin, message } from 'ant-design-vue';
import { getTypedSetting, settingAsLoginConfig, updateSetting } from '@/api/system';
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
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const login = reactive<LoginConfiguration>({});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(login, await getTypedSetting('loginConfiguration', settingAsLoginConfig));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.login.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('loginConfiguration', {
      maxLoginFailAttempts: login.maxLoginFailAttempts,
      accessBlockTime: login.accessBlockTime,
      jwtTokenExpiryTime: login.jwtTokenExpiryTime,
    });
    message.success(t('settings.login.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.login.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
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
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.system.maxFail')">
          <InputNumber v-model:value="login.maxLoginFailAttempts" :min="1" data-testid="login-max-fail" />
        </Form.Item>
        <Form.Item :label="t('settings.system.blockTime')">
          <InputNumber v-model:value="login.accessBlockTime" :min="0" data-testid="login-block-time" />
        </Form.Item>
        <Form.Item :label="t('settings.system.jwtExpiry')">
          <InputNumber v-model:value="login.jwtTokenExpiryTime" :min="60" data-testid="login-jwt-expiry" />
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="save-login-config" @click="save">
          {{ t('settings.system.saveLogin') }}
        </Button>
      </Form>
    </Spin>
  </div>
</template>
