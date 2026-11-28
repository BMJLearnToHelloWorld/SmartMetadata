<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseLastRunBanner / LastRunBannerLayout (IncidentManagerPageHeader).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';
import { Badge, Button } from 'ant-design-vue';
import { LAST_RUN_BANNER_TEST_IDS, NO_RUN_BANNER_TEST_ID } from '@/quality/testCaseLastRunBanner.constants';
import type { TestCase, TestCaseResult, TestIncident } from '@/types/quality';
import type { TaskLinkInfo } from '@/quality/testCaseLastRunBanner.utils';
import {
  getIncidentLink,
  getIncidentMetadata,
  getIncidentTitle,
  getMetricSummary,
  getNextRunLabel,
  getNotRunMessageKey,
  getRunDescription,
} from '@/quality/testCaseLastRunBanner.utils';

const props = defineProps<{
  testCase: TestCase;
  testCaseResult?: TestCaseResult;
  testCaseStatus?: string;
  nextRunTimestamp?: number | null;
  hasEditStatusPermission?: boolean;
  testCaseStatusData?: TestIncident;
  taskLinkInfo?: TaskLinkInfo | null;
  incidentTaskLoaded?: boolean;
  onAcknowledge?: () => Promise<void>;
}>();

const emit = defineEmits<{
  acknowledge: [];
}>();

const { t } = useI18n();
const router = useRouter();
const isAcknowledging = ref(false);
const descriptionExpanded = ref(false);

const resolvedStatus = computed(
  () => props.testCaseStatus ?? props.testCaseResult?.testCaseStatus ?? props.testCase.testCaseStatus,
);

const resolvedResult = computed(() => props.testCaseResult ?? props.testCase.testCaseResult);

const bannerTestId = computed(() => {
  if (!resolvedResult.value || !resolvedStatus.value) {
    return NO_RUN_BANNER_TEST_ID;
  }
  return LAST_RUN_BANNER_TEST_IDS[resolvedStatus.value] ?? NO_RUN_BANNER_TEST_ID;
});

const statusLabelKey = computed(() => {
  const status = resolvedStatus.value;
  if (!status) {
    return 'label.not-run-yet';
  }
  switch (status) {
    case 'Success':
      return 'label.success';
    case 'Failed':
      return 'label.failed';
    case 'Aborted':
      return 'label.aborted';
    case 'Queued':
      return 'label.queued';
    default:
      return 'label.status';
  }
});

const statusIcon = computed(() => {
  switch (resolvedStatus.value) {
    case 'Success':
      return CheckCircleOutlined;
    case 'Failed':
      return CloseCircleOutlined;
    case 'Aborted':
      return StopOutlined;
    case 'Queued':
      return SyncOutlined;
    default:
      return MinusOutlined;
  }
});

const runDescription = computed(() => {
  const status = resolvedStatus.value;
  const result = resolvedResult.value;
  if (!result || !status) {
    return undefined;
  }
  return getRunDescription(result.result, status, t('message.test-case-run-queued'));
});

const metricSummary = computed(() => {
  if (!resolvedResult.value || !resolvedStatus.value) {
    return { show: false, expectedValue: '—' as const };
  }
  return getMetricSummary(props.testCase, resolvedResult.value, resolvedStatus.value);
});

const incidentLink = computed(() =>
  resolvedStatus.value
    ? getIncidentLink(props.taskLinkInfo ?? null, resolvedStatus.value)
    : null,
);

const incidentTitle = computed(() =>
  props.incidentTaskLoaded && incidentLink.value ? getIncidentTitle(props.testCase, t) : undefined,
);

const incidentMetadata = computed(() =>
  getIncidentMetadata(incidentTitle.value, props.testCaseStatusData, incidentLink.value),
);

const canAcknowledge = computed(
  () =>
    Boolean(props.hasEditStatusPermission) &&
    props.testCaseStatusData?.testCaseResolutionStatusType === 'New' &&
    Boolean(incidentLink.value),
);

const nextRunText = computed(() =>
  getNextRunLabel(
    props.nextRunTimestamp,
    t('label.in-lowercase'),
    t('label.not-scheduled'),
  ),
);

const queuedNextRunLabel = computed(() =>
  resolvedStatus.value === 'Queued' ? t('label.running-now') : nextRunText.value,
);

function formatRunTime(timestamp?: number): string {
  if (!timestamp) {
    return '—';
  }
  const millis = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(millis).toLocaleString();
}

async function handleAcknowledge(): Promise<void> {
  if (!canAcknowledge.value || isAcknowledging.value) {
    return;
  }
  isAcknowledging.value = true;
  try {
    if (props.onAcknowledge) {
      await props.onAcknowledge();
    } else {
      emit('acknowledge');
    }
  } finally {
    isAcknowledging.value = false;
  }
}

function viewIncident(): void {
  if (incidentLink.value?.path) {
    void router.push(incidentLink.value.path);
  }
}
</script>

<template>
  <div class="tc-last-run-banner" :data-testid="bannerTestId" role="status" aria-live="polite">
    <div class="tc-last-run-banner__summary" data-testid="test-case-last-run-summary">
      <component :is="statusIcon" class="tc-last-run-banner__icon" data-testid="test-case-last-run-icon" />
      <div class="tc-last-run-banner__body">
        <div class="tc-last-run-banner__title" data-testid="test-case-last-run-title">
          <span data-testid="test-case-last-run-prefix">{{ t('label.last-run-sentence') }}</span>
          <span class="tc-last-run-banner__status" data-testid="test-case-last-run-status">
            {{ t(statusLabelKey) }}
          </span>
        </div>
        <p
          v-if="runDescription"
          class="tc-last-run-banner__description"
        >
          {{ runDescription }}
        </p>
        <p
          v-else-if="!resolvedResult"
          class="tc-last-run-banner__description"
        >
          {{ t(getNotRunMessageKey(nextRunTimestamp)) }}
        </p>
      </div>
      <div
        class="tc-last-run-banner__right"
        data-testid="test-case-last-run-right-section"
      >
        <div
          v-if="metricSummary.show"
          class="tc-last-run-banner__metric"
          data-testid="test-case-result-expected"
        >
          <span class="tc-last-run-banner__metric-label">
            {{ t('label.result') }} / {{ t('label.expected') }}
          </span>
          <span class="tc-last-run-banner__metric-values" data-testid="test-case-result-value">
            <strong>{{ metricSummary.resultValue }}</strong>
            <span class="tc-last-run-banner__metric-expected"> / {{ metricSummary.expectedValue }}</span>
          </span>
        </div>
        <span v-if="metricSummary.show" class="tc-last-run-banner__divider" aria-hidden="true" />
        <div class="tc-last-run-banner__times">
          <span data-testid="test-case-last-run-time">
            {{ formatRunTime(resolvedResult?.timestamp) }}
          </span>
          <span class="tc-last-run-banner__next-run" data-testid="test-case-next-run">
            {{ t('label.next') }} · {{ resolvedResult ? queuedNextRunLabel : nextRunText }}
          </span>
        </div>
      </div>
    </div>
    <div
      v-if="incidentLink"
      class="tc-last-run-banner__incident"
      data-testid="test-case-last-run-incident"
    >
      <CloseCircleOutlined
        v-if="resolvedStatus === 'Failed'"
        class="tc-last-run-banner__incident-icon"
        data-testid="test-case-incident-icon"
      />
      <StopOutlined
        v-else
        class="tc-last-run-banner__incident-icon"
        data-testid="test-case-incident-icon"
      />
      <div class="tc-last-run-banner__incident-text" data-testid="test-case-incident-text">
        <span class="tc-last-run-banner__incident-id" data-testid="test-case-incident-id">
          {{ incidentMetadata.id }}
        </span>
        <span
          v-if="incidentMetadata.description"
          class="tc-last-run-banner__incident-desc"
          data-testid="test-case-incident-description"
        >
          <template v-if="!descriptionExpanded && incidentMetadata.description.length > 120">
            {{ incidentMetadata.description.slice(0, 120) }}…
            <Button
              type="link"
              size="small"
              data-testid="test-case-incident-description-more-button"
              @click="descriptionExpanded = true"
            >
              {{ t('label.more') }}
            </Button>
          </template>
          <template v-else>
            <span data-testid="test-case-incident-description-content">{{ incidentMetadata.description }}</span>
            <Button
              v-if="incidentMetadata.description.length > 120"
              type="link"
              size="small"
              data-testid="test-case-incident-description-less-button"
              @click="descriptionExpanded = false"
            >
              {{ t('label.less') }}
            </Button>
          </template>
        </span>
        <Badge
          v-if="incidentMetadata.statusConfig"
          data-testid="test-case-incident-status"
          :color="incidentMetadata.statusConfig.color"
          :text="t(incidentMetadata.statusConfig.label)"
        />
      </div>
      <div class="tc-last-run-banner__incident-actions" data-testid="test-case-incident-actions">
        <Button
          v-if="canAcknowledge"
          size="small"
          data-testid="acknowledge-incident-button"
          :loading="isAcknowledging"
          @click="handleAcknowledge"
        >
          {{ t('label.acknowledge') }}
        </Button>
        <Button size="small" type="primary" data-testid="view-incident-button" @click="viewIncident">
          {{ t('label.view-incident') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tc-last-run-banner {
  border-radius: var(--sm-radius-lg, 12px);
  border: 1px solid var(--sm-color-border, #d9d9d9);
  border-left-width: 4px;
  background: var(--sm-color-fill-quaternary, #fafafa);
  overflow: hidden;
}

.tc-last-run-banner__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 16px;
  padding: 14px 20px;
}

.tc-last-run-banner__icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.tc-last-run-banner__body {
  flex: 1 1 200px;
  min-width: 0;
}

.tc-last-run-banner__title {
  font-weight: 500;
  color: var(--sm-color-text, rgba(0, 0, 0, 0.88));
}

.tc-last-run-banner__status {
  font-weight: 600;
  margin-left: 4px;
}

.tc-last-run-banner__description {
  margin-top: 4px;
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
  word-break: break-word;
}

.tc-last-run-banner__right {
  display: flex;
  align-items: stretch;
  gap: 16px;
  flex-shrink: 0;
  margin-left: auto;
}

.tc-last-run-banner__metric {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  min-width: 8rem;
}

.tc-last-run-banner__metric-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
  font-weight: 600;
}

.tc-last-run-banner__metric-values {
  font-family: var(--sm-font-mono, ui-monospace, monospace);
  font-size: 14px;
  margin-top: 2px;
}

.tc-last-run-banner__metric-expected {
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}

.tc-last-run-banner__times {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 9rem;
  font-size: 12px;
}

.tc-last-run-banner__next-run {
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
  white-space: nowrap;
}

.tc-last-run-banner__divider {
  width: 1px;
  align-self: stretch;
  background: var(--sm-color-border, #d9d9d9);
}

.tc-last-run-banner__incident {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 12px 20px;
  border-top: 1px solid var(--sm-color-border, #d9d9d9);
  background: rgba(255, 255, 255, 0.55);
}

.tc-last-run-banner__incident-icon {
  font-size: 20px;
  flex-shrink: 0;
  color: var(--sm-color-error, #ff4d4f);
}

.tc-last-run-banner__incident-text {
  flex: 1 1 200px;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}

.tc-last-run-banner__incident-id {
  font-family: var(--sm-font-mono, ui-monospace, monospace);
  font-weight: 600;
  flex-shrink: 0;
}

.tc-last-run-banner__incident-desc {
  flex: 1 1 120px;
  min-width: 0;
  word-break: break-word;
}

.tc-last-run-banner__incident-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}
</style>