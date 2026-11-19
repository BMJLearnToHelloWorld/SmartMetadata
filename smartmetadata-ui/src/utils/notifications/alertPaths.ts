/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AlertDetailTab, AlertFace } from '@/types/notifications';
import { getEncodedFqn, getNotificationAlertDetailsPath } from '@/utils/fqnPaths';

/**
 * 07 path builders (pin utils/RouterUtils.ts:609-651, constants.ts
 * ROUTES:320-334). The notification detail path reuses the shared
 * fqnPaths builder (verified correct). The observability detail path
 * is built HERE, not via the shared builder: the shared
 * getObservabilityAlertDetailsPath returned the SETTINGS path (bug
 * F-07-2, fixed by the sections integration), and this local
 * builder is deliberately retained as the shell dependency — the
 * integration decision (Task 4 items 12/27) keeps the bypass until
 * the shell breadcrumb work lands and re-verifies the delegation.
 */

export { getNotificationAlertDetailsPath };

/** getObservabilityAlertDetailsPath (RouterUtils.ts:625-637): `/observability/alert/:fqn/:tab`. */
export function getObservabilityAlertDetailsPath(fqn: string, tab?: AlertDetailTab | string): string {
  return `/observability/alert/${getEncodedFqn(fqn)}/${tab ?? 'configuration'}`;
}

/** getObservabilityAlertsEditPath (RouterUtils.ts:609-615). */
export function getObservabilityAlertsEditPath(fqn: string): string {
  return `/observability/alerts/edit/${getEncodedFqn(fqn)}`;
}

/** getNotificationAlertsEditPath (RouterUtils.ts:617-623). */
export function getNotificationAlertsEditPath(fqn: string): string {
  return `/settings/notifications/edit-notification/${getEncodedFqn(fqn)}`;
}

/** Face detail path: notification via the shared builder, observability via the local one. */
export function getAlertDetailsPath(face: AlertFace, fqn: string, tab?: AlertDetailTab | string): string {
  return face === 'Notification'
    ? getNotificationAlertDetailsPath(fqn, tab)
    : getObservabilityAlertDetailsPath(fqn, tab);
}

/** Face edit path. */
export function getAlertEditPath(face: AlertFace, fqn: string): string {
  return face === 'Notification'
    ? getNotificationAlertsEditPath(fqn)
    : getObservabilityAlertsEditPath(fqn);
}

/** Face list path (ROUTES:320,328). */
export function getAlertListPath(face: AlertFace): string {
  return face === 'Notification' ? '/settings/notifications/alerts' : '/observability/alerts';
}

/** Face add path (ROUTES:322; settings add is GlobalSettings ADD_NOTIFICATION). */
export function getAlertAddPath(face: AlertFace): string {
  return face === 'Notification' ? '/settings/notifications/add-notification' : '/observability/alerts/add';
}

/**
 * Resolve the alert face from a route path. Settings-surface paths are
 * the notification face; everything else resolves to observability
 * (the current routes are all observability paths, so the views keep
 * working under them until the router rewiring lands).
 */
export function resolveAlertFace(path: string): AlertFace {
  return path.startsWith('/settings/') ? 'Notification' : 'Observability';
}

/** Announcement list path (ROUTES SETTINGS_ANNOUNCEMENTS). */
export function getAnnouncementsPath(): string {
  return '/settings/notifications/announcements';
}

/** Announcement add path (ROUTES SETTINGS_ANNOUNCEMENT_ADD). */
export function getAnnouncementAddPath(): string {
  return '/settings/notifications/announcements/add';
}

/** Announcement edit path (ROUTES SETTINGS_ANNOUNCEMENT_EDIT, id addressing retained). */
export function getAnnouncementEditPath(id: string): string {
  return `/settings/notifications/announcements/edit/${id}`;
}

/** Announcement duplicate path (ROUTES SETTINGS_ANNOUNCEMENT_DUPLICATE, id addressing retained). */
export function getAnnouncementDuplicatePath(id: string): string {
  return `/settings/notifications/announcements/duplicate/${id}`;
}
