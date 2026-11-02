<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Form, Input, Modal, Table, message } from 'ant-design-vue';
import { getTestCase, updateTestCase } from '@/api/testCases';
import { listTestCaseResults } from '@/api/testCaseResults';
import { listTestIncidents } from '@/api/testIncidents';
import SmChart from '@/features/charts/SmChart.vue';
import { testResultsToTimeline } from '@/features/charts/series';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import SmState from '@/components/shared/SmState.vue';
import { QUALITY_PAGE_TABS } from '@/catalog/qualityTabs';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { parseEntityLink } from '@/quality/entityLink';
import type { TestCase, TestCaseResult, TestIncident } from '@/types/quality';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const testCase = ref<TestCase | null>(null);
const results = ref<TestCaseResult[]>([]);
const issues = ref<TestIncident[]>([]);
const issuesError = ref('');
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  parameterText: '',
});

const resultSeries = computed(() => testResultsToTimeline(results.value));

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('quality.testCases.title'), to: { name: 'quality-test-cases' } },
  { label: entityLabel(testCase.value) || t('quality.testCases.title') },
]);

const tabs = computed<EntityDetailTab[]>(() =>
  QUALITY_PAGE_TABS.testCase.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `test-case-tab-${tab.key}`,
  })),
);

const issueColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.status'), dataIndex: 'testCaseResolutionStatusType', key: 'status', width: 120 },
  { title: t('observability.incidents.severity'), dataIndex: 'severity', key: 'severity', width: 120 },
  { title: t('observability.incidents.updated'), key: 'timestamp', width: 200 },
]);

const resultColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.status'), dataIndex: 'testCaseStatus', key: 'testCaseStatus', width: 120 },
  { title: t('quality.testCases.timestamp'), key: 'timestamp', width: 200 },
  { title: t('quality.testCases.result'), dataIndex: 'result', key: 'result' },
]);

function formatTs(value?: number): string {
  if (!value) {
    return '—';
  }
  const millis = value < 1e12 ? value * 1000 : value;
  return new Date(millis).toISOString();
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const loaded = await getTestCase(props.id);
    testCase.value = loaded;
    if (loaded.fullyQualifiedName) {
      const page = await listTestCaseResults(loaded.fullyQualifiedName);
      results.value = page.data;
      try {
        const incidentPage = await listTestIncidents({ testCaseFQN: loaded.fullyQualifiedName });
        issues.value = incidentPage.data;
        issuesError.value = '';
      } catch {
        issues.value = [];
        issuesError.value = t('crud.loadFailed');
      }
    } else {
      results.value = [];
      issues.value = [];
    }
  } catch (error) {
    testCase.value = null;
    results.value = [];
    issues.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!testCase.value) {
    return;
  }
  editForm.displayName = testCase.value.displayName || '';
  editForm.description = testCase.value.description || '';
  editForm.parameterText = testCase.value.parameterValues.map((item) => `${item.name}=${item.value}`).join('\n');
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!testCase.value?.entityLink || !testCase.value.testDefinition) {
    message.error(t('quality.testCases.cannotUpdate'));
    return;
  }
  saving.value = true;
  try {
    const parameterValues = editForm.parameterText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const eq = line.indexOf('=');
        return eq > 0 ? [{ name: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }] : [];
      });
    await updateTestCase({
      name: testCase.value.name,
      testDefinition: testCase.value.testDefinition.fullyQualifiedName || testCase.value.testDefinition.name,
      entityLink: testCase.value.entityLink,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
      parameterValues,
    });
    editOpen.value = false;
    message.success(t('quality.testCases.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

function openAsset(): void {
  const parsed = testCase.value?.entityLink ? parseEntityLink(testCase.value.entityLink) : null;
  const entityType = parsed?.entityType || 'table';
  const fqn = parsed?.fqn || testCase.value?.entityFQN;
  if (!fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

function openDefinition(): void {
  const id = testCase.value?.testDefinition?.id;
  if (!id) {
    return;
  }
  void router.push({ name: 'quality-test-definition', params: { id } });
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(testCase) || t('quality.testCases.title')"
    :name="testCase?.name"
    :fqn="testCase?.fullyQualifiedName"
    :lead="t('quality.testCases.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!testCase && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="testCase ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-test-case" :disabled="!testCase" @click="openEdit">{{ t('crud.edit') }}</Button>
      <Button :disabled="!testCase?.entityLink && !testCase?.entityFQN" @click="openAsset">
        {{ t('quality.testCases.openAsset') }}
      </Button>
      <Button
        data-testid="open-test-definition"
        :disabled="!testCase?.testDefinition?.id"
        @click="openDefinition"
      >
        {{ t('quality.testCases.openDefinition') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="testCase" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ testCase.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ testCase.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('quality.testCases.entityLink')">
          {{ testCase.entityLink || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testCases.latestStatus')">
          {{ testCase.testCaseResult?.testCaseStatus || testCase.testCaseStatus || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testCases.latestResult')">
          {{ testCase.testCaseResult?.result || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ testCase.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #results>
      <p class="entity-detail__tab-lead">{{ t('asset.resultsChartLead') }}</p>
      <SmChart kind="bar" test-id="test-case-results-chart" :series="resultSeries" :empty="t('charts.empty')" />
      <Table
        data-testid="test-case-results-table"
        row-key="timestamp"
        size="small"
        style="margin-top: 16px"
        :columns="resultColumns"
        :data-source="results"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTs((record as TestCaseResult).timestamp) }}
          </template>
        </template>
      </Table>
    </template>
    <template #issues>
      <SmState
        v-if="issuesError"
        state="error"
        test-id="test-case-issues-error"
        :error-text="issuesError"
      />
      <Table
        v-else
        data-testid="test-case-issues-table"
        row-key="id"
        size="small"
        :columns="issueColumns"
        :data-source="issues"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTs((record as TestIncident).timestamp) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a
              href="#"
              :data-testid="`test-case-issue-${(record as TestIncident).id}`"
              @click.prevent="router.push({ name: 'observability-incident', params: { id: (record as TestIncident).id } })"
            >
              {{ (record as TestIncident).testCaseResolutionStatusType || '—' }}
            </a>
          </template>
        </template>
      </Table>
    </template>
    <template #dimensionality>
      <SmState state="empty" test-id="test-case-dimensionality-residual" :empty-text="t('quality.testCases.residualDimensionality')" />
    </template>
    <template #sql-query>
      <SmState state="empty" test-id="test-case-sql-query-residual" :empty-text="t('quality.testCases.residualSqlQuery')" />
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('quality.testCases.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('quality.testCases.parameters')">
        <Input.TextArea v-model:value="editForm.parameterText" :rows="3" />
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--ant-color-text-secondary, #414651);
  margin-bottom: 12px;
}
</style>
