<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official 添加包套件 drawer: name, test-case picker + optional 新建工作流.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Drawer, Form, Input, Select, Space, Switch, Typography } from 'ant-design-vue';
import { addTestCasesToLogicalTestSuite, listTestCasesBySearch } from '@/api/testCases';
import { createIngestionPipeline, deployIngestionPipeline } from '@/api/ingestionPipelines';
import { createTestSuite } from '@/api/testSuites';
import { entityLabel } from '@/features/crud/paging';
import { cronPreset, describeCron, TEST_CASE_TYPES } from '@/quality/testCaseForm';
import { TEST_CASE_STATUSES, type TestCase, type TestSuite } from '@/types/quality';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ cancel: []; submitted: [suite: TestSuite] }>();
const { t } = useI18n();

const saving = ref(false);
const errorMessage = ref('');
const name = ref('');
const searchValue = ref('');
const statusFilter = ref<string | undefined>();
const typeFilter = ref<string | undefined>();
const tableFilter = ref('');
const columnFilter = ref('');
const cases = ref<TestCase[]>([]);
const selectedIds = ref<string[]>([]);
const createWorkflow = ref(false);
const pipelineName = ref('');
const scheduled = ref(true);
const frequency = ref<'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
const customCron = ref('0 0 * * *');
const hour = ref(0);
const minute = ref(0);
const enableDebugLog = ref(false);
const raiseOnError = ref(true);

const cron = computed(() =>
  frequency.value === 'custom' ? customCron.value : cronPreset(frequency.value, hour.value, minute.value),
);
const cronSummary = computed(() => describeCron(scheduled.value ? cron.value : undefined, scheduled.value && createWorkflow.value));
const allIds = computed(() => cases.value.map((item) => item.id).filter(Boolean));
const allSelected = computed(() => allIds.value.length > 0 && allIds.value.every((id) => selectedIds.value.includes(id)));

async function loadCases(): Promise<void> {
  const page = await listTestCasesBySearch({
    q: searchValue.value || undefined,
    limit: 50,
    testCaseStatus: statusFilter.value,
    testCaseType: typeFilter.value,
    tableFqn: tableFilter.value.trim() || undefined,
    includeAllTests: true,
  });
  const needle = columnFilter.value.trim().toLowerCase();
  cases.value = needle
    ? page.data.filter((item) => (item.entityLink ?? '').toLowerCase().includes(`::columns::${needle}`))
    : page.data;
}

function toggleAll(checked: boolean): void {
  selectedIds.value = checked ? [...allIds.value] : [];
}

function toggleOne(id: string, checked: boolean): void {
  if (checked) {
    selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value : [...selectedIds.value, id];
  } else {
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  if (!selectedIds.value.length) {
    errorMessage.value = t('quality.testSuites.pickerRequired');
    return;
  }
  saving.value = true;
  try {
    const suite = await createTestSuite({
      name: name.value.trim() || `bundle_suite_${Date.now()}`,
      displayName: name.value.trim() || undefined,
    });
    await addTestCasesToLogicalTestSuite(suite.id, selectedIds.value);
    if (createWorkflow.value && suite.id) {
      const selected = cases.value.filter((item) => selectedIds.value.includes(item.id));
      const pipeline = await createIngestionPipeline({
        name: crypto.randomUUID(),
        displayName: pipelineName.value.trim() || name.value.trim() || suite.name,
        pipelineType: 'TestSuite',
        raiseOnError: raiseOnError.value,
        loggerLevel: enableDebugLog.value ? 'DEBUG' : 'INFO',
        service: { id: suite.id, type: 'testSuite' },
        airflowConfig: scheduled.value ? { scheduleInterval: cron.value } : {},
        sourceConfig: {
          config: {
            type: 'TestSuite',
            testCases: selected.map((item) => item.name),
          },
        },
      });
      if (pipeline.id) {
        await deployIngestionPipeline(pipeline.id);
      }
    }
    emit('submitted', suite);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : t('server.create-entity-error', { entity: t('label.test-suite') });
  } finally {
    saving.value = false;
  }
}

function close(): void {
  emit('cancel');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      errorMessage.value = '';
      name.value = '';
      selectedIds.value = [];
      createWorkflow.value = false;
      pipelineName.value = '';
      scheduled.value = true;
      frequency.value = 'daily';
      enableDebugLog.value = false;
      raiseOnError.value = true;
      void loadCases();
    }
  },
);
</script>

<template>
  <Drawer
    :open="open"
    :title="t('label.new-entity', { entity: t('label.bundle-suite') })"
    placement="right"
    :width="480"
    :destroy-on-close="true"
    data-testid="logical-test-suite-drawer"
    @close="close"
  >
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" style="margin-bottom: 16px" />
    <Form layout="vertical">
      <Form.Item :label="t('label.name')">
        <Input v-model:value="name" data-testid="bundle-suite-name" />
      </Form.Item>
      <Form.Item :label="t('label.test-case-plural')" required>
        <Input
          v-model:value="searchValue"
          :placeholder="t('label.search-entity', { entity: t('label.test-case-lowercase') })"
          data-testid="bundle-suite-search"
          @pressEnter="loadCases"
          @change="loadCases"
        />
        <Space wrap style="margin: 8px 0">
          <Select
            v-model:value="statusFilter"
            allow-clear
            :placeholder="t('label.status')"
            style="width: 120px"
            @change="loadCases"
          >
            <Select.Option v-for="status in TEST_CASE_STATUSES" :key="status" :value="status">{{ status }}</Select.Option>
          </Select>
          <Select
            v-model:value="typeFilter"
            allow-clear
            :placeholder="t('label.type')"
            style="width: 120px"
            @change="loadCases"
          >
            <Select.Option v-for="type in TEST_CASE_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
          <Input v-model:value="tableFilter" :placeholder="t('label.table')" style="width: 140px" @change="loadCases" />
          <Input v-model:value="columnFilter" :placeholder="t('label.column')" style="width: 120px" @change="loadCases" />
        </Space>
        <label class="bundle-suite__all">
          <input type="checkbox" :checked="allSelected" data-testid="bundle-suite-select-all" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
          {{ t('quality.testSuites.selectAll', { count: cases.length }) }}
        </label>
        <div class="bundle-suite__list" data-testid="bundle-suite-cases">
          <label v-for="item in cases" :key="item.id" class="bundle-suite__row">
            <input
              type="checkbox"
              :checked="selectedIds.includes(item.id)"
              :data-testid="`bundle-suite-case-${item.id}`"
              @change="toggleOne(item.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <strong>{{ entityLabel(item) }}</strong>
              <div class="bundle-suite__meta">{{ item.testDefinition?.displayName || item.testDefinition?.name }} · {{ item.entityFQN || item.entityLink }}</div>
            </span>
          </label>
        </div>
      </Form.Item>
      <Form.Item>
        <div class="bundle-suite__workflow">
          <Switch v-model:checked="createWorkflow" data-testid="bundle-suite-workflow" />
          <div>
            <div>{{ t('quality.testSuites.createWorkflow') }}</div>
            <Typography.Text type="secondary">{{ t('quality.testSuites.createWorkflowHint') }}</Typography.Text>
          </div>
        </div>
      </Form.Item>
      <template v-if="createWorkflow">
        <Form.Item :label="t('quality.testSuites.pipelineName')">
          <Input v-model:value="pipelineName" data-testid="bundle-suite-pipeline-name" />
        </Form.Item>
        <Form.Item :label="t('quality.testSuites.schedule')">
          <div class="bundle-suite__schedule">
            <button type="button" class="bundle-suite__card" :class="{ 'is-active': scheduled }" data-testid="bundle-suite-scheduled" @click="scheduled = true">
              <strong>{{ t('quality.testSuites.scheduled') }}</strong>
              <div>{{ t('quality.testSuites.scheduledHint') }}</div>
            </button>
            <button type="button" class="bundle-suite__card" :class="{ 'is-active': !scheduled }" data-testid="bundle-suite-once" @click="scheduled = false">
              <strong>{{ t('quality.testSuites.once') }}</strong>
              <div>{{ t('quality.testSuites.onceHint') }}</div>
            </button>
          </div>
        </Form.Item>
        <Form.Item v-if="scheduled" :label="t('quality.testSuites.frequency')">
          <Space wrap>
            <Button v-for="item in (['hourly', 'daily', 'weekly', 'monthly', 'custom'] as const)" :key="item" :type="frequency === item ? 'primary' : 'default'" :data-testid="`bundle-suite-freq-${item}`" @click="frequency = item">
              {{ t(`quality.testSuites.freq.${item}`) }}
            </Button>
          </Space>
          <Input v-if="frequency === 'custom'" v-model:value="customCron" style="margin-top: 8px" data-testid="bundle-suite-cron" />
        </Form.Item>
        <Typography.Paragraph v-if="cronSummary" data-testid="bundle-suite-cron-summary">{{ t('quality.testSuites.cronSummary', { summary: cronSummary }) }}</Typography.Paragraph>
        <Form.Item :label="t('quality.testSuites.debugLog')">
          <Switch v-model:checked="enableDebugLog" data-testid="bundle-suite-debug" />
        </Form.Item>
        <Form.Item :label="t('quality.testSuites.raiseOnError')">
          <Switch v-model:checked="raiseOnError" data-testid="bundle-suite-raise" />
        </Form.Item>
      </template>
    </Form>
    <template #footer>
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button data-testid="bundle-suite-cancel" @click="close">{{ t('label.cancel') }}</Button>
        <Button type="primary" :loading="saving" data-testid="bundle-suite-submit" @click="onSubmit">{{ t('crud.create') }}</Button>
      </Space>
    </template>
  </Drawer>
</template>

<style scoped>
.bundle-suite__all,
.bundle-suite__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 0;
}
.bundle-suite__list {
  max-height: 280px;
  overflow: auto;
  border-top: 1px solid var(--sm-border-secondary);
}
.bundle-suite__meta {
  color: rgba(0, 0, 0, 0.55);
  font-size: 12px;
}
.bundle-suite__workflow {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.bundle-suite__schedule {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.bundle-suite__card {
  text-align: left;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  background: var(--sm-bg-container);
  padding: 10px;
  cursor: pointer;
}
.bundle-suite__card.is-active {
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
}
</style>
