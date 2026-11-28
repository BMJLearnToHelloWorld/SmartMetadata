/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';

/** Product parent crumb is nav.observability (数据监控), not label.observability (观测). */
export function observabilityRootBreadcrumbLabel(t: (key: string) => string): string {
  return t('nav.observability');
}

/** Pin getObservabilityRootBreadcrumb(t) + single segment (DataQualityPage.tsx, etc.). */
export function observabilityChildBreadcrumb(
  t: (key: string) => string,
  labelKey: string,
): SmBreadcrumbItem[] {
  return [
    { label: observabilityRootBreadcrumbLabel(t) },
    { label: t(labelKey) },
  ];
}