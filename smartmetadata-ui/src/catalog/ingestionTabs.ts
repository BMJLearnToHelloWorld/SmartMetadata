/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Data-driven ingestion tab/category registry, following the Stage 4/5/6
 * governanceTabs / qualityTabs / insightsTabs pattern. Tab rows are data,
 * never if-else branches in views: a view looks its entity up here and
 * renders the supported tabs, leaving unsupported ones as honest residuals.
 *
 * Official prototypes (read-only reference, openmetadata-ui):
 * ServicesPage (per-category services/pipelines tabs), ServiceDetailsPage
 * (insights/agents/connection/assets/ingestion tabs), ServiceVersionPage,
 * PipelineDetailsPage (tasks/DAG + executions), AddServicePage (3-step
 * wizard), EditConnectionFormPage, EmbeddedAddServicePage, AddIngestionPage
 * / EditIngestionPage (2-step wizard). A tab is marked supported only when
 * the product view actually wires it; anything else carries a residual
 * reason and must not be rendered as if it worked.
 */
import type { ServiceKind } from '@/types/ingestion';

export interface IngestionTab {
  key: string;
  /** i18n key for the tab label. */
  labelKey: string;
  supported: boolean;
  /** Why the tab is residual; absent for supported tabs. */
  residualReason?: string;
  /** Live count badge; rendered when defined, including zero. */
  count?: number;
  /** Service kinds the tab never renders for, whatever the user. */
  excludedKinds?: readonly ServiceKind[];
}

export interface ServiceCategoryRow {
  key: string;
  /** i18n key for the category label. */
  labelKey: string;
  /**
   * Listed in the wizard kind selector and the services list (A9): the
   * kind is offered and its default type is creatable. This is NOT full
   * support — see supportLevel.
   */
  supported: boolean;
  /**
   * Honest grading (M-Next B4): 'full' means every type in the kind has a
   * connection form, a CLI source mapping (SUPPORTED_SERVICE_TYPES) and
   * pipeline agent kinds; 'partial' means only the kind's default type has
   * a form, the other types are blocked in the wizard, and the kind has no
   * CLI mapping. 49 product-known types, 26 with forms, 23 blocked.
   */
  supportLevel: 'full' | 'partial';
  residualReason?: string;
}

/**
 * Official service categories. Only the five kinds in
 * SUPPORTED_SERVICE_TYPES are fully supported; the other eight are listed
 * (their default type is creatable, A9) but partial — see each row's
 * residualReason. supported stays true for all thirteen because the wizard
 * kind selector and the services list consume it as "listed" (flipping it
 * would silently unlist working default-type creation).
 */
export const SERVICE_CATEGORIES: ServiceCategoryRow[] = [
  { key: 'database', labelKey: 'ingestion.services.database', supported: true, supportLevel: 'full' },
  { key: 'messaging', labelKey: 'ingestion.services.messaging', supported: true, supportLevel: 'full' },
  { key: 'dashboard', labelKey: 'ingestion.services.dashboard', supported: true, supportLevel: 'full' },
  { key: 'storage', labelKey: 'ingestion.services.storage', supported: true, supportLevel: 'full' },
  { key: 'pipeline', labelKey: 'ingestion.services.pipeline', supported: true, supportLevel: 'full' },
  {
    key: 'metadata',
    labelKey: 'ingestion.services.metadata',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Only the default type OpenMetadata has a connection form; 6 of 7 types are blocked in the wizard and the kind has no CLI source mapping.',
  },
  {
    key: 'security',
    labelKey: 'ingestion.services.security',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Ranger is the only type and it has a connection form, but the kind has no CLI source mapping or pipeline agent kinds.',
  },
  {
    key: 'mlmodel',
    labelKey: 'ingestion.services.mlmodel',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Only the default type Mlflow has a connection form; 4 of 5 types are blocked in the wizard and the kind has no CLI source mapping.',
  },
  {
    key: 'search',
    labelKey: 'ingestion.services.search',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Only the default type ElasticSearch has a connection form; 2 of 3 types are blocked in the wizard and the kind has no CLI source mapping.',
  },
  {
    key: 'api',
    labelKey: 'ingestion.services.api',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Only the default type Rest has a connection form; WEBHOOK is blocked in the wizard and the kind has no CLI source mapping.',
  },
  {
    key: 'drive',
    labelKey: 'ingestion.services.drive',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Only the default type GoogleDrive has a connection form; 3 of 4 types are blocked in the wizard and the kind has no CLI source mapping.',
  },
  {
    key: 'llm',
    labelKey: 'ingestion.services.llm',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Only the default type OpenAI has a connection form; 7 of 8 types are blocked in the wizard and the kind has no CLI source mapping.',
  },
  {
    key: 'mcp',
    labelKey: 'ingestion.services.mcp',
    supported: true,
    supportLevel: 'partial',
    residualReason:
      'Mcp is the only type and it has a connection form, but the kind has no CLI source mapping or pipeline agent kinds.',
  },
];

export const SERVICE_DETAIL_TABS: IngestionTab[] = [
  { key: 'overview', labelKey: 'crud.overview', supported: true },
  { key: 'connection', labelKey: 'ingestion.services.connectionTab', supported: true },
  {
    key: 'agents',
    labelKey: 'ingestion.services.agentsTab',
    supported: true,
    // Official ServiceDetailsPage pushes the Agents tab only for
    // non-security services; security services get no agents tab.
    excludedKinds: ['security'],
  },
  {
    key: 'assets',
    labelKey: 'ingestion.services.assetsTab',
    supported: false,
    residualReason: 'No per-category asset list API is wired for services.',
  },
  {
    key: 'insights',
    labelKey: 'ingestion.services.insightsTab',
    supported: false,
    residualReason: 'No service-insights workflow API is wired.',
  },
  {
    key: 'versions',
    labelKey: 'ingestion.services.versionsTab',
    supported: true,
  },
];

export const INGESTION_PIPELINE_TABS: IngestionTab[] = [
  { key: 'overview', labelKey: 'crud.overview', supported: true },
  { key: 'status', labelKey: 'ingestion.pipelines.statusTab', supported: true },
];

/** Tabs a view renders from a registry list (supported + honest residuals). */
export function ingestionTabKeys(tabs: readonly IngestionTab[]): string[] {
  return tabs.map((tab) => tab.key);
}
