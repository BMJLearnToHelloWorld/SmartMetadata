<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Form, Input, Modal, Table, message } from 'ant-design-vue';
import { getTestSuite, updateTestSuite } from '@/api/testSuites';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
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
  { label: t('quality.testSuites.title'), to: { name: 'quality-test-suites' } },
  { label: entityLabel(suite.value) || t('quality.testSuites.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'test-suite-tab-overview' },
  { key: 'tests', label: t('quality.testSuites.testsTab'), testId: 'test-suite-tab-tests' },
]);

const testColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
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
    <template #tests>
      <Table
        row-key="id"
        size="small"
        :columns="testColumns"
        :data-source="suite?.tests ?? []"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
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
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
    </Form>
  </Modal>
</template>
