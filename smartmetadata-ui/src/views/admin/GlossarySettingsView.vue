<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official glossarySettings.enableTagPropagation.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Switch, message } from 'ant-design-vue';
import { getTypedSetting, settingAsGlossary, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { GlossarySettings } from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<GlossarySettings>({ enableTagPropagation: true });

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(form, await getTypedSetting('glossarySettings', settingAsGlossary));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.glossaryPrefs.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('glossarySettings', {
      enableTagPropagation: form.enableTagPropagation,
    });
    message.success(t('settings.glossaryPrefs.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.glossaryPrefs.saveFailed'));
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
    test-id="glossary-settings"
    :title="t('settings.glossaryPrefs.title')"
    :lead="t('settings.glossaryPrefs.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Form layout="vertical">
      <Form.Item :label="t('settings.glossaryPrefs.tagPropagation')">
        <Switch v-model:checked="form.enableTagPropagation" data-testid="glossary-tag-propagation" />
      </Form.Item>
      <Button type="primary" :loading="saving" data-testid="glossary-settings-save" @click="save">
        {{ t('settings.glossaryPrefs.save') }}
      </Button>
    </Form>
  </PreferencePageShell>
</template>
