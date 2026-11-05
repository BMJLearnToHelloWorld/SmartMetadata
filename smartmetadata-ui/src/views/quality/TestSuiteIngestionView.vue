<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, Select, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { getTestSuite } from '@/api/testSuites';
import {
  createIngestionPipeline,
  deployIngestionPipeline,
  listIngestionPipelines,
  updateIngestionPipeline,
} from '@/api/ingestionPipelines';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';

/**
 * Test-suite ingestion page (official TestSuiteIngestionPage, routes
 * TEST_SUITES_ADD_INGESTION / TEST_SUITES_EDIT_INGESTION, backed by
 * components/DataQuality/AddDataQualityTest/TestSuiteIngestion.tsx).
 * Official form (AddTestSuitePipeline): name, schedule (cron),
 * enable-debug-log, select-all-test-cases (or explicit test cases),
 * raise-on-error; create payload is pipelineType TestSuite, service =
 * the test suite itself, sourceConfig.config.type TestSuite with
 * entityFullyQualifiedName + testCases (names), then deploy. Edit mode
 * updates the existing pipeline instead of creating one. The product's
 * update call is a full PUT (not official's JSON patch) — the payload
 * shape is otherwise the same.
 */
const props = defineProps<{ id: string; ingestionFqn?: string }>();

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const suite = ref<TestSuite | null>(null);
const existing = ref<IngestionPipeline | null>(null);
const form = reactive({
  name: '',
  scheduleInterval: '',
  debugLog: false,
  selectAll: true,
  selectedCases: [] as string[],
  raiseOnError: true,
});

const isEdit = computed(() => Boolean(props.ingestionFqn));
const caseOptions = computed(() => (suite.value?.tests ?? []).map((item) => ({ value: item.name, label: item.name })));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    suite.value = await getTestSuite(props.id);
    form.name = suite.value.displayName || suite.value.name;
    if (props.ingestionFqn && suite.value.fullyQualifiedName) {
      const page = await listIngestionPipelines({
        service: suite.value.fullyQualifiedName,
        pipelineType: 'TestSuite',
        limit: 100,
      });
      existing.value = page.data.find((item) => item.fullyQualifiedName === props.ingestionFqn) ?? null;
      if (existing.value) {
        form.name = existing.value.displayName || existing.value.name;
        form.scheduleInterval = existing.value.airflowConfig?.scheduleInterval ?? '';
        form.debugLog = existing.value.loggerLevel === 'Debug';
        const cases = (existing.value.sourceConfig?.config as Record<string, unknown> | undefined)?.testCases;
        if (Array.isArray(cases) && cases.length) {
          form.selectAll = false;
          form.selectedCases = cases.filter((item): item is string => typeof item === 'string');
        }
      }
    }
  } catch (error) {
    suite.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onSave(): Promise<void> {
  if (!suite.value || !form.name.trim()) {
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: isEdit.value && existing.value ? existing.value.name : `${suite.value.name}-test-suite`,
      pipelineType: 'TestSuite',
      service: { id: suite.value.id, type: 'testSuite' },
      sourceConfig: {
        config: {
          type: 'TestSuite',
          entityFullyQualifiedName:
            suite.value.basic && suite.value.basicEntityReference
              ? suite.value.basicEntityReference
              : suite.value.fullyQualifiedName,
          testCases: form.selectAll ? undefined : form.selectedCases,
        },
      },
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: form.scheduleInterval.trim() || undefined,
      },
      displayName: form.name.trim(),
      loggerLevel: form.debugLog ? 'Debug' : 'Info',
      raiseOnError: form.raiseOnError,
    };
    const saved = isEdit.value && existing.value
      ? await updateIngestionPipeline(payload)
      : await createIngestionPipeline(payload);
    message.success(t('ingestion.pipelines.created', { name: saved.name }));
    try {
      const deploy = await deployIngestionPipeline(saved.id);
      if (deploy.reason) {
        message.warning(deploy.reason);
      }
    } catch {
      message.warning(t('ingestion.pipelines.deployFailed'));
    }
    await router.push({ name: 'ingestion-pipeline', params: { id: saved.id } });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader
      :header="isEdit ? t('quality.testSuites.editIngestionTitle') : t('quality.testSuites.addIngestionTitle')"
      :sub-header="t('quality.testSuites.ingestionLead')"
    />
    <p v-if="errorMessage" data-testid="test-suite-ingestion-error">{{ errorMessage }}</p>
    <Form v-if="suite" layout="vertical" data-testid="test-suite-ingestion-form">
      <Form.Item :label="t('crud.name')" required>
        <Input v-model:value="form.name" data-testid="test-suite-ingestion-name" />
      </Form.Item>
      <Form.Item :label="t('ingestion.pipelines.scheduleInterval')">
        <Input
          v-model:value="form.scheduleInterval"
          placeholder="0 0 * * *"
          data-testid="test-suite-ingestion-schedule"
        />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.debugLog" data-testid="test-suite-ingestion-debug">
          {{ t('quality.testSuites.enableDebugLog') }}
        </Checkbox>
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.selectAll" data-testid="test-suite-ingestion-select-all">
          {{ t('quality.testSuites.selectAllTestCases') }}
        </Checkbox>
      </Form.Item>
      <Form.Item v-if="!form.selectAll" :label="t('quality.testCases.title')">
        <Select
          v-model:value="form.selectedCases"
          mode="multiple"
          style="width: 100%"
          data-testid="test-suite-ingestion-cases"
          :options="caseOptions"
        />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.raiseOnError" data-testid="test-suite-ingestion-raise">
          {{ t('quality.testSuites.raiseOnError') }}
        </Checkbox>
      </Form.Item>
      <Button
        type="primary"
        data-testid="test-suite-ingestion-save"
        :loading="saving"
        :disabled="!form.name.trim()"
        @click="onSave"
      >
        {{ isEdit ? t('crud.save') : t('crud.create') }}
      </Button>
    </Form>
  </PageLayout>
</template>
