/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mounted,
  mountView,
  stubFetch,
  type FetchCall,
  type MockOptions,
} from './ServiceDetailView.testHarness';

/**
 * DESIGN §7.3 gate matrix, unit-testable cells: viewer / owner /
 * non-owner / admin × service category × deleted / non-deleted,
 * asserting rendered results per cell (tab visibility, facets edit
 * buttons, main-tab description/tags edit, Connection visibility +
 * Edit/Test disabled, Bulk Edit, Agents visibility, overflow menu
 * item set, Follow button only for database non-deleted).
 *
 * This file covers the cells the main suite does not: facets edit
 * buttons per role, Connection Edit/Test disabled (not hidden),
 * Bulk Edit visibility, tab visibility per role and category, and
 * deleted-state gating beyond delete/restore. Cells already covered
 * in ServiceDetailView.test.ts are NOT duplicated here: Agents
 * hidden for non-owner non-admin (:438), trigger-button permission
 * bits, delete/restore gates, the follow matrix (:750, :869, :875),
 * overflow menu card actions (:368), the connection edit route
 * (:390), test connection offered (:398).
 *
 * The full matrix is live acceptance ("live 前必跑，部署后 Bai 临时
 * 登录验收"); these tests assert rendering only.
 */
describe('ServiceDetailView gate matrix (DESIGN §7.3)', () => {
  const calls: FetchCall[] = [];
  beforeEach(() => {
    calls.length = 0;
  });

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  /** Viewer ops: view-only, no Edit* bit at all. */
  const VIEWER_OPS = ['ViewAll', 'ViewBasic'];

  async function mountMatrix(
    stubOptions: MockOptions = {},
    viewOptions: { tab?: string; kind?: string; isAdmin?: boolean } = {},
  ) {
    stubFetch(calls, stubOptions);
    return mountView(viewOptions);
  }

  // Ant Tabs does not forward TabPane testids (Stage 5 lesson, see the
  // main suite's registry-tabs test): tab presence is asserted through
  // the rendered tab buttons' text, not `service-tab-<key>` testids,
  // which never reach the DOM. The count pills (`service-tab-<key>-count`)
  // do carry testids, but only tabs with a count have them.
  function tabLabels(wrapper: VueWrapper): string[] {
    return wrapper.findAll('.ant-tabs-tab').map((tab) => tab.text());
  }

  function hasTab(wrapper: VueWrapper, label: string): boolean {
    return tabLabels(wrapper).some((text) => text.includes(label));
  }

  function isDisabled(wrapper: VueWrapper, testId: string): boolean {
    const el = wrapper.find(`[data-testid="${testId}"]`).element as HTMLButtonElement;
    return el.disabled;
  }

  it('shows the facets edit buttons for an editor', async () => {
    const { wrapper } = await mountMatrix();
    expect(wrapper.find('[data-testid="edit-domain-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-owner-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-tier-button"]').exists()).toBe(true);
  });

  it('hides the facets edit buttons for a viewer without EditAll', async () => {
    const { wrapper } = await mountMatrix({ servicePermissionOps: VIEWER_OPS });
    expect(wrapper.find('[data-testid="edit-domain-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-owner-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-tier-button"]').exists()).toBe(false);
  });

  it('hides the facets edit buttons on a soft-deleted service even with EditAll', async () => {
    const { wrapper } = await mountMatrix({ serviceDeleted: true });
    expect(wrapper.find('[data-testid="edit-domain-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-owner-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-tier-button"]').exists()).toBe(false);
  });

  it('disables, not hides, the header Edit button without EditAll; rename is hidden', async () => {
    const { wrapper } = await mountMatrix({ servicePermissionOps: VIEWER_OPS });
    const editButton = wrapper.find('[data-testid="edit-service"]');
    expect(editButton.exists()).toBe(true);
    expect(isDisabled(wrapper, 'edit-service')).toBe(true);
    expect(wrapper.find('[data-testid="service-rename-button"]').exists()).toBe(false);
  });

  it('enables the header Edit button and offers rename with EditAll', async () => {
    const { wrapper } = await mountMatrix();
    expect(isDisabled(wrapper, 'edit-service')).toBe(false);
    expect(wrapper.find('[data-testid="service-rename-button"]').exists()).toBe(true);
  });

  it('hides the Connection tab without EditAll', async () => {
    const { wrapper } = await mountMatrix({ servicePermissionOps: VIEWER_OPS });
    expect(hasTab(wrapper, 'Connection')).toBe(false);
  });

  it('shows the Connection tab with EditAll and enables Edit/Test on it', async () => {
    const { wrapper } = await mountMatrix({}, { tab: 'connection' });
    expect(hasTab(wrapper, 'Connection')).toBe(true);
    expect(wrapper.find('[data-testid="edit-service-connection"]').exists()).toBe(true);
    expect(isDisabled(wrapper, 'edit-service-connection')).toBe(false);
    expect(wrapper.find('[data-testid="test-service-connection"]').exists()).toBe(true);
    expect(isDisabled(wrapper, 'test-service-connection')).toBe(false);
  });

  it('shows the Agents tab to a non-admin owner', async () => {
    const { wrapper } = await mountMatrix(
      { serviceOwners: [{ id: 'u1', type: 'user', name: 'alice' }] },
      { isAdmin: false },
    );
    expect(hasTab(wrapper, 'Agents')).toBe(true);
  });

  it('shows the Agents tab to an admin viewer, but not the Connection tab', async () => {
    // The Agents rule is owner / owner-team / admin — independent of
    // EditAll — while the Connection tab rides EditAll alone.
    const { wrapper } = await mountMatrix({ servicePermissionOps: VIEWER_OPS });
    expect(hasTab(wrapper, 'Agents')).toBe(true);
    expect(hasTab(wrapper, 'Connection')).toBe(false);
  });

  it('shows Bulk Edit only on the database main tab with EditAll', async () => {
    const { wrapper } = await mountMatrix({}, { tab: 'databases' });
    expect(wrapper.find('[data-testid="bulk-edit"]').exists()).toBe(true);
  });

  it('hides Bulk Edit for a viewer on the database main tab', async () => {
    const { wrapper } = await mountMatrix(
      { servicePermissionOps: VIEWER_OPS },
      { tab: 'databases' },
    );
    expect(wrapper.find('[data-testid="bulk-edit"]').exists()).toBe(false);
  });

  it('hides Bulk Edit on a dashboard main tab even with EditAll', async () => {
    const { wrapper } = await mountMatrix({}, { tab: 'dashboards', kind: 'dashboard' });
    // Positive control: the dashboard permission fetch landed, so the
    // absence below is the kind gate, not a failed permission read.
    expect(hasTab(wrapper, 'Connection')).toBe(true);
    expect(wrapper.find('[data-testid="bulk-edit"]').exists()).toBe(false);
  });

  it('offers the main-tab description edit to an editor', async () => {
    const { wrapper } = await mountMatrix({}, { tab: 'databases' });
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
  });

  it('hides the main-tab description edit for a viewer', async () => {
    const { wrapper } = await mountMatrix(
      { servicePermissionOps: VIEWER_OPS },
      { tab: 'databases' },
    );
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
  });

  it('hides the main-tab description edit on a soft-deleted service even with EditAll', async () => {
    const { wrapper } = await mountMatrix({ serviceDeleted: true }, { tab: 'databases' });
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
  });

  it('keeps the Connection tab on a soft-deleted service (ungated EditAll) with restore', async () => {
    const { wrapper } = await mountMatrix({ serviceDeleted: true });
    expect(hasTab(wrapper, 'Connection')).toBe(true);
    expect(wrapper.find('[data-testid="restore-service"]').exists()).toBe(true);
  });

  it('shows only Agents + Connection for metadata services', async () => {
    const { wrapper } = await mountMatrix({}, { kind: 'metadata' });
    expect(hasTab(wrapper, 'Insights')).toBe(false);
    expect(hasTab(wrapper, 'Databases')).toBe(false);
    expect(hasTab(wrapper, 'Agents')).toBe(true);
    expect(hasTab(wrapper, 'Connection')).toBe(true);
  });

  it('shows only Connection for security services', async () => {
    const { wrapper } = await mountMatrix({}, { kind: 'security' });
    expect(hasTab(wrapper, 'Insights')).toBe(false);
    expect(hasTab(wrapper, 'Agents')).toBe(false);
    expect(hasTab(wrapper, 'Connection')).toBe(true);
  });

  it('shows the data-models secondary tab for dashboard services', async () => {
    const { wrapper } = await mountMatrix({}, { kind: 'dashboard' });
    expect(hasTab(wrapper, 'Dashboards')).toBe(true);
    expect(hasTab(wrapper, 'Data Models')).toBe(true);
  });
});
