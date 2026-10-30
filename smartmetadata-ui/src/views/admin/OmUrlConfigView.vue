<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Brand Name URL / openMetadataBaseUrlConfiguration.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Input, message } from 'ant-design-vue';
import { getTypedSetting, settingAsOmUrl, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { OmBaseUrlConfiguration } from '@/types/admin';

const { t } = useI18n();
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
  <PreferencePageShell
    test-id="om-url-config"
    :title="t('settings.omUrl.title')"
    :lead="t('settings.omUrl.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Form layout="vertical">
      <Form.Item :label="t('settings.omUrl.url')">
        <Input v-model:value="form.openMetadataUrl" data-testid="om-url-input" />
      </Form.Item>
      <Button type="primary" :loading="saving" data-testid="om-url-save" @click="save">
        {{ t('settings.omUrl.save') }}
      </Button>
    </Form>
  </PreferencePageShell>
</template>
