<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseLastRunBanner / LastRunBannerLayout (IncidentManagerPageHeader).
  Vue + ant-design-vue; status-driven official data-testid roots only.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';
import {
  LAST_RUN_BANNER_TEST_IDS,
  NO_RUN_BANNER_TEST_ID,
} from '@/quality/testCaseLastRunBanner.constants';
import type { TestCase, TestCaseResult } from '@/types/quality';

const props = defineProps<{
  testCase: TestCase;
  testCaseResult?: TestCaseResult;
  testCaseStatus?: string;
}>();

const { t } = useI18n();

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
    return 'label.status';
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

const noRunDescriptionKey = computed(() => 'message.test-case-has-not-run');

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
    return '';
  }
  if (result.result) {
    return result.result;
  }
  if (status === 'Queued') {
    return t('message.test-case-run-queued');
  }
  return '';
});
</script>

<template>
  <div
    class="tc-last-run-banner"
    :data-testid="bannerTestId"
    role="status"
    aria-live="polite"
  >
    <div class="tc-last-run-banner__summary" data-testid="test-case-last-run-summary">
      <component :is="statusIcon" class="tc-last-run-banner__icon" data-testid="test-case-last-run-icon" />
      <div class="tc-last-run-banner__body">
        <div class="tc-last-run-banner__title" data-testid="test-case-last-run-title">
          {{ t(statusLabelKey) }}
        </div>
        <p v-if="runDescription" class="tc-last-run-banner__description">
          {{ runDescription }}
        </p>
        <p
          v-else-if="!resolvedResult"
          class="tc-last-run-banner__description"
        >
          {{ t(noRunDescriptionKey) }}
        </p>
      </div>
      <div class="tc-last-run-banner__next">
        <span v-if="resolvedResult?.timestamp" class="tc-last-run-banner__time">
          {{ new Date(resolvedResult.timestamp < 1e12 ? resolvedResult.timestamp * 1000 : resolvedResult.timestamp).toLocaleString() }}
        </span>
        <span v-else aria-hidden="true" class="tc-last-run-banner__time">—</span>
        <span class="tc-last-run-banner__next-run" data-testid="test-case-next-run">
          {{ t('label.next') }} · —
        </span>
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
  font-weight: 600;
  color: var(--sm-color-text, rgba(0, 0, 0, 0.88));
}

.tc-last-run-banner__description {
  margin-top: 4px;
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
  word-break: break-word;
}

.tc-last-run-banner__next {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  min-width: 9rem;
}

.tc-last-run-banner__time {
  font-size: 14px;
}

.tc-last-run-banner__next-run {
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
  white-space: nowrap;
}
</style>