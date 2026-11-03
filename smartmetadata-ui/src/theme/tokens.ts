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
 * iPlatform product palette (owner theme sheet). Primary #005587 at 100%;
 * 75% / 50% / 25% columns are lighter tints for backgrounds and borders.
 * Keep in sync with `src/styles/theme.css` `--sm-*` variables.
 */
export const SM_PALETTE = {
  primary: {
    100: '#005587',
    75: '#4087a9',
    50: '#80afc7',
    25: '#bfd7e6',
  },
  skyBlue: { 100: '#56c4e8', 75: '#86d4ef', 50: '#b6e3f5', 25: '#e7f3fb' },
  brightBlue: { 100: '#00a1de', 75: '#40b9e7', 50: '#80d0ef', 25: '#bfe8f7' },
  brightTeal: { 100: '#00a19c', 75: '#40b9b5', 50: '#80d0ce', 25: '#bfe8e7' },
  teal: { 100: '#007a6b', 75: '#409b90', 50: '#80bcb5', 25: '#bfddda' },
  brightGreen: { 100: '#94c120', 75: '#afd158', 50: '#c9e090', 25: '#e4f0c7' },
  green: { 100: '#008a00', 75: '#40a840', 50: '#80c680', 25: '#bfe3bf' },
  gray: { 100: '#4d4d4f', 75: '#818285', 50: '#b6b7ba', 25: '#eaebeb' },
  yellow: { 100: '#ffc800', 75: '#ffd640', 50: '#ffe480', 25: '#fff2bf' },
  orange: { 100: '#ff8200', 75: '#ffa140', 50: '#ffc180', 25: '#ffe0bf' },
  magenta: { 100: '#e6007e', 75: '#ec409e', 50: '#f280bf', 25: '#f9bfdf' },
  purple: { 100: '#6b2d5c', 75: '#916d87', 50: '#b6a3b0', 25: '#dad2d8' },
  red: { 100: '#e20000' },
  indigo: { 100: '#1a237e' },
} as const;

export const SM_COLOR_PRIMARY = SM_PALETTE.primary[100];
export const SM_COLOR_PRIMARY_HOVER = '#00466d';
export const SM_COLOR_PRIMARY_ACTIVE = '#003d5c';
export const SM_COLOR_PRIMARY_BG = SM_PALETTE.skyBlue[25];
export const SM_COLOR_PRIMARY_BG_HOVER = SM_PALETTE.skyBlue[50];
export const SM_COLOR_SUCCESS = SM_PALETTE.green[100];
export const SM_COLOR_WARNING = SM_PALETTE.orange[100];
export const SM_COLOR_ERROR = SM_PALETTE.red[100];

/** Status / pill surfaces (DQ landing, badges). Keep in sync with theme.css `--sm-color-*-bg/text`. */
export const SM_COLOR_SUCCESS_BG = SM_PALETTE.brightGreen[25];
export const SM_COLOR_SUCCESS_TEXT = '#006b00';
export const SM_COLOR_ERROR_BG = '#fce8e8';
export const SM_COLOR_ERROR_TEXT = '#b80000';
export const SM_COLOR_WARNING_BG = SM_PALETTE.yellow[25];
export const SM_COLOR_WARNING_TEXT = '#c86400';
export const SM_COLOR_WARNING_HIGHLIGHT_BG = SM_PALETTE.orange[25];

/** Text and accents on primary / hero bands. */
export const SM_TEXT_ON_PRIMARY = '#ffffff';
export const SM_TEXT_ON_PRIMARY_MUTED = 'rgba(255, 255, 255, 0.85)';
export const SM_HERO_PATTERN_STRIPE = 'rgba(255, 255, 255, 0.06)';

export const SM_SHADOW_HERO_INPUT = '0 8px 24px rgba(10, 13, 18, 0.12)';
export const SM_SHADOW_CHIP = '0 2px 8px rgba(10, 13, 18, 0.08)';
export const SM_SHADOW_WIDGET = '0 1px 2px rgba(10, 13, 18, 0.04)';

/** Official radius ladder: none/xs/sm/md/lg/xl/2xl/3xl/full. */
export const SM_RADIUS = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
} as const;

/** dev_ui radius: single 6px step for control, card and modal. */
export const SM_BORDER_RADIUS = 6;
export const SM_RADIUS_CARD = SM_BORDER_RADIUS;
export const SM_RADIUS_MODAL = SM_BORDER_RADIUS;

export const SM_FONT_SIZE = 13;

/**
 * Re-added on merge: the theme object below sizes component headers/titles/
 * labels off this ladder (dev_ui's tokens only kept the single base size).
 * Base body text follows dev_ui's 13; component sizes keep these steps.
 */
export const SM_FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  displayXs: 24,
  displaySm: 30,
  displayMd: 36,
  displayLg: 48,
  displayXl: 60,
  display2xl: 72,
} as const;

/** Same stack as the OpenMetadata console: Inter, then Poppins. */
export const SM_FONT_FAMILY = 'Inter, Poppins, sans-serif';
export const SM_CONTROL_HEIGHT = 32;

/** Official spacing ladder (px). */
export const SM_SPACING = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96] as const;

/** Official shadow ladder. Note card (xs) is a single segment in tokens.css. */
export const SM_SHADOWS = {
  xs: '0px 1px 2px rgba(10, 13, 18, 0.05)',
  sm: '0px 1px 3px rgba(10, 13, 18, 0.1), 0px 1px 2px -1px rgba(10, 13, 18, 0.1)',
  md: '0px 4px 6px -1px rgba(10, 13, 18, 0.1), 0px 2px 4px -2px rgba(10, 13, 18, 0.06)',
  lg: '0px 12px 16px -4px rgba(10, 13, 18, 0.08), 0px 4px 6px -2px rgba(10, 13, 18, 0.03)',
  xl: '0px 20px 24px -4px rgba(10, 13, 18, 0.08), 0px 8px 8px -4px rgba(10, 13, 18, 0.03)',
  '2xl': '0px 24px 48px -12px rgba(10, 13, 18, 0.18)',
  '3xl': '0px 32px 64px -12px rgba(10, 13, 18, 0.14)',
} as const;
/** card = shadow-xs, raised = shadow-lg, overlay = shadow-xl (tokens.css). */
export const SM_SHADOW_CARD = SM_SHADOWS.xs;
export const SM_SHADOW_RAISED = SM_SHADOWS.lg;
export const SM_SHADOW_OVERLAY = SM_SHADOWS.xl;

/** Official z-index ladder. */
export const SM_Z = {
  base: 0,
  raised: 1,
  docked: 10,
  sticky: 100,
  dropdown: 1000,
  overlay: 1050,
  modal: 1500,
  popover: 2000,
  toast: 9000,
  max: 9999,
} as const;

/** Official motion ladder + standard ease. */
export const SM_MOTION = {
  instant: '100ms',
  fast: '150ms',
  base: '200ms',
  slow: '300ms',
  slower: '500ms',
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** Official border ladder + hover. */
export const SM_BORDER = {
  primary: '#d5d7da',
  secondary: '#e9eaeb',
  tertiary: '#f5f5f5',
  hover: '#a4a7ae',
} as const;

/** Official background roles. */
export const SM_BACKGROUND = {
  primary: '#ffffff',
  secondary: '#fafafa',
  tertiary: '#f5f5f5',
  quaternary: '#e9eaeb',
  page: '#ffffff',
  canvas: '#fafafa',
  surface: '#ffffff',
} as const;

/** Official text roles. */
export const SM_TEXT = {
  primary: '#181d27',
  secondary: '#414651',
  tertiary: '#535862',
  quaternary: '#717680',
  disabled: '#717680',
  placeholder: '#717680',
  inverse: '#ffffff',
  brand: '#194185',
} as const;

/** Official purple-600 (tokens.css `--om-color-purple-600`). Stage 6 verified. */
export const SM_COLOR_PURPLE_600 = '#6938ef';
/** Official cyan-600 (tokens.css `--om-color-cyan-600`). Stage 6 verified. */
export const SM_COLOR_CYAN_600 = '#088ab2';
/** Official fuchsia-600 (tokens.css `--om-color-fuchsia-600`). Stage 6 verified. */
export const SM_COLOR_FUCHSIA_600 = '#ba24d5';
/** Official visualization chart-blue-1 (tokens.css). */
export const SM_COLOR_CHART_BLUE_1 = '#4689ff';
/**
 * Chart palette. Every slot is now confirmed against tokens.css: brand-600,
 * semantic success, warning, error, purple-600, cyan-600, fuchsia-600 and
 * visualization chart-blue-1. The three scale slots were closed in Stage 6:
 * earlier stages looked only in the `visualization-*` namespace and missed
 * them in the brand scale namespace. The visualization green role lives in
 * SM_COLOR_VISUALIZATION_GREEN, not in this semantic-ordered palette.
 */
export const SM_CHART_COLORS = [
  SM_PALETTE.primary[100],
  SM_PALETTE.brightBlue[100],
  SM_PALETTE.brightTeal[100],
  SM_PALETTE.brightGreen[100],
  SM_PALETTE.orange[100],
  SM_PALETTE.magenta[100],
  SM_PALETTE.purple[100],
  SM_PALETTE.indigo[100],
] as const;

/**
 * Re-added on merge: dev_ui's tokens dropped this export, but DataInsight
 * views import it. Categorical palette, kept verbatim (including the
 * duplicated '#7986CB' at positions 10 and 19); series take colours by
 * index and cycle. Use only for DataInsight categorical charts.
 */
export const SM_DATA_INSIGHT_COLORS = [
  '#E57373',
  '#BA68C8',
  '#64B5F6',
  '#4DB6AC',
  '#81C784',
  '#FFD54F',
  '#FF8A65',
  '#A1887F',
  '#90A4AE',
  '#7986CB',
  '#F06292',
  '#4FC3F7',
  '#FFD740',
  '#AED581',
  '#CE93D8',
  '#B39DDB',
  '#EF5350',
  '#FF7043',
  '#7986CB',
  '#FFCA28',
  '#FFB74D',
  '#A5D6A7',
  '#80CBC4',
  '#F48FB1',
] as const;

export const SM_SURFACES = {
  bgBase: '#ffffff',
  bgContainer: '#ffffff',
  bgElevated: '#f7f8fa',
  contentBg: '#f0f2f5',
  textPrimary: '#181d27',
  textSecondary: '#414651',
  textTertiary: '#535862',
  textQuaternary: '#717680',
  borderColor: '#f0f0f0',
  borderSecondary: '#f0f0f0',
  layoutBg: '#ffffff',
  siderBg: '#ffffff',
  triggerBg: '#f4f4f5',
  triggerHoverBg: '#e3e6e8',
  menuHoverBg: SM_PALETTE.primary[25],
  rowHoverBg: '#f7f8fa',
  rowSelectedBg: SM_PALETTE.primary[25],
  tableHeaderBg: '#f7f8fa',
  overlay: 'rgba(10, 13, 18, 0.55)',
  focusRing: 'rgba(0, 85, 135, 0.22)',
} as const;

const focusShadow = `0 0 0 2px ${SM_SURFACES.focusRing}`;

/**
 * Type boundary, stated plainly: the installed ant-design-vue
 * ThemeConfig type cannot represent several component token keys this
 * console has shipped since before Stage 1 (its ComponentToken is
 * empty, so e.g. Tabs itemColor has "no properties in common"). Those
 * keys are honoured at runtime by Ant's token system — the gap is in
 * the installed type definitions, not in the theme object. The
 * intersection below keeps the object assignable to ConfigProvider's
 * theme prop while preserving the inferred fields tests read. Do not
 * read this cast as proof the keys are in the Ant type definitions.
 */
const smThemeObject = {
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
    borderRadiusSM: SM_RADIUS.sm,
    fontSize: SM_FONT_SIZE,
    fontFamily: SM_FONT_FAMILY,
    controlHeight: SM_CONTROL_HEIGHT,
    colorBgLayout: SM_SURFACES.contentBg,
    colorBgContainer: SM_SURFACES.bgContainer,
    colorBgElevated: SM_SURFACES.bgContainer,
    colorBgSpotlight: SM_SURFACES.textPrimary,
    colorText: SM_SURFACES.textPrimary,
    colorTextSecondary: SM_SURFACES.textSecondary,
    colorTextTertiary: SM_SURFACES.textTertiary,
    colorTextQuaternary: SM_SURFACES.textQuaternary,
    colorTextDisabled: SM_SURFACES.textDisabled,
    colorTextPlaceholder: SM_SURFACES.textPlaceholder,
    colorBorder: SM_SURFACES.borderColor,
    colorBorderSecondary: SM_SURFACES.borderSecondary,
    colorFillAlter: SM_SURFACES.rowHoverBg,
    colorFillSecondary: SM_SURFACES.tableHeaderBg,
    controlOutline: SM_SURFACES.focusRing,
    controlOutlineWidth: 2,
    boxShadow: SM_SHADOW_CARD,
    boxShadowSecondary: SM_SHADOW_RAISED,
    boxShadowTertiary: SM_SHADOW_OVERLAY,
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
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
      headerHeight: 44,
      headerFontSize: SM_FONT_SIZES.sm,
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
      cellPaddingBlock: 8,
      cellPaddingInline: 12,
      cellPaddingBlockSM: 6,
      cellPaddingInlineSM: 10,
      borderRadius: SM_BORDER_RADIUS,
    },
    Modal: {
      borderRadiusLG: SM_RADIUS_MODAL,
      titleFontSize: SM_FONT_SIZES.md,
      titleLineHeight: 1.4,
      contentBg: SM_SURFACES.bgContainer,
      headerBg: SM_SURFACES.bgContainer,
      footerBg: SM_SURFACES.bgContainer,
    },
    Drawer: {
      colorBgElevated: SM_SURFACES.bgContainer,
      padding: 16,
    },
    Form: {
      labelColor: SM_SURFACES.textSecondary,
      labelFontSize: SM_FONT_SIZES.sm,
      verticalLabelPadding: '0 0 4px',
      itemMarginBottom: 12,
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
      borderRadiusLG: SM_RADIUS.lg,
      controlItemBgHover: SM_SURFACES.rowHoverBg,
      controlItemBgActive: SM_COLOR_PRIMARY_BG,
    },
    Popover: {
      borderRadiusLG: SM_RADIUS_CARD,
    },
    Tooltip: {
      borderRadius: SM_BORDER_RADIUS,
      colorBgSpotlight: SM_SURFACES.textPrimary,
    },
    Tabs: {
      itemColor: SM_SURFACES.textSecondary,
      itemHoverColor: SM_COLOR_PRIMARY,
      itemSelectedColor: SM_COLOR_PRIMARY,
      itemActiveColor: SM_COLOR_PRIMARY_HOVER,
      inkBarColor: SM_COLOR_PRIMARY,
      titleFontSize: SM_FONT_SIZES.sm,
      horizontalItemPadding: '10px 0',
      horizontalItemGutter: 20,
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
      dotSize: 18,
    },
    Breadcrumb: {
      itemColor: SM_SURFACES.textTertiary,
      lastItemColor: SM_SURFACES.textPrimary,
      linkColor: SM_COLOR_PRIMARY,
      linkHoverColor: SM_COLOR_PRIMARY_HOVER,
    },
    Tag: {
      borderRadiusSM: SM_RADIUS.sm,
    },
    Checkbox: {
      borderRadiusSM: SM_RADIUS.sm,
    },
    Radio: {
      buttonCheckedBg: SM_COLOR_PRIMARY_BG,
    },
  },
};

export const smAntdTheme = smThemeObject as unknown as ThemeConfig & typeof smThemeObject;
