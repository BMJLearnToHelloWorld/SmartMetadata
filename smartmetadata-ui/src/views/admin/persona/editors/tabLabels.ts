// tabLabels.ts — tab and widget label resolution for the C-4 editors.
//
// Official tab display names are label KEYS (TAB_LABEL_MAP values,
// e.g. 'label.overview'). This module maps every distinct
// TAB_LABEL_MAP value (52: the map's 53 entries share
// 'label.data-observability' twice) to asset.tabs.* and falls back
// to the raw tab id only for keys outside TAB_LABEL_MAP — the pin
// getTabLabelFromId fallback (CustomizePagePureUtils.ts).
//
// Widget labels fall back to the FQN suffix ('KnowledgePanel.Tags-1'
// → 'Tags'), except the generic description key.

import { getTabDisplayName } from './customizePageData';
import type { CustomizeTab, WidgetConfig } from './customizeTypes';
import { tabId } from './customizeTypes';

export const OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY: Record<string, string> = {
  'label.overview': 'asset.tabs.overview',
  'label.schema': 'asset.tabs.schema',
  'label.feature-plural': 'asset.tabs.features',
  'label.task-plural': 'asset.tabs.tasks',
  'label.execution-plural': 'asset.tabs.executions',
  'label.code': 'asset.tabs.code',
  'label.lineage': 'asset.tabs.lineage',
  'label.custom-property-plural': 'asset.tabs.customProperties',
  'label.activity-feed-and-task-plural': 'asset.tabs.activityFeed',
  'label.sample-data': 'asset.tabs.sampleData',
  'label.query-plural': 'asset.tabs.tableQueries',
  'label.dbt-lowercase': 'asset.tabs.dbt',
  'label.view-definition': 'asset.tabs.viewDefinition',
  'label.contract': 'asset.tabs.contract',
  'label.config': 'asset.tabs.config',
  'label.detail-plural': 'asset.tabs.details',
  'label.schema-plural': 'asset.tabs.schemas',
  'label.table-plural': 'asset.tabs.table',
  'label.stored-procedure-plural': 'asset.tabs.storedProcedure',
  'label.children': 'asset.tabs.children',
  'label.model': 'asset.tabs.model',
  'label.field-plural': 'asset.tabs.fields',
  'label.search-index-setting-plural': 'asset.tabs.searchIndexSettings',
  'label.asset-plural': 'asset.tabs.assets',
  'label.endpoint-plural': 'asset.tabs.apiEndpoints',
  'label.glossary-term-plural': 'asset.tabs.glossaryTerms',
  'label.term-plural': 'asset.tabs.terms',
  'label.review': 'asset.tabs.review',
  'label.data-observability': 'asset.tabs.dataObservability',
  'label.incident-plural': 'asset.tabs.incidents',
  'label.knowledge-graph': 'asset.tabs.knowledgeGraph',
  'label.sub-domain-plural': 'asset.tabs.subDomains',
  'label.data-product-plural': 'asset.tabs.dataProducts',
  'label.documentation': 'asset.tabs.documentation',
  'label.test-case-plural': 'asset.tabs.testCases',
  'label.pipeline': 'asset.tabs.pipeline',
  'label.data-model': 'asset.tabs.dataModel',
  'label.agent-plural': 'asset.tabs.agents',
  'label.connection': 'asset.tabs.connection',
  // Pin TAB_LABEL_MAP maps the SQL tab to 'label.sql', which has no
  // entry in either pin locale; the value here is pin's own
  // 'label.sql-uppercase' ('SQL' in both locales).
  'label.sql': 'asset.tabs.sql',
  'label.api-collection': 'asset.tabs.apiCollection',
  'label.schema-definition': 'asset.tabs.schemaDefinition',
  'label.expression': 'asset.tabs.expression',
  'label.dashboard': 'asset.tabs.dashboard',
  'label.insight-plural': 'asset.tabs.insights',
  'label.directory-plural': 'asset.tabs.directories',
  'label.worksheet-plural': 'asset.tabs.worksheets',
  'label.file-plural': 'asset.tabs.files',
  'label.spreadsheet-plural': 'asset.tabs.spreadsheets',
  'label.input-output-port-plural': 'asset.tabs.inputOutputPorts',
  'label.relations-graph': 'asset.tabs.relationsGraph',
  'label.approval': 'asset.tabs.approval',
};

export function resolveTabLabel(
  t: (key: string) => string,
  tab: CustomizeTab,
): string {
  const display = getTabDisplayName(tab);
  if (display.startsWith('label.')) {
    const productKey = OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY[display];
    if (productKey) {
      return t(productKey);
    }
    return tabId(tab) || display;
  }
  // A resolved label (official stores resolved labels in displayName)
  // or a user rename is rendered verbatim.
  return display;
}

/**
 * Label resolver for getDefaultTabs: reproduces official's
 * `i18n.t(TAB_LABEL_MAP[...])` with product keys, falling back to the
 * raw tab id only for keys outside TAB_LABEL_MAP.
 */
export function defaultTabLabelResolver(
  t: (key: string) => string,
): (tabId: string, labelKey: string) => string {
  return (id, labelKey) => {
    const productKey = OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY[labelKey];
    return productKey ? t(productKey) : id;
  };
}

/** Display label for a widget instance key: FQN suffix, unique suffix stripped. */
export function widgetLabelFromKey(widgetKey: string): string {
  const suffix = widgetKey.split('.').pop() ?? widgetKey;
  return suffix.split('-')[0];
}

export function widgetTitle(widget: WidgetConfig): string {
  return widgetLabelFromKey(widget.i);
}
