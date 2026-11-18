/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Detail-page widget dispatch: which content a widget id renders, by
 * page type. The product equivalent of the official
 * `getWidgetsFromKey` chain, reduced to the content-key vocabulary:
 * instead of returning a component, it returns the official widget-key
 * string the id resolves to, or `null` when official code renders
 * nothing for it. Views compare the result against `DetailWidgetKeys`.
 *
 * Official sources (pin 392b3efd,
 * `openmetadata-ui/src/main/resources/ui/src/`):
 *
 * - `utils/CustomizePage/CustomizePageDispatchUtils.ts:339-401`
 *   (`WIDGETS_FROM_KEY_BY_PAGE_TYPE` + `getWidgetsFromKey`): one
 *   per-page-type resolver; an unlisted page type yields `null`.
 * - Each per-type resolver checks its own specific keys with a plain
 *   `startsWith` BEFORE falling through to the shared `CommonWidgets`
 *   dispatcher (file:line per row in the table below), except
 *   DataProduct, whose `DOMAIN` branch is an exact `===` check
 *   (`utils/DataProductUtils.tsx:157`), and DataMarketplace, which has
 *   no common fallback at all and returns `null`
 *   (`utils/DataMarketplace/DataMarketplaceUtils.tsx:63`).
 * - `components/DataAssets/CommonWidgets/CommonWidgets.tsx:41-65`:
 *   the shared dispatcher resolves the id through the registry
 *   (`CommonWidgets.registry.ts:54-65`), then the extension-point
 *   fallback (`utils/CommonWidget/CommonWidgetClassBase.ts:26-41`,
 *   knowledge articles only), else `null`.
 * - `components/DataAssets/CommonWidgets/CommonWidgets.utils.ts:28-38`
 *   (`resolveWidgetKey`): common keys match exactly, or by
 *   `startsWith(key + '-')` for `-<n>` duplicate-instance suffixes —
 *   a raw `startsWith` would let sibling keys swallow each other.
 *   The knowledge-article fallback additionally matches
 *   case-insensitively.
 *
 * Order is part of the contract and is preserved here: per-type
 * specific keys first (in official check order), then the common
 * keys. The order is observable where a specific key is a prefix of
 * another key: on GlossaryTerm pages `KnowledgePanel.Owners` resolves
 * to `OWNER`, because the per-type `OWNER` startsWith check
 * (`utils/GlossaryTerm/GlossaryTermWidgetUtils.tsx:194-197`) runs
 * before the common `OWNERS` registry entry. The same holds for
 * `KnowledgePanel.DomainType` on GlossaryTerm pages (resolves to
 * `DOMAIN`). Where the specific and common strings coincide
 * (`EXPERTS` on Domain, `DOMAIN`/`REVIEWER` on GlossaryTerm), the
 * returned string is the same either way; the table still keeps the
 * official order so a future component mapping cannot invert it.
 *
 * Deliberately absent (return `null`):
 *
 * - The Drive leaves Directory, File, Spreadsheet, Worksheet: official
 *   dispatch covers them, but the product has no detail views for them
 *   (residual R-C4-DRIVE), so they are not wired here. Their specific
 *   keys (`DIRECTORY_CHILDREN`, `WORKSHEETS`, `WORKSHEET_COLUMNS`)
 *   are likewise absent from `DetailWidgetKeys`.
 * - `METRIC_DIMENSIONS` / `METRIC_MEASURES`: enum members with no
 *   dispatch branch, no widget-list entry, and no default-layout
 *   presence at pin; a Metric layout carrying them renders nothing
 *   officially, so they resolve to `null`.
 * - `TABS` / `HEADER`: editor-only widget-chooser branches
 *   (`CustomizeGlossaryTermBaseClass.ts:307-315`), never read-side
 *   content. `ANNOUNCEMENTS`, `MARKETPLACE_ANNOUNCEMENTS`, and
 *   `EMPTY_WIDGET_PLACEHOLDER` have no read-dispatch branch anywhere
 *   at pin and resolve to `null` through the common dispatcher.
 * - Unknown page types (including `Classification`, `LandingPage`,
 *   and `Navigation`, which have no entry in the official dispatch
 *   table): `null`, as officially.
 */

/**
 * The official widget-key strings this dispatch can return: the
 * mirror of `enums/CustomizeDetailPage.enum.ts`
 * (`DetailPageWidgetKeys` :19-67 and the GlossaryTerm-only members of
 * `GlossaryTermDetailPageWidgetKeys` :69-84), restricted to keys a
 * dispatch branch can actually match. Views compare `contentKey`
 * against these constants, never against string literals.
 */
export const DetailWidgetKeys: Record<string, string> = {
  LEFT_PANEL: 'KnowledgePanel.LeftPanel',
  DESCRIPTION: 'KnowledgePanel.Description',
  TABLE_SCHEMA: 'KnowledgePanel.TableSchema',
  TOPIC_SCHEMA: 'KnowledgePanel.TopicSchema',
  DATABASE_SCHEMA: 'KnowledgePanel.DatabaseSchema',
  CHARTS_TABLE: 'KnowledgePanel.ChartsTable',
  FREQUENTLY_JOINED_TABLES: 'KnowledgePanel.FrequentlyJoinedTables',
  DATA_PRODUCTS: 'KnowledgePanel.DataProducts',
  TAGS: 'KnowledgePanel.Tags',
  DOMAIN: 'KnowledgePanel.Domain',
  GLOSSARY_TERMS: 'KnowledgePanel.GlossaryTerms',
  CUSTOM_PROPERTIES: 'KnowledgePanel.CustomProperties',
  TABLE_CONSTRAINTS: 'KnowledgePanel.TableConstraints',
  PARTITIONED_KEYS: 'KnowledgePanel.PartitionedKeys',
  TABLE_ALIASES: 'KnowledgePanel.TableAliases',
  STORED_PROCEDURE_CODE: 'KnowledgePanel.StoredProcedureCode',
  DATA_MODEL: 'KnowledgePanel.DataModel',
  CONTAINER_CHILDREN: 'KnowledgePanel.ContainerChildren',
  PIPELINE_TASKS: 'KnowledgePanel.PipelineTasks',
  SEARCH_INDEX_FIELDS: 'KnowledgePanel.SearchIndexFields',
  OWNERS: 'KnowledgePanel.Owners',
  EXPERTS: 'KnowledgePanel.Experts',
  DOMAIN_TYPE: 'KnowledgePanel.DomainType',
  TABLES: 'KnowledgePanel.Tables',
  API_ENDPOINTS: 'KnowledgePanel.APIEndpoints',
  API_SCHEMA: 'KnowledgePanel.APISchema',
  RELATED_METRICS: 'KnowledgePanel.RelatedMetrics',
  METRIC_HIERARCHY: 'KnowledgePanel.MetricHierarchy',
  METRIC_DEFINITION: 'KnowledgePanel.MetricDefinition',
  ML_MODEL_FEATURES: 'KnowledgePanel.MlModelFeatures',
  CONTAINER_SCHEMA: 'KnowledgePanel.ContainerSchema',
  TIER: 'KnowledgePanel.Tier',
  CERTIFICATION: 'KnowledgePanel.Certification',
  MARKETPLACE_DATA_PRODUCTS: 'KnowledgePanel.MarketplaceDataProducts',
  MARKETPLACE_DOMAINS: 'KnowledgePanel.MarketplaceDomains',
  KNOWLEDGE_ARTICLE: 'KnowledgePanel.KnowledgeArticle',
  ASSET_HEALTH: 'KnowledgePanel.AssetHealth',
  SYNONYMS: 'KnowledgePanel.Synonyms',
  RELATED_TERMS: 'KnowledgePanel.RelatedTerms',
  REFERENCES: 'KnowledgePanel.References',
  OWNER: 'KnowledgePanel.Owner',
  REVIEWER: 'KnowledgePanel.Reviewer',
  TERMS_TABLE: 'KnowledgePanel.TermsTable',
  WORKFLOW_HISTORY: 'KnowledgePanel.WorkflowHistory',
};

const {
  API_ENDPOINTS,
  API_SCHEMA,
  ASSET_HEALTH,
  CERTIFICATION,
  CHARTS_TABLE,
  CONTAINER_CHILDREN,
  CONTAINER_SCHEMA,
  CUSTOM_PROPERTIES,
  DATA_MODEL,
  DATA_PRODUCTS,
  DATABASE_SCHEMA,
  DESCRIPTION,
  DOMAIN,
  DOMAIN_TYPE,
  EXPERTS,
  FREQUENTLY_JOINED_TABLES,
  GLOSSARY_TERMS,
  KNOWLEDGE_ARTICLE,
  LEFT_PANEL,
  MARKETPLACE_DATA_PRODUCTS,
  MARKETPLACE_DOMAINS,
  METRIC_DEFINITION,
  METRIC_HIERARCHY,
  ML_MODEL_FEATURES,
  OWNER,
  OWNERS,
  PARTITIONED_KEYS,
  PIPELINE_TASKS,
  REFERENCES,
  RELATED_METRICS,
  RELATED_TERMS,
  REVIEWER,
  SEARCH_INDEX_FIELDS,
  STORED_PROCEDURE_CODE,
  SYNONYMS,
  TABLE_ALIASES,
  TABLE_CONSTRAINTS,
  TABLE_SCHEMA,
  TABLES,
  TERMS_TABLE,
  TAGS,
  TIER,
  TOPIC_SCHEMA,
  WORKFLOW_HISTORY,
} = DetailWidgetKeys;

/**
 * Per-type specific keys, in official check order, with the official
 * resolver each row comes from. Every row is a plain `startsWith`
 * check except DataProduct's `DOMAIN` (exact match, see
 * `SPECIFIC_EXACT_KEYS_BY_PAGE_TYPE`).
 *
 * - Table: `utils/TableTabsUtils.tsx:523-542` (`getTableWidgetFromKey`)
 * - Topic: `utils/TopicDetailsUtils.tsx:166-168`
 * - StoredProcedure: `utils/StoredProceduresUtils.tsx:172-176`
 * - DashboardDataModel: `utils/DashboardDataModelUtils.tsx:228-232`
 * - Dashboard: `utils/DashboardDetailsUtils.tsx:216-218`
 * - Pipeline: `utils/PipelineDetailsUtils.tsx:205-207`
 * - DatabaseSchema: `utils/DatabaseSchemaTabsUtils.tsx:169-171`
 * - Database: `utils/Database/DatabaseTabsUtils.tsx:150-152`
 * - Container: `utils/ContainerDetailUtils.tsx:258-264` (both keys
 *   render the same component, kept as two rows)
 * - SearchIndex: `utils/SearchIndexUtils.tsx:250-252`
 * - Metric: `utils/MetricEntityUtils/MetricUtils.tsx:219-230`
 * - MlModel: `utils/MlModelDetailsUtils.tsx:190-192`
 * - APIEndpoint: `utils/APIEndpoints/APIEndpointUtils.tsx:188-190`
 * - APICollection: `utils/APICollection/APICollectionUtils.tsx:166-168`
 * - Domain: `utils/DomainUtils.tsx:394-399`
 * - Glossary: `utils/GlossaryUtils.tsx:48-51`
 * - GlossaryTerm: `utils/GlossaryTerm/GlossaryTermWidgetUtils.tsx:177-206`
 * - DataMarketplace: `utils/DataMarketplace/DataMarketplaceUtils.tsx:37-63`
 * - Chart (`utils/ChartDetailsUtils.tsx:173-176`) and Tag
 *   (`utils/TagClassBase.ts:221-227`) have no specific branch: they
 *   delegate every id straight to `CommonWidgets`, so they carry an
 *   empty row and rely on the common fallback.
 */
const SPECIFIC_PREFIX_KEYS_BY_PAGE_TYPE: Record<string, readonly string[]> = {
  Table: [
    TABLE_SCHEMA,
    TABLE_CONSTRAINTS,
    FREQUENTLY_JOINED_TABLES,
    PARTITIONED_KEYS,
    TABLE_ALIASES,
    ASSET_HEALTH,
  ],
  Topic: [TOPIC_SCHEMA],
  StoredProcedure: [STORED_PROCEDURE_CODE],
  DashboardDataModel: [DATA_MODEL],
  Dashboard: [CHARTS_TABLE],
  Pipeline: [PIPELINE_TASKS],
  DatabaseSchema: [TABLES],
  Database: [DATABASE_SCHEMA],
  Container: [CONTAINER_CHILDREN, CONTAINER_SCHEMA],
  SearchIndex: [SEARCH_INDEX_FIELDS],
  Metric: [RELATED_METRICS, METRIC_HIERARCHY, METRIC_DEFINITION],
  MlModel: [ML_MODEL_FEATURES],
  APIEndpoint: [API_SCHEMA],
  APICollection: [API_ENDPOINTS],
  Domain: [EXPERTS, DOMAIN_TYPE],
  Glossary: [TERMS_TABLE],
  GlossaryTerm: [WORKFLOW_HISTORY, RELATED_TERMS, SYNONYMS, REFERENCES, OWNER, REVIEWER, DOMAIN],
  DataMarketplace: [MARKETPLACE_DATA_PRODUCTS, MARKETPLACE_DOMAINS],
  Chart: [],
  Tag: [],
};

/**
 * Per-type specific keys matched by exact equality. Only one row
 * exists at pin: DataProduct's `DOMAIN` branch is `===`, not
 * `startsWith` (`utils/DataProductUtils.tsx:156-159`). A suffixed id
 * such as `KnowledgePanel.Domain-1` therefore does NOT take the
 * specific branch; it falls through to the common dispatcher, which
 * resolves it to the same `DOMAIN` string via the duplicate-suffix
 * rule — while `KnowledgePanel.DomainType` on a DataProduct page
 * resolves to `null`, exactly as officially.
 */
const SPECIFIC_EXACT_KEYS_BY_PAGE_TYPE: Record<string, readonly string[]> = {
  DataProduct: [DOMAIN],
};

/**
 * Shared keys, in `CommonWidgets.registry.ts:54-65` insertion order.
 * `KNOWLEDGE_ARTICLE` is not a registry entry: it is resolved by the
 * `CommonWidgetClassBase` fallback after the registry misses, and is
 * matched separately below.
 */
const COMMON_WIDGET_KEYS: readonly string[] = [
  DESCRIPTION,
  DATA_PRODUCTS,
  TAGS,
  GLOSSARY_TERMS,
  CUSTOM_PROPERTIES,
  OWNERS,
  EXPERTS,
  DOMAIN,
  TIER,
  CERTIFICATION,
  LEFT_PANEL,
  REVIEWER,
];

/**
 * Page types whose resolver falls through to `CommonWidgets`. Every
 * wired page type qualifies except DataMarketplace, whose resolver
 * returns `null` for anything else. A page type absent from both
 * specific tables has no resolver at all (Drive leaves, unknown
 * types) and never reaches this set.
 */
const COMMON_FALLBACK_PAGE_TYPES: ReadonlySet<string> = new Set([
  ...Object.keys(SPECIFIC_PREFIX_KEYS_BY_PAGE_TYPE),
  ...Object.keys(SPECIFIC_EXACT_KEYS_BY_PAGE_TYPE),
].filter((pageType) => pageType !== 'DataMarketplace'));

function matchCommonWidgetKey(widgetKey: string): string | null {
  const exact = COMMON_WIDGET_KEYS.find((key) => key === widgetKey);
  if (exact) {
    return exact;
  }
  const suffixed = COMMON_WIDGET_KEYS.find((key) => widgetKey.startsWith(`${key}-`));
  if (suffixed) {
    return suffixed;
  }
  const lowered = widgetKey.toLowerCase();
  const articleKey = KNOWLEDGE_ARTICLE.toLowerCase();
  if (lowered === articleKey || lowered.startsWith(`${articleKey}-`)) {
    return KNOWLEDGE_ARTICLE;
  }
  return null;
}

/**
 * The content key a widget id resolves to on a page type, or `null`
 * when official code renders nothing for it. Per-type specific keys
 * are checked before common keys; an unknown page type, a Drive-leaf
 * page type, and an unmatched id all yield `null` — never a default.
 */
export function resolveWidgetContentKey(pageType: string, widgetKey: string): string | null {
  const specific = SPECIFIC_PREFIX_KEYS_BY_PAGE_TYPE[pageType]?.find((key) =>
    widgetKey.startsWith(key),
  );
  if (specific) {
    return specific;
  }
  const exactSpecific = SPECIFIC_EXACT_KEYS_BY_PAGE_TYPE[pageType]?.find(
    (key) => key === widgetKey,
  );
  if (exactSpecific) {
    return exactSpecific;
  }
  if (COMMON_FALLBACK_PAGE_TYPES.has(pageType)) {
    return matchCommonWidgetKey(widgetKey);
  }
  return null;
}
