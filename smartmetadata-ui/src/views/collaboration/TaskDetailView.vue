<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Dropdown, Form, Input, Menu, Select, Space, Spin, Typography, message } from 'ant-design-vue';
import { addTaskComment, closeTask, deleteTask, getTask, patchTask, resolveTask } from '@/api/tasks';
import { TASK_ACTIONS, isTaskActionable, type TaskActionMode } from '@/catalog/taskActions';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { requiredField } from '@/features/crud/formRules';
import { TASK_RESOLUTIONS, type CollaborationTask } from '@/types/collaboration';
import { setFieldPatch } from '@/admin/jsonPatch';
import {
  loadGovernanceCatalog,
  ownerKey,
  parseOwnerKey,
  type GovernanceCatalog,
  type OwnerOption,
} from '@/governance/catalogOptions';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import SmTable from '@/components/shared/SmTable.vue';

const props = defineProps<{ id: string }>();
const router = useRouter();
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

const editOpen = ref(false);
const editDescription = ref('');
const editSaving = ref(false);
const reassignOpen = ref(false);
const assigneeKeys = ref<string[]>([]);
const reassignSaving = ref(false);
const catalog = ref<GovernanceCatalog | null>(null);
const catalogLoading = ref(false);

const assigneeOptions = computed<OwnerOption[]>(() => catalog.value?.owners ?? []);

const title = computed(
  () => task.value?.displayName || task.value?.name || props.id,
);

const actionable = computed(() => isTaskActionable(task.value?.status));

/**
 * Official TaskFeedCard getHasTaskEditAccess: an admin on a
 * non-approval task, an assignee, or a member of an assignee team
 * (unless also the creator) may act. When the profile has not loaded
 * the identity terms are unknown, so the status rule stands alone
 * rather than newly locking out a legitimate actor; the server still
 * enforces task writes.
 */
const canAct = computed(() => {
  if (!actionable.value) {
    return false;
  }
  const user = useAuthStore().user;
  if (!user) {
    return true;
  }
  const matches = (ref?: { id?: string; name?: string }) =>
    Boolean(ref && ((ref.id && ref.id === user.id) || (ref.name && ref.name === user.name)));
  const isAssignee = (task.value?.assignees ?? []).some((ref) => matches(ref));
  const isPartOfAssigneeTeam = (task.value?.assignees ?? []).some(
    (ref) =>
      ref.type === 'team' &&
      (user.teams ?? []).some((team) => team.id === ref.id || team.name === ref.name),
  );
  const isCreator = matches(task.value?.createdBy);
  const isAdminNonApproval =
    usePermissionStore().isAdminUser && task.value?.type !== 'RequestApproval';
  return isAdminNonApproval || isAssignee || (isPartOfAssigneeTeam && !isCreator);
});

async function onClose(): Promise<void> {
  if (!canAct.value) {
    return;
  }
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

async function onDelete(): Promise<void> {
  if (!canAct.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('collaboration.task.deleteTitle'),
    content: t('collaboration.task.deleteContent'),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  saving.value = true;
  try {
    await deleteTask(props.id);
    message.success(t('collaboration.task.deleted'));
    await router.replace({ name: 'tasks' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.deleteFailed'));
  } finally {
    saving.value = false;
  }
}

function onActionMenuClick(info: { key: string }): void {
  const action = TASK_ACTIONS.find((item) => item.key === (info.key as TaskActionMode));
  if (!action || !action.wired || !canAct.value) {
    return;
  }
  if (action.key === 'resolve') {
    void onResolve();
  } else if (action.key === 'close') {
    void onClose();
  } else if (action.key === 'edit') {
    editDescription.value = task.value?.description ?? '';
    editOpen.value = true;
  } else if (action.key === 're-assign') {
    void openReassign();
  }
}

async function openReassign(): Promise<void> {
  assigneeKeys.value = (task.value?.assignees ?? [])
    .filter((ref) => ref.id && ref.type)
    .map((ref) => ownerKey(ref.id as string, ref.type as string));
  reassignOpen.value = true;
  if (!catalog.value && !catalogLoading.value) {
    catalogLoading.value = true;
    try {
      catalog.value = await loadGovernanceCatalog();
    } catch {
      catalog.value = { owners: [], tags: [], domains: [] };
    } finally {
      catalogLoading.value = false;
    }
  }
}

async function onEditSave(): Promise<void> {
  if (!canAct.value || !task.value) {
    return;
  }
  editSaving.value = true;
  try {
    task.value = await patchTask(
      props.id,
      setFieldPatch('/description', task.value.description, editDescription.value),
    );
    editOpen.value = false;
    message.success(t('collaboration.task.descriptionSaved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.descriptionFailed'));
  } finally {
    editSaving.value = false;
  }
}

async function onReassignSave(): Promise<void> {
  if (!canAct.value || !task.value) {
    return;
  }
  reassignSaving.value = true;
  try {
    const assignees = assigneeKeys.value.flatMap((key) => {
      const parsed = parseOwnerKey(key);
      return parsed ? [{ id: parsed.id, type: parsed.type }] : [];
    });
    task.value = await patchTask(props.id, [{ op: 'replace', path: '/assignees', value: assignees }]);
    reassignOpen.value = false;
    message.success(t('collaboration.task.reassignSaved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.reassignFailed'));
  } finally {
    reassignSaving.value = false;
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
  if (!canAct.value) {
    return;
  }
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
        <Button data-testid="resolve-task" type="primary" :loading="saving" :disabled="!canAct" @click="onResolve">
          {{ t('collaboration.task.resolve') }}
        </Button>
        <Button data-testid="delete-task" danger :loading="saving" :disabled="!canAct" @click="onDelete">
          {{ t('collaboration.task.delete') }}
        </Button>
        <Dropdown :trigger="['click']">
          <Button data-testid="task-actions-menu" :disabled="!canAct">
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
      <Typography.Paragraph v-if="!actionable && !(task.type === 'DataAccessRequest' && task.status === 'Approved')" type="secondary" data-testid="task-terminal-note">
        {{ t('collaboration.task.terminalNote') }}
      </Typography.Paragraph>
      <Typography.Paragraph v-else-if="task.type === 'DataAccessRequest' && task.status === 'Approved'" type="secondary" data-testid="task-dar-approved-note">
        {{ t('collaboration.dataAccess.awaitingGrantNote') }}
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
      <template v-if="task.type === 'DataAccessRequest' && task.payload">
        <Typography.Title :level="5" class="collab-section" data-testid="task-dar-payload-title">{{ t('collaboration.dataAccess.payloadTitle') }}</Typography.Title>
        <Descriptions bordered :column="1" size="small">
          <Descriptions.Item :label="t('collaboration.dataAccess.accessType')">{{ task.payload.accessType || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.requestedAccess')">{{ task.payload.requestedAccess || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.columns')">{{ (task.payload.columns ?? []).join(', ') || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.duration')">{{ task.payload.duration || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.reason')">{{ task.payload.reason || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.extraAssets')">{{ (task.payload.assets ?? []).map((asset) => asset.fullyQualifiedName || asset.name).join(', ') || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.ticketId')">{{ task.payload.ticketId || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.dataAccess.expirationDate')">{{ task.payload.expirationDate ? new Date(task.payload.expirationDate).toLocaleString() : '—' }}</Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph v-if="task.payload.manualGrantReason" type="secondary" data-testid="task-dar-manual-reason">
          {{ t('collaboration.dataAccess.manualGrantReason', { reason: task.payload.manualGrantReason }) }}
        </Typography.Paragraph>
      </template>
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
    <SmDrawer
      :open="editOpen"
      :title="t('collaboration.task.editDescription')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="editSaving"
      @ok="onEditSave"
      @cancel="editOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.task.description')">
          <Input.TextArea v-model:value="editDescription" data-testid="task-description-edit" :rows="4" />
        </Form.Item>
      </Form>
    </SmDrawer>
    <SmDrawer
      :open="reassignOpen"
      :title="t('collaboration.task.reassignTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="reassignSaving"
      @ok="onReassignSave"
      @cancel="reassignOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.task.assignees')">
          <Select
            v-model:value="assigneeKeys"
            mode="multiple"
            allow-clear
            :loading="catalogLoading"
            data-testid="task-assignees-edit"
            style="width: 100%"
          >
            <Select.Option v-for="owner in assigneeOptions" :key="owner.key" :value="owner.key">
              {{ owner.label }} ({{ owner.type }})
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </SmDrawer>
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
