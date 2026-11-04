/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Metric bulk-edit scope, carried from the metric listing page to the
 * bulk-edit view. Official carries it as router location.state
 * (MetricListPage handleBulkEdit → navigate(bulk-edit path, { state: {
 * metricBulkEditScope } })); the product has no router-state precedent,
 * so a session pinia store holds the same shape instead. A direct
 * navigation with no stored scope falls back to official's default:
 * { mode: 'filtered', filters: {} } — everything in the listing.
 */
export interface MetricBulkEditFilters {
  searchText?: string;
  statusFilter?: string;
}

export type MetricBulkEditScope =
  | {
      mode: 'selected';
      metricIds: string[];
      metricNames: string[];
      filters: MetricBulkEditFilters;
    }
  | { mode: 'filtered'; filters: MetricBulkEditFilters };

export const useBulkEditScopeStore = defineStore('bulkEditScope', () => {
  const scope = ref<MetricBulkEditScope | null>(null);

  function setScope(next: MetricBulkEditScope): void {
    scope.value = next;
  }

  function takeScope(): MetricBulkEditScope {
    const taken = scope.value ?? { mode: 'filtered', filters: {} };
    scope.value = null;
    return taken;
  }

  return { scope, setScope, takeScope };
});
