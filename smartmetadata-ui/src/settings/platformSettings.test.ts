/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { PLATFORM_SETTINGS_SECTIONS, platformSettingsSection } from './platformSettings';

describe('platformSettings registry (D-CFG-3)', () => {
  it('registers the lineage section with pin ids and keys', () => {
    expect(PLATFORM_SETTINGS_SECTIONS).toEqual([
      {
        id: 'lineage',
        titleKey: 'settings.lineage.title',
        descriptionKey: 'settings.lineage.description',
        hasEditView: true,
      },
    ]);
    expect(platformSettingsSection('lineage')?.id).toBe('lineage');
    expect(platformSettingsSection('no-such-section')).toBeUndefined();
  });
});
