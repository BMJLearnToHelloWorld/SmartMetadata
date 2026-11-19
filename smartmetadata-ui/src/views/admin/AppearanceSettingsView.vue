<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official AppearanceConfigSettingsPage IA: logo URLs + theme colors + save/reset.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Input, Space, Spin, message } from 'ant-design-vue';
import {
  getTypedSetting,
  settingAsUiTheme,
  updateSetting,
} from '@/api/system';
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
import type { ThemeConfiguration, UiThemePreference } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.appearance');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.appearance');
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
const resetting = ref(false);
const errorMessage = ref('');
const form = reactive<UiThemePreference>({
  customLogoConfig: {},
  customTheme: {},
});

const colorFields: Array<{ key: keyof ThemeConfiguration; labelKey: string }> = [
  { key: 'primaryColor', labelKey: 'settings.appearance.primaryColor' },
  { key: 'selectedColor', labelKey: 'settings.appearance.selectedColor' },
  { key: 'hoverColor', labelKey: 'settings.appearance.hoverColor' },
  { key: 'errorColor', labelKey: 'settings.appearance.errorColor' },
  { key: 'successColor', labelKey: 'settings.appearance.successColor' },
  { key: 'warningColor', labelKey: 'settings.appearance.warningColor' },
  { key: 'infoColor', labelKey: 'settings.appearance.infoColor' },
  { key: 'panelBackgroundColor', labelKey: 'settings.appearance.panelBackgroundColor' },
];

const HEX_RE = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$|^$/;

function orEmpty(value?: string): string {
  return value ?? '';
}

function apply(theme: UiThemePreference): void {
  form.customLogoConfig = { ...theme.customLogoConfig };
  form.customTheme = { ...theme.customTheme };
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    apply(await getTypedSetting('customUiThemePreference', settingAsUiTheme));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.appearance.loadFailed');
  } finally {
    loading.value = false;
  }
}

function payload(): UiThemePreference {
  return {
    customLogoConfig: {
      customLogoUrlPath: orEmpty(form.customLogoConfig.customLogoUrlPath),
      customFaviconUrlPath: orEmpty(form.customLogoConfig.customFaviconUrlPath),
      customMonogramUrlPath: orEmpty(form.customLogoConfig.customMonogramUrlPath),
    },
    customTheme: {
      primaryColor: orEmpty(form.customTheme.primaryColor),
      hoverColor: orEmpty(form.customTheme.hoverColor),
      selectedColor: orEmpty(form.customTheme.selectedColor),
      errorColor: orEmpty(form.customTheme.errorColor),
      successColor: orEmpty(form.customTheme.successColor),
      warningColor: orEmpty(form.customTheme.warningColor),
      infoColor: orEmpty(form.customTheme.infoColor),
      panelBackgroundColor: orEmpty(form.customTheme.panelBackgroundColor),
    },
  };
}

function validateColors(): boolean {
  for (const field of colorFields) {
    const value = orEmpty(form.customTheme[field.key]);
    if (!HEX_RE.test(value)) {
      message.error(t('settings.appearance.invalidColor', { field: t(field.labelKey) }));
      return false;
    }
  }
  return true;
}

async function save(): Promise<void> {
  if (!validateColors()) return;
  saving.value = true;
  try {
    await updateSetting('customUiThemePreference', payload());
    message.success(t('settings.appearance.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appearance.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function reset(): Promise<void> {
  resetting.value = true;
  try {
    await updateSetting('customUiThemePreference', {
      customLogoConfig: {
        customLogoUrlPath: '',
        customFaviconUrlPath: '',
        customMonogramUrlPath: '',
      },
      customTheme: {
        primaryColor: '',
        hoverColor: '',
        selectedColor: '',
        errorColor: '',
        successColor: '',
        warningColor: '',
        infoColor: '',
        panelBackgroundColor: '',
      },
    });
    message.success(t('settings.appearance.resetDone'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appearance.resetFailed'));
  } finally {
    resetting.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="appearance-settings">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="appearance-settings"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.appearance.logoUrl')">
          <Input v-model:value="form.customLogoConfig.customLogoUrlPath" data-testid="appearance-logo" />
        </Form.Item>
        <Form.Item :label="t('settings.appearance.monogramUrl')">
          <Input v-model:value="form.customLogoConfig.customMonogramUrlPath" data-testid="appearance-monogram" />
        </Form.Item>
        <Form.Item :label="t('settings.appearance.faviconUrl')">
          <Input v-model:value="form.customLogoConfig.customFaviconUrlPath" data-testid="appearance-favicon" />
        </Form.Item>
        <Form.Item v-for="field in colorFields" :key="field.key" :label="t(field.labelKey)">
          <Input v-model:value="form.customTheme[field.key]" :data-testid="`appearance-color-${field.key}`" placeholder="#RRGGBB" />
        </Form.Item>
        <Space>
          <Button type="primary" :loading="saving" data-testid="appearance-save" @click="save">
            {{ t('settings.appearance.save') }}
          </Button>
          <Button :loading="resetting" data-testid="appearance-reset" @click="reset">
            {{ t('settings.appearance.reset') }}
          </Button>
        </Space>
      </Form>
    </Spin>
  </div>
</template>
