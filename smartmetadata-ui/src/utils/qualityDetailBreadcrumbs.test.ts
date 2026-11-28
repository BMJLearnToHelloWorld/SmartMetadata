/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import {
  buildTestCaseDetailBreadcrumbs,
  buildTestCaseListOriginBreadcrumb,
  buildTestCaseSuiteDetailOriginBreadcrumb,
  buildTestSuiteDetailBreadcrumbs,
} from './qualityDetailBreadcrumbs';

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

describe('test case origin breadcrumb writers', () => {
  it('landing list trail matches official TestCases DataQualityTab breadcrumbData', () => {
    const i18n = createTestI18n();
    expect(buildTestCaseListOriginBreadcrumb(i18n.global.t)).toEqual([
      { name: 'Data Quality', url: '/data-quality/test-cases' },
    ]);
  });

  it('suite detail trail matches official incidentUrlState shape', () => {
    const i18n = createTestI18n();
    expect(buildTestCaseSuiteDetailOriginBreadcrumb(i18n.global.t, 'Bundle A', 'finance.suite')).toEqual([
      { name: 'Test Suites', url: '/data-quality/test-suites/bundle-suites' },
      { name: 'Bundle A', url: '/test-suites/finance.suite' },
    ]);
  });

  it('builds full detail crumbs with zh-CN observability root from landing origin', () => {
    const i18n = createTestI18n('zh-CN');
    const crumbs = buildTestCaseDetailBreadcrumbs(i18n.global.t, {
      testCaseName: 'row_count',
      originBreadcrumb: buildTestCaseListOriginBreadcrumb(i18n.global.t),
    });
    expect(crumbs[0].label).toBe('数据监控');
    expect(crumbs[1].label).toBe('数据质量');
    expect(crumbs[1].to).toBe('/data-quality/test-cases');
    expect(crumbs[2].label).toBe('row_count');
  });

  it('builds full detail crumbs with suite origin trail', () => {
    const i18n = createTestI18n('zh-CN');
    const origin = buildTestCaseSuiteDetailOriginBreadcrumb(i18n.global.t, '套件 A', 'suite.fqn');
    const crumbs = buildTestCaseDetailBreadcrumbs(i18n.global.t, {
      testCaseName: 'min',
      originBreadcrumb: origin,
    });
    expect(crumbs[0].label).toBe('数据监控');
    expect(crumbs.map((c) => c.label)).toEqual(['数据监控', '质控测试集', '套件 A', 'min']);
    expect(crumbs[2].to).toBe('/test-suites/suite.fqn');
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