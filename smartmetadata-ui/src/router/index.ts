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
import { officialEntityDetailGuard, OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN } from './entityDetailGuard';
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
const CustomizePageView = () => import('@/views/home/CustomizePageView.vue');
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
const ConnectionsView = () => import('@/views/connections/ConnectionsView.vue');
const AppDetailView = () => import('@/views/admin/AppDetailView.vue');
const AppsListView = () => import('@/views/admin/AppsListView.vue');
const CustomPropertyTypeDetailView = () => import('@/views/admin/CustomPropertyTypeDetailView.vue');
const PoliciesListView = () => import('@/views/admin/PoliciesListView.vue');
const PolicyDetailView = () => import('@/views/admin/PolicyDetailView.vue');
const AddPolicyRuleView = () => import('@/views/admin/AddPolicyRuleView.vue');
const EditPolicyRuleView = () => import('@/views/admin/EditPolicyRuleView.vue');
const AddRoleView = () => import('@/views/admin/AddRoleView.vue');
const AddPolicyView = () => import('@/views/admin/AddPolicyView.vue');
const ImportTeamsPage = () => import('@/views/admin/ImportTeamsPage.vue');
const CreateUserPage = () => import('@/views/admin/CreateUserPage.vue');
const PermissionDebuggerView = () => import('@/views/admin/PermissionDebuggerView.vue');
const AuditLogsView = () => import('@/views/admin/AuditLogsView.vue');
const SsoSettingsView = () => import('@/views/admin/SsoSettingsView.vue');
const SettingsHubView = () => import('@/views/admin/SettingsHubView.vue');
const SettingsCategoryView = () => import('@/views/admin/SettingsCategoryView.vue');
const SettingsServicesView = () => import('@/views/admin/SettingsServicesView.vue');
const AppearanceSettingsView = () => import('@/views/admin/AppearanceSettingsView.vue');
const AppModeConfigView = () => import('@/views/admin/AppModeConfigView.vue');
const DataQualityDimensionsView = () => import('@/views/admin/DataQualityDimensionsView.vue');
const EmailConfigurationView = () => import('@/views/admin/EmailConfigurationView.vue');
const EntityRulesSettingsView = () => import('@/views/admin/EntityRulesSettingsView.vue');
const GlossarySettingsView = () => import('@/views/admin/GlossarySettingsView.vue');
const LearningResourcesView = () => import('@/views/admin/LearningResourcesView.vue');
const LineageConfigView = () => import('@/views/admin/LineageConfigView.vue');
const LoginConfigurationView = () => import('@/views/admin/LoginConfigurationView.vue');
const EditLoginConfigurationView = () => import('@/views/admin/EditLoginConfigurationView.vue');
const OmHealthView = () => import('@/views/admin/OmHealthView.vue');
const OmUrlConfigView = () => import('@/views/admin/OmUrlConfigView.vue');
const ProfilerConfigurationView = () => import('@/views/admin/ProfilerConfigurationView.vue');
const SearchEntitySettingsView = () => import('@/views/admin/SearchEntitySettingsView.vue');
const SearchSettingsView = () => import('@/views/admin/SearchSettingsView.vue');
const TimeFormatSettingsView = () => import('@/views/admin/TimeFormatSettingsView.vue');

const TeamDetailView = () => import('@/views/admin/TeamDetailView.vue');
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
const AlertFormView = () => import('@/views/observability/AlertFormView.vue');
const IncidentDetailView = () => import('@/views/observability/IncidentDetailView.vue');
const IncidentsListView = () => import('@/views/observability/IncidentsListView.vue');
const DataQualityLandingView = () => import('@/views/quality/DataQualityLandingView.vue');
const TestCaseDetailView = () => import('@/views/quality/TestCaseDetailView.vue');
const TestCaseDimensionsView = () => import('@/views/quality/TestCaseDimensionsView.vue');
const TestDefinitionDetailView = () => import('@/views/quality/TestDefinitionDetailView.vue');
const TestDefinitionsListView = () => import('@/views/quality/TestDefinitionsListView.vue');
const TestSuiteDetailView = () => import('@/views/quality/TestSuiteDetailView.vue');
const EditPipelineView = () => import('@/views/ingestion/EditPipelineView.vue');
const PipelineDetailView = () => import('@/views/ingestion/PipelineDetailView.vue');
const AddServiceView = () => import('@/views/ingestion/AddServiceView.vue');
const EditServiceConnectionView = () => import('@/views/ingestion/EditServiceConnectionView.vue');
const ServiceDetailView = () => import('@/views/ingestion/ServiceDetailView.vue');
const ServiceVersionView = () => import('@/views/ingestion/ServiceVersionView.vue');
const AddServiceIngestionView = () => import('@/views/ingestion/AddServiceIngestionView.vue');
const QueryFullScreenView = () => import('@/views/QueryFullScreenView.vue');
const AddQueryView = () => import('@/views/AddQueryView.vue');
const ActivityFeedView = () => import('@/views/collaboration/ActivityFeedView.vue');
const AnnouncementsListView = () => import('@/views/collaboration/AnnouncementsListView.vue');
const AnnouncementFormView = () => import('@/views/collaboration/AnnouncementFormView.vue');
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
const NotFoundView = () => import('@/views/shell/NotFoundView.vue');
import type { OperationPermissions } from '@/api/permissions';
import { isLoginConfigurationApplicable, loadAuthProvider } from '@/settings/permissionRules';
import { useAuthStore } from '@/stores/auth';
import { principalKeyFor, useGuardDecisionStore } from '@/stores/guardDecision';
import { usePermissionStore } from '@/stores/permissions';
import {
  CREATE_USER_GUARD_DECLARATIONS,
  evaluateGuardDeclaration,
  guardDeclarationOf,
  guardDeclarationResources,
  membersTabGuard,
  resolveGuard,
} from '@/router/guards';
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
        // Stage D (G-11): the persona landing-page editor, admin-only
        // (explicit meta, C-4 §2.6 — never downgraded). `homepage` is
        // the alias pin renders the LandingPage editor for.
        {
          path: 'customize-page/:fqn/:pageFqn',
          name: 'customize-page',
          component: CustomizePageView,
          props: true,
          meta: { guard: 'admin-only' },
        },
        // D1 (B2-E5b): official EXPLORE '/explore'
        // (constants.ts:155) + EXPLORE_WITH_TAB '/explore/:tab'
        // (constants.ts:156); '/search' stays as an alias so old links
        // and stored landing pages keep resolving.
        { path: 'explore/:tab?', name: 'search', component: SearchView, alias: 'search' },
        // B-7(c): the aggregate Connections surface (pin
        // ConnectionsPage, RoutePosition.APP) — the retired
        // `ingestion/services` aggregate list lives here now.
        { path: 'connections', name: 'connections', component: ConnectionsView },
        { path: 'insights', name: 'insights', component: InsightsView },
        // G-10 (visual comparison): official DATA_INSIGHT_WITH_TAB
        // '/data-insights/:tab' with tab 'data-assets'
        // (DataInsightTabs.DATA_ASSETS='data-assets').
        { path: 'insights/data-assets', name: 'insights-data-assets', component: DataAssetsView, alias: 'data-insights/data-assets' },
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
        {
          path: 'settings/members/online-users',
          name: 'insights-online-users',
          component: OnlineUsersView,
          meta: { guard: 'none' },
        },
        { path: 'lineage', name: 'lineage-home', component: LineageHomeView },
        {
          path: 'lineage/:entityType/:fqn',
          name: 'lineage',
          component: LineageView,
          props: true,
        },
        { path: 'settings/members/users', name: 'admin-users', component: UsersListView, meta: { guard: { resource: 'USER', operation: 'view' } } },
        // P2 B5: official Admins tab surface (UserListPageV1 isAdminPage);
        // no standalone Admins page exists officially, only the tab.
        { path: 'settings/members/admins', name: 'admin-admins', component: UsersListView, meta: { guard: { resource: 'USER', operation: 'view' } } },
        // M1b staged (DESIGN §4.5): the partition batch migrated the
        // old user detail onto its FQN segment (B-9 (a1)); the entry
        // declaration is unchanged. The canonical top-level face is
        // users/:fqn (user-detail); this admin path keeps its URL
        // shape with the FQN value.
        { path: 'admin/users/:fqn', name: 'admin-user', component: UserDetailView, props: true, meta: { guard: { resource: 'USER', operation: 'entry' } } },
        // 'admin-teams' is deleted (sections batch): the teams list is
        // reached via the settings-members-teams redirect below.
        { path: 'settings/members/teams/:id', name: 'admin-team', component: TeamDetailView, props: true, meta: { guard: { resource: 'TEAM', operation: 'view' } } },
        { path: 'settings/access/roles', name: 'admin-roles', component: RolesListView, meta: { guard: { resource: 'ROLE', operation: 'view' } } },
        // C-P6j: the detail segment is `:fqn`, not `:id` — the pin
        // detail path is SETTINGS_WITH_TAB_FQN (constants.ts:184) and
        // every navigation site passes { fqn } (accessPaths
        // roleDetailLocation; PersonaUsersTab). With `:id`, resolving
        // those locations threw "Missing required param id" and
        // `props: true` never injected the views' `fqn` prop.
        { path: 'settings/access/roles/:fqn', name: 'admin-role', component: RoleDetailView, props: true, meta: { guard: { resource: 'ROLE', operation: 'view' } } },
        // 03 §12: the add-role route (sections batch). Unmapped under
        // the old table, i.e. admin-only by default; the new-system
        // equivalent is the explicit 'admin-only' declaration — the
        // view carries no in-view Create gate.
        { path: 'admin/roles/add', name: 'admin-role-add', component: AddRoleView, meta: { guard: 'admin-only' } },
        { path: 'settings/bots', name: 'admin-bots', component: BotsListView, meta: { guard: { resource: 'BOT', operation: 'view' } } },
        // M1b staged: the old Bot detail keeps its original URL until
        // the partition batch atomically migrates it (DESIGN §4.5).
        { path: 'admin/bots/:id', name: 'admin-bot', component: BotDetailView, props: true, meta: { guard: 'admin-only' } },
        // Sections batch (02/10, staged contract t363): the final
        // top-level user/bot/create-user faces. The old admin-* detail
        // routes above stay this phase with equivalent guards; these
        // routes close the fqnPaths 404s. Pin: USER_PROFILE* /
        // BOTS_PROFILE / CREATE_USER* (AuthenticatedAppRouter.tsx:
        // 505-530). No guard mapping applies: these paths are not
        // admin paths, so ADMIN_ROUTE_RESOURCE is never consulted
        // for them (see guards.ts); the create-user declarations are
        // mounted here (R-1): Create(USER) for /create-user, the
        // Create(USER) AND Create(BOT) conjunction for /create-user/bot
        // (official AuthenticatedAppRouter.tsx: createBotPermission).
        {
          path: 'users/:fqn/:tab?/:subTab?',
          name: 'user-detail',
          component: UserDetailView,
        },
        { path: 'bots/:fqn', name: 'bot-detail', component: BotDetailView, props: true },
        {
          path: 'create-user',
          name: 'create-user',
          component: CreateUserPage,
          meta: { guard: CREATE_USER_GUARD_DECLARATIONS['/create-user'] },
        },
        {
          path: 'create-user/bot',
          name: 'create-user-bot',
          component: CreateUserPage,
          meta: { guard: CREATE_USER_GUARD_DECLARATIONS['/create-user/bot'] },
        },
        // G-09 (visual comparison): official SETTINGS '/settings'
        // (SettingsRouter at '/settings/*'). The old admin/settings
        // path and the alias are gone (D-1, product compatibility
        // policy); the Hub is the canonical '/settings' route.
        { path: 'settings', name: 'admin-settings', component: SettingsHubView, meta: { guard: 'none' } },
        // Settings category page (DESIGN §6.1): one generic record
        // reading the registry; the component file is created by the
        // downstream S-HUB flow at the agreed path below.
        { path: 'settings/:category', name: 'settings-category', component: SettingsCategoryView, meta: { guard: 'none' } },
        // Settings services list page (DESIGN §6.4): URL-driven
        // `:tab` (mapping-key / enum-value segment or
        // `dataObservability`); inner Services/Pipelines tabs via
        // `?tab=`. Guard `none`: the route is reachable and its
        // content is permission-filtered by the view itself, like
        // the category page above (§10.2).
        { path: 'settings/services/:tab', name: 'settings-services', component: SettingsServicesView, meta: { guard: 'none' } },
        { path: 'settings/access/audit-logs', name: 'admin-settings-audit-logs', component: AuditLogsView, meta: { guard: { resource: 'AUDIT_LOG', operation: 'AuditLogs' } } },
        // P2 B R-5: official Settings/Users/AdminPermissionDebugger
        // (Access category): user search + evaluate + user permissions.
        {
          path: 'settings/access/permission-debugger',
          name: 'admin-settings-permission-debugger',
          component: PermissionDebuggerView,
          meta: { titleKey: 'permissionDebugger.title', guard: 'admin-only' },
        },
        // P2 B5: official Settings SSO page (configuration page only).
        {
          path: 'settings/sso',
          name: 'admin-settings-sso',
          component: SsoSettingsView,
          meta: { titleKey: 'settings.registry.sso.title' },
        },
        { path: 'settings/preferences/appearance', name: 'settings-preferences-appearance', component: AppearanceSettingsView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/email', name: 'settings-preferences-email', component: EmailConfigurationView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/loginConfiguration', name: 'settings-preferences-login', component: LoginConfigurationView, meta: { guard: 'admin-only', loginConfigGate: true } },
        // R-FIXUP2-1 (A4 §14 项 7): pin mounts the edit face on its own
        // route (SettingsRouter.tsx:496); same guard + provider gate as
        // the detail route above.
        { path: 'settings/preferences/loginConfiguration/edit', name: 'settings-preferences-login-edit', component: EditLoginConfigurationView, meta: { guard: 'admin-only', loginConfigGate: true } },
        { path: 'settings/preferences/om-health', name: 'settings-preferences-health', component: OmHealthView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/profiler-configuration', name: 'settings-preferences-profiler', component: ProfilerConfigurationView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/data-quality', name: 'settings-preferences-dq-dimensions', component: DataQualityDimensionsView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/search-settings', name: 'settings-preferences-search', component: SearchSettingsView, meta: { guard: 'admin-only' } },
        // The view reads :tab directly (route.params.tab) with the
        // DESIGN §3.5 segment mapping; there is no entityType prop.
        {
          path: 'settings/preferences/search-settings/:tab',
          name: 'settings-preferences-search-entity',
          component: SearchEntitySettingsView,
          props: true,
          meta: { guard: 'admin-only' },
        },
        { path: 'settings/preferences/lineageConfig', name: 'settings-preferences-lineage', component: LineageConfigView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/om-url-config', name: 'settings-preferences-om-url', component: OmUrlConfigView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/dataAssetRules', name: 'settings-preferences-entity-rules', component: EntityRulesSettingsView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/learning-resources', name: 'settings-preferences-learning', component: LearningResourcesView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/appMode', name: 'settings-preferences-app-mode', component: AppModeConfigView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/glossary', name: 'settings-preferences-glossary', component: GlossarySettingsView, meta: { guard: 'admin-only' } },
        { path: 'settings/preferences/timeFormat', name: 'settings-preferences-time-format', component: TimeFormatSettingsView, meta: { guard: 'admin-only' } },

        { path: 'settings/access/policies', name: 'admin-policies', component: PoliciesListView, meta: { guard: { resource: 'POLICY', operation: 'view' } } },
        // C-P6j: the detail/rule segments are `:fqn`, not `:id` — the
        // pin paths are SETTINGS_WITH_TAB_FQN / ADD_POLICY_RULE /
        // EDIT_POLICY_RULE (constants.ts:184,286-287). accessPaths and
        // the three views already speak `fqn`; the `:id` table broke
        // every one of them (list crash on resolve, detail/edit
        // fetching by an empty fqn). The D-11 transition claimed in
        // accessPaths is only complete with this landing.
        { path: 'settings/access/policies/:fqn', name: 'admin-policy', component: PolicyDetailView, props: true, meta: { guard: { resource: 'POLICY', operation: 'view' } } },
        // 03 §12: the add-policy route (sections batch). Unmapped under
        // the old table, i.e. admin-only by default; the new-system
        // equivalent is the explicit 'admin-only' declaration — the
        // view carries no in-view Create gate.
        { path: 'admin/policies/add', name: 'admin-policy-add', component: AddPolicyView, meta: { guard: 'admin-only' } },
        // M1a: the two policy-rule action routes are canonical this
        // stage; each pattern is registered exactly once, on the `:fqn`
        // segment the pin uses (see the C-P6j note on the detail
        // route above). The old `:id` spelling is deleted, not kept
        // as an alias: `:id` and `:fqn` are different params to
        // vue-router (props injection + resolve requirements), so
        // keeping both would re-admit the mismatch.
        // R-14(a): the two policy-rule action routes are canonical this
        // stage; the segments are `:fqn` (pin SettingsRouter detail
        // routes are `:fqn`), matching the `fqn` prop the rule views
        // declare. `:id`/`:fqn` spell the same single-segment pattern
        // and must never be registered twice. Old UUID deep links to
        // these four routes break once (release-note item: B-9 (a1)
        // full `:fqn` coverage for roles/policies).
        { path: 'settings/access/policies/:fqn/add-rule', name: 'admin-policy-rule-add', component: AddPolicyRuleView, props: true, meta: { guard: { resource: 'POLICY', operation: 'EditAll' } } },
        {
          path: 'settings/access/policies/:fqn/edit-rule/:ruleName',
          name: 'admin-policy-rule-edit',
          component: EditPolicyRuleView,
          props: true,
          meta: { guard: { resource: 'POLICY', operation: 'EditAll' } },
        },
        { path: 'settings/apps', name: 'admin-apps', component: AppsListView, meta: { guard: { resource: 'APPLICATION', operation: 'view' } } },
        { path: 'settings/apps/:fqn', name: 'admin-app', component: AppDetailView, props: true, meta: { guard: { resource: 'APPLICATION', operation: 'view' } } },
        // P2 B5: Persona list + detail (official settings PERSONA
        // routes). The nested customize record is deleted (C-4 §5.3);
        // the top-level customize-page route keeps admin-only.
        { path: 'settings/persona', name: 'admin-settings-persona', component: PersonaListView, meta: { guard: 'admin-only' } },
        {
          path: 'settings/persona/:fqn',
          name: 'admin-settings-persona-detail',
          component: PersonaDetailView,
          props: true,
          meta: { guard: 'admin-only' },
        },
        // C-1 option A: the custom-properties card page is served by
        // the generic settings/:category record; the type-mapped
        // list record is deleted and the detail route is admin-only
        // (the in-page per-type gate is untouched). The view reads
        // :tab directly with the §3.5 segment mapping; there is no
        // props adapter.
        {
          path: 'settings/customProperties/:tab',
          name: 'admin-settings-custom-property-type',
          component: CustomPropertyTypeDetailView,
          meta: { guard: 'admin-only' },
        },
        // Sections batch settings faces (02 members, 07 notifications).
        // Members (pin SettingsRouter.tsx:672-714, 903-918): the bare
        // teams path redirects to the Organization detail — the only
        // redirect exception in the staged contract — and users/admins
        // share one :tab route whose illegal segments resolve to /404
        // (membersTabGuard; pin NOT_FOUND '/404', constants.ts:139).
        // The :tab route is declared last among the members routes so
        // the static `teams` / `online-users` segments win.
        // Rebase note: the sections batch mapped these routes in
        // ADMIN_ROUTE_RESOURCE; the declarations below are the
        // new-system equivalent — the live beforeEach never consults
        // the table (see guards.ts). The online-users record carries
        // no declaration, matching the shell batch's twin record.
        {
          path: 'settings/members/teams',
          name: 'settings-members-teams',
          redirect: { name: 'settings-members-team', params: { fqn: 'Organization' } },
        },
        {
          path: 'settings/members/teams/:fqn',
          name: 'settings-members-team',
          component: TeamDetailView,
          meta: { guard: { resource: 'TEAM', operation: 'view' } },
        },
        {
          path: 'settings/members/teams/:fqn/import',
          name: 'settings-members-team-import',
          component: ImportTeamsPage,
          meta: { guard: { resource: 'TEAM', operation: 'view' } },
        },
        {
          path: 'settings/members/online-users',
          name: 'settings-members-online-users',
          component: OnlineUsersView,
        },
        {
          path: 'settings/members/:tab',
          name: 'settings-members',
          component: UsersListView,
          beforeEnter: membersTabGuard,
          meta: { guard: { resource: 'USER', operation: 'view' } },
        },
        // Notifications (07 §12, pin SettingsRouter.tsx:515-607 +
        // constants.ts:318-334). Detail :tab is optional: the table
        // requires a missing/illegal tab to default to `configuration`
        // in the view, which a required segment could never reach.
        // The add/edit faces keep pin's literal shapes
        // (add-notification / edit-notification / alerts/add /
        // alerts/edit/:fqn) — they are NOT nested under `alerts/`.
        // The list/detail faces are the shell batch's canonical
        // records (observability-alerts / announcements); only the
        // add/edit faces land here, session-only (R-3): pin mounts the
        // add/edit faces bare (SettingsRouter.tsx:575-607) and gates
        // them in the page (useAlertFormAccess: Create for add,
        // EditAll for edit), so no 'admin-only' declaration here.
        {
          path: 'settings/notifications/add-notification',
          name: 'settings-notification-alert-add',
          component: AlertFormView,
        },
        {
          path: 'settings/notifications/edit-notification/:fqn',
          name: 'settings-notification-alert-edit',
          component: AlertFormView,
        },
        {
          path: 'settings/notifications/announcements/add',
          name: 'settings-notification-announcement-add',
          component: AnnouncementFormView,
          meta: { guard: 'admin-only' },
        },
        {
          path: 'settings/notifications/announcements/edit/:id',
          name: 'settings-notification-announcement-edit',
          component: AnnouncementFormView,
          meta: { guard: 'admin-only' },
        },
        // G-07 (visual comparison): official GLOSSARY '/glossary'
        // (GlossaryRouter at '/glossary/*').
        { path: 'governance/glossaries', name: 'governance-glossaries', component: GlossariesListView, alias: 'glossary' },
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
        // G-08 (visual comparison): official TAGS '/tags'.
        {
          path: 'governance/classifications',
          name: 'governance-classifications',
          component: ClassificationsListView,
          alias: 'tags',
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
        // G-05 (visual comparison): official DOMAIN '/domain'
        // (singular; DomainRouter at '/domain/*'). The plural
        // '/domains' does not exist in the official framework.
        { path: 'governance/domains', name: 'governance-domains', component: DomainsListView, alias: 'domain' },
        {
          path: 'governance/domains/:fqn',
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
        // G-06 (visual comparison): official DATA_PRODUCT
        // '/dataProduct' (camelCase; DataProductListPage). The
        // '/data-products/products' path does not exist officially.
        {
          path: 'governance/data-products',
          name: 'governance-data-products',
          component: DataProductsListView,
          alias: 'dataProduct',
        },
        {
          path: 'governance/data-products/:id',
          name: 'governance-data-product',
          component: DataProductDetailView,
          props: true,
        },
        { path: 'governance/metrics', name: 'governance-metrics', component: MetricsListView, alias: 'metrics' },
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
        // The ontology records keep their product path and gain the
        // official path as an alias. The marketplace overview keeps no
        // alias: the AP-D3 hard cut moved it onto its official path
        // (data-marketplace), so /marketplace is the app catalog
        // (ADR:2026-11-20-ap-d3-marketplace-routes-hard-cut).
        {
          path: 'data-marketplace',
          name: 'marketplace-overview',
          component: MarketplaceOverviewView,
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
          path: 'settings/governance/workflow-definitions',
          name: 'workflows',
          component: WorkflowsView,
          meta: { guard: 'admin-only' },
        },
        // D-5: the detail route drops the :tab segment; the view
        // keeps activeTab as a local ref, so tab clicks never
        // navigate. (S-ROUTES §9's "view still reads :tab" note is
        // stale: the view reads only route.params.fqn.)
        {
          path: 'settings/governance/workflow-definitions/:fqn',
          name: 'workflow-detail',
          component: WorkflowDetailView,
          props: true,
          meta: { guard: 'admin-only' },
        },
        // A2 app catalog (official MarketPlacePage, /marketplace):
        // the AP-D3 hard cut moved the data marketplace overview onto
        // its official /data-marketplace path, so the catalog takes
        // /marketplace itself — the parent of the detail route below —
        // and the detail page's browse button points here. The three
        // app routes are admin-only at the router (bare
        // AdminProtectedRoute officially): meta guard 'admin-only',
        // so the views carry no inline admin gate (DEL-22 HOLD lifted).
        {
          path: 'marketplace',
          name: 'marketplace-app-catalog',
          component: MarketplaceAppCatalogView,
          meta: { titleKey: 'label.market-place', guard: 'admin-only' },
        },
        // P2 R-4: marketplace app detail (official
        // /marketplace/apps/:fqn). The install route below keeps its own
        // longer path, so the two never collide.
        {
          path: 'marketplace/apps/:fqn',
          name: 'marketplace-app-detail',
          component: MarketplaceAppDetailView,
          props: true,
          meta: { titleKey: 'apps.detail.title', guard: 'admin-only' },
        },
        // P2 B4: AppInstall (official /marketplace/apps/:fqn/install),
        // IntakeForms + TaskFormSettings (official settings governance
        // pages, now at their canonical settings paths with no alias),
        // and SparqlPlayground (official /governance/sparql, product
        // govern/ prefix + alias).
        {
          path: 'marketplace/apps/:fqn/install',
          name: 'marketplace-app-install',
          component: AppInstallView,
          props: true,
          meta: { titleKey: 'apps.install.title', guard: 'admin-only' },
        },
        {
          path: 'settings/governance/intake-forms',
          name: 'admin-settings-governance-intake-forms',
          component: IntakeFormsView,
          meta: { titleKey: 'intakeForms.title', guard: 'admin-only' },
        },
        {
          path: 'settings/governance/task-forms',
          name: 'admin-settings-governance-task-forms',
          component: TaskFormSettingsView,
          meta: { titleKey: 'taskForms.title', guard: 'admin-only' },
        },
        // A14 glossary-term relations (official SettingsRouter
        // GOVERNANCE + GLOSSARY_TERM_RELATIONS).
        {
          path: 'settings/governance/glossary-term-relations',
          name: 'admin-settings-governance-glossary-term-relations',
          component: GlossaryTermRelationSettingsView,
          meta: { titleKey: 'settings.glossaryTermRelations.title', guard: 'admin-only' },
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
          alias: 'test-library',
        },
        {
          path: 'quality/test-definitions/:id',
          name: 'quality-test-definition',
          component: TestDefinitionDetailView,
          props: true,
        },
        // G-02 (visual comparison): official DATA_QUALITY
        // '/data-quality'.
        { path: 'quality/test-cases', name: 'quality-test-cases', component: DataQualityLandingView, alias: 'data-quality' },
        {
          path: 'data-quality/:tab/:subTab?',
          name: 'quality-data-quality-tab',
          component: DataQualityLandingView,
        },
        {
          path: 'quality/test-cases/:id',
          name: 'quality-test-case',
          component: TestCaseDetailView,
          // F-D-4: official /test-case/:fqn(/:tab) aliases. The alias
          // params are fqn/tab, not the record's :id, so props map them.
          // ADR:2026-11-08-incident-detail-redirects-to-test-case
          alias: ['test-case/:fqn', 'test-case/:fqn/:tab'],
          props: (route) => ({
            id: (route.params.fqn as string | undefined) ?? (route.params.id as string),
            tab: route.params.tab as string | undefined,
          }),
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
          path: 'test-case/:fqn/versions/:version',
          redirect: (to) => ({
            name: 'quality-test-case-version',
            params: { id: to.params.fqn, version: to.params.version },
          }),
        },
        {
          path: 'test-case/:fqn/versions/:version/:tab',
          redirect: (to) => ({
            name: 'quality-test-case-version-tab',
            params: { id: to.params.fqn, version: to.params.version, tab: to.params.tab },
          }),
        },
        {
          path: 'test-case/:fqn/dimensions/:dimensionKey/:tab?',
          name: 'quality-test-case-dimensions',
          component: TestCaseDimensionsView,
        },
        {
          path: 'quality/test-cases/:id/dimensions/:dimensionKey/:tab?',
          redirect: (to) => ({
            name: 'quality-test-case-dimensions',
            params: { fqn: to.params.id, dimensionKey: to.params.dimensionKey, tab: to.params.tab },
          }),
        },
        // G-03 (visual comparison), tab half: official
        // DATA_QUALITY_WITH_TAB '/data-quality/:tab' with tab
        // 'test-suites' (DataQualityPageTabs.TEST_SUITES). The
        // redirect keeps the product's ?tab=test-suites behaviour.
        {
          path: 'quality/test-suites',
          name: 'quality-test-suites',
          redirect: (to) => ({
            path: '/data-quality/test-suites',
            query: to.query,
          }),
        },
        // G-03 (visual comparison), detail half: official
        // TEST_SUITES_WITH_FQN '/test-suites/:fqn' is a top-level
        // route (AuthenticatedAppRouter), not a /data-quality child.
        {
          path: 'quality/test-suites/:id',
          name: 'quality-test-suite',
          component: TestSuiteDetailView,
          alias: 'test-suites/:id',
          props: true,
        },
        {
          // P-22: the add/edit ingestion page is a drawer on the suite
          // detail Pipelines Tab now (official TestSuiteIngestionRedirect);
          // the old routes land there instead of a page.
          path: 'quality/test-suites/:id/add-ingestion',
          name: 'quality-test-suite-add-ingestion',
          redirect: (to) => ({
            name: 'quality-test-suite',
            params: { id: to.params.id },
            query: { tab: 'pipeline' },
          }),
        },
        {
          path: 'quality/test-suites/:id/edit-ingestion/:ingestionFqn',
          name: 'quality-test-suite-edit-ingestion',
          redirect: (to) => ({
            name: 'quality-test-suite',
            params: { id: to.params.id },
            query: { tab: 'pipeline' },
          }),
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
          // Official /incident-manager path (F-D-1 classic list).
          alias: 'incident-manager',
        },
        {
          path: 'observability/incidents/:id',
          name: 'observability-incident',
          component: IncidentDetailView,
          props: true,
        },
        { path: 'settings/notifications/alerts', name: 'settings-notification-alerts', component: AlertsListView, meta: { guard: { resource: 'EVENT_SUBSCRIPTION', operation: 'view' } } },
        {
          path: 'settings/notifications/alerts/:fqn/:tab?',
          name: 'settings-notification-alert',
          component: AlertDetailView,
          props: (route) => ({
            id: (route.params.fqn as string | undefined) ?? (route.params.id as string),
            tab: route.params.tab as string | undefined,
          }),
          meta: { guard: { resource: 'EVENT_SUBSCRIPTION', operation: 'view' } },
        },
        // 07 §12 #6-8 (pin constants.ts:320-324): the add/edit faces
        // keep the plural `alerts/` prefix. They carry no declaration:
        // under the old table /observability was not an admin prefix,
        // so they were session-only there.
        {
          path: 'observability/alerts',
          name: 'observability-alerts',
          component: AlertsListView,
          alias: 'observability/alert',
          meta: { guard: { resource: 'EVENT_SUBSCRIPTION', operation: 'view' } },
        },
        {
          path: 'observability/alert/:fqn/:tab?',
          name: 'observability-alert',
          component: AlertDetailView,
          props: (route) => ({
            id: (route.params.fqn as string | undefined) ?? (route.params.id as string),
            tab: route.params.tab as string | undefined,
          }),
          meta: { guard: { resource: 'EVENT_SUBSCRIPTION', operation: 'view' } },
        },
        {
          path: 'observability/alerts/add',
          name: 'observability-alert-add',
          component: AlertFormView,
        },
        {
          path: 'observability/alerts/edit/:fqn',
          name: 'observability-alert-edit',
          component: AlertFormView,
        },
        // Legacy plural detail shape: official detail is singular /observability/alert/:fqn/:tab.
        {
          path: 'observability/alerts/:id',
          redirect: (to) => ({
            name: 'observability-alert',
            params: { fqn: to.params.id, tab: 'configuration' },
          }),
        },
        // Official ClassicObservabilityRedirect (AuthenticatedAppRouter): strip
        // the /observability prefix so shared AI-mode links open the classic pages.
        // Do not add a catch-all under /observability — that would steal alerts.
        { path: 'observability', redirect: '/data-quality' },
        {
          path: 'observability/data-quality/:pathMatch(.*)*',
          redirect: (to) => {
            const rest = to.params.pathMatch;
            const suffix = rest ? '/' + (Array.isArray(rest) ? rest.join('/') : rest) : '';
            return { path: '/data-quality' + suffix, query: to.query, hash: to.hash };
          },
        },
        { path: 'observability/incident-manager', redirect: '/incident-manager' },
        { path: 'observability/test-library', redirect: '/test-library' },
        {
          path: 'observability/test-suites/:pathMatch(.*)*',
          redirect: (to) => {
            const rest = to.params.pathMatch;
            const suffix = rest ? '/' + (Array.isArray(rest) ? rest.join('/') : rest) : '';
            return { path: '/test-suites' + suffix, query: to.query, hash: to.hash };
          },
        },
        {
          path: 'observability/test-case/:pathMatch(.*)*',
          redirect: (to) => {
            const rest = to.params.pathMatch;
            const suffix = rest ? '/' + (Array.isArray(rest) ? rest.join('/') : rest) : '';
            return { path: '/test-case' + suffix, query: to.query, hash: to.hash };
          },
        },
        // B-7(c): `ingestion/services` is retired with ServicesListView
        // (health chips + kind Tabs + `?health=` buckets); the aggregate
        // surface lives at top-level `/connections` now. No redirect:
        // the old route has no official counterpart.
        // D-17: the official add-service form (pin ROUTES.ADD_SERVICE,
        // `/:serviceCategory/add-service`; AuthenticatedAppRouter.tsx:
        // 421-427). The category is a ServiceCategory enum value
        // (databaseServices, …) or the 'all' sentinel
        // (ALL_SERVICES_CATEGORY); AddServiceView reads
        // route.params.serviceCategory. The retained interim
        // `/ingestion/services/add` route is deleted with this change
        // (Bai 2026-11-19 17:43: wrong inventions are removed with the
        // change, no separate step); the route name is kept so the
        // callers below only change path + params.
        { path: ':serviceCategory/add-service', name: 'ingestion-service-add', component: AddServiceView },
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
        {
          path: 'ingestion/services/:kind/:id/versions/:version',
          name: 'ingestion-service-version',
          component: ServiceVersionView,
          props: true,
        },
        {
          path: 'ingestion/pipelines/:id/edit',
          name: 'ingestion-pipeline-edit',
          component: EditPipelineView,
          props: true,
          meta: { guard: 'admin-only' },
        },
        {
          path: 'ingestion/pipelines/:id',
          name: 'ingestion-pipeline',
          component: PipelineDetailView,
          props: true,
          meta: { guard: 'admin-only' },
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
        { path: 'settings/notifications/announcements', name: 'announcements', component: AnnouncementsListView, meta: { guard: 'admin-only' } },
        // A20 announcement duplicate (official
        // SETTINGS_ANNOUNCEMENT_DUPLICATE): the list view reuses its
        // create form prefilled from the source announcement.
        {
          path: 'settings/notifications/announcements/duplicate/:id',
          name: 'announcement-duplicate',
          component: AnnouncementsListView,
          meta: { guard: 'admin-only' },
        },
        // Official EntityRouter (AuthenticatedAppRouter mounts
        // `/:entityType/*`, then ENTITY_DETAILS / WITH_TAB /
        // WITH_SUB_TAB, with version routes registered first so
        // `versions` is never read as a tab). Official has no
        // `?tab=`/`?subTab=` compatibility redirect and no
        // `/assets/` prefix — constructors emit these paths only.
        {
          path: `:entityType(${OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN})/:fqn/versions/:version/:tab`,
          name: 'asset-version-tab',
          component: AssetVersionView,
          props: true,
          beforeEnter: officialEntityDetailGuard,
        },
        {
          path: `:entityType(${OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN})/:fqn/versions/:version`,
          name: 'asset-version-detail',
          component: AssetVersionView,
          props: true,
          beforeEnter: officialEntityDetailGuard,
        },
        {
          path: `:entityType(${OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN})/:fqn/versions`,
          name: 'asset-version',
          component: AssetVersionView,
          props: true,
          beforeEnter: officialEntityDetailGuard,
        },
        {
          path: `:entityType(${OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN})/:fqn/:tab/:subTab`,
          name: 'asset-subtab',
          component: AssetDetailView,
          props: true,
          beforeEnter: officialEntityDetailGuard,
        },
        {
          path: `:entityType(${OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN})/:fqn/:tab`,
          name: 'asset-tab',
          component: AssetDetailView,
          props: true,
          beforeEnter: officialEntityDetailGuard,
        },
        {
          path: `:entityType(${OFFICIAL_ENTITY_DETAIL_TYPE_PATTERN})/:fqn`,
          name: 'asset',
          component: AssetDetailView,
          props: true,
          beforeEnter: officialEntityDetailGuard,
        },
        { path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundView },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const guardDecisions = useGuardDecisionStore();
  const session = loadSession(window.localStorage);
  const declaration = guardDeclarationOf(to.meta.guard);
  // Step 3 (DESIGN §10.4, N1 semantics preserved): when the target
  // carries a guard declaration and the profile has not loaded yet,
  // wait for one refreshUser() before deciding. The trigger is "the
  // route has a declaration", not a path prefix. A failed profile
  // fetch is NOT a grant (fail closed).
  if (declaration !== undefined && session !== null && auth.user === null) {
    try {
      await auth.refreshUser();
    } catch {
      // Fail closed: user stays null; resolveGuard decides below.
    }
  }
  // Step 4 (S1): the login-configuration provider gate runs BEFORE
  // the admin line — an admin must not bypass it. A failed load or
  // an inapplicable provider (including undefined) lands on
  // not-found, never on the placeholder.
  let loginConfigApplicable: boolean | undefined;
  if (session !== null && to.meta.loginConfigGate === true) {
    loginConfigApplicable = isLoginConfigurationApplicable(await loadAuthProvider());
  }
  const isAdminUser = auth.user?.isAdmin === true;
  // Steps 5-6: an admin never queries the permission API; otherwise
  // the declared resource lines are evaluated through the permission
  // store (cached per principal). A failed query is NOT a grant
  // (fail closed); 'admin-only' and 'none' declare no resources.
  let hasPermission: boolean | undefined;
  if (session !== null && !isAdminUser && declaration !== undefined) {
    const resources = guardDeclarationResources(declaration);
    if (resources.length > 0) {
      const opsByResource: Record<string, OperationPermissions | null> = {};
      await Promise.all(
        resources.map(async (resourceKey) => {
          try {
            opsByResource[resourceKey] =
              await usePermissionStore().getResourcePermission(resourceKey);
          } catch {
            opsByResource[resourceKey] = null;
          }
        }),
      );
      hasPermission = evaluateGuardDeclaration(declaration, opsByResource);
    }
  }
  const decision = resolveGuard({
    isPublic: to.meta.public === true,
    hasSession: session !== null,
    fullPath: to.fullPath,
    isAdminUser,
    hasPermission,
    declaration,
    loginConfigApplicable,
  });
  if (decision.kind === 'login') {
    guardDecisions.clearDecision();
    return { name: 'login', query: { redirect: decision.redirect } };
  }
  if (decision.kind === 'not-found') {
    guardDecisions.clearDecision();
    return { name: 'not-found' };
  }
  // Step 7 (D-3): a denial completes the navigation with the URL
  // unchanged; the decision is recorded for the AppShell slot,
  // which renders the shared placeholder instead of mounting the
  // matched component. Every navigation records its decision, so a
  // stale denial can never survive into the next navigation.
  guardDecisions.setDecision({
    fullPath: to.fullPath,
    principalKey: principalKeyFor(auth.user),
    denied: decision.kind === 'deny',
  });
  return true;
});

// A decision belongs to its target navigation: sweep one whose
// fullPath differs from the settled route (redirected, cancelled
// or competing navigations must not leave a stale decision behind).
router.afterEach((to) => {
  useGuardDecisionStore().clearIfStale(to.fullPath);
});

