<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ThresholdPreview (observability/data-quality).
-->
<script setup lang="ts">
import { Alert } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TestDefinition } from '@/types/quality';
import {
  getThresholdPreviewData,
  hasThresholdUnitParam,
  type TableProfilerConfig,
} from '@/quality/testCaseThreshold.utils';
import { formatSamplingNote, formatThresholdSentence } from '@/quality/testCaseThresholdSentence.utils';

const props = defineProps<{
  definition: TestDefinition;
  params: Record<string, unknown>;
  target?: string;
  profilerConfig?: TableProfilerConfig;
  useDynamicAssertion?: boolean;
}>();

const { t } = useI18n();

const previewData = computed(() => {
  if (!hasThresholdUnitParam(props.definition)) {
    return undefined;
  }
  return getThresholdPreviewData({
    definition: props.definition,
    params: props.params,
    target: props.target,
    profilerConfig: props.profilerConfig,
    useDynamicAssertion: props.useDynamicAssertion,
  });
});

const sentence = computed(() =>
  previewData.value ? formatThresholdSentence(previewData.value, t) : undefined,
);
const samplingNote = computed(() => formatSamplingNote(previewData.value?.sampling, t));
</script>

<template>
  <div v-if="previewData" class="threshold-preview" data-testid="threshold-preview">
    <div class="threshold-preview__label">{{ t('label.preview') }}</div>
    <p v-if="sentence" class="threshold-preview__sentence" data-testid="threshold-preview-sentence">
      {{ sentence }}
    </p>
    <p
      v-if="samplingNote"
      class="threshold-preview__sampling"
      data-testid="threshold-sampling-warning"
    >
      {{ samplingNote }}
    </p>
    <Alert
      v-if="previewData.needsMatchEnum"
      type="warning"
      show-icon
      :message="t('message.dq-threshold-preview-match-enum-required')"
      data-testid="threshold-match-enum-warning"
    />
    <Alert
      v-if="previewData.isThresholdIgnored"
      type="warning"
      show-icon
      :message="t('message.dq-threshold-preview-not-enforced')"
      data-testid="threshold-not-enforced-warning"
    />
    <Alert
      v-if="previewData.hasZeroBound"
      type="warning"
      show-icon
      :message="t('message.dq-threshold-preview-zero-bound')"
      data-testid="threshold-zero-bound-warning"
    />
  </div>
</template>

<style scoped>
.threshold-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.threshold-preview__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.65));
}
.threshold-preview__sentence,
.threshold-preview__sampling {
  margin: 0;
  font-size: 13px;
}
.threshold-preview__sampling {
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
</style>