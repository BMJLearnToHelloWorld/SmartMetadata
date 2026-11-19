/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  SoundOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import type {
  AnnouncementColorValue,
  AnnouncementTypeIconKey,
} from './announcementUtils';

/**
 * Presentation mappings for the announcement palette families and
 * type icons. Pin's Tailwind utility classes
 * (ANNOUNCEMENT_SURFACE_CLASSES) do not exist in this product, so
 * each family maps to one base colour from the product palette
 * (SM_PALETTE, dev_ui) and the banner derives its tints from it with
 * `color-mix`. Two families share a base by design: `blue-dark` is
 * the product brand blue, and `warning` is the product orange
 * (SM_COLOR_WARNING), so they coincide with `brand` and `orange`.
 */
export const ANNOUNCEMENT_TYPE_ICONS: Record<AnnouncementTypeIconKey, Component> = {
  'alert-circle': ExclamationCircleOutlined,
  'info-circle': InfoCircleOutlined,
  'alert-triangle': WarningOutlined,
  'slash-circle': StopOutlined,
  announcement: SoundOutlined,
};

/** One SM_PALETTE base per palette family; tints derive via `color-mix`. */
export const ANNOUNCEMENT_FAMILY_BASE: Record<AnnouncementColorValue, string> = {
  gray: '#4d4d4f',
  brand: '#005587',
  error: '#e20000',
  warning: '#ff8200',
  success: '#008a00',
  'gray-blue': '#818285',
  'blue-light': '#56c4e8',
  blue: '#00a1de',
  'blue-dark': '#005587',
  indigo: '#1a237e',
  purple: '#6b2d5c',
  pink: '#e6007e',
  orange: '#ff8200',
};

/**
 * The banner surface for a palette family: a tinted fill, a stronger
 * edge, the base on the icon, and the base on the title (the `full`
 * variant only — the collapsed banner keeps the default text colour).
 */
export function announcementSurfaceStyle(family: AnnouncementColorValue): {
  background: string;
  outline: string;
  iconColor: string;
  titleColor: string;
} {
  const base = ANNOUNCEMENT_FAMILY_BASE[family];
  return {
    background: `color-mix(in srgb, ${base} 8%, white)`,
    outline: `1px solid color-mix(in srgb, ${base} 30%, white)`,
    iconColor: base,
    titleColor: base,
  };
}

/** The antd Tag preset nearest each palette family, for the list type cell. */
export const ANNOUNCEMENT_FAMILY_TAG_COLOR: Record<AnnouncementColorValue, string> = {
  gray: 'default',
  brand: 'blue',
  error: 'red',
  warning: 'gold',
  success: 'green',
  'gray-blue': 'default',
  'blue-light': 'cyan',
  blue: 'blue',
  'blue-dark': 'geekblue',
  indigo: 'geekblue',
  purple: 'purple',
  pink: 'pink',
  orange: 'orange',
};
