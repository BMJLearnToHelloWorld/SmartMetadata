<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Select, Typography } from 'ant-design-vue';
import { isSsoOnlyProvider, ssoProviderLabel, supportsPasswordLogin } from '@/admin/authProvider';
import { requiredField } from '@/features/crud/formRules';
import { fetchAuthConfig } from '@/api/system';
import { setAppLocale } from '@/i18n';
import { isSupportedLocale } from '@/i18n/localePreference';
import { useAuthStore } from '@/stores/auth';
import type { AuthConfiguration } from '@/types/admin';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { t, locale } = useI18n();

const form = reactive({
  email: '',
  password: '',
});
const submitting = ref(false);
const errorMessage = ref('');
const authConfig = ref<AuthConfiguration | null>(null);
const authConfigError = ref('');

const passwordLogin = computed(() => supportsPasswordLogin(authConfig.value?.provider));
const ssoOnly = computed(() => isSsoOnlyProvider(authConfig.value?.provider));

async function loadAuthConfig(): Promise<void> {
  try {
    authConfig.value = await fetchAuthConfig();
  } catch (error) {
    authConfigError.value = error instanceof Error ? error.message : t('login.authConfigMissing');
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await auth.login(form.email.trim(), form.password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/search';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('login.failed');
  } finally {
    submitting.value = false;
  }
}

function onLocaleChange(value: unknown): void {
  if (isSupportedLocale(value)) {
    setAppLocale(value, locale);
  }
}

onMounted(() => {
  void loadAuthConfig();
});
</script>

<template>
  <div class="login">
    <Card class="login__card">
      <div class="login__head">
        <Typography.Title :level="3">{{ t('login.title') }}</Typography.Title>
        <Select
          data-testid="locale-switcher"
          size="small"
          class="login__locale"
          :value="locale"
          :aria-label="t('chrome.locale')"
          @change="onLocaleChange"
        >
          <Select.Option value="en-US">{{ t('chrome.localeEn') }}</Select.Option>
          <Select.Option value="zh-CN">{{ t('chrome.localeZh') }}</Select.Option>
        </Select>
      </div>
      <Typography.Paragraph type="secondary">
        {{ t('login.lead') }}
      </Typography.Paragraph>
      <Alert
        v-if="authConfigError"
        type="warning"
        show-icon
        :message="t('login.authConfigFailed', { error: authConfigError })"
        class="login__error"
      />
      <Alert
        v-if="ssoOnly"
        data-testid="sso-only-message"
        type="info"
        show-icon
        class="login__error"
        :message="
          t('login.ssoOnly', { provider: ssoProviderLabel(authConfig?.provider, authConfig?.providerName) })
        "
      >
        <template #description>
          <p>{{ t('login.ssoHelp') }}</p>
          <p v-if="authConfig?.authority">{{ t('login.authority', { value: authConfig.authority }) }}</p>
          <p v-if="authConfig?.callbackUrl">{{ t('login.callback', { value: authConfig.callbackUrl }) }}</p>
        </template>
      </Alert>
      <Alert
        v-if="errorMessage"
        data-testid="login-error"
        type="error"
        show-icon
        :message="errorMessage"
        class="login__error"
      />
      <Form v-if="passwordLogin" layout="vertical" :model="form" @finish="onSubmit">
        <Form.Item
          :label="t('login.email')"
          name="email"
          :rules="requiredField(t, t('login.email'))"
        >
          <Input
            v-model:value="form.email"
            data-testid="login-email"
            autocomplete="username"
            placeholder="admin@open-metadata.org"
          />
        </Form.Item>
        <Form.Item
          :label="t('login.password')"
          name="password"
          :rules="requiredField(t, t('login.password'))"
        >
          <Input.Password
            v-model:value="form.password"
            data-testid="login-password"
            autocomplete="current-password"
          />
        </Form.Item>
        <Button
          type="primary"
          html-type="submit"
          block
          :loading="submitting"
          data-testid="login-submit"
        >
          {{ t('login.submit') }}
        </Button>
      </Form>
    </Card>
  </div>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}
.login__card {
  width: 100%;
  max-width: 420px;
}
.login__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.login__head :deep(.ant-typography) {
  margin-bottom: 0;
}
.login__locale {
  min-width: 104px;
  margin-top: 6px;
}
.login__error {
  margin-bottom: 16px;
}
</style>
