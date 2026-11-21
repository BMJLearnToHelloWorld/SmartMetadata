/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  getAlertAddPath,
  getAlertDetailsPath,
  getAlertEditPath,
  getAlertListPath,
  getAnnouncementAddPath,
  getAnnouncementDuplicatePath,
  getAnnouncementEditPath,
  getAnnouncementsPath,
  getNotificationAlertDetailsPath,
  getNotificationAlertsEditPath,
  getObservabilityAlertsEditPath,
  resolveAlertFace,
} from './alertPaths';

describe('alert paths', () => {
  it('addresses the two detail faces, defaulting the tab to configuration', () => {
    expect(getNotificationAlertDetailsPath('dq-alert')).toBe(
      '/settings/notifications/alerts/dq-alert/configuration',
    );
    // The observability detail builder lives in the shared fqnPaths module
    // (II-9: the local duplicate was deleted); this module only dispatches
    // to it by face. The shared builder itself is locked by fqnPaths.test.ts.
    expect(getAlertDetailsPath('Observability', 'dq-alert')).toBe(
      '/observability/alert/dq-alert/configuration',
    );
    expect(getAlertDetailsPath('Observability', 'dq-alert', 'recentEvents')).toBe(
      '/observability/alert/dq-alert/recentEvents',
    );
    expect(getAlertDetailsPath('Observability', 'svc.db.tbl')).toBe(
      '/observability/alert/svc.db.tbl/configuration',
    );
  });

  it('encodes FQNs with slashes in the path segment', () => {
    expect(getAlertDetailsPath('Observability', 'a/b')).toBe(
      '/observability/alert/a%2Fb/configuration',
    );
    expect(getObservabilityAlertsEditPath('a/b')).toBe('/observability/alerts/edit/a%2Fb');
    expect(getNotificationAlertsEditPath('a/b')).toBe(
      '/settings/notifications/edit-notification/a%2Fb',
    );
  });

  it('resolves face paths for list, add, detail and edit', () => {
    expect(getAlertListPath('Notification')).toBe('/settings/notifications/alerts');
    expect(getAlertListPath('Observability')).toBe('/observability/alerts');
    expect(getAlertAddPath('Notification')).toBe('/settings/notifications/add-notification');
    expect(getAlertAddPath('Observability')).toBe('/observability/alerts/add');
    expect(getAlertDetailsPath('Notification', 'dq-alert', 'diagnostic-info')).toBe(
      '/settings/notifications/alerts/dq-alert/diagnostic-info',
    );
    expect(getAlertEditPath('Notification', 'dq-alert')).toBe(
      '/settings/notifications/edit-notification/dq-alert',
    );
    expect(getAlertEditPath('Observability', 'dq-alert')).toBe(
      '/observability/alerts/edit/dq-alert',
    );
  });

  it('resolves the face from the route path', () => {
    expect(resolveAlertFace('/settings/notifications/alerts')).toBe('Notification');
    expect(resolveAlertFace('/observability/alerts')).toBe('Observability');
    expect(resolveAlertFace('/observability/alert/dq-alert/configuration')).toBe('Observability');
  });

  it('addresses the announcement routes, keeping id addressing', () => {
    expect(getAnnouncementsPath()).toBe('/settings/notifications/announcements');
    expect(getAnnouncementAddPath()).toBe('/settings/notifications/announcements/add');
    expect(getAnnouncementEditPath('abc-123')).toBe(
      '/settings/notifications/announcements/edit/abc-123',
    );
    expect(getAnnouncementDuplicatePath('abc-123')).toBe(
      '/settings/notifications/announcements/duplicate/abc-123',
    );
  });
});
