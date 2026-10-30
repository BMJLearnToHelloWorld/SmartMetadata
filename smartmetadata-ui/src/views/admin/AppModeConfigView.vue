<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official CustomizationPageSettings defaultAppMode only (Collate sidebar OUT).
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Select, message } from 'ant-design-vue';
import { getTypedSetting, settingAsAppConfiguration, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { AppConfiguration } from '@/types/admin';

const { t } = useI18n();
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
  <PreferencePageShell
    test-id="app-mode-config"
    :title="t('settings.appMode.title')"
    :lead="t('settings.appMode.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
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
  </PreferencePageShell>
</template>
