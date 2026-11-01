/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
/**
 * Data-driven quality / observability tab registry, following the Stage 4
 * governanceTabs pattern. Tab rows are data, never if-else branches in
 * views: a view looks its page up here and renders the supported tabs,
 * leaving unsupported ones as honest residuals.
 *
 * Official prototypes (read-only reference, openmetadata-ui):
 * DataQualityPage (dashboard/test-cases/test-suites), TestSuiteDetailsPage,
 * IncidentManagerDetailPage (test-case-results/dimensionality/sql-query/
 * issues), ObservabilityAlertsPage, AlertDetailsPage, AddObservabilityPage,
 * ProfilerConfigurationPage. A tab is marked supported only when the
 * product view actually wires it; anything else carries a residual reason
 * and must not be rendered as if it worked.
 */
export interface QualityTab {
  key: string;
  /** i18n key for the tab label. */
  labelKey: string;
  supported: boolean;
  /** Why the tab is residual; absent for supported tabs. */
  residualReason?: string;
}

export type QualityPage =
  | 'dqLanding'
  | 'testCase'
  | 'testSuite'
  | 'incident'
  | 'alert'
  | 'profiler';

export const QUALITY_PAGE_TABS: Record<QualityPage, QualityTab[]> = {
  dqLanding: [
    { key: 'dashboard', labelKey: 'quality.landing.tabs.dashboard', supported: true },
    { key: 'test-cases', labelKey: 'quality.landing.tabs.testCases', supported: true },
    { key: 'test-suites', labelKey: 'quality.landing.tabs.testSuites', supported: true },
  ],
  testCase: [
    { key: 'overview', labelKey: 'crud.overview', supported: true },
    { key: 'results', labelKey: 'quality.testCases.resultsTab', supported: true },
    { key: 'issues', labelKey: 'quality.tabs.issues', supported: true },
    {
      key: 'dimensionality',
      labelKey: 'quality.tabs.dimensionality',
      supported: false,
      residualReason: 'quality.testCases.residualDimensionality',
    },
    {
      key: 'sql-query',
      labelKey: 'quality.tabs.sqlQuery',
      supported: false,
      residualReason: 'quality.testCases.residualSqlQuery',
    },
  ],
  testSuite: [
    { key: 'overview', labelKey: 'crud.overview', supported: true },
    { key: 'tests', labelKey: 'quality.testSuites.testsTab', supported: true },
    {
      key: 'pipeline',
      labelKey: 'quality.tabs.pipeline',
      supported: false,
      residualReason: 'quality.testSuites.residualPipeline',
    },
  ],
  incident: [
    { key: 'overview', labelKey: 'crud.overview', supported: true },
  ],
  alert: [
    { key: 'overview', labelKey: 'crud.overview', supported: true },
    { key: 'destinations', labelKey: 'observability.alerts.destinationsTab', supported: true },
  ],
  profiler: [
    { key: 'configuration', labelKey: 'settings.profiler.title', supported: true },
    { key: 'results', labelKey: 'quality.tabs.profilerResults', supported: true },
  ],
};

export function supportedQualityTabs(page: QualityPage): QualityTab[] {
  return QUALITY_PAGE_TABS[page].filter((tab) => tab.supported);
}

export function residualQualityTabs(page: QualityPage): QualityTab[] {
  return QUALITY_PAGE_TABS[page].filter((tab) => !tab.supported);
}
