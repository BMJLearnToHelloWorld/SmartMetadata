<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of AuditLogList (components/AuditLog/AuditLogList.component.tsx):
  skeleton while loading, three empty states (search beats filters
  beats neither), else the feed rows. Row keys are id ?? changeEventId
  ?? index, as in the pin.
-->
<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoFilteredResultsPlaceholder from '@/components/shared/NoFilteredResultsPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import type { AuditLogEntry } from '@/api/auditLogs';
import type { EmptyPlaceholderAction } from '@/utils/emptyPlaceholder';
import AuditLogListItem from './AuditLogListItem.vue';

const props = defineProps<{
  logs: AuditLogEntry[];
  isLoading: boolean;
  hasActiveSearch: boolean;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
}>();

const { t } = useI18n();

const clearAction = computed<EmptyPlaceholderAction[] | undefined>(() =>
  props.onClearFilters
    ? [
        {
          key: 'clear',
          color: 'primary',
          label: t('label.clear-entity', { entity: t('label.all-lowercase') }),
          onPress: props.onClearFilters,
        },
      ]
    : undefined,
);

function rowKey(log: AuditLogEntry, index: number): string {
  return log.id?.toString() ?? log.changeEventId ?? index.toString();
}
</script>

<template>
  <div v-if="isLoading" data-testid="audit-log-list-skeleton" class="audit-log-skeleton">
    <div class="audit-log-skeleton__header"><div class="audit-log-skeleton__bar" style="width: 200px" /></div>
    <div v-for="row in 5" :key="row" class="audit-log-skeleton__row">
      <div class="audit-log-skeleton__circle" />
      <div class="audit-log-skeleton__lines">
        <div class="audit-log-skeleton__bar" style="width: 60%" />
        <div class="audit-log-skeleton__bar" style="width: 100%" />
        <div class="audit-log-skeleton__bar" style="width: 75%" />
      </div>
    </div>
  </div>
  <div v-else-if="logs.length === 0" data-testid="audit-log-list">
    <div class="audit-log-list__empty">
      <NoSearchResultsPlaceholder
        v-if="hasActiveSearch"
        :title="t('label.no-matching-results')"
        :description="t('message.check-spelling-or-try-different-term')"
        :icon="SearchOutlined"
        :actions="clearAction"
      />
      <NoFilteredResultsPlaceholder
        v-else-if="hasActiveFilters"
        :title="t('label.no-result-for-these-filter-plural')"
        :description="t('message.no-results-for-filters-description')"
        :icon="SearchOutlined"
        :actions="clearAction"
      />
      <NoDataPlaceholder
        v-else
        :title="t('label.no-audit-logs-yet')"
        :description="t('message.no-audit-logs-description')"
      />
    </div>
  </div>
  <div v-else data-testid="audit-log-list">
    <div>
      <AuditLogListItem v-for="(log, index) in logs" :key="rowKey(log, index)" :log="log" />
    </div>
  </div>
</template>

<style scoped>
.audit-log-skeleton__header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.audit-log-skeleton__row {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.audit-log-skeleton__row:last-child {
  border-bottom: 0;
}

.audit-log-skeleton__circle {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--sm-content-bg);
}

.audit-log-skeleton__lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.audit-log-skeleton__bar {
  height: 14px;
  background: var(--sm-content-bg);
  border-radius: 2px;
}

.audit-log-list__empty {
  position: relative;
  min-height: 320px;
  padding: 32px;
}
</style>
