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
    expect(keys).toContain('nav.home');
    expect(keys).toContain('home.welcome');
    expect(keys).toContain('home.activityEmptyTitle');
    expect(keys).toContain('home.setupKpi');
    expect(keys).toContain('nav.explore');
    expect(keys).toContain('home.hiUser');
    expect(keys).toContain('home.topicsTitle');
    expect(keys).toContain('home.widgets.myTasks');
    expect(keys).toContain('home.empty.kpi');
    expect(keys).toContain('nav.lineage');
    expect(keys).toContain('nav.observability');
    expect(keys).toContain('chrome.logout');
    expect(keys).toContain('chrome.searchPlaceholder');
    expect(keys).toContain('login.submit');
    expect(keys).toContain('explore.title');
    expect(keys).toContain('explore.facets.entityType');
    expect(keys).toContain('explore.browseEstate');
    expect(keys).toContain('explore.estate.databases');
    expect(keys).toContain('explore.facets.certification');
    expect(keys).toContain('explore.facets.dataProduct');
    expect(keys).toContain('explore.sortPopularity');
    expect(keys).toContain('explore.openContextCenter');
    expect(keys).toContain('explore.glossaryTerms');
    expect(keys).toContain('asset.tabs.overview');
    expect(keys).toContain('asset.tabs.schema');
    expect(keys).toContain('asset.tabs.lineage');
    expect(keys).toContain('asset.tabs.quality');
    expect(keys).toContain('lineage.title');
    expect(keys).toContain('lineage.searchPlaceholder');
    expect(keys).toContain('lineage.findNode');
    expect(keys).toContain('lineage.columnsLead');
    expect(keys).toContain('lineage.depthHelp');
    expect(keys).toContain('ingestion.services.connectionJsonHelp');
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
    expect(keys).toContain('quality.landing.title');
    expect(keys).toContain('quality.landing.tabs.summary');
    expect(keys).toContain('quality.landing.residualReport');
    expect(keys).toContain('quality.testCases.empty');
    expect(keys).toContain('quality.testSuites.tableSuites');
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
    expect(keys).toContain('nav.govern');
    expect(keys).toContain('nav.marketplace');
    expect(keys).toContain('nav.contextCenter');
    expect(keys).toContain('nav.incidentManager');
    expect(keys).toContain('nav.columnBulkOps');
    expect(keys).toContain('shells.ontologyExplorer.empty');
    expect(keys).toContain('shells.contextArticles.empty');
    expect(keys).toContain('metrics.title');
    expect(keys).toContain('metrics.empty');
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
    expect(keys).toContain('explore.facetHelper');
    expect(keys).toContain('crud.fieldRequired');
    expect(keys).toContain('crud.view');
    expect(keys).toContain('crud.emptyHint');
    expect(keys).toContain('crud.refreshHelp');
    expect(keys).toContain('crud.displayNameHelp');
    expect(keys).toContain('crud.descriptionHelp');
    expect(keys).toContain('crud.deleteTitle');
    expect(keys).toContain('explore.clearFiltersHelp');
    expect(keys).toContain('lineage.reloadHelp');
    expect(keys).toContain('admin.users.passwordHelp');
    expect(keys).toContain('ingestion.pipelines.scheduleHelp');
    expect(keys).toContain('observability.incidents.statusAck');
    expect(keys).toContain('observability.incidents.statusResolved');
  });

  it('aligns key shell and CRUD English to in-repo OM locale wording', () => {
    expect(enUS.home.welcome).toBe('Welcome, {name}!');
    expect(enUS.home.searchPlaceholder).toBe('Search for Tables, Database, Schema...');
    expect(enUS.home.activityEmptyTitle).toBe('No Recent Activity');
    expect(zhCN.home.welcome).toBe('欢迎，{name}!');
    expect(enUS.chrome.searchPlaceholder).toBe('Search for Data Assets');
    expect(enUS.chrome.logout).toBe('Logout');
    expect(enUS.login.submit).toBe('Sign In');
    expect(enUS.nav.dataProducts).toBe('Data Products');
    expect(enUS.nav.testCases).toBe('Test Cases');
    expect(enUS.nav.govern).toBe('Govern');
    expect(enUS.nav.glossary).toBe('Glossary');
    expect(enUS.nav.incidentManager).toBe('Incident Manager');
    expect(enUS.nav.columnBulkOps).toBe('Column Bulk Ops (Beta)');
    expect(enUS.nav.marketplace).toBe('Data Marketplace');
    expect(zhCN.nav.govern).toBe('治理');
    expect(zhCN.nav.contextCenter).toBe('上下文中心');
    expect(enUS.crud.displayName).toBe('Display Name');
    expect(enUS.asset.tabs.customProperties).toBe('Custom Properties');
    expect(zhCN.chrome.logout).toBe('退出');
    expect(zhCN.login.submit).toBe('登入');
    expect(zhCN.nav.lineage).toBe('血缘关系');
    expect(zhCN.nav.governance).toBe('数据治理');
    expect(zhCN.nav.glossaries).toBe('术语库');
    expect(zhCN.crud.create).toBe('新建');
    expect(enUS.crud.fieldRequired).toBe('{field} is required');
    expect(enUS.crud.fieldRequiredPlain).toBe('This field is required');
    expect(enUS.crud.empty).toBe('No data');
    expect(enUS.crud.emptyHint).toBe('Adding a new record is easy, just give it a spin!');
    expect(enUS.crud.deleteTitle).toBe('Delete');
    expect(enUS.ingestion.services.deleteConfirm).toMatch(/cannot be undone/);
    expect(enUS.observability.incidents.statusAck).toBe('Acknowledged');
    expect(enUS.observability.incidents.statusResolved).toBe('Resolved');
    expect(enUS.home.hiUser).toBe('Hi {user}');
    expect(enUS.home.subtitle).toBe("Here's what needs your attention across your data.");
    expect(enUS.home.topicsTitle).toBe('Topics to catch up on');
    expect(enUS.home.noActiveAnnouncements).toBe('No Active Announcements');
    expect(enUS.home.widgets.yoursAndFollowed).toBe('Yours and Followed');
    expect(zhCN.home.hiUser).toBe('你好 {user}');
    expect(zhCN.home.topicsTitle).toBe('需要了解的主题');
    expect(enUS.insights.kpisEmpty).toBe(
      'Define key performance indicators to monitor impact and drive smarter decisions.',
    );
    expect(zhCN.crud.fieldRequired).toBe('需要{field}');
    expect(zhCN.crud.fieldRequiredPlain).toBe('此字段为必填项');
    expect(zhCN.observability.incidents.statusAck).toBe('已确认');
    expect(zhCN.observability.incidents.statusResolved).toBe('已解决');
  });

  it('replaces Batch 2 page leads with OM-style help copy, not API tutorials', () => {
    expect(enUS.login.lead).toBe('Sign in with your catalog account.');
    expect(enUS.login.lead).not.toMatch(/Base64/i);
    expect(enUS.explore.lead).toBe('Discover data assets. Use filters to narrow results.');
    expect(enUS.explore.lead).not.toMatch(/GET \/api/);
    expect(enUS.asset.profilerLead).not.toMatch(/GET \/api/);
    expect(enUS.asset.sampleLead).toBe('Sample Data from this table.');
    expect(enUS.asset.qualityLead).not.toMatch(/GET \/api/);
    expect(enUS.insights.lead).not.toMatch(/GET \/api/);
    expect(enUS.lineage.platformLead).toBe('Search a catalog asset to open its lineage graph.');
    expect(enUS.lineage.platformLead).not.toMatch(/platform-wide/);
    expect(enUS.admin.users.lead).toBe('Create and manage users.');
    expect(enUS.admin.teams.lead).not.toMatch(/GET \/api/);
    expect(enUS.admin.roles.lead).toBe('Roles are assigned to users. A role is a collection of policies.');
    expect(enUS.governance.glossaries.lead).toBe('Define concepts in plain business language.');
    expect(enUS.observability.alerts.lead).toBe('Stay current with timely alerts using webhooks.');
    expect(enUS.settings.residual.appearance).toMatch(/residual|read-only|theme/i);
    expect(enUS.settings.residual.sso).toMatch(/SSO/);
    expect(zhCN.login.lead).toBe('使用目录账号登入。');
    expect(zhCN.explore.lead).not.toMatch(/GET \/api/);
  });

  it('replaces Batch 3 tab and settings leads with OM-style help, not API tutorials', () => {
    const apiTutorial = /GET \/api|POST \/api|PUT \/api|PATCH \/api|RFC 6902/i;
    expect(enUS.asset.lineageLead).toBe('Upstream and downstream lineage for this asset.');
    expect(enUS.asset.activityLead).not.toMatch(apiTutorial);
    expect(enUS.asset.conversationsLead).not.toMatch(apiTutorial);
    expect(enUS.asset.customPropertiesLead).not.toMatch(apiTutorial);
    expect(enUS.asset.chartsLead).not.toMatch(apiTutorial);
    expect(enUS.asset.featuresLead).not.toMatch(apiTutorial);
    expect(enUS.asset.tasksLead).not.toMatch(apiTutorial);
    expect(enUS.asset.executionsLead).not.toMatch(apiTutorial);
    expect(enUS.asset.codeLead).not.toMatch(apiTutorial);
    expect(enUS.asset.rowCountChartLead).not.toMatch(apiTutorial);
    expect(enUS.asset.usageChartLead).not.toMatch(apiTutorial);
    expect(enUS.asset.testStatusChartLead).not.toMatch(apiTutorial);
    expect(enUS.asset.resultsChartLead).not.toMatch(apiTutorial);
    expect(enUS.lineage.graphLead).not.toMatch(apiTutorial);
    expect(enUS.lineage.tabLead).not.toMatch(apiTutorial);
    expect(enUS.collaboration.activity.lead).not.toMatch(apiTutorial);
    expect(enUS.collaboration.tasks.lead).not.toMatch(apiTutorial);
    expect(enUS.collaboration.task.resolveLead).not.toMatch(apiTutorial);
    expect(enUS.collaboration.announcements.lead).not.toMatch(apiTutorial);
    expect(enUS.settings.system.lead).not.toMatch(apiTutorial);
    expect(enUS.settings.system.loginLead).not.toMatch(apiTutorial);
    expect(enUS.settings.system.emailLead).not.toMatch(apiTutorial);
    expect(enUS.settings.customProperties.lead).not.toMatch(apiTutorial);
    expect(enUS.settings.customProperties.detailLead).not.toMatch(apiTutorial);
    expect(enUS.admin.users.rolesLead).not.toMatch(apiTutorial);
    expect(enUS.ingestion.pipelines.detailLead).not.toMatch(apiTutorial);
    expect(enUS.ingestion.services.connectionJsonHelp).toMatch(/JSON/i);
    expect(enUS.settings.residual.appearance).toMatch(/theme|read-only/i);
    expect(enUS.settings.residual.applications).toMatch(/wired|residual/i);
    expect(enUS.settings.residual.sso).toMatch(/SSO/);
    expect(enUS.settings.residual.persona).toMatch(/persona/i);
    expect(enUS.settings.residual.inbox).toMatch(/inbox|Activity|Tasks/i);
    expect(zhCN.asset.activityLead).not.toMatch(apiTutorial);
    expect(zhCN.collaboration.activity.lead).not.toMatch(apiTutorial);
    expect(zhCN.settings.system.lead).not.toMatch(apiTutorial);
    expect(zhCN.settings.customProperties.lead).not.toMatch(apiTutorial);
  });

  it('keeps leftover API placeholders literal after vue-i18n compile', () => {
    const i18n = createTestI18n('en-US');
    const t = i18n.global.t;
    expect(t('connection.password')).toContain('${ENV}');
    expect(t('connection.secretHint')).toContain('${VAR}');

    const zh = createTestI18n('zh-CN');
    expect(zh.global.t('connection.password')).toContain('${ENV}');
    expect(zh.global.t('connection.secretHint')).toContain('${VAR}');
  });
});
