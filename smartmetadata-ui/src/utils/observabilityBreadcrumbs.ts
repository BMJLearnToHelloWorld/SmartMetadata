/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';

/** Pin getObservabilityRootBreadcrumb(t) + single segment (DataQualityPage.tsx, etc.). */
export function observabilityChildBreadcrumb(
  t: (key: string) => string,
  labelKey: string,
): SmBreadcrumbItem[] {
  return [
    { label: t('label.observability') },
    { label: t(labelKey) },
  ];
}