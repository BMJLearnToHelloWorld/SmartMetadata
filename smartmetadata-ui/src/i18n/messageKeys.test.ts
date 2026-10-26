/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return prefix ? [prefix] : [];
}

describe('i18n catalogs', () => {
  it('keeps zh-CN and en-US keys in lockstep', () => {
    expect(leafKeys(zhCN).sort()).toEqual(leafKeys(enUS).sort());
  });

  it('covers shell, nav, login, Explore, and asset tabs', () => {
    const keys = leafKeys(enUS);
    expect(keys).toContain('nav.explore');
    expect(keys).toContain('nav.lineage');
    expect(keys).toContain('nav.observability');
    expect(keys).toContain('chrome.logout');
    expect(keys).toContain('chrome.searchPlaceholder');
    expect(keys).toContain('login.submit');
    expect(keys).toContain('explore.title');
    expect(keys).toContain('explore.facets.entityType');
    expect(keys).toContain('asset.tabs.overview');
    expect(keys).toContain('asset.tabs.schema');
    expect(keys).toContain('asset.tabs.lineage');
    expect(keys).toContain('asset.tabs.quality');
    expect(keys).toContain('lineage.title');
    expect(keys).toContain('lineage.searchPlaceholder');
    expect(keys).toContain('lineage.findNode');
    expect(keys).toContain('lineage.columnsLead');
    expect(keys).toContain('crud.refresh');
    expect(keys).toContain('crud.next');
    expect(keys).toContain('crud.empty');
    expect(keys).toContain('admin.users.title');
    expect(keys).toContain('admin.teams.title');
    expect(keys).toContain('admin.bots.title');
    expect(keys).toContain('governance.classifications.title');
    expect(keys).toContain('governance.glossaries.title');
    expect(keys).toContain('admin.roles.title');
    expect(keys).toContain('governance.domains.title');
    expect(keys).toContain('governance.dataProducts.title');
    expect(keys).toContain('quality.testCases.title');
    expect(keys).toContain('quality.testDefinitions.title');
    expect(keys).toContain('quality.testSuites.title');
    expect(keys).toContain('observability.alerts.title');
    expect(keys).toContain('observability.incidents.title');
    expect(keys).toContain('ingestion.services.title');
    expect(keys).toContain('ingestion.pipelines.title');
    expect(keys).toContain('chrome.userMenu');
    expect(keys).toContain('chrome.viewProfile');
    expect(keys).toContain('settings.title');
    expect(keys).toContain('settings.categories.members.title');
    expect(keys).toContain('settings.system.saveLogin');
    expect(keys).toContain('admin.policies.title');
    expect(keys).toContain('settings.customProperties.title');
    expect(keys).toContain('nav.insights');
    expect(keys).toContain('insights.title');
    expect(keys).toContain('insights.tabs.dataAssets');
    expect(keys).toContain('insights.pipelineEmpty');
    expect(keys).toContain('insights.kpisLead');
    expect(keys).toContain('insights.kpisEmpty');
    expect(keys).toContain('charts.empty');
    expect(keys).toContain('asset.rowCountChart');
    expect(keys).toContain('asset.resultsChart');
    expect(keys).toContain('asset.tabs.tasks');
    expect(keys).toContain('asset.tabs.executions');
    expect(keys).toContain('asset.tasksEmpty');
    expect(keys).toContain('explore.entity.searchIndex');
    expect(keys).toContain('explore.entity.chart');
    expect(keys).toContain('explore.entity.metric');
    expect(keys).toContain('explore.entity.dashboardDataModel');
    expect(keys).toContain('asset.fields.chartType');
    expect(keys).toContain('asset.relatedEmpty');
    expect(keys).toContain('crud.cancel');
    expect(keys).toContain('crud.save');
    expect(keys).toContain('collaboration.activity.title');
    expect(keys).toContain('collaboration.tasks.create');
    expect(keys).toContain('collaboration.task.addComment');
    expect(keys).toContain('collaboration.announcements.createTitle');
    expect(keys).toContain('terms.editTitle');
    expect(keys).toContain('tags.edit');
    expect(keys).toContain('connection.hostPort');
  });

  it('aligns key shell and CRUD English to in-repo OM locale wording', () => {
    expect(enUS.chrome.searchPlaceholder).toBe('Search for Data Assets');
    expect(enUS.chrome.logout).toBe('Logout');
    expect(enUS.login.submit).toBe('Sign In');
    expect(enUS.nav.dataProducts).toBe('Data Products');
    expect(enUS.nav.testCases).toBe('Test Cases');
    expect(enUS.crud.displayName).toBe('Display Name');
    expect(enUS.asset.tabs.customProperties).toBe('Custom Properties');
    expect(zhCN.chrome.logout).toBe('退出');
    expect(zhCN.login.submit).toBe('登入');
    expect(zhCN.nav.lineage).toBe('血缘关系');
    expect(zhCN.nav.governance).toBe('数据治理');
    expect(zhCN.nav.glossaries).toBe('术语库');
    expect(zhCN.crud.create).toBe('新建');
  });

  it('keeps leftover API placeholders literal after vue-i18n compile', () => {
    const i18n = createTestI18n('en-US');
    const t = i18n.global.t;
    expect(t('connection.password')).toContain('${ENV}');
    expect(t('connection.secretHint')).toContain('${VAR}');
    expect(t('collaboration.task.resolveLead')).toContain('/tasks/{id}/resolve');
    expect(t('terms.relatedLead')).toContain('/glossaryTerms/{id}/assets');

    const zh = createTestI18n('zh-CN');
    expect(zh.global.t('connection.password')).toContain('${ENV}');
    expect(zh.global.t('connection.secretHint')).toContain('${VAR}');
    expect(zh.global.t('collaboration.task.resolveLead')).toContain('/tasks/{id}/resolve');
    expect(zh.global.t('terms.relatedLead')).toContain('/glossaryTerms/{id}/assets');
  });
});
