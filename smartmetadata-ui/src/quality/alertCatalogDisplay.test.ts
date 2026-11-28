import { describe, expect, it } from 'vitest';
import { officialConditionDisplayName } from './alertCatalogDisplay';

describe('officialConditionDisplayName', () => {
  it('keeps official English Test Case trigger labels in any locale', () => {
    expect(officialConditionDisplayName('GetTestCaseStatusUpdates')).toBe(
      'Get Test Case Status Updates',
    );
    expect(officialConditionDisplayName('GetTestCaseStatusUpdatesUnderSuite')).toBe(
      'Get Test Case Status Updates belonging to a Test Suite',
    );
  });

  it('prefers a server-provided displayName and falls back to the rule name', () => {
    expect(officialConditionDisplayName('GetTestCaseStatusUpdates', 'Custom')).toBe('Custom');
    expect(officialConditionDisplayName('UnknownTrigger')).toBe('UnknownTrigger');
  });
});
