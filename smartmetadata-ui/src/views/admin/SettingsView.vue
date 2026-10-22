<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
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
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load settings';
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
    message.success('Login configuration saved');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Save login configuration failed');
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
    message.success('Email configuration saved');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Save email configuration failed');
  } finally {
    savingEmail.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Card>
      <Typography.Title :level="4">Settings</Typography.Title>
      <Typography.Paragraph type="secondary">
        Auth is GET /api/v1/system/config/auth. Settings list/update are GET/PUT /api/v1/system/settings.
        Authentication and authorizer documents are not writable through that endpoint (the server
        rejects them). SSO callback implementation is out of scope.
      </Typography.Paragraph>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Descriptions v-if="version" bordered size="small" :column="2" style="margin-bottom: 16px">
        <Descriptions.Item label="Server version">{{ version.version || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Revision">{{ version.revision || '—' }}</Descriptions.Item>
      </Descriptions>
      <Descriptions v-if="authConfig" bordered size="small" :column="1" data-testid="auth-config">
        <Descriptions.Item label="Auth provider">
          {{ ssoProviderLabel(authConfig.provider, authConfig.providerName) }}
        </Descriptions.Item>
        <Descriptions.Item label="Password login">
          {{ supportsPasswordLogin(authConfig.provider) ? 'yes (POST /users/login)' : 'no' }}
        </Descriptions.Item>
        <Descriptions.Item v-if="isSsoOnlyProvider(authConfig.provider)" label="SSO note">
          This console will not start a fake OIDC/SAML browser flow. Authority
          {{ authConfig.authority || '—' }}; callback {{ authConfig.callbackUrl || '—' }}.
        </Descriptions.Item>
        <Descriptions.Item label="Self sign-up">
          {{ authConfig.enableSelfSignup ? 'enabled' : 'disabled' }}
        </Descriptions.Item>
      </Descriptions>
    </Card>

    <Card v-if="loginLoaded" title="Login configuration">
      <Typography.Paragraph type="secondary">
        PUT /api/v1/system/settings with <code>config_type: loginConfiguration</code>.
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label="Max failed login attempts">
          <InputNumber v-model:value="login.maxLoginFailAttempts" :min="1" />
        </Form.Item>
        <Form.Item label="Access block time (seconds)">
          <InputNumber v-model:value="login.accessBlockTime" :min="0" />
        </Form.Item>
        <Form.Item label="JWT expiry (seconds)">
          <InputNumber v-model:value="login.jwtTokenExpiryTime" :min="60" />
        </Form.Item>
        <Button type="primary" :loading="savingLogin" data-testid="save-login-config" @click="saveLogin">
          Save login configuration
        </Button>
      </Form>
    </Card>

    <Card v-if="emailLoaded" title="Email configuration">
      <Typography.Paragraph type="secondary">
        PUT /api/v1/system/settings with <code>config_type: emailConfiguration</code>. Leave password
        unchanged unless you intend to set a new SMTP secret.
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label="Enable SMTP">
          <Switch v-model:checked="email.enableSmtpServer" />
        </Form.Item>
        <Form.Item label="Emailing entity">
          <Input v-model:value="email.emailingEntity" />
        </Form.Item>
        <Form.Item label="Sender mail">
          <Input v-model:value="email.senderMail" />
        </Form.Item>
        <Form.Item label="Server endpoint">
          <Input v-model:value="email.serverEndpoint" />
        </Form.Item>
        <Form.Item label="Server port">
          <InputNumber v-model:value="email.serverPort" :min="1" />
        </Form.Item>
        <Form.Item label="Username">
          <Input v-model:value="email.username" />
        </Form.Item>
        <Form.Item label="Password">
          <Input.Password v-model:value="email.password" />
        </Form.Item>
        <Form.Item label="Transport">
          <Select v-model:value="email.transportationStrategy" allow-clear>
            <Select.Option value="SMTP">SMTP</Select.Option>
            <Select.Option value="SMTPS">SMTPS</Select.Option>
            <Select.Option value="SMTP_TLS">SMTP_TLS</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Support URL">
          <Input v-model:value="email.supportUrl" />
        </Form.Item>
        <Button type="primary" :loading="savingEmail" data-testid="save-email-config" @click="saveEmail">
          Save email configuration
        </Button>
      </Form>
    </Card>

    <Card title="All settings" :loading="loading">
      <Typography.Paragraph type="secondary">
        Search, theme, lineage, MCP, and other settings are listed read-only. PUT exists for the
        collection, but Phase 2 only edits login and email.
      </Typography.Paragraph>
      <Table row-key="configType" :columns="settingColumns" :data-source="settings" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'editable'">
            {{ EDITABLE_SETTING_TYPES.has((record as SystemSetting).configType) ? 'yes' : 'read-only' }}
          </template>
          <template v-else-if="column.key === 'preview'">
            <Typography.Text type="secondary">{{ preview((record as SystemSetting).configValue) }}</Typography.Text>
          </template>
        </template>
      </Table>
    </Card>
  </Space>
</template>
