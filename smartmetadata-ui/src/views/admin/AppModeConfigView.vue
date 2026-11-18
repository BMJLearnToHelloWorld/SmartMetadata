<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DefaultAppModePage: no-default/classic/AI radio options,
  deployment-managed gating, single-key PATCH with a null sentinel.
  The bare-h1 page shape (no breadcrumb/PageHeader/Card) awaits the
  shell batch's de-shelling; content stays inside PreferencePageShell.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRightOutlined } from '@ant-design/icons-vue';
import { Button, Radio, Space, Tag, message } from 'ant-design-vue';
import {
  getSettingsSource,
  getTypedSetting,
  patchAppConfiguration,
  settingAsAppConfiguration,
} from '@/api/system';
import type { SsoSettingSource } from '@/admin/ssoSettingsSource';
import SettingsSourceBanner from '@/components/shared/SettingsSourceBanner.vue';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import { findSettingSource, isPathManaged } from '@/utils/settingsSource';

// Sentinel value for the "no tenant default" radio option — the wire value
// for that choice is `null`, but form controls can't carry `null`, so the
// translation happens at the option/handler boundary only.
const NO_DEFAULT_VALUE = 'null';

// Official appMode.constants.CLASSIC_MODE_RELEASE_NOTES_URL.
const CLASSIC_MODE_RELEASE_NOTES_URL =
  'https://docs.open-metadata.org/latest/releases/all-releases';

type AppModeValue = 'null' | 'classic' | 'ai';

const OPTIONS: Array<{ value: AppModeValue; labelKey: string }> = [
  { value: NO_DEFAULT_VALUE, labelKey: 'settings.appMode.noDefault' },
  { value: 'classic', labelKey: 'settings.appMode.classic' },
  { value: 'ai', labelKey: 'settings.appMode.ai' },
];

const { t } = useI18n();
const initialValue = ref<AppModeValue>(NO_DEFAULT_VALUE);
const currentValue = ref<AppModeValue>(NO_DEFAULT_VALUE);
const isLoading = ref(true);
const isSaving = ref(false);
const sources = ref<SsoSettingSource[]>([]);

const isManagedByDeployment = computed(() =>
  isPathManaged(findSettingSource(sources.value, 'appConfiguration'), '/defaultAppMode'),
);
const isDirty = computed(() => currentValue.value !== initialValue.value);

async function loadConfig(): Promise<void> {
  try {
    const config = await getTypedSetting('appConfiguration', settingAsAppConfiguration);
    const initial = (config.defaultAppMode ?? NO_DEFAULT_VALUE) as AppModeValue;
    initialValue.value = initial;
    currentValue.value = initial;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appMode.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

async function loadSources(): Promise<void> {
  try {
    sources.value = await getSettingsSource();
  } catch {
    // A failed source request renders as DB-only (pin useSettingsSource).
    sources.value = [];
  }
}

async function save(): Promise<void> {
  isSaving.value = true;
  try {
    await patchAppConfiguration({
      defaultAppMode: currentValue.value === NO_DEFAULT_VALUE ? null : currentValue.value,
    });
    initialValue.value = currentValue.value;
    message.success(t('settings.appMode.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appMode.saveFailed'));
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void loadConfig();
  void loadSources();
});
</script>

<template>
  <PreferencePageShell
    test-id="app-mode-config"
    :title="t('settings.appMode.title')"
    :lead="t('settings.appMode.lead')"
  >
    <div data-testid="default-app-mode-page">
      <SettingsSourceBanner
        :sources="sources"
        :on-refetch="loadSources"
        :on-adopted="loadConfig"
      />
      <Radio.Group
        v-model:value="currentValue"
        :disabled="isManagedByDeployment"
        :aria-label="t('settings.appMode.title')"
        data-testid="app-mode-radio-group"
      >
        <Space direction="vertical">
          <div v-for="option in OPTIONS" :key="option.value">
            <Radio :value="option.value" :data-testid="`app-mode-option-${option.value}`">
              <span v-if="option.value === 'classic'" class="app-mode-classic-label">
                {{ t(option.labelKey) }}
                <Tag color="warning" data-testid="classic-deprecated-badge">
                  {{ t('settings.appMode.deprecated') }}
                </Tag>
              </span>
              <span v-else>{{ t(option.labelKey) }}</span>
            </Radio>
            <span
              v-if="option.value === 'classic'"
              class="app-mode-classic-hint"
              data-testid="classic-deprecation-hint"
            >
              {{ t('settings.appMode.classicRetiring') }}
              <a
                :href="CLASSIC_MODE_RELEASE_NOTES_URL"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="classic-deprecation-release-notes"
              >
                {{ t('settings.appMode.readReleaseNotes') }}
                <ArrowRightOutlined />
              </a>
            </span>
          </div>
        </Space>
      </Radio.Group>
      <div v-if="!isManagedByDeployment" class="app-mode-actions">
        <Button
          type="primary"
          :disabled="!isDirty || isLoading || isSaving"
          :loading="isSaving"
          data-testid="save-app-mode-settings"
          @click="save"
        >
          {{ t('settings.appMode.save') }}
        </Button>
      </div>
    </div>
  </PreferencePageShell>
</template>

<style scoped>
.app-mode-classic-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.app-mode-classic-hint {
  display: block;
  padding-left: 24px;
  font-size: 12px;
}

.app-mode-actions {
  margin-top: 24px;
}
</style>
