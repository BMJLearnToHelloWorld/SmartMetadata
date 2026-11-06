<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Select, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowApprovalMode } from '@/types/governance';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official ApprovalModeSection (pin a3012259ca): Default runs the workflow
 * after an edit; Enforce holds the edit for its approval task. The hint
 * under the select follows the selected mode; the paragraph below the
 * select is the shared description.
 */
const props = withDefaults(
  defineProps<{
    approvalMode?: WorkflowApprovalMode;
    lockFields?: boolean;
    onApprovalModeChange: (approvalMode: WorkflowApprovalMode) => void;
  }>(),
  { approvalMode: 'Default', lockFields: false },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

const modeDescriptions: Record<WorkflowApprovalMode, string> = {
  Default: 'workflows.builder.approvalModeDefaultDescription',
  Enforce: 'workflows.builder.approvalModeEnforceDescription',
};

const hint = computed(() => t(modeDescriptions[props.approvalMode]));
</script>

<template>
  <div style="margin-top: 24px" data-testid="approval-mode-section">
    <label style="display: block; margin-bottom: 4px; font-size: 14px">
      {{ t('workflows.builder.approvalMode') }}
    </label>
    <Select
      :value="approvalMode"
      data-testid="approval-mode-select"
      :disabled="isFormDisabled || lockFields"
      style="width: 100%"
      @change="(key) => onApprovalModeChange(key as WorkflowApprovalMode)"
    >
      <Select.Option value="Default" data-testid="approval-mode-default">
        {{ t('workflows.builder.default') }}
      </Select.Option>
      <Select.Option value="Enforce" data-testid="approval-mode-enforce">
        {{ t('workflows.builder.enforce') }}
      </Select.Option>
    </Select>
    <Typography.Text type="secondary" style="display: block; margin-top: 4px; font-size: 12px">
      {{ hint }}
    </Typography.Text>
    <Typography.Paragraph type="secondary" style="margin-top: 8px; font-size: 14px">
      {{ t('workflows.builder.approvalModeDescription') }}
    </Typography.Paragraph>
  </div>
</template>
