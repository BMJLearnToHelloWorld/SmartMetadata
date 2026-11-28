<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official RunDetailsCard (Vue) with RunThreshold, scope badges, sample note.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Tag } from 'ant-design-vue';
import type { TestCase, TestCaseResult } from '@/types/quality';
import RunExecutionError from '@/components/quality/RunExecutionError.vue';
import { formatRunDuration, getRunDetails, isTimeoutError } from '@/quality/runDetailsCard.utils';
import { getRunScopeBadges, ThresholdSamplingKind } from '@/quality/testCaseThreshold.utils';
import { getRunThresholdSectionCells } from '@/quality/runDetailsThresholdDisplay.utils';
import { formatNumber } from '@/quality/runDetailsCard.utils';
import { formatContractDateTime } from '@/utils/dataContract';

const props = defineProps<{
  testCase: TestCase;
  results: TestCaseResult[];
  selectedRun?: TestCaseResult;
  onBackToLatest?: () => void;
}>();

const { t } = useI18n();

const latestTimestamp = computed(() =>
  props.results.reduce<number | undefined>(
    (latest, item) =>
      latest === undefined || (item.timestamp ?? 0) > latest ? (item.timestamp ?? latest) : latest,
    undefined,
  ),
);

const isOlderRunSelected = computed(
  () =>
    props.selectedRun?.timestamp !== undefined &&
    latestTimestamp.value !== undefined &&
    props.selectedRun.timestamp !== latestTimestamp.value,
);

const details = computed(() =>
  props.selectedRun ? getRunDetails(props.testCase, props.selectedRun) : undefined,
);

const thresholdCells = computed(() =>
  props.selectedRun ? getRunThresholdSectionCells(props.testCase, props.selectedRun, t) : undefined,
);

const scopeBadges = computed(() =>
  props.selectedRun ? getRunScopeBadges(props.selectedRun.evaluationScope) : undefined,
);

const durationLabel = computed(() => {
  if (details.value?.duration === undefined) {
    return undefined;
  }
  const text = formatRunDuration(details.value.duration);
  const errorDetails = details.value.errorDetails;
  return isTimeoutError(errorDetails?.errorType, errorDetails?.message)
    ? t('label.duration-with-timeout', { duration: text })
    : text;
});

const sampleNoteVisible = computed(() => Boolean(props.selectedRun?.evaluationScope?.sampled));

const status = computed(() => props.selectedRun?.testCaseStatus);
const statusTagColor = computed(() => {
  switch (status.value) {
    case 'Success':
      return 'success';
    case 'Failed':
      return 'error';
    case 'Queued':
      return 'processing';
    default:
      return 'warning';
  }
});

function sampleBadgeLabel(): string {
  const badges = scopeBadges.value;
  if (!badges?.sample) {
    return t('label.sampled');
  }
  if (badges.sample.value === undefined) {
    return t('label.sampled');
  }
  return badges.sample.kind === ThresholdSamplingKind.StaticRows
    ? t('label.row-sample-of', { value: formatNumber(badges.sample.value) })
    : t('label.percentage-sample-of', { value: badges.sample.value });
}
</script>

<template>
  <article
    v-if="details && selectedRun && status"
    class="run-details-card"
    :data-status="status"
    data-testid="run-details-card"
    :data-timestamp="selectedRun.timestamp"
  >
    <header class="run-details-card__header">
      <Tag :color="statusTagColor">{{ t(`label.${String(status).toLowerCase()}`) }}</Tag>
      <h3 class="run-details-card__title">{{ t('label.run-details') }}</h3>
      <span class="run-details-card__date" data-testid="run-details-date">
        {{ formatContractDateTime(selectedRun.timestamp) }}
      </span>
      <div v-if="isOlderRunSelected" class="run-details-card__selected">
        <Tag data-testid="run-details-selected">{{ t('label.selected-run') }}</Tag>
        <Button type="link" size="small" data-testid="run-details-back-to-latest" @click="onBackToLatest?.()">
          {{ t('label.back-to-latest') }}
        </Button>
      </div>
      <template v-if="scopeBadges">
        <Tag v-if="scopeBadges.sample" color="blue" data-testid="run-details-sampled-badge">
          {{ sampleBadgeLabel() }}
        </Tag>
        <Tag v-if="scopeBadges.isPartitioned" color="blue" data-testid="run-details-partitioned-badge">
          {{
            scopeBadges.partitionColumn
              ? t('label.partitioned-on', { column: scopeBadges.partitionColumn })
              : t('label.partitioned')
          }}
        </Tag>
      </template>
      <span v-if="durationLabel !== undefined" class="run-details-card__duration" data-testid="run-details-duration">
        {{ durationLabel }}
      </span>
    </header>

    <dl class="run-details-card__grid">
      <div>
        <dt>{{ t('label.test-definition-sentence') }}</dt>
        <dd data-testid="run-details-definition">{{ testCase.testDefinition?.name ?? '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('label.expected') }}</dt>
        <dd data-testid="run-details-expected">{{ details.expectedText }}</dd>
      </div>
      <div>
        <dt>{{ t('label.found') }}</dt>
        <dd data-testid="run-details-found">{{ details.foundText }}</dd>
      </div>
      <div>
        <dt>{{ t('label.difference') }}</dt>
        <dd data-testid="run-details-difference">{{ details.differenceText }}</dd>
      </div>
    </dl>

    <dl
      v-if="thresholdCells?.length"
      class="run-details-card__threshold"
      data-testid="run-details-threshold-section"
    >
      <div v-for="cell in thresholdCells" :key="cell.testId">
        <dt>{{ t(cell.labelKey) }}</dt>
        <dd :data-testid="cell.testId">{{ cell.value }}</dd>
      </div>
    </dl>

    <p v-if="sampleNoteVisible" class="run-details-card__sample-note" data-testid="run-details-sample-note">
      {{ t('message.run-evaluated-on-sample') }}
    </p>

    <div v-if="details.bars.length > 0" class="run-details-card__comparison" data-testid="run-details-comparison">
      <div v-for="bar in details.bars" :key="bar.kind" class="run-details-card__bar-row">
        <span>{{ t(`label.${bar.kind}`) }}</span>
        <div class="run-details-card__bar-track">
          <span class="run-details-card__bar-fill" :style="{ width: `${bar.width}%` }" />
        </div>
        <span :data-testid="`run-details-${bar.kind}-value`">{{ bar.value.toLocaleString() }}</span>
      </div>
    </div>

    <RunExecutionError
      v-if="status === 'Aborted'"
      :error-details="details.errorDetails"
      :result-message="details.resultMessage"
    />
    <p v-else-if="status === 'Success'" class="run-details-card__note">{{ t('message.run-details-success-note') }}</p>
    <p v-else-if="status === 'Queued'" class="run-details-card__note">{{ t('message.run-details-queued-note') }}</p>
    <p v-else-if="status === 'Failed'" class="run-details-card__note">{{ t('message.run-details-failed-note') }}</p>
  </article>
</template>

<style scoped>
.run-details-card {
  border: 1px solid var(--sm-border-color, #e8e8e8);
  border-radius: 12px;
  overflow: hidden;
  background: var(--sm-bg-container, #fff);
}
.run-details-card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 16px;
  border-bottom: 1px solid var(--sm-border-color, #e8e8e8);
}
.run-details-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.run-details-card__date,
.run-details-card__duration {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.run-details-card__selected {
  display: flex;
  align-items: center;
  gap: 4px;
}
.run-details-card__grid,
.run-details-card__threshold {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  margin: 0;
  padding: 16px;
}
.run-details-card__threshold {
  border-top: 1px solid var(--sm-border-color, #e8e8e8);
}
@media (min-width: 900px) {
  .run-details-card__grid,
  .run-details-card__threshold {
    grid-template-columns: minmax(max-content, 1fr) repeat(3, minmax(0, 1fr));
  }
}
.run-details-card__grid dt,
.run-details-card__threshold dt {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.run-details-card__grid dd,
.run-details-card__threshold dd {
  margin: 4px 0 0;
  font-weight: 600;
}
.run-details-card__sample-note {
  margin: 0;
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.run-details-card__comparison {
  border-top: 1px solid var(--sm-border-color, #e8e8e8);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.run-details-card__bar-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.run-details-card__bar-track {
  height: 8px;
  border-radius: 999px;
  background: var(--sm-bg-layout, #f0f0f0);
  overflow: hidden;
}
.run-details-card__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--sm-color-primary, #1570ef);
}
.run-details-card__note {
  margin: 0;
  padding: 0 16px 16px;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
</style>