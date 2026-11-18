<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DefaultTimeFormatPage: Card with a 12h/24h radio group and a
  footer Save; single-key PATCH, store update only after PATCH success.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Radio, message } from 'ant-design-vue';
import {
  getTypedSetting,
  patchAppConfiguration,
  settingAsAppConfiguration,
} from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import { useShellConfigStore } from '@/stores/shellConfig';

const { t } = useI18n();
const shellConfig = useShellConfigStore();
const initialValue = ref<'12h' | '24h'>('12h');
const currentValue = ref<'12h' | '24h'>('12h');
const isLoading = ref(true);
const isSaving = ref(false);

const isDirty = computed(() => currentValue.value !== initialValue.value);

async function load(): Promise<void> {
  try {
    const config = await getTypedSetting('appConfiguration', settingAsAppConfiguration);
    const initial = config.defaultTimeFormat ?? '12h';
    initialValue.value = initial;
    currentValue.value = initial;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.timeFormat.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

async function save(): Promise<void> {
  isSaving.value = true;
  try {
    await patchAppConfiguration({ defaultTimeFormat: currentValue.value });
    initialValue.value = currentValue.value;
    shellConfig.setTimeFormat(currentValue.value);
    message.success(t('settings.timeFormat.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.timeFormat.saveFailed'));
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="time-format-settings"
    :title="t('settings.timeFormat.title')"
    :lead="t('settings.timeFormat.lead')"
  >
    <Card data-testid="default-time-format-page">
      <Radio.Group
        v-model:value="currentValue"
        :aria-label="t('settings.timeFormat.title')"
        data-testid="time-format-radio-group"
      >
        <Radio value="12h" data-testid="time-format-option-12h">
          {{ t('settings.timeFormat.format12h') }}
        </Radio>
        <Radio value="24h" data-testid="time-format-option-24h">
          {{ t('settings.timeFormat.format24h') }}
        </Radio>
      </Radio.Group>
      <template #actions>
        <Button
          type="primary"
          :disabled="!isDirty || isLoading || isSaving"
          :loading="isSaving"
          data-testid="save-time-format-settings"
          @click="save"
        >
          {{ t('settings.timeFormat.save') }}
        </Button>
      </template>
    </Card>
  </PreferencePageShell>
</template>
