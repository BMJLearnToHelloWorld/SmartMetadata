<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Learning Center resources list (GET /v1/learning/resources).
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Col, Empty, Row, Spin, Tag } from 'ant-design-vue';
import { listLearningResources } from '@/api/learningResources';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { learningResourcesBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';
import type { LearningResource } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.learning-resources');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.learning-resources');
}
// Pin LearningResourcesPage header is the singular label.learning-resource
// (DESIGN §9.5 exception 4); the description is the registry card text.
const header = computed(() => t('settings.shell.learningResource'));
const subHeader = computed(() => registryDescription(settingsTranslator, registryEntry));
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    learningResourcesBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      t('settings.shell.learningResource'),
    ),
  ),
);
const loading = ref(false);
const errorMessage = ref('');
const resources = ref<LearningResource[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listLearningResources({ limit: 100 });
    resources.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.learning.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="learning-resources">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="learning-resources"
    />
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 12px" />
    <Spin :spinning="loading">
      <Button style="margin-bottom: 12px" data-testid="learning-refresh" @click="load">
        {{ t('settings.learning.refresh') }}
      </Button>
      <Empty v-if="!resources.length && !loading" :description="t('settings.learning.empty')" />
      <Row v-else :gutter="[16, 16]" data-testid="learning-resource-cards">
        <Col v-for="item in resources" :key="item.id" :xs="24" :sm="12" :md="8">
          <Card :title="item.displayName || item.name" :data-testid="`learning-card-${item.name}`">
            <p>{{ item.description || '—' }}</p>
            <Tag v-if="item.resourceType">{{ item.resourceType }}</Tag>
            <div style="margin-top: 8px">
              <a
                v-if="item.source?.url"
                :href="item.source.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('settings.learning.open') }}
              </a>
            </div>
          </Card>
        </Col>
      </Row>
    </Spin>
  </div>
</template>
