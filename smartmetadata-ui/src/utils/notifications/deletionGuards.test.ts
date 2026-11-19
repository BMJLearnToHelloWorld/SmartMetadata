/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Deletion regression guards for 07 (#1-#17, 161-decisions.csv). These
 * tests pin the deletions at the source level so a later edit cannot
 * quietly resurrect a removed surface. Behavior-level coverage lives
 * in the view/component suites; #17 (hidden vs disabled detail
 * actions) is covered by AlertDetailView.test.ts, and #14 (Hub inbox
 * item) is report-only — the Hub file is outside 07 ownership.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { EventSubscription } from '@/types/quality';
import type { AlertFormValue } from '@/types/notifications';
import { ANNOUNCEMENT_PATCHED_KEYS } from './announcementUtils';
import { handleAlertSave } from './alertSave';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...parts: string[]): string => readFileSync(join(here, '..', '..', ...parts), 'utf8');

const alertDetailView = src('views', 'observability', 'AlertDetailView.vue');
const alertsListView = src('views', 'observability', 'AlertsListView.vue');
const alertFormView = src('views', 'observability', 'AlertFormView.vue');
const alertFormData = src('views', 'observability', 'useAlertFormData.ts');
const announcementsListView = src('views', 'collaboration', 'AnnouncementsListView.vue');
const announcementFormView = src('views', 'collaboration', 'AnnouncementFormView.vue');
const alertListTable = src('components', 'notifications', 'AlertListTable.vue');
const alertConfigDetails = src('components', 'notifications', 'AlertConfigDetails.vue');
const announcementsTable = src('components', 'notifications', 'SystemAnnouncementsTable.vue');
const announcementForm = src('components', 'notifications', 'SystemAnnouncementForm.vue');
const announcementUtils = src('utils', 'notifications', 'announcementUtils.ts');
const alertSave = src('utils', 'notifications', 'alertSave.ts');
const eventSubscriptionsApi = src('api', 'eventSubscriptions.ts');

describe('07 deletion guards', () => {
  it('#1/#7: the detail has exactly the three tabs, no Destinations or Overview', () => {
    expect(alertDetailView).toContain("key: 'configuration'");
    expect(alertDetailView).toContain("key: 'recentEvents'");
    expect(alertDetailView).toContain("key: 'diagnostic-info'");
    expect(alertDetailView).not.toContain("key: 'destinations'");
    expect(alertDetailView).not.toContain("key: 'overview'");
    // No === / !== filter text in the detail or its config segment.
    expect(alertDetailView).not.toContain("'==='");
    expect(alertConfigDetails).not.toContain("'==='");
    expect(alertConfigDetails).not.toContain("'!=='");
  });

  it('#2: no alert create/edit FormModal, and destinations are a list', () => {
    expect(alertsListView).not.toContain('FormModal');
    expect(alertDetailView).not.toContain('FormModal');
    expect(alertFormView).not.toContain('FormModal');
    const types = src('types', 'notifications.ts');
    expect(types).toContain('destinations: AlertFormDestination[];');
  });

  it('#3: the displayName input keeps its Name label, and no bare name input exists', () => {
    expect(alertFormView).toContain('data-testid="displayName"');
    expect(alertFormView).toContain(':value="form.displayName ?? \'\'"');
    expect(alertFormView).toContain("t('label.name')");
    expect(alertFormView).not.toContain('form.name');
    expect(alertFormView).not.toContain('data-testid="name"');
  });

  it('#4/#5: no enabled switch and no alertType dropdown in the form', () => {
    expect(alertFormView).not.toContain('Switch');
    expect(alertFormView).not.toContain('label.enabled');
    expect(alertFormView).not.toContain('label.alert-type');
    expect(alertFormView).not.toContain('AlertTypeSelect');
  });

  it('#6: no Type/Enabled/Destinations columns in the alert list table', () => {
    expect(alertListTable).not.toContain("dataIndex: 'type'");
    expect(alertListTable).not.toContain("dataIndex: 'enabled'");
    expect(alertListTable).not.toContain("dataIndex: 'destinations'");
  });

  it('#8: system-wide announcements carry no entityLink field', () => {
    expect(announcementForm).not.toContain('entityLink');
    expect(announcementUtils).not.toContain('entityLink');
    expect([...ANNOUNCEMENT_PATCHED_KEYS]).toEqual([
      'displayName',
      'description',
      'startTime',
      'endTime',
      'type',
      'color',
      'customTypeName',
    ]);
  });

  it('#9/#10: no About column, and the title fallback is a single step', () => {
    expect(announcementsTable).not.toContain('label.about');
    expect(announcementsTable).toContain('announcement.displayName ?? announcement.name');
    expect(announcementsTable).not.toContain('?? announcement.title');
  });

  it('#11: duplicate loads one announcement by id, never from a list guess', () => {
    const loaderHook = src('views', 'collaboration', 'useSystemAnnouncements.ts');
    expect(loaderHook).toContain('getAnnouncementById');
    expect(announcementFormView).not.toContain('slice(0, 50)');
    expect(announcementFormView).not.toContain('first 50');
  });

  it('#12: saving without changes still PATCHes, with no early return', async () => {
    expect(alertSave).not.toContain('noChange');
    expect(alertSave).not.toContain('no-change');
    // The stored input uses the schema's key order (actions before
    // filters — pin generated events/eventSubscription.ts:624-632),
    // which is the order the server emits and the form rebuilds.
    // The shared diff helper compares nested objects with
    // JSON.stringify, so a different key order here would emit a
    // spurious content-equal replace; that order-sensitivity is a
    // known deviation of the shared helper, reported separately.
    const initialData = {
      id: 'id1',
      name: 'dq-alert',
      fullyQualifiedName: 'dq-alert',
      displayName: 'DQ Alert',
      description: 'Checks data.',
      alertType: 'Observability',
      provider: 'user',
      filteringRules: { resources: ['table'] },
      input: { actions: [], filters: [] },
      destinations: [
        {
          id: 'd1',
          type: 'Email',
          category: 'External',
          config: { receivers: ['a@example.com'] },
          timeout: 10,
          readTimeout: 12,
        },
      ],
    } as unknown as EventSubscription;
    const data: AlertFormValue = {
      displayName: 'DQ Alert',
      description: 'Checks data.',
      resources: ['table'],
      input: { filters: [], actions: [] },
      destinations: [
        {
          id: 'd1',
          type: 'Email',
          category: 'External',
          config: { receivers: ['a@example.com'] },
        },
      ],
      timeout: 10,
      readTimeout: 12,
      alertType: 'Observability',
      provider: 'user',
    };
    const updateAlertAPI = vi.fn().mockResolvedValue(initialData);
    await handleAlertSave({
      data,
      fqn: 'dq-alert',
      initialData,
      createAlertAPI: vi.fn(),
      updateAlertAPI,
      afterSaveAction: vi.fn(),
      setInlineAlertDetails: vi.fn(),
      t: ((key: string) => key) as never,
      notifySuccess: vi.fn(),
    });
    expect(updateAlertAPI).toHaveBeenCalledTimes(1);
    expect(updateAlertAPI).toHaveBeenCalledWith('id1', []);
  });

  it('#13: no announcement FormModal, shown/total text, or small action buttons', () => {
    expect(announcementsListView).not.toContain('FormModal');
    expect(announcementsListView).not.toContain('shown');
    expect(announcementsListView).not.toContain('SmTable');
  });

  it('#15: the 07 views left EntityListShell without touching it', () => {
    expect(alertsListView).not.toContain('EntityListShell');
    expect(alertDetailView).not.toContain('EntityListShell');
    expect(announcementsListView).not.toContain('EntityListShell');
  });

  it('#16: alert updates PATCH with json-patch; the only PUT is syncOffset', () => {
    expect(eventSubscriptionsApi).toContain("method: 'PATCH'");
    expect(eventSubscriptionsApi).toContain('application/json-patch+json');
    const putCount = (eventSubscriptionsApi.match(/method: 'PUT'/g) ?? []).length;
    expect(putCount).toBe(1);
    expect(eventSubscriptionsApi).toContain('syncOffset');
  });

  it('dead pin APIs stay unbuilt: no deleteAlert/getAlertsFromId/getFilterFunctions calls', () => {
    expect(eventSubscriptionsApi).not.toContain('deleteAlert(');
    expect(eventSubscriptionsApi).not.toContain('getAlertsFromId(');
    expect(eventSubscriptionsApi).not.toContain('getFilterFunctions(');
    expect(eventSubscriptionsApi).not.toContain('deleteObservabilityAlert(');
  });

  it('no alert templates or extension widgets in the OSS form chain', () => {
    for (const source of [alertFormView, alertFormData]) {
      expect(source).not.toContain('extraFormWidgets');
      expect(source).not.toContain('AlertTemplate');
      expect(source).not.toContain('alertTemplate');
      expect(source).not.toContain('useObservabilityAlertTemplates');
    }
  });
});
