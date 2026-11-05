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
const PermissionDebuggerView = () => import('@/views/admin/PermissionDebuggerView.vue');
const AuditLogsView = () => import('@/views/admin/AuditLogsView.vue');
const SsoSettingsView = () => import('@/views/admin/SsoSettingsView.vue');
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
const AddServiceIngestionView = () => import('@/views/ingestion/AddServiceIngestionView.vue');
const TestSuiteIngestionView = () => import('@/views/quality/TestSuiteIngestionView.vue');
const QueryFullScreenView = () => import('@/views/QueryFullScreenView.vue');
const AddQueryView = () => import('@/views/AddQueryView.vue');
const ServicesListView = () => import('@/views/ingestion/ServicesListView.vue');
const ActivityFeedView = () => import('@/views/collaboration/ActivityFeedView.vue');
const AnnouncementsListView = () => import('@/views/collaboration/AnnouncementsListView.vue');
const TaskDetailView = () => import('@/views/collaboration/TaskDetailView.vue');
const DataAccessRequestsView = () => import('@/views/collaboration/DataAccessRequestsView.vue');
const DataAccessRequestCreateView = () => import('@/views/collaboration/DataAccessRequestCreateView.vue');
const InboxView = () => import('@/views/inbox/InboxView.vue');
const TasksListView = () => import('@/views/collaboration/TasksListView.vue');
const ContextCenterOverviewView = () => import('@/views/contextCenter/ContextCenterOverviewView.vue');
const ContextCenterArticlesView = () => import('@/views/contextCenter/ContextCenterArticlesView.vue');
const KnowledgePageVersionView = () =>
  import('@/views/contextCenter/KnowledgePageVersionView.vue');
const ContextCenterDocumentsView = () =>
  import('@/views/contextCenter/ContextCenterDocumentsView.vue');
const ContextCenterMemoriesView = () => import('@/views/contextCenter/ContextCenterMemoriesView.vue');
const ContextCenterFilterView = () => import('@/views/contextCenter/ContextCenterFilterView.vue');
const ContextCenterIntegrationsView = () =>
  import('@/views/contextCenter/ContextCenterIntegrationsView.vue');
const ContextCenterAiContextView = () =>
  import('@/views/contextCenter/ContextCenterAiContextView.vue');
const ContextCenterArchiveView = () => import('@/views/contextCenter/ContextCenterArchiveView.vue');
const MarketplaceOverviewView = () => import('@/views/marketplace/MarketplaceOverviewView.vue');
const MarketplaceAppCatalogView = () => import('@/views/marketplace/MarketplaceAppCatalogView.vue');
const MarketplaceAppDetailView = () => import('@/views/marketplace/MarketplaceAppDetailView.vue');
const GlossaryTermRelationSettingsView = () =>
  import('@/views/admin/GlossaryTermRelationSettingsView.vue');
const OntologyExplorerView = () => import('@/views/governance/OntologyExplorerView.vue');
const OntologyStudioView = () => import('@/views/governance/OntologyStudioView.vue');
const GovernanceVersionView = () => import('@/views/governance/GovernanceVersionView.vue');
const WorkflowsView = () => import('@/views/governance/WorkflowsView.vue');
const WorkflowDetailView = () => import('@/views/governance/WorkflowDetailView.vue');
const AppInstallView = () => import('@/views/marketplace/AppInstallView.vue');
const IntakeFormsView = () => import('@/views/admin/IntakeFormsView.vue');
const TaskFormSettingsView = () => import('@/views/admin/TaskFormSettingsView.vue');
const PersonaListView = () => import('@/views/admin/PersonaListView.vue');
const PersonaDetailView = () => import('@/views/admin/PersonaDetailView.vue');
const PersonaCustomizeView = () => import('@/views/admin/persona/PersonaCustomizeView.vue');
const SparqlPlaygroundView = () => import('@/views/governance/SparqlPlaygroundView.vue');
const ColumnBulkOperationsView = () =>
  import('@/views/governance/ColumnBulkOperationsView.vue');
const BulkEntityImportView = () =>
  import('@/views/governance/BulkEntityImportView.vue');
const MetricBulkEditView = () =>
  import('@/views/governance/MetricBulkEditView.vue');
const DocsView = () => import('@/views/docs/DocsView.vue');
const TourStartView = () => import('@/views/tour/TourStartView.vue');
const PersonaLandingRedirect = () => import('@/views/shell/PersonaLandingRedirect.vue');
const ForbiddenView = () => import('@/views/shell/ForbiddenView.vue');
const NotFoundView = () => import('@/views/shell/NotFoundView.vue');
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import { ADMIN_ROUTE_RESOURCE, hasAdminEntryGrant, isAdminPath, resolveGuard } from '@/router/guards';
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
        // P2 B5: the root route resolves through the persona landing
        // redirect (entry-only; later visits resolve to Home).
        { path: '', component: PersonaLandingRedirect },
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
        // P2 B5: official Admins tab surface (UserListPageV1 isAdminPage);
        // no standalone Admins page exists officially, only the tab.
        { path: 'admin/users/admins', name: 'admin-admins', component: UsersListView },
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
        // P2 B R-5: official Settings/Users/AdminPermissionDebugger
        // (Access category): user search + evaluate + user permissions.
        {
          path: 'admin/settings/permission-debugger',
          name: 'admin-settings-permission-debugger',
          component: PermissionDebuggerView,
          meta: { titleKey: 'permissionDebugger.title' },
        },
        // P2 B5: official Settings SSO page (configuration page only).
        {
          path: 'admin/settings/sso',
          name: 'admin-settings-sso',
          component: SsoSettingsView,
          meta: { titleKey: 'sso.title' },
        },
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
        // P2 B5: Persona list + detail + customize (official settings
        // PERSONA routes; the customize route carries the category and
        // an optional govern entity type).
        { path: 'admin/settings/persona', name: 'admin-settings-persona', component: PersonaListView },
        {
          path: 'admin/settings/persona/:fqn',
          name: 'admin-settings-persona-detail',
          component: PersonaDetailView,
          props: true,
        },
        {
          path: 'admin/settings/persona/:fqn/customize/:category/:entity?',
          name: 'admin-settings-persona-customize',
          component: PersonaCustomizeView,
          props: true,
        },
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
        {
          path: 'governance/tags/:id/versions/:version',
          name: 'governance-tag-version',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'tag',
            id: route.params.id as string,
            version: route.params.version as string,
          }),
        },
        { path: 'governance/domains', name: 'governance-domains', component: DomainsListView },
        {
          path: 'governance/domains/:id',
          name: 'governance-domain',
          component: DomainDetailView,
          props: true,
        },
        {
          path: 'governance/domains/:id/versions/:version',
          name: 'governance-domain-version',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'domain',
            id: route.params.id as string,
            version: route.params.version as string,
          }),
        },
        {
          path: 'governance/glossaries/:id/versions/:version',
          name: 'governance-glossary-version',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'glossary',
            id: route.params.id as string,
            version: route.params.version as string,
          }),
        },
        {
          path: 'governance/terms/:id/versions/:version',
          name: 'governance-term-version',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'term',
            id: route.params.id as string,
            version: route.params.version as string,
          }),
        },
        {
          path: 'governance/terms/:id/versions/:version/:tab',
          name: 'governance-term-version-tab',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'term',
            id: route.params.id as string,
            version: route.params.version as string,
            tab: route.params.tab as string,
          }),
        },
        {
          path: 'governance/classifications/:id/versions/:version',
          name: 'governance-classification-version',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'classification',
            id: route.params.id as string,
            version: route.params.version as string,
          }),
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
        // P2 B1: the five context-center shells are real pages now; the
        // the former residual entries are real pages now.
        // The overview keeps its product path and gains the official
        // /context-center/overview path as an alias.
        {
          path: 'context-center',
          name: 'context-center-overview',
          component: ContextCenterOverviewView,
          alias: 'context-center/overview',
        },
        {
          path: 'context-center/articles',
          name: 'context-center-articles',
          component: ContextCenterArticlesView,
        },
        {
          path: 'context-center/articles/:fqn',
          name: 'context-center-article',
          component: ContextCenterArticlesView,
          meta: { titleKey: 'contextCenter.articles' },
        },
        // A17 article detail tab segments (official
        // CONTEXT_CENTER_ARTICLE_DETAIL_WITH_TAB*): the same view,
        // with :tab driving the detail tab and :subTab accepted and
        // preserved (official's detail component reads only tab).
        {
          path: 'context-center/articles/:fqn/:tab',
          name: 'context-center-article-tab',
          component: ContextCenterArticlesView,
          meta: { titleKey: 'contextCenter.articles' },
        },
        {
          path: 'context-center/articles/:fqn/:tab/:subTab',
          name: 'context-center-article-subtab',
          component: ContextCenterArticlesView,
          meta: { titleKey: 'contextCenter.articles' },
        },
        {
          path: 'context-center/articles/:fqn/versions/:version',
          name: 'context-center-article-version',
          component: KnowledgePageVersionView,
          meta: { titleKey: 'contextCenter.versionHistory' },
        },
        {
          path: 'context-center/documents',
          name: 'context-center-documents',
          component: ContextCenterDocumentsView,
        },
        {
          path: 'context-center/memories',
          name: 'context-center-memories',
          component: ContextCenterMemoriesView,
        },
        {
          path: 'context-center/filter',
          name: 'context-center-filter',
          component: ContextCenterFilterView,
          meta: { titleKey: 'contextCenter.filter' },
        },
        {
          path: 'context-center/integrations',
          name: 'context-center-integrations',
          component: ContextCenterIntegrationsView,
          meta: { titleKey: 'contextCenter.integrations' },
        },
        {
          path: 'context-center/ai-context',
          name: 'context-center-ai-context',
          component: ContextCenterAiContextView,
          meta: { titleKey: 'contextCenter.aiContext' },
        },
        {
          path: 'context-center/ai-context/:fqn',
          name: 'context-center-ai-context-detail',
          component: ContextCenterAiContextView,
          meta: { titleKey: 'contextCenter.aiContext' },
        },
        {
          path: 'context-center/archive',
          name: 'context-center-archive',
          component: ContextCenterArchiveView,
        },
        // P2 B2: the three remaining shells are real pages now; the
        // the former residual entries are real pages now.
        // Each keeps its product path and gains the official path as an alias.
        {
          path: 'marketplace',
          name: 'marketplace-overview',
          component: MarketplaceOverviewView,
          alias: 'data-marketplace',
        },
        {
          path: 'govern/ontology',
          name: 'ontology-explorer',
          component: OntologyExplorerView,
          alias: 'governance/ontology',
        },
        {
          path: 'govern/ontology/studio',
          name: 'ontology-studio',
          component: OntologyStudioView,
          meta: { titleKey: 'ontology.edit.studioTitle' },
        },
        {
          path: 'govern/workflows',
          name: 'workflows',
          component: WorkflowsView,
          alias: 'workflows',
        },
        // Fixes batch 1: official detail route WORKFLOWS_WITH_FQN_TAB
        // (/workflows/:fqn/:tab, default tab 'workflow'); the interactive
        // canvas editor is a later subsystem batch, not this route.
        {
          path: 'govern/workflows/:fqn/:tab',
          name: 'workflow-detail',
          component: WorkflowDetailView,
          alias: 'workflows/:fqn/:tab',
          props: true,
        },
        // A2 app catalog (official MarketPlacePage, /marketplace):
        // /marketplace itself already serves the data marketplace
        // (official /data-marketplace), so the catalog takes
        // marketplace/apps — the parent of the detail route below —
        // and the detail page's browse button points here.
        {
          path: 'marketplace/apps',
          name: 'marketplace-app-catalog',
          component: MarketplaceAppCatalogView,
          meta: { titleKey: 'apps.catalog.title' },
        },
        // P2 R-4: marketplace app detail (official
        // /marketplace/apps/:fqn). The install route below keeps its own
        // longer path, so the two never collide.
        {
          path: 'marketplace/apps/:fqn',
          name: 'marketplace-app-detail',
          component: MarketplaceAppDetailView,
          props: true,
          meta: { titleKey: 'apps.detail.title' },
        },
        // P2 B4: AppInstall (official /marketplace/apps/:fqn/install),
        // IntakeForms + TaskFormSettings (official settings governance
        // pages, kept under the product admin/settings tree with the
        // official settings path as alias), and SparqlPlayground
        // (official /governance/sparql, product govern/ prefix + alias).
        {
          path: 'marketplace/apps/:fqn/install',
          name: 'marketplace-app-install',
          component: AppInstallView,
          props: true,
          meta: { titleKey: 'apps.install.title' },
        },
        {
          path: 'admin/settings/governance/intake-forms',
          name: 'admin-settings-governance-intake-forms',
          component: IntakeFormsView,
          alias: 'settings/governance/intake-forms',
          meta: { titleKey: 'intakeForms.title' },
        },
        {
          path: 'admin/settings/governance/task-forms',
          name: 'admin-settings-governance-task-forms',
          component: TaskFormSettingsView,
          alias: 'settings/governance/task-forms',
          meta: { titleKey: 'taskForms.title' },
        },
        // A14 glossary-term relations (official SettingsRouter
        // GOVERNANCE + GLOSSARY_TERM_RELATIONS): same product-tree
        // placement and official-path alias as intake/task forms.
        {
          path: 'admin/settings/governance/glossary-term-relations',
          name: 'admin-settings-governance-glossary-term-relations',
          component: GlossaryTermRelationSettingsView,
          alias: 'settings/governance/glossary-term-relations',
          meta: { titleKey: 'settings.glossaryTermRelations.title' },
        },
        {
          path: 'govern/sparql',
          name: 'sparql-playground',
          component: SparqlPlaygroundView,
          alias: 'governance/sparql',
          meta: { titleKey: 'sparql.title' },
        },
        // P2 B5: official SWAGGER route ('/docs', constants.ts:195).
        {
          path: 'docs',
          name: 'docs',
          component: DocsView,
          meta: { titleKey: 'docs.title' },
        },
        // Fixes batch 1: column-bulk-ops is no longer a residual shell —
        // official COLUMN_BULK_OPERATIONS (/column-bulk-operations,
        // constants.ts:180) has a real page, so this route serves the
        // real grid view at the product's existing path.
        {
          path: 'govern/column-bulk-ops',
          name: 'column-bulk-ops',
          component: ColumnBulkOperationsView,
          alias: 'column-bulk-operations',
        },
        // Batch B slice 1: official ENTITY_IMPORT
        // (/bulk/import/:entityType/:fqn, constants.ts:340).
        {
          path: 'bulk/import/:entityType/:fqn',
          name: 'bulk-import',
          component: BulkEntityImportView,
          props: true,
          meta: { titleKey: 'bulkImport.title' },
        },
        // R-2 residuals: official bulk edit (BULK_EDIT_ENTITY
        // /bulk/edit/:entityType/:fqn, MetricListPage handleBulkEdit):
        // fqn === '*' is the collection scope; the listing page stores
        // the selected/filtered scope before navigating here.
        {
          path: 'bulk/edit/:entityType/:fqn',
          name: 'bulk-edit',
          component: MetricBulkEditView,
          props: true,
          meta: { titleKey: 'metricBulkEdit.title' },
        },
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
          path: 'quality/test-cases/:id/versions/:version',
          name: 'quality-test-case-version',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'testCase',
            id: route.params.id as string,
            version: route.params.version as string,
          }),
        },
        {
          path: 'quality/test-cases/:id/versions/:version/:tab',
          name: 'quality-test-case-version-tab',
          component: GovernanceVersionView,
          props: (route) => ({
            kind: 'testCase',
            id: route.params.id as string,
            version: route.params.version as string,
            tab: route.params.tab as string,
          }),
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
          path: 'quality/test-suites/:id/add-ingestion',
          name: 'quality-test-suite-add-ingestion',
          component: TestSuiteIngestionView,
          props: true,
        },
        {
          path: 'quality/test-suites/:id/edit-ingestion/:ingestionFqn',
          name: 'quality-test-suite-edit-ingestion',
          component: TestSuiteIngestionView,
          props: true,
        },
        {
          path: 'query-view/:fqn/:queryId',
          name: 'query-full-screen',
          component: QueryFullScreenView,
          props: true,
        },
        {
          path: 'query/:fqn/add-query',
          name: 'query-add',
          component: AddQueryView,
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
          path: 'ingestion/services/:kind/:id/add-ingestion/:ingestionType',
          name: 'ingestion-service-add-ingestion',
          component: AddServiceIngestionView,
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
        // P2 B5: official Inbox page (personal-space InboxPage).
        { path: 'inbox', name: 'inbox', component: InboxView, meta: { titleKey: 'inbox.title' } },
        // P2 B5: official /tour page (ProductTourPage): starts the tour.
        { path: 'tour', name: 'tour', component: TourStartView, meta: { titleKey: 'tour.title' } },
        { path: 'tasks', name: 'tasks', component: TasksListView },
        { path: 'tasks/:id', name: 'task', component: TaskDetailView, props: true },
        { path: 'data-access-requests', name: 'data-access-requests', component: DataAccessRequestsView, meta: { titleKey: 'collaboration.dataAccess.title' } },
        { path: 'data-access-requests/new', name: 'data-access-request-new', component: DataAccessRequestCreateView, meta: { titleKey: 'collaboration.dataAccess.createTitle' } },
        { path: 'announcements', name: 'announcements', component: AnnouncementsListView },
        // A20 announcement duplicate (official
        // SETTINGS_ANNOUNCEMENT_DUPLICATE): the list view reuses its
        // create form prefilled from the source announcement.
        {
          path: 'announcements/duplicate/:id',
          name: 'announcement-duplicate',
          component: AnnouncementsListView,
        },
        { path: 'forbidden', name: 'forbidden', component: ForbiddenView },
        { path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundView },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // N1 (M-Next): fresh-load admin race. On a fresh load the guard runs
  // before AppShell mounts, so auth.user is still null even though the
  // session is valid — the admin line would read "not admin" and an admin
  // opening an unmapped /admin/* route directly would land on /forbidden.
  // When the target is an admin path, a session exists, and the profile
  // has not loaded yet, wait for one refreshUser() first. A failed profile
  // fetch is NOT a grant (fail closed): user stays null and the dual line
  // below decides exactly as before. Unmapped routes stay admin-only by
  // design (see guards.ts); this only lets an actual admin be recognised
  // as one on first load — it does not admit non-admins.
  const session = loadSession(window.localStorage);
  if (isAdminPath(to.fullPath) && session !== null && auth.user === null) {
    try {
      await auth.refreshUser();
    } catch {
      // Fail closed: user stays null; resolveGuard decides below.
    }
  }
  const isAdminUser = auth.user?.isAdmin === true;
  // Admin dual line, second line: for mapped admin routes, a
  // view-or-better grant on the route's resource admits entry even
  // for non-admins (official AdminProtectedRoute hasPermission).
  // The permission store caches per principal, so repeat navigations
  // do not re-query. A failed query is NOT a grant (fail closed);
  // unmapped admin routes stay admin-only (see ADMIN_ROUTE_RESOURCE).
  let hasPermission: boolean | undefined;
  if (isAdminPath(to.fullPath) && !isAdminUser) {
    const resource = ADMIN_ROUTE_RESOURCE[to.name as string];
    if (resource) {
      try {
        const ops = await usePermissionStore().getResourcePermission(resource);
        hasPermission = hasAdminEntryGrant(ops);
      } catch {
        hasPermission = false;
      }
    }
  }
  const decision = resolveGuard({
    isPublic: to.meta.public === true,
    hasSession: session !== null,
    fullPath: to.fullPath,
    isAdminUser,
    hasPermission,
  });
  if (decision.kind === 'login') {
    return { name: 'login', query: { redirect: decision.redirect } };
  }
  if (decision.kind === 'forbidden') {
    return { name: 'forbidden' };
  }
  return true;
});
