/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

function walkVue(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkVue(p, out);
    else if (entry.name.endsWith('.vue')) out.push(p);
  }
  return out;
}
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
  SM_COLOR_WARNING,
  SM_CONTROL_HEIGHT,
  SM_FONT_FAMILY,
  SM_FONT_SIZE,
  SM_MOTION,
  SM_RADIUS,
  SM_RADIUS_CARD,
  SM_RADIUS_MODAL,
  SM_PALETTE,
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

describe('OM console theme tokens + iPlatform soul accents', () => {
  it('uses iPlatform primary #005587 and semantic palette colors', () => {
    expect(SM_PALETTE.primary[100]).toBe('#005587');
    expect(SM_COLOR_PRIMARY).toBe('#005587');
    expect(SM_COLOR_PRIMARY_HOVER).toBe('#00466d');
    expect(SM_COLOR_SUCCESS).toBe('#008a00');
    expect(SM_COLOR_WARNING).toBe('#ff8200');
    expect(SM_COLOR_ERROR).toBe('#e20000');
    expect(smAntdTheme.token?.colorPrimary).toBe('#005587');
    expect(smAntdTheme.token?.colorPrimaryHover).toBe('#00466d');
    expect(smAntdTheme.token?.colorInfo).toBe('#005587');
    expect(smAntdTheme.token?.colorLink).toBe('#005587');
    expect(smAntdTheme.token?.colorSuccess).toBe('#008a00');
    expect(themeCss).toContain('--sm-color-primary: #005587');
    expect(themeCss).toContain('--sm-color-primary-25: #bfd7e6');
  });

  it('uses the product semantic palette (success/warning/error from the iPlatform palette)', () => {
    // Product direction 2026-11-03: the rebuilt product has its own theme,
    // so these lock the dev_ui palette values, not the old official ones.
    // The old SM_COLOR_VISUALIZATION_GREEN concept does not exist in the
    // new palette (dropped by dev_ui; nothing imports it), so it is not
    // asserted here.
    expect(SM_COLOR_SUCCESS).toBe('#008a00');
    expect(SM_COLOR_WARNING).toBe('#ff8200');
    expect(SM_COLOR_ERROR).toBe('#e20000');
    expect(smAntdTheme.token?.colorSuccess).toBe('#008a00');
    expect(themeCss).toContain('--sm-color-success: #008a00');
  });

  it('applies the product radius step (single 6px step for control, card and modal)', () => {
    expect(SM_RADIUS).toEqual({
      none: 0, xs: 2, sm: 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, full: 9999,
    });
    expect(SM_BORDER_RADIUS).toBe(6);
    expect(SM_RADIUS_CARD).toBe(6);
    expect(SM_RADIUS_MODAL).toBe(6);
    expect(smAntdTheme.token?.borderRadius).toBe(6);
    expect(smAntdTheme.token?.borderRadiusLG).toBe(6);
    expect(smAntdTheme.token?.borderRadiusSM).toBe(4);
    expect(smAntdTheme.components?.Card?.borderRadiusLG).toBe(6);
    expect(smAntdTheme.components?.Modal?.borderRadiusLG).toBe(6);
    expect(themeCss).toContain('--sm-radius-card: 6px');
    expect(themeCss).toContain('--sm-radius-modal: 6px');
  });

  it('uses the product font sizes (base 13, component ladder steps intact)', () => {
    expect(SM_FONT_SIZE).toBe(13);
    expect(SM_FONT_FAMILY).toContain('Poppins');
    expect(smAntdTheme.token?.fontSize).toBe(13);
    expect(smAntdTheme.components?.Form?.labelFontSize).toBe(14);
    expect(smAntdTheme.components?.Modal?.titleFontSize).toBe(16);
    expect(SM_CONTROL_HEIGHT).toBe(32);
    expect(smAntdTheme.token?.controlHeight).toBe(32);
  });

  it('layers iPlatform-inspired neutrals without dropping OM text / selected chrome', () => {
    expect(SM_SURFACES.contentBg).toBe('#f0f2f5');
    expect(SM_SURFACES.bgContainer).toBe('#ffffff');
    expect(SM_SURFACES.bgElevated).toBe('#f7f8fa');
    expect(SM_SURFACES.textPrimary).toBe('#181d27');
    expect(SM_SURFACES.textSecondary).toBe('#414651');
    expect(SM_SURFACES.borderColor).toBe('#f0f0f0');
    expect(SM_SURFACES.borderSecondary).toBe('#f0f0f0');
    expect(SM_SURFACES.triggerBg).toBe('#f4f4f5');
    expect(SM_SURFACES.triggerHoverBg).toBe('#e3e6e8');
    expect(SM_SURFACES.tableHeaderBg).toBe('#f7f8fa');
    expect(SM_SURFACES.rowHoverBg).toBe('#f7f8fa');
    expect(SM_SURFACES.rowSelectedBg).toBe(SM_PALETTE.primary[25]);
    expect(SM_SURFACES.siderBg).toBe('#ffffff');
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
    expect(themeCss).toContain('--sm-shadow-card: 0 1px 2px rgba(15, 17, 21, 0.04)');
    expect(themeCss).toContain('--sm-shadow-overlay:');
  });

  it('keeps OM Table Modal Card Form Menu Input Select Tabs Dropdown polish', () => {
    expect(smAntdTheme.components?.Table?.rowHoverBg).toBe(SM_SURFACES.rowHoverBg);
    expect(smAntdTheme.components?.Table?.rowSelectedBg).toBe(SM_SURFACES.rowSelectedBg);
    expect(smAntdTheme.components?.Table?.headerBg).toBe(SM_SURFACES.tableHeaderBg);
    expect(smAntdTheme.components?.Form?.labelColor).toBe(SM_SURFACES.textSecondary);
    expect(smAntdTheme.components?.Menu?.itemSelectedBg).toBe(SM_COLOR_PRIMARY_BG);
    expect(smAntdTheme.components?.Menu?.itemSelectedColor).toBe(SM_COLOR_PRIMARY);
    expect(smAntdTheme.components?.Menu?.itemHeight).toBe(36);
    expect(smAntdTheme.components?.Button?.primaryShadow).toBe('none');
    expect(smAntdTheme.components?.Input?.activeShadow).toContain(SM_SURFACES.focusRing);
    expect(smAntdTheme.components?.Select?.optionSelectedBg).toBe(SM_COLOR_PRIMARY_BG);
    expect(smAntdTheme.components?.Tabs?.inkBarColor).toBe(SM_COLOR_PRIMARY);
    expect(smAntdTheme.components?.Tabs?.horizontalItemPadding).toBe('10px 0');
    expect(smAntdTheme.components?.Tabs?.horizontalItemGutter).toBe(20);
    expect(smAntdTheme.components?.Spin?.dotSize).toBe(18);
    expect(SM_CHART_COLORS[0]).toBe(SM_PALETTE.primary[100]);
    expect(SM_CHART_COLORS).toContain(SM_PALETTE.brightBlue[100]);
    expect(SM_CHART_COLORS).not.toContain('#1677ff');
    expect(smAntdTheme.components?.Dropdown?.controlItemBgHover).toBe(SM_SURFACES.rowHoverBg);
    expect(smAntdTheme.components?.Drawer?.colorBgElevated).toBe(SM_SURFACES.bgContainer);
    expect(smAntdTheme.components?.Tooltip?.colorBgSpotlight).toBe(SM_SURFACES.textPrimary);
    expect(smAntdTheme.components?.Empty?.colorTextDescription).toBe(SM_SURFACES.textTertiary);
  });

  it('mirrors semantic and hero CSS variables in theme.css', () => {
    expect(themeCss).toContain('--sm-color-success-bg:');
    expect(themeCss).toContain('--sm-color-error-text:');
    expect(themeCss).toContain('--sm-text-on-primary:');
    expect(themeCss).toContain('--sm-shadow-hero-input:');
    expect(themeCss).toContain('--sm-shadow-widget:');
  });

  it('scoped Vue styles use --sm-* tokens without hex fallbacks or --ant-* colors', () => {
    const vueFiles = walkVue(join(here, '..'));
    const styleHex = /#[0-9a-fA-F]{3,8}/;
    const smFallback = /var\(--sm-[^)]+,\s*#/;
    const antVar = /var\(--ant-/;
    const offenders: string[] = [];
    for (const file of vueFiles) {
      const text = readFileSync(file, 'utf8');
      const style = text.match(/<style[^>]*scoped[^>]*>([\s\S]*?)<\/style>/);
      if (!style) continue;
      const block = style[1];
      if (styleHex.test(block) || smFallback.test(block) || antVar.test(block)) {
        offenders.push(file.replace(/\\/g, '/').split('/src/')[1] ?? file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps OM chrome CSS (tabs ink, confirm, empty, menu) and a data-theme hook', () => {
    expect(themeCss).toMatch(/:root\[data-theme=['"]dark['"]\]/);
    expect(themeCss).toContain('.ant-modal');
    expect(themeCss).toContain('.ant-card');
    expect(themeCss).toContain('.ant-tabs');
    expect(themeCss).toContain(':focus-visible');
    expect(packageJson).not.toContain('@icore');
    expect(appVue).not.toMatch(/IP3Layout|NaviTab|@icore/);
    expect(appShell).not.toMatch(/IP3Layout|NaviTab|@icore/);
    expect(appShell).toContain(':width="272"');
    // dev_ui shell: light theme is hardcoded; the dark-preference chain
    // (shellPreferences) is not wired in the redesigned shell.
    expect(appShell).toContain(`theme="light"`);
  });
});
