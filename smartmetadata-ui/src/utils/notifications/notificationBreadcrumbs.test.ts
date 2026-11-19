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
  getAlertListBreadcrumbs,
  getAnnouncementFormBreadcrumbs,
  getAnnouncementsBreadcrumbs,
} from './notificationBreadcrumbs';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as TranslateFn;

describe('notification breadcrumbs', () => {
  it('builds the four-level notification detail trail, last crumb unlinked', () => {
    const crumbs = getAlertDetailsBreadcrumbs('Notification', 'dq-alert', { displayName: 'DQ Alert' }, t);
    expect(crumbs).toEqual([
      { label: 'label.setting-plural', routeName: 'admin-settings' },
      { label: 'label.notification-plural', routeName: 'settings-notifications' },
      { label: 'label.alert-plural', routeName: 'settings-notification-alerts' },
      { label: 'DQ Alert' },
    ]);
  });

  it('builds the three-level observability detail trail with an unlinked first crumb', () => {
    const crumbs = getAlertDetailsBreadcrumbs('Observability', 'dq-alert', undefined, t);
    expect(crumbs).toEqual([
      { label: 'label.observability' },
      { label: 'label.alert-plural', routeName: 'observability-alerts' },
      { label: 'dq-alert' },
    ]);
  });

  it('ends the form trail with Create or Edit Alert per mode', () => {
    const create = getAlertFormBreadcrumbs('Notification', false, t);
    expect(create[create.length - 1]).toEqual({
      label: 'label.create-entity:{"entity":"label.alert"}',
    });
    const edit = getAlertFormBreadcrumbs('Observability', true, t);
    expect(edit[edit.length - 1]).toEqual({
      label: 'label.edit-entity:{"entity":"label.alert"}',
    });
    expect(edit[0]).toEqual({ label: 'label.observability' });
  });

  it('ends the notification list trail with an unlinked Alerts crumb', () => {
    expect(getAlertListBreadcrumbs(t)).toEqual([
      { label: 'label.setting-plural', routeName: 'admin-settings' },
      { label: 'label.notification-plural', routeName: 'settings-notifications' },
      { label: 'label.alert-plural' },
    ]);
  });

  it('builds the announcement list and form trails', () => {
    expect(getAnnouncementsBreadcrumbs(t)).toEqual([
      { label: 'label.setting-plural', routeName: 'admin-settings' },
      { label: 'label.notification-plural', routeName: 'settings-notifications' },
      { label: 'label.announcement-plural' },
    ]);
    const form = getAnnouncementFormBreadcrumbs('Add Announcement', t);
    expect(form[2]).toEqual({ label: 'label.announcement-plural', routeName: 'settings-announcements' });
    expect(form[3]).toEqual({ label: 'Add Announcement' });
  });
});
