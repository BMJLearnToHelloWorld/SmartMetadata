/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Single source of truth for design tokens in this console.
 *
 * Values are mapped from the official OpenMetadata `styles/tokens.css`
 * (Layer 2 `--om-*` aliases over the ui-core globals) in the reference
 * snapshot at main #74. This file is the one place raw values may live;
 * views and shared components must read tokens or the CSS variables in
 * `styles/theme.css`, which mirrors this table, never their own literals.
 *
 * Two deliberate Ant bridges are marked as such and are NOT official
 * tokens: the focus-ring alpha and the modal-mask alpha. The official
 * focus ring is `#2e90fa` and the overlay surface is `#0a0d12`; Ant
 * needs alpha forms for shadows and masks.
 *
 * Unconfirmed mappings are NOT silently locked (see the residual notes
 * on card/modal radius and on control height below).
 */
import { theme } from 'ant-design-vue';
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context';

/** Official brand-600 / bg-brand / brand-700 / brand-800. */
export const SM_COLOR_PRIMARY = '#1570ef';
export const SM_COLOR_PRIMARY_HOVER = '#175cd3';
export const SM_COLOR_PRIMARY_ACTIVE = '#1849a9';
export const SM_COLOR_PRIMARY_BG = '#eff8ff';
export const SM_COLOR_PRIMARY_BG_HOVER = '#d1e9ff';
/** Official semantic success (success-600). NOT the visualization green. */
export const SM_COLOR_SUCCESS = '#079455';
/** Official visualization green-4; a chart role, never a semantic success. */
export const SM_COLOR_VISUALIZATION_GREEN = '#039855';
export const SM_COLOR_WARNING = '#dc6803';
export const SM_COLOR_ERROR = '#d92d20';

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

/** Base control radius = md step of the official ladder. */
export const SM_BORDER_RADIUS = SM_RADIUS.md;
/**
 * Card radius, tentatively xl (12). The product's own earlier comment
 * referenced "OM rounded-xl" for cards; the official Card component lives
 * in the external ui-core package, which is not in this snapshot, so the
 * direct Card source was not located here. Treat xl as the working
 * mapping and the direct-source confirmation as residual.
 */
export const SM_RADIUS_CARD = SM_RADIUS.xl;
/**
 * Dialog radius, tentatively 2xl (16), on the same basis as the card
 * note above ("OM rounded-2xl" in the earlier product comment). Direct
 * Modal source confirmation is residual.
 */
export const SM_RADIUS_MODAL = SM_RADIUS['2xl'];

/** Official font-size ladder (px). Base text = sm (14); 13 is off-ladder. */
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
export const SM_FONT_SIZE = SM_FONT_SIZES.sm;
/** Official line-height ladder. */
export const SM_LINE_HEIGHTS = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
} as const;
/**
 * Official sans stack (Inter, Poppins, system fallbacks). Inter variable
 * font files are not bundled in this console, so this is the family
 * stack only; variable-font file loading is residual, not claimed here.
 */
export const SM_FONT_FAMILY =
  "'Inter', 'Poppins', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
export const SM_FONT_FAMILY_MONO =
  "ui-monospace, 'Roboto Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
/**
 * Control height. No official control-height standard was located in the
 * reference snapshot (the antd-master Less is transitional), so 32 is
 * retained only as the Ant bridge value and is listed as residual; it is
 * not presented as an official token.
 */
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

/**
 * Chart palette. Only these slots are confirmed against tokens.css:
 * brand-600, semantic success, warning, error, and visualization
 * chart-blue-1 (#4689ff). The #6938ef / #088ab2 / #ba24d5 slots were not
 * found among the official visualization tokens and stay residual:
 * they are kept only so existing charts do not change hue silently, and
 * must not be cited as official. The visualization green role lives in
 * SM_COLOR_VISUALIZATION_GREEN, not in this semantic-ordered palette.
 */
export const SM_CHART_COLORS = [
  SM_COLOR_PRIMARY,
  SM_COLOR_SUCCESS,
  SM_COLOR_WARNING,
  SM_COLOR_ERROR,
  '#6938ef',
  '#088ab2',
  '#ba24d5',
  '#4689ff',
] as const;

export const SM_SURFACES = {
  bgBase: SM_BACKGROUND.primary,
  bgContainer: SM_BACKGROUND.primary,
  /** Former #f7f8fa had no official role; mapped to bg-secondary. */
  bgElevated: SM_BACKGROUND.secondary,
  /** Former #f0f2f5 had no official role; mapped to bg-canvas. */
  contentBg: SM_BACKGROUND.canvas,
  textPrimary: SM_TEXT.primary,
  textSecondary: SM_TEXT.secondary,
  textTertiary: SM_TEXT.tertiary,
  textQuaternary: SM_TEXT.quaternary,
  textDisabled: SM_TEXT.disabled,
  textPlaceholder: SM_TEXT.placeholder,
  textInverse: SM_TEXT.inverse,
  borderColor: SM_BORDER.primary,
  borderSecondary: SM_BORDER.secondary,
  borderTertiary: SM_BORDER.tertiary,
  borderHover: SM_BORDER.hover,
  layoutBg: SM_BACKGROUND.page,
  siderBg: SM_BACKGROUND.surface,
  triggerBg: SM_BACKGROUND.tertiary,
  triggerHoverBg: SM_BACKGROUND.quaternary,
  menuHoverBg: SM_COLOR_PRIMARY_BG,
  rowHoverBg: SM_BACKGROUND.secondary,
  rowSelectedBg: SM_COLOR_PRIMARY_BG,
  tableHeaderBg: SM_BACKGROUND.secondary,
  /** Ant bridge alpha of the official overlay surface #0a0d12. */
  overlay: 'rgba(10, 13, 18, 0.55)',
  /** Ant bridge alpha of the official focus ring #2e90fa. */
  focusRing: 'rgba(21, 112, 239, 0.22)',
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
    fontFamilyCode: SM_FONT_FAMILY_MONO,
    controlHeight: SM_CONTROL_HEIGHT,
    colorBgLayout: SM_SURFACES.contentBg,
    colorBgContainer: SM_SURFACES.bgContainer,
    colorBgElevated: SM_SURFACES.bgElevated,
    colorBgSpotlight: '#181d27',
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
      colorBgSpotlight: '#181d27',
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
