/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import type { UiThemePreference } from '@/types/admin';

/**
 * P-THEME derivation layer (preconditions 07 §4 + R-THEME + Q-TH-2(a)).
 *
 * Pure functions only: the store slice (shellConfig), the App.vue
 * effects, and the Appearance save/reset wiring are integration work
 * outside this batch's ownership. The wiring contract is:
 * - `antdTheme` computed overlays `applyCustomThemeToAntdTheme` over
 *   `smAntdTheme` (algorithm selection unchanged);
 * - a CSS-var effect calls `applyCustomThemeCssVars` with
 *   `resolveCustomThemeCssVars(pref, isDark)` on every pref/dark change;
 * - a favicon effect writes `resolveFaviconHref` to all
 *   `link[rel~=icon]` elements at the App.vue level (login page too).
 *
 * Mapping table (07 §4.3/§4.4, constant-derivation reading — see the
 * discrepancy note below):
 * - primaryColor → token.colorPrimary, token.colorLink; component
 *   tokens taking SM_COLOR_PRIMARY (Menu.itemSelectedColor,
 *   Tabs itemHover/itemSelected/inkBar, Breadcrumb.linkColor,
 *   Spin.colorPrimary, Input/Select hover/active borders);
 *   vars --sm-color-primary, --sm-brand.
 * - selectedColor → token.colorPrimaryActive; var
 *   --sm-color-primary-active. NOTHING else: Menu.itemSelectedBg and
 *   Table.rowSelectedBg are tint surfaces, not this field (§4.4.2).
 * - hoverColor → token.colorPrimaryBg AND token.colorPrimaryBgHover
 *   (same value); component tokens taking SM_COLOR_PRIMARY_BG
 *   (Menu.itemSelectedBg, Select.optionSelectedBg,
 *   Pagination.itemActiveBg, Radio.buttonCheckedBg,
 *   Dropdown.controlItemBgActive); var --sm-color-primary-bg.
 * - hoverColor → Table.rowSelectedBg + --sm-row-selected-bg (Q-TH-2(a),
 *   Bai 2026-11-18 18:34). See the dark-block rule below.
 * - error/success/warning → token.colorError/colorSuccess/
 *   colorWarning + --sm-color-error/success/warning. Derived -bg/-text
 *   pairs do NOT follow.
 * - infoColor → token.colorInfo independently (empty → iSmart default
 *   SM_COLOR_PRIMARY, never official #84caff). NO --sm-color-info var.
 * - panelBackgroundColor → NO mapping, store-only (§4.4.4).
 * - Logos/monogram/favicon → resolveBrandImageSrc / resolveFaviconHref
 *   (non-token consumption, §4.4.9–§4.4.11).
 *
 * Deliberately NOT driven by any field: token.colorPrimaryHover
 * (#00466d) and every token taking SM_COLOR_PRIMARY_HOVER
 * (token.colorLinkHover, Tabs.itemActiveColor,
 * Breadcrumb.linkHoverColor). The §4.3 row-1 listing of colorLinkHover
 * is qualified in the same row: it derives via colorPrimaryHover
 * (§4.4.1), which no field drives. The §4.3 row-2 loose listing of
 * Menu.itemActiveBg/Tabs.itemActiveColor/Breadcrumb.linkHoverColor as
 * selectedColor consumers is corrected by §4.4.2's rule ("不得按名直
 * 配"): Menu.itemActiveBg and Table.rowSelectedHoverBg take
 * SM_COLOR_PRIMARY_BG_HOVER — the colorPrimaryBgHover value — so they
 * follow hoverColor with the same value as colorPrimaryBgHover.
 *
 * Official chain (392b3efd object tree): getThemeConfig backfills 7
 * colors from DEFAULT_THEME and never backfills panelBackgroundColor
 * (utils/ThemeUtils.ts:17-27); the brand mapping is primary→brand-600,
 * hover→brand-100 light tints, selected→brand-700
 * (context/UntitledUIThemeProvider/theme-provider.utils.ts:103-105,
 * :123-125, :162-164, :196-198). The official DEFAULT_THEME values
 * (#1570ef et al.) NEVER enter the product default chain: empty values
 * fall back to the iSmart defaults already in smAntdTheme/theme.css.
 *
 * Q-TH-2(a) DARK-BLOCK RULE (Bai 2026-11-18 18:34; must stay in sync
 * with the comment at theme.css:135 and the note at tokens.ts
 * SM_SURFACES.rowSelectedBg): the dark-block `--sm-row-selected-bg`
 * rgba derives from the effective hoverColor at the SAME alpha (0.16)
 * whenever a custom hoverColor is set; with no custom value the
 * stylesheet's fixed rgba(0, 85, 135, 0.16) stays. Only
 * --sm-row-selected-bg derives — the adjacent --sm-menu-hover-bg rgba
 * on the line above is out of Q-TH-2 scope and stays fixed. An
 * unparseable hoverColor omits the var so the fixed rgba applies.
 */
export const ROW_SELECTED_DARK_ALPHA = 0.16;

/** Effective custom value: a non-empty string (trimmed). Empty/undefined → iSmart default. */
export function effectiveThemeColor(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/**
 * `#rgb`/`#rrggbb` → `rgba(r, g, b, alpha)` in the exact stylesheet
 * format. Returns undefined for anything else; callers omit the var
 * so the stylesheet default applies (never emit a garbage value).
 */
export function hexToRgba(hex: string, alpha: number): string | undefined {
  const match = HEX_COLOR_RE.exec(hex);
  if (!match) {
    return undefined;
  }
  let digits = match[1] as string;
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * CSS variables to set for one preference. Every key is a member of
 * CUSTOM_THEME_MANAGED_VARS; absent managed vars must be removed by
 * the effect (applyCustomThemeCssVars) so the stylesheet defaults —
 * including the dark block — apply again.
 *
 * Dark mode: --sm-row-selected-bg is the hoverColor-derived rgba at
 * ROW_SELECTED_DARK_ALPHA (Q-TH-2(a) dark-block rule). The other vars
 * are theme-independent: the dark block does not redefine them, and an
 * inline custom property overrides both the :root and the dark-block
 * declarations, which is why the row var needs the explicit dark form.
 */
export function resolveCustomThemeCssVars(
  pref: UiThemePreference | undefined | null,
  isDark: boolean
): Record<string, string> {
  const theme = pref?.customTheme;
  const primary = effectiveThemeColor(theme?.primaryColor);
  const selected = effectiveThemeColor(theme?.selectedColor);
  const hover = effectiveThemeColor(theme?.hoverColor);
  const error = effectiveThemeColor(theme?.errorColor);
  const success = effectiveThemeColor(theme?.successColor);
  const warning = effectiveThemeColor(theme?.warningColor);
  // infoColor has no CSS variable (Q-TH-1); panelBackgroundColor is
  // store-only (§4.4.4). Neither appears here by design.

  const vars: Record<string, string> = {};
  if (primary) {
    vars['--sm-color-primary'] = primary;
    vars['--sm-brand'] = primary;
  }
  if (selected) {
    vars['--sm-color-primary-active'] = selected;
  }
  if (hover) {
    vars['--sm-color-primary-bg'] = hover;
    if (isDark) {
      // Q-TH-2(a) dark-block rule: same alpha, derived from hoverColor.
      const derived = hexToRgba(hover, ROW_SELECTED_DARK_ALPHA);
      if (derived) {
        vars['--sm-row-selected-bg'] = derived;
      }
      // Unparseable: omit, so the fixed dark rgba stays.
    } else {
      vars['--sm-row-selected-bg'] = hover;
    }
  }
  if (error) {
    vars['--sm-color-error'] = error;
  }
  if (success) {
    vars['--sm-color-success'] = success;
  }
  if (warning) {
    vars['--sm-color-warning'] = warning;
  }
  return vars;
}

/** Every variable the theme effect owns. Removing one restores its stylesheet default. */
export const CUSTOM_THEME_MANAGED_VARS = [
  '--sm-color-primary',
  '--sm-brand',
  '--sm-color-primary-active',
  '--sm-color-primary-bg',
  '--sm-row-selected-bg',
  '--sm-color-error',
  '--sm-color-success',
  '--sm-color-warning',
] as const;

/**
 * Applies a resolved var map to a root element: set what is present,
 * remove every managed var that is absent (empty custom value → the
 * stylesheet default, light or dark, applies again).
 */
export function applyCustomThemeCssVars(
  root: HTMLElement,
  vars: Record<string, string>
): void {
  for (const name of CUSTOM_THEME_MANAGED_VARS) {
    const value = vars[name];
    if (value !== undefined) {
      root.style.setProperty(name, value);
    } else {
      root.style.removeProperty(name);
    }
  }
}

/**
 * Overlays the effective custom colors over an antd theme object
 * (smAntdTheme shape). Empty/undefined values leave the base untouched;
 * with no effective values the base object is returned unchanged. The
 * base is never mutated: the result, its token, and each touched
 * component section are fresh objects.
 *
 * The cast mirrors tokens.ts's own type-boundary comment: the installed
 * ThemeConfig type cannot represent every component token key, so the
 * overlay works on the runtime shape and returns the caller's type.
 */
export function applyCustomThemeToAntdTheme<T>(
  base: T,
  pref: UiThemePreference | undefined | null
): T {
  const theme = pref?.customTheme;
  const primary = effectiveThemeColor(theme?.primaryColor);
  const selected = effectiveThemeColor(theme?.selectedColor);
  const hover = effectiveThemeColor(theme?.hoverColor);
  const error = effectiveThemeColor(theme?.errorColor);
  const success = effectiveThemeColor(theme?.successColor);
  const warning = effectiveThemeColor(theme?.warningColor);
  const info = effectiveThemeColor(theme?.infoColor);

  const tokenOverrides: Record<string, string> = {};
  if (primary) {
    tokenOverrides.colorPrimary = primary;
    tokenOverrides.colorLink = primary;
  }
  if (selected) {
    tokenOverrides.colorPrimaryActive = selected;
  }
  if (hover) {
    tokenOverrides.colorPrimaryBg = hover;
    tokenOverrides.colorPrimaryBgHover = hover;
  }
  if (error) {
    tokenOverrides.colorError = error;
  }
  if (success) {
    tokenOverrides.colorSuccess = success;
  }
  if (warning) {
    tokenOverrides.colorWarning = warning;
  }
  if (info) {
    tokenOverrides.colorInfo = info;
  }

  const componentOverrides: Record<string, Record<string, string>> = {};
  if (primary) {
    componentOverrides.Menu = { ...(componentOverrides.Menu ?? {}), itemSelectedColor: primary };
    componentOverrides.Tabs = {
      ...(componentOverrides.Tabs ?? {}),
      itemHoverColor: primary,
      itemSelectedColor: primary,
      inkBarColor: primary,
    };
    componentOverrides.Breadcrumb = { ...(componentOverrides.Breadcrumb ?? {}), linkColor: primary };
    componentOverrides.Spin = { ...(componentOverrides.Spin ?? {}), colorPrimary: primary };
    componentOverrides.Input = {
      ...(componentOverrides.Input ?? {}),
      hoverBorderColor: primary,
      activeBorderColor: primary,
    };
    componentOverrides.Select = { ...(componentOverrides.Select ?? {}), optionSelectedColor: primary };
  }
  if (hover) {
    componentOverrides.Menu = {
      ...(componentOverrides.Menu ?? {}),
      itemSelectedBg: hover,
      itemActiveBg: hover,
    };
    componentOverrides.Select = { ...(componentOverrides.Select ?? {}), optionSelectedBg: hover };
    componentOverrides.Pagination = { ...(componentOverrides.Pagination ?? {}), itemActiveBg: hover };
    componentOverrides.Radio = { ...(componentOverrides.Radio ?? {}), buttonCheckedBg: hover };
    componentOverrides.Dropdown = {
      ...(componentOverrides.Dropdown ?? {}),
      controlItemBgActive: hover,
    };
    // Q-TH-2(a): hoverColor also drives the selected-row surface.
    componentOverrides.Table = {
      ...(componentOverrides.Table ?? {}),
      rowSelectedBg: hover,
      rowSelectedHoverBg: hover,
    };
  }

  if (Object.keys(tokenOverrides).length === 0 && Object.keys(componentOverrides).length === 0) {
    return base;
  }

  const input = base as unknown as {
    token?: Record<string, unknown>;
    components?: Record<string, Record<string, unknown> | undefined>;
  };
  const components: Record<string, Record<string, unknown> | undefined> = {
    ...(input.components ?? {}),
  };
  for (const [section, overrides] of Object.entries(componentOverrides)) {
    components[section] = { ...(components[section] ?? {}), ...overrides };
  }
  return {
    ...input,
    token: { ...(input.token ?? {}), ...tokenOverrides },
    components,
  } as unknown as T;
}

/**
 * Brand image source (logo and monogram share this one rule, §4.4.10):
 * a non-empty custom URL wins, otherwise the bundled asset. The onError
 * fallback to the bundled asset is wiring at the <img> (AppShell/Login),
 * mirroring official BrandImage.tsx:64-66.
 */
export function resolveBrandImageSrc(
  customUrl: string | undefined,
  bundledUrl: string
): string {
  return effectiveThemeColor(customUrl) ?? bundledUrl;
}

/** The product's intentional empty favicon (index.html design: avoid SPA fallback mis-answers). */
export const EMPTY_FAVICON_HREF = 'data:,';

/**
 * Favicon href: non-empty custom URL, else `data:,`. NEVER `/favicon.png`
 * (the product has no such asset; official AppRoot.tsx:72-86 falls back
 * to /favicon.png, which the product ruling explicitly rejects).
 */
export function resolveFaviconHref(customUrl: string | undefined): string {
  return effectiveThemeColor(customUrl) ?? EMPTY_FAVICON_HREF;
}
