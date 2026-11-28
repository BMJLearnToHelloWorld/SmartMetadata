<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Dropdown, Form, Input, Menu, Select, Space, Spin, Tooltip, Typography, message } from 'ant-design-vue';
import { addTaskComment, closeTask, deleteTask, getTask, patchTask, resolveTask } from '@/api/tasks';
import type { OperationPermissions } from '@/api/permissions';
import { buildFeedbackApprovalResolution, isRecognizerFeedbackTask } from '@/catalog/recognizerFeedback';
import { TASK_ACTIONS, isTaskActionable, type TaskActionMode } from '@/catalog/taskActions';
import { getTaskResolutionNewValue, normalizeTaskSuggestion } from '@/catalog/taskSuggestions';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { requiredField } from '@/features/crud/formRules';
import { TASK_RESOLUTIONS, type CollaborationTask, type ResolveTaskRequest } from '@/types/collaboration';
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
import FeedbackApprovalTask from './FeedbackApprovalTask.vue';

const props = defineProps<{ id: string; embedded?: boolean }>();
const emit = defineEmits<{ afterClose: [] }>();
const router = useRouter();
const { t } = useI18n();

function maybeEmitAfterClose(): void {
  if (props.embedded && task.value && !isTaskActionable(task.value.status)) {
    emit('afterClose');
  }
}

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const task = ref<CollaborationTask | null>(null);
/**
 * Second permission line for task actions: an EditAll grant on this
 * task via the permission API (server TaskResourceContext, same
 * client as the debugger). A failed query is not a grant (fail
 * closed); the server still enforces task writes.
 */
const taskOps = ref<OperationPermissions | null>(null);
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
const selectedTransitionId = ref('');

const suggestion = computed(() => (task.value ? normalizeTaskSuggestion(task.value) : null));

const selectedTransition = computed(
  () => task.value?.availableTransitions?.find((item) => item.id === selectedTransitionId.value),
);

watch(
  () => task.value?.id,
  () => {
    selectedTransitionId.value = task.value?.availableTransitions?.[0]?.id ?? '';
  },
);
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

const isFeedbackTask = computed(() => (task.value ? isRecognizerFeedbackTask(task.value) : false));

const hasTransitions = computed(() => (task.value?.availableTransitions?.length ?? 0) > 0);

/**
 * Ownership flags shared by the generic gate and the feedback gate so
 * the two rules can never drift apart on what "assignee" means.
 *
 * Deliberate fork convention: assignee and creator match by id OR
 * name, and team membership by team id OR name. The pin's
 * computeTaskOwnershipFlags (TaskTab.utils.ts) matches assignee and
 * team by id only and creator by name only, so a name-only match
 * grants the affordance here where the pin would disable it. The
 * broader matching predates this batch and is shared with the generic
 * `canAct` gate; narrowing it would risk P1 permission behavior, and
 * the server still enforces task writes.
 */
function taskOwnership(
  taskValue: CollaborationTask | null,
  user: { id?: string; name?: string; teams?: Array<{ id?: string; name?: string }> } | null,
): { isAssignee: boolean; isPartOfAssigneeTeam: boolean; isCreator: boolean } {
  const matches = (ref?: { id?: string; name?: string }) =>
    Boolean(
      user && ref && ((ref.id && ref.id === user.id) || (ref.name && ref.name === user.name)),
    );
  const isAssignee = (taskValue?.assignees ?? []).some((ref) => matches(ref));
  const isPartOfAssigneeTeam = (taskValue?.assignees ?? []).some(
    (ref) =>
      ref.type === 'team' &&
      (user?.teams ?? []).some((team) => team.id === ref.id || team.name === ref.name),
  );
  const isCreator = matches(taskValue?.createdBy);
  return { isAssignee, isPartOfAssigneeTeam, isCreator };
}

/**
 * Official TaskFeedCard getHasTaskEditAccess: an admin on a
 * non-approval task, an assignee, or a member of an assignee team
 * (unless also the creator) may act — plus the permission-API line
 * (an EditAll grant on the task). When the profile has not loaded
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
  const { isAssignee, isPartOfAssigneeTeam, isCreator } = taskOwnership(task.value, user);
  const isAdminNonApproval =
    usePermissionStore().isAdminUser && task.value?.type !== 'RequestApproval';
  const taskGrant = taskOps.value?.EditAll === true;
  return isAdminNonApproval || taskGrant || isAssignee || (isPartOfAssigneeTeam && !isCreator);
});

/**
 * Official TaskTabNew approvalWorkflowActions gate (the TASK-TAB rule,
 * D-F10): assignee, or member of an assignee team who is not the
 * creator. No admin line and no permission-API line — an admin who is
 * not a reviewer gets the DISABLED split button plus the
 * only-reviewers tooltip. An unknown user fails closed: unlike the
 * generic gate, there is no "profile not loaded yet" fallback here,
 * matching the pin, where the flags are computed from a loaded user.
 */
const canFeedbackAct = computed(() => {
  if (!actionable.value) {
    return false;
  }
  const user = useAuthStore().user;
  if (!user) {
    return false;
  }
  const { isAssignee, isPartOfAssigneeTeam, isCreator } = taskOwnership(task.value, user);
  return isAssignee || (isPartOfAssigneeTeam && !isCreator);
});

const feedbackTooltip = computed(() =>
  canFeedbackAct.value ? undefined : t('collaboration.task.onlyReviewersCanApproveOrReject'),
);

/**
 * The pin's legacy approval surface offers ONLY approve/reject: no
 * suggestion editing, no resolve-with-a-pick, no close without
 * resolution. For feedback tasks the action menu keeps just the
 * maintenance items (edit description, re-assign); view/resolve/close
 * are suppressed. Non-feedback tasks keep the full menu.
 */
const menuActions = computed(() =>
  isFeedbackTask.value
    ? TASK_ACTIONS.filter((action) => action.key === 'edit' || action.key === 're-assign')
    : TASK_ACTIONS,
);

async function onClose(): Promise<void> {
  if (!canAct.value) {
    return;
  }
  saving.value = true;
  try {
    task.value = await closeTask(props.id, form.comment.trim() || undefined);
    message.success(t('collaboration.task.closed'));
    maybeEmitAfterClose();
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
    if (props.embedded) {
      emit('afterClose');
    } else {
      await router.replace({ name: 'tasks' });
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.deleteFailed'));
  } finally {
    saving.value = false;
  }
}

function onActionMenuClick(info: { key: string | number }): void {
  const action = TASK_ACTIONS.find((item) => item.key === (String(info.key) as TaskActionMode));
  if (!action || !action.wired || !canAct.value) {
    return;
  }
  if (action.key === 'view') {
    void onAcceptSuggestion();
  } else if (action.key === 'resolve') {
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

/**
 * Official TASK_ACTION_LIST VIEW = accept-suggestion, routed through
 * TaskTabNew.handleMenuItemClick's else branch into onTaskResolve:
 * resolve with Approved + the normalized newValue (description text,
 * or the suggested tag set serialized). The schema-driven payload is
 * not sent: the product carries no task-form uiSchema surface, so
 * there is no original form payload to echo — newValue is the
 * operative field for the plain description/tag kinds.
 */
async function onAcceptSuggestion(): Promise<void> {
  if (!canAct.value || !task.value) {
    return;
  }
  // Feedback tasks skip the empty-suggestion guard (the pin skips the
  // empty-value guard for approval-workflow tasks) and resolve with
  // the feedbackApproval sentinel + payload echo, never the
  // suggested-value JSON — via the shared handler, as on every path.
  const feedbackBody = isFeedbackTask.value
    ? buildFeedbackApprovalResolution(task.value, 'approve')
    : null;
  if (!feedbackBody && (!suggestion.value || suggestion.value.isSuggestionEmpty)) {
    return;
  }
  saving.value = true;
  try {
    const body: ResolveTaskRequest = feedbackBody ?? {
      resolutionType: 'Approved',
      newValue: getTaskResolutionNewValue(task.value),
      comment: form.comment.trim() || undefined,
    };
    task.value = await resolveTask(props.id, body);
    message.success(t('collaboration.task.resolved'));
    maybeEmitAfterClose();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.resolveFailed'));
  } finally {
    saving.value = false;
  }
}

/**
 * The split button's decision. No comment is required or sent: the
 * pin's legacy approve/reject paths send no comment, and the generic
 * resolve form (with its comment input) is suppressed for feedback
 * tasks. Bodies come from the shared feedbackApproval handler.
 */
async function onFeedbackDecision(decision: 'approve' | 'reject'): Promise<void> {
  if (!canFeedbackAct.value || !task.value) {
    return;
  }
  saving.value = true;
  try {
    task.value = await resolveTask(
      props.id,
      buildFeedbackApprovalResolution(task.value, decision),
    );
    message.success(t('collaboration.task.resolved'));
    maybeEmitAfterClose();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.resolveFailed'));
  } finally {
    saving.value = false;
  }
}

function onFeedbackMenuClick(info: { key: string | number }): void {
  const key = String(info.key);
  if (key === 'approve' || key === 'reject') {
    void onFeedbackDecision(key);
  }
}

/**
 * Official TaskTabNew workflow actions: the transition menu is built
 * from task.availableTransitions (id + label); picking one runs it
 * via resolve with that transitionId and the transition's own
 * resolutionType (undefined for non-terminal transitions — never
 * defaulted to Approved). A transition that requires a comment
 * refuses an empty comment instead of firing.
 */
async function onRunTransition(): Promise<void> {
  if (!canAct.value || !task.value || !selectedTransition.value) {
    return;
  }
  if (selectedTransition.value.requiresComment && !form.comment.trim()) {
    message.error(t('collaboration.task.transitionCommentRequired'));
    return;
  }
  saving.value = true;
  try {
    task.value = await resolveTask(props.id, {
      resolutionType: selectedTransition.value.resolutionType as 'Approved' | 'Rejected' | 'Completed' | 'Cancelled' | undefined,
      transitionId: selectedTransition.value.id,
      comment: form.comment.trim() || undefined,
    });
    message.success(t('collaboration.task.resolved'));
    maybeEmitAfterClose();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.task.resolveFailed'));
  } finally {
    saving.value = false;
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
    taskOps.value = task.value?.id
      ? await usePermissionStore().getEntityPermissionById('task', task.value.id).catch(() => null)
      : null;
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
  if (isFeedbackTask.value && task.value) {
    // The generic resolve form is suppressed for feedback tasks, so
    // this is a defensive path only. A feedback task resolves solely
    // through the feedbackApproval sentinels; a Completed/Cancelled
    // pick has no sentinel meaning and is refused rather than sent
    // without a newValue.
    if (form.resolutionType !== 'Approved' && form.resolutionType !== 'Rejected') {
      return;
    }
    saving.value = true;
    try {
      task.value = await resolveTask(
        props.id,
        buildFeedbackApprovalResolution(
          task.value,
          form.resolutionType === 'Approved' ? 'approve' : 'reject',
        ),
      );
      message.success(t('collaboration.task.resolved'));
    maybeEmitAfterClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('collaboration.task.resolveFailed'));
    } finally {
      saving.value = false;
    }
    return;
  }
  saving.value = true;
  try {
    task.value = await resolveTask(props.id, {
      resolutionType: form.resolutionType as (typeof TASK_RESOLUTIONS)[number],
      comment: form.comment.trim() || undefined,
    });
    message.success(t('collaboration.task.resolved'));
    maybeEmitAfterClose();
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
  <Card :bordered="!embedded" :class="{ 'entity-task-panel': embedded }">
    <PageHeader v-if="!embedded" :header="title" />
    <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" class="collab-alert" />
    <template v-if="task">
      <Space class="collab-actions" wrap>
        <Button v-if="!isFeedbackTask" data-testid="resolve-task" type="primary" :loading="saving" :disabled="!canAct" @click="onResolve">
          {{ t('collaboration.task.resolve') }}
        </Button>
        <!--
          Official glossary approve/reject split button (TaskTabNew
          approvalWorkflowActions). Q1: the pin's initial selected
          action for a recognizer task is the generic list's
          accept-suggestion entry (latestAction only special-cases
          approval requests), so a first primary press only relabels
          the button to Approve and resolves nothing — confirmed by a
          static read of TaskTabNew + handleGlossaryTaskMenuClick, but
          asserted by NO pin test (the recognizer approve/reject tests
          only assert the dropdown exists). The quirk is NOT
          replicated: this button defaults to approve-first, and the
          primary press approves. Hidden for workflow-driven tasks:
          the pin's actionButtons precedence shows the transition
          menu instead of the split button there.
        -->
        <Tooltip v-if="isFeedbackTask && actionable && !hasTransitions" :title="feedbackTooltip">
          <Dropdown.Button
            type="primary"
            data-testid="feedback-approve-reject"
            :trigger="['click']"
            :disabled="!canFeedbackAct"
            :loading="saving"
            @click="onFeedbackDecision('approve')"
          >
            {{ t('collaboration.task.approve') }}
            <template #overlay>
              <Menu @click="onFeedbackMenuClick">
                <Menu.Item key="approve" data-testid="feedback-action-approve">
                  {{ t('collaboration.task.approve') }}
                </Menu.Item>
                <Menu.Item key="reject" data-testid="feedback-action-reject">
                  {{ t('collaboration.task.reject') }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown.Button>
        </Tooltip>
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
                v-for="action in menuActions"
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
      <Typography.Paragraph v-else-if="suggestion && suggestion.isSuggestionEmpty && !isFeedbackTask" type="secondary" data-testid="task-suggestion-empty">
        {{ t('collaboration.task.emptySuggestionNote') }}
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
      <FeedbackApprovalTask v-if="isFeedbackTask" :task="task" />
      <template v-if="suggestion && !suggestion.isSuggestionEmpty && !isFeedbackTask">
        <Typography.Title :level="5" class="collab-section" data-testid="task-suggestion-title">{{ t('collaboration.task.suggestionTitle') }}</Typography.Title>
        <Descriptions bordered :column="1" size="small">
          <Descriptions.Item :label="t('collaboration.task.suggestionCurrent')">
            <span data-testid="task-suggestion-current">{{ task.type === 'TagUpdate' ? suggestion.currentTags.join(', ') : suggestion.currentDescription || '—' }}</span>
          </Descriptions.Item>
          <Descriptions.Item :label="t('collaboration.task.suggestionValue')">
            <span data-testid="task-suggestion-value">{{ task.type === 'TagUpdate' ? suggestion.suggestedTags.join(', ') : suggestion.suggestedValue || '—' }}</span>
          </Descriptions.Item>
        </Descriptions>
        <Space class="collab-section">
          <Button
            type="primary"
            data-testid="task-accept-suggestion"
            :loading="saving"
            :disabled="!canAct"
            @click="onAcceptSuggestion"
          >
            {{ t('collaboration.task.actionView') }}
          </Button>
        </Space>
      </template>
      <template v-if="task.availableTransitions && task.availableTransitions.length">
        <Typography.Title :level="5" class="collab-section" data-testid="task-transition-title">{{ t('collaboration.task.transitionTitle') }}</Typography.Title>
        <Space>
          <Select
            v-model:value="selectedTransitionId"
            style="width: 240px"
            data-testid="task-transition-select"
          >
            <Select.Option v-for="transition in task.availableTransitions" :key="transition.id" :value="transition.id">
              {{ transition.label }}
            </Select.Option>
          </Select>
          <Button
            type="primary"
            data-testid="task-transition-run"
            :loading="saving"
            :disabled="!canAct || !selectedTransition"
            @click="onRunTransition"
          >
            {{ selectedTransition?.label || t('collaboration.task.transitionRun') }}
          </Button>
        </Space>
      </template>
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
      <template v-if="!isFeedbackTask">
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
      </template>
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
