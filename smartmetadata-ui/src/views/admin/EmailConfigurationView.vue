<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official EmailConfigSettingsPage + EditEmailConfigPage + EmailConfigForm
  + TestEmail, rendered as view-internal detail/edit modes until the shell
  batch lands the §4.4 edit routes. Detail: sorted keys minus templates.
  Edit: the 9-field form, masked-password rule, deployment-managed gating.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Switch,
  Typography,
  message,
  Spin,
} from 'ant-design-vue';
import {
  getSetting,
  getSettingsSource,
  testEmailConnection,
  updateSetting,
} from '@/api/system';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import SettingsSourceBanner from '@/components/shared/SettingsSourceBanner.vue';
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
import { usePermissionStore } from '@/stores/permissions';
import type { EmailConfiguration } from '@/types/admin';
import {
  areAllPathsManaged,
  findSettingSource,
  isPathManaged,
  toJsonPointer,
  type SettingSource,
} from '@/utils/settingsSource';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.email');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.email');
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
const permissionStore = usePermissionStore();

const MASKED_PASSWORD_VALUE = '*********';
const EMAIL_REG_EX = /^\S+@\S+\.\S+$/;

// Official EMAIL_CONFIG_FORM_FIELDS (EmailConfig.constants): the fields
// the form lets an admin edit, in form order.
const EMAIL_CONFIG_FORM_FIELDS = [
  'username',
  'password',
  'senderMail',
  'serverEndpoint',
  'serverPort',
  'emailingEntity',
  'enableSmtpServer',
  'supportUrl',
  'transportationStrategy',
] as const;
type EmailFormField = (typeof EMAIL_CONFIG_FORM_FIELDS)[number];
const EMAIL_FORM_POINTERS = EMAIL_CONFIG_FORM_FIELDS.map((field) => toJsonPointer(field));
const NOT_INCLUDE_EMAIL_CONFIG_VALUE = ['templates'];

// Official EMAIL_CONFIG_FIELD_LABEL_KEYS (EmailConfigUtils): unknown
// fields map to an empty label.
const EMAIL_FIELD_LABEL_KEYS: Record<string, string> = {
  emailingEntity: 'settings.system.emailingEntity',
  enableSmtpServer: 'settings.system.enableSmtp',
  openMetadataUrl: 'settings.omUrl.url',
  password: 'settings.system.password',
  senderMail: 'settings.system.senderMail',
  serverEndpoint: 'settings.system.serverEndpoint',
  serverPort: 'settings.system.serverPort',
  supportUrl: 'settings.system.supportUrl',
  transportationStrategy: 'settings.system.transport',
  username: 'settings.system.username',
};

function fieldLabel(field: string): string {
  const key = EMAIL_FIELD_LABEL_KEYS[field];
  return key ? t(key) : '';
}

type EmailFormState = {
  username: string;
  password: string;
  senderMail: string;
  serverEndpoint: string;
  serverPort: number | undefined;
  emailingEntity: string;
  enableSmtpServer: boolean;
  supportUrl: string;
  transportationStrategy: string | undefined;
};

const config = ref<Record<string, unknown> | undefined>(undefined);
const loading = ref(false);
const sourcesLoading = ref(false);
const sources = ref<SettingSource[]>([]);
const editMode = ref(false);
const saving = ref(false);
const activeField = ref('');
const saveAttempted = ref(false);
const touched = reactive(new Set<string>());
const testModalOpen = ref(false);
const testEmail = ref('');
const testEmailTouched = ref(false);
const testSending = ref(false);

const form = reactive<EmailFormState>({
  username: '',
  password: '',
  senderMail: '',
  serverEndpoint: '',
  serverPort: undefined,
  emailingEntity: '',
  enableSmtpServer: false,
  supportUrl: '',
  transportationStrategy: undefined,
});

const isAdminUser = computed(() => permissionStore.isAdminUser);

// The InputNumber payload is a number-or-string union; the form field is
// a number, so coerce through Number and treat blank input as absent.
function onServerPortChange(value: unknown): void {
  if (value === null || value === undefined || value === '') {
    form.serverPort = undefined;
    return;
  }
  const numeric = Number(value);
  form.serverPort = Number.isNaN(numeric) ? undefined : numeric;
}

function onStrategySelect(value: unknown): void {
  form.transportationStrategy = typeof value === 'string' ? value : undefined;
}
const emailSource = computed(() => findSettingSource(sources.value, 'emailConfiguration'));
const isManagedByDeployment = computed(() =>
  areAllPathsManaged(emailSource.value, EMAIL_FORM_POINTERS),
);
const managedFields = computed<EmailFormField[]>(() =>
  EMAIL_CONFIG_FORM_FIELDS.filter((field) =>
    isPathManaged(emailSource.value, toJsonPointer(field)),
  ),
);
function isManaged(field: EmailFormField): boolean {
  return managedFields.value.includes(field);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function initForm(): void {
  const values = config.value ?? {};
  form.username = asString(values.username) ?? '';
  form.password = asString(values.password) ?? '';
  form.senderMail = asString(values.senderMail) ?? '';
  form.serverEndpoint = asString(values.serverEndpoint) ?? '';
  form.serverPort = asNumber(values.serverPort);
  form.emailingEntity = asString(values.emailingEntity) ?? '';
  form.enableSmtpServer = Boolean(values.enableSmtpServer);
  form.supportUrl = asString(values.supportUrl) ?? '';
  form.transportationStrategy = asString(values.transportationStrategy) || undefined;
  saveAttempted.value = false;
  touched.clear();
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const setting = await getSetting('emailConfiguration');
    config.value = isRecord(setting.configValue) ? setting.configValue : undefined;
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : t('settings.email.loadFailed'),
    );
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

interface DetailRow {
  key: string;
  title: string;
  display: string;
}

const detailRows = computed<DetailRow[] | null>(() => {
  if (config.value === undefined) {
    return null;
  }
  return Object.keys(config.value)
    .sort()
    .filter((key) => !NOT_INCLUDE_EMAIL_CONFIG_VALUE.includes(key))
    .map((key) => {
      const raw = config.value?.[key];
      let display: string;
      if (typeof raw === 'boolean' || typeof raw === 'number') {
        display = `${raw}`;
      } else if (typeof raw === 'string') {
        display = raw;
      } else if (raw == null || raw === '') {
        display = '--';
      } else {
        display = JSON.stringify(raw);
      }
      if (display === '') {
        display = '--';
      }
      return { key, title: fieldLabel(key), display };
    });
});

function fieldError(field: EmailFormField): string | null {
  if (field === 'senderMail' && !form.senderMail) {
    return t('settings.email.fieldRequired', { field: t('settings.system.senderMail') });
  }
  if (field === 'serverEndpoint' && !form.serverEndpoint) {
    return t('settings.email.fieldRequired', { field: t('settings.system.serverEndpoint') });
  }
  if (field === 'serverPort' && form.serverPort == null) {
    return t('settings.email.fieldRequired', { field: t('settings.system.serverPort') });
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

function enterEdit(): void {
  initForm();
  editMode.value = true;
}

function cancelEdit(): void {
  editMode.value = false;
}

// Official toSmtpSettings(values) with no original: the payload holds only
// the 9 form fields; empty optional strings become undefined (dropped on
// the wire), and the masked password placeholder is deleted so an untouched
// password field never overwrites the stored secret.
function toSmtpSettingsPayload(): EmailConfiguration {
  const payload: EmailConfiguration = {
    serverEndpoint: form.serverEndpoint,
    serverPort: Number(form.serverPort),
    transportationStrategy: form.transportationStrategy,
    enableSmtpServer: form.enableSmtpServer,
    senderMail: form.senderMail,
    emailingEntity: form.emailingEntity || undefined,
    username: form.username || undefined,
    password: form.password || undefined,
    supportUrl: form.supportUrl || undefined,
  };
  if (payload.password === MASKED_PASSWORD_VALUE) {
    delete payload.password;
  }
  return payload;
}

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (
    fieldError('senderMail') !== null ||
    fieldError('serverEndpoint') !== null ||
    fieldError('serverPort') !== null
  ) {
    return;
  }
  saving.value = true;
  try {
    await updateSetting('emailConfiguration', toSmtpSettingsPayload());
    message.success(t('settings.email.saved'));
    editMode.value = false;
    await loadConfig();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.email.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function openTestModal(): void {
  testEmail.value = '';
  testEmailTouched.value = false;
  testModalOpen.value = true;
}

function closeTestModal(): void {
  testModalOpen.value = false;
}

function testEmailError(): string | null {
  if (!testEmail.value) {
    return t('settings.email.fieldRequired', { field: t('settings.email.emailLabel') });
  }
  if (!EMAIL_REG_EX.test(testEmail.value)) {
    return t('settings.email.invalidEmail', { field: t('settings.email.emailLabel') });
  }
  return null;
}

async function submitTestEmail(): Promise<void> {
  testEmailTouched.value = true;
  if (testEmailError() !== null) {
    return;
  }
  testSending.value = true;
  try {
    const body = await testEmailConnection(testEmail.value);
    message.success(testEmailResponseMessage(body));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.email.testFailed'));
  } finally {
    testSending.value = false;
    // Official TestEmail closes the modal in `finally`, even on failure.
    closeTestModal();
  }
}

function testEmailResponseMessage(body: string): string {
  if (body.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // Not a JSON string after all; fall through to the raw body.
    }
  }
  return body;
}

onMounted(() => {
  void loadConfig();
  void loadSources();
});
</script>

<template>
  <div data-testid="email-configuration">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="email-configuration"
    />
    <Spin :spinning="loading">
    <div class="email-actions">
      <Space>
        <Button
          v-if="isAdminUser && config?.senderMail"
          type="primary"
          data-testid="test-email-button"
          @click="openTestModal"
        >
          {{ t('settings.email.testEmail') }}
        </Button>
        <Skeleton.Button v-if="loading || sourcesLoading" active />
        <Button
          v-else-if="!isManagedByDeployment && !editMode"
          data-testid="edit-email-configuration"
          @click="enterEdit"
        >
          <EditOutlined v-if="config !== undefined" />
          {{ config === undefined ? t('settings.email.add') : t('settings.email.edit') }}
        </Button>
      </Space>
    </div>
    <SettingsSourceBanner
      :sources="sources"
      :on-refetch="loadSources"
      :on-adopted="loadConfig"
    />
    <template v-if="!editMode">
      <Skeleton v-if="loading" :paragraph="{ rows: 8 }" active />
      <div v-else-if="config === undefined" class="email-placeholder">
        <CreatePlaceholder
          :heading="t('settings.email.configLowercase')"
          :title="t('settings.email.configLowercase')"
          :permission-value="t('settings.email.createConfig')"
          :test-id="`create-error-placeholder-${t('settings.email.configLowercase')}`"
        />
      </div>
      <Row v-else :gutter="[16, 16]">
        <Col v-for="row in detailRows" :key="row.key" :span="12">
          <Typography.Text type="secondary">{{ `${row.title}:` }}</Typography.Text>
          <div>{{ row.display }}</div>
        </Col>
      </Row>
    </template>
    <template v-else>
      <Skeleton v-if="loading" active />
      <Form v-else layout="vertical" data-testid="email-config-form" @focusin="onFormFocusIn">
        <Form.Item :label="t('settings.system.username')">
          <Input
            :id="`root/username`"
            :value="form.username"
            data-testid="username-input"
            :disabled="isManaged('username')"
            @update:value="form.username = $event"
            @blur="touched.add('username')"
          />
        </Form.Item>
        <Form.Item :label="t('settings.system.password')">
          <Input.Password
            :id="`root/password`"
            :value="form.password"
            data-testid="password-input"
            :disabled="isManaged('password')"
            @update:value="form.password = $event"
            @blur="touched.add('password')"
          />
        </Form.Item>
        <Form.Item
          :label="t('settings.system.senderMail')"
          required
          :validate-status="showError('senderMail') && fieldError('senderMail') ? 'error' : ''"
          :help="showError('senderMail') ? (fieldError('senderMail') ?? '') : ''"
        >
          <Input
            :id="`root/senderMail`"
            :value="form.senderMail"
            data-testid="sender-email-input"
            :disabled="isManaged('senderMail')"
            @update:value="form.senderMail = $event"
            @blur="touched.add('senderMail')"
          />
        </Form.Item>
        <Form.Item
          :label="t('settings.system.serverEndpoint')"
          required
          :validate-status="showError('serverEndpoint') && fieldError('serverEndpoint') ? 'error' : ''"
          :help="showError('serverEndpoint') ? (fieldError('serverEndpoint') ?? '') : ''"
        >
          <Input
            :id="`root/serverEndpoint`"
            :value="form.serverEndpoint"
            data-testid="server-endpoint-input"
            :disabled="isManaged('serverEndpoint')"
            @update:value="form.serverEndpoint = $event"
            @blur="touched.add('serverEndpoint')"
          />
        </Form.Item>
        <Form.Item
          :label="t('settings.system.serverPort')"
          required
          :validate-status="showError('serverPort') && fieldError('serverPort') ? 'error' : ''"
          :help="showError('serverPort') ? (fieldError('serverPort') ?? '') : ''"
        >
          <InputNumber
            :id="`root/serverPort`"
            :value="form.serverPort"
            data-testid="server-port-input"
            :disabled="isManaged('serverPort')"
            @update:value="onServerPortChange"
            @blur="touched.add('serverPort')"
          />
        </Form.Item>
        <Form.Item :label="t('settings.system.emailingEntity')">
          <Input
            :id="`root/emailingEntity`"
            :value="form.emailingEntity"
            data-testid="emailing-entity-input"
            :disabled="isManaged('emailingEntity')"
            @update:value="form.emailingEntity = $event"
            @blur="touched.add('emailingEntity')"
          />
        </Form.Item>
        <Form.Item :label="t('settings.system.enableSmtp')">
          <Switch
            :id="`root/enableSmtpServer`"
            :checked="form.enableSmtpServer"
            data-testid="smtp-server-input"
            :disabled="isManaged('enableSmtpServer')"
            @update:checked="form.enableSmtpServer = Boolean($event)"
          />
        </Form.Item>
        <Form.Item :label="t('settings.system.supportUrl')">
          <Input
            :id="`root/supportUrl`"
            :value="form.supportUrl"
            data-testid="support-url-input"
            :disabled="isManaged('supportUrl')"
            @update:value="form.supportUrl = $event"
            @blur="touched.add('supportUrl')"
          />
        </Form.Item>
        <Form.Item :label="t('settings.system.transport')">
          <Select
            :value="form.transportationStrategy"
            data-testid="transportation-strategy-input"
            :disabled="isManaged('transportationStrategy')"
            allow-clear
            @update:value="onStrategySelect"
            @blur="touched.add('transportationStrategy')"
          >
            <Select.Option value="SMTP">SMTP</Select.Option>
            <Select.Option value="SMTPS">SMTPS</Select.Option>
            <Select.Option value="SMTP_TLS">SMTP_TLS</Select.Option>
          </Select>
        </Form.Item>
        <Space>
          <Button data-testid="email-cancel" @click="cancelEdit">
            {{ t('settings.email.cancel') }}
          </Button>
          <Button
            v-if="!isManagedByDeployment"
            type="primary"
            :loading="saving"
            data-testid="save-email-config"
            @click="save"
          >
            {{ t('settings.system.saveEmail') }}
          </Button>
        </Space>
      </Form>
    </template>
    <Modal
      :open="testModalOpen"
      :title="t('settings.email.testEmailConnection')"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :confirm-loading="testSending"
      :ok-text="t('settings.email.test')"
      data-testid="test-email-modal"
      @cancel="closeTestModal"
      @ok="submitTestEmail"
    >
      <Form layout="vertical" data-testid="test-email-form">
        <Form.Item
          :label="t('settings.email.emailLabel')"
          required
          :validate-status="testEmailTouched && testEmailError() ? 'error' : ''"
          :help="testEmailTouched ? (testEmailError() ?? '') : ''"
        >
          <Input
            v-model:value="testEmail"
            data-testid="test-email-input"
            :placeholder="t('settings.email.testEmailPlaceholder')"
            autofocus
            @blur="testEmailTouched = true"
          />
        </Form.Item>
      </Form>
    </Modal>
    </Spin>
  </div>
</template>

<style scoped>
.email-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.email-placeholder {
  position: relative;
  min-height: 240px;
}
</style>
