/**
 * Official Test Library (数据质量规则) list constants and helpers.
 * Enums and labels follow in-repo official TestPlatform / EntityType and
 * zh-cn/en-us keys. Never use site-branded platform labels such as IQVIA.
 */
export const TEST_LIBRARY_PAGE_SIZE = 15;

/** Official PAGE_SIZE_BASE, PAGE_SIZE_MEDIUM, PAGE_SIZE_LARGE (constants.ts). */
export const TEST_LIBRARY_PAGE_SIZE_OPTIONS = [15, 25, 50] as const;

/**
 * Official TestPlatform enum values, in generated enum order
 * (openmetadata-ui generated/tests/testDefinition.ts).
 */
export const TEST_LIBRARY_PLATFORMS = [
  'dbt',
  'Deequ',
  'GreatExpectations',
  'OpenMetadata',
  'Other',
  'Soda',
] as const;

export type TestLibraryPlatform = (typeof TEST_LIBRARY_PLATFORMS)[number];

/** Official EntityType filter options (TABLE / COLUMN). */
export const TEST_LIBRARY_ENTITY_TYPES = ['TABLE', 'COLUMN'] as const;

/** Official TEST_DEFINITION_FILTERS entity labels (label.table / label.column). */
export function testLibraryEntityTypeLabel(
  key: (typeof TEST_LIBRARY_ENTITY_TYPES)[number],
  translate: (key: string) => string,
): string {
  if (key === 'TABLE') {
    return translate('label.table');
  }
  if (key === 'COLUMN') {
    return translate('label.column');
  }
  return key;
}

export type TestLibraryEntityType = (typeof TEST_LIBRARY_ENTITY_TYPES)[number];

export const TEST_LIBRARY_DEFAULT_SORT_FIELD = 'displayName';
export const TEST_LIBRARY_DEFAULT_SORT_ORDER = 'asc' as const;

export const TEST_LIBRARY_SORT_FIELD_BY_COLUMN: Record<string, string> = {
  name: 'displayName',
  entityType: 'entityType',
  testPlatforms: 'testPlatforms',
};

export const TEST_LIBRARY_COLUMN_BY_SORT_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(TEST_LIBRARY_SORT_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

/** Official in-repo platform label. Live official may rebrand OpenMetadata; never copy that branding. */
export function testPlatformLabel(platform: string): string {
  return platform;
}

export function formatTestPlatforms(platforms: string[] | undefined): string {
  if (!platforms || platforms.length === 0) {
    return '--';
  }
  return platforms.map(testPlatformLabel).join(', ');
}

export function isSystemTestDefinition(definition?: { provider?: string } | null): boolean {
  return definition?.provider === 'system';
}

/**
 * Official isExternalTestDefinition: platforms exist and do not include OpenMetadata.
 * External rows cannot have their enabled toggle flipped.
 */
export function isExternalTestDefinition(definition?: { testPlatforms?: string[] } | null): boolean {
  const platforms = definition?.testPlatforms;
  if (!platforms || platforms.length === 0) {
    return false;
  }
  return !platforms.includes('OpenMetadata');
}

export function isEnabledToggleDisabled(definition?: { testPlatforms?: string[]; provider?: string } | null): boolean {
  return isExternalTestDefinition(definition);
}

export function pageCount(total: number | undefined, pageSize: number): number {
  if (!total || total <= 0 || pageSize <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(total / pageSize));
}

export function filterOptionsByQuery<T extends { label: string }>(options: T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return options;
  }
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
}
