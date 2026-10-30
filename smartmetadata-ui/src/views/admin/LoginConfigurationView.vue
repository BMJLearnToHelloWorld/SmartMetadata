<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LoginConfiguration details + edit fields.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, InputNumber, message } from 'ant-design-vue';
import { getTypedSetting, settingAsLoginConfig, updateSetting } from '@/api/system';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { LoginConfiguration } from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const login = reactive<LoginConfiguration>({});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(login, await getTypedSetting('loginConfiguration', settingAsLoginConfig));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.login.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await updateSetting('loginConfiguration', {
      maxLoginFailAttempts: login.maxLoginFailAttempts,
      accessBlockTime: login.accessBlockTime,
      jwtTokenExpiryTime: login.jwtTokenExpiryTime,
    });
    message.success(t('settings.login.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.login.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="login-configuration"
    :title="t('settings.login.title')"
    :lead="t('settings.login.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Form layout="vertical">
      <Form.Item :label="t('settings.system.maxFail')">
        <InputNumber v-model:value="login.maxLoginFailAttempts" :min="1" data-testid="login-max-fail" />
      </Form.Item>
      <Form.Item :label="t('settings.system.blockTime')">
        <InputNumber v-model:value="login.accessBlockTime" :min="0" data-testid="login-block-time" />
      </Form.Item>
      <Form.Item :label="t('settings.system.jwtExpiry')">
        <InputNumber v-model:value="login.jwtTokenExpiryTime" :min="60" data-testid="login-jwt-expiry" />
      </Form.Item>
      <Button type="primary" :loading="saving" data-testid="save-login-config" @click="save">
        {{ t('settings.system.saveLogin') }}
      </Button>
    </Form>
  </PreferencePageShell>
</template>
