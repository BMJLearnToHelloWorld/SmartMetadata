<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official GlossarySettings (non-embedded): single-row Card, immediate
  toggle save, in-card loading/error states with retry.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Switch, Typography, message } from 'ant-design-vue';
import {
  getTypedSetting,
  settingAsGlossary,
  updateSetting,
} from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { GlossarySettings } from '@/types/admin';

const { t } = useI18n();
const data = ref<GlossarySettings | null>(null);
const isPending = ref(false);
const isError = ref(false);
const isSaving = ref(false);

async function load(): Promise<void> {
  isPending.value = true;
  isError.value = false;
  try {
    data.value = await getTypedSetting('glossarySettings', settingAsGlossary);
  } catch {
    isError.value = true;
  } finally {
    isPending.value = false;
  }
}

async function onToggle(checked: unknown): Promise<void> {
  const enableTagPropagation = Boolean(checked);
  isSaving.value = true;
  try {
    const response = await updateSetting('glossarySettings', { enableTagPropagation });
    data.value = settingAsGlossary(response.configValue);
    message.success(t('settings.glossaryPrefs.saved'));
  } catch (error) {
    // The switch is controlled from `data`, which is untouched on failure,
    // so it visually stays at the stored value.
    message.error(error instanceof Error ? error.message : t('settings.glossaryPrefs.saveFailed'));
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
    test-id="glossary-settings"
    :title="t('settings.glossaryPrefs.title')"
    :lead="t('settings.glossaryPrefs.lead')"
  >
    <Card>
      <div class="glossary-row">
        <div class="glossary-row__label">
          <div class="glossary-row__title">{{ t('settings.glossaryPrefs.tagPropagation') }}</div>
          <Typography.Text type="secondary" class="glossary-row__hint">
            {{ t('settings.glossaryPrefs.reindexHint') }}
          </Typography.Text>
        </div>
        <span v-if="isPending" role="status">{{ t('settings.glossaryPrefs.loading') }}</span>
        <div v-if="isError" class="glossary-row__error">
          <span role="alert">{{ t('settings.glossaryPrefs.loadFailed') }}</span>
          <Button data-testid="glossary-settings-retry" @click="load">
            {{ t('settings.glossaryPrefs.retry') }}
          </Button>
        </div>
        <Switch
          v-if="data && !isError"
          :checked="data.enableTagPropagation !== false"
          :disabled="isSaving"
          :aria-label="t('settings.glossaryPrefs.tagPropagation')"
          data-testid="glossary-tag-propagation"
          @change="onToggle"
        />
      </div>
    </Card>
  </PreferencePageShell>
</template>

<style scoped>
.glossary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.glossary-row__title {
  font-weight: 500;
}

.glossary-row__hint {
  font-size: 12px;
}

.glossary-row__error {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
