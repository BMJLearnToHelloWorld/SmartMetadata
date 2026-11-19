/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { UiThemePreference } from '@/types/admin';
import {
  applyCustomThemeCssVars,
  applyCustomThemeToAntdTheme,
  CUSTOM_THEME_MANAGED_VARS,
  effectiveThemeColor,
  EMPTY_FAVICON_HREF,
  hexToRgba,
  resolveBrandImageSrc,
  resolveCustomThemeCssVars,
  resolveFaviconHref,
  ROW_SELECTED_DARK_ALPHA,
} from './customTheme';
import { SM_COLOR_PRIMARY, smAntdTheme } from './tokens';

function pref(theme: Record<string, string | undefined>): UiThemePreference {
  return { customLogoConfig: {}, customTheme: theme };
}

const FULL = pref({
  primaryColor: '#123456',
  hoverColor: '#abcdef',
  selectedColor: '#654321',
  errorColor: '#e00000',
  successColor: '#00a000',
  warningColor: '#ff8800',
  infoColor: '#0000ee',
  panelBackgroundColor: '#f0f0f0',
});

describe('hexToRgba', () => {
  it('converts the iSmart primary to the exact dark-block rgba', () => {
    expect(hexToRgba('#005587', ROW_SELECTED_DARK_ALPHA)).toBe('rgba(0, 85, 135, 0.16)');
    expect(ROW_SELECTED_DARK_ALPHA).toBe(0.16);
  });

  it('expands 3-digit hex and accepts uppercase', () => {
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(hexToRgba('#ABCDEF', 1)).toBe('rgba(171, 205, 239, 1)');
  });

  it('rejects non-hex values', () => {
    expect(hexToRgba('red', 0.16)).toBeUndefined();
    expect(hexToRgba('#12', 0.16)).toBeUndefined();
    expect(hexToRgba('#12345', 0.16)).toBeUndefined();
    expect(hexToRgba('', 0.16)).toBeUndefined();
  });
});

describe('effectiveThemeColor', () => {
  it('treats missing, empty, and blank values as unset', () => {
    expect(effectiveThemeColor(undefined)).toBeUndefined();
    expect(effectiveThemeColor('')).toBeUndefined();
    expect(effectiveThemeColor('   ')).toBeUndefined();
  });

  it('trims a valued color', () => {
    expect(effectiveThemeColor(' #123456 ')).toBe('#123456');
  });
});

describe('resolveCustomThemeCssVars', () => {
  it('resolves nothing without a preference', () => {
    expect(resolveCustomThemeCssVars(undefined, false)).toEqual({});
    expect(resolveCustomThemeCssVars(null, true)).toEqual({});
    expect(resolveCustomThemeCssVars(pref({}), false)).toEqual({});
    expect(
      resolveCustomThemeCssVars(pref({ primaryColor: '', hoverColor: '' }), false)
    ).toEqual({});
  });

  it('maps the light-mode vars and nothing else', () => {
    const vars = resolveCustomThemeCssVars(FULL, false);
    expect(vars).toEqual({
      '--sm-color-primary': '#123456',
      '--sm-brand': '#123456',
      '--sm-color-primary-active': '#654321',
      '--sm-color-primary-bg': '#abcdef',
      '--sm-row-selected-bg': '#abcdef',
      '--sm-color-error': '#e00000',
      '--sm-color-success': '#00a000',
      '--sm-color-warning': '#ff8800',
    });
    // No info var (Q-TH-1), no panel var (store-only), no hover var, no
    // bg-hover var, no derived -bg/-text pairs.
    for (const key of Object.keys(vars)) {
      expect(CUSTOM_THEME_MANAGED_VARS).toContain(key);
    }
  });

  it('derives the dark row var from hoverColor at the same alpha', () => {
    const vars = resolveCustomThemeCssVars(FULL, true);
    expect(vars['--sm-row-selected-bg']).toBe('rgba(171, 205, 239, 0.16)');
    expect(vars['--sm-color-primary-bg']).toBe('#abcdef');
  });

  it('omits the dark row var for an unparseable hoverColor', () => {
    const vars = resolveCustomThemeCssVars(pref({ hoverColor: 'not-a-color' }), true);
    expect(vars['--sm-row-selected-bg']).toBeUndefined();
    expect(vars['--sm-color-primary-bg']).toBe('not-a-color');
  });

  it('maps a partial preference', () => {
    expect(resolveCustomThemeCssVars(pref({ primaryColor: '#123456' }), false)).toEqual({
      '--sm-color-primary': '#123456',
      '--sm-brand': '#123456',
    });
    // infoColor and panelBackgroundColor produce no variables at all.
    expect(
      resolveCustomThemeCssVars(pref({ infoColor: '#0000ee', panelBackgroundColor: '#fff' }), false)
    ).toEqual({});
  });
});

describe('applyCustomThemeCssVars', () => {
  it('sets present vars and removes absent managed vars', () => {
    const root = document.createElement('div');
    root.style.setProperty('--sm-unmanaged', 'keep-me');
    applyCustomThemeCssVars(root, resolveCustomThemeCssVars(FULL, false));
    expect(root.style.getPropertyValue('--sm-color-primary')).toBe('#123456');
    expect(root.style.getPropertyValue('--sm-row-selected-bg')).toBe('#abcdef');
    applyCustomThemeCssVars(root, {});
    expect(root.style.getPropertyValue('--sm-color-primary')).toBe('');
    expect(root.style.getPropertyValue('--sm-row-selected-bg')).toBe('');
    expect(root.style.getPropertyValue('--sm-unmanaged')).toBe('keep-me');
  });
});

describe('applyCustomThemeToAntdTheme', () => {
  const BASE = {
    token: {
      colorPrimary: '#005587',
      colorPrimaryHover: '#00466d',
      colorPrimaryActive: '#003d5c',
      colorPrimaryBg: '#e7f3fb',
      colorPrimaryBgHover: '#b6e3f5',
      colorInfo: '#005587',
      colorLink: '#005587',
      colorLinkHover: '#00466d',
      colorError: '#e20000',
      colorSuccess: '#008a00',
      colorWarning: '#ff8200',
    },
    components: {
      Button: { fontWeight: 500 },
      Table: { headerBg: '#f7f8fa', rowSelectedBg: '#bfd7e6', rowSelectedHoverBg: '#b6e3f5' },
      Menu: { itemSelectedBg: '#e7f3fb', itemSelectedColor: '#005587', itemActiveBg: '#b6e3f5' },
      Tabs: {
        itemHoverColor: '#005587',
        itemSelectedColor: '#005587',
        itemActiveColor: '#00466d',
        inkBarColor: '#005587',
      },
      Breadcrumb: { linkColor: '#005587', linkHoverColor: '#00466d' },
      Spin: { colorPrimary: '#005587' },
      Input: { hoverBorderColor: '#005587', activeBorderColor: '#005587' },
      Select: { optionSelectedBg: '#e7f3fb', optionSelectedColor: '#005587' },
      Pagination: { itemActiveBg: '#e7f3fb' },
      Radio: { buttonCheckedBg: '#e7f3fb' },
      Dropdown: { controlItemBgActive: '#e7f3fb' },
    },
  };

  it('returns the base unchanged when nothing is effectively set', () => {
    expect(applyCustomThemeToAntdTheme(BASE, undefined)).toBe(BASE);
    expect(applyCustomThemeToAntdTheme(BASE, pref({}))).toBe(BASE);
    expect(applyCustomThemeToAntdTheme(BASE, pref({ panelBackgroundColor: '#fff' }))).toBe(BASE);
  });

  it('overlays the full mapping without mutating the base', () => {
    const snapshot = JSON.parse(JSON.stringify(BASE)) as unknown;
    const result = applyCustomThemeToAntdTheme(BASE, FULL);
    expect(result).not.toBe(BASE);
    expect(result.token).toEqual({
      colorPrimary: '#123456',
      colorPrimaryHover: '#00466d',
      colorPrimaryActive: '#654321',
      colorPrimaryBg: '#abcdef',
      colorPrimaryBgHover: '#abcdef',
      colorInfo: '#0000ee',
      colorLink: '#123456',
      colorLinkHover: '#00466d',
      colorError: '#e00000',
      colorSuccess: '#00a000',
      colorWarning: '#ff8800',
    });
    expect(result.components.Table).toEqual({
      headerBg: '#f7f8fa',
      rowSelectedBg: '#abcdef',
      rowSelectedHoverBg: '#abcdef',
    });
    expect(result.components.Menu).toEqual({
      itemSelectedBg: '#abcdef',
      itemSelectedColor: '#123456',
      itemActiveBg: '#abcdef',
    });
    expect(result.components.Tabs).toEqual({
      itemHoverColor: '#123456',
      itemSelectedColor: '#123456',
      itemActiveColor: '#00466d',
      inkBarColor: '#123456',
    });
    expect(result.components.Breadcrumb).toEqual({ linkColor: '#123456', linkHoverColor: '#00466d' });
    expect(result.components.Spin).toEqual({ colorPrimary: '#123456' });
    expect(result.components.Input).toEqual({ hoverBorderColor: '#123456', activeBorderColor: '#123456' });
    expect(result.components.Select).toEqual({ optionSelectedBg: '#abcdef', optionSelectedColor: '#123456' });
    expect(result.components.Pagination).toEqual({ itemActiveBg: '#abcdef' });
    expect(result.components.Radio).toEqual({ buttonCheckedBg: '#abcdef' });
    expect(result.components.Dropdown).toEqual({ controlItemBgActive: '#abcdef' });
    expect(result.components.Button).toEqual({ fontWeight: 500 });
    expect(BASE).toEqual(snapshot);
  });

  it('drives only the active token with selectedColor', () => {
    const result = applyCustomThemeToAntdTheme(BASE, pref({ selectedColor: '#654321' }));
    expect(result.token.colorPrimaryActive).toBe('#654321');
    expect(result.token.colorPrimary).toBe('#005587');
    expect(result.components.Menu).toEqual(BASE.components.Menu);
    expect(result.components.Table).toEqual(BASE.components.Table);
  });

  it('drives only colorInfo with infoColor', () => {
    const result = applyCustomThemeToAntdTheme(BASE, pref({ infoColor: '#0000ee' }));
    expect(result.token.colorInfo).toBe('#0000ee');
    expect(result.token.colorLink).toBe('#005587');
    expect(result.components).toEqual(BASE.components);
  });

  it('overlays the real smAntdTheme shape without mutating it', () => {
    const result = applyCustomThemeToAntdTheme(smAntdTheme, FULL);
    expect(result.token.colorPrimary).toBe('#123456');
    expect(result.components.Table.rowSelectedBg).toBe('#abcdef');
    expect(result.components.Menu.itemSelectedColor).toBe('#123456');
    expect(smAntdTheme.token.colorPrimary).toBe(SM_COLOR_PRIMARY);
    expect(smAntdTheme.components.Table.rowSelectedBg).toBe('#bfd7e6');
  });
});

describe('resolveBrandImageSrc / resolveFaviconHref', () => {
  it('prefers the custom URL and falls back to the bundled asset', () => {
    expect(resolveBrandImageSrc('https://cdn.example/logo.svg', '/bundled.svg')).toBe(
      'https://cdn.example/logo.svg'
    );
    expect(resolveBrandImageSrc('', '/bundled.svg')).toBe('/bundled.svg');
    expect(resolveBrandImageSrc(undefined, '/bundled.svg')).toBe('/bundled.svg');
    expect(resolveBrandImageSrc('   ', '/bundled.svg')).toBe('/bundled.svg');
  });

  it('never falls back to /favicon.png', () => {
    expect(EMPTY_FAVICON_HREF).toBe('data:,');
    expect(resolveFaviconHref('https://cdn.example/f.ico')).toBe('https://cdn.example/f.ico');
    expect(resolveFaviconHref('')).toBe('data:,');
    expect(resolveFaviconHref(undefined)).toBe('data:,');
  });
});
