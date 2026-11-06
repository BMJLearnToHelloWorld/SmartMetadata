/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { WorkflowDefinitionFull } from '@/types/governance';
import { getWorkflowCapabilities } from '@/utils/workflowCapabilities';

/**
 * Official useWorkflowMode (pin a3012259ca), ported 1:1. Two modes only,
 * `view | edit`; the initial mode comes from `?mode=` (edit|view), else
 * `edit` when there is no fqn, else `view`. A `noOp` trigger disables
 * editing entirely. Capability flags come from WorkflowClassBase (OSS
 * defaults). React Router search params become Vue Router query params.
 */

export type WorkflowMode = 'view' | 'edit';

function shouldShowRunButton(
  workflowDefinition?: WorkflowDefinitionFull | null,
): boolean {
  if (!workflowDefinition) {
    return false;
  }
  const trigger = workflowDefinition.trigger;
  const isTriggerObject =
    typeof trigger === 'object' && trigger !== null && !Array.isArray(trigger);
  if (!isTriggerObject) {
    return false;
  }
  const triggerRecord = trigger as Record<string, unknown>;
  const triggerType = triggerRecord.type;
  const isPeriodicBatchEntity = triggerType === 'periodicBatchEntity';
  const config = (triggerRecord.config ?? {}) as Record<string, unknown>;
  const schedule = (config.schedule ?? {}) as Record<string, unknown>;
  const scheduleTimeline = schedule.scheduleTimeline;
  const cronExpression = schedule.cronExpression;
  const isOnDemand =
    scheduleTimeline === 'None' &&
    (cronExpression === '' || cronExpression === undefined);
  return isPeriodicBatchEntity && isOnDemand;
}

function getIsNoOpTrigger(
  workflowDefinition?: WorkflowDefinitionFull | null,
): boolean {
  const trigger = workflowDefinition?.trigger;
  const isTriggerObject =
    typeof trigger === 'object' && trigger !== null && !Array.isArray(trigger);
  const triggerType = isTriggerObject
    ? (trigger as Record<string, unknown>).type
    : undefined;
  return triggerType === 'noOp';
}

export interface UseWorkflowModeReturn {
  mode: Ref<WorkflowMode>;
  isViewMode: ComputedRef<boolean>;
  isEditMode: ComputedRef<boolean>;
  isNoOp: ComputedRef<boolean>;
  enterEditMode: () => void;
  enterViewMode: () => void;
  toggleMode: () => void;
  canEdit: ComputedRef<boolean>;
  canSave: ComputedRef<boolean>;
  canDelete: ComputedRef<boolean>;
  canDragNodes: ComputedRef<boolean>;
  canDragNodesInViewMode: ComputedRef<boolean>;
  canAccessSidebar: ComputedRef<boolean>;
  showEditButton: ComputedRef<boolean>;
  showSaveButton: ComputedRef<boolean>;
  showCancelButton: ComputedRef<boolean>;
  showTestButton: ComputedRef<boolean>;
  showDeleteButton: ComputedRef<boolean>;
  showRunButton: ComputedRef<boolean>;
  isFormDisabled: ComputedRef<boolean>;
  isInputDisabled: ComputedRef<boolean>;
  isDropdownDisabled: ComputedRef<boolean>;
  allowStructuralGraphEdits: ComputedRef<boolean>;
  showWorkflowNodePalette: ComputedRef<boolean>;
  allowFullStartNodeConfiguration: ComputedRef<boolean>;
  allowStartNodeFilterScheduleAndBatchEdit: ComputedRef<boolean>;
  allowScheduledTrigger: ComputedRef<boolean>;
}

export function useWorkflowMode(
  workflowFqn: Ref<string | undefined>,
  workflowDefinition: Ref<WorkflowDefinitionFull | null>,
): UseWorkflowModeReturn {
  const route = useRoute();
  const router = useRouter();
  const internalMode = ref<WorkflowMode>('view');

  const resolveInitialMode = (): WorkflowMode => {
    const urlMode = route.query.mode;
    if (urlMode === 'edit' || urlMode === 'view') {
      return urlMode;
    }
    if (!workflowFqn.value) {
      return 'edit';
    }
    return 'view';
  };

  const syncModeFromRoute = (): void => {
    internalMode.value = resolveInitialMode();
  };

  watch(
    () => [route.query.mode, workflowFqn.value] as const,
    () => {
      syncModeFromRoute();
    },
    { immediate: true },
  );

  const setModeQuery = (mode: WorkflowMode): void => {
    void router.replace({
      query: { ...route.query, mode },
    });
  };

  const enterEditMode = (): void => {
    internalMode.value = 'edit';
    setModeQuery('edit');
  };

  const enterViewMode = (): void => {
    internalMode.value = 'view';
    setModeQuery('view');
  };

  const toggleMode = (): void => {
    if (internalMode.value === 'view') {
      enterEditMode();
    } else {
      enterViewMode();
    }
  };

  const isViewMode = computed(() => internalMode.value === 'view');
  const isEditMode = computed(() => internalMode.value === 'edit');
  const isNoOp = computed(() => getIsNoOpTrigger(workflowDefinition.value));

  const derived = computed(() => {
    const caps = getWorkflowCapabilities(workflowDefinition.value);
    const structural = caps.allowStructuralGraphEdits;
    const editEnabled = isEditMode.value && !isNoOp.value;
    const viewEnabled = isViewMode.value && !isNoOp.value;
    const deleteEnabled = viewEnabled && caps.allowDeleteWorkflow;
    return {
      editEnabled,
      viewEnabled,
      deleteEnabled,
      structural,
      caps,
    };
  });

  const canEdit = computed(() => derived.value.editEnabled);
  const canSave = computed(() => derived.value.editEnabled);
  const canDelete = computed(() => derived.value.deleteEnabled);
  const canDragNodes = computed(
    () => isEditMode.value && derived.value.structural,
  );
  const canDragNodesInViewMode = computed(
    () =>
      isViewMode.value && derived.value.caps.allowViewModeDrag,
  );
  const canAccessSidebar = computed(() => isEditMode.value);
  const allowStructuralGraphEdits = computed(
    () => derived.value.structural && derived.value.editEnabled,
  );
  const showWorkflowNodePalette = computed(
    () => derived.value.caps.showWorkflowNodePalette,
  );
  const allowFullStartNodeConfiguration = computed(
    () => derived.value.caps.allowFullStartNodeConfiguration,
  );
  const allowStartNodeFilterScheduleAndBatchEdit = computed(
    () => derived.value.caps.allowStartNodeFilterScheduleAndBatchEdit,
  );
  const allowScheduledTrigger = computed(
    () => derived.value.caps.allowScheduledTrigger,
  );
  const showEditButton = computed(() => derived.value.viewEnabled);
  const showSaveButton = computed(() => derived.value.editEnabled);
  const showCancelButton = computed(() => derived.value.editEnabled);
  const showTestButton = computed(() => derived.value.editEnabled);
  const showDeleteButton = computed(() => derived.value.deleteEnabled);
  const showRunButton = computed(
    () =>
      isViewMode.value &&
      !!workflowFqn.value &&
      shouldShowRunButton(workflowDefinition.value),
  );
  const isFormDisabled = computed(() => isViewMode.value);
  const isInputDisabled = computed(() => isViewMode.value);
  const isDropdownDisabled = computed(() => isViewMode.value);

  return {
    mode: internalMode,
    isViewMode,
    isEditMode,
    isNoOp,
    enterEditMode,
    enterViewMode,
    toggleMode,
    canEdit,
    canSave,
    canDelete,
    canDragNodes,
    canDragNodesInViewMode,
    canAccessSidebar,
    showEditButton,
    showSaveButton,
    showCancelButton,
    showTestButton,
    showDeleteButton,
    showRunButton,
    isFormDisabled,
    isInputDisabled,
    isDropdownDisabled,
    allowStructuralGraphEdits,
    showWorkflowNodePalette,
    allowFullStartNodeConfiguration,
    allowStartNodeFilterScheduleAndBatchEdit,
    allowScheduledTrigger,
  };
}
