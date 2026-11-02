<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Card, Form, Input, Select, Space, Tabs, Typography, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { createTask, listTasks } from '@/api/tasks';
import { TASK_STATUS_TABS, taskStatusQuery } from '@/catalog/collaborationTabs';
import { requiredField } from '@/features/crud/formRules';
import { toEntityLink } from '@/quality/entityLink';
import {
  CREATABLE_TASK_TYPES,
  TASK_CATEGORIES,
  type CollaborationTask,
} from '@/types/collaboration';

const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const tasks = ref<CollaborationTask[]>([]);
const total = ref<number | undefined>();
const activeStatusTab = ref('open');
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  category: 'Custom',
  type: 'CustomTask',
  description: '',
  entityType: 'table',
  entityFqn: '',
  assignees: '',
});

const columns = computed(() => [
  { title: t('collaboration.tasks.name'), key: 'name' },
  { title: t('collaboration.tasks.type'), dataIndex: 'type', key: 'type', width: 180 },
  { title: t('collaboration.tasks.status'), dataIndex: 'status', key: 'status', width: 120 },
  { title: t('collaboration.tasks.about'), key: 'about' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const tab = TASK_STATUS_TABS.find((item) => item.key === activeStatusTab.value) ?? TASK_STATUS_TABS[0];
    const page = await listTasks({ limit: 50, ...taskStatusQuery(tab) });
    tasks.value = page.data;
    total.value = page.total;
  } catch (error) {
    tasks.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.tasks.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const assignees = form.assignees
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const created = await createTask({
      category: form.category as (typeof TASK_CATEGORIES)[number],
      type: form.type as (typeof CREATABLE_TASK_TYPES)[number],
      description: form.description.trim() || undefined,
      about: form.entityFqn.trim() ? toEntityLink(form.entityType, form.entityFqn) : undefined,
      assignees: assignees.length ? assignees : undefined,
    });
    createOpen.value = false;
    message.success(t('collaboration.tasks.created', { name: created.name || created.id }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.tasks.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="collab-head">
        <div>
          <Typography.Title :level="4">{{ t('collaboration.tasks.title') }}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {{ t('collaboration.tasks.lead') }}
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-task" @click="createOpen = true">
          {{ t('collaboration.tasks.create') }}
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Tabs :active-key="activeStatusTab" data-testid="tasks-status-tabs" @change="(key) => { activeStatusTab = String(key); void load(); }">
        <Tabs.TabPane v-for="tab in TASK_STATUS_TABS" :key="tab.key" :tab="t(tab.labelKey)" />
      </Tabs>
      <SmTable
        row-key="id"
        test-id="tasks-table"
        :columns="columns"
        :data-source="tasks"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`task-row-${(record as CollaborationTask).id}`"
              @click.prevent="router.push({ name: 'task', params: { id: (record as CollaborationTask).id } })"
            >
              {{
                (record as CollaborationTask).displayName ||
                (record as CollaborationTask).name ||
                (record as CollaborationTask).id
              }}
            </a>
          </template>
          <template v-else-if="column.key === 'about'">
            {{
              (record as CollaborationTask).about?.fullyQualifiedName ||
              (record as CollaborationTask).about?.name ||
              '—'
            }}
          </template>
        </template>
      </SmTable>
      <Typography.Text type="secondary">
        {{
          total !== undefined
            ? t('crud.shownOf', { shown: tasks.length, total })
            : t('crud.shown', { shown: tasks.length })
        }}
      </Typography.Text>
    </Space>
    <FormModal
      :open="createOpen"
      :title="t('collaboration.tasks.createTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      @ok="onCreate"
    @cancel="createOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.tasks.category')" :rules="requiredField(t, t('collaboration.tasks.category'))">
          <Select v-model:value="form.category">
            <Select.Option v-for="category in TASK_CATEGORIES" :key="category" :value="category">
              {{ category }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.tasks.type')" :rules="requiredField(t, t('collaboration.tasks.type'))">
          <Select v-model:value="form.type">
            <Select.Option v-for="type in CREATABLE_TASK_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.tasks.description')" :extra="t('collaboration.tasks.descriptionHelp')">
          <Input.TextArea v-model:value="form.description" data-testid="create-task-description" :rows="3" />
        </Form.Item>
        <Form.Item :label="t('collaboration.tasks.entityType')" :extra="t('collaboration.tasks.entityTypeHelp')">
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.tasks.fqn')" :extra="t('collaboration.tasks.fqnHelp')">
          <Input v-model:value="form.entityFqn" data-testid="create-task-fqn" />
        </Form.Item>
        <Form.Item :label="t('collaboration.tasks.assignees')" :extra="t('collaboration.tasks.assigneesHelp')">
          <Input v-model:value="form.assignees" :placeholder="t('collaboration.tasks.assigneesPlaceholder')" />
        </Form.Item>
      </Form>
    </FormModal>
  </Card>
</template>

<style scoped>
.collab-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
