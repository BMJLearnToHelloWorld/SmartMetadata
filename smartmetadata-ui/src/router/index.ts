/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { loadSession } from '@/auth/token';
import { RESIDUAL_PAGES } from '@/layouts/residualPages';
import AppShell from '@/layouts/AppShell.vue';
import AssetDetailView from '@/views/AssetDetailView.vue';
import AssetVersionView from '@/views/shell/AssetVersionView.vue';
import InsightsView from '@/views/insights/InsightsView.vue';
import MyDataView from '@/views/home/MyDataView.vue';
import LineageHomeView from '@/views/LineageHomeView.vue';
import LineageView from '@/views/LineageView.vue';
import BotDetailView from '@/views/admin/BotDetailView.vue';
import BotsListView from '@/views/admin/BotsListView.vue';
import LoginView from '@/views/LoginView.vue';
import RoleDetailView from '@/views/admin/RoleDetailView.vue';
import RolesListView from '@/views/admin/RolesListView.vue';
import SearchView from '@/views/SearchView.vue';
import AppDetailView from '@/views/admin/AppDetailView.vue';
import AppsListView from '@/views/admin/AppsListView.vue';
import CustomPropertyTypeDetailView from '@/views/admin/CustomPropertyTypeDetailView.vue';
import CustomPropertyTypesListView from '@/views/admin/CustomPropertyTypesListView.vue';
import PoliciesListView from '@/views/admin/PoliciesListView.vue';
import PolicyDetailView from '@/views/admin/PolicyDetailView.vue';
import SettingsHubView from '@/views/admin/SettingsHubView.vue';
import SystemSettingsView from '@/views/admin/SystemSettingsView.vue';
import AppearanceSettingsView from '@/views/admin/AppearanceSettingsView.vue';
import AppModeConfigView from '@/views/admin/AppModeConfigView.vue';
import DataQualityDimensionsView from '@/views/admin/DataQualityDimensionsView.vue';
import EmailConfigurationView from '@/views/admin/EmailConfigurationView.vue';
import EntityRulesSettingsView from '@/views/admin/EntityRulesSettingsView.vue';
import GlossarySettingsView from '@/views/admin/GlossarySettingsView.vue';
import LearningResourcesView from '@/views/admin/LearningResourcesView.vue';
import LineageConfigView from '@/views/admin/LineageConfigView.vue';
import LoginConfigurationView from '@/views/admin/LoginConfigurationView.vue';
import OmHealthView from '@/views/admin/OmHealthView.vue';
import OmUrlConfigView from '@/views/admin/OmUrlConfigView.vue';
import ProfilerConfigurationView from '@/views/admin/ProfilerConfigurationView.vue';
import SearchEntitySettingsView from '@/views/admin/SearchEntitySettingsView.vue';
import SearchSettingsView from '@/views/admin/SearchSettingsView.vue';
import TimeFormatSettingsView from '@/views/admin/TimeFormatSettingsView.vue';

import TeamDetailView from '@/views/admin/TeamDetailView.vue';
import TeamsListView from '@/views/admin/TeamsListView.vue';
import UserDetailView from '@/views/admin/UserDetailView.vue';
import UsersListView from '@/views/admin/UsersListView.vue';
import ClassificationDetailView from '@/views/governance/ClassificationDetailView.vue';
import ClassificationsListView from '@/views/governance/ClassificationsListView.vue';
import DataProductDetailView from '@/views/governance/DataProductDetailView.vue';
import DataProductsListView from '@/views/governance/DataProductsListView.vue';
import DomainDetailView from '@/views/governance/DomainDetailView.vue';
import DomainsListView from '@/views/governance/DomainsListView.vue';
import GlossariesListView from '@/views/governance/GlossariesListView.vue';
import MetricsListView from '@/views/governance/MetricsListView.vue';
import GlossaryDetailView from '@/views/governance/GlossaryDetailView.vue';
import GlossaryTermDetailView from '@/views/governance/GlossaryTermDetailView.vue';
import TagDetailView from '@/views/governance/TagDetailView.vue';
import AlertDetailView from '@/views/observability/AlertDetailView.vue';
import AlertsListView from '@/views/observability/AlertsListView.vue';
import IncidentDetailView from '@/views/observability/IncidentDetailView.vue';
import IncidentsListView from '@/views/observability/IncidentsListView.vue';
import DataQualityLandingView from '@/views/quality/DataQualityLandingView.vue';
import TestCaseDetailView from '@/views/quality/TestCaseDetailView.vue';
import TestDefinitionDetailView from '@/views/quality/TestDefinitionDetailView.vue';
import TestDefinitionsListView from '@/views/quality/TestDefinitionsListView.vue';
import TestSuiteDetailView from '@/views/quality/TestSuiteDetailView.vue';
import PipelineDetailView from '@/views/ingestion/PipelineDetailView.vue';
import PipelinesListView from '@/views/ingestion/PipelinesListView.vue';
import ServiceDetailView from '@/views/ingestion/ServiceDetailView.vue';
import ServicesListView from '@/views/ingestion/ServicesListView.vue';
import ActivityFeedView from '@/views/collaboration/ActivityFeedView.vue';
import AnnouncementsListView from '@/views/collaboration/AnnouncementsListView.vue';
import TaskDetailView from '@/views/collaboration/TaskDetailView.vue';
import TasksListView from '@/views/collaboration/TasksListView.vue';
import ResidualPage from '@/views/shell/ResidualPage.vue';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';
import NotFoundView from '@/views/shell/NotFoundView.vue';
import { resolveGuard } from '@/router/guards';
import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: { name: 'home' } },
        { path: 'my-data', name: 'home', component: MyDataView, meta: { flush: true } },
        { path: 'search', name: 'search', component: SearchView },
        {
          path: 'assets/:entityType/:fqn',
          name: 'asset',
          component: AssetDetailView,
          props: true,
        },
        {
          path: 'assets/:entityType/:fqn/versions',
          name: 'asset-version',
          component: AssetVersionView,
          props: true,
        },
        { path: 'insights', name: 'insights', component: InsightsView },
        { path: 'lineage', name: 'lineage-home', component: LineageHomeView },
        {
          path: 'lineage/:entityType/:fqn',
          name: 'lineage',
          component: LineageView,
          props: true,
        },
        { path: 'admin/users', name: 'admin-users', component: UsersListView },
        { path: 'admin/users/:id', name: 'admin-user', component: UserDetailView, props: true },
        { path: 'admin/teams', name: 'admin-teams', component: TeamsListView },
        { path: 'admin/teams/:id', name: 'admin-team', component: TeamDetailView, props: true },
        { path: 'admin/roles', name: 'admin-roles', component: RolesListView },
        { path: 'admin/roles/:id', name: 'admin-role', component: RoleDetailView, props: true },
        { path: 'admin/bots', name: 'admin-bots', component: BotsListView },
        { path: 'admin/bots/:id', name: 'admin-bot', component: BotDetailView, props: true },
        { path: 'admin/settings', name: 'admin-settings', component: SettingsHubView },
        { path: 'admin/settings/system', name: 'admin-settings-system', component: SystemSettingsView },
        { path: 'admin/settings/preferences/appearance', name: 'settings-preferences-appearance', component: AppearanceSettingsView },
        { path: 'admin/settings/preferences/email', name: 'settings-preferences-email', component: EmailConfigurationView },
        { path: 'admin/settings/preferences/login', name: 'settings-preferences-login', component: LoginConfigurationView },
        { path: 'admin/settings/preferences/health', name: 'settings-preferences-health', component: OmHealthView },
        { path: 'admin/settings/preferences/profiler', name: 'settings-preferences-profiler', component: ProfilerConfigurationView },
        { path: 'admin/settings/preferences/dq-dimensions', name: 'settings-preferences-dq-dimensions', component: DataQualityDimensionsView },
        { path: 'admin/settings/preferences/search', name: 'settings-preferences-search', component: SearchSettingsView },
        {
          path: 'admin/settings/preferences/search/:entityType',
          name: 'settings-preferences-search-entity',
          component: SearchEntitySettingsView,
          props: true,
        },
        { path: 'admin/settings/preferences/lineage', name: 'settings-preferences-lineage', component: LineageConfigView },
        { path: 'admin/settings/preferences/om-url', name: 'settings-preferences-om-url', component: OmUrlConfigView },
        { path: 'admin/settings/preferences/entity-rules', name: 'settings-preferences-entity-rules', component: EntityRulesSettingsView },
        { path: 'admin/settings/preferences/learning', name: 'settings-preferences-learning', component: LearningResourcesView },
        { path: 'admin/settings/preferences/app-mode', name: 'settings-preferences-app-mode', component: AppModeConfigView },
        { path: 'admin/settings/preferences/glossary', name: 'settings-preferences-glossary', component: GlossarySettingsView },
        { path: 'admin/settings/preferences/time-format', name: 'settings-preferences-time-format', component: TimeFormatSettingsView },

        { path: 'admin/policies', name: 'admin-policies', component: PoliciesListView },
        { path: 'admin/policies/:id', name: 'admin-policy', component: PolicyDetailView, props: true },
        { path: 'admin/apps', name: 'admin-apps', component: AppsListView },
        { path: 'admin/apps/:id', name: 'admin-app', component: AppDetailView, props: true },
        {
          path: 'admin/settings/custom-properties',
          name: 'admin-settings-custom-properties',
          component: CustomPropertyTypesListView,
        },
        {
          path: 'admin/settings/custom-properties/:entityType',
          name: 'admin-settings-custom-property-type',
          component: CustomPropertyTypeDetailView,
          props: true,
        },
        { path: 'governance/glossaries', name: 'governance-glossaries', component: GlossariesListView },
        {
          path: 'governance/glossaries/:id',
          name: 'governance-glossary',
          component: GlossaryDetailView,
          props: true,
        },
        {
          path: 'governance/terms/:id',
          name: 'governance-term',
          component: GlossaryTermDetailView,
          props: true,
        },
        {
          path: 'governance/classifications',
          name: 'governance-classifications',
          component: ClassificationsListView,
        },
        {
          path: 'governance/classifications/:id',
          name: 'governance-classification',
          component: ClassificationDetailView,
          props: true,
        },
        { path: 'governance/tags/:id', name: 'governance-tag', component: TagDetailView, props: true },
        { path: 'governance/domains', name: 'governance-domains', component: DomainsListView },
        {
          path: 'governance/domains/:id',
          name: 'governance-domain',
          component: DomainDetailView,
          props: true,
        },
        {
          path: 'governance/data-products',
          name: 'governance-data-products',
          component: DataProductsListView,
        },
        {
          path: 'governance/data-products/:id',
          name: 'governance-data-product',
          component: DataProductDetailView,
          props: true,
        },
        { path: 'governance/metrics', name: 'governance-metrics', component: MetricsListView },
        ...RESIDUAL_PAGES.map((page) => ({
          path: page.path,
          name: page.name,
          component: ResidualPage,
          meta: { ...page },
        })),
        {
          path: 'quality/test-definitions',
          name: 'quality-test-definitions',
          component: TestDefinitionsListView,
        },
        {
          path: 'quality/test-definitions/:id',
          name: 'quality-test-definition',
          component: TestDefinitionDetailView,
          props: true,
        },
        { path: 'quality/test-cases', name: 'quality-test-cases', component: DataQualityLandingView },
        {
          path: 'quality/test-cases/:id',
          name: 'quality-test-case',
          component: TestCaseDetailView,
          props: true,
        },
        {
          path: 'quality/test-suites',
          name: 'quality-test-suites',
          redirect: (to) => ({
            name: 'quality-test-cases',
            query: { ...to.query, tab: 'test-suites' },
          }),
        },
        {
          path: 'quality/test-suites/:id',
          name: 'quality-test-suite',
          component: TestSuiteDetailView,
          props: true,
        },
        {
          path: 'observability/incidents',
          name: 'observability-incidents',
          component: IncidentsListView,
        },
        {
          path: 'observability/incidents/:id',
          name: 'observability-incident',
          component: IncidentDetailView,
          props: true,
        },
        { path: 'observability/alerts', name: 'observability-alerts', component: AlertsListView },
        {
          path: 'observability/alerts/:id',
          name: 'observability-alert',
          component: AlertDetailView,
          props: true,
        },
        { path: 'ingestion/services', name: 'ingestion-services', component: ServicesListView },
        {
          path: 'ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: ServiceDetailView,
          props: true,
        },
        { path: 'ingestion/pipelines', name: 'ingestion-pipelines', component: PipelinesListView },
        {
          path: 'ingestion/pipelines/:id',
          name: 'ingestion-pipeline',
          component: PipelineDetailView,
          props: true,
        },
        { path: 'activity', name: 'activity', component: ActivityFeedView },
        { path: 'tasks', name: 'tasks', component: TasksListView },
        { path: 'tasks/:id', name: 'task', component: TaskDetailView, props: true },
        { path: 'announcements', name: 'announcements', component: AnnouncementsListView },
        { path: 'forbidden', name: 'forbidden', component: ForbiddenView },
        { path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundView },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const decision = resolveGuard({
    isPublic: to.meta.public === true,
    hasSession: loadSession(window.localStorage) !== null,
    fullPath: to.fullPath,
  });
  if (decision.kind === 'login') {
    return { name: 'login', query: { redirect: decision.redirect } };
  }
  if (decision.kind === 'forbidden') {
    return { name: 'forbidden' };
  }
  return true;
});
