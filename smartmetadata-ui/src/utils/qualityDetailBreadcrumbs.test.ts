/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { buildTestCaseDetailBreadcrumbs, buildTestSuiteDetailBreadcrumbs } from './qualityDetailBreadcrumbs';

describe('buildTestSuiteDetailBreadcrumbs', () => {
  it('chains observability, data quality list, and suite label', () => {
    const i18n = createTestI18n('zh-CN');
    const crumbs = buildTestSuiteDetailBreadcrumbs(i18n.global.t, 'Bundle A');
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0].label).toBe('数据监控');
    expect(crumbs[1].to).toBe('/data-quality/test-suites');
    expect(crumbs[2].label).toBe('Bundle A');
  });
});

describe('buildTestCaseDetailBreadcrumbs', () => {
  it('uses origin breadcrumb from navigation state when provided', () => {
    const i18n = createTestI18n();
    const crumbs = buildTestCaseDetailBreadcrumbs(i18n.global.t, {
      testCaseName: 'row_count',
      originBreadcrumb: [{ name: 'Incidents', url: '/incident-manager' }],
    });
    expect(crumbs.map((c) => c.label)).toEqual(['Observability', 'Incidents', 'row_count']);
    expect(crumbs[1].to).toBe('/incident-manager');
  });

  it('falls back to asset trail from a four-part table entityLink', () => {
    const i18n = createTestI18n();
    const link = '<#E::table::svc.db.schema.orders>';
    const crumbs = buildTestCaseDetailBreadcrumbs(i18n.global.t, {
      testCaseName: 'min_test',
      entityLink: link,
    });
    expect(crumbs[0].label).toBeTruthy();
    expect(crumbs[crumbs.length - 1].label).toBe('min_test');
    expect(crumbs.some((c) => c.label === 'orders')).toBe(true);
  });
});