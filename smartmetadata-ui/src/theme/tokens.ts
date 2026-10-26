/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { theme, type ThemeConfig } from 'ant-design-vue';

/** iPlatform @icore default primary (Provider.vue themeColor fallback). */
export const SM_COLOR_PRIMARY = '#005587';

/** iPlatform radius-on value (Provider.vue token.borderRadius). */
export const SM_BORDER_RADIUS = 6;

export const SM_FONT_SIZE = 13;
export const SM_CONTROL_HEIGHT = 32;

/**
 * Light surfaces from iPlatform `@icore` theme CSS. Names are `--sm-*` in CSS;
 * values stay 1:1 with `--icore-*` so we do not import @icore packages.
 */
export const SM_SURFACES = {
  bgBase: '#ffffff',
  bgContainer: '#ffffff',
  bgElevated: '#f7f8fa',
  contentBg: '#f0f2f5',
  textPrimary: '#1f1f1f',
  textSecondary: '#595959',
  borderColor: '#f0f0f0',
  layoutBg: '#ffffff',
  triggerBg: '#f4f4f5',
  triggerHoverBg: '#e3e6e8',
  menuHoverBg: 'rgba(255, 255, 255, 0.5)',
} as const;

export const smAntdTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: SM_COLOR_PRIMARY,
    colorInfo: SM_COLOR_PRIMARY,
    colorLink: SM_COLOR_PRIMARY,
    borderRadius: SM_BORDER_RADIUS,
    fontSize: SM_FONT_SIZE,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    controlHeight: SM_CONTROL_HEIGHT,
    colorBgLayout: SM_SURFACES.contentBg,
    colorBgContainer: SM_SURFACES.bgContainer,
    colorBgElevated: SM_SURFACES.bgElevated,
    colorText: SM_SURFACES.textPrimary,
    colorTextSecondary: SM_SURFACES.textSecondary,
    colorBorder: SM_SURFACES.borderColor,
    colorBorderSecondary: SM_SURFACES.borderColor,
    colorFillAlter: SM_SURFACES.bgElevated,
  },
  components: {
    Card: {
      colorBorderSecondary: SM_SURFACES.borderColor,
      borderRadiusLG: SM_BORDER_RADIUS,
    },
    Table: {
      colorFillAlter: SM_SURFACES.bgElevated,
      colorBorderSecondary: SM_SURFACES.borderColor,
    },
    Modal: {
      borderRadiusLG: SM_BORDER_RADIUS,
    },
    Input: {
      colorBorder: SM_SURFACES.borderColor,
    },
    Select: {
      colorBorder: SM_SURFACES.borderColor,
    },
  },
};
