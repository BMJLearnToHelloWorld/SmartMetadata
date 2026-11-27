/**
 * Official TestCases 高级 filter bar (openmetadata-ui
 * constants/profiler.constant.ts TEST_CASE_FILTERS +
 * useTestCaseFilters.ts). Vue3 helper — no CCL copy.
 *
 * Default visible keys follow live official /data-quality/test-cases
 * (数据表 / 类型 / 状态 / 标签). In-repo DEFAULT_SELECTED_FILTERS also
 * includes lastRun; live official does not show lastRun until 高级 adds
 * it, so lastRun stays in the menu only.
 */
export const TEST_CASE_FILTER_KEYS = {
  table: 'tableFqn',
  platform: 'testPlatforms',
  type: 'testCaseType',
  status: 'testCaseStatus',
  lastRun: 'lastRunRange',
  tier: 'tier',
  tags: 'tags',
  service: 'serviceName',
  dimension: 'dataQualityDimension',
  dataProduct: 'dataProductFqn',
} as const;

export type TestCaseFilterKey = (typeof TEST_CASE_FILTER_KEYS)[keyof typeof TEST_CASE_FILTER_KEYS];

export const DEFAULT_VISIBLE_TEST_CASE_FILTERS: TestCaseFilterKey[] = [
  TEST_CASE_FILTER_KEYS.table,
  TEST_CASE_FILTER_KEYS.type,
  TEST_CASE_FILTER_KEYS.status,
  TEST_CASE_FILTER_KEYS.tags,
];

/** Official TestCases.component filterLayout order, used by the 高级 menu. */
export const TEST_CASE_ADVANCED_FILTER_MENU: TestCaseFilterKey[] = [
  TEST_CASE_FILTER_KEYS.lastRun,
  TEST_CASE_FILTER_KEYS.table,
  TEST_CASE_FILTER_KEYS.platform,
  TEST_CASE_FILTER_KEYS.type,
  TEST_CASE_FILTER_KEYS.status,
  TEST_CASE_FILTER_KEYS.tags,
  TEST_CASE_FILTER_KEYS.tier,
  TEST_CASE_FILTER_KEYS.service,
  TEST_CASE_FILTER_KEYS.dimension,
  TEST_CASE_FILTER_KEYS.dataProduct,
];

export const TEST_CASE_FILTER_I18N: Record<TestCaseFilterKey, string> = {
  tableFqn: 'quality.testCases.tableFilter',
  testPlatforms: 'quality.testCases.platformFilter',
  testCaseType: 'quality.testCases.typeFilter',
  testCaseStatus: 'quality.testCases.statusFilter',
  lastRunRange: 'quality.testCases.lastRunFilter',
  tier: 'quality.testCases.tierFilter',
  tags: 'quality.testCases.tagFilter',
  serviceName: 'quality.testCases.serviceFilter',
  dataQualityDimension: 'quality.testCases.dimensionFilter',
  dataProductFqn: 'quality.testCases.dataProductFilter',
};

/** Official TEST_CASE_PLATFORM_OPTION: label is the enum value. */
export const TEST_CASE_PLATFORMS = [
  'OpenMetadata',
  'GreatExpectations',
  'dbt',
  'Deequ',
  'Soda',
  'Other',
] as const;

export const TEST_CASE_MULTI_SELECT = new Set<TestCaseFilterKey>([
  TEST_CASE_FILTER_KEYS.platform,
  TEST_CASE_FILTER_KEYS.status,
  TEST_CASE_FILTER_KEYS.tags,
]);

export function toggleTestCaseFilter(
  selected: readonly TestCaseFilterKey[],
  key: TestCaseFilterKey,
): TestCaseFilterKey[] {
  return selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
}

export function isTestCaseFilterVisible(
  selected: readonly TestCaseFilterKey[],
  key: TestCaseFilterKey,
): boolean {
  return selected.includes(key);
}

/**
 * Official useTestSummaryCards / calculatePercentage(..., 2, true):
 * two-decimal percentage string, including a trailing %.
 */
export function insightPercent(part: number, total: number): string {
  if (!total) {
    return '0%';
  }
  const value = (part / total) * 100;
  return `${value.toFixed(2)}%`;
}

export function requiresSearchPath(filters: {
  testPlatforms?: string | string[];
  lastRunStartTs?: number;
  lastRunEndTs?: number;
  tier?: string;
  serviceName?: string;
  dataQualityDimension?: string;
  dataProductFqn?: string;
}): boolean {
  const platforms = filters.testPlatforms;
  const hasPlatforms = Array.isArray(platforms) ? platforms.length > 0 : Boolean(platforms);
  return Boolean(
    hasPlatforms ||
      filters.lastRunStartTs !== undefined ||
      filters.lastRunEndTs !== undefined ||
      filters.tier ||
      filters.serviceName ||
      filters.dataQualityDimension ||
      filters.dataProductFqn,
  );
}
