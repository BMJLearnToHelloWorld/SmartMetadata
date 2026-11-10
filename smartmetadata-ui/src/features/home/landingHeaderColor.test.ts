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
import type { PersonaPreferences } from '@/types/persona';
import {
  DEFAULT_HEADER_BG_COLOR,
  getLandingPageHeaderTintStyle,
  headerBackgroundColors,
  resolveLandingPageHeaderColor,
} from './landingHeaderColor';

function prefs(personaId: string, headerColor: string): PersonaPreferences[] {
  return [{ personaId, landingPageSettings: { headerColor } }];
}

describe('resolveLandingPageHeaderColor', () => {
  it('offers the eight official swatches plus the default gradient', () => {
    expect(headerBackgroundColors).toHaveLength(8);
    expect(headerBackgroundColors.map((swatch) => swatch.color)).toEqual([
      '#535862',
      '#099250',
      '#1570EF',
      '#444CE7',
      '#6938EF',
      '#BA24D5',
      '#DD2590',
      '#E04F16',
    ]);
    expect(DEFAULT_HEADER_BG_COLOR).toContain('linear-gradient');
  });

  it('prefers the user’s own choice over the persona admin’s', () => {
    expect(
      resolveLandingPageHeaderColor('p1', prefs('p1', '#099250'), prefs('p1', '#1570EF')),
    ).toBe('#099250');
  });

  it('falls back to the persona admin’s choice when the user has none', () => {
    expect(resolveLandingPageHeaderColor('p1', undefined, prefs('p1', '#1570EF'))).toBe(
      '#1570EF',
    );
    expect(resolveLandingPageHeaderColor('p1', prefs('p2', '#099250'), prefs('p1', '#1570EF'))).toBe(
      '#1570EF',
    );
  });

  it('returns undefined without a persona or without any choice', () => {
    expect(resolveLandingPageHeaderColor(undefined, prefs('p1', '#099250'), prefs('p1', '#1570EF'))).toBeUndefined();
    expect(resolveLandingPageHeaderColor('p1', undefined, undefined)).toBeUndefined();
    expect(resolveLandingPageHeaderColor('p1', prefs('p2', '#099250'), prefs('p2', '#1570EF'))).toBeUndefined();
  });
});

describe('getLandingPageHeaderTintStyle', () => {
  it('tints a hex colour as a 89deg wash from 0.08 to 0.2 alpha', () => {
    expect(getLandingPageHeaderTintStyle('#099250')).toEqual({
      backgroundImage:
        'linear-gradient(89deg, rgba(9, 146, 80, 0.08) -2.31%, rgba(9, 146, 80, 0.2) 102.64%)',
    });
  });

  it('expands a 3-digit hex colour', () => {
    expect(getLandingPageHeaderTintStyle('#f0a')?.backgroundImage).toContain(
      'rgba(255, 0, 170, 0.08)',
    );
  });

  it('keeps the default gradient for anything that is not a hex colour', () => {
    expect(getLandingPageHeaderTintStyle(undefined)).toBeUndefined();
    expect(getLandingPageHeaderTintStyle('')).toBeUndefined();
    expect(getLandingPageHeaderTintStyle(DEFAULT_HEADER_BG_COLOR)).toBeUndefined();
    expect(getLandingPageHeaderTintStyle('red')).toBeUndefined();
  });
});
