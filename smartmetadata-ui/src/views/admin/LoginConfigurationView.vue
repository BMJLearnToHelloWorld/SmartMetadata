<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LoginConfigurationPage + EditLoginConfigurationPage, rendered
  as view-internal detail/edit modes until the shell batch lands the §4.4
  edit routes. Load reads the dedicated login-config endpoint; save PUTs
  the settings endpoint. Empty fields are dropped on the wire.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Col,
  Form,
  InputNumber,
  Row,
  Space,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import { fetchLoginConfig, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { LoginConfiguration } from '@/types/admin';

const { t } = useI18n();

type LoginField = 'maxLoginFailAttempts' | 'accessBlockTime' | 'jwtTokenExpiryTime';
const LOGIN_FIELDS: LoginField[] = [
  'maxLoginFailAttempts',
  'accessBlockTime',
  'jwtTokenExpiryTime',
];

const config = ref<LoginConfiguration | undefined>(undefined);
const loading = ref(false);
const editMode = ref(false);
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

const hints = computed<Record<LoginField, string>>(() => ({
  maxLoginFailAttempts: t('settings.login.maxFailHint'),
  accessBlockTime: t('settings.login.blockTimeHint'),
  jwtTokenExpiryTime: t('settings.login.jwtHint'),
}));

const valueTestIds: Record<LoginField, string> = {
  maxLoginFailAttempts: 'max-login-fail-attempts',
  accessBlockTime: 'access-block-time',
  jwtTokenExpiryTime: 'jwt-token-expiry-time',
};

// Official loads via the dedicated login-config endpoint, which returns
// the LoginConfiguration object directly (not wrapped in config_value).
async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    config.value = await fetchLoginConfig();
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

function enterEdit(): void {
  initForm();
  editMode.value = true;
}

function cancelEdit(): void {
  editMode.value = false;
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
    editMode.value = false;
    await loadConfig();
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
  <PreferencePageShell
    test-id="login-configuration"
    :title="t('settings.login.title')"
    :lead="t('settings.login.lead')"
    :loading="loading"
  >
    <template v-if="!editMode">
      <div class="login-actions">
        <Button type="default" data-testid="edit-button" @click="enterEdit">
          <EditOutlined />
          {{ t('settings.login.edit') }}
        </Button>
      </div>
      <Row :gutter="[16, 16]">
        <Col v-for="field in LOGIN_FIELDS" :key="field" :span="12">
          <Space>
            <Typography.Text type="secondary">{{ labels[field] }}</Typography.Text>
            <Tooltip placement="top" :title="hints[field]">
              <InfoCircleOutlined :data-testid="`${valueTestIds[field]}-info`" />
            </Tooltip>
          </Space>
          <div :data-testid="valueTestIds[field]">
            <template v-if="field === 'jwtTokenExpiryTime'">
              {{ config?.jwtTokenExpiryTime ?? '--' }} {{ t('settings.login.seconds') }}
            </template>
            <template v-else>{{ config?.[field] ?? '--' }}</template>
          </div>
        </Col>
      </Row>
    </template>
    <template v-else>
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
          <Button data-testid="login-cancel" @click="cancelEdit">
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
    </template>
  </PreferencePageShell>
</template>

<style scoped>
.login-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
</style>
