<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Drawer, Form, Input, Select, message } from 'ant-design-vue';
import {
  createIngestionPipeline,
  deployIngestionPipeline,
  updateIngestionPipeline,
} from '@/api/ingestionPipelines';
import { listTestCases, listTestCasesBySearch } from '@/api/testCases';
import { DEFAULT_SCHEDULE_CRON_DAILY, cronValidator, getDefaultScheduleValue } from '@/ingestion/schedule';
import { isAirflowAvailable } from '@/ingestion/orchestrator';
import {
  buildTestSuiteIngestionPatch,
  buildTestSuiteIngestionPayload,
  getTestSuitePipelineFormDefaults,
  getTestSuitePipelineScope,
  testCasePickerScope,
  toTestSuiteIngestionData,
} from '@/ingestion/testSuitePipeline';
import ScheduleIntervalField from '@/components/ingestion/ScheduleIntervalField.vue';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';

/**
 * Port of official `TestSuitePipelineFormDrawer.tsx` (pin a3012259ca).
 *
 * The host stays mounted between opens, so the form is reset to the
 * defaults on every open — the pipeline being edited, or blank values
 * for a new one. Save closes the drawer and the host refreshes the
 * list; a deploy failure is a toast, never a blocked close, and the
 * deploy is skipped entirely when Airflow is unavailable.
 */
const props = defineProps<{
  open: boolean;
  suite: TestSuite | null;
  ingestionPipeline?: IngestionPipeline | null;
}>();
const emit = defineEmits<{
  close: [];
  success: [];
}>();

const { t } = useI18n();
const saving = ref(false);
const scheduleValid = ref(true);
const scheduleError = ref('');
const casesError = ref('');
const caseOptions = ref<{ value: string; label: string }[]>([]);
const casesLoading = ref(false);

const isEdit = computed(() => Boolean(props.ingestionPipeline));
const scope = computed(() =>
  getTestSuitePipelineScope({ testSuite: props.suite ?? undefined, ingestionPipeline: props.ingestionPipeline ?? undefined }),
);

const form = reactive({
  name: '',
  cron: undefined as string | undefined,
  debugLog: false,
  selectAll: false,
  selectedCases: [] as string[],
  raiseOnError: true,
});

function resetForm(): void {
  const defaults = getTestSuitePipelineFormDefaults(
    props.ingestionPipeline ?? undefined,
    getDefaultScheduleValue({ defaultSchedule: DEFAULT_SCHEDULE_CRON_DAILY, allowNoSchedule: true }),
  );
  form.name = defaults.name ?? '';
  form.cron = defaults.cron;
  form.debugLog = defaults.enableDebugLog;
  form.selectAll = defaults.selectAllTestCases;
  form.selectedCases = defaults.testCases ?? [];
  form.raiseOnError = defaults.raiseOnError ?? true;
  scheduleError.value = '';
  casesError.value = '';
}

const caseSearchSeq = ref(0);
let caseSearchTimer: number | undefined;

function applyCasePage(names: string[]): void {
  const merged = new Set<string>(form.selectedCases);
  for (const name of names) {
    merged.add(name);
  }
  caseOptions.value = [...merged].map((name) => ({ value: name, label: name }));
}

async function loadCaseOptions(): Promise<void> {
  if (!scope.value.testSuiteId) {
    return;
  }
  const seq = ++caseSearchSeq.value;
  casesLoading.value = true;
  try {
    const page = await listTestCases({
      ...testCasePickerScope({
        testSuiteId: scope.value.testSuiteId,
        tableFqn: scope.value.tableFqn,
      }),
      limit: 100,
    });
    if (seq !== caseSearchSeq.value) {
      return;
    }
    applyCasePage(page.data.map((testCase) => testCase.name));
  } finally {
    if (seq === caseSearchSeq.value) {
      casesLoading.value = false;
    }
  }
}

/**
 * Server-side case search (M-5): typing in the picker queries
 * /v1/dataQuality/testCases/search/list with the typed term, so a suite
 * with more than the first 100 cases still shows matches. The scope
 * travels as first-class params (pin AddTestCaseList). Clearing the term
 * reloads the plain list; a stale response never overwrites a newer one.
 */
async function searchCaseOptions(term: string): Promise<void> {
  const query = term.trim();
  if (!query) {
    await loadCaseOptions();
    return;
  }
  const seq = ++caseSearchSeq.value;
  casesLoading.value = true;
  try {
    const page = await listTestCasesBySearch({
      q: query,
      ...testCasePickerScope({
        testSuiteId: scope.value.testSuiteId,
        tableFqn: scope.value.tableFqn,
      }),
      limit: 100,
    });
    if (seq !== caseSearchSeq.value) {
      return;
    }
    applyCasePage(page.data.map((testCase) => testCase.name));
  } finally {
    if (seq === caseSearchSeq.value) {
      casesLoading.value = false;
    }
  }
}

function onCaseSearch(term: string): void {
  window.clearTimeout(caseSearchTimer);
  caseSearchTimer = window.setTimeout(() => {
    void searchCaseOptions(term);
  }, 300);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm();
      void loadCaseOptions();
    }
  },
  { immediate: true },
);

watch(
  () => form.selectAll,
  (selectAll) => {
    if (!selectAll) {
      void loadCaseOptions();
    }
  },
);

async function onSave(): Promise<void> {
  if (!props.suite || saving.value) {
    return;
  }
  if (!form.selectAll && form.selectedCases.length === 0) {
    casesError.value = t('quality.testSuites.testCasesRequired');
    return;
  }
  const cronErrorKey = await cronValidator(form.cron ?? '');
  if (cronErrorKey) {
    scheduleError.value = t(cronErrorKey);
    return;
  }
  if (!scheduleValid.value) {
    return;
  }
  saving.value = true;
  try {
    const data = toTestSuiteIngestionData({
      cron: form.cron,
      enableDebugLog: form.debugLog,
      name: form.name.trim() || undefined,
      selectAllTestCases: form.selectAll,
      testCases: form.selectedCases,
      raiseOnError: form.raiseOnError,
    });
    let savedId: string | undefined;
    if (props.ingestionPipeline) {
      const saved = await updateIngestionPipeline(
        props.ingestionPipeline.id,
        buildTestSuiteIngestionPatch(props.ingestionPipeline, data),
      );
      savedId = saved.id;
    } else {
      const saved = await createIngestionPipeline(
        buildTestSuiteIngestionPayload(data, {
          testSuiteId: scope.value.testSuiteId,
          nameFqn: scope.value.nameFqn,
          entityFqn: scope.value.tableFqn,
        }),
      );
      savedId = saved.id;
    }
    // The pipeline is saved even if deploy fails; it can be redeployed
    // from the list, so a deploy error must not keep the drawer open.
    if (savedId && (await isAirflowAvailable())) {
      try {
        const result = await deployIngestionPipeline(savedId);
        if (result.reason) {
          message.error(t('ingestion.pipelines.deployEntityError'));
        }
      } catch {
        message.error(t('ingestion.pipelines.deployEntityError'));
      }
    } else if (savedId) {
      message.warning(t('ingestion.pipelines.deploySkippedAirflowUnavailable'));
    }
    message.success(
      t(isEdit.value ? 'ingestion.pipelines.updated' : 'ingestion.pipelines.created', {
        name: form.name.trim() || scope.value.nameFqn,
      }),
    );
    emit('success');
    emit('close');
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    saving.value = false;
  }
}

function handleClose(): void {
  resetForm();
  emit('close');
}
</script>

<template>
  <Drawer
    :open="open"
    :title="isEdit ? t('quality.testSuites.editIngestionTitle') : t('quality.testSuites.addIngestionTitle')"
    width="560"
    @close="handleClose"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')">
        <Input v-model:value="form.name" data-testid="pipeline-name" />
      </Form.Item>
      <Form.Item
        :label="t('ingestion.pipelines.scheduleInterval')"
        :validate-status="scheduleError ? 'error' : undefined"
        :help="scheduleError || undefined"
      >
        <ScheduleIntervalField
          v-model="form.cron"
          test-id-prefix="test-suite-ingestion-schedule"
          @validity-change="(valid) => (scheduleValid = valid)"
        />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.debugLog" data-testid="test-suite-ingestion-debug">
          {{ t('quality.testSuites.enableDebugLog') }}
        </Checkbox>
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.raiseOnError" data-testid="test-suite-ingestion-raise">
          {{ t('quality.testSuites.raiseOnError') }}
        </Checkbox>
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.selectAll" data-testid="test-suite-ingestion-select-all">
          {{ t('quality.testSuites.selectAllTestCases') }}
        </Checkbox>
      </Form.Item>
      <Form.Item
        v-if="!form.selectAll"
        :label="t('quality.testCases.title')"
        :validate-status="casesError ? 'error' : undefined"
        :help="casesError || undefined"
      >
        <Select
          v-model:value="form.selectedCases"
          mode="multiple"
          show-search
          style="width: 100%"
          :loading="casesLoading"
          :options="caseOptions"
          data-testid="test-suite-ingestion-cases"
          :filter-option="false"
          @search="onCaseSearch"
          @update:value="casesError = ''"
        />
      </Form.Item>
      <div style="display: flex; gap: 8px; margin-top: 16px">
        <Button type="primary" data-testid="test-suite-ingestion-save" :loading="saving" @click="onSave">
          {{ isEdit ? t('crud.save') : t('crud.create') }}
        </Button>
        <Button data-testid="test-suite-ingestion-cancel" @click="handleClose">
          {{ t('crud.cancel') }}
        </Button>
      </div>
    </Form>
  </Drawer>
</template>
