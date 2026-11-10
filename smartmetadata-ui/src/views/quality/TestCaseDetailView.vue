<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Button, Descriptions, Form, Input, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { deleteTestCase, getTestCase, getTestCaseByName, updateTestCase } from '@/api/testCases';
import { getTestDefinition } from '@/api/testDefinitions';
import { latestGovernanceVersionPath } from '@/api/governanceVersions';
import { getTestCaseVersionPath } from '@/catalog/versionPaths';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { listTestCaseResults } from '@/api/testCaseResults';
import { listTestIncidents } from '@/api/testIncidents';
import SmChart from '@/features/charts/SmChart.vue';
import { testResultsToTimeline } from '@/features/charts/series';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import SmState from '@/components/shared/SmState.vue';
import DimensionalityPanel from '@/features/quality/DimensionalityPanel.vue';
import { QUALITY_PAGE_TABS } from '@/catalog/qualityTabs';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { parseEntityLink } from '@/quality/entityLink';
import TableDiffFields from '@/features/quality/TableDiffFields.vue';
import { TABLE2_PARAM, isTableDiffDefinition } from '@/features/quality/tableDiffParams';
import type { TestCase, TestCaseResult, TestDefinition, TestIncident } from '@/types/quality';

const props = defineProps<{ id: string; tab?: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const testCase = ref<TestCase | null>(null);
const editDefinition = ref<TestDefinition | null>(null);
const results = ref<TestCaseResult[]>([]);
const issues = ref<TestIncident[]>([]);
const issuesError = ref('');
// The /test-case/:fqn/:tab alias carries the tab in the route; an unknown
// tab falls back to 'overview'. The supported flag on qualityTabs.ts is
// deliberately untouched (condition 16(ii) — P4 owns the dimensionality fix).
const tabKeys = new Set(QUALITY_PAGE_TABS.testCase.map((tab) => tab.key));
const activeTab = ref(props.tab !== undefined && tabKeys.has(props.tab) ? props.tab : 'overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  parameterText: '',
  /** tableDiff 编辑态的参数值（与创建表单同一份 modelValue 形态）。 */
  parameterValues: {} as Record<string, string>,
});

const isTableDiff = computed(() =>
  isTableDiffDefinition(
    testCase.value?.testDefinition?.name,
    testCase.value?.testDefinition?.fullyQualifiedName,
  ),
);

const editEntity = computed(() => {
  if (!testCase.value?.entityLink) {
    return null;
  }
  return parseEntityLink(testCase.value.entityLink);
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
  // 只呈现运行实际算出的命名值（removedRows / addedRows / diffCount 等）；
  // 未算出的字段不占位、不补假值。ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
  { title: t('quality.testCases.diffValues'), key: 'values', width: 220 },
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
    // The /test-case/:fqn alias carries an FQN, not a UUID: the server's
    // GET /v1/dataQuality/testCases/{id} takes a UUID only, so FQNs load
    // through the /name/{fqn} endpoint.
    // ADR:2026-11-08-incident-detail-redirects-to-test-case
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(props.id);
    const loaded = isUuid ? await getTestCase(props.id) : await getTestCaseByName(props.id);
    testCase.value = loaded;
    editDefinition.value = null;
    if (
      loaded.testDefinition?.id &&
      isTableDiffDefinition(loaded.testDefinition.name, loaded.testDefinition.fullyQualifiedName)
    ) {
      // 编辑态需要定义的完整 parameterDefinition（不能只从已有参数值推导，
      // 否则未填过的参数在编辑表单里直接消失）；取不到时回落到文本编辑。
      try {
        editDefinition.value = await getTestDefinition(loaded.testDefinition.id);
      } catch {
        editDefinition.value = null;
      }
    }
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
    editDefinition.value = null;
    results.value = [];
    issues.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onDeleteTestCase(): Promise<void> {
  if (!testCase.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: entityLabel(testCase.value) }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestCase(testCase.value.id, { hardDelete: true });
    message.success(t('crud.deletedName', { name: entityLabel(testCase.value) }));
    await router.push({ name: 'quality-test-cases' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

async function onOpenVersions(): Promise<void> {
  const targetId = testCase.value?.id ?? props.id;
  if (!targetId) {
    return;
  }
  try {
    const path = await latestGovernanceVersionPath('testCase', targetId, (version) => getTestCaseVersionPath(targetId, version));
    if (!path) {
      message.info(t('asset.versionsEmpty'));
      return;
    }
    await router.push(path);
  } catch {
    message.error(t('asset.versionsFailed'));
  }
}

function openEdit(): void {
  if (!testCase.value) {
    return;
  }
  editForm.displayName = testCase.value.displayName || '';
  editForm.description = testCase.value.description || '';
  editForm.parameterText = testCase.value.parameterValues.map((item) => `${item.name}=${item.value}`).join('\n');
  editForm.parameterValues = Object.fromEntries(
    testCase.value.parameterValues.map((item) => [item.name, item.value]),
  );
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!testCase.value?.entityLink || !testCase.value.testDefinition) {
    message.error(t('quality.testCases.cannotUpdate'));
    return;
  }
  if (isTableDiff.value && !(editForm.parameterValues[TABLE2_PARAM] ?? '').trim()) {
    message.error(t('quality.testCases.tableDiffTable2Required'));
    return;
  }
  saving.value = true;
  try {
    const parameterValues = isTableDiff.value
      ? Object.entries(editForm.parameterValues)
          .map(([name, value]) => ({ name, value: value.trim() }))
          .filter((entry) => entry.value.length > 0)
      : editForm.parameterText
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

watch(
  () => props.tab,
  (tab) => {
    activeTab.value = tab !== undefined && tabKeys.has(tab) ? tab : 'overview';
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
      <Button data-testid="test-case-versions" :disabled="!testCase" @click="onOpenVersions">{{ t('governance.versions.openVersions') }}</Button>
      <Button danger data-testid="delete-test-case" :disabled="!testCase" @click="onDeleteTestCase">{{ t('crud.delete') }}</Button>
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
      <SmTable
        test-id="test-case-results-table"
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
          <template v-else-if="column.key === 'values'">
            <div
              v-if="(record as TestCaseResult).testResultValue?.length"
              :data-testid="`test-case-result-values-${(record as TestCaseResult).timestamp}`"
            >
              <div
                v-for="entry in (record as TestCaseResult).testResultValue"
                :key="entry.name"
              >
                {{ entry.name }}: {{ entry.value }}
              </div>
            </div>
            <span v-else>—</span>
          </template>
        </template>
      </SmTable>
    </template>
    <template #issues>
      <SmState
        v-if="issuesError"
        state="error"
        test-id="test-case-issues-error"
        :error-text="issuesError"
      />
      <SmTable
        v-else
        test-id="test-case-issues-table"
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
              @click.prevent="
                router.push(
                  `/test-case/${encodeURIComponent(
                    testCase?.fullyQualifiedName ??
                      (record as TestIncident).testCaseReference?.fullyQualifiedName ??
                      '',
                  )}/issues`,
                )
              "
            >
              {{ (record as TestIncident).testCaseResolutionStatusType || '—' }}
            </a>
          </template>
        </template>
      </SmTable>
    </template>
    <template #dimensionality>
      <DimensionalityPanel
        v-if="testCase?.fullyQualifiedName"
        :test-case-fqn="testCase.fullyQualifiedName"
        :dimension-columns="testCase.dimensionColumns ?? []"
      />
      <SmState
        v-else
        state="empty"
        test-id="test-case-dimensionality-residual"
        :empty-text="t('quality.testCases.residualDimensionality')"
      />
    </template>
    <template #sql-query>
      <SmState state="empty" test-id="test-case-sql-query-residual" :empty-text="t('quality.testCases.residualSqlQuery')" />
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('quality.testCases.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <TableDiffFields
        v-if="isTableDiff && editDefinition"
        :definitions="editDefinition.parameterDefinition"
        :entity-fqn="editEntity?.fqn ?? testCase.entityFQN ?? ''"
        :entity-type="editEntity?.entityType ?? 'table'"
        :model-value="editForm.parameterValues"
        @update:model-value="editForm.parameterValues = $event"
      />
      <Form.Item v-else :label="t('quality.testCases.parameters')">
        <Input.TextArea v-model:value="editForm.parameterText" :rows="3" />
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-bottom: 12px;
}
</style>
