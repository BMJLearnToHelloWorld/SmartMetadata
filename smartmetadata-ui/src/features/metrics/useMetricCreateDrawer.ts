/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { ref, type Ref } from 'vue';

/**
 * Official useMetricCreateDrawer (components/Metric/AddMetric/
 * useMetricCreateDrawer.tsx) state half: the drawer is a singleton
 * mounted in the metrics list, and `openDrawer(parentFqn?)` opens it
 * as a child-metric form when a parent FQN is supplied. The form,
 * intake, and submit live in MetricCreateDrawer.vue; this composable
 * owns only the open state so the list (and, later, the detail
 * hierarchy card) opens the same drawer.
 *
 * Two official behaviours are deliberately NOT carried over, and the
 * reasons are recorded here, not re-decided in the view:
 * - No active-domain prefill: the product list has no active-domain
 *   concept (the official drawer pre-fills domains from
 *   useDomainStore); openDrawer takes no domain.
 * - No detail hierarchy-card entry in this batch: the product has no
 *   detail hierarchy card, so no `Add child metric` entry exists yet
 *   (residual R-W2G12-1); the parentFqn parameter is already wired
 *   for it.
 */
export interface MetricCreateDrawerHandle {
  open: Ref<boolean>;
  parentMetricFqn: Ref<string | undefined>;
  openDrawer: (parentFqn?: string) => void;
  closeDrawer: () => void;
}

export function useMetricCreateDrawer(): MetricCreateDrawerHandle {
  const open = ref(false);
  const parentMetricFqn = ref<string | undefined>(undefined);

  function openDrawer(parentFqn?: string): void {
    parentMetricFqn.value = parentFqn;
    open.value = true;
  }

  function closeDrawer(): void {
    open.value = false;
  }

  return { open, parentMetricFqn, openDrawer, closeDrawer };
}
