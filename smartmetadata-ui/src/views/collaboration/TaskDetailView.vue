<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Descriptions, Dropdown, Form, Input, Menu, Select, Space, Spin, Typography, message } from 'ant-design-vue';
import { addTaskComment, closeTask, getTask, resolveTask } from '@/api/tasks';
import { TASK_ACTIONS, isTaskActionable, type TaskActionMode } from '@/catalog/taskActions';
import { requiredField } from '@/features/crud/formRules';
import { TASK_RESOLUTIONS, type CollaborationTask } from '@/types/collaboration';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';

const props = defineProps<{ id: string }>();
const { t } = useI18n();

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const task = ref<CollaborationTask | null>(null);
const form = reactive({
  resolutionType: 'Completed',
  comment: '',
  message: '',
});

const commentColumns = computed(() => [
  { title: t('collaboration.task.author'), key: 'author', width: 180 },
  { title: t('collaboration.task.message'), dataIndex: 'message', key: 'message' },
]);

const title = computed(
  () => task.value?.displayName || task.value?.name || props.id,
);

const actionable = computed(() => isTaskActionable(task.value?.status));

async function onClose(): Promise<void> {
  saving.value = true;
  try {
    task.value = await closeTask(props.id, form.comment.trim() || undefined);
    message.success(t('collaboration.task.closed'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.closeFailed'));
  } finally {
    saving.value = false;
  }
}

function onActionMenuClick(info: { key: string }): void {
  const action = TASK_ACTIONS.find((item) => item.key === (info.key as TaskActionMode));
  if (!action || !action.wired || !actionable.value) {
    return;
  }
  if (action.key === 'resolve') {
    void onResolve();
  } else if (action.key === 'close') {
    void onClose();
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    task.value = await getTask(props.id);
  } catch (error) {
    task.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.task.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onResolve(): Promise<void> {
  saving.value = true;
  try {
    task.value = await resolveTask(props.id, {
      resolutionType: form.resolutionType as (typeof TASK_RESOLUTIONS)[number],
      comment: form.comment.trim() || undefined,
    });
    message.success(t('collaboration.task.resolved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.resolveFailed'));
  } finally {
    saving.value = false;
  }
}

async function onComment(): Promise<void> {
  if (!form.message.trim()) {
    message.error(t('collaboration.task.commentRequired'));
    return;
  }
  saving.value = true;
  try {
    task.value = await addTaskComment(props.id, form.message.trim());
    form.message = '';
    message.success(t('collaboration.task.commentAdded'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.commentFailed'));
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading">
  <Card>
    <PageHeader :header="title" />
    <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" class="collab-alert" />
    <template v-if="task">
      <Space class="collab-actions" wrap>
        <Button data-testid="resolve-task" type="primary" :loading="saving" :disabled="!actionable" @click="onResolve">
          {{ t('collaboration.task.resolve') }}
        </Button>
        <Dropdown :trigger="['click']">
          <Button data-testid="task-actions-menu" :disabled="!actionable">
            {{ t('collaboration.task.actions') }}
          </Button>
          <template #overlay>
            <Menu @click="onActionMenuClick">
              <Menu.Item
                v-for="action in TASK_ACTIONS"
                :key="action.key"
                :data-testid="`task-action-menu-item-${action.key}`"
                :disabled="!actionable || !action.wired"
              >
                {{ t(action.labelKey) }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </Space>
      <Typography.Paragraph v-if="!actionable" type="secondary" data-testid="task-terminal-note">
        {{ t('collaboration.task.terminalNote') }}
      </Typography.Paragraph>
      <Typography.Paragraph v-else type="secondary" data-testid="task-actions-residual">
        {{ t('collaboration.task.unwiredNote') }}
      </Typography.Paragraph>
      <Descriptions bordered :column="1" size="small">
        <Descriptions.Item :label="t('collaboration.task.status')">{{ task.status || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('collaboration.task.category')">{{ task.category || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('collaboration.task.type')">{{ task.type || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('collaboration.task.priority')">{{ task.priority || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('collaboration.task.about')">
          {{ task.about?.fullyQualifiedName || task.about?.name || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('collaboration.task.assignees')">
          {{ task.assignees.map((assignee) => assignee.displayName || assignee.name).join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('collaboration.task.description')">{{ task.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title :level="5" class="collab-section">{{ t('collaboration.task.resolve') }}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {{ t('collaboration.task.resolveLead') }}
      </Typography.Paragraph>
      <Space>
        <Select v-model:value="form.resolutionType" style="width: 180px">
          <Select.Option v-for="resolution in TASK_RESOLUTIONS" :key="resolution" :value="resolution">
            {{ resolution }}
          </Select.Option>
        </Select>
        <Input v-model:value="form.comment" :placeholder="t('collaboration.task.commentPlaceholder')" style="width: 280px" />
      </Space>
      <Typography.Title :level="5" class="collab-section">{{ t('collaboration.task.comments') }}</Typography.Title>
      <SmTable
        row-key="id"
        test-id="task-comments-table"
        :columns="commentColumns"
        :data-source="task.comments"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'author'">
            {{ record.author?.displayName || record.author?.name || '—' }}
          </template>
        </template>
      </SmTable>
      <Form layout="vertical" class="collab-section">
        <Form.Item :label="t('collaboration.task.addComment')" :rules="requiredField(t, t('collaboration.task.message'))">
          <Input.TextArea v-model:value="form.message" data-testid="task-comment" :rows="2" />
        </Form.Item>
        <Button data-testid="add-task-comment" type="primary" :loading="saving" @click="onComment">
          {{ t('collaboration.task.addComment') }}
        </Button>
      </Form>
    </template>
  </Card>
  </Spin>
</template>

<style scoped>
.collab-alert {
  margin-bottom: 16px;
}
.collab-section {
  margin-top: 24px;
}
.collab-actions {
  margin-bottom: 16px;
}
</style>
