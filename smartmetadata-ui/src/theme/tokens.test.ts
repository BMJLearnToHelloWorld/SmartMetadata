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
  SM_COLOR_PRIMARY,
  SM_CONTROL_HEIGHT,
  SM_FONT_SIZE,
  SM_SURFACES,
  smAntdTheme,
} from './tokens';

const themeCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../styles/theme.css'),
  'utf8',
);

describe('iPlatform component-style tokens', () => {
  it('uses iPlatform primary #005587 and radius 6 on ConfigProvider tokens', () => {
    expect(SM_COLOR_PRIMARY).toBe('#005587');
    expect(SM_BORDER_RADIUS).toBe(6);
    expect(SM_FONT_SIZE).toBe(13);
    expect(SM_CONTROL_HEIGHT).toBe(32);
    expect(smAntdTheme.token?.colorPrimary).toBe('#005587');
    expect(smAntdTheme.token?.colorInfo).toBe('#005587');
    expect(smAntdTheme.token?.colorLink).toBe('#005587');
    expect(smAntdTheme.token?.borderRadius).toBe(6);
    expect(smAntdTheme.token?.fontSize).toBe(13);
    expect(smAntdTheme.token?.controlHeight).toBe(32);
  });

  it('maps icore light surfaces without compact algorithm', () => {
    expect(SM_SURFACES.contentBg).toBe('#f0f2f5');
    expect(SM_SURFACES.bgContainer).toBe('#ffffff');
    expect(SM_SURFACES.bgElevated).toBe('#f7f8fa');
    expect(SM_SURFACES.textPrimary).toBe('#1f1f1f');
    expect(SM_SURFACES.textSecondary).toBe('#595959');
    expect(SM_SURFACES.borderColor).toBe('#f0f0f0');
    expect(SM_SURFACES.layoutBg).toBe('#ffffff');
    expect(smAntdTheme.token?.colorBgLayout).toBe(SM_SURFACES.contentBg);
    expect(smAntdTheme.token?.colorBorder).toBe(SM_SURFACES.borderColor);
    expect(smAntdTheme.token?.colorFillAlter).toBe(SM_SURFACES.bgElevated);
    expect(Array.isArray(smAntdTheme.algorithm)).toBe(false);
  });

  it('keeps table / card / modal polish on the shared theme, not per-view', () => {
    expect(smAntdTheme.components?.Table?.colorFillAlter).toBe(SM_SURFACES.bgElevated);
    expect(smAntdTheme.components?.Table?.colorBorderSecondary).toBe(SM_SURFACES.borderColor);
    expect(smAntdTheme.components?.Card?.colorBorderSecondary).toBe(SM_SURFACES.borderColor);
    expect(smAntdTheme.components?.Card?.borderRadiusLG).toBe(SM_BORDER_RADIUS);
    expect(smAntdTheme.components?.Modal?.borderRadiusLG).toBe(SM_BORDER_RADIUS);
    expect(smAntdTheme.components?.Input?.colorBorder).toBe(SM_SURFACES.borderColor);
    expect(smAntdTheme.components?.Select?.colorBorder).toBe(SM_SURFACES.borderColor);
  });

  it('exposes --sm-* variables and a data-theme hook with no Settings UI', () => {
    expect(themeCss).toContain('--sm-content-bg: #f0f2f5');
    expect(themeCss).toContain('--sm-color-primary: #005587');
    expect(themeCss).toContain('--sm-border-radius: 6px');
    expect(themeCss).toMatch(/:root\[data-theme=['"]dark['"]\]/);
    expect(themeCss).toContain('.ant-modal');
    expect(themeCss).toContain('.ant-card');
    expect(themeCss).toContain('.ant-table-thead');
  });
});
