/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { CatalogService } from '@/types/ingestion';
import { getBrokers, getDashboardURL, getOptionalFields } from './serviceCardFields';

function service(config?: Record<string, unknown>): CatalogService {
  return { connection: config ? { config: config as never } : undefined } as CatalogService;
}

describe('getBrokers', () => {
  it('returns Kafka bootstrapServers and -- otherwise', () => {
    expect(getBrokers({ type: 'Kafka', bootstrapServers: 'k:9092' })).toBe('k:9092');
    expect(getBrokers({ type: 'Kafka' })).toBe('--');
    expect(getBrokers({ type: 'Redpanda', bootstrapServers: 'r:9092' })).toBe('--');
    expect(getBrokers(undefined)).toBe('--');
  });

  it('keeps an empty Kafka bootstrapServers string verbatim', () => {
    expect(getBrokers({ type: 'Kafka', bootstrapServers: '' })).toBe('');
  });
});

describe('getDashboardURL', () => {
  it('returns hostPort when present and non-empty', () => {
    expect(getDashboardURL({ hostPort: 'http://h:3000' })).toBe('http://h:3000');
    expect(getDashboardURL({ hostPort: '' })).toBe('--');
    expect(getDashboardURL({})).toBe('--');
    expect(getDashboardURL(undefined)).toBe('--');
  });
});

describe('getOptionalFields', () => {
  it('renders the brokers row for messaging', () => {
    expect(
      getOptionalFields(service({ type: 'Kafka', bootstrapServers: 'k:9092' }), 'messaging'),
    ).toEqual({
      labelKey: 'settings.services.card.brokerPlural',
      testId: 'brokers',
      value: 'k:9092',
    });
  });

  it('renders the URL row for dashboard and pipeline', () => {
    expect(getOptionalFields(service({ hostPort: 'http://d:8080' }), 'dashboard')).toEqual({
      labelKey: 'settings.services.card.urlUppercase',
      testId: 'dashboard-url',
      value: 'http://d:8080',
    });
    expect(getOptionalFields(service({ hostPort: '' }), 'pipeline')).toEqual({
      labelKey: 'settings.services.card.urlUppercase',
      testId: 'pipeline-url',
      value: '--',
    });
    expect(getOptionalFields(service(undefined), 'pipeline')?.value).toBe('--');
  });

  it('renders the tracking row for mlmodel with the pipeline testid quirk', () => {
    expect(getOptionalFields(service({ trackingUri: 'http://m:5000' }), 'mlmodel')).toEqual({
      labelKey: 'settings.services.card.tracking',
      testId: 'pipeline-url',
      value: 'http://m:5000',
    });
    expect(getOptionalFields(service({}), 'mlmodel')?.value).toBe('--');
  });

  it('renders nothing for the other categories', () => {
    for (const kind of ['database', 'storage', 'api', 'metadata', 'search', 'drive', 'security'] as const) {
      expect(getOptionalFields(service({ hostPort: 'x' }), kind)).toBeNull();
    }
  });
});
