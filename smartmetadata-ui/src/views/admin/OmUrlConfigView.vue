<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official UrlConfigurationPage + EditUrlConfigurationPage, rendered as
  view-internal detail/edit modes until the shell batch lands the §4.4
  edit routes. The edit form validates the URL as an http(s) hyperlink.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Col, Form, Input, Row, Space, Typography, message, Spin } from 'ant-design-vue';
import type { SsoSettingSource } from '@/admin/ssoSettingsSource';
import {
  getSettingsSource,
  getTypedSetting,
  settingAsOmUrl,
  updateSetting,
} from '@/api/system';
import SettingsSourceBanner from '@/components/shared/SettingsSourceBanner.vue';
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
import { findSettingSource, isPathManaged } from '@/utils/settingsSource';

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

const openMetadataUrl = ref<string | undefined>(undefined);
const loading = ref(false);
const sourcesLoading = ref(false);
const sources = ref<SsoSettingSource[]>([]);
const editMode = ref(false);
const saving = ref(false);
const activeField = ref('');
const urlValue = ref('');
const saveAttempted = ref(false);
const urlTouched = ref(false);

const omUrlSource = computed(() =>
  findSettingSource(sources.value, 'openMetadataBaseUrlConfiguration'),
);
const isManaged = computed(() => isPathManaged(omUrlSource.value, '/openMetadataUrl'));

// Official getHyperlinkUrlValidationErrorKey: empty passes this rule (the
// required rule owns emptiness); an unparseable value is an invalid URL; a
// parseable non-http(s) value must use http or https.
function hyperlinkError(value: string): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return t('settings.omUrl.urlMustUseHttpOrHttps');
    }
    return null;
  } catch {
    return t('settings.omUrl.invalidUrl');
  }
}

function urlError(): string | null {
  if (!urlValue.value) {
    return t('settings.omUrl.fieldRequired', { field: t('settings.omUrl.url') });
  }
  return hyperlinkError(urlValue.value);
}

function showError(): boolean {
  return saveAttempted.value || urlTouched.value;
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const parsed = await getTypedSetting(
      'openMetadataBaseUrlConfiguration',
      settingAsOmUrl,
    );
    openMetadataUrl.value = parsed.openMetadataUrl;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.omUrl.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadSources(): Promise<void> {
  sourcesLoading.value = true;
  try {
    sources.value = await getSettingsSource();
  } catch {
    sources.value = [];
  } finally {
    sourcesLoading.value = false;
  }
}

function enterEdit(): void {
  urlValue.value = openMetadataUrl.value ?? '';
  saveAttempted.value = false;
  urlTouched.value = false;
  editMode.value = true;
}

function cancelEdit(): void {
  editMode.value = false;
}

function onFormFocusIn(event: FocusEvent): void {
  const id = (event.target as HTMLElement | null)?.id ?? '';
  if (id.startsWith('root/')) {
    activeField.value = id;
  }
}

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (urlError() !== null) {
    return;
  }
  saving.value = true;
  try {
    await updateSetting('openMetadataBaseUrlConfiguration', {
      openMetadataUrl: urlValue.value,
    });
    message.success(t('settings.omUrl.saved'));
    editMode.value = false;
    await loadConfig();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.omUrl.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadConfig();
  void loadSources();
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
    <Spin :spinning="loading">
    <SettingsSourceBanner
      :sources="sources"
      :on-refetch="loadSources"
      :on-adopted="loadConfig"
    />
    <template v-if="!editMode">
      <div class="om-url-actions">
        <Button
          v-if="!sourcesLoading && !isManaged"
          data-testid="edit-button"
          @click="enterEdit"
        >
          {{ t('settings.omUrl.edit') }}
        </Button>
      </div>
      <Row :gutter="[16, 16]">
        <Col :span="12">
          <Typography.Text type="secondary">{{ t('settings.omUrl.url') }}</Typography.Text>
          <div data-testid="open-metadata-url">{{ openMetadataUrl ?? '--' }}</div>
        </Col>
      </Row>
    </template>
    <template v-else>
      <Form layout="vertical" @focusin="onFormFocusIn">
        <Form.Item
          :label="t('settings.omUrl.url')"
          required
          :validate-status="showError() && urlError() ? 'error' : ''"
          :help="showError() ? (urlError() ?? '') : ''"
        >
          <Input
            :id="`root/openMetadataUrl-input`"
            :value="urlValue"
            data-testid="open-metadata-url-input"
            :disabled="isManaged"
            @update:value="urlValue = $event"
            @blur="urlTouched = true"
          />
        </Form.Item>
        <Space>
          <Button data-testid="cancel-button" @click="cancelEdit">
            {{ t('settings.omUrl.cancel') }}
          </Button>
          <Button
            v-if="!isManaged"
            type="primary"
            :loading="saving"
            data-testid="save-button"
            @click="save"
          >
            {{ t('settings.omUrl.save') }}
          </Button>
        </Space>
      </Form>
    </template>
    </Spin>
  </div>
</template>

<style scoped>
.om-url-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
</style>
