/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { applyThemeMode, isThemeMode, readThemeMode, resolveIsDark, THEME_MODES } from './themePreference';

describe('themePreference', () => {
  it('resolves light/dark absolutely and system from the OS preference', () => {
    expect(resolveIsDark('light', true)).toBe(false);
    expect(resolveIsDark('dark', false)).toBe(true);
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
  });

  it('rejects unknown stored values and falls back to light', () => {
    expect(isThemeMode('sepia')).toBe(false);
    expect(THEME_MODES.map((mode) => mode.id)).toEqual(['light', 'dark', 'system']);
    const storage = { getItem: () => 'sepia' } as unknown as Storage;
    expect(readThemeMode(storage)).toBe('light');
  });

  it('writes data-theme=dark only when resolved dark', () => {
    expect(applyThemeMode('dark', false)).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(applyThemeMode('light', true)).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
