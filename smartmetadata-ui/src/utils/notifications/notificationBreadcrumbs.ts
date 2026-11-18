/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import type { AlertFace } from '@/types/notifications';
import { getEntityName, type TranslateFn } from './alertUtils';

/**
 * 07-local breadcrumb builders following the pin breadcrumb structures.
 * No shell §9 breadcrumb constructors exist in this tree (the shell
 * branch carries that work separately), so these builders are local
 * and flagged in the report for substitution when the shared
 * constructors land. Route names for paths the router does not define
 * yet are the proposed names from the report's route table; the
 * integration line must create them. `admin-settings` (the hub route,
 * alias `settings`) exists today.
 */

export const SETTINGS_HUB_ROUTE_NAME = 'admin-settings';
export const SETTINGS_NOTIFICATIONS_ROUTE_NAME = 'settings-notifications';
export const SETTINGS_NOTIFICATION_ALERTS_ROUTE_NAME = 'settings-notification-alerts';
export const SETTINGS_ANNOUNCEMENTS_ROUTE_NAME = 'settings-announcements';
export const OBSERVABILITY_ALERTS_ROUTE_NAME = 'observability-alerts';

/**
 * Alert detail breadcrumbs (useAlertDetailsData.ts:152-191). Notification:
 * Settings (linked) › Notifications (linked) › Alerts (linked) ›
 * name-or-fqn (unlinked). Observability: Observability (UNLINKED) ›
 * Alerts (linked) › name-or-fqn (unlinked). The unlinked first crumb on
 * the observability face is pin-verbatim, not an omission.
 */
export function getAlertDetailsBreadcrumbs(
  face: AlertFace,
  fqn: string,
  alert: { displayName?: string; name?: string } | undefined,
  t: TranslateFn,
): SmBreadcrumbItem[] {
  const name = getEntityName(alert) || fqn;
  if (face === 'Notification') {
    return [
      { label: t('label.setting-plural'), routeName: SETTINGS_HUB_ROUTE_NAME },
      { label: t('label.notification-plural'), routeName: SETTINGS_NOTIFICATIONS_ROUTE_NAME },
      { label: t('label.alert-plural'), routeName: SETTINGS_NOTIFICATION_ALERTS_ROUTE_NAME },
      { label: name },
    ];
  }
  return [
    { label: t('label.observability') },
    { label: t('label.alert-plural'), routeName: OBSERVABILITY_ALERTS_ROUTE_NAME },
    { label: name },
  ];
}

/**
 * Alert form breadcrumbs (useAlertFormData.ts:133-165). Notification:
 * Settings › Notifications › Alerts › Create/Edit Alert. Observability:
 * Observability (unlinked) › Alerts › Create/Edit Alert. The last crumb
 * is Create when no fqn is being edited, Edit otherwise.
 */
export function getAlertFormBreadcrumbs(
  face: AlertFace,
  isEdit: boolean,
  t: TranslateFn,
): SmBreadcrumbItem[] {
  const last = {
    label: isEdit
      ? t('label.edit-entity', { entity: t('label.alert') })
      : t('label.create-entity', { entity: t('label.alert') }),
  };
  if (face === 'Notification') {
    return [
      { label: t('label.setting-plural'), routeName: SETTINGS_HUB_ROUTE_NAME },
      { label: t('label.notification-plural'), routeName: SETTINGS_NOTIFICATIONS_ROUTE_NAME },
      { label: t('label.alert-plural'), routeName: SETTINGS_NOTIFICATION_ALERTS_ROUTE_NAME },
      last,
    ];
  }
  return [
    { label: t('label.observability') },
    { label: t('label.alert-plural'), routeName: OBSERVABILITY_ALERTS_ROUTE_NAME },
    last,
  ];
}

/**
 * Notification alert list breadcrumbs
 * (NotificationListPage.tsx:153-160 via getSettingPageEntityBreadCrumb):
 * Settings (linked) › Notifications (linked) › Alerts (unlinked). The
 * observability face has no breadcrumb in pin.
 */
export function getAlertListBreadcrumbs(t: TranslateFn): SmBreadcrumbItem[] {
  return [
    { label: t('label.setting-plural'), routeName: SETTINGS_HUB_ROUTE_NAME },
    { label: t('label.notification-plural'), routeName: SETTINGS_NOTIFICATIONS_ROUTE_NAME },
    { label: t('label.alert-plural') },
  ];
}

/**
 * Announcement list breadcrumbs: Settings › Notifications ›
 * Announcements (unlinked). Follows getSystemAnnouncementBreadcrumbs
 * with no current page (systemAnnouncements.utils.ts:24-46) over the
 * settings crumbs from getSettingPageEntityBreadCrumb, filtered to
 * linked crumbs.
 */
export function getAnnouncementsBreadcrumbs(t: TranslateFn): SmBreadcrumbItem[] {
  return [
    { label: t('label.setting-plural'), routeName: SETTINGS_HUB_ROUTE_NAME },
    { label: t('label.notification-plural'), routeName: SETTINGS_NOTIFICATIONS_ROUTE_NAME },
    { label: t('label.announcement-plural') },
  ];
}

/**
 * Announcement form breadcrumbs: Settings › Notifications ›
 * Announcements (linked) › current title (unlinked).
 */
export function getAnnouncementFormBreadcrumbs(current: string, t: TranslateFn): SmBreadcrumbItem[] {
  return [
    { label: t('label.setting-plural'), routeName: SETTINGS_HUB_ROUTE_NAME },
    { label: t('label.notification-plural'), routeName: SETTINGS_NOTIFICATIONS_ROUTE_NAME },
    { label: t('label.announcement-plural'), routeName: SETTINGS_ANNOUNCEMENTS_ROUTE_NAME },
    { label: current },
  ];
}
