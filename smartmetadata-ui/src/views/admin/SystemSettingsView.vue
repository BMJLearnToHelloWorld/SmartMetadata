<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'ant-design-vue';
import { isSsoOnlyProvider, ssoProviderLabel, supportsPasswordLogin } from '@/admin/authProvider';
import {
  EDITABLE_SETTING_TYPES,
  fetchAuthConfig,
  fetchServerVersion,
  getSetting,
  listSettings,
  settingAsEmailConfig,
  settingAsLoginConfig,
  updateSetting,
} from '@/api/system';
import type {
  AuthConfiguration,
  EmailConfiguration,
  LoginConfiguration,
  ServerVersion,
  SystemSetting,
} from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const version = ref<ServerVersion | null>(null);
const authConfig = ref<AuthConfiguration | null>(null);
const settings = ref<SystemSetting[]>([]);
const login = reactive<LoginConfiguration>({});
const email = reactive<EmailConfiguration>({});
const loginLoaded = ref(false);
const emailLoaded = ref(false);
const savingLogin = ref(false);
const savingEmail = ref(false);

const settingColumns = [
  { title: 'Type', dataIndex: 'configType', key: 'configType', width: 280 },
  { title: 'Editable here', key: 'editable', width: 140 },
  { title: 'Value preview', key: 'preview' },
];

function preview(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  } catch {
    return String(value);
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [ver, auth, listed] = await Promise.all([
      fetchServerVersion().catch(() => null),
      fetchAuthConfig().catch(() => null),
      listSettings(),
    ]);
    version.value = ver;
    authConfig.value = auth;
    settings.value = listed.data;
    const loginSetting = listed.data.find((item) => item.configType === 'loginConfiguration');
    const emailSetting = listed.data.find((item) => item.configType === 'emailConfiguration');
    if (loginSetting) {
      Object.assign(login, settingAsLoginConfig(loginSetting.configValue));
      loginLoaded.value = true;
    } else {
      const fetched = await getSetting('loginConfiguration').catch(() => null);
      if (fetched) {
        Object.assign(login, settingAsLoginConfig(fetched.configValue));
        loginLoaded.value = true;
      }
    }
    if (emailSetting) {
      Object.assign(email, settingAsEmailConfig(emailSetting.configValue));
      emailLoaded.value = true;
    } else {
      const fetched = await getSetting('emailConfiguration').catch(() => null);
      if (fetched) {
        Object.assign(email, settingAsEmailConfig(fetched.configValue));
        emailLoaded.value = true;
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.system.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function saveLogin(): Promise<void> {
  savingLogin.value = true;
  try {
    await updateSetting('loginConfiguration', {
      maxLoginFailAttempts: login.maxLoginFailAttempts,
      accessBlockTime: login.accessBlockTime,
      jwtTokenExpiryTime: login.jwtTokenExpiryTime,
    });
    message.success(t('settings.system.loginSaved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.system.loginSaveFailed'));
  } finally {
    savingLogin.value = false;
  }
}

async function saveEmail(): Promise<void> {
  savingEmail.value = true;
  try {
    const payload = { ...email };
    if (!payload.password) {
      delete payload.password;
    }
    await updateSetting('emailConfiguration', payload);
    message.success(t('settings.system.emailSaved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.system.emailSaveFailed'));
  } finally {
    savingEmail.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Space direction="vertical" size="middle" style="width: 100%" data-testid="system-settings">
    <Card>
      <RouterLink data-testid="settings-back" :to="{ name: 'admin-settings' }">{{ t('settings.back') }}</RouterLink>
      <Typography.Title :level="4" data-testid="system-settings-title">{{ t('settings.system.title') }}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {{ t('settings.system.lead') }}
      </Typography.Paragraph>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Descriptions v-if="version" bordered size="small" :column="2" style="margin-bottom: 16px">
        <Descriptions.Item :label="t('settings.system.serverVersion')">{{ version.version || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('settings.system.revision')">{{ version.revision || '—' }}</Descriptions.Item>
      </Descriptions>
      <Descriptions v-if="authConfig" bordered size="small" :column="1" data-testid="auth-config">
        <Descriptions.Item :label="t('settings.system.authProvider')">
          {{ ssoProviderLabel(authConfig.provider, authConfig.providerName) }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('settings.system.passwordLogin')">
          {{
            supportsPasswordLogin(authConfig.provider)
              ? t('settings.system.passwordLoginYes')
              : t('settings.system.passwordLoginNo')
          }}
        </Descriptions.Item>
        <Descriptions.Item v-if="isSsoOnlyProvider(authConfig.provider)" :label="t('settings.system.ssoNote')">
          {{ t('settings.system.ssoNoteBody', { authority: authConfig.authority || '—', callback: authConfig.callbackUrl || '—' }) }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('settings.system.selfSignup')">
          {{ authConfig.enableSelfSignup ? t('settings.system.enabled') : t('settings.system.disabled') }}
        </Descriptions.Item>
      </Descriptions>
    </Card>

    <Card v-if="loginLoaded" :title="t('settings.system.loginTitle')">
      <Typography.Paragraph type="secondary">
        {{ t('settings.system.loginLead') }}
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item :label="t('settings.system.maxFail')">
          <InputNumber v-model:value="login.maxLoginFailAttempts" :min="1" />
        </Form.Item>
        <Form.Item :label="t('settings.system.blockTime')">
          <InputNumber v-model:value="login.accessBlockTime" :min="0" />
        </Form.Item>
        <Form.Item :label="t('settings.system.jwtExpiry')">
          <InputNumber v-model:value="login.jwtTokenExpiryTime" :min="60" />
        </Form.Item>
        <Button type="primary" :loading="savingLogin" data-testid="save-login-config" @click="saveLogin">
          {{ t('settings.system.saveLogin') }}
        </Button>
      </Form>
    </Card>

    <Card v-if="emailLoaded" :title="t('settings.system.emailTitle')">
      <Typography.Paragraph type="secondary">
        {{ t('settings.system.emailLead') }}
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item :label="t('settings.system.enableSmtp')">
          <Switch v-model:checked="email.enableSmtpServer" />
        </Form.Item>
        <Form.Item :label="t('settings.system.emailingEntity')">
          <Input v-model:value="email.emailingEntity" />
        </Form.Item>
        <Form.Item :label="t('settings.system.senderMail')">
          <Input v-model:value="email.senderMail" />
        </Form.Item>
        <Form.Item :label="t('settings.system.serverEndpoint')">
          <Input v-model:value="email.serverEndpoint" />
        </Form.Item>
        <Form.Item :label="t('settings.system.serverPort')">
          <InputNumber v-model:value="email.serverPort" :min="1" />
        </Form.Item>
        <Form.Item :label="t('settings.system.username')">
          <Input v-model:value="email.username" />
        </Form.Item>
        <Form.Item :label="t('settings.system.password')">
          <Input.Password v-model:value="email.password" />
        </Form.Item>
        <Form.Item :label="t('settings.system.transport')">
          <Select v-model:value="email.transportationStrategy" allow-clear>
            <Select.Option value="SMTP">SMTP</Select.Option>
            <Select.Option value="SMTPS">SMTPS</Select.Option>
            <Select.Option value="SMTP_TLS">SMTP_TLS</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('settings.system.supportUrl')">
          <Input v-model:value="email.supportUrl" />
        </Form.Item>
        <Button type="primary" :loading="savingEmail" data-testid="save-email-config" @click="saveEmail">
          {{ t('settings.system.saveEmail') }}
        </Button>
      </Form>
    </Card>

    <Card :title="t('settings.system.allTitle')" :loading="loading">
      <Typography.Paragraph type="secondary">
        {{ t('settings.system.allLead') }}
      </Typography.Paragraph>
      <Table row-key="configType" :columns="settingColumns" :data-source="settings" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'editable'">
            {{
              EDITABLE_SETTING_TYPES.has((record as SystemSetting).configType)
                ? t('settings.system.editable')
                : t('settings.system.readOnly')
            }}
          </template>
          <template v-else-if="column.key === 'preview'">
            <Typography.Text type="secondary">{{ preview((record as SystemSetting).configValue) }}</Typography.Text>
          </template>
        </template>
      </Table>
    </Card>
  </Space>
</template>
