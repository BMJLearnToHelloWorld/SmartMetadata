/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestSummary.constants.ts (OSS reference).
 */
export interface ResultMetric {
  labelKey: string;
  namesColumn?: boolean;
  impliedExpected?: number;
}

export const RESULT_METRIC_BY_DEFINITION: Record<string, ResultMetric> = {
  tableRowCountToEqual: { labelKey: 'label.result-metric-row-count' },
  tableRowCountToBeBetween: { labelKey: 'label.result-metric-row-count' },
  tableRowInsertedCountToBeBetween: { labelKey: 'label.result-metric-inserted-row-count' },
  tableColumnCountToEqual: { labelKey: 'label.result-metric-column-count' },
  tableColumnCountToBeBetween: { labelKey: 'label.result-metric-column-count' },
  tableCustomSQLQuery: { labelKey: 'label.result-metric-query-result' },
  columnValuesToBeUnique: { labelKey: 'label.result-metric-duplicate-count', impliedExpected: 0 },
  columnValuesToBeNotNull: { labelKey: 'label.result-metric-null-count', impliedExpected: 0 },
  columnValuesToBeBetween: { labelKey: 'label.result-metric-column-values', namesColumn: true },
  columnValueMaxToBeBetween: { labelKey: 'label.result-metric-column-max', namesColumn: true },
  columnValueMinToBeBetween: { labelKey: 'label.result-metric-column-min', namesColumn: true },
  columnValueMeanToBeBetween: { labelKey: 'label.result-metric-column-mean', namesColumn: true },
  columnValueMedianToBeBetween: { labelKey: 'label.result-metric-column-median', namesColumn: true },
  columnValueStdDevToBeBetween: { labelKey: 'label.result-metric-column-std-dev', namesColumn: true },
  columnValuesSumToBeBetween: { labelKey: 'label.result-metric-column-sum', namesColumn: true },
  columnValueLengthsToBeBetween: { labelKey: 'label.result-metric-column-value-length', namesColumn: true },
  columnValuesMissingCount: { labelKey: 'label.result-metric-column-missing-count', namesColumn: true },
};

export const NO_VALUE = '—';