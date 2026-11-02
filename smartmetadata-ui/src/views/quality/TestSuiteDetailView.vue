<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Form, Input, Modal, Select, Table, message } from 'ant-design-vue';
import { deleteTestSuite, getTestSuite, updateTestSuite } from '@/api/testSuites';
import {
  addTestCasesToLogicalTestSuite,
  listTestCases,
  removeTestCaseFromTestSuite,
} from '@/api/testCases';
import FormModal from '@/components/shared/FormModal.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
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
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('quality.testSuites.title'), to: { name: 'quality-test-cases', query: { tab: 'test-suites' } } },
  { label: entityLabel(suite.value) || t('quality.testSuites.title') },
]);

const tabs = computed<EntityDetailTab[]>(() =>
  QUALITY_PAGE_TABS.testSuite.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `test-suite-tab-${tab.key}`,
  })),
);

const testColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: t('crud.actions'), key: 'actions', width: 120 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    suite.value = await getTestSuite(props.id);
  } catch (error) {
    suite.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onDeleteTestSuite(): Promise<void> {
  if (!suite.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: entityLabel(suite.value) }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestSuite(suite.value.id, { hardDelete: true });
    message.success(t('crud.deletedName', { name: entityLabel(suite.value) }));
    await router.push({ name: 'quality-test-suites' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
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
    message.success(t('quality.testSuites.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

const addOpen = ref(false);
const adding = ref(false);
const availableCases = ref<{ id: string; name: string }[]>([]);
const selectedCaseIds = ref<string[]>([]);
const isLogical = computed(() => suite.value !== null && suite.value.basic !== true);

async function openAddTests(): Promise<void> {
  addOpen.value = true;
  selectedCaseIds.value = [];
  try {
    const page = await listTestCases({ limit: 100 });
    const existing = new Set((suite.value?.tests ?? []).map((item) => item.id));
    availableCases.value = page.data
      .filter((item) => item.id && !existing.has(item.id))
      .map((item) => ({ id: item.id as string, name: item.name }));
  } catch {
    availableCases.value = [];
  }
}

async function onAddTests(): Promise<void> {
  if (!suite.value || !selectedCaseIds.value.length) {
    return;
  }
  adding.value = true;
  try {
    await addTestCasesToLogicalTestSuite(suite.value.id, selectedCaseIds.value);
    addOpen.value = false;
    message.success(t('quality.testSuites.testsAdded'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    adding.value = false;
  }
}

async function onRemoveTest(testCaseId: string, testCaseName: string): Promise<void> {
  if (!suite.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('quality.testSuites.removeTest'),
    content: t('crud.deleteConfirm', { name: testCaseName }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await removeTestCaseFromTestSuite(suite.value.id, testCaseId);
    message.success(t('quality.testSuites.testRemoved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
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
    :title="entityLabel(suite) || t('quality.testSuites.title')"
    :name="suite?.name"
    :fqn="suite?.fullyQualifiedName"
    :lead="t('quality.testSuites.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!suite && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="suite ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-test-suite" :disabled="!suite" @click="openEdit">{{ t('crud.edit') }}</Button>
      <Button danger data-testid="delete-test-suite" :disabled="!suite" @click="onDeleteTestSuite">{{ t('crud.delete') }}</Button>
      <Button v-if="isLogical" data-testid="add-tests-to-suite" :disabled="!suite" @click="openAddTests">
        {{ t('quality.testSuites.addTests') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="suite" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ suite.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ suite.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('quality.testSuites.suiteType')">
          {{ suite.basic ? t('quality.testSuites.basic') : t('quality.testSuites.logical') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testSuites.summary')">
          {{
            t('quality.testSuites.summaryValue', {
              success: suite.summary?.success ?? '—',
              failed: suite.summary?.failed ?? '—',
              aborted: suite.summary?.aborted ?? '—',
              queued: suite.summary?.queued ?? '—',
            })
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ suite.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #pipeline>
      <SmState state="empty" test-id="test-suite-pipeline-residual" :empty-text="t('quality.testSuites.residualPipeline')" />
    </template>
    <template #tests>
      <Table
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
              {{ t('quality.testSuites.removeTest') }}
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
      </Table>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('quality.testSuites.editTitle')"
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
    </Form>
  </Modal>
  <FormModal
    :open="addOpen"
    :title="t('quality.testSuites.addTestsTitle')"
    :ok-text="t('quality.testSuites.addTests')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="adding"
    @ok="onAddTests"
    @cancel="addOpen = false"
  >
    <p>{{ t('quality.testSuites.addTestsLead') }}</p>
    <Form layout="vertical">
      <Form.Item :label="t('quality.testSuites.tests')">
        <Select
          v-model:value="selectedCaseIds"
          mode="multiple"
          data-testid="add-tests-select"
          style="width: 100%"
          :options="availableCases.map((item) => ({ value: item.id, label: item.name }))"
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>