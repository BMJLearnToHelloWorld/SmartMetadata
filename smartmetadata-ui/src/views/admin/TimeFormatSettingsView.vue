<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official defaultTimeFormat on appConfiguration (12h / 24h).
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Select, Spin, message } from 'ant-design-vue';
import { getTypedSetting, settingAsAppConfiguration, updateSetting } from '@/api/system';
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
import type { AppConfiguration } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.timeFormat');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.timeFormat');
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
const full = ref<AppConfiguration>({});
const form = reactive<{ defaultTimeFormat: '12h' | '24h' }>({ defaultTimeFormat: '12h' });

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const cfg = await getTypedSetting('appConfiguration', settingAsAppConfiguration);
    full.value = cfg;
    form.defaultTimeFormat = cfg.defaultTimeFormat === '24h' ? '24h' : '12h';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.timeFormat.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('appConfiguration', {
      defaultAppMode: full.value.defaultAppMode ?? null,
      defaultColumnOrder: full.value.defaultColumnOrder ?? null,
      defaultTimeFormat: form.defaultTimeFormat,
    });
    message.success(t('settings.timeFormat.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.timeFormat.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="time-format-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="time-format-settings"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.timeFormat.time')">
          <Select v-model:value="form.defaultTimeFormat" data-testid="time-format-select">
            <Select.Option value="12h">12h</Select.Option>
            <Select.Option value="24h">24h</Select.Option>
          </Select>
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="time-format-save" @click="save">
          {{ t('settings.timeFormat.save') }}
        </Button>
      </Form>
    </Spin>
  </div>
</template>
