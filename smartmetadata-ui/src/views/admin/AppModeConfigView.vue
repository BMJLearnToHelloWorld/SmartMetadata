<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official CustomizationPageSettings defaultAppMode only (Collate sidebar OUT).
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Select, Spin, Typography, message } from 'ant-design-vue';
import { getTypedSetting, settingAsAppConfiguration, updateSetting } from '@/api/system';
import {
  findSettingsRegistryItem,
  registryDescription,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import type { AppConfiguration } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.appMode');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.appMode');
}
const header = computed(() => registryTitle(settingsTranslator, registryEntry));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<AppConfiguration>({ defaultAppMode: null });

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(form, await getTypedSetting('appConfiguration', settingAsAppConfiguration));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.appMode.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('appConfiguration', {
      defaultAppMode: form.defaultAppMode ?? null,
      defaultColumnOrder: form.defaultColumnOrder ?? null,
      defaultTimeFormat: form.defaultTimeFormat,
    });
    message.success(t('settings.appMode.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appMode.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="app-mode-config">
    <h1 class="app-mode-config__title" data-testid="app-mode-config-heading">{{ header }}</h1>
    <Typography.Paragraph class="app-mode-config__lead" type="secondary">{{ subHeader }}</Typography.Paragraph>
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.appMode.defaultMode')">
          <Select v-model:value="form.defaultAppMode" allow-clear data-testid="app-mode-select">
            <Select.Option value="ai">{{ t('settings.appMode.ai') }}</Select.Option>
            <Select.Option value="classic">{{ t('settings.appMode.classic') }}</Select.Option>
          </Select>
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="app-mode-save" @click="save">
          {{ t('settings.appMode.save') }}
        </Button>
      </Form>
    </Spin>
  </div>
</template>

<style scoped>
.app-mode-config__title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.33;
  color: var(--sm-text-primary);
}
.app-mode-config__lead {
  margin-bottom: 24px;
}
</style>
