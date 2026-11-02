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
/**
 * Route views are lazy-loaded (R8 code-splitting): the shell stays in the
 * entry chunk, each view becomes its own chunk, so the initial download
 * no longer carries all 89 views. vue-router resolves these async
 * components natively; no view is referenced anywhere except as a route
 * component, so this conversion changes no route behaviour.
 */
const AssetDetailView = () => import('@/views/AssetDetailView.vue');
const AssetVersionView = () => import('@/views/shell/AssetVersionView.vue');
const InsightsView = () => import('@/views/insights/InsightsView.vue');
const DataAssetsView = () => import('@/views/insights/DataAssetsView.vue');
const AppAnalyticsView = () => import('@/views/insights/AppAnalyticsView.vue');
const KpiListView = () => import('@/views/insights/KpiListView.vue');
const KpiDetailView = () => import('@/views/insights/KpiDetailView.vue');
const KpiFormView = () => import('@/views/insights/KpiFormView.vue');
const OnlineUsersView = () => import('@/views/insights/OnlineUsersView.vue');
const MyDataView = () => import('@/views/home/MyDataView.vue');
const LineageHomeView = () => import('@/views/LineageHomeView.vue');
const LineageView = () => import('@/views/LineageView.vue');
const BotDetailView = () => import('@/views/admin/BotDetailView.vue');
const BotsListView = () => import('@/views/admin/BotsListView.vue');
const LoginView = () => import('@/views/LoginView.vue');
const SignUpView = () => import('@/views/auth/SignUpView.vue');
const ForgotPasswordView = () => import('@/views/auth/ForgotPasswordView.vue');
const ResetPasswordView = () => import('@/views/auth/ResetPasswordView.vue');
const SamlCallbackView = () => import('@/views/auth/SamlCallbackView.vue');
const SsoSignUpView = () => import('@/views/auth/SsoSignUpView.vue');
const RegistrationConfirmationView = () => import('@/views/auth/RegistrationConfirmationView.vue');
const LogoutView = () => import('@/views/auth/LogoutView.vue');
const RoleDetailView = () => import('@/views/admin/RoleDetailView.vue');
const RolesListView = () => import('@/views/admin/RolesListView.vue');
const SearchView = () => import('@/views/SearchView.vue');
const AppDetailView = () => import('@/views/admin/AppDetailView.vue');
const AppsListView = () => import('@/views/admin/AppsListView.vue');
const CustomPropertyTypeDetailView = () => import('@/views/admin/CustomPropertyTypeDetailView.vue');
const CustomPropertyTypesListView = () => import('@/views/admin/CustomPropertyTypesListView.vue');
const PoliciesListView = () => import('@/views/admin/PoliciesListView.vue');
const PolicyDetailView = () => import('@/views/admin/PolicyDetailView.vue');
const PolicyRuleFormView = () => import('@/views/admin/PolicyRuleFormView.vue');
const AuditLogsView = () => import('@/views/admin/AuditLogsView.vue');
const SettingsHubView = () => import('@/views/admin/SettingsHubView.vue');
const SystemSettingsView = () => import('@/views/admin/SystemSettingsView.vue');
const AppearanceSettingsView = () => import('@/views/admin/AppearanceSettingsView.vue');
const AppModeConfigView = () => import('@/views/admin/AppModeConfigView.vue');
const DataQualityDimensionsView = () => import('@/views/admin/DataQualityDimensionsView.vue');
const EmailConfigurationView = () => import('@/views/admin/EmailConfigurationView.vue');
const EntityRulesSettingsView = () => import('@/views/admin/EntityRulesSettingsView.vue');
const GlossarySettingsView = () => import('@/views/admin/GlossarySettingsView.vue');
const LearningResourcesView = () => import('@/views/admin/LearningResourcesView.vue');
const LineageConfigView = () => import('@/views/admin/LineageConfigView.vue');
const LoginConfigurationView = () => import('@/views/admin/LoginConfigurationView.vue');
const OmHealthView = () => import('@/views/admin/OmHealthView.vue');
const OmUrlConfigView = () => import('@/views/admin/OmUrlConfigView.vue');
const ProfilerConfigurationView = () => import('@/views/admin/ProfilerConfigurationView.vue');
const SearchEntitySettingsView = () => import('@/views/admin/SearchEntitySettingsView.vue');
const SearchSettingsView = () => import('@/views/admin/SearchSettingsView.vue');
const TimeFormatSettingsView = () => import('@/views/admin/TimeFormatSettingsView.vue');

const TeamDetailView = () => import('@/views/admin/TeamDetailView.vue');
const TeamsListView = () => import('@/views/admin/TeamsListView.vue');
const UserDetailView = () => import('@/views/admin/UserDetailView.vue');
const UsersListView = () => import('@/views/admin/UsersListView.vue');
const ClassificationDetailView = () => import('@/views/governance/ClassificationDetailView.vue');
const ClassificationsListView = () => import('@/views/governance/ClassificationsListView.vue');
const DataProductDetailView = () => import('@/views/governance/DataProductDetailView.vue');
const DataProductsListView = () => import('@/views/governance/DataProductsListView.vue');
const DomainDetailView = () => import('@/views/governance/DomainDetailView.vue');
const DomainsListView = () => import('@/views/governance/DomainsListView.vue');
const GlossariesListView = () => import('@/views/governance/GlossariesListView.vue');
const MetricsListView = () => import('@/views/governance/MetricsListView.vue');
const MetricDetailView = () => import('@/views/governance/MetricDetailView.vue');
const GlossaryDetailView = () => import('@/views/governance/GlossaryDetailView.vue');
const GlossaryTermDetailView = () => import('@/views/governance/GlossaryTermDetailView.vue');
const TagDetailView = () => import('@/views/governance/TagDetailView.vue');
const AlertDetailView = () => import('@/views/observability/AlertDetailView.vue');
const AlertsListView = () => import('@/views/observability/AlertsListView.vue');
const IncidentDetailView = () => import('@/views/observability/IncidentDetailView.vue');
const IncidentsListView = () => import('@/views/observability/IncidentsListView.vue');
const DataQualityLandingView = () => import('@/views/quality/DataQualityLandingView.vue');
const TestCaseDetailView = () => import('@/views/quality/TestCaseDetailView.vue');
const TestDefinitionDetailView = () => import('@/views/quality/TestDefinitionDetailView.vue');
const TestDefinitionsListView = () => import('@/views/quality/TestDefinitionsListView.vue');
const TestSuiteDetailView = () => import('@/views/quality/TestSuiteDetailView.vue');
const EditPipelineView = () => import('@/views/ingestion/EditPipelineView.vue');
const PipelineDetailView = () => import('@/views/ingestion/PipelineDetailView.vue');
const PipelinesListView = () => import('@/views/ingestion/PipelinesListView.vue');
const AddServiceView = () => import('@/views/ingestion/AddServiceView.vue');
const EditServiceConnectionView = () => import('@/views/ingestion/EditServiceConnectionView.vue');
const ServiceDetailView = () => import('@/views/ingestion/ServiceDetailView.vue');
const ServicesListView = () => import('@/views/ingestion/ServicesListView.vue');
const ActivityFeedView = () => import('@/views/collaboration/ActivityFeedView.vue');
const AnnouncementsListView = () => import('@/views/collaboration/AnnouncementsListView.vue');
const TaskDetailView = () => import('@/views/collaboration/TaskDetailView.vue');
const TasksListView = () => import('@/views/collaboration/TasksListView.vue');
const ResidualPage = () => import('@/views/shell/ResidualPage.vue');
const ForbiddenView = () => import('@/views/shell/ForbiddenView.vue');
const NotFoundView = () => import('@/views/shell/NotFoundView.vue');
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
      path: '/signup',
      name: 'signup',
      component: SignUpView,
      meta: { public: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
      meta: { public: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPasswordView,
      meta: { public: true },
    },
    {
      path: '/saml-callback',
      name: 'saml-callback',
      component: SamlCallbackView,
      meta: { public: true },
    },
    {
      path: '/signup/sso',
      name: 'sso-signup',
      component: SsoSignUpView,
      meta: { public: true },
    },
    {
      path: '/users/registrationConfirmation',
      name: 'registration-confirmation',
      component: RegistrationConfirmationView,
      meta: { public: true },
    },
    {
      path: '/logout',
      name: 'logout',
      component: LogoutView,
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
        { path: 'insights/data-assets', name: 'insights-data-assets', component: DataAssetsView },
        { path: 'insights/app-analytics', name: 'insights-app-analytics', component: AppAnalyticsView },
        { path: 'insights/kpis', name: 'insights-kpis', component: KpiListView },
        { path: 'insights/kpis/add', name: 'insights-kpis-add', component: KpiFormView },
        { path: 'insights/kpis/:fqn', name: 'insights-kpi-detail', component: KpiDetailView, props: true },
        {
          path: 'insights/kpis/:fqn/edit',
          name: 'insights-kpis-edit',
          component: KpiFormView,
          props: true,
        },
        { path: 'insights/online-users', name: 'insights-online-users', component: OnlineUsersView },
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
        { path: 'admin/settings/audit-logs', name: 'admin-settings-audit-logs', component: AuditLogsView },
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
        { path: 'admin/policies/:id/rules/add', name: 'admin-policy-rule-add', component: PolicyRuleFormView, props: true },
        {
          path: 'admin/policies/:id/rules/:ruleName/edit',
          name: 'admin-policy-rule-edit',
          component: PolicyRuleFormView,
          props: true,
        },
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
        {
          path: 'governance/metrics/:fqn',
          name: 'governance-metric',
          component: MetricDetailView,
          props: true,
        },
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
        { path: 'ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: 'ingestion/services/:kind/:id/connection',
          name: 'ingestion-service-connection',
          component: EditServiceConnectionView,
          props: true,
        },
        {
          path: 'ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: ServiceDetailView,
          props: true,
        },
        { path: 'ingestion/pipelines', name: 'ingestion-pipelines', component: PipelinesListView },
        {
          path: 'ingestion/pipelines/:id/edit',
          name: 'ingestion-pipeline-edit',
          component: EditPipelineView,
          props: true,
        },
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
