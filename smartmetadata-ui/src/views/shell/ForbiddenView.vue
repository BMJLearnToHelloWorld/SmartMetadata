<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';

/**
 * Access-not-allowed page (official AccessNotAllowedPage equivalent).
 * Admin routes are gated by router/guards.ts (isAdminUser from the
 * profile || hasPermission); this page is the denial target, not the
 * enforcement itself.
 */
const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <PageLayout :document-title="t('errors.forbidden')" test-id="forbidden-view">
    <PageHeader :header="t('errors.forbidden')" :sub-header="t('errors.forbiddenLead')" test-id="forbidden-header" />
    <Button type="primary" @click="router.push({ name: 'home' })">{{ t('errors.backHome') }}</Button>
  </PageLayout>
</template>
