/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_SURFACE,
  getAnnouncementTypeConfig,
  getAnnouncementTypeLabel,
} from './announcementType';

describe('announcement type table', () => {
  it('derives colour and label from the type', () => {
    const critical = getAnnouncementTypeConfig({ type: 'Critical' });
    expect(critical.color).toBe('error');
    expect(getAnnouncementTypeLabel(critical, (key) => key)).toBe('home.announcementCritical');
    const notice = getAnnouncementTypeConfig({ type: 'Notice' });
    expect(notice.color).toBe('blue');
    const warning = getAnnouncementTypeConfig({ type: 'Warning' });
    expect(warning.color).toBe('warning');
    const deprecation = getAnnouncementTypeConfig({ type: 'Deprecation' });
    expect(deprecation.color).toBe('gray');
  });

  it('only Custom honours the stored colour and custom name', () => {
    const custom = getAnnouncementTypeConfig({
      type: 'Custom',
      color: 'Success',
      customTypeName: '  Maintenance ',
    });
    expect(custom.color).toBe('success');
    expect(getAnnouncementTypeLabel(custom, (key) => key)).toBe('Maintenance');
    const customDefault = getAnnouncementTypeConfig({ type: 'Custom' });
    expect(customDefault.color).toBe('pink');
    expect(getAnnouncementTypeLabel(customDefault, (key) => key)).toBe('home.announcementCustom');
    // A stored colour on a non-Custom type is ignored.
    expect(getAnnouncementTypeConfig({ type: 'Critical', color: 'Success' }).color).toBe('error');
  });

  it('falls back to Notice for a missing or unknown type', () => {
    expect(getAnnouncementTypeConfig({}).color).toBe('blue');
    expect(getAnnouncementTypeConfig({ type: 'Bogus' }).color).toBe('blue');
  });

  it('gives every palette family a surface from the product palette', () => {
    for (const [family, surface] of Object.entries(ANNOUNCEMENT_SURFACE)) {
      expect(surface.background, family).toMatch(/^#[0-9a-f]{6}$/i);
      expect(surface.border, family).toMatch(/^#[0-9a-f]{6}$/i);
      expect(surface.color, family).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
