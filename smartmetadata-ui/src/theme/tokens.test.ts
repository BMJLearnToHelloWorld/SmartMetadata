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
  SM_BORDER_RADIUS,
  SM_COLOR_ERROR,
  SM_COLOR_PRIMARY,
  SM_COLOR_PRIMARY_BG,
  SM_COLOR_PRIMARY_HOVER,
  SM_COLOR_SUCCESS,
  SM_COLOR_WARNING,
  SM_CONTROL_HEIGHT,
  SM_FONT_SIZE,
  SM_RADIUS_CARD,
  SM_RADIUS_MODAL,
  SM_CHART_COLORS,
  SM_SHADOW_CARD,
  SM_SHADOW_RAISED,
  SM_SURFACES,
  smAntdTheme,
} from './tokens';

const here = dirname(fileURLToPath(import.meta.url));
const themeCss = readFileSync(join(here, '../styles/theme.css'), 'utf8');
const appShell = readFileSync(join(here, '../layouts/AppShell.vue'), 'utf8');
const appVue = readFileSync(join(here, '../App.vue'), 'utf8');
const packageJson = readFileSync(join(here, '../../package.json'), 'utf8');

describe('OM console theme tokens + iPlatform soul accents', () => {
  it('keeps OM brand-600 #1570ef as primary (not historical #37 / palette #1d4ed8)', () => {
    expect(SM_COLOR_PRIMARY).toBe('#1570ef');
    expect(SM_COLOR_PRIMARY).not.toBe('#005587');
    expect(SM_COLOR_PRIMARY).not.toBe('#1d4ed8');
    expect(SM_COLOR_PRIMARY_HOVER).toBe('#175cd3');
    expect(SM_COLOR_SUCCESS).toBe('#039855');
    expect(SM_COLOR_WARNING).toBe('#DC6803');
    expect(SM_COLOR_ERROR).toBe('#D92D20');
    expect(smAntdTheme.token?.colorPrimary).toBe('#1570ef');
    expect(smAntdTheme.token?.colorPrimaryHover).toBe('#175cd3');
    expect(smAntdTheme.token?.colorInfo).toBe('#1570ef');
    expect(smAntdTheme.token?.colorLink).toBe('#1570ef');
    expect(smAntdTheme.token?.colorSuccess).toBe('#039855');
    expect(themeCss).toContain('--sm-color-primary: #1570ef');
    expect(themeCss).not.toContain('#005587');
  });

  it('applies iPlatform radius-on 6 across control / card / modal', () => {
    expect(SM_BORDER_RADIUS).toBe(6);
    expect(SM_RADIUS_CARD).toBe(6);
    expect(SM_RADIUS_MODAL).toBe(6);
    expect(smAntdTheme.token?.borderRadius).toBe(6);
    expect(smAntdTheme.token?.borderRadiusLG).toBe(6);
    expect(smAntdTheme.token?.borderRadiusSM).toBe(6);
    expect(smAntdTheme.components?.Card?.borderRadiusLG).toBe(6);
    expect(smAntdTheme.components?.Modal?.borderRadiusLG).toBe(6);
    expect(themeCss).toContain('--sm-border-radius: 6px');
    expect(themeCss).toContain('--sm-radius-card: 6px');
    expect(themeCss).toContain('--sm-radius-modal: 6px');
  });

  it('keeps control height 32 and denser form chrome (font 13)', () => {
    expect(SM_FONT_SIZE).toBe(13);
    expect(SM_CONTROL_HEIGHT).toBe(32);
    expect(smAntdTheme.token?.fontSize).toBe(13);
    expect(smAntdTheme.token?.controlHeight).toBe(32);
    expect(smAntdTheme.components?.Form?.itemMarginBottom).toBe(12);
    expect(smAntdTheme.components?.Form?.verticalLabelPadding).toBe('0 0 4px');
    expect(smAntdTheme.components?.Card?.headerHeight).toBe(44);
    expect(smAntdTheme.components?.Table?.cellPaddingBlock).toBe(8);
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
    expect(SM_SURFACES.rowSelectedBg).toBe('#eff8ff');
    expect(SM_SURFACES.siderBg).toBe('#ffffff');
    expect(smAntdTheme.token?.colorBgLayout).toBe(SM_SURFACES.contentBg);
    expect(smAntdTheme.token?.colorBgElevated).toBe(SM_SURFACES.bgContainer);
    expect(smAntdTheme.token?.colorBorder).toBe(SM_SURFACES.borderColor);
    expect(smAntdTheme.token?.colorFillAlter).toBe(SM_SURFACES.rowHoverBg);
    expect(Array.isArray(smAntdTheme.algorithm)).toBe(false);
    expect(themeCss).toContain('--sm-content-bg: #f0f2f5');
    expect(themeCss).toContain('--sm-bg-elevated: #f7f8fa');
    expect(themeCss).toContain('--sm-border-color: #f0f0f0');
  });

  it('adds iPlatform-like raised / card shadows on the shared theme', () => {
    expect(SM_SHADOW_CARD).toMatch(/rgba\(15, 17, 21/);
    expect(SM_SHADOW_RAISED).toMatch(/rgba\(15, 17, 21/);
    expect(smAntdTheme.token?.boxShadow).toBe(SM_SHADOW_CARD);
    expect(smAntdTheme.token?.boxShadowSecondary).toBe(SM_SHADOW_RAISED);
    expect(themeCss).toContain('--sm-shadow-card:');
    expect(themeCss).toContain('--sm-shadow-raised:');
    expect(themeCss).toContain('box-shadow: var(--sm-shadow-card)');
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
    expect(SM_CHART_COLORS[0]).toBe(SM_COLOR_PRIMARY);
    expect(SM_CHART_COLORS).not.toContain('#1677ff');
    expect(smAntdTheme.components?.Dropdown?.controlItemBgHover).toBe(SM_SURFACES.rowHoverBg);
    expect(smAntdTheme.components?.Drawer?.colorBgElevated).toBe(SM_SURFACES.bgContainer);
    expect(smAntdTheme.components?.Tooltip?.colorBgSpotlight).toBe('#181d27');
    expect(smAntdTheme.components?.Empty?.colorTextDescription).toBe(SM_SURFACES.textTertiary);
  });

  it('keeps OM chrome CSS (tabs ink, confirm, empty, menu) and a data-theme hook', () => {
    expect(themeCss).toMatch(/:root\[data-theme=['"]dark['"]\]/);
    expect(themeCss).toContain('.ant-modal');
    expect(themeCss).toContain('.ant-modal-mask');
    expect(themeCss).toContain('.ant-drawer');
    expect(themeCss).toContain('.ant-card');
    expect(themeCss).toContain('.ant-table-tbody > tr.ant-table-row:hover');
    expect(themeCss).toContain('.ant-dropdown');
    expect(themeCss).toContain('.ant-tabs');
    expect(themeCss).toContain('height: 3px');
    expect(themeCss).toContain('border-bottom-width: 2px');
    expect(themeCss).toContain('.ant-modal-confirm .ant-modal-confirm-btns');
    expect(themeCss).toContain('.sm-confirm-delete');
    expect(themeCss).toContain('.ant-btn-primary.ant-btn-dangerous');
    expect(themeCss).toContain('.ant-empty-description');
    expect(themeCss).toContain('.ant-empty-image');
    expect(themeCss).toContain('.ant-spin-dot');
    expect(themeCss).toContain('.ant-form-item-extra');
    expect(themeCss).toContain('.ant-form-item-explain-error');
    expect(themeCss).toContain(':focus-visible');
    expect(themeCss).toContain('.ant-btn-primary:not(:disabled):hover');
    expect(themeCss).toContain('.ant-menu-light .ant-menu-item-selected');
    expect(themeCss).toContain('.ant-modal .ant-modal-header');
    expect(themeCss).toContain('padding: 12px 16px');
    expect(themeCss).toContain('.ant-card-head');
    expect(themeCss).toContain('min-height: 44px');
  });

  it('does not transplant IP3Layout / NaviTab / @icore or undo AppShell IA', () => {
    expect(packageJson).not.toContain('@icore');
    expect(appVue).not.toMatch(/IP3Layout|NaviTab|@icore/);
    expect(appShell).not.toMatch(/IP3Layout|NaviTab|@icore/);
    expect(appShell).toContain(':width="228"');
    expect(appShell).toContain('height: 56px');
    expect(appShell).toContain('theme="light"');
  });
});
