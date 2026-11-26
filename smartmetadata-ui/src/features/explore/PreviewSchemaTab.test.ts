/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail } from '@/types/api';
import PreviewSchemaTab from './PreviewSchemaTab.vue';

function detailWith(overrides: Partial<AssetDetail>): AssetDetail {
  return {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
    ...overrides,
  };
}

function mountTab(entityType: string, detail: AssetDetail | null, loading = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  const wrapper = mount(PreviewSchemaTab, {
    props: { entityType, detail, loading },
    global: { plugins: [Antd, router, createTestI18n()] },
  });
  return wrapper;
}

describe('PreviewSchemaTab (pin ColumnSummaryList / getChildComponentDetails)', () => {
  it('renders table columns with name, type and description', async () => {
    const wrapper = mountTab(
      'table',
      detailWith({
        schemaRows: [
          { key: 'a', name: 'a', dataType: 'int', description: 'first column' },
          { key: 'b', name: 'b', dataType: 'varchar(50)' },
        ],
      }),
    );
    expect(wrapper.find('[data-testid="explore-preview-schema"]').text()).toContain('Schema');
    expect(wrapper.find('[data-testid="preview-schema-row-a"]').text()).toContain('first column');
    expect(wrapper.find('[data-testid="preview-schema-row-b"]').text()).toContain('varchar(50)');
    wrapper.unmount();
  });

  it('paginates at 50 rows (pin PAGE_SIZE_LARGE) and shows the second page', async () => {
    const rows = Array.from({ length: 55 }, (_, i) => ({
      key: `c${i}`,
      name: `c${i}`,
      dataType: 'int',
    }));
    const wrapper = mountTab('table', detailWith({ schemaRows: rows }));
    expect(wrapper.find('[data-testid="preview-schema-row-c54"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="preview-schema-row-c49"]').exists()).toBe(true);
    // Antd pagination: the second page button is the second pager item.
    const pagers = wrapper.findAll('.ant-pagination-item');
    await pagers[1]?.trigger('click');
    expect(wrapper.find('[data-testid="preview-schema-row-c54"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-schema-row-c0"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders pipeline tasks and database schemas', async () => {
    const tasks = mountTab(
      'pipeline',
      detailWith({
        entityType: 'pipeline',
        tasks: [{ name: 'extract', displayName: 'Extract', taskType: 'Airflow', description: 'pulls rows', downstreamTasks: [] }],
      }),
    );
    expect(tasks.text()).toContain('Tasks');
    expect(tasks.find('[data-testid="preview-schema-row-extract"]').text()).toContain('Airflow');
    tasks.unmount();

    const db = mountTab(
      'database',
      detailWith({
        entityType: 'database',
        children: [{ name: 'marts', displayName: 'Marts', type: 'databaseSchema', fullyQualifiedName: 'svc.analytics.marts' }],
      }),
    );
    expect(db.text()).toContain('Marts');
    db.unmount();
  });

  it('renders dashboard charts and data models as linked refs', async () => {
    const wrapper = mountTab(
      'dashboard',
      detailWith({
        entityType: 'dashboard',
        charts: [{ name: 'c1', displayName: 'Chart 1', type: 'chart', fullyQualifiedName: 'svc.c1' }],
        dataModels: [{ name: 'm1', displayName: 'Model 1', type: 'dashboardDataModel', fullyQualifiedName: 'svc.m1' }],
      }),
    );
    expect(wrapper.text()).toContain('Charts');
    expect(wrapper.text()).toContain('Dashboard Data Models');
    const links = wrapper.findAll('a');
    expect(links.map((link) => link.attributes('href'))).toContain('/assets/chart/svc.c1');
    expect(links.map((link) => link.attributes('href'))).toContain('/assets/dashboardDataModel/svc.m1');
    wrapper.unmount();
  });

  it('shows the no-data empty state for apiCollection and without a fetched detail', async () => {
    const empty = mountTab('apiCollection', detailWith({ entityType: 'apiCollection' }));
    expect(empty.find('[data-testid="preview-schema-empty"]').exists()).toBe(true);
    expect(empty.text()).toContain('No data found');
    empty.unmount();

    const noDetail = mountTab('table', null);
    expect(noDetail.find('[data-testid="preview-schema-empty"]').exists()).toBe(true);
    noDetail.unmount();
  });

  it('shows a spinner while the entity fetch is loading', async () => {
    const wrapper = mountTab('table', null, true);
    expect(wrapper.find('[data-testid="preview-schema-loading"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
