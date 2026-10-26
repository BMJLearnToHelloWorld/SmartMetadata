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

/**
 * In-repo OpenMetadata console brand-600 / DEFAULT_THEME.primaryColor.
 * #1d4ed8 is only OM @blue-42 (a palette step), not the brand.
 */
export const SM_COLOR_PRIMARY = '#1570ef';
export const SM_COLOR_PRIMARY_HOVER = '#175cd3';
export const SM_COLOR_PRIMARY_ACTIVE = '#1849a9';
export const SM_COLOR_PRIMARY_BG = '#eff8ff';
export const SM_COLOR_PRIMARY_BG_HOVER = '#d1e9ff';
export const SM_COLOR_SUCCESS = '#039855';
export const SM_COLOR_WARNING = '#DC6803';
export const SM_COLOR_ERROR = '#D92D20';

/** OM control radius (UntitledUI rounded-lg). */
export const SM_BORDER_RADIUS = 8;
/** OM card / panel radius (rounded-xl). */
export const SM_RADIUS_CARD = 12;
/** OM dialog radius (rounded-2xl). */
export const SM_RADIUS_MODAL = 16;

export const SM_FONT_SIZE = 14;
export const SM_CONTROL_HEIGHT = 32;

/**
 * Light surfaces from the in-repo OM token contract (`tokens.css` / colors.md).
 * Names stay `--sm-*` in CSS so we do not import OM React or Tailwind.
 */
export const SM_SURFACES = {
  bgBase: '#ffffff',
  bgContainer: '#ffffff',
  bgElevated: '#ffffff',
  contentBg: '#fafafa',
  textPrimary: '#181d27',
  textSecondary: '#414651',
  textTertiary: '#535862',
  textQuaternary: '#717680',
  borderColor: '#d5d7da',
  borderSecondary: '#e9eaeb',
  layoutBg: '#ffffff',
  siderBg: '#ffffff',
  triggerBg: '#fafafa',
  triggerHoverBg: '#f5f5f5',
  menuHoverBg: '#eff8ff',
  rowHoverBg: '#fafafa',
  rowSelectedBg: '#eff8ff',
  tableHeaderBg: '#fafafa',
  overlay: 'rgba(10, 13, 18, 0.55)',
  focusRing: 'rgba(21, 112, 239, 0.22)',
} as const;

const focusShadow = `0 0 0 2px ${SM_SURFACES.focusRing}`;

export const smAntdTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: SM_COLOR_PRIMARY,
    colorPrimaryHover: SM_COLOR_PRIMARY_HOVER,
    colorPrimaryActive: SM_COLOR_PRIMARY_ACTIVE,
    colorPrimaryBg: SM_COLOR_PRIMARY_BG,
    colorPrimaryBgHover: SM_COLOR_PRIMARY_BG_HOVER,
    colorInfo: SM_COLOR_PRIMARY,
    colorLink: SM_COLOR_PRIMARY,
    colorLinkHover: SM_COLOR_PRIMARY_HOVER,
    colorSuccess: SM_COLOR_SUCCESS,
    colorWarning: SM_COLOR_WARNING,
    colorError: SM_COLOR_ERROR,
    borderRadius: SM_BORDER_RADIUS,
    borderRadiusLG: SM_RADIUS_CARD,
    borderRadiusSM: 6,
    fontSize: SM_FONT_SIZE,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    controlHeight: SM_CONTROL_HEIGHT,
    colorBgLayout: SM_SURFACES.contentBg,
    colorBgContainer: SM_SURFACES.bgContainer,
    colorBgElevated: SM_SURFACES.bgElevated,
    colorBgSpotlight: '#181d27',
    colorText: SM_SURFACES.textPrimary,
    colorTextSecondary: SM_SURFACES.textSecondary,
    colorTextTertiary: SM_SURFACES.textTertiary,
    colorTextQuaternary: SM_SURFACES.textQuaternary,
    colorBorder: SM_SURFACES.borderColor,
    colorBorderSecondary: SM_SURFACES.borderSecondary,
    colorFillAlter: SM_SURFACES.rowHoverBg,
    colorFillSecondary: SM_SURFACES.tableHeaderBg,
    controlOutline: SM_SURFACES.focusRing,
    controlOutlineWidth: 2,
    boxShadowSecondary:
      '0 12px 32px rgba(10, 13, 18, 0.12), 0 2px 8px rgba(10, 13, 18, 0.06)',
    motionDurationMid: '0.18s',
    motionDurationSlow: '0.24s',
  },
  components: {
    Button: {
      borderRadius: SM_BORDER_RADIUS,
      controlHeight: SM_CONTROL_HEIGHT,
      fontWeight: 500,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },
    Card: {
      colorBorderSecondary: SM_SURFACES.borderSecondary,
      borderRadiusLG: SM_RADIUS_CARD,
      headerHeight: 48,
      headerFontSize: 16,
    },
    Table: {
      headerBg: SM_SURFACES.tableHeaderBg,
      headerColor: SM_SURFACES.textTertiary,
      headerSplitColor: SM_SURFACES.borderSecondary,
      rowHoverBg: SM_SURFACES.rowHoverBg,
      rowSelectedBg: SM_SURFACES.rowSelectedBg,
      rowSelectedHoverBg: SM_COLOR_PRIMARY_BG_HOVER,
      colorFillAlter: SM_SURFACES.tableHeaderBg,
      colorBorderSecondary: SM_SURFACES.borderSecondary,
      cellPaddingBlock: 10,
      cellPaddingInline: 16,
      cellPaddingBlockSM: 8,
      cellPaddingInlineSM: 12,
      borderRadius: SM_BORDER_RADIUS,
    },
    Modal: {
      borderRadiusLG: SM_RADIUS_MODAL,
      titleFontSize: 16,
      titleLineHeight: 1.4,
      contentBg: SM_SURFACES.bgContainer,
      headerBg: SM_SURFACES.bgContainer,
      footerBg: SM_SURFACES.bgContainer,
    },
    Drawer: {
      colorBgElevated: SM_SURFACES.bgContainer,
      padding: 20,
    },
    Form: {
      labelColor: SM_SURFACES.textSecondary,
      labelFontSize: 13,
      verticalLabelPadding: '0 0 6px',
      itemMarginBottom: 16,
    },
    Menu: {
      itemBorderRadius: SM_BORDER_RADIUS,
      itemHeight: 36,
      itemMarginInline: 8,
      itemMarginBlock: 2,
      itemSelectedBg: SM_COLOR_PRIMARY_BG,
      itemSelectedColor: SM_COLOR_PRIMARY,
      itemHoverBg: SM_SURFACES.rowHoverBg,
      itemHoverColor: SM_SURFACES.textPrimary,
      itemActiveBg: SM_COLOR_PRIMARY_BG_HOVER,
      itemColor: SM_SURFACES.textSecondary,
      subMenuItemBg: 'transparent',
      activeBarBorderWidth: 0,
    },
    Input: {
      colorBorder: SM_SURFACES.borderColor,
      hoverBorderColor: SM_COLOR_PRIMARY,
      activeBorderColor: SM_COLOR_PRIMARY,
      activeShadow: focusShadow,
      borderRadius: SM_BORDER_RADIUS,
    },
    Select: {
      colorBorder: SM_SURFACES.borderColor,
      optionSelectedBg: SM_COLOR_PRIMARY_BG,
      optionSelectedColor: SM_COLOR_PRIMARY,
      optionActiveBg: SM_SURFACES.rowHoverBg,
      borderRadius: SM_BORDER_RADIUS,
    },
    Dropdown: {
      borderRadiusLG: SM_BORDER_RADIUS,
      controlItemBgHover: SM_SURFACES.rowHoverBg,
      controlItemBgActive: SM_COLOR_PRIMARY_BG,
    },
    Popover: {
      borderRadiusLG: SM_RADIUS_CARD,
    },
    Tooltip: {
      borderRadius: 6,
      colorBgSpotlight: '#181d27',
    },
    Tabs: {
      itemColor: SM_SURFACES.textSecondary,
      itemHoverColor: SM_COLOR_PRIMARY,
      itemSelectedColor: SM_COLOR_PRIMARY,
      itemActiveColor: SM_COLOR_PRIMARY_HOVER,
      inkBarColor: SM_COLOR_PRIMARY,
      titleFontSize: 14,
    },
    Pagination: {
      itemActiveBg: SM_COLOR_PRIMARY_BG,
      borderRadius: SM_BORDER_RADIUS,
    },
    Alert: {
      borderRadiusLG: SM_BORDER_RADIUS,
    },
    Message: {
      borderRadiusLG: SM_BORDER_RADIUS,
    },
    Notification: {
      borderRadiusLG: SM_RADIUS_CARD,
    },
    Empty: {
      colorTextDescription: SM_SURFACES.textTertiary,
    },
    Spin: {
      colorPrimary: SM_COLOR_PRIMARY,
    },
    Breadcrumb: {
      itemColor: SM_SURFACES.textTertiary,
      lastItemColor: SM_SURFACES.textPrimary,
      linkColor: SM_COLOR_PRIMARY,
      linkHoverColor: SM_COLOR_PRIMARY_HOVER,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Checkbox: {
      borderRadiusSM: 4,
    },
    Radio: {
      buttonCheckedBg: SM_COLOR_PRIMARY_BG,
    },
  },
};
