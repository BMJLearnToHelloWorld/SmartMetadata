<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Input, Select, Typography } from 'ant-design-vue';
import { DeleteOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import { getFieldDisplayLabel } from '@/utils/workflowConfig';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import { useEntityFields } from '@/composables/useEntityFields';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official DataCompletenessForm (pin a3012259ca): fields to check
 * (per-entity field options) + scoring levels (threshold % + level name,
 * sorted desc by threshold into qualityBands on save). The form builds
 * its save config directly — NOT via createNodeConfig — with lastSaved /
 * userModified, config {fieldsToCheck, qualityBands}, plus the flat
 * `fields` / `checkForNull` / `scoringLevels` the node data carries.
 * `checkForNull` has no UI control; its stored value is saved back as-is.
 * Valid iff a display name and at least one field.
 */
const props = withDefaults(
  defineProps<{
    node: WorkflowFlowNode;
    onSave: (nodeId: string, config: Record<string, unknown>) => void;
    onClose: () => void;
    onDelete?: (nodeId: string) => void;
    entityTypes?: string[];
  }>(),
  { entityTypes: () => ['all'] },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

interface ScoringLevel {
  threshold: number | string;
  levelName: string;
}
interface QualityBand {
  name: string;
  minimumScore: number;
}

const DEFAULT_SCORING_LEVELS: ScoringLevel[] = [
  { threshold: 100, levelName: 'Gold' },
  { threshold: 75, levelName: 'Silver' },
];

function convertScoringLevelsToQualityBands(levels: ScoringLevel[]): QualityBand[] {
  const sortedLevels = [...levels].sort((a, b) => {
    const thresholdA = typeof a.threshold === 'string' ? 0 : a.threshold;
    const thresholdB = typeof b.threshold === 'string' ? 0 : b.threshold;
    return thresholdB - thresholdA;
  });
  return sortedLevels.map((level) => ({
    name: level.levelName,
    minimumScore:
      typeof level.threshold === 'string'
        ? parseFloat(level.threshold) || 0
        : level.threshold,
  }));
}

function convertQualityBandsToScoringLevels(bands: QualityBand[]): ScoringLevel[] {
  return bands.map((band) => ({
    threshold: band.minimumScore,
    levelName: band.name,
  }));
}

function resolveFieldsToCheck(nodeData: WorkflowFlowNode['data']): string[] {
  return (
    (nodeData.config?.fieldsToCheck as string[]) || nodeData.fields || []
  );
}

function resolveScoringLevelsFromNodeData(
  nodeData: WorkflowFlowNode['data'],
): ScoringLevel[] {
  const configBands = nodeData.config?.qualityBands;
  if (configBands && Array.isArray(configBands)) {
    return convertQualityBandsToScoringLevels(configBands as QualityBand[]);
  }
  if (nodeData.qualityBands && Array.isArray(nodeData.qualityBands)) {
    return convertQualityBandsToScoringLevels(
      nodeData.qualityBands as QualityBand[],
    );
  }
  if (nodeData.scoringLevels) {
    return nodeData.scoringLevels as ScoringLevel[];
  }
  return DEFAULT_SCORING_LEVELS;
}

const displayName = ref('');
const description = ref('');
const selectedFields = ref<string[]>([]);
const checkForNull = ref(false);
const scoringLevels = ref<ScoringLevel[]>([...DEFAULT_SCORING_LEVELS]);

const { fieldOptions } = useEntityFields(props.entityTypes);

function syncFromNode(): void {
  const nodeData = props.node.data;
  if (!nodeData) {
    return;
  }
  displayName.value = nodeData.displayName || nodeData.label || '';
  description.value = nodeData.description || '';
  selectedFields.value = resolveFieldsToCheck(nodeData);
  checkForNull.value = Boolean(nodeData.checkForNull);
  scoringLevels.value = resolveScoringLevelsFromNodeData(nodeData);
}
watch(() => props.node.id, syncFromNode, { immediate: true });

const fieldSelectOptions = computed(() =>
  fieldOptions.value.map((f) => ({
    value: f,
    label: getFieldDisplayLabel(f, (key: string) => t(key)),
  })),
);

function handleScoringLevelChange(
  index: number,
  field: keyof ScoringLevel,
  value: string | number,
): void {
  const updatedLevels = [...scoringLevels.value];
  updatedLevels[index] = { ...updatedLevels[index], [field]: value };
  scoringLevels.value = updatedLevels;
}

function addScoringLevel(): void {
  scoringLevels.value = [
    ...scoringLevels.value,
    { threshold: '', levelName: '' },
  ];
}

function removeScoringLevel(index: number): void {
  if (scoringLevels.value.length > 1) {
    scoringLevels.value = scoringLevels.value.filter((_, i) => i !== index);
  }
}

function handleSave(): void {
  const validScoringLevels = scoringLevels.value.filter(
    (level) => level.levelName.trim() !== '',
  );
  const qualityBands = convertScoringLevelsToQualityBands(validScoringLevels);
  props.onSave(props.node.id, {
    displayName: displayName.value,
    description: description.value,
    type: 'automatedTask',
    subType: 'dataCompletenessTask',
    lastSaved: new Date().toISOString(),
    userModified: true,
    config: {
      fieldsToCheck: selectedFields.value,
      qualityBands,
    },
    fields: selectedFields.value,
    checkForNull: checkForNull.value,
    scoringLevels: validScoringLevels,
  });
  props.onClose();
}

function handleDeleteNode(): void {
  props.onDelete?.(props.node.id);
  props.onClose();
}

const isFormValid = computed(
  () => displayName.value.trim() !== '' && selectedFields.value.length > 0,
);
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :is-start-node="false"
      :name="displayName"
      :description="description"
      :on-name-change="(value) => { displayName = value; }"
      :on-description-change="(value) => { description = value; }"
    />

    <div style="margin-bottom: 24px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ t('workflows.builder.fields') }}
        <span style="color: var(--sm-color-error)">*</span>
      </label>
      <Select
        mode="multiple"
        :value="selectedFields"
        data-testid="fields-to-check-select"
        :disabled="isFormDisabled"
        :options="fieldSelectOptions"
        :placeholder="t('workflows.builder.selectFieldsToCheck')"
        style="width: 100%"
        @change="(values) => { selectedFields = values as string[]; }"
      />
    </div>

    <div style="margin-bottom: 24px">
      <Typography.Text style="font-size: 14px; font-weight: 600">
        {{ t('workflows.builder.scoringLevels') }}
      </Typography.Text>
      <div style="display: flex; gap: 12px; margin: 8px 0; align-items: center">
        <div style="width: 33%">
          <Typography.Text type="secondary" style="font-size: 14px; font-weight: 600">
            {{ t('workflows.builder.thresholdPercentage') }}
          </Typography.Text>
        </div>
        <div style="width: 60%">
          <Typography.Text type="secondary" style="font-size: 14px; font-weight: 600">
            {{ t('workflows.builder.levelName') }}
          </Typography.Text>
        </div>
        <div style="width: 10%" />
      </div>
      <div
        v-for="(level, index) in scoringLevels"
        :key="index"
        style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center"
      >
        <div style="display: flex; width: 33%; min-width: 0; align-items: center; gap: 8px">
          <div style="min-width: 0; flex: 1">
            <Input
              type="number"
              :disabled="isFormDisabled"
              :value="String(level.threshold)"
              @update:value="
                (value) =>
                  handleScoringLevelChange(
                    index,
                    'threshold',
                    value === '' ? '' : parseInt(value as string) || 0,
                  )
              "
            />
          </div>
          <Typography.Text aria-hidden type="secondary" style="flex-shrink: 0; font-size: 14px">
            %
          </Typography.Text>
        </div>
        <div style="width: 60%">
          <Input
            :disabled="isFormDisabled"
            :placeholder="t('workflows.builder.enterLevelName')"
            :value="level.levelName"
            @update:value="(value) => handleScoringLevelChange(index, 'levelName', value)"
          />
        </div>
        <div style="width: 10%; display: flex; justify-content: center">
          <Button
            v-if="scoringLevels.length > 1"
            type="text"
            danger
            :disabled="isFormDisabled"
            :aria-label="t('workflows.builder.remove')"
            @click="removeScoringLevel(index)"
          >
            <DeleteOutlined />
          </Button>
        </div>
      </div>
      <Button
        type="primary"
        size="small"
        data-testid="add-scoring-level-button"
        :disabled="isFormDisabled"
        @click="addScoringLevel"
      >
        {{ t('workflows.builder.addLevel') }}
      </Button>
    </div>
    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="!isFormValid"
      :on-cancel="onClose"
      :on-delete="handleDeleteNode"
      :on-save="handleSave"
    />
  </div>
</template>
