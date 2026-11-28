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
import { observabilityRootBreadcrumbLabel } from '@/utils/observabilityBreadcrumbs';
import { getEntityName, type TranslateFn } from './alertUtils';

/**
 * Alert/announcement breadcrumb builders following the pin breadcrumb
 * structures. These trails are pin hand-built per page (see each
 * function), not the shell §9 default: the Observability face lives
 * outside the settings space, so the shared settings constructors
 * (`settings/breadcrumbs.ts`, `settings/breadcrumbExceptions.ts`)
 * cannot express it. The shell work HAS landed — the notification-face
 * detail trail is delegated to the `alertDetailBreadcrumbs` adapter
 * in `AlertDetailView.vue`, and the two list trails were deleted with
 * this file's `getAlertListBreadcrumbs` / `getAnnouncementsBreadcrumbs`
 * because the list views already build them from the shared
 * constructors (`AlertsListView.vue`, `AnnouncementsListView.vue`).
 * What stays local here is the observability detail trail, both form
 * trails, and the announcement form trail. Every `routeName` below
 * names a registered route (`router/index.ts`): the earlier proposed
 * names (`settings-notifications`, `settings-notification-alerts`,
 * `settings-announcements`) were never registered and produced dead
 * links, so they were replaced with the registered records.
 */

export const SETTINGS_HUB_ROUTE_NAME = 'admin-settings';
/** The notifications category page is the generic settings-category record. */
export const SETTINGS_CATEGORY_ROUTE_NAME = 'settings-category';
export const NOTIFICATIONS_CATEGORY_PARAMS = { category: 'notifications' };
export const ANNOUNCEMENTS_ROUTE_NAME = 'announcements';
export const OBSERVABILITY_ALERTS_ROUTE_NAME = 'observability-alerts';
export const SETTINGS_NOTIFICATION_ALERTS_ROUTE_NAME = 'settings-notification-alerts';

/**
 * Observability alerts list (AlertsPage.tsx breadcrumb: observability root +
 * alert-plural, no entity name).
 */
export function getObservabilityAlertsListBreadcrumbs(t: TranslateFn): SmBreadcrumbItem[] {
  return [
    { label: observabilityRootBreadcrumbLabel(t) },
    { label: t('label.alert-plural') },
  ];
}

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
      {
        label: t('label.notification-plural'),
        routeName: SETTINGS_CATEGORY_ROUTE_NAME,
        routeParams: NOTIFICATIONS_CATEGORY_PARAMS,
      },
      { label: t('label.alert-plural'), routeName: SETTINGS_NOTIFICATION_ALERTS_ROUTE_NAME },
      { label: name },
    ];
  }
  return [
    { label: observabilityRootBreadcrumbLabel(t) },
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
      {
        label: t('label.notification-plural'),
        routeName: SETTINGS_CATEGORY_ROUTE_NAME,
        routeParams: NOTIFICATIONS_CATEGORY_PARAMS,
      },
      { label: t('label.alert-plural'), routeName: SETTINGS_NOTIFICATION_ALERTS_ROUTE_NAME },
      last,
    ];
  }
  return [
    { label: observabilityRootBreadcrumbLabel(t) },
    { label: t('label.alert-plural'), routeName: OBSERVABILITY_ALERTS_ROUTE_NAME },
    last,
  ];
}

/**
 * Announcement form breadcrumbs: Settings › Notifications ›
 * Announcements (linked) › current title (unlinked).
 */
export function getAnnouncementFormBreadcrumbs(current: string, t: TranslateFn): SmBreadcrumbItem[] {
  return [
    { label: t('label.setting-plural'), routeName: SETTINGS_HUB_ROUTE_NAME },
    {
      label: t('label.notification-plural'),
      routeName: SETTINGS_CATEGORY_ROUTE_NAME,
      routeParams: NOTIFICATIONS_CATEGORY_PARAMS,
    },
    { label: t('label.announcement-plural'), routeName: ANNOUNCEMENTS_ROUTE_NAME },
    { label: current },
  ];
}
