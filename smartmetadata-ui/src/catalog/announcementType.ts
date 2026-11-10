/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of the type table in official `utils/AnnouncementsUtils.ts`
 * (`ANNOUNCEMENT_TYPE_CONFIG`, `getAnnouncementTypeConfig`,
 * `getAnnouncementTypeLabel`, `ANNOUNCEMENT_SURFACE_CLASSES`,
 * `ANNOUNCEMENT_STATUS_COLORS`, `ANNOUNCEMENT_STATUS_LABEL_KEYS`):
 * how an announcement *looks* — icon, label and tinted surface — is
 * its `type`, so a Critical announcement reads the same here as on an
 * entity page.
 *
 * Surfaces are written out in full from the product palette
 * (`@/theme/tokens` `SM_PALETTE` tints: background = 25% step, edge =
 * 50% step, text = 100% step) — the same split official's surface
 * table makes, since no token exposes the three steps pre-joined.
 * Families with no 50% step in the palette (red, indigo) take the
 * 100% step as their edge.
 *
 * ADR:2026-11-08-my-data-announcements-rail
 */
import {
  BellOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import {
  SM_COLOR_ERROR_BG,
  SM_COLOR_ERROR_TEXT,
  SM_COLOR_SUCCESS_TEXT,
  SM_COLOR_WARNING_TEXT,
  SM_PALETTE,
} from '@/theme/tokens';
import type { Announcement } from '@/types/collaboration';
import type { AnnouncementStatus } from './announcementLifecycle';

export type AnnouncementColorFamily =
  | 'gray'
  | 'brand'
  | 'error'
  | 'warning'
  | 'success'
  | 'gray-blue'
  | 'blue-light'
  | 'blue'
  | 'blue-dark'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'orange';

export type AnnouncementType = 'Critical' | 'Notice' | 'Warning' | 'Deprecation' | 'Custom';

/** Must match the schema's own default, which the server backfills on write. */
export const DEFAULT_ANNOUNCEMENT_TYPE: AnnouncementType = 'Notice';

export interface AnnouncementTypeConfig {
  color: AnnouncementColorFamily;
  /** A Custom announcement's own name, shown in place of `labelKey`. */
  customLabel?: string;
  icon: Component;
  labelKey: string;
}

const ANNOUNCEMENT_TYPE_CONFIG: Record<AnnouncementType, AnnouncementTypeConfig> = {
  Critical: {
    color: 'error',
    icon: ExclamationCircleOutlined,
    labelKey: 'home.announcementCritical',
  },
  Notice: {
    color: 'blue',
    icon: InfoCircleOutlined,
    labelKey: 'home.announcementNotice',
  },
  Warning: {
    color: 'warning',
    icon: WarningOutlined,
    labelKey: 'home.announcementWarning',
  },
  Deprecation: {
    color: 'gray',
    icon: StopOutlined,
    labelKey: 'home.announcementDeprecation',
  },
  Custom: {
    color: 'pink',
    icon: BellOutlined,
    labelKey: 'home.announcementCustom',
  },
};

/**
 * `AnnouncementColor` (schema) and the palette families are the same
 * set. Mapping them explicitly keeps that pinned at compile time — if
 * either list drifts, this record stops type-checking.
 */
const ANNOUNCEMENT_COLORS: Record<string, AnnouncementColorFamily> = {
  Gray: 'gray',
  Brand: 'brand',
  Error: 'error',
  Warning: 'warning',
  Success: 'success',
  GrayBlue: 'gray-blue',
  BlueLight: 'blue-light',
  Blue: 'blue',
  BlueDark: 'blue-dark',
  Indigo: 'indigo',
  Purple: 'purple',
  Pink: 'pink',
  Orange: 'orange',
};

/**
 * Resolves the icon, badge label and palette family an announcement
 * renders with. Only `Custom` honours the stored `color`; every other
 * type derives it from the type so the severity stays readable at a
 * glance.
 */
export function getAnnouncementTypeConfig(
  announcement: Pick<Announcement, 'type' | 'color' | 'customTypeName'>,
): AnnouncementTypeConfig {
  const type = (announcement.type ?? DEFAULT_ANNOUNCEMENT_TYPE) as AnnouncementType;
  const config = ANNOUNCEMENT_TYPE_CONFIG[type] ?? ANNOUNCEMENT_TYPE_CONFIG[DEFAULT_ANNOUNCEMENT_TYPE];
  if (type !== 'Custom') {
    return config;
  }
  return {
    ...config,
    color: (announcement.color && ANNOUNCEMENT_COLORS[announcement.color]) || config.color,
    customLabel: announcement.customTypeName?.trim() || undefined,
  };
}

/** The badge text: a Custom announcement's own name, else the type's label. */
export function getAnnouncementTypeLabel(config: AnnouncementTypeConfig, t: (key: string) => string): string {
  return config.customLabel ?? t(config.labelKey);
}

export interface AnnouncementSurface {
  background: string;
  border: string;
  color: string;
}

export const ANNOUNCEMENT_SURFACE: Record<AnnouncementColorFamily, AnnouncementSurface> = {
  gray: {
    background: SM_PALETTE.gray[25],
    border: SM_PALETTE.gray[50],
    color: SM_PALETTE.gray[100],
  },
  brand: {
    background: SM_PALETTE.skyBlue[25],
    border: SM_PALETTE.skyBlue[50],
    color: SM_PALETTE.primary[100],
  },
  error: {
    background: SM_COLOR_ERROR_BG,
    border: SM_PALETTE.red[100],
    color: SM_COLOR_ERROR_TEXT,
  },
  warning: {
    background: SM_PALETTE.yellow[25],
    border: SM_PALETTE.yellow[50],
    color: SM_COLOR_WARNING_TEXT,
  },
  success: {
    background: SM_PALETTE.brightGreen[25],
    border: SM_PALETTE.brightGreen[50],
    color: SM_COLOR_SUCCESS_TEXT,
  },
  'gray-blue': {
    background: SM_PALETTE.skyBlue[25],
    border: SM_PALETTE.skyBlue[50],
    color: SM_PALETTE.primary[75],
  },
  'blue-light': {
    background: SM_PALETTE.brightBlue[25],
    border: SM_PALETTE.brightBlue[50],
    color: SM_PALETTE.brightBlue[75],
  },
  blue: {
    background: SM_PALETTE.brightBlue[25],
    border: SM_PALETTE.brightBlue[50],
    color: SM_PALETTE.brightBlue[100],
  },
  'blue-dark': {
    background: SM_PALETTE.primary[25],
    border: SM_PALETTE.primary[50],
    color: SM_PALETTE.primary[100],
  },
  indigo: {
    background: SM_PALETTE.skyBlue[25],
    border: SM_PALETTE.skyBlue[50],
    color: SM_PALETTE.indigo[100],
  },
  purple: {
    background: SM_PALETTE.purple[25],
    border: SM_PALETTE.purple[50],
    color: SM_PALETTE.purple[100],
  },
  pink: {
    background: SM_PALETTE.magenta[25],
    border: SM_PALETTE.magenta[50],
    color: SM_PALETTE.magenta[100],
  },
  orange: {
    background: SM_PALETTE.orange[25],
    border: SM_PALETTE.orange[50],
    color: SM_PALETTE.orange[100],
  },
};

/** The Antd Tag colour for the lifecycle pill on a drawer card. */
export const ANNOUNCEMENT_STATUS_COLORS: Record<AnnouncementStatus, string> = {
  Active: 'success',
  Scheduled: 'blue',
  Expired: 'default',
};

export const ANNOUNCEMENT_STATUS_LABEL_KEYS: Record<AnnouncementStatus, string> = {
  Active: 'home.announcementActive',
  Scheduled: 'home.announcementScheduled',
  Expired: 'home.announcementExpired',
};
