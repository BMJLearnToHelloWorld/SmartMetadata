<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Brand Name URL / openMetadataBaseUrlConfiguration.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Input, Spin, message } from 'ant-design-vue';
import { getTypedSetting, settingAsOmUrl, updateSetting } from '@/api/system';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { omUrlConfigurationBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import type { OmBaseUrlConfiguration } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.om-url-config');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.om-url-config');
}
const header = computed(() => t('settings.shell.entityConfiguration', { entity: registryTitle(settingsTranslator, registryEntry) }));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    omUrlConfigurationBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      (entity) => t('settings.shell.entityConfiguration', { entity }),
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<OmBaseUrlConfiguration>({ openMetadataUrl: '' });

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(form, await getTypedSetting('openMetadataBaseUrlConfiguration', settingAsOmUrl));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.omUrl.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('openMetadataBaseUrlConfiguration', {
      openMetadataUrl: form.openMetadataUrl,
    });
    message.success(t('settings.omUrl.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.omUrl.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="om-url-config">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="om-url-config"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.omUrl.url')">
          <Input v-model:value="form.openMetadataUrl" data-testid="om-url-input" />
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="om-url-save" @click="save">
          {{ t('settings.omUrl.save') }}
        </Button>
      </Form>
    </Spin>
  </div>
</template>
