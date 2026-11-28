<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Form, Input, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { deleteTestSuite, getTestSuite, updateTestSuite } from '@/api/testSuites';
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import type { IngestionPipeline } from '@/types/ingestion';
import {
  addTestCasesToLogicalTestSuiteBulk,
  removeTestCaseFromTestSuite,
  type AddTestCaseListSubmitPayload,
} from '@/api/testCases';
import AddTestCaseList from '@/components/quality/AddTestCaseList.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { getDataQualityPagePath, getTestSuiteIngestionPath } from '@/utils/fqnPaths';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import EntityManageButton from '@/components/quality/EntityManageButton.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import SmState from '@/components/shared/SmState.vue';
import { QUALITY_PAGE_TABS } from '@/catalog/qualityTabs';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { EntityRef } from '@/types/api';
import type { TestSuite } from '@/types/quality';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const suite = ref<TestSuite | null>(null);
// Official TestSuiteDetailsPage tabs: TEST_CASES, PIPELINE — no OVERVIEW (t418u).
const activeTab = ref('test-cases');
const suiteFqn = computed(() => suite.value?.fullyQualifiedName ?? '');
const suiteDeleted = computed(() => suite.value?.deleted === true);
const suitePerms = useEntityPermissions('testSuite', suiteFqn, {
  deleted: suiteDeleted,
  enabled: computed(() => Boolean(suiteFqn.value)),
});
const hasDeletePermission = computed(() => !suiteDeleted.value && suitePerms.canDelete.value);
const editDisplayNamePermission = computed(() => !suiteDeleted.value && suitePerms.canEditDisplayName.value);

const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('label.data-quality'), to: getDataQualityPagePath('test-suites') },
  { label: entityLabel(suite.value) || t('label.entity-detail-plural', { entity: t('label.test-suite') }) },
]);

const tabs = computed<EntityDetailTab[]>(() =>
  QUALITY_PAGE_TABS.testSuite.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `test-suite-tab-${tab.key}`,
  })),
);

const testColumns = computed<EntityListColumn[]>(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.fully-qualified-name'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: t('label.action-plural'), key: 'actions', width: 120 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    suite.value = await getTestSuite(props.id);
  } catch (error) {
    suite.value = null;
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-suite') }));
  } finally {
    loading.value = false;
  }
}

async function onDeleteTestSuite(): Promise<void> {
  if (!suite.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('label.delete'),
    content: t('message.delete-entity-message', { entity: entityLabel(suite.value) }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestSuite(suite.value.id, { hardDelete: true });
    message.success(t('server.entity-deleted-successfully', { entity: entityLabel(suite.value) }));
    await router.push({ name: 'quality-test-suites' });
  } catch (error) {
    message.error(getErrorText(error, t('server.delete-entity-error', { entity: t('label.test-suite') })));
  }
}

function openEdit(): void {
  if (!suite.value) {
    return;
  }
  editForm.displayName = suite.value.displayName || '';
  editForm.description = suite.value.description || '';
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!suite.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTestSuite({
      name: suite.value.name,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
    });
    editOpen.value = false;
    message.success(t('server.update-entity-success', { entity: t('label.test-suite') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-suite') })));
  } finally {
    saving.value = false;
  }
}

const suitePipelines = ref<IngestionPipeline[]>([]);
const pipelinesLoading = ref(false);
const pipelinesError = ref('');
const pipelinesLoaded = ref(false);

const pipelineColumns = computed<EntityListColumn[]>(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.type'), dataIndex: 'pipelineType', key: 'pipelineType', width: 140 },
  { title: t('label.action-plural'), key: 'actions', width: 160 },
]);

async function loadPipelines(): Promise<void> {
  if (!suite.value?.fullyQualifiedName || pipelinesLoaded.value) {
    return;
  }
  pipelinesLoading.value = true;
  pipelinesError.value = '';
  try {
    const page = await listIngestionPipelines({
      service: suite.value.fullyQualifiedName,
      pipelineType: 'TestSuite',
      limit: 100,
    });
    suitePipelines.value = page.data;
    pipelinesLoaded.value = true;
  } catch {
    suitePipelines.value = [];
    pipelinesError.value = t('server.entity-fetch-error', { entity: t('label.pipeline-plural') });
  } finally {
    pipelinesLoading.value = false;
  }
}

function openAddPipeline(): void {
  const fqn = suite.value?.fullyQualifiedName;
  if (!fqn) {
    return;
  }
  void router.push(getTestSuiteIngestionPath(fqn));
}

function openEditPipeline(ingestionFqn: string): void {
  const fqn = suite.value?.fullyQualifiedName;
  if (!fqn || !ingestionFqn) {
    return;
  }
  void router.push(getTestSuiteIngestionPath(fqn, ingestionFqn));
}

const addOpen = ref(false);
const adding = ref(false);
const isLogical = computed(() => suite.value !== null && suite.value.basic !== true);

function openAddTests(): void {
  addOpen.value = true;
}

async function onAddTestsSubmit(payload: AddTestCaseListSubmitPayload): Promise<void> {
  if (!suite.value) {
    return;
  }
  const hasSelection = payload.selectAll
    ? true
    : payload.includeIds.length > 0;
  if (!hasSelection) {
    return;
  }
  adding.value = true;
  try {
    await addTestCasesToLogicalTestSuiteBulk(suite.value.id, payload);
    addOpen.value = false;
    message.success(t('server.update-entity-success', { entity: t('label.test-suite') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-suite') })));
  } finally {
    adding.value = false;
  }
}

async function onRemoveTest(testCaseId: string, testCaseName: string): Promise<void> {
  if (!suite.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('label.delete'),
    content: t('message.delete-entity-message', { entity: testCaseName }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await removeTestCaseFromTestSuite(suite.value.id, testCaseId);
    message.success(t('server.entity-deleted-successfully', { entity: testCaseName }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-suite') })));
  }
}

watch(
  () => props.id,
  () => {
    pipelinesLoaded.value = false;
    suitePipelines.value = [];
    void load();
  },
);

watch(activeTab, (tab) => {
  if (tab === 'pipeline') {
    void loadPipelines();
  }
});

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(suite) || t('label.entity-detail-plural', { entity: t('label.test-suite') })"
    :name="suite?.name"
    :fqn="suite?.fullyQualifiedName"
    :lead="t('label.entity-detail-plural', { entity: t('label.test-suite') })"
    :loading="loading"
    :error="errorMessage"
    :empty="!suite && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="suite ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <EntityManageButton
        :entity-label="t('label.test-suite')"
        :can-rename="editDisplayNamePermission"
        :can-delete="hasDeletePermission"
        :deleted="suiteDeleted"
        rename-test-id="edit-test-suite"
        delete-test-id="delete-test-suite"
        @rename="openEdit"
        @delete="onDeleteTestSuite"
      />
      <Button v-if="isLogical" data-testid="add-tests-to-suite" :disabled="!suite" @click="openAddTests">
        {{ t('label.add-entity', { entity: t('label.test-case-plural') }) }}
      </Button>
    </template>
    <template #meta>
      <Descriptions v-if="suite" bordered :column="2" size="small" data-testid="test-suite-header-meta">
        <Descriptions.Item :label="t('label.type')">
          {{ suite.basic ? t('label.table-suite-plural') : t('label.bundle-suite') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.description')">{{ suite.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #pipeline>
      <Button
        data-testid="add-test-suite-ingestion"
        :disabled="!suite"
        style="margin-bottom: 16px"
        @click="openAddPipeline"
      >
        {{ t('label.add-entity', { entity: t('label.pipeline-plural') }) }}
      </Button>
      <SmState v-if="pipelinesError" state="error" test-id="test-suite-pipelines-error" :error-text="pipelinesError" />
      <SmTable
        v-else
        row-key="id"
        size="small"
        :columns="pipelineColumns"
        :data-source="suitePipelines"
        :loading="pipelinesLoading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`test-suite-pipeline-${(record as IngestionPipeline).id}`"
              @click.prevent="router.push({ name: 'ingestion-pipeline', params: { id: (record as IngestionPipeline).id } })"
            >
              {{ entityLabel(record as IngestionPipeline) }}
            </a>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              type="link"
              :data-testid="`edit-test-suite-pipeline-${(record as IngestionPipeline).id}`"
              @click="openEditPipeline((record as IngestionPipeline).fullyQualifiedName ?? '')"
            >
              {{ t('label.edit') }}
            </Button>
          </template>
        </template>
      </SmTable>
    </template>
    <template #test-cases>
      <SmTable
        row-key="id"
        size="small"
        :columns="testColumns"
        :data-source="suite?.tests ?? []"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'actions'">
            <Button
              v-if="isLogical && (record as EntityRef).id"
              type="link"
              danger
              :data-testid="`remove-test-${(record as EntityRef).id}`"
              @click="onRemoveTest((record as EntityRef).id as string, entityLabel(record as EntityRef))"
            >
              {{ t('label.delete') }}
            </Button>
          </template>
          <template v-else-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as EntityRef).id } })"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </SmTable>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('label.edit-entity', { entity: t('label.test-suite') })"
    :ok-text="t('label.update')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('label.display-name')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('label.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
    </Form>
  </FormModal>
  <FormModal
    :open="addOpen"
    :title="t('label.add-entity', { entity: t('label.test-case-plural') })"
    :footer="null"
    width="640"
    @cancel="addOpen = false"
  >
    <AddTestCaseList
      :existing-test="suite?.tests ?? []"
      @cancel="addOpen = false"
      @submit="onAddTestsSubmit"
    />
  </FormModal>
</template>