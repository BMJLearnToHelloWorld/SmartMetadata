<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ProfilerConfigurationPage: metric-configuration accordion with
  per-data-type rows (duplicate-disabling data-type select, 'all' tree
  metric selector, disable toggle) + sample-data accordion + Cancel/Save.
  The SparkAgentConfig class-base block is not built (OSS base is null).
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons-vue';
import {
  Button,
  Col,
  Collapse,
  Divider,
  Row,
  Select,
  Space,
  Switch,
  TreeSelect,
  Typography,
  message,
} from 'ant-design-vue';
import { getSetting, updateSetting } from '@/api/system';
import { startCase } from '@/utils/text';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  registryDescription,
  type SettingsTranslator,
} from '@/settings/registry';

import { PROFILER_DATA_TYPES, PROFILER_METRICS } from '@/quality/profilerConfig';
import type { MetricConfigurationDefinition, ProfilerConfiguration } from '@/types/admin';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('preferences.profiler-configuration');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: preferences.profiler-configuration');
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
const router = useRouter();

const SHOW_PARENT = TreeSelect.SHOW_PARENT;

type ProfilerRow = MetricConfigurationDefinition;

const rows = reactive<ProfilerRow[]>([]);
const sampleData = reactive({ storeSampleData: true, readSampleData: true });

const loading = ref(false);
const saving = ref(false);
const saveAttempted = ref(false);
const activePanels = ref<string[]>(['profileConfig', 'sampleDataConfig']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRows(raw: unknown): ProfilerRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => {
    const r = isRecord(entry) ? entry : {};
    const dataType = typeof r.dataType === 'string' ? r.dataType : undefined;
    return {
      dataType: dataType || undefined,
      metrics: Array.isArray(r.metrics) ? r.metrics.map((m) => String(m)) : undefined,
      disabled: typeof r.disabled === 'boolean' ? r.disabled : undefined,
    };
  });
}

// Official getProfilerConfigurationValues: a non-empty server list wins,
// otherwise the default (empty); a present sampleDataConfig object wins
// field-by-field, otherwise both switches default on. The typed parser
// always materialises a sampleDataConfig object, so the raw config value
// is read here to keep the absent-vs-present distinction.
async function load(): Promise<void> {
  loading.value = true;
  try {
    const setting = await getSetting('profilerConfiguration');
    const raw = isRecord(setting.configValue) ? setting.configValue : undefined;
    const parsed = parseRows(raw?.metricConfiguration);
    rows.splice(0, rows.length, ...(parsed.length > 0 ? parsed : []));
    const sample = isRecord(raw?.sampleDataConfig) ? raw.sampleDataConfig : undefined;
    sampleData.storeSampleData = sample ? sample.storeSampleData === true : true;
    sampleData.readSampleData = sample ? sample.readSampleData === true : true;
  } catch {
    // Official swallows fetch errors and keeps the form at its defaults.
  } finally {
    loading.value = false;
  }
}

// Official getDataTypeItems: a value chosen by another row is disabled.
function dataTypeOptions(index: number) {
  return PROFILER_DATA_TYPES.map((value) => ({
    value,
    label: value,
    disabled: rows.some((row, i) => i !== index && row.dataType === value),
  }));
}

function metricTreeData(row: ProfilerRow) {
  const known = new Set<string>(PROFILER_METRICS);
  const unknown = (row.metrics ?? []).filter((metric) => metric !== 'all' && !known.has(metric));
  return [
    {
      title: t('settings.profiler.all'),
      value: 'all',
      key: 'all',
      children: [
        ...PROFILER_METRICS.map((metric) => ({
          title: startCase(metric),
          value: metric,
          key: metric,
        })),
        // Unknown metrics pass through verbatim: the server may support
        // metrics newer than this client's enum. They render as synthetic
        // leaves so a stored value is never silently dropped from view.
        ...unknown.map((metric) => ({
          title: startCase(metric),
          value: metric,
          key: metric,
        })),
      ],
    },
  ];
}

// Official ProfilerMetricSelect handleChange: all 36 children selected
// collapses to ['all'] (dropping unknowns); otherwise leaf ids pass
// through, 'all' itself excluded. The 'all' id in the emitted value means
// the parent was checked under cascade, which is the same state.
function onMetricsChange(index: number, checked: (string | number)[]): void {
  const ids = checked.map(String);
  const allSelected =
    ids.includes('all') || PROFILER_METRICS.every((metric) => ids.includes(metric));
  rows[index].metrics = allSelected ? ['all'] : ids.filter((id) => id !== 'all');
}

function addRow(): void {
  rows.push({});
  saveAttempted.value = false;
}

function removeRow(index: number): void {
  rows.splice(index, 1);
}

function onStoreSampleData(checked: unknown): void {
  const enabled = Boolean(checked);
  sampleData.storeSampleData = enabled;
  if (enabled) {
    sampleData.readSampleData = true;
  }
}

function onDataTypeChange(index: number, value: unknown): void {
  rows[index].dataType = typeof value === 'string' ? value : undefined;
}

const rowError = computed(() => (row: ProfilerRow): string | null => {
  if (saveAttempted.value && !row.dataType) {
    return t('settings.profiler.fieldRequired', { field: t('settings.profiler.dataType') });
  }
  return null;
});

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (rows.some((row) => !row.dataType)) {
    return;
  }
  saving.value = true;
  try {
    const payload: ProfilerConfiguration = {
      metricConfiguration: rows.map((row) => ({
        ...row,
        metrics: row.metrics?.includes('all')
          ? [...PROFILER_METRICS]
          : row.metrics,
      })),
      sampleDataConfig: {
        storeSampleData: sampleData.storeSampleData,
        readSampleData: sampleData.readSampleData,
      },
    };
    await updateSetting('profilerConfiguration', payload);
    message.success(t('settings.profiler.saved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.profiler.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  router.back();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <SmBreadcrumb :items="breadcrumbItems" />
  <PreferencePageShell
    test-id="profiler-configuration"
    :title="header"
    :lead="subHeader"
    :loading="loading"
  >
    <form
      id="profiler-config"
      data-testid="profiler-config-form"
      @submit.prevent="save"
    >
      <Collapse v-model:active-key="activePanels">
        <Collapse.Panel key="profileConfig">
          <template #header>
            <div>
              <Typography.Text strong>{{ t('settings.profiler.metricConfig') }}</Typography.Text>
              <div>
                <Typography.Text type="secondary">
                  {{ t('settings.profiler.metricConfigDesc') }}
                </Typography.Text>
              </div>
            </div>
          </template>
          <Row :gutter="[16, 16]">
            <Col :span="10">
              <Typography.Text strong>
                {{ t('settings.profiler.dataType') }}
                <Typography.Text type="danger">*</Typography.Text>
              </Typography.Text>
            </Col>
            <Col :span="11">
              <Typography.Text strong>{{ t('settings.profiler.metricType') }}</Typography.Text>
            </Col>
            <Col :span="3">
              <Typography.Text strong>{{ t('settings.profiler.disable') }}</Typography.Text>
            </Col>
          </Row>
          <Row
            v-for="(row, index) in rows"
            :key="index"
            :gutter="[16, 16]"
            style="margin-top: 16px"
          >
            <Col :span="10" :data-testid="`profiler-data-type-${index}`">
              <Select
                :value="row.dataType"
                style="width: 100%"
                show-search
                :filter-option="(input: string, option?: { label?: unknown }) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())"
                :options="dataTypeOptions(index)"
                :placeholder="t('settings.profiler.selectDataType')"
                data-testid="data-type-select"
                :status="rowError(row) ? 'error' : ''"
                @update:value="onDataTypeChange(index, $event)"
              />
              <Typography.Text v-if="rowError(row)" type="danger">
                {{ rowError(row) }}
              </Typography.Text>
            </Col>
            <Col :span="11" :data-testid="`profiler-metrics-${index}`">
              <TreeSelect
                :value="row.metrics ?? []"
                style="width: 100%"
                :tree-data="metricTreeData(row)"
                tree-checkable
                :show-checked-strategy="SHOW_PARENT"
                :max-tag-count="5"
                show-search
                :placeholder="t('settings.profiler.selectMetricType')"
                data-testid="metric-type-select"
                :disabled="row.disabled ?? false"
                @update:value="onMetricsChange(index, $event)"
              />
            </Col>
            <Col :span="3" :data-testid="`profiler-disabled-${index}`">
              <Space>
                <Switch
                  :checked="row.disabled ?? false"
                  :aria-label="t('settings.profiler.disable')"
                  data-testid="disabled-switch"
                  @update:checked="rows[index].disabled = Boolean($event)"
                />
                <Button
                  type="text"
                  danger
                  :aria-label="t('settings.profiler.removeField')"
                  :data-testid="`remove-filter-${index}`"
                  @click="removeRow(index)"
                >
                  <CloseOutlined />
                </Button>
              </Space>
            </Col>
          </Row>
          <Divider />
          <Button type="link" data-testid="add-fields" @click="addRow">
            <PlusOutlined />
            {{ t('settings.profiler.addNewField') }}
          </Button>
        </Collapse.Panel>
        <Collapse.Panel key="sampleDataConfig">
          <template #header>
            <div>
              <Typography.Text strong>{{ t('settings.profiler.sampleDataConfig') }}</Typography.Text>
              <div>
                <Typography.Text type="secondary">
                  {{ t('settings.profiler.sampleDataConfigDesc') }}
                </Typography.Text>
              </div>
            </div>
          </template>
          <div data-testid="sample-data-ingestion-config">
            <Row :gutter="[16, 16]" align="middle">
              <Col :span="20">
                <Typography.Text strong>{{ t('settings.profiler.storeSampleData') }}</Typography.Text>
                <div>
                  <Typography.Text type="secondary">
                    {{ t('settings.profiler.storeSampleDataDesc') }}
                  </Typography.Text>
                </div>
              </Col>
              <Col :span="4" style="text-align: right">
                <Switch
                  :checked="sampleData.storeSampleData"
                  :aria-label="t('settings.profiler.storeSampleData')"
                  data-testid="store-sample-data-switch"
                  @update:checked="onStoreSampleData"
                />
              </Col>
            </Row>
            <Row :gutter="[16, 16]" align="middle" style="margin-top: 24px">
              <Col :span="20">
                <Typography.Text strong>{{ t('settings.profiler.readSampleData') }}</Typography.Text>
                <div>
                  <Typography.Text type="secondary">
                    {{ t('settings.profiler.readSampleDataDesc') }}
                  </Typography.Text>
                </div>
              </Col>
              <Col :span="4" style="text-align: right">
                <Switch
                  :checked="sampleData.readSampleData"
                  :aria-label="t('settings.profiler.readSampleData')"
                  data-testid="read-sample-data-switch"
                  @update:checked="sampleData.readSampleData = Boolean($event)"
                />
              </Col>
            </Row>
          </div>
        </Collapse.Panel>
      </Collapse>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px">
        <Button data-testid="cancel-button" @click="cancel">
          {{ t('settings.profiler.cancel') }}
        </Button>
        <Button
          type="primary"
          html-type="submit"
          :loading="saving"
          data-testid="save-button"
        >
          {{ t('settings.profiler.save') }}
        </Button>
      </div>
    </form>
  </PreferencePageShell>

</template>
