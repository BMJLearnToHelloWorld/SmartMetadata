/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SM_BACKGROUND,
  SM_BORDER,
  SM_BORDER_RADIUS,
  SM_CHART_COLORS,
  SM_COLOR_ERROR,
  SM_DATA_INSIGHT_COLORS,
  SM_COLOR_ERROR_700,
  SM_COLOR_ERROR_BG,
  SM_COLOR_PRIMARY,
  SM_COLOR_PRIMARY_ACTIVE,
  SM_COLOR_PRIMARY_BG,
  SM_COLOR_PRIMARY_BG_HOVER,
  SM_COLOR_PRIMARY_HOVER,
  SM_COLOR_SUCCESS,
  SM_COLOR_SUCCESS_700,
  SM_COLOR_SUCCESS_BG,
  SM_COLOR_WARNING_700,
  SM_COLOR_WARNING_BG,
  SM_COLOR_VISUALIZATION_GREEN,
  SM_COLOR_WARNING,
  SM_CONTROL_HEIGHT,
  SM_FONT_FAMILY,
  SM_FONT_SIZE,
  SM_MOTION,
  SM_RADIUS,
  SM_RADIUS_CARD,
  SM_RADIUS_MODAL,
  SM_SHADOW_CARD,
  SM_SHADOW_OVERLAY,
  SM_SHADOW_RAISED,
  SM_SPACING,
  SM_SURFACES,
  SM_TEXT,
  SM_Z,
  smAntdTheme,
} from './tokens';

const here = dirname(fileURLToPath(import.meta.url));
const themeCss = readFileSync(join(here, '../styles/theme.css'), 'utf8');
const appShell = readFileSync(join(here, '../layouts/AppShell.vue'), 'utf8');
const appVue = readFileSync(join(here, '../App.vue'), 'utf8');
const packageJson = readFileSync(join(here, '../../package.json'), 'utf8');

describe('official token mapping (Stage 1)', () => {
  it('keeps OM brand-600 #1570ef as primary, with brand-700/800 hover/active', () => {
    expect(SM_COLOR_PRIMARY).toBe('#1570ef');
    expect(SM_COLOR_PRIMARY_HOVER).toBe('#175cd3');
    expect(SM_COLOR_PRIMARY).not.toBe('#005587');
    expect(SM_COLOR_PRIMARY).not.toBe('#1d4ed8');
    expect(smAntdTheme.token?.colorPrimary).toBe('#1570ef');
    expect(themeCss).toContain('--sm-color-primary: #1570ef');
    expect(themeCss).not.toContain('#005587');
  });

  it('uses semantic success #079455 and keeps visualization green #039855 separate', () => {
    expect(SM_COLOR_SUCCESS).toBe('#079455');
    expect(SM_COLOR_VISUALIZATION_GREEN).toBe('#039855');
    expect(SM_COLOR_SUCCESS).not.toBe(SM_COLOR_VISUALIZATION_GREEN);
    expect(SM_COLOR_WARNING).toBe('#dc6803');
    expect(SM_COLOR_ERROR).toBe('#d92d20');
    expect(smAntdTheme.token?.colorSuccess).toBe('#079455');
    expect(themeCss).toContain('--sm-color-success: #079455');
    expect(themeCss).toContain('--sm-color-visualization-green: #039855');
  });

  it('applies the official radius ladder, with card xl and modal 2xl as working mappings', () => {
    expect(SM_RADIUS).toEqual({
      none: 0, xs: 2, sm: 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, full: 9999,
    });
    expect(SM_BORDER_RADIUS).toBe(6);
    expect(SM_RADIUS_CARD).toBe(12);
    expect(SM_RADIUS_MODAL).toBe(16);
    expect(smAntdTheme.token?.borderRadius).toBe(6);
    expect(smAntdTheme.token?.borderRadiusLG).toBe(12);
    expect(smAntdTheme.token?.borderRadiusSM).toBe(4);
    expect(smAntdTheme.components?.Card?.borderRadiusLG).toBe(12);
    expect(smAntdTheme.components?.Modal?.borderRadiusLG).toBe(16);
    expect(themeCss).toContain('--sm-radius-card: 12px');
    expect(themeCss).toContain('--sm-radius-modal: 16px');
  });

  it('returns font size to the official ladder (base 14, no off-ladder 13)', () => {
    expect(SM_FONT_SIZE).toBe(14);
    expect(SM_FONT_FAMILY).toContain('Poppins');
    expect(smAntdTheme.token?.fontSize).toBe(14);
    expect(smAntdTheme.components?.Form?.labelFontSize).toBe(14);
    expect(smAntdTheme.components?.Modal?.titleFontSize).toBe(16);
    // Control height 32 is an Ant bridge value, not an official token:
    // it is retained and flagged residual, not asserted as official.
    expect(SM_CONTROL_HEIGHT).toBe(32);
    expect(smAntdTheme.token?.controlHeight).toBe(32);
  });

  it('maps borders, backgrounds and text to the official roles', () => {
    expect(SM_BORDER).toEqual({
      primary: '#d5d7da', secondary: '#e9eaeb', tertiary: '#f5f5f5', hover: '#a4a7ae',
    });
    expect(SM_BACKGROUND.canvas).toBe('#fafafa');
    expect(SM_BACKGROUND.secondary).toBe('#fafafa');
    expect(SM_SURFACES.contentBg).toBe('#fafafa');
    expect(SM_SURFACES.bgElevated).toBe('#fafafa');
    expect(SM_SURFACES.borderColor).toBe('#d5d7da');
    expect(SM_SURFACES.borderSecondary).toBe('#e9eaeb');
    expect(SM_TEXT.primary).toBe('#181d27');
    expect(SM_TEXT.secondary).toBe('#414651');
    expect(SM_TEXT.disabled).toBe('#717680');
    expect(SM_TEXT.inverse).toBe('#ffffff');
    expect(smAntdTheme.token?.colorBgLayout).toBe(SM_SURFACES.contentBg);
    expect(smAntdTheme.token?.colorBorder).toBe(SM_SURFACES.borderColor);
    expect(themeCss).toContain('--sm-content-bg: #fafafa');
    expect(themeCss).toContain('--sm-bg-elevated: #fafafa');
    expect(themeCss).toContain('--sm-border-color: #d5d7da');
    expect(themeCss).not.toContain('--sm-content-bg: #f0f2f5');
    expect(themeCss).not.toContain('--sm-border-color: #f0f0f0');
  });

  it('applies the official shadow ladder, z ladder, spacing and motion', () => {
    expect(SM_SHADOW_CARD).toBe('0px 1px 2px rgba(10, 13, 18, 0.05)');
    expect(SM_SHADOW_RAISED).toContain('0px 12px 16px -4px');
    expect(SM_SHADOW_OVERLAY).toContain('0px 20px 24px -4px');
    expect(smAntdTheme.token?.boxShadow).toBe(SM_SHADOW_CARD);
    expect(smAntdTheme.token?.boxShadowSecondary).toBe(SM_SHADOW_RAISED);
    expect(smAntdTheme.token?.boxShadowTertiary).toBe(SM_SHADOW_OVERLAY);
    expect(SM_Z).toMatchObject({ dropdown: 1000, overlay: 1050, modal: 1500, popover: 2000, toast: 9000, max: 9999 });
    expect(SM_SPACING).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96]);
    expect(SM_MOTION).toMatchObject({ instant: '100ms', fast: '150ms', base: '200ms', slow: '300ms', slower: '500ms' });
    expect(smAntdTheme.token?.motionDurationMid).toBe('0.2s');
    expect(smAntdTheme.token?.motionDurationSlow).toBe('0.3s');
    expect(themeCss).toContain('--sm-shadow-card: 0px 1px 2px rgba(10, 13, 18, 0.05)');
    expect(themeCss).toContain('--sm-shadow-overlay:');
  });

  it('puts semantic success in the chart palette and keeps the unconfirmed hues flagged', () => {
    expect(SM_CHART_COLORS[0]).toBe(SM_COLOR_PRIMARY);
    expect(SM_CHART_COLORS[1]).toBe('#079455');
    expect(SM_CHART_COLORS).toContain('#4689ff');
    expect(SM_CHART_COLORS).not.toContain('#1677ff');
  });

  it('locks every chart slot to an official token and transcribes the DataInsight palette', () => {
    // Stage 6 closed the three scale slots: purple-600 / cyan-600 / fuchsia-600
    // in tokens.css, previously missed because they are not `visualization-*`.
    expect(SM_CHART_COLORS).toEqual([
      SM_COLOR_PRIMARY,
      '#079455',
      '#dc6803',
      '#d92d20',
      '#6938ef',
      '#088ab2',
      '#ba24d5',
      '#4689ff',
    ]);
    expect(SM_DATA_INSIGHT_COLORS).toHaveLength(24);
    expect(SM_DATA_INSIGHT_COLORS[0]).toBe('#E57373');
    expect(SM_DATA_INSIGHT_COLORS[23]).toBe('#F48FB1');
    expect(SM_DATA_INSIGHT_COLORS.filter((color) => color === '#7986CB')).toHaveLength(2);
  });

  it('locks theme.css :root to tokens.ts: the CSS file is a mirror, not a second source', () => {
    // R8 single-source lock: tokens.ts is canonical; theme.css must mirror
    // it exactly. Any future drift fails here instead of shipping silently.
    // Parse only the light :root block (the dark block intentionally differs).
    // Note: the file header comment itself mentions :root[data-theme],
    // so anchor on the newline-prefixed block starts, not bare substrings.
    const lightRoot = themeCss.slice(
      themeCss.indexOf('\n:root {'),
      themeCss.indexOf("\n:root[data-theme"),
    );
    const vars = new Map<string, string>();
    for (const match of lightRoot.matchAll(/--sm-([\w-]+):\s*([^;]+);/g)) {
      vars.set(match[1], match[2].trim());
    }
    const expected: Record<string, string> = {
      'bg-base': SM_BACKGROUND.primary,
      'bg-container': SM_BACKGROUND.primary,
      'bg-elevated': SM_BACKGROUND.secondary,
      'content-bg': SM_BACKGROUND.canvas,
      'text-primary': SM_TEXT.primary,
      'text-secondary': SM_TEXT.secondary,
      'text-tertiary': SM_TEXT.tertiary,
      'text-quaternary': SM_TEXT.quaternary,
      'border-color': SM_BORDER.primary,
      'border-secondary': SM_BORDER.secondary,
      'border-tertiary': SM_BORDER.tertiary,
      'border-hover': SM_BORDER.hover,
      'color-primary': SM_COLOR_PRIMARY,
      'color-primary-hover': SM_COLOR_PRIMARY_HOVER,
      'color-primary-active': SM_COLOR_PRIMARY_ACTIVE,
      'color-primary-bg': SM_COLOR_PRIMARY_BG,
      'color-primary-bg-hover': SM_COLOR_PRIMARY_BG_HOVER,
      'color-success': SM_COLOR_SUCCESS,
      'color-visualization-green': SM_COLOR_VISUALIZATION_GREEN,
      'color-warning': SM_COLOR_WARNING,
      'color-error': SM_COLOR_ERROR,
      'color-success-bg': SM_COLOR_SUCCESS_BG,
      'color-success-700': SM_COLOR_SUCCESS_700,
      'color-error-bg': SM_COLOR_ERROR_BG,
      'color-error-700': SM_COLOR_ERROR_700,
      'color-warning-bg': SM_COLOR_WARNING_BG,
      'color-warning-700': SM_COLOR_WARNING_700,
      overlay: SM_SURFACES.overlay,
      'focus-ring': SM_SURFACES.focusRing,
      'border-radius': `${SM_BORDER_RADIUS}px`,
      'radius-none': `${SM_RADIUS.none}px`,
      'radius-xs': `${SM_RADIUS.xs}px`,
      'radius-sm': `${SM_RADIUS.sm}px`,
      'radius-md': `${SM_RADIUS.md}px`,
      'radius-lg': `${SM_RADIUS.lg}px`,
      'radius-xl': `${SM_RADIUS.xl}px`,
      'radius-2xl': `${SM_RADIUS['2xl']}px`,
      'radius-3xl': `${SM_RADIUS['3xl']}px`,
      'radius-full': `${SM_RADIUS.full}px`,
      'radius-card': `${SM_RADIUS_CARD}px`,
      'radius-modal': `${SM_RADIUS_MODAL}px`,
      'shadow-card': SM_SHADOW_CARD,
      'shadow-raised': SM_SHADOW_RAISED,
      'shadow-overlay': SM_SHADOW_OVERLAY,
      'z-base': `${SM_Z.base}`,
      'z-raised': `${SM_Z.raised}`,
      'z-docked': `${SM_Z.docked}`,
      'z-sticky': `${SM_Z.sticky}`,
      'z-dropdown': `${SM_Z.dropdown}`,
      'z-overlay': `${SM_Z.overlay}`,
      'z-modal': `${SM_Z.modal}`,
      'z-popover': `${SM_Z.popover}`,
      'z-toast': `${SM_Z.toast}`,
      'z-max': `${SM_Z.max}`,
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(vars.get(name)).toBe(value);
    }
  });

  it('keeps OM chrome CSS and a data-theme hook, without transplanting @icore', () => {
    expect(themeCss).toMatch(/:root\[data-theme=['"]dark['"]\]/);
    expect(themeCss).toContain('.ant-modal');
    expect(themeCss).toContain('.ant-card');
    expect(themeCss).toContain('.ant-tabs');
    expect(themeCss).toContain(':focus-visible');
    expect(packageJson).not.toContain('@icore');
    expect(appVue).not.toMatch(/IP3Layout|NaviTab|@icore/);
    expect(appShell).not.toMatch(/IP3Layout|NaviTab|@icore/);
    expect(appShell).toContain(':width="228"');
    // Stage 9: the sider theme follows the shell dark preference instead
    // of a hardcoded light theme; light remains the default mode.
    expect(appShell).toContain(`:theme="shellPreferences.isDark ? 'dark' : 'light'"`);
  });
});
