/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { CatalogService, ServiceConnectionConfig } from '@/types/ingestion';
import type { ServiceCategoryKind } from './serviceCategories';

/**
 * Card-view optional field (01 §3.8), ported from official
 * `utils/ServiceUtils.tsx getOptionalFields` (pin a3012259ca),
 * `utils/MessagingServiceUtils.ts getBrokers`, and
 * `utils/DashboardServiceUtils.ts getDashboardURL`. Only four
 * categories render a field; every other category renders nothing.
 * The mlmodel row reuses the pipeline row's `pipeline-url` testid —
 * the pin's own quirk, ported as written.
 */

export interface ServiceCardField {
  labelKey: string;
  testId: string;
  value: string;
}

/** Pin `getBrokers`: Kafka's bootstrapServers, '--' when undefined. */
export function getBrokers(config: ServiceConnectionConfig | undefined): string {
  let retVal: string | undefined;
  if (config?.type === 'Kafka') {
    retVal = config.bootstrapServers;
  }
  return retVal === undefined ? '--' : retVal;
}

/** Pin `getDashboardURL`: hostPort when the config has a non-empty one. */
export function getDashboardURL(config: ServiceConnectionConfig | undefined): string {
  return config !== undefined &&
    typeof config.hostPort === 'string' &&
    config.hostPort !== ''
    ? config.hostPort
    : '--';
}

export function getOptionalFields(
  service: CatalogService,
  kind: ServiceCategoryKind,
): ServiceCardField | null {
  const config = service.connection?.config;
  switch (kind) {
    case 'messaging':
      return { labelKey: 'settings.services.card.brokerPlural', testId: 'brokers', value: getBrokers(config) };
    case 'dashboard':
      return { labelKey: 'settings.services.card.urlUppercase', testId: 'dashboard-url', value: getDashboardURL(config) };
    case 'pipeline': {
      const hostPort = config?.hostPort;
      return {
        labelKey: 'settings.services.card.urlUppercase',
        testId: 'pipeline-url',
        value: typeof hostPort === 'string' ? hostPort || '--' : '--',
      };
    }
    case 'mlmodel': {
      const trackingUri = config?.trackingUri;
      return {
        labelKey: 'settings.services.card.tracking',
        testId: 'pipeline-url',
        value: typeof trackingUri === 'string' ? trackingUri || '--' : '--',
      };
    }
    default:
      return null;
  }
}
