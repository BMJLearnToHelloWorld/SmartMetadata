/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Dark-mode preference, Stage 9.
 *
 * The official frontend has no dark-mode settings page: dark styling is
 * Tailwind `dark:` variants driven by a `.dark-mode` theme switch. The
 * product equivalent is this local preference plus the
 * `:root[data-theme='dark']` variable set already present in
 * `styles/theme.css` (Stage 1 hook). Server sync does not exist for this
 * preference — same standing as the sidebar-collapsed preference — and
 * is recorded as a residual, not silently claimed.
 */

export const THEME_STORAGE_KEY = 'sm.theme.v1';

export const THEME_MODES = [
  { id: 'light', labelKey: 'theme.light' },
  { id: 'dark', labelKey: 'theme.dark' },
  { id: 'system', labelKey: 'theme.system' },
] as const;

export type ThemeMode = (typeof THEME_MODES)[number]['id'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((mode) => mode.id === value);
}

export function readThemeMode(storage: Storage): ThemeMode {
  const raw = storage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(raw) ? raw : 'light';
}

/** Pure resolution: system follows the OS preference, light/dark are absolute. */
export function resolveIsDark(mode: ThemeMode, prefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark);
}

/**
 * Applies a mode to the document root (the selector `styles/theme.css`
 * keys its dark variables on) and returns the resolved dark state.
 * Safe to call where `document` is unavailable: it then only resolves.
 */
export function applyThemeMode(mode: ThemeMode, prefersDark: boolean): boolean {
  const isDark = resolveIsDark(mode, prefersDark);
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  return isDark;
}

export function prefersDarkColorScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
