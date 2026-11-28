<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Tag } from 'ant-design-vue';
import type { ContractColumn, ContractSecurity } from '@/api/dataContracts';
import { getEntityName, NO_DATA_PLACEHOLDER } from '@/utils/dataContract';

const props = defineProps<{
  security?: ContractSecurity;
  entityColumns?: ContractColumn[];
}>();

const { t } = useI18n();

const tableColumnNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const column of props.entityColumns ?? []) {
    if (column.fullyQualifiedName) {
      map.set(column.fullyQualifiedName, getEntityName(column));
    }
  }
  return map;
});

const classifications = computed(() => {
  const value = props.security?.dataClassification;
  if (!value) {
    return [];
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
});

function columnLabel(columnName?: string): string {
  if (!columnName) {
    return NO_DATA_PLACEHOLDER;
  }
  return tableColumnNameMap.value.get(columnName) ?? columnName;
}
</script>

<template>
  <div class="contract-security-component-container">
    <Card class="classification-card" data-testid="contract-security-classification">
      <div class="classification-label">{{ t('label.classification') }}</div>
      <template v-if="classifications.length">
        <Tag
          v-for="item in classifications"
          :key="item"
          color="pink"
          data-testid="contract-security-classification-tag"
        >
          {{ item }}
        </Tag>
      </template>
      <span v-else>{{ NO_DATA_PLACEHOLDER }}</span>
    </Card>
    <div v-if="security?.policies?.length" data-testid="contract-security-policy-container">
      <div class="policy-label">{{ t('label.policy-plural') }}</div>
      <Card v-for="(policy, index) in security.policies" :key="index" class="policy-card">
        <div class="policy-header">
          <span class="access-policy-label">{{ t('label.access-policy') }}: </span>
          <span class="access-policy-value" :data-testid="`contract-security-access-policy-${index}`">
            {{ policy.accessPolicy || NO_DATA_PLACEHOLDER }}
          </span>
        </div>
        <div class="policy-body">
          <div class="policy-subtitle">{{ t('label.identities') }}</div>
          <template v-if="policy.identities?.length">
            <Tag
              v-for="identity in policy.identities"
              :key="identity"
              :data-testid="`contract-security-identities-${index}-${identity}`"
            >
              {{ identity }}
            </Tag>
          </template>
          <span v-else>{{ NO_DATA_PLACEHOLDER }}</span>
          <template v-if="policy.rowFilters?.length">
            <div class="contract-dash-separator" />
            <div class="policy-subtitle">{{ t('label.row-filter-plural') }}</div>
            <Tag
              v-for="(filter, filterIndex) in policy.rowFilters"
              :key="filter.columnName ?? filterIndex"
              :data-testid="`contract-security-rowFilter-${index}-${filterIndex}`"
            >
              {{ columnLabel(filter.columnName) }} =
              <template v-for="(value, valueIndex) in filter.values ?? []" :key="value">
                <span class="row-filter-value">{{ value }}{{ valueIndex + 1 === (filter.values?.length ?? 0) ? '' : ',' }}</span>
              </template>
            </Tag>
          </template>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.contract-security-component-container { display: flex; flex-direction: column; gap: 16px; }
.classification-label, .policy-label, .policy-subtitle, .access-policy-label {
  font-weight: 600;
  color: var(--sm-text-primary);
  margin-bottom: 8px;
}
.policy-header { padding-bottom: 8px; border-bottom: 1px solid var(--sm-border-color); margin-bottom: 12px; }
.policy-body { padding-top: 4px; }
.policy-card + .policy-card { margin-top: 12px; }
.contract-dash-separator { border-bottom: 2px dotted var(--sm-border-color); margin: 12px 0; }
.access-policy-value, .row-filter-value { font-weight: 400; }
</style>
