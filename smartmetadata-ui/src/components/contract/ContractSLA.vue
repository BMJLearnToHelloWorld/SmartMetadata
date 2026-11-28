<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckCircleFilled, CloseCircleFilled, MinusCircleOutlined, CalendarOutlined } from '@ant-design/icons-vue';
import type { ContractColumn, DataContract, DataContractResult } from '@/api/dataContracts';
import { DATA_CONTRACT_SLA } from '@/catalog/dataContractConstants';
import ContractConstraintStatus from './ContractConstraintStatus.vue';
import ContractInheritedBadge from './ContractInheritedBadge.vue';
import { formatContractDateTime, getEntityName } from '@/utils/dataContract';

const props = defineProps<{
  contract: DataContract;
  latestContractResults?: DataContractResult;
  contractStatus?: string;
  entityColumns?: ContractColumn[];
}>();

const { t } = useI18n();
const slaValidation = computed(() => props.latestContractResults?.slaValidation);

const tableColumnNameMap = computed(() => {
  const columns = props.entityColumns ?? [];
  const map = new Map<string, string>();
  for (const column of columns) {
    if (column.fullyQualifiedName) {
      map.set(column.fullyQualifiedName, getEntityName(column));
    }
  }
  return map;
});

const REFRESH_SOURCE_LABEL: Record<string, string> = {
  slaColumnProfile: 'label.column-profile',
  systemProfile: 'label.system-metric-plural',
  lifeCycle: 'label.life-cycle',
};

const SLA_CHECK_OUTCOME: Record<string, (validation: NonNullable<DataContractResult['slaValidation']>) => boolean | undefined> = {
  [DATA_CONTRACT_SLA.REFRESH_FREQUENCY]: (validation) => validation.refreshFrequencyMet,
  [DATA_CONTRACT_SLA.TIME_AVAILABILITY]: (validation) => validation.availabilityMet,
  [DATA_CONTRACT_SLA.MAX_LATENCY]: (validation) => validation.latencyMet,
};

interface SlaRow {
  key: string;
  labelKey: string;
  labelName: string;
  data: string;
}

const renderSLAData = computed<SlaRow[]>(() => {
  const sla = props.contract.sla;
  if (!sla) {
    return [];
  }
  const rows: SlaRow[] = [];
  if (sla.refreshFrequency) {
    rows.push({
      key: DATA_CONTRACT_SLA.REFRESH_FREQUENCY,
      labelKey: 'message.freshness-sla-description',
      labelName: t('label.freshness'),
      data: `${sla.refreshFrequency.interval} ${String(sla.refreshFrequency.unit).toLowerCase()}`,
    });
  }
  if (sla.availabilityTime) {
    rows.push({
      key: DATA_CONTRACT_SLA.TIME_AVAILABILITY,
      labelKey: 'message.completeness-sla-description',
      labelName: t('label.completeness'),
      data: sla.availabilityTime,
    });
  }
  if (sla.maxLatency) {
    rows.push({
      key: DATA_CONTRACT_SLA.MAX_LATENCY,
      labelKey: 'message.latency-sla-description',
      labelName: t('label.latency'),
      data: `${sla.maxLatency.value} ${String(sla.maxLatency.unit).toLowerCase()}`,
    });
  }
  if (sla.retention) {
    rows.push({
      key: DATA_CONTRACT_SLA.RETENTION,
      labelKey: 'message.retention-sla-description',
      labelName: t('label.retention'),
      data: `${sla.retention.period} ${String(sla.retention.unit).toLowerCase()}`,
    });
  }
  if (sla.columnName) {
    rows.push({
      key: DATA_CONTRACT_SLA.COLUMN_NAME,
      labelKey: 'message.column-name-sla-description',
      labelName: t('label.column'),
      data: tableColumnNameMap.value.get(sla.columnName) ?? sla.columnName,
    });
  }
  return rows;
});

function outcomeOf(key: string): boolean | undefined {
  const validation = slaValidation.value;
  const reader = SLA_CHECK_OUTCOME[key];
  if (!validation || !reader) {
    return undefined;
  }
  return reader(validation);
}
</script>

<template>
  <div v-if="renderSLAData.length" class="contract-card-items" data-testid="contract-sla-card">
    <div class="contract-card-header-container">
      <div class="contract-card-header-row">
        <span class="contract-card-header">{{ t('label.service-level-agreement') }}</span>
        <ContractInheritedBadge v-if="contract.sla?.inherited" entity-key="label.service-level-agreement" />
      </div>
      <div class="contract-dash-separator" />
    </div>
    <div class="sla-item-container">
      <div v-for="item in renderSLAData" :key="item.key" class="sla-item">
        <CheckCircleFilled
          v-if="outcomeOf(item.key) === true"
          class="sla-icon sla-icon--passed"
          :data-testid="`sla-${item.key}-passed`"
        />
        <CloseCircleFilled
          v-else-if="outcomeOf(item.key) === false"
          class="sla-icon sla-icon--failed"
          :data-testid="`sla-${item.key}-failed`"
        />
        <MinusCircleOutlined
          v-else-if="slaValidation && SLA_CHECK_OUTCOME[item.key]"
          class="sla-icon sla-icon--pending"
          :data-testid="`sla-${item.key}-not-evaluated`"
        />
        <CalendarOutlined v-else class="sla-icon" />
        <i18n-t class="sla-description" :keypath="item.labelKey" tag="span">
          <template #label><strong>{{ item.labelName }}</strong></template>
          <template #data><strong>{{ item.data }}</strong></template>
        </i18n-t>
      </div>
    </div>
    <div v-if="slaValidation" class="sla-validation-result" data-testid="sla-validation-result">
      <div v-if="contractStatus" class="sla-status-row">
        <span>{{ t('label.entity-status', { entity: t('label.service-level-agreement') }) }} :</span>
        <ContractConstraintStatus :status="contractStatus" test-id="contract-status-card-item-sla-status" />
      </div>
      <p
        v-if="slaValidation.lastRefreshedAt && slaValidation.refreshedAtSource"
        class="sla-meta"
        data-testid="sla-last-refreshed"
      >
        {{
          t('message.sla-last-refreshed', {
            time: formatContractDateTime(slaValidation.lastRefreshedAt),
            source: t(REFRESH_SOURCE_LABEL[slaValidation.refreshedAtSource] ?? slaValidation.refreshedAtSource),
          })
        }}
      </p>
      <p v-if="slaValidation.message" class="sla-meta" data-testid="sla-validation-message">
        {{ slaValidation.message }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.contract-card-header-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.contract-card-header {
  font-weight: 600;
  color: var(--sm-text-primary);
}
.contract-dash-separator {
  border-bottom: 2px dotted var(--sm-border-color);
  margin: 8px 0 16px;
}
.sla-item-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sla-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--sm-text-primary);
}
.sla-icon { font-size: 16px; margin-top: 2px; color: var(--sm-text-tertiary); }
.sla-icon--passed { color: var(--sm-color-success); }
.sla-icon--failed { color: var(--sm-color-error); }
.sla-icon--pending { color: var(--sm-text-quaternary); }
.sla-validation-result { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.sla-status-row { display: flex; align-items: center; gap: 8px; }
.sla-meta { margin: 0; color: var(--sm-text-secondary); font-size: 13px; }
</style>
