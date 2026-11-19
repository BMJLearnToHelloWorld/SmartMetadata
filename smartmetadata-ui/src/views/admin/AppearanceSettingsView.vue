<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official AppearanceConfigSettingsPage: two cards (custom logo, custom
  theme), per-field URL/hex validation, palette linkage from the primary
  color, save/reset through the customUiThemePreference setting.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ApartmentOutlined, ShareAltOutlined } from '@ant-design/icons-vue';
import { Alert, Button, Card, Form, Input, Space, Spin, message } from 'ant-design-vue';
import { startCase } from '@/api/customProperties';
import {
  getSetting,
  settingAsUiTheme,
  updateSetting,
} from '@/api/system';
import logoUrl from '@/assets/iqvia-logo.svg';
import monogramUrl from '@/assets/iqvia-monogram.svg';
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
import { useShellConfigStore } from '@/stores/shellConfig';
import { resolveBrandImageSrc } from '@/theme/customTheme';
import type { LogoConfiguration, ThemeConfiguration, UiThemePreference } from '@/types/admin';
import { deriveHoverSelected } from './appearancePalette';

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
const router = useRouter();
const shellConfig = useShellConfigStore();

const loading = ref(false);
const saving = ref(false);
const resetting = ref(false);
const errorMessage = ref('');
const form = reactive<UiThemePreference>({
  customLogoConfig: {},
  customTheme: {},
});
// R-THEME: the raw config_value snapshot the save/reset payloads overlay
// onto, so keys outside the 11 edited fields survive the whole-value PUT.
// hasSnapshot tracks whether the snapshot came from a GET; without it,
// save/reset must refetch first (ensureSnapshot) and refuse while the GET
// is unreachable, or the overlay would silently drop unknown keys.
const snapshot = ref<unknown>(null);
const hasSnapshot = ref(false);
const formDirty = ref(false);
const saveAttempted = ref(false);
const touched = reactive(new Set<string>());

type LogoFieldKey = keyof LogoConfiguration;
type ColorFieldKey = keyof ThemeConfiguration;

const logoFields: Array<{ key: LogoFieldKey; labelKey: string; placeholderKey: string }> = [
  { key: 'customLogoUrlPath', labelKey: 'settings.appearance.logoUrl', placeholderKey: 'settings.appearance.logoUrlPlaceholder' },
  { key: 'customMonogramUrlPath', labelKey: 'settings.appearance.monogramUrl', placeholderKey: 'settings.appearance.monogramUrlPlaceholder' },
  { key: 'customFaviconUrlPath', labelKey: 'settings.appearance.faviconUrl', placeholderKey: 'settings.appearance.faviconUrlPlaceholder' },
];

// Official field order: primary, selected, hover, panel background, then
// the four semantic colors.
const colorFields: Array<{ key: ColorFieldKey; labelKey: string }> = [
  { key: 'primaryColor', labelKey: 'settings.appearance.primaryColor' },
  { key: 'selectedColor', labelKey: 'settings.appearance.selectedColor' },
  { key: 'hoverColor', labelKey: 'settings.appearance.hoverColor' },
  { key: 'panelBackgroundColor', labelKey: 'settings.appearance.panelBackgroundColor' },
  { key: 'errorColor', labelKey: 'settings.appearance.errorColor' },
  { key: 'successColor', labelKey: 'settings.appearance.successColor' },
  { key: 'warningColor', labelKey: 'settings.appearance.warningColor' },
  { key: 'infoColor', labelKey: 'settings.appearance.infoColor' },
];

const HEX_COLOR_CODE_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

// Official SSOUtils.isValidUrl: http(s) URL with a hostname, tested on the
// trimmed string.
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
function isValidUrl(value: string): boolean {
  return URL_REGEX.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function orEmpty(value?: string): string {
  return value ?? '';
}

function apply(theme: UiThemePreference): void {
  form.customLogoConfig = { ...theme.customLogoConfig };
  form.customTheme = { ...theme.customTheme };
}

function editedValues(): UiThemePreference {
  return {
    customLogoConfig: {
      customLogoUrlPath: orEmpty(form.customLogoConfig.customLogoUrlPath),
      customMonogramUrlPath: orEmpty(form.customLogoConfig.customMonogramUrlPath),
      customFaviconUrlPath: orEmpty(form.customLogoConfig.customFaviconUrlPath),
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

function emptyValues(): UiThemePreference {
  return {
    customLogoConfig: {
      customLogoUrlPath: '',
      customMonogramUrlPath: '',
      customFaviconUrlPath: '',
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
  };
}

// R-THEME overlay: the 11 edited fields replace their counterparts on the
// original object (including nested objects); every other key is carried
// over untouched. The whitelist parse stays display-layer only.
function overlayOnSnapshot(edited: UiThemePreference): Record<string, unknown> {
  const base = isRecord(snapshot.value) ? snapshot.value : {};
  const logoBase = isRecord(base.customLogoConfig) ? base.customLogoConfig : {};
  const themeBase = isRecord(base.customTheme) ? base.customTheme : {};
  return {
    ...base,
    customLogoConfig: { ...logoBase, ...edited.customLogoConfig },
    customTheme: { ...themeBase, ...edited.customTheme },
  };
}

function logoError(key: LogoFieldKey): string | null {
  const value = form.customLogoConfig[key] ?? '';
  if (!value || isValidUrl(value)) {
    return null;
  }
  const field = logoFields.find((entry) => entry.key === key);
  return t('settings.appearance.invalidUrl', { field: field ? t(field.labelKey) : key });
}

function colorError(key: ColorFieldKey): string | null {
  const value = form.customTheme[key] ?? '';
  if (!value || HEX_COLOR_CODE_REGEX.test(value)) {
    return null;
  }
  return t('settings.appearance.hexValidation');
}

function showError(key: string): boolean {
  return saveAttempted.value || touched.has(key);
}

function markTouched(key: string): void {
  touched.add(key);
}

function bundledFor(key: LogoFieldKey): string {
  // Official BrandImage renders the favicon field with isMonoGram, so its
  // empty-state fallback is the monogram, not a favicon asset.
  return key === 'customLogoUrlPath' ? logoUrl : monogramUrl;
}

function logoPreviewSrc(key: LogoFieldKey): string {
  return resolveBrandImageSrc(form.customLogoConfig[key], bundledFor(key));
}

function onPreviewError(key: LogoFieldKey, event: Event): void {
  const img = event.target as HTMLImageElement | null;
  if (!img || img.dataset.fallbackApplied) {
    return;
  }
  img.dataset.fallbackApplied = 'true';
  img.src = bundledFor(key);
}

// The native color input only accepts #rrggbb; 3-digit hex expands to the
// same color, anything else falls back to black for the swatch only (the
// text value is untouched).
function swatchValue(key: ColorFieldKey): string {
  const value = form.customTheme[key] ?? '';
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }
  return '#000000';
}

function previewLabel(key: ColorFieldKey): string {
  return startCase(key.replace('Color', ''));
}

function onLogoInput(key: LogoFieldKey, value: string): void {
  form.customLogoConfig[key] = value;
  formDirty.value = true;
}

function onColorInput(key: ColorFieldKey, value: string): void {
  form.customTheme[key] = value;
  formDirty.value = true;
  // Official palette linkage: a new primary color regenerates the hover
  // and selected shades; clearing the primary regenerates nothing.
  if (key === 'primaryColor' && value) {
    const { hoverColor, selectedColor } = deriveHoverSelected(value);
    form.customTheme.hoverColor = hoverColor;
    form.customTheme.selectedColor = selectedColor;
  }
}

function onSwatchChange(key: ColorFieldKey, event: Event): void {
  onColorInput(key, (event.target as HTMLInputElement).value);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const setting = await getSetting('customUiThemePreference');
    snapshot.value = setting.configValue;
    hasSnapshot.value = true;
    if (!formDirty.value) {
      apply(settingAsUiTheme(setting.configValue));
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.appearance.loadFailed');
    // Degraded path: keep the page editable from the startup-loaded slice,
    // but set NO snapshot — the slice is a whitelist parse that drops
    // unknown keys, so overlaying onto it would silently delete them on
    // save. Save/reset refetch the raw value first (ensureSnapshot).
    snapshot.value = null;
    hasSnapshot.value = false;
    if (!formDirty.value && shellConfig.uiThemePreference) {
      apply(shellConfig.uiThemePreference);
    }
  } finally {
    loading.value = false;
  }
}

function hasErrors(): boolean {
  return (
    logoFields.some((field) => logoError(field.key) !== null) ||
    colorFields.some((field) => colorError(field.key) !== null)
  );
}

// B-QR-4 guard: refetch the raw setting when no snapshot was ever loaded.
// The refetch updates the snapshot only — never the form, so edits made
// while degraded survive — and a still-failing GET refuses the write with
// an explicit error (the pin save-failure surface is a toast,
// AppearanceConfigSettingsPage.tsx:117-118) and no PUT issued.
async function ensureSnapshot(): Promise<boolean> {
  if (hasSnapshot.value) {
    return true;
  }
  try {
    const setting = await getSetting('customUiThemePreference');
    snapshot.value = setting.configValue;
    hasSnapshot.value = true;
    errorMessage.value = '';
    return true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appearance.loadFailed'));
    return false;
  }
}

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (hasErrors()) {
    return;
  }
  saving.value = true;
  try {
    if (!(await ensureSnapshot())) {
      return;
    }
    const payload = overlayOnSnapshot(editedValues());
    await updateSetting('customUiThemePreference', payload);
    // Mirror official's form.reset-on-applicationConfig effect: the slice
    // takes the payload just saved (success only), and the form re-syncs
    // from it. No success toast, matching official.
    shellConfig.setUiThemePreference(payload);
    snapshot.value = payload;
    apply(settingAsUiTheme(payload));
    formDirty.value = false;
    saveAttempted.value = false;
    touched.clear();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appearance.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function reset(): Promise<void> {
  resetting.value = true;
  try {
    if (!(await ensureSnapshot())) {
      return;
    }
    const payload = overlayOnSnapshot(emptyValues());
    await updateSetting('customUiThemePreference', payload);
    shellConfig.setUiThemePreference(payload);
    snapshot.value = payload;
    apply(settingAsUiTheme(payload));
    formDirty.value = false;
    saveAttempted.value = false;
    touched.clear();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.appearance.resetFailed'));
  } finally {
    resetting.value = false;
  }
}

function cancel(): void {
  router.back();
}

// The form follows the startup-loaded slice until the user edits, mirroring
// official's form init from applicationConfig.
watch(
  () => shellConfig.uiThemePreference,
  (preference) => {
    if (!formDirty.value && preference) {
      apply(preference);
    }
  },
);

onMounted(() => {
  if (shellConfig.uiThemePreference) {
    apply(shellConfig.uiThemePreference);
  }
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
      <Card :title="t('settings.appearance.customLogo')" data-testid="appearance-logo-card">
      <div v-for="field in logoFields" :key="field.key" class="appearance-row">
        <div class="appearance-row__field">
          <Form.Item
            :label="t(field.labelKey)"
            :validate-status="showError(field.key) && logoError(field.key) ? 'error' : ''"
            :help="showError(field.key) ? (logoError(field.key) ?? '') : ''"
          >
            <Input
              :id="`root/${field.key}`"
              :value="form.customLogoConfig[field.key] ?? ''"
              :data-testid="field.key"
              :placeholder="t(field.placeholderKey)"
              @update:value="onLogoInput(field.key, $event)"
              @blur="markTouched(field.key)"
            />
          </Form.Item>
        </div>
        <img
          class="appearance-row__preview"
          :src="logoPreviewSrc(field.key)"
          :alt="t(field.labelKey)"
          :height="70"
          :width="field.key === 'customLogoUrlPath' ? 120 : 75"
          :data-testid="`${field.key}-preview`"
          @error="onPreviewError(field.key, $event)"
        />
      </div>
    </Card>
    <Card :title="t('settings.appearance.customTheme')" data-testid="appearance-theme-card">
      <div v-for="field in colorFields" :key="field.key" class="appearance-row">
        <div class="appearance-row__field">
          <Form.Item
            :label="t(field.labelKey)"
            :validate-status="showError(field.key) && colorError(field.key) ? 'error' : ''"
            :help="showError(field.key) ? (colorError(field.key) ?? '') : ''"
          >
            <div class="appearance-color-control">
              <input
                type="color"
                class="appearance-color-control__swatch"
                :value="swatchValue(field.key)"
                :aria-label="t('settings.appearance.selectColor', { field: t(field.labelKey) })"
                :data-testid="`${field.key}-color-picker`"
                @input="onSwatchChange(field.key, $event)"
                @change="onSwatchChange(field.key, $event)"
              />
              <Input
                :id="field.key"
                :value="form.customTheme[field.key] ?? ''"
                :data-testid="`${field.key}-color-input`"
                :placeholder="t('settings.appearance.hexPlaceholder')"
                @update:value="onColorInput(field.key, $event)"
                @blur="markTouched(field.key)"
              />
            </div>
          </Form.Item>
        </div>
        <Card class="appearance-theme-preview" :body-style="{ display: 'flex', gap: '16px', alignItems: 'center' }">
          <span
            class="appearance-theme-preview__filled"
            :style="{ background: form.customTheme[field.key] ?? '', borderColor: form.customTheme[field.key] ?? '' }"
          >
            {{ previewLabel(field.key) }}
          </span>
          <span
            class="appearance-theme-preview__outlined"
            :style="{ borderColor: form.customTheme[field.key] ?? '', color: form.customTheme[field.key] ?? '' }"
          >
            <ShareAltOutlined />
          </span>
          <span
            class="appearance-theme-preview__outlined"
            :style="{ borderColor: form.customTheme[field.key] ?? '', color: form.customTheme[field.key] ?? '' }"
          >
            {{ previewLabel(field.key) }}
          </span>
          <ApartmentOutlined :style="{ color: form.customTheme[field.key] ?? '', fontSize: '32px' }" />
          <span
            class="appearance-theme-preview__link"
            :style="{ color: form.customTheme[field.key] ?? '' }"
          >
            {{ t('settings.appearance.linkLabel') }}
          </span>
        </Card>
      </div>
    </Card>
    <!-- Reset sits with the actions until the shell exposes a header
         action slot; official places it beside the page header. -->
    <div class="appearance-actions" data-testid="cta-buttons">
      <Button :loading="resetting" data-testid="reset-button" @click="reset">
        {{ t('settings.appearance.reset') }}
      </Button>
      <Space>
        <Button data-testid="cancel-btn" @click="cancel">
          {{ t('settings.appearance.cancel') }}
        </Button>
        <Button type="primary" :loading="saving" data-testid="save-btn" @click="save">
          {{ t('settings.appearance.save') }}
        </Button>
      </Space>
      </div>
    </Spin>
  </div>
</template>

<style scoped>
.appearance-row {
  display: flex;
  gap: 48px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.appearance-row__field {
  flex: 0 0 50%;
  max-width: 50%;
}

.appearance-row__preview {
  object-fit: contain;
}

.appearance-color-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.appearance-color-control__swatch {
  width: 64px;
  height: 40px;
  flex-shrink: 0;
  cursor: pointer;
}

.appearance-theme-preview {
  align-self: center;
}

.appearance-theme-preview__filled,
.appearance-theme-preview__outlined {
  display: inline-flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: 1px solid;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}

.appearance-theme-preview__filled {
  color: white;
}

.appearance-theme-preview__link {
  font-size: 14px;
  font-weight: 600;
}

.appearance-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
</style>
