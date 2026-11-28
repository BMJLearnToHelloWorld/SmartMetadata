/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { EntityBreadcrumb } from '@/features/crud/types';
import { splitFqn } from '@/catalog/fqn';
import { parseEntityLink } from '@/quality/entityLink';
import {
  getDataQualityPagePath,
  getEntityDetailsPath,
  getServiceDetailsPath,
  getTestSuitePath,
  SERVICE_CATEGORY_DATABASE_SERVICES,
} from '@/utils/fqnPaths';
import { observabilityChildBreadcrumb, observabilityRootBreadcrumbLabel } from '@/utils/observabilityBreadcrumbs';

export interface BreadcrumbLink {
  name: string;
  url?: string;
}

/** Official TestCases / DataQualityTab landing list `breadcrumbData`. */
export function buildTestCaseListOriginBreadcrumb(t: (key: string) => string): BreadcrumbLink[] {
  return [
    {
      name: t('label.data-quality'),
      url: getDataQualityPagePath('test-cases'),
    },
  ];
}

/** Official TestSuiteDetail `incidentUrlState` for embedded test-case list navigation. */
export function buildTestCaseSuiteDetailOriginBreadcrumb(
  t: (key: string) => string,
  suiteLabel: string,
  suiteFqn: string,
): BreadcrumbLink[] {
  return [
    {
      name: t('label.test-suite-plural'),
      url: getDataQualityPagePath('test-suites', 'bundle-suites'),
    },
    {
      name: suiteLabel,
      url: getTestSuitePath(suiteFqn),
    },
  ];
}

/** Test suite detail: observability root → data quality (list) → suite name. */
export function buildTestSuiteDetailBreadcrumbs(
  t: (key: string) => string,
  suiteLabel: string,
): EntityBreadcrumb[] {
  const child = observabilityChildBreadcrumb(t, 'label.data-quality');
  return [
    { label: child[0]?.label ?? observabilityRootBreadcrumbLabel(t) },
    { label: child[1]?.label ?? t('label.data-quality'), to: getDataQualityPagePath('test-suites') },
    { label: suiteLabel },
  ];
}

function assetTrailFromTableFqn(tableFqn: string): BreadcrumbLink[] {
  const parts = splitFqn(tableFqn);
  if (parts.length !== 4) {
    return [{ name: '', url: getDataQualityPagePath('test-cases') }];
  }
  const [service, database, schema, table] = parts;
  return [
    {
      name: service,
      url: getServiceDetailsPath(service, SERVICE_CATEGORY_DATABASE_SERVICES),
    },
    {
      name: database,
      url: getEntityDetailsPath('database', `${service}.${database}`),
    },
    {
      name: schema,
      url: getEntityDetailsPath('databaseSchema', `${service}.${database}.${schema}`),
    },
    {
      name: table,
      url: getEntityDetailsPath('table', tableFqn),
    },
  ];
}

function mapOriginBreadcrumb(links: BreadcrumbLink[] | undefined): EntityBreadcrumb[] {
  if (!links?.length) {
    return [];
  }
  return links.map((item) => ({
    label: item.name,
    to: item.url ? item.url : undefined,
  }));
}

/**
 * Official TestCaseDetail breadcrumbItems: observability root + origin
 * trail from navigation state, else service → database → schema → table
 * from entityLink, then the test case name.
 */
export function buildTestCaseDetailBreadcrumbs(
  t: (key: string) => string,
  options: {
    testCaseName: string;
    entityLink?: string;
    originBreadcrumb?: BreadcrumbLink[];
    dimensionKey?: string;
    isDimensionPage?: boolean;
    testCaseFqn?: string;
  },
): EntityBreadcrumb[] {
  const parsed = options.entityLink ? parseEntityLink(options.entityLink) : null;
  const tableFqn = parsed?.fqn ?? '';
  const assetTrail =
    tableFqn && splitFqn(tableFqn).length === 4
      ? assetTrailFromTableFqn(tableFqn)
      : [{ name: t('label.data-quality'), url: getDataQualityPagePath('test-cases') }];

  const leading = options.originBreadcrumb?.length
    ? options.originBreadcrumb
    : assetTrail.map((item) => ({ name: item.name, url: item.url }));

  const items: EntityBreadcrumb[] = [
    { label: observabilityRootBreadcrumbLabel(t) },
    ...mapOriginBreadcrumb(leading),
  ];

  if (options.isDimensionPage && options.testCaseFqn) {
    items.push({
      label: options.testCaseName,
      to: { name: 'quality-test-case', params: { id: options.testCaseFqn } },
    });
    if (options.dimensionKey) {
      items.push({ label: options.dimensionKey });
    }
    return items;
  }

  items.push({ label: options.testCaseName });
  return items;
}