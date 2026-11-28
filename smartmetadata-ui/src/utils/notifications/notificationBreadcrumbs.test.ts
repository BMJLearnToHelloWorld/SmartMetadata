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
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import {
  getAlertDetailsBreadcrumbs,
  getAlertFormBreadcrumbs,
  getAnnouncementFormBreadcrumbs,
  getObservabilityAlertsListBreadcrumbs,
} from './notificationBreadcrumbs';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as TranslateFn;

describe('notification breadcrumbs', () => {
  it('builds the four-level notification detail trail, last crumb unlinked', () => {
    const crumbs = getAlertDetailsBreadcrumbs('Notification', 'dq-alert', { displayName: 'DQ Alert' }, t);
    expect(crumbs).toEqual([
      { label: 'label.setting-plural', routeName: 'admin-settings' },
      {
        label: 'label.notification-plural',
        routeName: 'settings-category',
        routeParams: { category: 'notifications' },
      },
      { label: 'label.alert-plural', routeName: 'settings-notification-alerts' },
      { label: 'DQ Alert' },
    ]);
  });

  it('builds the three-level observability detail trail with an unlinked first crumb', () => {
    const crumbs = getAlertDetailsBreadcrumbs('Observability', 'dq-alert', undefined, t);
    expect(crumbs).toEqual([
      { label: 'nav.observability' },
      { label: 'label.alert-plural', routeName: 'observability-alerts' },
      { label: 'dq-alert' },
    ]);
  });

  it('builds the two-level observability alerts list trail (AlertsPage.tsx)', () => {
    expect(getObservabilityAlertsListBreadcrumbs(t)).toEqual([
      { label: 'nav.observability' },
      { label: 'label.alert-plural' },
    ]);
  });

  it('ends the form trail with Create or Edit Alert per mode', () => {
    const create = getAlertFormBreadcrumbs('Notification', false, t);
    expect(create).toEqual([
      { label: 'label.setting-plural', routeName: 'admin-settings' },
      {
        label: 'label.notification-plural',
        routeName: 'settings-category',
        routeParams: { category: 'notifications' },
      },
      { label: 'label.alert-plural', routeName: 'settings-notification-alerts' },
      { label: 'label.create-entity:{"entity":"label.alert"}' },
    ]);
    expect(create[create.length - 1]).toEqual({
      label: 'label.create-entity:{"entity":"label.alert"}',
    });
    const edit = getAlertFormBreadcrumbs('Observability', true, t);
    expect(edit[edit.length - 1]).toEqual({
      label: 'label.edit-entity:{"entity":"label.alert"}',
    });
    expect(edit[0]).toEqual({ label: 'nav.observability' });
  });

  it('builds the announcement form trail', () => {
    const form = getAnnouncementFormBreadcrumbs('Add Announcement', t);
    expect(form[2]).toEqual({ label: 'label.announcement-plural', routeName: 'announcements' });
    expect(form[3]).toEqual({ label: 'Add Announcement' });
  });
});
