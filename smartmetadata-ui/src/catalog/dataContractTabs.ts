/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official EDataContractTab, getDataContractTabByEntity, SLA units,
 * and semantic field keys (DataContract.constants.ts + DataContractUtils.ts).
 */
export enum EDataContractTab {
  CONTRACT_DETAIL = 0,
  TERMS_OF_SERVICE = 1,
  SCHEMA = 2,
  SEMANTICS = 3,
  SECURITY = 4,
  QUALITY = 5,
  SLA = 6,
}

export const DATA_CONTRACT_TAB_LABEL_KEYS: Record<EDataContractTab, string> = {
  [EDataContractTab.CONTRACT_DETAIL]: 'label.contract-detail-plural',
  [EDataContractTab.TERMS_OF_SERVICE]: 'label.terms-of-service',
  [EDataContractTab.SCHEMA]: 'label.schema',
  [EDataContractTab.SEMANTICS]: 'label.semantic-plural',
  [EDataContractTab.SECURITY]: 'label.security',
  [EDataContractTab.QUALITY]: 'label.quality',
  [EDataContractTab.SLA]: 'label.sla',
};

export function getContractTabLabelKey(tabKey: EDataContractTab): string {
  return DATA_CONTRACT_TAB_LABEL_KEYS[tabKey] ?? 'label.contract-detail-plural';
}

/** Official EntityStatus form options (Draft, "In Review", Approved). */
export const DATA_CONTRACT_STATUS_OPTIONS = [
  { labelKey: 'label.draft', value: 'Draft' },
  { labelKey: 'label.in-review', value: 'In Review' },
  { labelKey: 'label.approved', value: 'Approved' },
] as const;

export const MAX_LATENCY_UNITS = ['minute', 'hour', 'day'] as const;
export const REFRESH_FREQUENCY_UNITS = ['hour', 'day', 'week', 'month', 'year'] as const;
export const RETENTION_UNITS = ['day', 'week', 'month', 'year'] as const;

export const SUPPORTED_ROW_FILTER_ENTITIES = ['table', 'dashboardDataModel'] as const;

export const SEMANTIC_TAG_OPERATORS = ['array_contains', 'array_not_contains'] as const;

export const CONTRACT_TEST_TYPE_LABEL_MAP: Record<string, string> = {
  all: 'label.all',
  table: 'label.table',
  column: 'label.column',
};

/** Official Timezone enum display strings (generated/entity/data/dataContract.ts). */
export const CONTRACT_TIMEZONES: readonly string[] = [
  "GMT+00:00 (Europe/London)",
  "GMT-01:00 (Atlantic/Azores)",
  "GMT+01:00 (Europe/Paris)",
  "GMT-02:00 (Atlantic/South_Georgia)",
  "GMT+02:00 (Europe/Athens)",
  "GMT-02:30 (Atlantic/Newfoundland)",
  "GMT-03:00 (America/Sao Paulo)",
  "GMT+03:00 (Asia/Iran)",
  "GMT+03:00 (Europe/Moscow)",
  "GMT-04:00 (America/Santiago)",
  "GMT+04:00 (Asia/Dubai)",
  "GMT+04:30 (Asia/Afghanistan)",
  "GMT-05:00 (America/New York)",
  "GMT+05:00 (Asia/Karachi)",
  "GMT+05:30 (Asia/Kolkata)",
  "GMT+05:45 (Asia/Nepal)",
  "GMT-06:00 (America/Chicago)",
  "GMT+06:00 (Asia/Dhaka)",
  "GMT+06:00 (Asia/Myanmar)",
  "GMT-07:00 (America/Denver)",
  "GMT+07:00 (Asia/Bangkok)",
  "GMT-08:00 (America/Los Angeles)",
  "GMT+08:00 (Asia/Shanghai)",
  "GMT+08:45 (Australia/Australian Central Western Standard Time)",
  "GMT-09:00 (America/Anchorage)",
  "GMT+09:00 (Asia/Tokyo)",
  "GMT+09:00 (Australia/Adelaide)",
  "GMT-09:30 (Pacific/Marquesas)",
  "GMT+10:00 (Australia/Sydney)",
  "GMT-10:00 (Pacific/Honolulu)",
  "GMT+10:30 (Australia/Lord Howe)",
  "GMT-11:00 (Pacific/Niue)",
  "GMT+11:00 (Pacific/Norfolk)",
  "GMT+12:00 (Pacific/Auckland)",
  "GMT+13:00 (Pacific/Tongatapu)",
  "GMT+14:00 (Pacific/Kiritimati)"
];

/**
 * Official schema-tab checkbox depth: Fqn.split(fqn).length must equal
 * this value (table 5, topic 3, dashboardDataModel 4, apiEndpoint 5).
 */
export const SCHEMA_CHECKBOX_FQN_DEPTH: Record<string, number> = {
  table: 5,
  topic: 3,
  dashboardDataModel: 4,
  apiEndpoint: 5,
};

export function getDataContractTabByEntity(entityType: string): EDataContractTab[] {
  switch (entityType) {
    case 'table':
      return [
        EDataContractTab.CONTRACT_DETAIL,
        EDataContractTab.TERMS_OF_SERVICE,
        EDataContractTab.SCHEMA,
        EDataContractTab.SEMANTICS,
        EDataContractTab.SECURITY,
        EDataContractTab.QUALITY,
        EDataContractTab.SLA,
      ];
    case 'topic':
    case 'apiEndpoint':
    case 'dashboardDataModel':
      return [
        EDataContractTab.CONTRACT_DETAIL,
        EDataContractTab.TERMS_OF_SERVICE,
        EDataContractTab.SCHEMA,
        EDataContractTab.SEMANTICS,
        EDataContractTab.SECURITY,
        EDataContractTab.SLA,
      ];
    case 'dataProduct':
    default:
      return [
        EDataContractTab.CONTRACT_DETAIL,
        EDataContractTab.TERMS_OF_SERVICE,
        EDataContractTab.SEMANTICS,
        EDataContractTab.SECURITY,
        EDataContractTab.SLA,
      ];
  }
}
