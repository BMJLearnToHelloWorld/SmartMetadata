<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official EmailConfigSettingsPage fields.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Form, Input, InputNumber, Select, Spin, Switch, message } from 'ant-design-vue';
import { getTypedSetting, settingAsEmailConfig, updateSetting } from '@/api/system';
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
import type { EmailConfiguration } from '@/types/admin';

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
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const email = reactive<EmailConfiguration>({});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    Object.assign(email, await getTypedSetting('emailConfiguration', settingAsEmailConfig));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.email.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const payload = { ...email };
    if (!payload.password) {
      delete payload.password;
    }
    await updateSetting('emailConfiguration', payload);
    message.success(t('settings.email.saved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.email.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
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
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Form layout="vertical">
        <Form.Item :label="t('settings.system.enableSmtp')">
          <Switch v-model:checked="email.enableSmtpServer" data-testid="email-enable-smtp" />
        </Form.Item>
        <Form.Item :label="t('settings.system.emailingEntity')">
          <Input v-model:value="email.emailingEntity" data-testid="email-entity" />
        </Form.Item>
        <Form.Item :label="t('settings.system.senderMail')">
          <Input v-model:value="email.senderMail" data-testid="email-sender" />
        </Form.Item>
        <Form.Item :label="t('settings.system.serverEndpoint')">
          <Input v-model:value="email.serverEndpoint" data-testid="email-endpoint" />
        </Form.Item>
        <Form.Item :label="t('settings.system.serverPort')">
          <InputNumber v-model:value="email.serverPort" :min="1" data-testid="email-port" />
        </Form.Item>
        <Form.Item :label="t('settings.system.username')">
          <Input v-model:value="email.username" data-testid="email-username" />
        </Form.Item>
        <Form.Item :label="t('settings.system.password')">
          <Input.Password v-model:value="email.password" data-testid="email-password" />
        </Form.Item>
        <Form.Item :label="t('settings.system.transport')">
          <Select v-model:value="email.transportationStrategy" allow-clear data-testid="email-transport">
            <Select.Option value="SMTP">SMTP</Select.Option>
            <Select.Option value="SMTPS">SMTPS</Select.Option>
            <Select.Option value="SMTP_TLS">SMTP_TLS</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('settings.system.supportUrl')">
          <Input v-model:value="email.supportUrl" data-testid="email-support" />
        </Form.Item>
        <Button type="primary" :loading="saving" data-testid="save-email-config" @click="save">
          {{ t('settings.system.saveEmail') }}
        </Button>
      </Form>
    </Spin>
  </div>
</template>
