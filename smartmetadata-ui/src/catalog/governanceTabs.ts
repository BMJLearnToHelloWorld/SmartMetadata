/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
/**
 * Data-driven governance tab registry, following the Stage 2
 * exploreTabs / entityDetailTabs pattern. Tab rows are data, never
 * if-else branches in views: a view looks its entity up here and renders
 * the supported tabs, leaving unsupported ones as honest residuals.
 *
 * Official prototypes (read-only reference, openmetadata-ui):
 * GlossaryPage/GlossaryV1, TagsPage, CustomizableDomainPage,
 * CustomizableDataProductPage, MetricsPage, PoliciesPage, RolesPage.
 * A tab is marked supported only when the product view actually wires
 * it; anything else carries a residual reason and must not be rendered
 * as if it worked.
 */
export interface GovernanceTab {
  key: string;
  /** i18n key for the tab label. */
  labelKey: string;
  supported: boolean;
  /** Why the tab is residual; absent for supported tabs. */
  residualReason?: string;
}

export type GovernanceEntity =
  | 'glossary'
  | 'glossaryTerm'
  | 'classification'
  | 'tag'
  | 'domain'
  | 'dataProduct'
  | 'metric'
  | 'policy'
  | 'role';

export const GOVERNANCE_ENTITY_TABS: Record<GovernanceEntity, GovernanceTab[]> = {
  glossary: [
    { key: 'terms', labelKey: 'governance.glossaries.termsTab', supported: true },
    {
      key: 'relations',
      labelKey: 'governance.glossaries.relationsTab',
      supported: false,
      residualReason: 'No graph endpoint is wired for glossaries.',
    },
    {
      key: 'activity',
      labelKey: 'governance.glossaries.activityTab',
      supported: false,
      residualReason: 'Activity feed APIs are not attached here.',
    },
  ],
  glossaryTerm: [
    { key: 'details', labelKey: 'terms.detailsTab', supported: true },
    { key: 'assets', labelKey: 'terms.relatedEntities', supported: true },
    {
      key: 'approval',
      labelKey: 'terms.approvalTab',
      supported: false,
      residualReason: 'No term approval endpoint exists in the product API layer.',
    },
  ],
  classification: [
    { key: 'tags', labelKey: 'governance.classifications.tagsTab', supported: true },
    {
      key: 'disable',
      labelKey: 'governance.classifications.disableTab',
      supported: false,
      residualReason: 'No disable or delete endpoint exists for classifications.',
    },
  ],
  tag: [
    { key: 'details', labelKey: 'terms.detailsTab', supported: true },
    {
      key: 'disable',
      labelKey: 'governance.classifications.disableTab',
      supported: false,
      residualReason: 'No disable or delete endpoint exists for tags.',
    },
  ],
  domain: [
    { key: 'assets', labelKey: 'governance.domains.assetsTab', supported: true },
    {
      key: 'details',
      labelKey: 'governance.domains.detailsTab',
      supported: false,
      residualReason: 'Only the assets tab is wired; the generic entity detail tabs are not.',
    },
  ],
  dataProduct: [
    { key: 'assets', labelKey: 'governance.dataProducts.assetsTab', supported: true },
    {
      key: 'details',
      labelKey: 'governance.dataProducts.detailsTab',
      supported: false,
      residualReason: 'Only the assets tab is wired; the generic entity detail tabs are not.',
    },
  ],
  metric: [
    { key: 'details', labelKey: 'metrics.detailsTab', supported: true },
    {
      key: 'versions',
      labelKey: 'metrics.versionsTab',
      supported: false,
      residualReason: 'Version list exists via the Stage 2 skeleton; single-version detail and diff are not built.',
    },
  ],
  policy: [
    { key: 'rules', labelKey: 'admin.policies.rulesTab', supported: true },
    {
      key: 'addRule',
      labelKey: 'admin.policies.addRuleTab',
      supported: false,
      residualReason: 'Rule add/edit lives inside the detail edit form; there is no standalone AddRule/EditRule route.',
    },
  ],
  role: [
    { key: 'details', labelKey: 'admin.roles.detailsTab', supported: true },
    { key: 'policies', labelKey: 'admin.roles.policies', supported: true },
    {
      key: 'permissions',
      labelKey: 'admin.roles.permissionsTab',
      supported: false,
      residualReason: 'Permission filtering is a pass-through placeholder; the session user carries no role field.',
    },
  ],
};

export function governanceTabsFor(entity: GovernanceEntity): GovernanceTab[] {
  return GOVERNANCE_ENTITY_TABS[entity] ?? [];
}

export function supportedGovernanceTabs(entity: GovernanceEntity): GovernanceTab[] {
  return governanceTabsFor(entity).filter((tab) => tab.supported);
}

export function residualGovernanceTabs(entity: GovernanceEntity): GovernanceTab[] {
  return governanceTabsFor(entity).filter((tab) => !tab.supported);
}
