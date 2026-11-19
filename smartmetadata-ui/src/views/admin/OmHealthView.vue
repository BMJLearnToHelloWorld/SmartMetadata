<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official OmHealthPage: dynamic map over every key of the /system/status
  response (the response type has an index signature), one
  ConnectionStepCard per key. The card markup is rendered view-locally:
  the product's TestConnectionCard is a workflow machine, not reusable
  here, and shared components are outside this batch's ownership.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  InfoCircleOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import { Button, Divider, Tooltip, message, Spin } from 'ant-design-vue';
import { fetchSystemStatus } from '@/api/system';
import { startCase } from '@/api/customProperties';
import type { SystemValidationResponse } from '@/types/admin';
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
import { copyTextToClipboard } from '@/utils/codeMirrorUtils';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.om-health');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.om-health');
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
const status = ref<SystemValidationResponse | null>(null);
const expandedLogs = reactive(new Set<string>());

interface HealthCard {
  key: string;
  name: string;
  description: string;
  passed: boolean;
  message?: string;
  errorLog?: string;
}

const cards = computed<HealthCard[]>(() => {
  if (!status.value) {
    return [];
  }
  const result: HealthCard[] = [];
  for (const [key, validation] of Object.entries(status.value)) {
    // Official `validation &&` guard: falsy entries render nothing.
    if (!validation) {
      continue;
    }
    const passed = Boolean(validation.passed);
    result.push({
      key,
      name: startCase(key),
      description: validation.description ?? '',
      passed,
      message: passed ? validation.message : validation.description,
      ...(!passed ? { errorLog: validation.message } : {}),
    });
  }
  return result;
});

function logsFor(card: HealthCard): string {
  return card.errorLog ?? t('settings.health.noLogs');
}

function toggleLogs(key: string): void {
  if (expandedLogs.has(key)) {
    expandedLogs.delete(key);
  } else {
    expandedLogs.add(key);
  }
}

async function copyLogs(card: HealthCard): Promise<void> {
  await copyTextToClipboard(logsFor(card));
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    status.value = await fetchSystemStatus();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.health.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="om-health">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header"
      :sub-header="subHeader"
      test-id="om-health"
    />
    <Spin :spinning="loading">
    <Button type="primary" data-testid="om-health-refresh" style="margin-bottom: 12px" @click="load">
      {{ t('settings.health.refresh') }}
    </Button>
    <div
      v-for="card in cards"
      :key="card.key"
      :data-testid="card.key"
      class="health-card"
      :class="card.passed ? 'health-card--success' : 'health-card--failure'"
    >
      <div class="health-card__header">
        <span class="health-card__name">
          {{ card.name }} <span class="health-card__required">*</span>
          <Tooltip :title="card.description" placement="bottom">
            <InfoCircleOutlined class="health-card__info" />
          </Tooltip>
        </span>
        <span v-if="card.passed" class="health-card__status health-card__status--success">
          {{ t('settings.health.passed') }}
          <CheckCircleFilled data-testid="success-badge" />
        </span>
        <span v-else class="health-card__status health-card__status--failure">
          {{ t('settings.health.failed') }}
          <CloseCircleFilled data-testid="fail-badge" />
        </span>
      </div>
      <div v-if="!card.passed || card.message" class="health-card__content">
        <span>{{ card.message }}</span>
        <template v-if="card.errorLog">
          <Divider class="health-card__divider" />
          <div class="health-card__logs" data-testid="lazy-log">
            <div class="health-card__logs-header">
              <Button type="link" class="health-card__logs-toggle" @click="toggleLogs(card.key)">
                <RightOutlined
                  class="health-card__logs-chevron"
                  :class="{ 'health-card__logs-chevron--open': expandedLogs.has(card.key) }"
                />
                {{ t('settings.health.showLogs') }}
              </Button>
              <Button
                :aria-label="t('settings.health.copyToClipboard')"
                :title="t('settings.health.copyToClipboard')"
                data-testid="query-entity-copy-button"
                @click="copyLogs(card)"
              >
                <CopyOutlined />
              </Button>
            </div>
            <pre v-if="expandedLogs.has(card.key)" class="health-card__log-text">{{ logsFor(card) }}</pre>
          </div>
        </template>
      </div>
    </div>
    </Spin>
  </div>
</template>

<style scoped>
.health-card {
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  margin-bottom: 16px;
}

.health-card--success {
  border-left: 4px solid var(--sm-color-success);
}

.health-card--failure {
  border-left: 4px solid var(--sm-color-error);
}

.health-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.health-card__name {
  font-weight: 600;
}

.health-card__required {
  color: var(--sm-color-error);
}

.health-card__info {
  margin-left: 8px;
  font-size: 14px;
}

.health-card__status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.health-card__status--success {
  color: var(--sm-color-success);
}

.health-card__status--failure {
  color: var(--sm-color-error);
}

.health-card__content {
  padding: 0 16px 12px;
}

.health-card__divider {
  margin: 12px 0;
}

.health-card__logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.health-card__logs-toggle {
  padding: 0;
}

.health-card__logs-chevron {
  font-size: 12px;
  transition: transform 0.2s;
}

.health-card__logs-chevron--open {
  transform: rotate(90deg);
}

.health-card__log-text {
  height: 300px;
  overflow: auto;
  padding: 4px 16px 0 24px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
