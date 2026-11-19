<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official EditLoginConfigurationPage (EditLoginConfiguration):
  standalone edit route for the login configuration (R-FIXUP2-1,
  A4 §14 项 7). Load reads the dedicated login-config endpoint and
  resets the form; save PUTs the settings endpoint. Empty fields are
  dropped on the wire. Cancel and successful save both go back
  (pin navigate(-1), here router.back()).
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Button,
  Form,
  InputNumber,
  Space,
  message,
  Spin,
} from 'ant-design-vue';
import { fetchLoginConfig, updateSetting } from '@/api/system';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import type { LoginConfiguration } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.loginConfiguration');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.loginConfiguration');
}
// Pin pageTitle: label.edit-entity { entity: label.login-configuration }
// (EditLoginConfigurationPage.tsx, withPageLayout pageTitle).
const editTitle = computed(() =>
  t('label.edit-entity', { entity: registryTitle(settingsTranslator, registryEntry) }),
);
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
// Pin breadcrumb (EditLoginConfigurationPage.tsx:94-116): Settings >
// Login Configuration (linked to the detail page) > Edit (plain).
// The first two segments reuse the detail page's catalog crumbs; the
// detail crumb is re-linked to its route and the edit crumb appended.
const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => {
  const detailCrumbs = toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'preferences',
      registryTitle(settingsTranslator, registryEntry),
    ),
  );
  return [
    ...detailCrumbs.slice(0, -1),
    {
      label: registryTitle(settingsTranslator, registryEntry),
      routeName: 'settings-preferences-login',
    },
    { label: editTitle.value },
  ];
});

type LoginField = 'maxLoginFailAttempts' | 'accessBlockTime' | 'jwtTokenExpiryTime';
const LOGIN_FIELDS: LoginField[] = [
  'maxLoginFailAttempts',
  'accessBlockTime',
  'jwtTokenExpiryTime',
];

const config = ref<LoginConfiguration | undefined>(undefined);
const loading = ref(false);
const saving = ref(false);
const activeField = ref('');
const saveAttempted = ref(false);
const touched = reactive(new Set<string>());

const form = reactive<Record<LoginField, number | undefined>>({
  maxLoginFailAttempts: undefined,
  accessBlockTime: undefined,
  jwtTokenExpiryTime: undefined,
});

// The InputNumber payload is a number-or-string union; the form fields
// are numbers, so coerce through Number and treat blank input as absent.
function onNumberField(field: LoginField, value: unknown): void {
  if (value === null || value === undefined || value === '') {
    form[field] = undefined;
    return;
  }
  const numeric = Number(value);
  form[field] = Number.isNaN(numeric) ? undefined : numeric;
}

const labels = computed<Record<LoginField, string>>(() => ({
  maxLoginFailAttempts: t('settings.system.maxFail'),
  accessBlockTime: t('settings.system.blockTime'),
  jwtTokenExpiryTime: t('settings.system.jwtExpiry'),
}));

// Official loads via the dedicated login-config endpoint, which returns
// the LoginConfiguration object directly (not wrapped in config_value).
async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    config.value = await fetchLoginConfig();
    initForm();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.login.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function initForm(): void {
  form.maxLoginFailAttempts = config.value?.maxLoginFailAttempts;
  form.accessBlockTime = config.value?.accessBlockTime;
  form.jwtTokenExpiryTime = config.value?.jwtTokenExpiryTime;
  saveAttempted.value = false;
  touched.clear();
}

// Pin handleGoBack (EditLoginConfigurationPage.tsx:147): navigate(-1).
function goBack(): void {
  router.back();
}

// Official minZeroRule: empty is allowed; a provided value must be >= 0.
function fieldError(field: LoginField): string | null {
  const value = form[field];
  if (value == null) {
    return null;
  }
  if (value < 0) {
    return t('settings.login.minZero', { field: labels.value[field] });
  }
  return null;
}

function showError(field: string): boolean {
  return saveAttempted.value || touched.has(field);
}

function onFormFocusIn(event: FocusEvent): void {
  const id = (event.target as HTMLElement | null)?.id ?? '';
  if (id.startsWith('root/')) {
    activeField.value = id;
  }
}

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (LOGIN_FIELDS.some((field) => fieldError(field) !== null)) {
    return;
  }
  saving.value = true;
  try {
    const payload: LoginConfiguration = {
      maxLoginFailAttempts: form.maxLoginFailAttempts,
      accessBlockTime: form.accessBlockTime,
      jwtTokenExpiryTime: form.jwtTokenExpiryTime,
    };
    await updateSetting('loginConfiguration', payload);
    message.success(t('settings.login.saved'));
    goBack();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.login.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadConfig();
});
</script>

<template>
  <div data-testid="edit-login-configuration">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="editTitle"
      :sub-header="subHeader"
      test-id="edit-login-configuration"
    />
    <Spin :spinning="loading">
      <Form layout="vertical" @focusin="onFormFocusIn">
        <Form.Item
          :label="labels.maxLoginFailAttempts"
          :validate-status="showError('maxLoginFailAttempts') && fieldError('maxLoginFailAttempts') ? 'error' : ''"
          :help="showError('maxLoginFailAttempts') ? (fieldError('maxLoginFailAttempts') ?? '') : ''"
        >
          <InputNumber
            :id="`root/maxLoginFailAttempts`"
            :value="form.maxLoginFailAttempts"
            data-testid="maxLoginFailAttempts"
            @update:value="onNumberField('maxLoginFailAttempts', $event)"
            @blur="touched.add('maxLoginFailAttempts')"
          />
        </Form.Item>
        <Form.Item
          :label="labels.accessBlockTime"
          :validate-status="showError('accessBlockTime') && fieldError('accessBlockTime') ? 'error' : ''"
          :help="showError('accessBlockTime') ? (fieldError('accessBlockTime') ?? '') : ''"
        >
          <InputNumber
            :id="`root/accessBlockTime`"
            :value="form.accessBlockTime"
            :min="0"
            data-testid="accessBlockTime"
            @update:value="onNumberField('accessBlockTime', $event)"
            @blur="touched.add('accessBlockTime')"
          />
        </Form.Item>
        <Form.Item
          :label="labels.jwtTokenExpiryTime"
          :validate-status="showError('jwtTokenExpiryTime') && fieldError('jwtTokenExpiryTime') ? 'error' : ''"
          :help="showError('jwtTokenExpiryTime') ? (fieldError('jwtTokenExpiryTime') ?? '') : ''"
        >
          <InputNumber
            :id="`root/jwtTokenExpiryTime`"
            :value="form.jwtTokenExpiryTime"
            data-testid="jwtTokenExpiryTime"
            @update:value="onNumberField('jwtTokenExpiryTime', $event)"
            @blur="touched.add('jwtTokenExpiryTime')"
          />
        </Form.Item>
        <Space>
          <Button data-testid="login-cancel" @click="goBack">
            {{ t('settings.login.cancel') }}
          </Button>
          <Button
            type="primary"
            :loading="saving"
            data-testid="save-login-config"
            @click="save"
          >
            {{ t('settings.system.saveLogin') }}
          </Button>
        </Space>
      </Form>
    </Spin>
  </div>
</template>
