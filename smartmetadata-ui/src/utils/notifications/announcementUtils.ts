/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Announcement, AnnouncementType } from '@/types/collaboration';
import { ANNOUNCEMENT_TYPES } from '@/types/collaboration';
import type { AnnouncementFormValues } from '@/types/notifications';
import type { TranslateFn } from './alertUtils';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';

/**
 * Announcement helpers, ported from pin utils/AnnouncementsUtils.ts,
 * utils/platform/systemAnnouncements.utils.ts,
 * constants/platform/systemAnnouncements.constants.ts and
 * components/Modals/AnnouncementModal/announcementFormUtils.ts. Badge
 * colours are palette-family names; the components map them to their
 * own badge styling, since pin's Tailwind surface classes do not
 * transfer. Icons are returned as keys the components map to their
 * icon set.
 */

/** AnnouncementColor (generated/entity/feed/announcement.ts): the schema's palette families. */
export type AnnouncementColorValue =
  | 'blue'
  | 'blue-dark'
  | 'blue-light'
  | 'brand'
  | 'error'
  | 'gray'
  | 'gray-blue'
  | 'indigo'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'success'
  | 'warning';

/**
 * ANNOUNCEMENT_COLORS (AnnouncementsUtils.ts:90-104): the schema colour
 * and the badge palette family are the same names, mapped explicitly
 * so a drift on either side stops type-checking.
 */
export const ANNOUNCEMENT_COLORS: Record<AnnouncementColorValue, AnnouncementColorValue> = {
  gray: 'gray',
  brand: 'brand',
  error: 'error',
  warning: 'warning',
  success: 'success',
  'gray-blue': 'gray-blue',
  'blue-light': 'blue-light',
  blue: 'blue',
  'blue-dark': 'blue-dark',
  indigo: 'indigo',
  purple: 'purple',
  pink: 'pink',
  orange: 'orange',
};

/**
 * ANNOUNCEMENT_COLOR_LABEL_KEYS (AnnouncementsUtils.ts:112-127): the
 * accessible name of each swatch — the hue it is, not where it is used.
 */
export const ANNOUNCEMENT_COLOR_LABEL_KEYS: Record<AnnouncementColorValue, string> = {
  gray: 'label.color-gray',
  brand: 'label.color-brand',
  error: 'label.color-red',
  warning: 'label.color-yellow',
  success: 'label.color-green',
  'gray-blue': 'label.color-blue-gray',
  'blue-light': 'label.color-blue-light',
  blue: 'label.color-blue',
  'blue-dark': 'label.color-dark-blue',
  indigo: 'label.color-indigo',
  purple: 'label.color-purple',
  pink: 'label.color-pink',
  orange: 'label.color-orange',
};

export type AnnouncementTypeIconKey =
  | 'alert-circle'
  | 'info-circle'
  | 'alert-triangle'
  | 'slash-circle'
  | 'announcement';

export interface AnnouncementTypeConfig {
  color: AnnouncementColorValue;
  /** A Custom announcement's own name, shown in place of `labelKey`. */
  customLabel?: string;
  iconKey: AnnouncementTypeIconKey;
  labelKey: string;
}

/** ANNOUNCEMENT_TYPE_CONFIG (AnnouncementsUtils.ts:137-166). */
export const ANNOUNCEMENT_TYPE_CONFIG: Record<AnnouncementType, AnnouncementTypeConfig> = {
  Critical: { color: 'error', iconKey: 'alert-circle', labelKey: 'label.critical' },
  Notice: { color: 'blue', iconKey: 'info-circle', labelKey: 'label.notice' },
  Warning: { color: 'warning', iconKey: 'alert-triangle', labelKey: 'label.warning' },
  Deprecation: { color: 'gray', iconKey: 'slash-circle', labelKey: 'label.deprecation' },
  Custom: { color: 'pink', iconKey: 'announcement', labelKey: 'label.custom' },
};

/** Must match the schema's own default, which the server backfills on write. */
export const DEFAULT_ANNOUNCEMENT_TYPE: AnnouncementType = 'Notice';

/**
 * Severity order, as the form offers them. The generated enum is
 * alphabetical, which would put Custom first. The product's
 * ANNOUNCEMENT_TYPES already holds this order (NT-A1).
 */
export const ANNOUNCEMENT_TYPE_ORDER: readonly AnnouncementType[] = ANNOUNCEMENT_TYPES;

/**
 * CUSTOM_ANNOUNCEMENT_COLORS (AnnouncementsUtils.ts:188-194): the
 * colours the form offers a Custom announcement. The schema accepts
 * every palette family, so an announcement stored with another one
 * still renders — the form just does not offer it for new ones.
 */
export const CUSTOM_ANNOUNCEMENT_COLORS: AnnouncementColorValue[] = [
  'pink',
  'success',
  'orange',
  'blue',
  'error',
];

/** Mirrors `customTypeName.maxLength` in the announcement schema. */
export const CUSTOM_TYPE_NAME_MAX_LENGTH = 64;

/**
 * getAnnouncementTypeConfig (AnnouncementsUtils.ts:204-223). Only
 * `Custom` honours the stored `color`; every other type derives it
 * from the type so the severity stays readable at a glance. A stored
 * colour outside the schema palette falls back to the type default —
 * pin's generated type cannot hold one, the product's loose string
 * can, and an uncoloured badge would read as a mistake.
 */
export const getAnnouncementTypeConfig = (
  announcement: Pick<Announcement, 'type' | 'color' | 'customTypeName'>,
): AnnouncementTypeConfig => {
  const type = (announcement.type ?? DEFAULT_ANNOUNCEMENT_TYPE) as AnnouncementType;
  const config = ANNOUNCEMENT_TYPE_CONFIG[type] ?? ANNOUNCEMENT_TYPE_CONFIG[DEFAULT_ANNOUNCEMENT_TYPE];
  if (type !== 'Custom') {
    return config;
  }
  return {
    ...config,
    color: announcement.color
      ? (ANNOUNCEMENT_COLORS[announcement.color as AnnouncementColorValue] ?? config.color)
      : config.color,
    customLabel: announcement.customTypeName?.trim() || undefined,
  };
};

/** getAnnouncementTypeLabel (AnnouncementsUtils.ts:226-229). */
export const getAnnouncementTypeLabel = (
  config: AnnouncementTypeConfig,
  t: TranslateFn,
): string => config.customLabel ?? t(config.labelKey);

/** isActiveAnnouncement (AnnouncementsUtils.ts:72-76): now strictly inside the window. */
export const isActiveAnnouncement = (startTime: number, endTime: number): boolean => {
  const currentTime = Date.now();
  return currentTime > startTime && currentTime < endTime;
};

/** isScheduledAnnouncement (AnnouncementsUtils.ts:82-83). */
export const isScheduledAnnouncement = (startTime: number): boolean => Date.now() < startTime;

export type AnnouncementStatusValue = 'Active' | 'Expired' | 'Scheduled';

/**
 * getAnnouncementStatus (AnnouncementsUtils.ts:320-330): the server
 * stamps `status` on write, but it is a snapshot — recomputing from
 * the window keeps the list honest between writes.
 */
export const getAnnouncementStatus = (
  announcement: Pick<Announcement, 'startTime' | 'endTime'>,
): AnnouncementStatusValue => {
  const startTime = announcement.startTime ?? 0;
  const endTime = announcement.endTime ?? 0;
  if (isScheduledAnnouncement(startTime)) {
    return 'Scheduled';
  }
  return isActiveAnnouncement(startTime, endTime) ? 'Active' : 'Expired';
};

/** ANNOUNCEMENT_STATUS_COLORS (AnnouncementsUtils.ts:340-347). */
export const ANNOUNCEMENT_STATUS_COLORS: Record<AnnouncementStatusValue, AnnouncementColorValue> = {
  Active: 'success',
  Scheduled: 'blue',
  Expired: 'gray',
};

/**
 * SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS
 * (systemAnnouncements.constants.ts:38-45): the settings list says
 * "Expired" where the asset drawer says "In-active" — here the status
 * sits next to the end date, and the design names it for what happened
 * to the window.
 */
export const SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS: Record<AnnouncementStatusValue, string> = {
  Active: 'label.active',
  Scheduled: 'label.scheduled',
  Expired: 'label.expired',
};

/** Status filter order, as the lifecycle runs. */
export const SYSTEM_ANNOUNCEMENT_STATUS_ORDER: AnnouncementStatusValue[] = [
  'Scheduled',
  'Active',
  'Expired',
];

export const SYSTEM_ANNOUNCEMENT_PAGE_SIZES = [10, 25, 50];

/**
 * SYSTEM_ANNOUNCEMENT_FETCH_LIMIT: the list fetches every matching
 * system announcement in one request and searches and pages them in
 * the browser. Only admins write them, so this is a ceiling far above
 * any real count, not a page size.
 */
export const SYSTEM_ANNOUNCEMENT_FETCH_LIMIT = 1000;

/** The title's length rule, shared by the asset dialog and the settings form. */
export const ANNOUNCEMENT_TITLE_MIN_LENGTH = 5;
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 124;

/** Epoch millis -> the `yyyy-MM-dd` day they fall on in the viewer's zone. */
export const toCalendarDay = (ms: number): string => {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * fromCalendarValue (announcementFormUtils.ts:44-59): the picker's
 * chosen day -> epoch millis. The end date resolves to the *end* of
 * the chosen day, not its start — anchoring it at 00:00 would stop the
 * announcement as the chosen day begins. A cleared field reads back
 * as `null`, which is what makes it fail its required rule.
 */
export const fromCalendarValue = (
  day: string | null,
  boundary: 'start' | 'end' = 'start',
): number | null => {
  if (!day) {
    return null;
  }
  const [year, month, date] = day.split('-').map(Number);
  return boundary === 'end'
    ? new Date(year, month - 1, date, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, date).getTime();
};

/**
 * toAnnouncementTypeFields (announcementFormUtils.ts:66-81): colour
 * and name only mean something on a Custom announcement, so each is
 * dropped outside that case rather than left behind from an earlier
 * selection.
 */
export const toAnnouncementTypeFields = (
  values: Pick<AnnouncementFormValues, 'type' | 'color' | 'customTypeName'>,
): { type: AnnouncementType; color?: string; customTypeName?: string } => {
  const isCustom = values.type === 'Custom';
  return {
    type: values.type,
    color: isCustom ? values.color : undefined,
    customTypeName: isCustom ? values.customTypeName?.trim() || undefined : undefined,
  };
};

/**
 * toPlainDescription (announcementFormUtils.ts:100-114): only a
 * single-paragraph wrapper is unwrapped, and its entities decoded.
 * Anything richer is left verbatim rather than flattened.
 */
export const toPlainDescription = (description?: string): string => {
  const trimmed = description?.trim() ?? '';
  const [, inner] = trimmed.match(/^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/i) ?? [];
  if (inner === undefined || /<[a-z]/i.test(inner)) {
    return trimmed;
  }
  const decoded =
    new DOMParser().parseFromString(inner, 'text/html').body.textContent ?? '';
  return decoded.trim();
};

/**
 * searchSystemAnnouncements (systemAnnouncements.utils.ts:53-68): the
 * announcements whose title contains `search` (case-insensitive; a
 * blank search keeps them all), newest start first.
 */
export const searchSystemAnnouncements = (
  announcements: Announcement[],
  search: string,
): Announcement[] => {
  const term = search.trim().toLowerCase();
  return announcements
    .filter(
      (announcement) =>
        !term ||
        (announcement.displayName ?? announcement.name ?? '')
          .toLowerCase()
          .includes(term),
    )
    .sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
};

/**
 * PATCHED_KEYS (useSystemAnnouncements.ts): the only fields an edit
 * patch carries. displayName joins the asset dialog's six editable
 * keys because the settings form edits the title directly.
 */
export const ANNOUNCEMENT_PATCHED_KEYS = [
  'displayName',
  'description',
  'startTime',
  'endTime',
  'type',
  'color',
  'customTypeName',
] as const;

/** pickPatched: keeps only the patched keys, skipping undefined values. */
export const pickPatchedAnnouncement = (
  request: Record<string, unknown>,
): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const key of ANNOUNCEMENT_PATCHED_KEYS) {
    if (request[key] !== undefined) {
      picked[key] = request[key];
    }
  }
  return picked;
};

/**
 * getColorOptions: the colours the form offers, plus a stored colour
 * outside that list appended so an announcement saved with another
 * stays editable.
 */
export const getAnnouncementColorOptions = (
  storedColor?: string,
): AnnouncementColorValue[] => {
  const options = [...CUSTOM_ANNOUNCEMENT_COLORS];
  if (
    storedColor &&
    (ANNOUNCEMENT_COLORS[storedColor as AnnouncementColorValue] ?? undefined) !== undefined &&
    !options.includes(storedColor as AnnouncementColorValue)
  ) {
    options.push(storedColor as AnnouncementColorValue);
  }
  return options;
};

/**
 * The duplicate's title (P-6): the localized copy suffix first, then
 * truncated to the title's maximum in UTF-16 code units — which may
 * cut a surrogate pair, as in pin.
 */
export const copyAnnouncementTitle = (title: string, t: TranslateFn): string =>
  t('label.entity-copy', { entity: title }).slice(0, ANNOUNCEMENT_TITLE_MAX_LENGTH);

/** SystemAnnouncementFormMode (SystemAnnouncementForm.types.ts). */
export type SystemAnnouncementFormMode = 'create' | 'edit' | 'duplicate';

/**
 * getSystemAnnouncementDefaultValues (SystemAnnouncementForm.utils.ts):
 * create starts empty with both dates null — a prefilled window is a
 * schedule the author never chose. Edit and duplicate start from the
 * stored announcement; a duplicate marks its title as a copy, cut to
 * the title limit. The description is carried verbatim: the settings
 * form does not apply `toPlainDescription` (that unwrapping belongs to
 * the asset dialog's text-area field, not this rich-text form).
 */
export const getSystemAnnouncementDefaultValues = (
  mode: SystemAnnouncementFormMode,
  copyTitle: (title: string) => string,
  announcement?: Announcement,
): AnnouncementFormValues => {
  if (!announcement || mode === 'create') {
    return {
      title: '',
      description: '',
      type: DEFAULT_ANNOUNCEMENT_TYPE,
      startTime: null,
      endTime: null,
    };
  }
  const title = announcement.displayName ?? announcement.name ?? '';
  return {
    title: mode === 'duplicate' ? copyTitle(title) : title,
    description: announcement.description ?? '',
    type: (announcement.type as AnnouncementType) ?? DEFAULT_ANNOUNCEMENT_TYPE,
    color: announcement.color,
    customTypeName: announcement.customTypeName,
    startTime: announcement.startTime ?? null,
    endTime: announcement.endTime ?? null,
  };
};

/**
 * The settings form's validation, mirroring the RHF rules in
 * SystemAnnouncementForm.tsx field by field (mode `onChange`, so the
 * result tracks the fields as they are filled). A field error is a
 * message string, except the title's maxLength breach, which pin's
 * bare-number rule leaves messageless — the hint then falls back to
 * the `n/124` counter while the field stays invalid. `true` marks
 * that case.
 */
export interface AnnouncementFormErrors {
  title?: string | true;
  description?: string;
  startTime?: string;
  endTime?: string;
  color?: string;
  /** Bare-number maxLength rule: invalid with no message, like the title's. */
  customTypeName?: string | true;
}

export const validateAnnouncementForm = (
  values: AnnouncementFormValues,
  t: TranslateFn,
): AnnouncementFormErrors => {
  const errors: AnnouncementFormErrors = {};
  const requiredMessage = (fieldText: string): string =>
    t('message.field-text-is-required', { fieldText });
  const isCustom = values.type === 'Custom';

  if (isCustom) {
    if (values.customTypeName !== undefined && values.customTypeName.length > CUSTOM_TYPE_NAME_MAX_LENGTH) {
      errors.customTypeName = true;
    } else if (!values.customTypeName?.trim()) {
      errors.customTypeName = requiredMessage(t('label.custom-name'));
    }
    if (!values.color) {
      errors.color = requiredMessage(t('label.color'));
    }
  }

  // RHF rule order (react-hook-form 7.78.0 validateField.ts, the pin
  // version): length checks run before `validate` and are skipped only
  // for the empty string — so a blank-but-not-empty title of 1–4
  // spaces fails minLength, while '' and 5+ spaces fail `validate`.
  if (values.title === '') {
    errors.title = requiredMessage(t('label.title'));
  } else if (values.title.length < ANNOUNCEMENT_TITLE_MIN_LENGTH) {
    errors.title = t('message.entity-size-in-between', {
      entity: t('label.title'),
      min: ANNOUNCEMENT_TITLE_MIN_LENGTH,
      max: ANNOUNCEMENT_TITLE_MAX_LENGTH,
    });
  } else if (values.title.length > ANNOUNCEMENT_TITLE_MAX_LENGTH) {
    errors.title = true;
  } else if (!values.title.trim()) {
    errors.title = requiredMessage(t('label.title'));
  }

  if (values.startTime == null) {
    errors.startTime = requiredMessage(t('label.start-date'));
  }
  if (values.endTime == null) {
    errors.endTime = requiredMessage(t('label.end-date'));
  } else if (values.startTime != null && values.endTime <= values.startTime) {
    errors.endTime = t('message.announcement-invalid-start-time');
  }

  if (isDescriptionContentEmpty(values.description)) {
    errors.description = requiredMessage(t('label.description'));
  }

  return errors;
};

/** Whether any field carries an error, including a messageless one. */
export const hasAnnouncementFormErrors = (errors: AnnouncementFormErrors): boolean =>
  Object.keys(errors).length > 0;

/** The settings announcements list path (ROUTES.SETTINGS_ANNOUNCEMENTS). */
export const ANNOUNCEMENTS_LIST_PATH = '/settings/notifications/announcements';

/** The add/edit/duplicate form paths, addressed by announcement id. */
export const getAnnouncementFormPath = (
  mode: SystemAnnouncementFormMode,
  id?: string,
): string =>
  mode === 'create'
    ? `${ANNOUNCEMENTS_LIST_PATH}/add`
    : `${ANNOUNCEMENTS_LIST_PATH}/${mode}/${id ?? ''}`;
