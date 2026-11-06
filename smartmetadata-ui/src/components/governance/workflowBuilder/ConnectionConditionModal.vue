<script setup lang="ts">
/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch } from 'vue';
import { Button, Divider, Select } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowConnectionCondition } from '@/types/governance';
import {
  AVAILABLE_OPTIONS,
  CONDITION_VALUES,
  DEFAULT_QUALITY_BANDS,
} from '@/constants/workflowBuilder';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official ConnectionConditionModal (pin a3012259ca), ported to Vue + antd:
 * a fixed card (left 400px, top 30%) that asks for the condition of a new
 * (or edited) edge — approve/reject for a user-approval source, the node's
 * quality bands for a data-completeness source, True/False otherwise.
 * Exactly one condition (id '1', operator 'equals', type 'simple'); the
 * modal renders nothing when closed or without a pending connection.
 * The `position` the edge-click handler stores is unused in render,
 * exactly as in official.
 */

const { t } = useI18n();
const builder = useWorkflowBuilderContext();

const connection = computed(() => builder.state.state.pendingConnection);
const isOpen = computed(() => builder.state.state.isConnectionModalOpen);
const sourceNode = computed(() => {
  if (!connection.value) {
    return null;
  }
  return (
    builder.state.state.nodes.find(
      (node) => node.id === connection.value?.source,
    ) ?? null
  );
});
const sourceNodeLabel = computed(
  () => sourceNode.value?.data?.label || 'Unknown',
);
const targetNodeLabel = computed(() => {
  if (!connection.value) {
    return '';
  }
  return (
    builder.state.state.nodes.find(
      (node) => node.id === connection.value?.target,
    )?.data?.label || 'Unknown'
  );
});

const isDataCompletenessNode = computed(
  () => sourceNode.value?.data?.subType === 'dataCompletenessTask',
);
const isApprovalTaskNode = computed(
  () => sourceNode.value?.data?.subType === 'userApprovalTask',
);

const availableOptions = computed(() => {
  if (isApprovalTaskNode.value) {
    return [...AVAILABLE_OPTIONS.APPROVAL_CONDITION_VALUES];
  }
  if (!isDataCompletenessNode.value) {
    return [...AVAILABLE_OPTIONS.CONDITION_VALUES];
  }
  const data = sourceNode.value?.data;
  const bands = (data?.qualityBands ??
    data?.config?.qualityBands ??
    data?.scoringLevels) as
    | { levelName?: string; minimumScore?: number; name?: string }[]
    | undefined;
  if (bands && Array.isArray(bands) && bands.length > 0) {
    return bands.map((band) => ({
      label: band.name || band.levelName || '',
      value: band.name || band.levelName || '',
    }));
  }
  return [...AVAILABLE_OPTIONS.CONDITION_VALUES];
});

const defaultValue = computed(() => {
  if (isApprovalTaskNode.value) {
    return CONDITION_VALUES.APPROVE;
  }
  return isDataCompletenessNode.value
    ? availableOptions.value[0]?.value || DEFAULT_QUALITY_BANDS[0].name
    : CONDITION_VALUES.TRUE;
});

function freshConditions(): WorkflowConnectionCondition[] {
  return [
    {
      id: '1',
      operator: 'equals',
      type: 'simple',
      value: defaultValue.value,
    },
  ];
}

const conditions = ref<WorkflowConnectionCondition[]>(freshConditions());

watch(
  [isOpen, () => builder.state.state.editingEdge],
  () => {
    if (!isOpen.value) {
      return;
    }
    const initial = builder.state.state.editingEdge?.data?.conditions;
    if (initial && initial.length > 0) {
      conditions.value = initial.map((condition) => {
        const isValidValue = availableOptions.value.some(
          (option) => option.value === condition.value,
        );
        return isValidValue
          ? { ...condition, id: condition.id ?? '1', type: condition.type ?? 'simple' }
          : { ...condition, id: condition.id ?? '1', type: condition.type ?? 'simple', value: defaultValue.value };
      });
    } else {
      conditions.value = freshConditions();
    }
  },
  { immediate: true },
);

const selectedValue = computed(
  () => conditions.value[0]?.value || defaultValue.value,
);

function updateConditionValue(value: string): void {
  if (conditions.value[0]) {
    conditions.value = [
      { ...conditions.value[0], value },
      ...conditions.value.slice(1),
    ];
  }
}

function handleSave(): void {
  if (connection.value) {
    builder.actions.handleConnectionSave(connection.value, conditions.value);
  }
}

function handleCancel(): void {
  builder.actions.handleConnectionCancel();
}
</script>

<template>
  <div
    v-if="isOpen && connection"
    class="workflow-connection-modal"
    data-testid="connection-condition-modal"
  >
    <div class="workflow-connection-modal__header">
      <p class="workflow-connection-modal__title">
        {{ t('workflows.builder.connectionCondition') }}
      </p>
      <div class="workflow-connection-modal__actions">
        <Button size="small" @click="handleCancel">{{ t('crud.cancel') }}</Button>
        <Button
          type="primary"
          size="small"
          data-testid="save-connection-button"
          @click="handleSave"
        >
          {{ t('crud.save') }}
        </Button>
      </div>
    </div>

    <Divider class="workflow-connection-modal__divider" />

    <div class="workflow-connection-modal__body">
      <div class="workflow-connection-modal__row">
        <span class="workflow-connection-modal__caption">{{ t('workflows.builder.source') }}</span>
        <span class="workflow-connection-modal__node">{{ sourceNodeLabel }}</span>
      </div>

      <div class="workflow-connection-modal__connector" />

      <Select
        data-testid="condition-select-dropdown"
        class="workflow-connection-modal__select"
        :value="selectedValue"
        :options="availableOptions"
        @update:value="updateConditionValue(String($event))"
      />

      <div class="workflow-connection-modal__connector" />

      <div class="workflow-connection-modal__row">
        <span class="workflow-connection-modal__caption">{{ t('workflows.builder.destination') }} : </span>
        <span class="workflow-connection-modal__node">{{ targetNodeLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-connection-modal {
  position: fixed;
  left: 400px;
  top: 30%;
  z-index: 10000;
  min-width: 360px;
  max-width: 400px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card, 6px);
  box-shadow: 0 4px 16px rgb(16 24 40 / 0.16);
}

.workflow-connection-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
}

.workflow-connection-modal__title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  color: var(--sm-text-primary);
}

.workflow-connection-modal__actions {
  display: flex;
  gap: 4px;
}

.workflow-connection-modal__divider {
  margin: 0;
}

.workflow-connection-modal__body {
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.workflow-connection-modal__row {
  display: flex;
  align-items: center;
}

.workflow-connection-modal__caption {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-text-secondary);
}

.workflow-connection-modal__node {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-text-primary);
}

.workflow-connection-modal__connector {
  width: 1px;
  height: 16px;
  margin: 0 0 2px 12px;
  background: var(--sm-border-secondary);
}

.workflow-connection-modal__select {
  width: 100%;
}
</style>
