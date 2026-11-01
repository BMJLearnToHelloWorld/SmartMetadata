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

/** Page-not-found page (official PageNotFound equivalent, catch-all route). */
const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <PageLayout :document-title="t('errors.notFound')" test-id="not-found-view">
    <PageHeader :header="t('errors.notFound')" :sub-header="t('errors.notFoundLead')" test-id="not-found-header" />
    <Button type="primary" @click="router.push({ name: 'home' })">{{ t('errors.backHome') }}</Button>
  </PageLayout>
</template>
