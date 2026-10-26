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
  SM_SURFACES,
  smAntdTheme,
} from './tokens';

const themeCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../styles/theme.css'),
  'utf8',
);

describe('OM console theme tokens', () => {
  it('uses OM brand-600 #1570ef, not palette #1d4ed8', () => {
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
    expect(smAntdTheme.token?.borderRadius).toBe(8);
    expect(SM_BORDER_RADIUS).toBe(8);
    expect(SM_RADIUS_CARD).toBe(12);
    expect(SM_RADIUS_MODAL).toBe(16);
    expect(SM_FONT_SIZE).toBe(14);
    expect(SM_CONTROL_HEIGHT).toBe(32);
  });

  it('maps OM light surfaces (canvas #fafafa, text #181d27, border #d5d7da)', () => {
    expect(SM_SURFACES.contentBg).toBe('#fafafa');
    expect(SM_SURFACES.bgContainer).toBe('#ffffff');
    expect(SM_SURFACES.bgElevated).toBe('#ffffff');
    expect(SM_SURFACES.textPrimary).toBe('#181d27');
    expect(SM_SURFACES.textSecondary).toBe('#414651');
    expect(SM_SURFACES.borderColor).toBe('#d5d7da');
    expect(SM_SURFACES.borderSecondary).toBe('#e9eaeb');
    expect(SM_SURFACES.rowHoverBg).toBe('#fafafa');
    expect(SM_SURFACES.rowSelectedBg).toBe('#eff8ff');
    expect(smAntdTheme.token?.colorBgLayout).toBe(SM_SURFACES.contentBg);
    expect(smAntdTheme.token?.colorBorder).toBe(SM_SURFACES.borderColor);
    expect(smAntdTheme.token?.colorFillAlter).toBe(SM_SURFACES.rowHoverBg);
    expect(Array.isArray(smAntdTheme.algorithm)).toBe(false);
  });

  it('polishes Table Modal Card Form Menu Input Select Tabs Dropdown globally', () => {
    expect(smAntdTheme.components?.Table?.rowHoverBg).toBe(SM_SURFACES.rowHoverBg);
    expect(smAntdTheme.components?.Table?.rowSelectedBg).toBe(SM_SURFACES.rowSelectedBg);
    expect(smAntdTheme.components?.Table?.headerBg).toBe(SM_SURFACES.tableHeaderBg);
    expect(smAntdTheme.components?.Card?.borderRadiusLG).toBe(SM_RADIUS_CARD);
    expect(smAntdTheme.components?.Modal?.borderRadiusLG).toBe(SM_RADIUS_MODAL);
    expect(smAntdTheme.components?.Form?.labelColor).toBe(SM_SURFACES.textSecondary);
    expect(smAntdTheme.components?.Menu?.itemSelectedBg).toBe(SM_COLOR_PRIMARY_BG);
    expect(smAntdTheme.components?.Menu?.itemSelectedColor).toBe(SM_COLOR_PRIMARY);
    expect(smAntdTheme.components?.Button?.primaryShadow).toBe('none');
    expect(smAntdTheme.components?.Input?.activeShadow).toContain(SM_SURFACES.focusRing);
    expect(smAntdTheme.components?.Select?.optionSelectedBg).toBe(SM_COLOR_PRIMARY_BG);
    expect(smAntdTheme.components?.Tabs?.inkBarColor).toBe(SM_COLOR_PRIMARY);
    expect(smAntdTheme.components?.Dropdown?.controlItemBgHover).toBe(SM_SURFACES.rowHoverBg);
    expect(smAntdTheme.components?.Drawer?.colorBgElevated).toBe(SM_SURFACES.bgContainer);
    expect(smAntdTheme.components?.Tooltip?.colorBgSpotlight).toBe('#181d27');
    expect(smAntdTheme.components?.Empty?.colorTextDescription).toBe(SM_SURFACES.textTertiary);
  });

  it('exposes --sm-* OM variables, interaction CSS, and a data-theme hook with no Settings UI', () => {
    expect(themeCss).toContain('--sm-content-bg: #fafafa');
    expect(themeCss).toContain('--sm-color-primary: #1570ef');
    expect(themeCss).not.toContain('#005587');
    expect(themeCss).toContain('--sm-border-radius: 8px');
    expect(themeCss).toContain('--sm-radius-modal: 16px');
    expect(themeCss).toMatch(/:root\[data-theme=['"]dark['"]\]/);
    expect(themeCss).toContain('.ant-modal');
    expect(themeCss).toContain('.ant-modal-mask');
    expect(themeCss).toContain('.ant-drawer');
    expect(themeCss).toContain('.ant-card');
    expect(themeCss).toContain('.ant-table-tbody > tr.ant-table-row:hover');
    expect(themeCss).toContain('.ant-dropdown');
    expect(themeCss).toContain('.ant-tabs');
    expect(themeCss).toContain('.ant-empty-description');
    expect(themeCss).toContain('.ant-form-item-explain-error');
    expect(themeCss).toContain(':focus-visible');
    expect(themeCss).toContain('.ant-btn-primary:not(:disabled):hover');
    expect(themeCss).toContain('.ant-menu-light .ant-menu-item-selected');
  });
});
