import { describe, expect, it } from 'vitest';
import {
  TEST_LIBRARY_PAGE_SIZE,
  TEST_LIBRARY_PAGE_SIZE_OPTIONS,
  TEST_LIBRARY_PLATFORMS,
  filterOptionsByQuery,
  formatTestPlatforms,
  isEnabledToggleDisabled,
  isExternalTestDefinition,
  isSystemTestDefinition,
  pageCount,
  testPlatformLabel,
} from './testLibrary';

describe('testLibrary', () => {
  it('uses official TestPlatform enum values and never a branded OpenMetadata label', () => {
    expect(TEST_LIBRARY_PLATFORMS).toEqual([
      'dbt',
      'Deequ',
      'GreatExpectations',
      'OpenMetadata',
      'Other',
      'Soda',
    ]);
    expect(testPlatformLabel('OpenMetadata')).toBe('OpenMetadata');
    expect(formatTestPlatforms(['OpenMetadata', 'dbt'])).toBe('OpenMetadata, dbt');
    expect(formatTestPlatforms([])).toBe('--');
  });

  it('defaults the list page size to official PAGE_SIZE_BASE and official size options', () => {
    expect(TEST_LIBRARY_PAGE_SIZE).toBe(15);
    expect(TEST_LIBRARY_PAGE_SIZE_OPTIONS).toEqual([10, 15, 25, 50]);
    expect(pageCount(16, 15)).toBe(2);
    expect(pageCount(0, 15)).toBe(1);
  });

  it('treats system provider and external (no OpenMetadata) platforms as official does', () => {
    expect(isSystemTestDefinition({ provider: 'system' })).toBe(true);
    expect(isSystemTestDefinition({ provider: 'user' })).toBe(false);
    expect(isExternalTestDefinition({ testPlatforms: ['dbt'] })).toBe(true);
    expect(isExternalTestDefinition({ testPlatforms: ['OpenMetadata', 'dbt'] })).toBe(false);
    expect(isEnabledToggleDisabled({ testPlatforms: ['GreatExpectations'] })).toBe(true);
    expect(isEnabledToggleDisabled({ testPlatforms: ['OpenMetadata'], provider: 'system' })).toBe(
      false,
    );
  });

  it('filters official entity/platform options by the search box query', () => {
    const options = [
      { key: 'TABLE', label: '数据表' },
      { key: 'COLUMN', label: '列' },
    ];
    expect(filterOptionsByQuery(options, '数')).toEqual([{ key: 'TABLE', label: '数据表' }]);
    expect(filterOptionsByQuery(options, '  ')).toEqual(options);
  });
});
