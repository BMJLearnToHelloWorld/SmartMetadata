<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { CheckCircleFilled, CloseCircleFilled, MinusCircleOutlined, ClockCircleOutlined } from '@ant-design/icons-vue';
import type { DataContract } from '@/api/dataContracts';
import { getTestCaseExecutionSummary } from '@/api/testSuites';
import { listTestCasesBySearch } from '@/api/testCases';
import type { TestCase } from '@/types/quality';
import { DEFAULT_TEST_CASE_SORT_ORDER, ES_MAX_PAGE_SIZE } from '@/catalog/dataContractConstants';
import ContractConstraintStatus from './ContractConstraintStatus.vue';
import SmState from '@/components/shared/SmState.vue';
import { getTestCaseDetailPagePath } from '@/utils/fqnPaths';
import { message } from 'ant-design-vue';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = defineProps<{
  contract: DataContract;
  contractStatus?: string;
}>();

const { t } = useI18n();
const isTestCaseLoading = ref(false);
const testCaseSummary = ref<{ total?: number; success?: number; failed?: number; aborted?: number }>();
const testCaseResult = ref<TestCase[]>([]);

async function fetchTestCaseSummary(): Promise<void> {
  try {
    testCaseSummary.value = await getTestCaseExecutionSummary(props.contract.testSuite?.id);
  } catch {
    // official: silent fail
  }
}

async function fetchTestCases(): Promise<void> {
  isTestCaseLoading.value = true;
  try {
    const response = await listTestCasesBySearch({
      testSuiteId: props.contract.testSuite?.id,
      ...DEFAULT_TEST_CASE_SORT_ORDER,
      limit: ES_MAX_PAGE_SIZE,
    });
    testCaseResult.value = response.data;
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-case-plural') })));
  } finally {
    isTestCaseLoading.value = false;
  }
}

const showTestCaseSummaryChart = computed(() => Boolean(testCaseSummary.value?.total));
const segmentWidths = computed(() => {
  const total = testCaseSummary.value?.total ?? 0;
  return {
    successPercent: total ? ((testCaseSummary.value?.success ?? 0) / total) * 100 : 0,
    failedPercent: total ? ((testCaseSummary.value?.failed ?? 0) / total) * 100 : 0,
    abortedPercent: total ? ((testCaseSummary.value?.aborted ?? 0) / total) * 100 : 0,
  };
});

function statusOf(record: TestCase): string {
  return record.testCaseResult?.testCaseStatus ?? 'Queued';
}

watch(() => props.contract.testSuite?.id, (id) => {
  if (id) {
    void fetchTestCaseSummary();
    void fetchTestCases();
  }
}, { immediate: true });
</script>

<template>
  <SmState v-if="isTestCaseLoading" state="loading" />
  <div v-else class="data-quality-card-container">
    <div class="data-quality-main">
      <template v-if="showTestCaseSummaryChart">
        <div class="data-quality-total-test">
          {{ t('label.total-entity', { entity: t('label.test') }) }}:
          <span class="data-quality-total-test-value">{{ testCaseSummary?.total }}</span>
        </div>
        <div class="data-quality-line-chart-container">
          <div class="data-quality-line-chart-item success" :style="{ width: segmentWidths.successPercent + '%' }" />
          <div class="data-quality-line-chart-item failed" :style="{ width: segmentWidths.failedPercent + '%' }" />
          <div class="data-quality-line-chart-item aborted" :style="{ width: segmentWidths.abortedPercent + '%' }" />
        </div>
        <div class="data-quality-legends-container">
          <div class="data-quality-legends-item">
            <span class="data-quality-legends-dot success" />
            <span>{{ t('label.success') }}: <strong>{{ testCaseSummary?.success }}</strong></span>
          </div>
          <div class="data-quality-legends-item">
            <span class="data-quality-legends-dot failed" />
            <span>{{ t('label.failed') }}: <strong>{{ testCaseSummary?.failed }}</strong></span>
          </div>
          <div class="data-quality-legends-item">
            <span class="data-quality-legends-dot aborted" />
            <span>{{ t('label.aborted') }}: <strong>{{ testCaseSummary?.aborted }}</strong></span>
          </div>
        </div>
      </template>
      <div class="data-quality-test-item-container">
        <div v-for="item in testCaseResult" :key="item.id" class="data-quality-item">
          <CheckCircleFilled v-if="statusOf(item) === 'Success' || statusOf(item) === 'Passed'" class="test-status-icon is-success" />
          <CloseCircleFilled v-else-if="statusOf(item) === 'Failed'" class="test-status-icon is-failed" />
          <MinusCircleOutlined v-else-if="statusOf(item) === 'Aborted'" class="test-status-icon is-aborted" />
          <ClockCircleOutlined v-else class="test-status-icon is-queued" />
          <RouterLink class="data-quality-item-name-link" :to="getTestCaseDetailPagePath(item.fullyQualifiedName ?? item.name)">
            {{ item.name }}
          </RouterLink>
        </div>
      </div>
    </div>
    <div v-if="contractStatus" class="contract-status-container">
      <span>{{ t('label.entity-status', { entity: t('label.quality') }) }} :</span>
      <ContractConstraintStatus :status="contractStatus" test-id="contract-status-card-item-quality-status" />
    </div>
  </div>
</template>

<style scoped>
.data-quality-card-container { display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: start; }
.data-quality-total-test { margin-bottom: 8px; color: var(--sm-text-primary); }
.data-quality-total-test-value { font-weight: 600; }
.data-quality-line-chart-container { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--sm-border-color); }
.data-quality-line-chart-item.success { background: var(--sm-color-success); }
.data-quality-line-chart-item.failed { background: var(--sm-color-error); }
.data-quality-line-chart-item.aborted { background: var(--sm-color-warning); }
.data-quality-legends-container { display: flex; gap: 16px; margin: 8px 0 16px; color: var(--sm-text-secondary); }
.data-quality-legends-item { display: flex; align-items: center; gap: 6px; }
.data-quality-legends-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.data-quality-legends-dot.success { background: var(--sm-color-success); }
.data-quality-legends-dot.failed { background: var(--sm-color-error); }
.data-quality-legends-dot.aborted { background: var(--sm-color-warning); }
.data-quality-test-item-container { display: flex; flex-direction: column; gap: 14px; }
.data-quality-item { display: flex; align-items: center; gap: 8px; }
.test-status-icon.is-success { color: var(--sm-color-success); }
.test-status-icon.is-failed { color: var(--sm-color-error); }
.test-status-icon.is-aborted { color: var(--sm-color-warning); }
.test-status-icon.is-queued { color: var(--sm-text-quaternary); }
.data-quality-item-name-link { color: var(--sm-brand); }
.contract-status-container { display: flex; align-items: center; gap: 12px; }
</style>
