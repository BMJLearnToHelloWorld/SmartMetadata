<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Alert, Card, Space, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  title: string;
  lead?: string;
  testId: string;
  errorMessage?: string;
  loading?: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <Space direction="vertical" size="middle" style="width: 100%" :data-testid="testId">
    <Card :loading="loading">
      <RouterLink data-testid="settings-back" :to="{ name: 'admin-settings' }">{{ t('settings.back') }}</RouterLink>
      <Typography.Title :level="4" :data-testid="`${testId}-title`">{{ title }}</Typography.Title>
      <Typography.Paragraph v-if="lead" type="secondary">{{ lead }}</Typography.Paragraph>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
      <slot />
    </Card>
    <slot name="extra" />
  </Space>
</template>
